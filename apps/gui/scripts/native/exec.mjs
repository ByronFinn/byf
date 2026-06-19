import { spawn } from 'node:child_process';

export function run(command, args, options) {
  return new Promise((resolvePromise, reject) => {
    const proc = spawn(command, args, {
      stdio: 'inherit',
      cwd: options?.cwd,
    });
    proc.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`Command failed: ${command} ${args.join(' ')} (exit ${code})`));
      }
    });
    proc.on('error', reject);
  });
}