// Builds index.html: every measured page with its numbers, grouped by whose model
// built it: the Claude Code grid (setups × models), then OpenAI, Google and the rest.
// Usage: node scripts/gallery.mjs            (reads results.json)
//        TRIAL=2 node scripts/gallery.mjs    (reads results-2.json, writes trial-2.html:
//                                             the repeat of the 15 Claude Code runs)
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const TRIAL = process.env.TRIAL ? `-${process.env.TRIAL}` : '';
const results = JSON.parse(fs.readFileSync(path.join(ROOT, `results${TRIAL}.json`), 'utf8'));
const byId = Object.fromEntries(results.map((r) => [r.id, r]));

const MODELS = [
  ['sonnet-5-5', 'Sonnet 5.5'],
  ['opus-5-5', 'Opus 5.5'],
  ['fable-5-2', 'Fable 5.2'],
];
const SETUPS = [
  ['none', 'No skill', 'The brief alone.'],
  ['emil-design-eng', 'emil-design-eng', 'Emil Kowalski’s rules for interface polish and motion.'],
  ['frontend-design', 'frontend-design', 'Anthropic’s own skill: a design direction chosen for the brief.'],
  ['impeccable', 'Impeccable', 'A design vocabulary, a critique and a slop detector.'],
  ['design-taste-frontend', 'Taste Skill', 'Art direction, real photographs and a browser check.'],
];
// Three more runs are in runs/ but not part of the comparison: Ponytail is a
// skill about writing less code, not about design.
const EXTRA = [['ponytail', 'Ponytail', 'Not a design skill: write as little code as the task needs. Kept for reference.']];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const kb = (b) => `${Math.round(b / 1024)} KB`;
const tok = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}k`);

function cell(id, modelName, setupName) {
  const r = byId[id];
  if (!r || r.missing) return `<div class="card missing">No page</div>`;
  const l = r.log;
  const slop = (r.detector ?? []).filter((d) => d.category === 'slop').length;
  const axe = new Set([...r.axe.desktop.violations, ...r.axe.mobile.violations].map((v) => v.id)).size;
  const cut = l.ok === false && !!l.tokens;
  return `<article class="card">
  <a class="shot" href="runs${TRIAL}/${id}/index.html" aria-label="Open the ${esc(setupName)} page by ${esc(modelName)}">
    <img src="${r.shots['desktop-first']}" alt="" loading="lazy" width="1440" height="900">
  </a>
  <h4>${esc(modelName)} <span>· ${esc(setupName)}</span></h4>
  <dl>
    ${l.tokens ? `<div><dt>Time</dt><dd>${l.durationMin} min${cut ? ' <abbr title="Stopped at the 50-minute limit">(cut)</abbr>' : ''}</dd></div>
    <div><dt>Tokens</dt><dd>${tok(l.tokens.total)}${l.tokens.partial ? '+' : ''}</dd></div>
    <div><dt>Output</dt><dd>${l.tokens.partial ? '–' : tok(l.tokens.output)}</dd></div>` : ''}
    <div><dt>Page</dt><dd>${kb(r.bytes.total)}</dd></div>
    <div><dt>JS</dt><dd>${kb(r.bytes.js)}</dd></div>
    <div><dt>Detector</dt><dd>${(r.detector ?? []).length} <small>(${slop} slop)</small></dd></div>
    <div><dt>axe rules</dt><dd>${axe}</dd></div>
  </dl>
  <p class="links"><a href="runs${TRIAL}/${id}/index.html">Page</a> · <a href="${r.shots['desktop-full']}">Full desktop</a> · <a href="${r.shots['mobile-full']}">Full phone</a> · <a href="runs${TRIAL}/${id}/meta.json">meta.json</a></p>
</article>`;
}

const section = (key, title, note, cells) => `<section class="row" aria-labelledby="h-${key}">
  <header><h3 id="h-${key}">${esc(title)}</h3><p>${esc(note)}</p></header>
  <div class="grid">${cells.join('\n')}</div>
</section>`;

// Rows are grouped by whose model built the pages; the group id is the jump target.
const group = (key, title, note, sections) => `<section class="group" id="${key}" aria-labelledby="g-${key}">
  <header><h2 id="g-${key}">${esc(title)}</h2><p>${esc(note)}</p></header>
