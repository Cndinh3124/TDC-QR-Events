// start:dev: tsc --watch bien dich ra dist + node --watch chay dist, tu khoi dong lai khi sua code.
// Khong dung tsx: esbuild khong sinh metadata decorator nen NestJS khong tu tiem duoc dependency.
import { spawn, spawnSync } from 'node:child_process';

const tsc = ['tsc', '-p', 'tsconfig.build.json'];
// bien dich mot lan truoc de dist/main.js co san, loi kieu thi dung ngay
if (spawnSync('npx', tsc, { stdio: 'inherit' }).status !== 0) process.exit(1);

const watcher = spawn('npx', [...tsc, '--watch', '--preserveWatchOutput'], { stdio: 'inherit' });
const server = spawn('node', ['--watch', '--env-file=.env', 'dist/main.js'], { stdio: 'inherit' });

const stop = () => {
  watcher.kill();
  server.kill();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('exit', (code) => {
  watcher.kill();
  process.exit(code ?? 0);
});
