// Кладёт код посредника (server/worker.mjs) в приложение, чтобы оно могло
// само разместить его в аккаунте Cloudflare создателя группы.
// Запуск: node scripts/embed-worker.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function build() {
  const source = readFileSync(join(root, 'server/worker.mjs'), 'utf8').replace(/\r\n/g, '\n');
  const version = Number(/const VERSION = (\d+);/.exec(source)?.[1]);
  if (!version) throw new Error('В server/worker.mjs не найдена строка VERSION');
  return [
    '// Этот файл создаётся командой `node scripts/embed-worker.mjs` из server/worker.mjs.',
    '// Не правьте его руками.',
    '',
    `export const WORKER_VERSION = ${version};`,
    '',
    `export const WORKER_SOURCE = ${JSON.stringify(source)};`,
    '',
  ].join('\n');
}

export const target = join(root, 'src/lib/friends/worker-source.ts');

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(target, build());
  console.log('Обновлён src/lib/friends/worker-source.ts');
}
