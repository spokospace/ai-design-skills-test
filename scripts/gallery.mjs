// Builds index.html: every measured page with its numbers, grouped by whose model
// built it: the Claude Code grid (setups × models), then OpenAI, Google and the rest.
// Usage: node scripts/gallery.mjs            (reads results.json)
//        TRIAL=<n> node scripts/gallery.mjs  (reads results-<n>.json, writes trial-<n>.html:
//                                             a repeat of some of the runs)
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
// Ponytail's three runs are in runs/ but not part of the comparison: it is a
// skill about writing less code, not about design.
const EXTRA = [['ponytail', 'Ponytail', 'Not a design skill: write as little code as the task needs. Kept for reference.']];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const kb = (b) => `${Math.round(b / 1024)} KB`;
const tok = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}k`);

function cell(id, modelName, setupName) {
  const r = byId[id];
  if (r.missing) return `<div class="card missing"><h4>${esc(modelName)} <span>· ${esc(setupName)}</span></h4><p>No page</p></div>`;
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

// A row lists the runs it could show as [id, model name, setup name]. Only runs
// that were measured are drawn, so a repeat of part of the test (trial-2.html,
// trial-3.html) gets the same page with fewer rows. A run that was measured
// and left no page stays, as a "No page" card.
const section = ([key, title, note, runs]) => {
  const shown = runs.filter(([id]) => byId[id]);
  if (!shown.length) return null;
  return `<section class="row" aria-labelledby="h-${key}">
  <header><h3 id="h-${key}">${esc(title)}</h3><p>${esc(note)}</p></header>
  <div class="grid">${shown.map(([id, name, setup]) => cell(id, name, setup)).join('\n')}</div>
</section>`;
};

// Rows are grouped by whose model built the pages; the group id is the jump target.
const group = ([key, title, note, rows]) => {
  const sections = rows.map(section).filter(Boolean);
  if (!sections.length) return null;
  return { key, title, html: `<section class="group" id="${key}" aria-labelledby="g-${key}">
  <header><h2 id="g-${key}">${esc(title)}</h2><p>${esc(note)}</p></header>
