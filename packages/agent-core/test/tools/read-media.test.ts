/**
 * ReadMediaFileTool tests for the current output/capability contract.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Kaos } from '@byfriends/kaos';
import type { ContentPart, ModelCapability } from '@byfriends/kosong';
import { Jimp } from 'jimp';
import { describe, expect, it, vi } from 'vitest';

import { ToolAccesses } from '../../src/loop';
import type { ExecutableToolResult } from '../../src/loop';
import {
  ReadMediaFileInputSchema,
  ReadMediaFileTool,
} from '../../src/tools/builtin/file/read-media';
import { MEDIA_SNIFF_BYTES } from '../../src/tools/support/file-type';
import {
  gateImageFormat,
  MODEL_ACCEPTED_IMAGE_MIMES,
} from '../../src/tools/support/image-format-policy';
import { executeTool } from './fixtures/execute-tool';
import { createFakeKaos, PERMISSIVE_WORKSPACE } from './fixtures/fake-kaos';

const signal = new AbortController().signal;

const DEFAULT_STAT = {
  stMode: 0o100644,
  stIno: 0,
  stDev: 0,
  stNlink: 1,
  stUid: 0,
  stGid: 0,
  stSize: 1024,
  stAtime: 0,
  stMtime: 0,
  stCtime: 0,
};

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MP4_HEADER = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from('ftyp'),
  Buffer.from('mp42'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('mp42isom'),
]);

// Minimal HEIC ftyp box: 4-byte big-endian size + 'ftyp' + brand 'heic'.
// detectFileType recognises this via FTYP_IMAGE_BRANDS → image/heic.
const HEIC_HEADER = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from('ftyp'),
  Buffer.from('heic'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('mif1heic'),
]);

// BMP file starts with ASCII 'BM'; pad so it parses as a small bitmap.
const BMP_HEADER = Buffer.concat([Buffer.from('BM'), Buffer.alloc(30, 0x00)]);

function capabilities(overrides: Partial<ModelCapability> = {}): ModelCapability {
  return {
    image_in: true,
    video_in: true,
    audio_in: false,
    thinking: false,
    tool_use: true,
    thinking_effort: false,
    thinking_xhigh: false,
    thinking_max: false,
    max_context_tokens: 0,
    ...overrides,
  };
}

function makeReadMediaTool(
  input: {
    readonly stat?: Kaos['stat'];
    readonly readBytes?: Kaos['readBytes'];
    readonly modelCapabilities?: ModelCapability;
    readonly sessionDir?: string;
  } = {},
): ReadMediaFileTool {
  const kaos = createFakeKaos({
    stat: input.stat ?? vi.fn<Kaos['stat']>().mockResolvedValue(DEFAULT_STAT),
    readBytes: input.readBytes ?? vi.fn<Kaos['readBytes']>().mockResolvedValue(PNG_HEADER),
  });
  return new ReadMediaFileTool(
    kaos,
    PERMISSIVE_WORKSPACE,
    input.modelCapabilities ?? capabilities(),
    undefined,
    input.sessionDir,
  );
}

function outputParts(result: ExecutableToolResult): ContentPart[] {
  expect(result.isError).toBeFalsy();
  expect(Array.isArray(result.output)).toBe(true);
  return result.output as ContentPart[];
}

describe('ReadMediaFileTool', () => {
  it('has name, parameters, and path-scoped resource accesses', () => {
    const tool = makeReadMediaTool();

    expect(tool.name).toBe('ReadMediaFile');
    expect(ReadMediaFileInputSchema.safeParse({ path: '/workspace/sample.png' }).success).toBe(
      true,
    );
    expect(tool.parameters).toMatchObject({
      type: 'object',
      properties: {
        path: { type: 'string' },
      },
    });
    const execution = tool.resolveExecution({ path: '/workspace/sample.png' });
    expect(execution.isError).toBeFalsy();
    if (execution.isError === true) throw new Error('expected runnable execution');
    expect(execution.accesses).toEqual(ToolAccesses.readFile('/workspace/sample.png'));
  });

  it('describes the path parameter with accurate working-directory semantics', () => {
    const tool = makeReadMediaTool();
    const pathSchema = (tool.parameters as { properties: { path: { description?: string } } })
      .properties.path;

    expect(pathSchema.description).toBeDefined();
    const description = pathSchema.description ?? '';
    // The description must explain that relative paths resolve against the
    // working directory — not the misleading "Absolute path" wording.
    expect(description).toMatch(/working directory/i);
    expect(description).not.toMatch(/^Absolute path/);
    // The useful "directories and text files are not supported" note stays.
    expect(description).toMatch(/text file/i);
  });

  it('throws when constructed without image or video capability', () => {
    expect(
      () =>
        new ReadMediaFileTool(
          createFakeKaos(),
          PERMISSIVE_WORKSPACE,
          capabilities({ image_in: false, video_in: false }),
        ),
    ).toThrow(/image_in or video_in/);
  });

  it('returns a system/text/image/text wrap for PNG files', async () => {
    const data = Buffer.concat([PNG_HEADER, Buffer.from('pngdata')]);
    const tool = makeReadMediaTool({
      stat: vi.fn<Kaos['stat']>().mockResolvedValue({ ...DEFAULT_STAT, stSize: data.length }),
      readBytes: vi.fn<Kaos['readBytes']>().mockResolvedValue(data),
    });

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c1',
      args: { path: '/workspace/sample.png' },
      signal,
    });

    const parts = outputParts(result);
    expect(parts).toHaveLength(4);
    expect(parts[0]).toMatchObject({ type: 'text' });
    expect((parts[0] as { text: string }).text).toMatch(/^<system>.*<\/system>$/s);
    expect(parts[1]).toEqual({ type: 'text', text: '<image path="/workspace/sample.png">' });
    expect(parts[2]).toMatchObject({ type: 'image_url' });
    expect((parts[2] as { imageUrl: { url: string } }).imageUrl.url).toBe(
      `data:image/png;base64,${data.toString('base64')}`,
    );
    expect(parts[3]).toEqual({ type: 'text', text: '</image>' });
  });

  it('emits a <system> summary with mime type and byte size for images', async () => {
    const data = Buffer.concat([PNG_HEADER, Buffer.from('pngdata')]);
    const tool = makeReadMediaTool({
      stat: vi.fn<Kaos['stat']>().mockResolvedValue({ ...DEFAULT_STAT, stSize: data.length }),
      readBytes: vi.fn<Kaos['readBytes']>().mockResolvedValue(data),
    });

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c_sys',
      args: { path: '/workspace/sample.png' },
      signal,
    });

    const parts = outputParts(result);
    const systemText = (parts[0] as { text: string }).text;
    expect(systemText).toContain('image/png');
    expect(systemText).toContain(`${String(data.length)} bytes`);
    // The re-read reminder is included regardless of dimensions.
    expect(systemText).toMatch(/read the result back/i);
  });

  it('includes original pixel dimensions in the <system> summary for images', async () => {
    // 4x2 PNG: IHDR width=4, height=2.
    const ihdr = Buffer.alloc(25);
    Buffer.from('IHDR').copy(ihdr, 4);
    ihdr.writeUInt32BE(4, 8);
    ihdr.writeUInt32BE(2, 12);
    const data = Buffer.concat([PNG_HEADER, ihdr]);
    const tool = makeReadMediaTool({
      stat: vi.fn<Kaos['stat']>().mockResolvedValue({ ...DEFAULT_STAT, stSize: data.length }),
      readBytes: vi.fn<Kaos['readBytes']>().mockResolvedValue(data),
    });

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c_dim',
      args: { path: '/workspace/sized.png' },
      signal,
    });

    const parts = outputParts(result);
    const systemText = (parts[0] as { text: string }).text;
    expect(systemText).toContain('4x2');
    // With the original size known, the coordinate guidance is included.
    expect(systemText).toMatch(/relative coordinates first/i);
    expect(systemText).toContain('original image size');
  });

  it('omits the dimensions line when the header is too short to size the image', async () => {
    // An 8-byte PNG: enough magic bytes to be recognised as an image,
    // but too short for the IHDR chunk, so sniffImageDimensions returns
    // null and the <system> block must drop the "Original dimensions" line.
    const data = Buffer.from(PNG_HEADER);
    const tool = makeReadMediaTool({
      stat: vi.fn<Kaos['stat']>().mockResolvedValue({ ...DEFAULT_STAT, stSize: data.length }),
      readBytes: vi.fn<Kaos['readBytes']>().mockResolvedValue(data),
    });

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c_nodim',
      args: { path: '/workspace/tiny.png' },
      signal,
    });

    const parts = outputParts(result);
    const systemText = (parts[0] as { text: string }).text;
    // mime type and byte size are still reported …
    expect(systemText).toContain('image/png');
    expect(systemText).toContain(`${String(data.length)} bytes`);
    // … but the dimensions line is absent …
    expect(systemText).not.toContain('Original dimensions');
    // … and so is the coordinate guidance, which would otherwise dangle by
    // referencing an original size that is not present in the block.
    expect(systemText).not.toMatch(/coordinates/i);
  });

  it('emits a <system> summary for videos without pixel dimensions', async () => {
    const tool = makeReadMediaTool({
      stat: vi.fn<Kaos['stat']>().mockResolvedValue({
        ...DEFAULT_STAT,
        stSize: MP4_HEADER.length,
      }),
      readBytes: vi.fn<Kaos['readBytes']>().mockResolvedValue(MP4_HEADER),
    });

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c_vsys',
      args: { path: '/workspace/clip.mp4' },
      signal,
    });

    const parts = outputParts(result);
    const systemText = (parts[0] as { text: string }).text;
    expect(systemText).toContain('video/mp4');
    expect(systemText).toContain(`${String(MP4_HEADER.length)} bytes`);
    // The re-read reminder is included for videos too.
    expect(systemText).toMatch(/read the result back/i);
  });

  it('detects an extensionless PNG via magic-byte sniffing', async () => {
    const data = Buffer.concat([PNG_HEADER, Buffer.from('pngdata')]);
    const tool = makeReadMediaTool({
      stat: vi.fn<Kaos['stat']>().mockResolvedValue({ ...DEFAULT_STAT, stSize: data.length }),
      readBytes: vi.fn<Kaos['readBytes']>().mockResolvedValue(data),
    });

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c2',
      args: { path: '/workspace/sample' },
      signal,
    });

    const parts = outputParts(result);
    expect(parts[1]).toEqual({ type: 'text', text: '<image path="/workspace/sample">' });
    expect((parts[2] as { imageUrl: { url: string } }).imageUrl.url).toContain('image/png');
  });

  it('expands leading tilde paths using the kaos home directory', async () => {
    const data = Buffer.concat([PNG_HEADER, Buffer.from('pngdata')]);
    const readBytes = vi.fn<Kaos['readBytes']>().mockResolvedValue(data);
    const tool = makeReadMediaTool({
      stat: vi.fn<Kaos['stat']>().mockResolvedValue({ ...DEFAULT_STAT, stSize: data.length }),
      readBytes,
    });

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c_home',
      args: { path: '~/images/sample.png' },
      signal,
    });

    const parts = outputParts(result);
    expect(readBytes).toHaveBeenCalledWith('/home/test/images/sample.png', MEDIA_SNIFF_BYTES);
    expect(readBytes).toHaveBeenCalledWith('/home/test/images/sample.png');
    expect(parts[1]).toEqual({ type: 'text', text: '<image path="/home/test/images/sample.png">' });
  });

  it('returns a text/video/text wrap for MP4 files', async () => {
    const tool = makeReadMediaTool({
      stat: vi.fn<Kaos['stat']>().mockResolvedValue({
        ...DEFAULT_STAT,
        stSize: MP4_HEADER.length,
      }),
      readBytes: vi.fn<Kaos['readBytes']>().mockResolvedValue(MP4_HEADER),
    });

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c3',
      args: { path: '/workspace/sample.mp4' },
      signal,
    });

    const parts = outputParts(result);
    expect(parts).toHaveLength(4);
    expect(parts[0]).toMatchObject({ type: 'text' });
    expect((parts[0] as { text: string }).text).toMatch(/^<system>.*<\/system>$/s);
    expect(parts[1]).toEqual({ type: 'text', text: '<video path="/workspace/sample.mp4">' });
    expect(parts[2]).toMatchObject({ type: 'video_url' });
    expect((parts[2] as { videoUrl: { url: string } }).videoUrl.url).toBe(
      `data:video/mp4;base64,${MP4_HEADER.toString('base64')}`,
    );
    expect(parts[3]).toEqual({ type: 'text', text: '</video>' });
  });

  it('uses injected videoUploader for video files when available', async () => {
    const videoUploader = vi.fn().mockResolvedValue({
      type: 'video_url',
      videoUrl: { url: 'ms://file-123', id: 'file-123' },
    });
    const tool = new ReadMediaFileTool(
      createFakeKaos({
        stat: vi.fn<Kaos['stat']>().mockResolvedValue({
          ...DEFAULT_STAT,
          stSize: MP4_HEADER.length,
        }),
        readBytes: vi.fn<Kaos['readBytes']>().mockResolvedValue(MP4_HEADER),
      }),
      PERMISSIVE_WORKSPACE,
      capabilities(),
      videoUploader,
    );

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c4',
      args: { path: '/workspace/sample.mp4' },
      signal,
    });

    expect(videoUploader).toHaveBeenCalledWith({
      data: MP4_HEADER,
      mimeType: 'video/mp4',
      filename: 'sample.mp4',
    });
    const parts = outputParts(result);
    expect(parts[2]).toEqual({
      type: 'video_url',
      videoUrl: { url: 'ms://file-123', id: 'file-123' },
    });
  });

  it('rejects text files with a Read hint', async () => {
    const text = Buffer.from('hello');
    const tool = makeReadMediaTool({
      stat: vi.fn<Kaos['stat']>().mockResolvedValue({ ...DEFAULT_STAT, stSize: text.length }),
      readBytes: vi.fn<Kaos['readBytes']>().mockResolvedValue(text),
    });

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c5',
      args: { path: '/workspace/sample.txt' },
      signal,
    });

    expect(result.isError).toBe(true);
    expect(result.output).toBe(
      '"/workspace/sample.txt" is a text file. Use Read to read text files.',
    );
    expect(result.output).not.toContain('ReadFile');
  });

  it('rejects unknown binary files without legacy Python-tool wording', async () => {
    const blob = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    const tool = makeReadMediaTool({
      stat: vi.fn<Kaos['stat']>().mockResolvedValue({ ...DEFAULT_STAT, stSize: blob.length }),
      readBytes: vi.fn<Kaos['readBytes']>().mockResolvedValue(blob),
    });

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c_unknown',
      args: { path: '/workspace/blob.bin' },
      signal,
    });

    expect(result.isError).toBe(true);
    expect(result.output).toBe(
      '"/workspace/blob.bin" is not a supported image or video file. Use Read for text files, or Bash or an MCP tool for other binary formats.',
    );
    expect(result.output).not.toContain('Python tools');
  });

  it('errors when the current model lacks video input capability', async () => {
    const tool = makeReadMediaTool({
      stat: vi.fn<Kaos['stat']>().mockResolvedValue({
        ...DEFAULT_STAT,
        stSize: MP4_HEADER.length,
      }),
      readBytes: vi.fn<Kaos['readBytes']>().mockResolvedValue(MP4_HEADER),
      modelCapabilities: capabilities({ image_in: true, video_in: false }),
    });

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c6',
      args: { path: '/workspace/sample.mp4' },
      signal,
    });

    expect(result.isError).toBe(true);
    expect(result.output).toMatch(/video input/i);
  });

  it('rejects empty files and files exceeding the media size limit', async () => {
    const empty = await executeTool(
      makeReadMediaTool({
        stat: vi.fn<Kaos['stat']>().mockResolvedValue({ ...DEFAULT_STAT, stSize: 0 }),
      }),
      {
        turnId: 't1',
        toolCallId: 'c_empty',
        args: { path: '/workspace/empty.png' },
        signal,
      },
    );
    expect(empty).toMatchObject({ isError: true });
    expect(empty.output).toMatch(/empty/i);

    const huge = await executeTool(
      makeReadMediaTool({
        stat: vi.fn<Kaos['stat']>().mockResolvedValue({
          ...DEFAULT_STAT,
          stSize: 200 * 1024 * 1024,
        }),
      }),
      {
        turnId: 't1',
        toolCallId: 'c_huge',
        args: { path: '/workspace/huge.png' },
        signal,
      },
    );
    expect(huge).toMatchObject({ isError: true });
    expect(huge.output).toMatch(/exceeds|100/i);
  });

  it('exposes a <system> summary with the original pixel size for sized images', async () => {
    // A real 3x4 RGB PNG (validated by sharp/pillow). Reading should surface
    // the original dimensions in the <system> summary so the model can map
    // coordinates. The bytes below are a hand-built minimum-valid 3x4 PNG.
    // py contract asked for a `message` sidecar with "Loaded image file ...
    // original size 3x4px"; TS settled on a leading <system> ContentPart with
    // `Read image file. ... Original dimensions: 3x4 pixels.` — same intent,
    // different wording and channel.
    const png = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000030000000408020000003a' +
        '63dc1c0000001949444154789c63606060f8cf80019aa0a8a020' +
        '00000000ffff03000c1d03014b0000000049454e44ae426082',
      'hex',
    );
    const tool = makeReadMediaTool({
      stat: vi.fn<Kaos['stat']>().mockResolvedValue({ ...DEFAULT_STAT, stSize: png.length }),
      readBytes: vi.fn<Kaos['readBytes']>().mockResolvedValue(png),
    });

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c_size',
      args: { path: '/workspace/valid.png' },
      signal,
    });

    const parts = outputParts(result);
    const systemText = (parts[0] as { text: string }).text;
    expect(systemText).toContain('Read image file');
    expect(systemText).toContain('image/png');
    expect(systemText).toContain('3x4 pixels');
  });

  it('reports a <system> summary for extensionless image files', async () => {
    // Extensionless path → magic-byte sniff identifies PNG. <system> summary
    // still announces the kind, mime type, and byte size; dimensions are
    // omitted because the header is too short to read IHDR.
    const data = Buffer.concat([PNG_HEADER, Buffer.from('pngdata')]);
    const tool = makeReadMediaTool({
      stat: vi.fn<Kaos['stat']>().mockResolvedValue({ ...DEFAULT_STAT, stSize: data.length }),
      readBytes: vi.fn<Kaos['readBytes']>().mockResolvedValue(data),
    });

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c_extless_msg',
      args: { path: '/workspace/sample' },
      signal,
    });

    const parts = outputParts(result);
    const systemText = (parts[0] as { text: string }).text;
    expect(systemText).toContain('Read image file');
    expect(systemText).toContain('image/png');
    expect(systemText).toContain(`${String(data.length)} bytes`);
  });

  it('description by capabilities lockdown — image + video points at Read for text fallback', () => {
    const tool = new ReadMediaFileTool(createFakeKaos(), PERMISSIVE_WORKSPACE, capabilities());
    // Long-form description contract from sibling docs: 100MB ceiling and
    // pointer to the text-file tool for non-media content. TS renames the
    // sibling tool to `Read` (py was `ReadFile`).
    expect(tool.description).toContain('100MB');
    expect(tool.description).toContain('Read tool');
    expect(tool.description).toContain('supports image and video files for the current model');
  });

  it('omits the tool from the toolset when the model has neither image_in nor video_in', () => {
    // Strict skip semantics: construction returns a sentinel the loader can
    // use to drop the tool entirely, instead of registering a tool that
    // always errors. Currently TS throws a regular Error — fail-unimplemented
    // surfaces the gap.
    let caught: unknown = null;
    const construct = (): ReadMediaFileTool =>
      new ReadMediaFileTool(
        createFakeKaos(),
        PERMISSIVE_WORKSPACE,
        capabilities({ image_in: false, video_in: false }),
      );
    try {
      construct();
    } catch (error) {
      caught = error;
    }
    expect((caught as { name?: string } | null)?.name).toBe('SkipThisTool');
  });

  it('allows absolute media paths outside workspace but rejects relative escapes', async () => {
    const readBytes = vi.fn<Kaos['readBytes']>().mockResolvedValue(PNG_HEADER);
    const tool = new ReadMediaFileTool(
      createFakeKaos({
        stat: vi.fn<Kaos['stat']>().mockResolvedValue(DEFAULT_STAT),
        readBytes,
      }),
      { workspaceDir: '/workspace', additionalDirs: [] },
      capabilities(),
    );

    const absolute = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c_abs',
      args: { path: '/tmp/outside.png' },
      signal,
    });
    expect(absolute.isError).toBeFalsy();

    readBytes.mockClear();
    const relative = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c_rel',
      args: { path: '../secret.png' },
      signal,
    });
    expect(relative.isError).toBe(true);
    expect(readBytes).not.toHaveBeenCalled();
  });

  // ── Image format gating (issue #232) ────────────────────────────────

  it('rejects an HEIC image with a conversion hint before reading the full file', async () => {
    // readBytes is called twice: first with MEDIA_SNIFF_BYTES (header sniff),
    // then with no args (full read). The gate runs after the sniff and before
    // the full read, so the second call must never happen for a rejected
    // format — assert that only the sniff call occurred.
    const readBytes = vi.fn<Kaos['readBytes']>().mockResolvedValue(HEIC_HEADER);
    const tool = makeReadMediaTool({
      stat: vi.fn<Kaos['stat']>().mockResolvedValue({
        ...DEFAULT_STAT,
        stSize: HEIC_HEADER.length,
      }),
      readBytes,
    });

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c_heic',
      args: { path: '/workspace/photo.heic' },
      signal,
    });

    expect(result.isError).toBe(true);
    expect(result.output).toMatch(/heic/i);
    expect(result.output).toMatch(/sips|heif-convert|magick|convert/i);
    // The full-file read is skipped: only the sniff call happened.
    expect(readBytes).toHaveBeenCalledTimes(1);
    expect(readBytes).toHaveBeenCalledWith('/workspace/photo.heic', MEDIA_SNIFF_BYTES);
  });

  it('rejects a BMP image with a conversion hint', async () => {
    const readBytes = vi.fn<Kaos['readBytes']>().mockResolvedValue(BMP_HEADER);
    const tool = makeReadMediaTool({
      stat: vi.fn<Kaos['stat']>().mockResolvedValue({
        ...DEFAULT_STAT,
        stSize: BMP_HEADER.length,
      }),
      readBytes,
    });

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c_bmp',
      args: { path: '/workspace/legacy.bmp' },
      signal,
    });

    expect(result.isError).toBe(true);
    expect(result.output).toMatch(/bmp|image\/bmp/i);
    expect(result.output).toMatch(/sips|heif-convert|magick|convert/i);
  });

  it('lets a PNG pass the format gate and returns the normal 4-part wrap', async () => {
    const data = Buffer.concat([PNG_HEADER, Buffer.from('pngdata')]);
    const tool = makeReadMediaTool({
      stat: vi.fn<Kaos['stat']>().mockResolvedValue({ ...DEFAULT_STAT, stSize: data.length }),
      readBytes: vi.fn<Kaos['readBytes']>().mockResolvedValue(data),
    });

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c_png_gate',
      args: { path: '/workspace/ok.png' },
      signal,
    });

    const parts = outputParts(result);
    expect(parts).toHaveLength(4);
    expect(parts[2]).toMatchObject({ type: 'image_url' });
    // The model-accepted MIME appears in the data URL — confirms the gate
    // let image/png through rather than rejecting it.
    expect((parts[2] as { imageUrl: { url: string } }).imageUrl.url).toContain('image/png');
  });

  it('gateImageFormat accepts model-supported MIME types and rejects others with a notice', () => {
    // Accepted set matches the exported constant.
    expect(gateImageFormat('image/png').accepted).toBe(true);
    expect(gateImageFormat('image/jpeg').accepted).toBe(true);
    expect(gateImageFormat('image/gif').accepted).toBe(true);
    expect(gateImageFormat('image/webp').accepted).toBe(true);

    // Sanity: the accepted set is exactly png/jpeg/gif/webp.
    expect(MODEL_ACCEPTED_IMAGE_MIMES).toEqual(
      new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']),
    );

    // Rejected formats each carry a non-empty notice naming the MIME and a
    // conversion command.
    for (const mime of [
      'image/heic',
      'image/avif',
      'image/bmp',
      'image/tiff',
      'image/ico',
      'image/x-icon',
    ]) {
      const gate = gateImageFormat(mime);
      expect(gate.accepted).toBe(false);
      if (!gate.accepted) {
        expect(gate.notice).toContain(mime);
        expect(gate.notice.length).toBeGreaterThan(0);
        expect(gate.notice).toMatch(/sips|heif-convert|magick|convert/i);
      }
    }
  });

  // ── Image compression integration (issue #233) ─────────────────────

  it('compresses a large image and surfaces a compression note in the <system> summary', async () => {
    // A 3000x3000 PNG exceeds the 2000px edge cap, so compression fires.
    const img = new Jimp({ width: 3000, height: 3000, color: 0xff0000ff });
    const bigPng = Buffer.from(await img.getBuffer('image/png'));
    const sessionDir = mkdtempSync(join(tmpdir(), 'byf-rm-compress-'));
    try {
      const tool = makeReadMediaTool({
        stat: vi.fn<Kaos['stat']>().mockResolvedValue({ ...DEFAULT_STAT, stSize: bigPng.length }),
        readBytes: vi.fn<Kaos['readBytes']>().mockResolvedValue(bigPng),
        sessionDir,
      });

      const result = await executeTool(tool, {
        turnId: 't1',
        toolCallId: 'c_compress',
        args: { path: '/workspace/big.png' },
      });

      const parts = outputParts(result);
      const systemText = (parts[0] as { text: string }).text;
      // The summary records that compression happened.
      expect(systemText).toMatch(/compress/i);
      expect(systemText).toContain('image/png');
      expect(systemText).toMatch(/Original:/);
      expect(systemText).toMatch(/ReadMediaFile on that path/i);
      // The data URL now carries the post-compress bytes. For a solid-color
      // PNG Jimp keeps it as PNG (lossless is smallest), so the mime may
      // match — but the byte payload must differ from the original.
      const url = (parts[2] as { imageUrl: { url: string } }).imageUrl.url;
      expect(url).toMatch(/^data:image\//);
      const base64 = url.slice(url.indexOf('base64,') + 'base64,'.length);
      const decoded = Buffer.from(base64, 'base64');
      expect(decoded.length).toBeLessThan(bigPng.length);
    } finally {
      rmSync(sessionDir, { recursive: true, force: true });
    }
  });

  it('leaves a small PNG uncompressed (passthrough): identical data URL, no compression note', async () => {
    // A tiny PNG is under both the edge cap and the byte budget — passthrough.
    const data = Buffer.concat([PNG_HEADER, Buffer.from('pngdata')]);
    const tool = makeReadMediaTool({
      stat: vi.fn<Kaos['stat']>().mockResolvedValue({ ...DEFAULT_STAT, stSize: data.length }),
      readBytes: vi.fn<Kaos['readBytes']>().mockResolvedValue(data),
    });

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'c_passthrough',
      args: { path: '/workspace/small.png' },
    });

    const parts = outputParts(result);
    const systemText = (parts[0] as { text: string }).text;
    expect(systemText).not.toMatch(/compress/i);
    expect((parts[2] as { imageUrl: { url: string } }).imageUrl.url).toBe(
      `data:image/png;base64,${data.toString('base64')}`,
    );
  });
});
