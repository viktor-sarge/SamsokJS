import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [command, ...args] = process.argv.slice(2);
if (!['dev', 'build', 'preview'].includes(command)) {
  throw new Error(`Unknown command: ${command}`);
}

let instance = 'halland';
const viteArgs = [];
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--instance') {
    instance = args[++index];
  } else {
    viteArgs.push(args[index]);
  }
}
if (!instance || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(instance)) {
  throw new Error('--instance requires a lowercase instance ID, for example halland.');
}

const child = spawn(process.execPath, [
  fileURLToPath(new URL('./bin/vite.js', import.meta.resolve('vite/package.json'))),
  ...(command === 'dev' ? [] : [command]),
  ...viteArgs,
], {
  stdio: 'inherit',
  env: { ...process.env, SAMSOK_INSTANCE: instance },
});
child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
