/**
 * Unit tests for the image compression pipeline (issue #233) and the
 * content-addressed original-image cache.
 *
 * Large test images are synthesised on the fly with Jimp (solid/gradient
 * fills) — no binary fixtures. The compression module is a new leaf with no
 * existing test home, so it gets its own focused file.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Jimp } from 'jimp';
import { describe, expect, it } from 'vitest';

import { sniffImageDimensions } from '../../src/tools/support/file-type';
import {
  compressImageForModel,
  IMAGE_BYTE_BUDGET,
  maxImageEdgeFromEnv,
  MAX_DECODE_BYTES,
  MAX_DECODE_PIXELS,
  MAX_IMAGE_EDGE_PX,
  positiveIntFromEnv,
  readImageByteBudgetFromEnv,
  READ_IMAGE_BYTE_BUDGET,
} from '../../src/tools/support/image-compress';
import { ImageLimits } from '../../src/tools/support/image-limits';
import { persistOriginalImage } from '../../src/tools/support/image-originals';

// ── Helpers ──────────────────────────────────────────────────────────

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function makePng(width: number, height: number, color = 0xff0000ff): Promise<Buffer> {
  const img = new Jimp({ width, height, color });
  return Buffer.from(await img.getBuffer('image/png'));
}

async function makeJpeg(width: number, height: number, quality = 95): Promise<Buffer> {
  const img = new Jimp({ width, height, color: 0x336699ff });
  return Buffer.from(await img.getBuffer('image/jpeg', { quality }));
}

// ── compressImageForModel ────────────────────────────────────────────

describe('compressImageForModel', () => {
  it('passes a small PNG through unchanged (under budget + within edge)', async () => {
    const data = await makePng(40, 40);
    const result = await compressImageForModel({ data, mimeType: 'image/png' });

    expect(result.outcome.kind).toBe('passthrough');
    // Passthrough returns the original buffer by reference (no copy).
    expect(result.data).toBe(data);
    expect(result.mimeType).toBe('image/png');
  });

  it('passes WebP through unchanged (Jimp cannot re-encode)', async () => {
    const webp = Buffer.concat([Buffer.from('RIFF\u0000\u0000\u0000\u0000'), Buffer.from('WEBP')]);
    const result = await compressImageForModel({ data: webp, mimeType: 'image/webp' });

    expect(result.outcome.kind).toBe('passthrough');
    expect(result.data).toBe(webp);
    expect(result.mimeType).toBe('image/webp');
  });

  it('passes GIF through unchanged (preserve animation)', async () => {
    const gif = Buffer.from('GIF89a');
    const result = await compressImageForModel({ data: gif, mimeType: 'image/gif' });

    expect(result.outcome.kind).toBe('passthrough');
    expect(result.data).toBe(gif);
    expect(result.mimeType).toBe('image/gif');
  });

  // Heavy encode/decode (Jimp is synchronous JS) — needs more than the 5s
  // default per-test timeout on slow CI runners.
  it('compresses a large PNG: downscaled to the edge cap and smaller', async () => {
    const data = await makePng(3000, 3000, 0xff0000ff);
    const result = await compressImageForModel({ data, mimeType: 'image/png' });

    expect(result.outcome.kind).toBe('compressed');
    if (result.outcome.kind !== 'compressed') return;
    const dims = sniffImageDimensions(result.data);
    expect(dims).not.toBeNull();
    if (dims !== null) {
      const longestEdge = Math.max(dims.width, dims.height);
      expect(longestEdge).toBeLessThanOrEqual(MAX_IMAGE_EDGE_PX);
    }
    expect(result.data.length).toBeLessThan(data.length);
    expect(result.outcome.originalBytes).toBe(data.length);
    expect(result.outcome.finalBytes).toBe(result.data.length);
  }, 30_000);

  it('walks the JPEG quality ladder for an over-budget JPEG source', async () => {
    const data = await makeJpeg(2000, 2000, 95);
    // Force the budget below the source so compression must kick in.
    const result = await compressImageForModel({
      data,
      mimeType: 'image/jpeg',
      byteBudget: data.length - 1,
    });

    expect(result.outcome.kind).toBe('compressed');
    if (result.outcome.kind !== 'compressed') return;
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.data.length).toBeLessThan(data.length);
  }, 30_000);

  it('refuses to decode a buffer exceeding MAX_DECODE_BYTES (bomb guard)', async () => {
    const bomb = Buffer.alloc(MAX_DECODE_BYTES + 1, 0);
    PNG_MAGIC.copy(bomb);
    const result = await compressImageForModel({
      data: bomb,
      mimeType: 'image/png',
      byteBudget: 1,
    });

    expect(result.outcome.kind).toBe('error');
    if (result.outcome.kind === 'error') {
      expect(result.outcome.message).toMatch(/decode limit|bytes/i);
    }
    // Caller falls back to the original — no throw, original returned.
    expect(result.data).toBe(bomb);
  });

  it('returns an error outcome (no throw) for undecodable image data', async () => {
    const garbage = Buffer.from('not-an-image-just-plain-text-bytes-here-padding');
    // Tiny budget forces the decode path past the fast-path passthrough.
    const result = await compressImageForModel({
      data: garbage,
      mimeType: 'image/png',
      byteBudget: 1,
    });

    expect(result.outcome.kind).toBe('error');
    expect(result.data).toBe(garbage);
    expect(result.mimeType).toBe('image/png');
  });

  it('exposes the pixel bomb-guard constant', () => {
    // Pinning the value guards against drift: 100M pixels is the cap above
    // which compression refuses to decode. We don't synthesise a 100MP image
    // in the test suite (too heavy); the byte-bomb + decode-error cases above
    // already exercise the error path end-to-end, and this assertion keeps
    // the threshold observable.
    expect(MAX_DECODE_PIXELS).toBe(100_000_000);
  });

  it('refuses a PNG that declares huge dimensions before attempting decode', async () => {
    // A tiny buffer whose PNG IHDR advertises 20000x20000 pixels (400M) — far
    // over the cap but only ~64 bytes on disk. The pre-decode sniff must catch
    // this and return an error WITHOUT calling Jimp.read (which would allocate
    // a 400M-pixel bitmap). This is the sparse-pixel-bomb case.
    const lyingPng = Buffer.alloc(64, 0);
    PNG_MAGIC.copy(lyingPng);
    lyingPng.writeUInt32BE(20_000, 16); // IHDR width
    lyingPng.writeUInt32BE(20_000, 20); // IHDR height
    const result = await compressImageForModel({
      data: lyingPng,
      mimeType: 'image/png',
      byteBudget: 1,
    });

    expect(result.outcome.kind).toBe('error');
    if (result.outcome.kind === 'error') {
      expect(result.outcome.message).toMatch(/pixel/i);
      expect(result.outcome.message).toMatch(/20000x20000|400000000/i);
    }
    // Original returned, not decoded/re-encoded.
    expect(result.data).toBe(lyingPng);
  });

  it('exposes the default byte budget constant', () => {
    // ~3.75 MiB. Pinning the exact value guards against an accidental drift
    // that would make test fixtures unexpectedly compress or passthrough.
    expect(IMAGE_BYTE_BUDGET).toBe(Math.floor(3.75 * 1024 * 1024));
  });
});

// ── persistOriginalImage ─────────────────────────────────────────────

describe('persistOriginalImage', () => {
  it('writes a content-addressed file and reports path + size', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'byf-orig-'));
    try {
      const data = Buffer.from('original-image-bytes-for-hashing');
      const record = await persistOriginalImage({
        data,
        mimeType: 'image/png',
        sessionDir: dir,
      });

      expect(record).not.toBeNull();
      if (record === null) return;
      const expectedHash = createHash('sha256').update(data).digest('hex').slice(0, 32);
      expect(record.path).toBe(join(dir, 'media-originals', `${expectedHash}.png`));
      expect(record.mimeType).toBe('image/png');
      expect(record.byteSize).toBe(data.length);
      expect(existsSync(record.path)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is idempotent: a second call with the same bytes does not rewrite', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'byf-orig-idem-'));
    try {
      const data = Buffer.from('same-bytes-every-time');
      const first = await persistOriginalImage({ data, mimeType: 'image/png', sessionDir: dir });
      expect(first).not.toBeNull();
      if (first === null) return;

      // Give the filesystem a chance to advance mtime resolution.
      await new Promise((resolve) => setTimeout(resolve, 50));
      const second = await persistOriginalImage({
        data,
        mimeType: 'image/png',
        sessionDir: dir,
      });
      expect(second).not.toBeNull();
      if (second === null) return;

      expect(second.path).toBe(first.path);
      // No rewrite happened — mtime is stable.
      const m1 = statSync(first.path).mtimeMs;
      const m2 = statSync(second.path).mtimeMs;
      expect(m2).toBe(m1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns null (no throw) when the target directory cannot be created', async () => {
    // A sessionDir that is itself an existing file — mkdir under it fails,
    // and so does the write. The cache must degrade to null silently.
    const dir = mkdtempSync(join(tmpdir(), 'byf-orig-fail-'));
    try {
      const fileAsDir = join(dir, 'i-am-a-file');
      writeFileSync(fileAsDir, 'x');
      const record = await persistOriginalImage({
        data: Buffer.from('wont-be-written'),
        mimeType: 'image/png',
        sessionDir: fileAsDir,
      });
      expect(record).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('positiveIntFromEnv / maxImageEdgeFromEnv / readImageByteBudgetFromEnv', () => {
  it('parses a positive integer from env', () => {
    expect(positiveIntFromEnv({ BYF_IMAGE_MAX_EDGE_PX: '1500' }, 'BYF_IMAGE_MAX_EDGE_PX')).toBe(
      1500,
    );
  });

  it('returns undefined for absent env', () => {
    expect(positiveIntFromEnv({}, 'BYF_IMAGE_MAX_EDGE_PX')).toBeUndefined();
  });

  it('returns undefined for non-integer', () => {
    expect(
      positiveIntFromEnv({ BYF_IMAGE_MAX_EDGE_PX: 'abc' }, 'BYF_IMAGE_MAX_EDGE_PX'),
    ).toBeUndefined();
    expect(
      positiveIntFromEnv({ BYF_IMAGE_MAX_EDGE_PX: '1.5' }, 'BYF_IMAGE_MAX_EDGE_PX'),
    ).toBeUndefined();
  });

  it('returns undefined for non-positive', () => {
    expect(
      positiveIntFromEnv({ BYF_IMAGE_MAX_EDGE_PX: '0' }, 'BYF_IMAGE_MAX_EDGE_PX'),
    ).toBeUndefined();
    expect(
      positiveIntFromEnv({ BYF_IMAGE_MAX_EDGE_PX: '-5' }, 'BYF_IMAGE_MAX_EDGE_PX'),
    ).toBeUndefined();
  });

  it('maxImageEdgeFromEnv reads BYF_IMAGE_MAX_EDGE_PX', () => {
    expect(maxImageEdgeFromEnv({ BYF_IMAGE_MAX_EDGE_PX: '3000' })).toBe(3000);
    expect(maxImageEdgeFromEnv({})).toBeUndefined();
  });

  it('readImageByteBudgetFromEnv reads BYF_IMAGE_READ_BYTE_BUDGET', () => {
    expect(readImageByteBudgetFromEnv({ BYF_IMAGE_READ_BYTE_BUDGET: '50000000' })).toBe(50_000_000);
    expect(readImageByteBudgetFromEnv({})).toBeUndefined();
  });
});

describe('ImageLimits', () => {
  it('falls back to built-in defaults when no env or config', () => {
    const limits = new ImageLimits({});
    expect(limits.maxEdgePx()).toBe(MAX_IMAGE_EDGE_PX);
    expect(limits.readByteBudget()).toBe(READ_IMAGE_BYTE_BUDGET);
  });

  it('env overrides config and default', () => {
    const limits = new ImageLimits(
      { BYF_IMAGE_MAX_EDGE_PX: '999', BYF_IMAGE_READ_BYTE_BUDGET: '1000' },
      { maxEdgePx: 500, readByteBudget: 2000 },
    );
    expect(limits.maxEdgePx()).toBe(999);
    expect(limits.readByteBudget()).toBe(1000);
  });

  it('config overrides default when env absent', () => {
    const limits = new ImageLimits({}, { maxEdgePx: 1500, readByteBudget: 5_000_000 });
    expect(limits.maxEdgePx()).toBe(1500);
    expect(limits.readByteBudget()).toBe(5_000_000);
  });

  it('setConfig pushes new config on reload', () => {
    const limits = new ImageLimits({});
    expect(limits.maxEdgePx()).toBe(MAX_IMAGE_EDGE_PX);
    limits.setConfig({ maxEdgePx: 800 });
    expect(limits.maxEdgePx()).toBe(800);
  });

  it('two instances do not share config state', () => {
    const a = new ImageLimits({});
    const b = new ImageLimits({});
    a.setConfig({ maxEdgePx: 400 });
    expect(b.maxEdgePx()).toBe(MAX_IMAGE_EDGE_PX);
  });

  it('paste-style construction and session-style construction share env resolution (AC-I4)', () => {
    // CLI paste: `new ImageLimits(process.env, config.image)` per attachment.
    // Session / ReadMedia: one ImageLimits injected into tools from the same env+config.
    const env = { BYF_IMAGE_MAX_EDGE_PX: '800', BYF_IMAGE_READ_BYTE_BUDGET: '1234567' };
    const config = { maxEdgePx: 2000, readByteBudget: 9_000_000 };
    const pasteLimits = new ImageLimits(env, config);
    const sessionLimits = new ImageLimits(env, config);
    expect(pasteLimits.maxEdgePx()).toBe(800);
    expect(sessionLimits.maxEdgePx()).toBe(800);
    expect(pasteLimits.readByteBudget()).toBe(1_234_567);
    expect(sessionLimits.readByteBudget()).toBe(1_234_567);
    // Mid-session setConfig on session instance does not require paste to share
    // object identity — both still honour env above config when env is set.
    sessionLimits.setConfig({ maxEdgePx: 100 });
    expect(sessionLimits.maxEdgePx()).toBe(800);
    expect(pasteLimits.maxEdgePx()).toBe(800);
  });
});
