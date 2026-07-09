import { describe, expect, it } from 'vitest';

import { commandForExecFile } from '../../../scripts/native/exec.mjs';

describe('commandForExecFile', () => {
  it('returns command as-is on non-Windows', () => {
    const result = commandForExecFile('codesign', ['--sign', '-', './byf'], 'darwin');
    expect(result).toEqual({ command: 'codesign', args: ['--sign', '-', './byf'] });
  });

  it('returns command as-is on Windows for non-batch files', () => {
    const result = commandForExecFile('byf.exe', ['--version'], 'win32');
    expect(result).toEqual({ command: 'byf.exe', args: ['--version'] });
  });

  it('wraps .cmd files through cmd.exe on Windows', () => {
    const result = commandForExecFile('tool.cmd', ['byf.exe', '--version'], 'win32', {
      ComSpec: 'C:\\Windows\\System32\\cmd.exe',
    });
    expect(result.command).toBe('C:\\Windows\\System32\\cmd.exe');
    expect(result.args).toEqual(['/d', '/s', '/c', '""tool.cmd" "byf.exe" "--version""']);
    expect(result.options?.windowsVerbatimArguments).toBe(true);
  });

  it('wraps .bat files through cmd.exe on Windows', () => {
    const result = commandForExecFile('foo.bat', [], 'win32', { ComSpec: 'cmd.exe' });
    expect(result.command).toBe('cmd.exe');
  });

  it('escapes embedded double quotes in args', () => {
    const result = commandForExecFile('foo.cmd', ['hello "world"'], 'win32', {
      ComSpec: 'cmd.exe',
    });
    expect(result.args[3]).toBe('""foo.cmd" "hello ""world""""');
  });

  it('falls back to cmd.exe when ComSpec missing', () => {
    const result = commandForExecFile('foo.cmd', [], 'win32', {});
    expect(result.command).toBe('cmd.exe');
  });
});