${sections.join('\n')}
</section>` };
};

// Another vendor's coding agent: the same five setups, with the skills copied
// into .agents/skills of the run folder.
const agentRow = (key, title, note) => [key, title, note, SETUPS.map(([s, name]) => [`${key}-${s}`, title, name])];

const claudeRows = [...SETUPS, ...EXTRA].map(([key, name, note]) =>
  [key, name, note, MODELS.map(([m, mName]) => [`${m}-${key}`, mName, name])]);

// Models served by Ollama on the laptop; the run id is ollama-<id>[-<skill>].
const LOCAL_MODELS = [
  ['qwen3-14b', 'qwen3:14b'],
  ['SpeakLeash-bielik-11b-v3.0-instruct-Q4_K_M', 'Bielik 11B v3.0'],
  ['qwen2.5-coder-14b', 'qwen2.5-coder:14b'],
];
const LOCAL_SETUPS = [['', 'No skill'], ['-frontend-design', 'frontend-design'], ['-design-taste-frontend', 'Taste Skill']];

const GROUPS = [
  ['claude', 'Claude Code', "Anthropic's coding agent with Sonnet 5.5, Opus 5.5 and Fable 5.2: one row per setup, one page per model.", claudeRows],
  ['openai', 'OpenAI', 'Codex as the coding agent and ChatGPT as the chat.', [
    agentRow('codex', 'Codex', "The same brief and the same four skills in OpenAI's Codex CLI on a free ChatGPT plan (GPT-6 Luna, the plan's default model, reasoning effort left at its default). Every run finished in under five minutes."),
    ['chatgpt', 'ChatGPT', 'The same brief pasted into a chat in the browser. The answer took one to two minutes.',
      [['chatgpt-free', 'ChatGPT', 'Free plan']]],
  ]],
  ['google', 'Google', 'Antigravity as the coding agent and Gemini as the chat.', [
    agentRow('agy', 'Antigravity CLI', "The same brief and the same four skills in Google's Antigravity CLI on a free personal account (Gemini 3.8 Flash at its High level, the account's default). It is where Google moved personal accounts when Gemini CLI stopped serving them. Shell commands ran in a read-only sandbox, so a skill's own scripts could not write files. The Taste Skill run used up the account's weekly quota after ten minutes and left no page."),
    ['gemini', 'Gemini', 'The same brief pasted into a chat in the browser, once at each thinking level. The answer took one to two minutes at Low and about three at High.',
      [['gemini-plus', 'Gemini', 'Plus plan, thinking Low'], ['gemini-plus-high', 'Gemini', 'Plus plan, thinking High']]],
  ]],
  ['other', 'Other models', "Chat apps from other vendors, Kimi's desktop agent and models running on the laptop.", [
    ['chats', 'Chat and desktop apps', "The same brief pasted into a chat: Grok and DeepSeek in a browser, Copilot in its Windows app. The answers took one to two minutes. DeepSeek stopped just before the end of the code and needed one click on Continue. Kimi Work, the agent in Kimi's desktop app, wrote its file in about seven minutes and was then cut off by a server-busy message before it could check the page.",
      [['grok-free', 'Grok', 'free plan'], ['deepseek-free', 'DeepSeek', 'free'], ['copilot-free', 'Copilot', 'Windows app, free'], ['kimi-work-free', 'Kimi Work', 'desktop app, free']]],
    ['local', 'Local models', "Models running on the laptop itself through Ollama: one message, no agent. For a page with a skill the whole SKILL.md went in as the system message, because a bare model cannot open a skill on its own. That is all of frontend-design, but only the instructions of Taste Skill: none of its scripts ran and no photograph was fetched. The answers took one to twelve minutes. One more attempt put qwen3:14b behind Claude Code as a real agent, with Taste Skill installed as a folder: in nine minutes it wrote two plans in its thinking, called no tool and left no page.",
      [...LOCAL_MODELS.flatMap(([id, name]) => LOCAL_SETUPS.map(([suffix, setup]) => [`ollama-${id}${suffix}`, name, setup])),
        // scripts/run-claude-local.sh: the one run with a local model as an agent.
        ['claude-local-qwen3-14b-40k-design-taste-frontend', 'qwen3:14b in Claude Code', 'Taste Skill']]],
  ]],
].map(group).filter(Boolean);
const groups = GROUPS.map((g) => g.html).join('\n');
const jump = GROUPS.length > 1
  ? `<nav class="jump" aria-label="Sections"><ul>${GROUPS.map(({ key, title }) => `<li><a href="#${key}">${esc(title)}</a></li>`).join('')}</ul></nav>`
  : '';

// What each page is: the first trial links to the repeats, a repeat says what it repeats.
const TRIAL_NOTE = {
  '': 'The fifteen Claude Code runs were <a href="trial-2.html">repeated once from scratch</a> to see how much comes back the same. The qwen3 and Bielik runs without a skill and with frontend-design were repeated twice: they are at the end of <a href="trial-2.html#other">the second trial</a> and on <a href="trial-3.html">a third page</a>.',
  '-2': 'This page is the <strong>second trial</strong>: the fifteen Claude Code runs, and four of the local-model runs, repeated from scratch in a separate folder, to see how much comes back the same. <a href="./">The first trial</a> · <a href="trial-3.html">A third series of the local runs</a>',
  '-3': 'This page is a <strong>third series</strong> of four local-model runs only: qwen3 and Bielik, without a skill and with frontend-design, repeated from scratch in a separate folder. <a href="./">The first trial</a> · <a href="trial-2.html">The second</a>',
};

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
  .card.missing { display: grid; place-items: center; align-content: center; gap: 4px; color: var(--muted); min-height: 200px; }
  .card.missing p { margin: 0; }
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
  <p class="lead">The same brief for the home page of a made-up housing cooperative, built in Claude Code by Sonnet 5.5, Opus 5.5 and Fable 5.2: once without a skill, then once with each of four design skills. ${TRIAL ? '' : "The same brief then went to OpenAI's and Google's agents, to chat apps and to models running locally. "}One run per combination, so this shows tendencies, not a ranking.</p>
  <p class="lead">${TRIAL_NOTE[TRIAL]}</p>
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
