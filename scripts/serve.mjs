// Serves the repo folder for a local look: node scripts/serve.mjs [port]
import path from 'node:path';
import { serve } from './lib/static.mjs';

const server = await serve(path.resolve(import.meta.dirname, '..'), +(process.argv[2] ?? 4410));
console.log(`http://localhost:${server.address().port}/`);