${sections.join('\n')}
</section>`;

const cells = (list) => list.map(([id, name, setup]) => cell(id, name, setup));

// Another vendor's coding agent: the same five setups, with the skills copied
// into .agents/skills of the run folder.
const agentRow = (key, title, note) =>
  section(key, title, note, SETUPS.map(([s, name]) => cell(`${key}-${s}`, title, name)));

const claudeRows = [...SETUPS, ...(TRIAL ? [] : EXTRA)].map(([key, name, note]) =>
  section(key, name, note, MODELS.map(([m, mName]) => cell(`${m}-${key}`, mName, name))));

const GROUPS = [
  ['claude', 'Claude Code', "Anthropic's coding agent with Sonnet 5.5, Opus 5.5 and Fable 5.2: one row per setup, one page per model.", claudeRows],
  ...(TRIAL ? [] : [
    ['openai', 'OpenAI', 'Codex as the coding agent and ChatGPT as the chat.', [
      agentRow('codex', 'Codex', "The same brief and the same four skills in OpenAI's Codex CLI on a free ChatGPT plan (GPT-6 Luna, the plan's default model, reasoning effort left at its default). Every run finished in under five minutes."),
      section('chatgpt', 'ChatGPT', 'The same brief pasted into a chat in the browser. The answer took one to two minutes.',
        cells([['chatgpt-free', 'ChatGPT', 'Free plan']])),
    ]],
    ['google', 'Google', 'Antigravity as the coding agent and Gemini as the chat.', [
      agentRow('agy', 'Antigravity CLI', "The same brief and the same four skills in Google's Antigravity CLI on a free personal account (Gemini 3.8 Flash at its High level, the account's default). It is where Google moved personal accounts when Gemini CLI stopped serving them. Shell commands ran in a read-only sandbox, so a skill's own scripts could not write files. The Taste Skill run used up the account's weekly quota after ten minutes and left no page."),
      section('gemini', 'Gemini', 'The same brief pasted into a chat in the browser, once at each thinking level. The answer took one to two minutes at Low and about three at High.',
        cells([['gemini-plus', 'Gemini', 'Plus plan, thinking Low'], ['gemini-plus-high', 'Gemini', 'Plus plan, thinking High']])),
    ]],
    ['other', 'Other models', "Chat apps from other vendors, Kimi's desktop agent and two models running on the laptop.", [
      section('chats', 'Chat and desktop apps', "The same brief pasted into a chat: Grok and DeepSeek in a browser, Copilot in its Windows app. The answers took one to two minutes. DeepSeek stopped just before the end of the code and needed one click on Continue. Kimi Work, the agent in Kimi's desktop app, wrote its file in about seven minutes and was then cut off by a server-busy message before it could check the page.",
        cells([['grok-free', 'Grok', 'free plan'], ['deepseek-free', 'DeepSeek', 'free'], ['copilot-free', 'Copilot', 'Windows app, free'], ['kimi-work-free', 'Kimi Work', 'desktop app, free']])),
      section('local', 'Local models', "Two models running on the laptop itself through Ollama, qwen3:14b and the Polish Bielik 11B v3.0: one message, no agent. For the pages with frontend-design the whole SKILL.md went in as the system message, because a bare model cannot open a skill on its own. The answers took four to nine minutes.",
        cells([
          ['ollama-qwen3-14b', 'qwen3:14b', 'No skill'],
          ['ollama-qwen3-14b-frontend-design', 'qwen3:14b', 'frontend-design'],
          ['ollama-SpeakLeash-bielik-11b-v3.0-instruct-Q4_K_M', 'Bielik 11B v3.0', 'No skill'],
          ['ollama-SpeakLeash-bielik-11b-v3.0-instruct-Q4_K_M-frontend-design', 'Bielik 11B v3.0', 'frontend-design'],
        ])),
    ]],
  ]),
];
const groups = GROUPS.map(([key, title, note, sections]) => group(key, title, note, sections)).join('\n');
const jump = GROUPS.length > 1
  ? `<nav class="jump" aria-label="Sections"><ul>${GROUPS.map(([key, title]) => `<li><a href="#${key}">${esc(title)}</a></li>`).join('')}</ul></nav>`
  : '';

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>One brief, with and without design skills</title>
<meta name="description" content="The same brief for a made-up housing cooperative's home page, built by Claude Sonnet 5.5, Opus 5.5 and Fable 5.2, without a skill and with four agent skills.">
<style>
  :root { color-scheme: light dark; --bg: #f6f7f9; --card: #fff; --ink: #14161a; --muted: #555c66; --line: #d9dde3; --accent: #0b6aa2; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0f1216; --card: #181c22; --ink: #e9ecf0; --muted: #a3abb6; --line: #2b313a; --accent: #6cc0f0; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 1280px; margin: 0 auto; padding: 32px 16px 64px; }
  h1 { font-size: clamp(1.6rem, 3vw, 2.2rem); line-height: 1.2; margin: 0 0 12px; }
  .lead { max-width: 70ch; color: var(--muted); margin: 0 0 8px; }
  a { color: var(--accent); }
  .jump ul { display: flex; flex-wrap: wrap; gap: 8px; list-style: none; margin: 20px 0 0; padding: 0; }
  .jump a { display: block; padding: 6px 14px; border: 1px solid var(--line); border-radius: 999px; background: var(--card); text-decoration: none; font-weight: 600; }
  .jump a:hover { border-color: var(--accent); }
  .group { margin-top: 56px; padding-top: 24px; border-top: 2px solid var(--line); scroll-margin-top: 12px; }
  .group > header h2 { font-size: 1.6rem; line-height: 1.2; margin: 0 0 4px; }
  .group > header p { margin: 0; color: var(--muted); max-width: 70ch; }
  .row { margin-top: 32px; }
  .row header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; margin-bottom: 12px; }
  .row h3 { font-size: 1.25rem; margin: 0; }
  .row header p { margin: 0; color: var(--muted); }
  .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
  .card.missing { display: grid; place-items: center; color: var(--muted); min-height: 200px; }
  .shot { display: block; border-radius: 4px; overflow: hidden; border: 1px solid var(--line); }
  .shot img { display: block; width: 100%; height: auto; aspect-ratio: 16 / 10; object-fit: cover; object-position: top; }
  .shot:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
  .card h4 { font-size: 1rem; margin: 12px 0 8px; }
  .card h4 span { font-weight: 400; color: var(--muted); }
  dl { display: grid; grid-template-columns: repeat(4, auto); gap: 6px 12px; margin: 0; font-size: .875rem; }
  dl div { min-width: 0; }
  dt { color: var(--muted); font-size: .75rem; }
  dd { margin: 0; font-variant-numeric: tabular-nums; }
  small { color: var(--muted); }
  .links { font-size: .8125rem; margin: 10px 0 0; }
  footer { margin-top: 48px; color: var(--muted); font-size: .875rem; max-width: 70ch; }
  @media (max-width: 420px) { dl { grid-template-columns: repeat(3, auto); } }
</style>
</head>
<body>
<main>
  <h1>One brief, with and without design skills</h1>
  <p class="lead">The same brief for the home page of a made-up housing cooperative, built in Claude Code by Sonnet 5.5, Opus 5.5 and Fable 5.2: once without a skill, then once with each of four design skills. ${TRIAL ? '' : "The same brief then went to OpenAI's and Google's agents, to chat apps and to two models running locally. "}One run per combination, so this shows tendencies, not a ranking.</p>
  <p class="lead">${TRIAL
    ? 'This page is the <strong>second trial</strong>: the same fifteen runs repeated from scratch in a separate folder, to see how much comes back the same. <a href="./">The first trial</a>'
    : 'The fifteen runs were <a href="trial-2.html">repeated once from scratch</a> to see how much comes back the same.'}</p>
  <p class="lead"><a href="brief.md">The brief</a> (in Polish) · <a href="README.md">Method and versions</a> · <a href="https://spoko.space/blog/design-skills-for-ai-agents-tested/">The write-up on spoko.space</a></p>
  <p class="lead"><strong>Tokens</strong> include cache reads, which are most of them. <strong>Detector</strong> counts the findings of Impeccable's own rule-based checker (<code>npx impeccable detect</code>), so it judges every page by one skill's rules. <strong>axe rules</strong> counts distinct WCAG 2.2 A/AA rules axe-core flags at 1440 and 390 px.</p>
${jump}
${groups}
  <footer>
    <p>The cooperative, its address, phone numbers and documents are made up. Every page says so in its footer. Photographs placed by Taste Skill come from open archives and are credited on the page that uses them.</p>
  </footer>
</main>
</body>
</html>
`;
const out = TRIAL ? `trial${TRIAL}.html` : 'index.html';
fs.writeFileSync(path.join(ROOT, out), html);
console.log(`${out} written`);
