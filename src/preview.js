import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const destination = resolve('artifacts/finance-investigation-preview.html');
await mkdir(dirname(destination), { recursive: true });
await copyFile(resolve('public/index.html'), destination);
console.log(destination);
