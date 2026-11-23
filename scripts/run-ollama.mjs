// One local-model run of the experiment: the brief as a single chat message to
// a model served by Ollama, with no agent around it. The model cannot write
// files, so the page is cut out of its answer, as with the chat apps.
//
// With a skill there is nothing to discover or open either, so its SKILL.md is
// handed over whole as the system message and the brief gets the same first
// line the agents get. That only stands in for a skill made of one file.
//
// Usage: RUNS_WORK=<work folder> node scripts/run-ollama.mjs <model> [skill|none] [context tokens]
//        OLLAMA_HOST=http://127.0.0.1:11434 by default; SKILLS_SRC for a run with a skill
import fs from 'node:fs';
import path from 'node:path';

// Ollama's default context is too small for the brief plus a whole page.
const [model, skill = 'none', numCtx = 16384] = process.argv.slice(2);
if (!model) throw new Error('usage: run-ollama.mjs <model> [skill|none] [context tokens]');

const ROOT = path.resolve(import.meta.dirname, '..');
const WORK = process.env.RUNS_WORK ?? path.resolve(ROOT, '..', 'skill-runs');
// Ollama's own OLLAMA_HOST is often a bare bind address such as 0.0.0.0:11434.
const HOST = (process.env.OLLAMA_HOST ?? '127.0.0.1:11434').replace(/^(?!https?:\/\/)/, 'http://').replace('//0.0.0.0', '//127.0.0.1');
const id = `ollama-${model.replace(/[^\w.]+/g, '-')}${skill === 'none' ? '' : `-${skill}`}`;
const dir = path.join(WORK, id);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

const brief = fs.readFileSync(path.join(ROOT, 'brief.md'), 'utf8');
// The first line of a run with a skill is the one prepare_run adds in lib/run-common.sh.
const skillFile = () => {
  if (!process.env.SKILLS_SRC) throw new Error('set SKILLS_SRC to the folder holding the installed skills');
  return fs.readFileSync(path.join(process.env.SKILLS_SRC, skill, 'SKILL.md'), 'utf8');
};
const messages = skill === 'none'
  ? [{ role: 'user', content: brief }]
  : [{ role: 'system', content: skillFile() }, { role: 'user', content: `Użyj skilla \`${skill}\`.\n\n${brief}` }];

const started = Date.now();
const res = await fetch(`${HOST}/api/chat`, {
  method: 'POST',
  signal: AbortSignal.timeout(50 * 60 * 1000),
  body: JSON.stringify({
    model,
    stream: true,
    options: { num_ctx: +numCtx },
    messages,
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
