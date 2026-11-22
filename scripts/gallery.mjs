// Builds index.html: the 15 pages as a grid (setups × models) with their numbers.
// Usage: node scripts/gallery.mjs   (reads results.json)
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const results = JSON.parse(fs.readFileSync(path.join(ROOT, 'results.json'), 'utf8'));
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
  <a class="shot" href="runs/${id}/index.html" aria-label="Open the ${esc(setupName)} page by ${esc(modelName)}">
    <img src="${r.shots['desktop-first']}" alt="" loading="lazy" width="1440" height="900">
  </a>
  <h3>${esc(modelName)} <span>· ${esc(setupName)}</span></h3>
  <dl>
    ${l.tokens ? `<div><dt>Time</dt><dd>${l.durationMin} min${cut ? ' <abbr title="Stopped at the 50-minute limit">(cut)</abbr>' : ''}</dd></div>
    <div><dt>Tokens</dt><dd>${tok(l.tokens.total)}${l.tokens.partial ? '+' : ''}</dd></div>
    <div><dt>Output</dt><dd>${l.tokens.partial ? '–' : tok(l.tokens.output)}</dd></div>` : ''}
    <div><dt>Page</dt><dd>${kb(r.bytes.total)}</dd></div>
    <div><dt>JS</dt><dd>${kb(r.bytes.js)}</dd></div>
    <div><dt>Detector</dt><dd>${(r.detector ?? []).length} <small>(${slop} slop)</small></dd></div>
    <div><dt>axe rules</dt><dd>${axe}</dd></div>
  </dl>
  <p class="links"><a href="runs/${id}/index.html">Page</a> · <a href="${r.shots['desktop-full']}">Full desktop</a> · <a href="${r.shots['mobile-full']}">Full phone</a> · <a href="runs/${id}/meta.json">meta.json</a></p>
</article>`;
}

const rows = [...SETUPS, ...EXTRA].map(([key, name, note]) => `<section class="row" aria-labelledby="h-${key}">
  <header><h2 id="h-${key}">${esc(name)}</h2><p>${esc(note)}</p></header>
  <div class="grid">${MODELS.map(([m, mName]) => cell(`${m}-${key}`, mName, name)).join('\n')}</div>
</section>`).join('\n');

// The same brief pasted into chat apps in a browser (temporary chats, no
// personalisation). A chat reports no token counts, so those cells are left out.
const CHATS = [['chatgpt-free', 'ChatGPT', 'Free plan'], ['gemini-plus', 'Gemini', 'Plus plan'], ['grok-free', 'Grok', 'free plan']];
const chatRow = `<section class="row" aria-labelledby="h-chats">
  <header><h2 id="h-chats">Chat apps</h2><p>The same brief pasted into a browser chat. Each answered in about a minute.</p></header>
  <div class="grid">${CHATS.map(([id, name, plan]) => cell(id, name, plan)).join('\n')}</div>
</section>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>One brief, three models, four skills</title>
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
  .row { margin-top: 40px; }
  .row header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; margin-bottom: 12px; }
  .row h2 { font-size: 1.25rem; margin: 0; }
  .row header p { margin: 0; color: var(--muted); }
  .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
  .card.missing { display: grid; place-items: center; color: var(--muted); min-height: 200px; }
  .shot { display: block; border-radius: 4px; overflow: hidden; border: 1px solid var(--line); }
  .shot img { display: block; width: 100%; height: auto; aspect-ratio: 16 / 10; object-fit: cover; object-position: top; }
  .shot:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
  .card h3 { font-size: 1rem; margin: 12px 0 8px; }
  .card h3 span { font-weight: 400; color: var(--muted); }
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
  <h1>One brief, three models, four skills</h1>
  <p class="lead">The same brief for the home page of a made-up housing cooperative, built in Claude Code by Sonnet 5.5, Opus 5.5 and Fable 5.2: once without a skill, then once with each of four design skills. One run per combination, so this shows tendencies, not a ranking.</p>
  <p class="lead"><a href="brief.md">The brief</a> (in Polish) · <a href="README.md">Method and versions</a> · <a href="https://spoko.space/blog/design-skills-for-ai-agents-tested/">The write-up on spoko.space</a></p>
  <p class="lead"><strong>Tokens</strong> include cache reads, which are most of them. <strong>Detector</strong> counts the findings of Impeccable's own rule-based checker (<code>npx impeccable detect</code>), so it judges every page by one skill's rules. <strong>axe rules</strong> counts distinct WCAG 2.2 A/AA rules axe-core flags at 1440 and 390 px.</p>
${rows}
${chatRow}
  <footer>
    <p>The cooperative, its address, phone numbers and documents are made up. Every page says so in its footer. Photographs placed by Taste Skill come from open archives and are credited on the page that uses them.</p>
  </footer>
</main>
</body>
</html>
`;
fs.writeFileSync(path.join(ROOT, 'index.html'), html);
console.log('index.html written');
