/**
 * PRD-0038 R4 / AC-4.4 — a dependency-free PTY so the TUI can be launched and
 * observed head-lessly.
 *
 * The TUI refuses to render against a pipe (`process.stdout.isTTY`), so an idle
 * CPU measurement needs a real pseudo-terminal. `script(1)` from util-linux
 * would work but hides the child behind an extra process and does not exist on
 * macOS; `bun:ffi` + `/dev/ptmx` gives the exact pid we want to sample.
 *
 * Verified on Bun 1.3.14 / linux-x64: the child sees `isTTY=true` and the
 * requested rows/cols.
 */

import { readSync } from 'node:fs';

let ptyLib;
async function loadPtyLib() {
  if (ptyLib !== undefined) return ptyLib;
  try {
    const { dlopen, ptr } = await import('bun:ffi');
    const lib = dlopen('libc.so.6', {
      posix_openpt: { args: ['i32'], returns: 'i32' },
      grantpt: { args: ['i32'], returns: 'i32' },
      unlockpt: { args: ['i32'], returns: 'i32' },
      ptsname_r: { args: ['i32', 'ptr', 'i64'], returns: 'i32' },
      open: { args: ['ptr', 'i32'], returns: 'i32' },
      close: { args: ['i32'], returns: 'i32' },
      fcntl: { args: ['i32', 'i32', 'i32'], returns: 'i32' },
      ioctl: { args: ['i32', 'u64', 'ptr'], returns: 'i32' },
      write: { args: ['i32', 'ptr', 'i64'], returns: 'i64' },
    });
    ptyLib = { lib, ptr };
  } catch {
    ptyLib = null;
  }
  return ptyLib;
}

const O_RDWR = 2;
const O_NOCTTY = 0x20000;
const O_NONBLOCK = 0o4000;
const F_GETFL = 3;
const F_SETFL = 4;
const TIOCSWINSZ = 0x5414;

export async function ptyAvailable() {
  return (await loadPtyLib()) !== null;
}

/**
 * Allocate a master/slave pair with a fixed window size.
 *
 * The window size matters: pi-tui lays out against `process.stdout.columns`,
 * and an unset size reports 0x0, which changes the render path and therefore
 * the CPU profile being measured.
 */
export async function openPty({ rows = 40, cols = 140 } = {}) {
  const loaded = await loadPtyLib();
  if (loaded === null) return null;
  const { lib, ptr } = loaded;
  const master = lib.symbols.posix_openpt(O_RDWR | O_NOCTTY);
  if (master < 0) return null;
  lib.symbols.grantpt(master);
  lib.symbols.unlockpt(master);
  const nameBuf = Buffer.alloc(128);
  if (lib.symbols.ptsname_r(master, ptr(nameBuf), 128) !== 0) return null;
  const name = nameBuf.subarray(0, nameBuf.indexOf(0)).toString();
  const slave = lib.symbols.open(ptr(Buffer.from(`${name}\0`, 'utf8')), O_RDWR);
  if (slave < 0) return null;
  const ws = Buffer.alloc(8);
  ws.writeInt16LE(rows, 0);
  ws.writeInt16LE(cols, 2);
  lib.symbols.ioctl(slave, TIOCSWINSZ, ptr(ws));
  // Non-blocking master: without it the first drain() that finds an empty
  // queue parks the whole harness inside readSync.
  const flags = lib.symbols.fcntl(master, F_GETFL, 0);
  lib.symbols.fcntl(master, F_SETFL, flags | O_NONBLOCK);
  return {
    name,
    master,
    slave,
    write(text) {
      const buf = Buffer.from(text, 'utf8');
      return Number(lib.symbols.write(master, ptr(buf), buf.length));
    },
    /** Drain whatever the child has written so far (non-blocking reads). */
    drain() {
      const out = [];
      const buf = Buffer.alloc(65536);
      for (;;) {
        let n = 0;
        try {
          // `position` must be a literal null on a tty: passing an options
          // object makes readSync EINVAL, which silently drops all output.
          n = readSync(master, buf, 0, buf.length, null);
        } catch {
          // EIO once the slave side is fully closed, EAGAIN while the queue is
          // empty — node surfaces both as a throw, so stop reading.
          break;
        }
        if (n <= 0) break;
        out.push(buf.subarray(0, n).toString('utf8'));
      }
      return out.join('');
    },
    close() {
      lib.symbols.close(slave);
      lib.symbols.close(master);
    },
  };
}
