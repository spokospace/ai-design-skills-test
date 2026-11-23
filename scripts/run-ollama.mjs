// One local-model run of the experiment: the brief as a single chat message to
// a model served by Ollama, with no agent around it. The model cannot write
// files, so the page is cut out of its answer, as with the chat apps.
//
// Usage: RUNS_WORK=<work folder> node scripts/run-ollama.mjs <model> [context tokens]
//        OLLAMA_HOST=http://127.0.0.1:11434 by default
import fs from 'node:fs';
import path from 'node:path';

const model = process.argv[2];
// Ollama's default context is too small for the brief plus a whole page.
const numCtx = +(process.argv[3] ?? 16384);
if (!model) throw new Error('usage: run-ollama.mjs <model> [context tokens]');

const ROOT = path.resolve(import.meta.dirname, '..');
const WORK = process.env.RUNS_WORK ?? path.resolve(ROOT, '..', 'skill-runs');
const HOST = process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434';
const id = `ollama-${model.replace(/[^\w.]+/g, '-')}`;
const dir = path.join(WORK, id);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

const started = Date.now();
const res = await fetch(`${HOST}/api/chat`, {
  method: 'POST',
  signal: AbortSignal.timeout(50 * 60 * 1000),
  body: JSON.stringify({
    model,
    stream: true,
    options: { num_ctx: numCtx },
    messages: [{ role: 'user', content: fs.readFileSync(path.join(ROOT, 'brief.md'), 'utf8') }],
  }),
});
if (!res.ok) throw new Error(`Ollama answered ${res.status}: ${await res.text()}`);

// The answer arrives as one JSON object per line; the last one carries the counts.
let answer = '';
let thinking = '';
let last = {};
let buffer = '';
for await (const chunk of res.body.pipeThrough(new TextDecoderStream())) {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop();
  for (const line of lines.filter(Boolean)) {
    last = JSON.parse(line);
    answer += last.message?.content ?? '';
    thinking += last.message?.thinking ?? '';
  }
}

const { message, ...stats } = last;
fs.writeFileSync(path.join(WORK, `${id}.jsonl`), `${JSON.stringify({ ...stats, thinking_chars: thinking.length, answer })}\n`);

// The page is the fenced html block if there is one, otherwise the document itself.
const html = answer.match(/```html\s*\n([\s\S]*?)(?:\n```|$)/)?.[1] ?? answer.match(/<!doctype html[\s\S]*<\/html>/i)?.[0];
if (html) fs.writeFileSync(path.join(dir, 'index.html'), `${html.trim()}\n`);
console.log(`${id} done in ${Math.round((Date.now() - started) / 1000)}s${html ? '' : ' (no page in the answer)'}`);
