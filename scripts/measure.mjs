// Collects each finished run into runs/<id>/ and measures it.
//
// For every run folder in RUNS_WORK: serve it over HTTP, load index.html in
// Chromium, copy only the files the page actually requested (a skill may copy
// tens of megabytes of assets into the project and use a handful), then
// measure the copy: page weight, scripts, axe (WCAG 2.x A/AA), the
// impeccable slop detector, and screenshots at 1440 and 390 px.
//
// Usage: node scripts/measure.mjs [id ...]   (default: every run found)
//        TRIAL=2 RUNS_WORK=<second work folder> node scripts/measure.mjs
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const WORK = process.env.RUNS_WORK ?? path.resolve(ROOT, '..', 'skill-runs');
// TRIAL=2 keeps a repeat of the test apart: runs-2/, shots-2/, results-2.json.
const TRIAL = process.env.TRIAL ? `-${process.env.TRIAL}` : '';
const OUT = path.join(ROOT, `runs${TRIAL}`);
const SHOTS = path.join(ROOT, `shots${TRIAL}`);
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.pdf': 'application/pdf',
};

function serve(dir) {
  const server = createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(dir, rel);
    if (!file.startsWith(path.resolve(dir)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/** Scroll the whole page so scroll-triggered reveals have fired before a full-page shot. */
async function scrollThrough(page) {
  await page.evaluate(async () => {
    const step = Math.round(innerHeight * 0.6);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    scrollTo(0, 0);
  });
  await page.waitForTimeout(800);
}

function runLog(id) {
  const file = path.join(WORK, `${id}.jsonl`);
  const log = { skillsInvoked: [], toolCalls: 0, denied: [] };
  if (!fs.existsSync(file)) return log;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type === 'assistant') {
      // Fallback for a run cut off before its result event: usage per API
      // message (one message can span several stream events, so keep the last).
      if (ev.message?.id && ev.message.usage) (log.perMessage ??= {})[ev.message.id] = ev.message.usage;
      for (const c of ev.message?.content ?? []) {
        if (c.type !== 'tool_use') continue;
        log.toolCalls++;
        if (c.name === 'Skill') log.skillsInvoked.push(c.input?.skill ?? c.input?.command);
      }
    }
    // Codex (`codex exec --json`) logs items and one usage block per turn.
    if (ev.type === 'item.completed' && ['command_execution', 'file_change', 'mcp_tool_call', 'web_search'].includes(ev.item?.type)) {
      log.toolCalls++;
      const skill = ev.item.command?.match(/skills[\\/]+([\w-]+)[\\/]+SKILL\.md/)?.[1];
      if (skill && !log.skillsInvoked.includes(skill)) log.skillsInvoked.push(skill);
    }
    if (ev.type === 'turn.completed' && ev.usage) {
      const c = (log.codex ??= { input: 0, cached: 0, output: 0 });
      c.input += ev.usage.input_tokens ?? 0;
      c.cached += ev.usage.cached_input_tokens ?? 0;
      c.output += ev.usage.output_tokens ?? 0;
    }
    if (ev.type === 'turn.failed' || ev.type === 'error') log.failed = true;
    if (ev.type === 'result') {
      // usage covers the main model only; modelUsage also has helper models
      // (e.g. Haiku for summaries), so totals are summed from it.
      const models = Object.entries(ev.modelUsage ?? {}).map(([name, u]) => ({
        name,
        input: u.inputTokens ?? 0,
        output: u.outputTokens ?? 0,
        cacheRead: u.cacheReadInputTokens ?? 0,
        cacheWrite: u.cacheCreationInputTokens ?? 0,
        costUsd: u.costUSD,
      }));
      // A skill that starts background agents (Impeccable does) makes the CLI
      // emit one result per wake-up: turns and agent time add up, while cost,
      // API time and modelUsage are already cumulative, so the last one wins.
      const sum = (k) => models.reduce((s, m) => s + m[k], 0);
      log.results = (log.results ?? 0) + 1;
      log.agentMs = (log.agentMs ?? 0) + (ev.duration_ms ?? 0);
      Object.assign(log, {
        ok: ev.subtype === 'success' && !ev.is_error,
        apiMin: +((ev.duration_api_ms ?? 0) / 60000).toFixed(1),
        turns: (log.turns ?? 0) + (ev.num_turns ?? 0),
        costUsd: ev.total_cost_usd,
        tokens: {
          input: sum('input'),
          output: sum('output'),
          cacheRead: sum('cacheRead'),
          cacheWrite: sum('cacheWrite'),
          total: sum('input') + sum('output') + sum('cacheRead') + sum('cacheWrite'),
        },
        models,
        denied: [...log.denied, ...(ev.permission_denials ?? []).map((d) => d.tool_name + (d.tool_input?.command ? `: ${d.tool_input.command.slice(0, 80)}` : ''))],
      });
    }
  }
  // Wall-clock time from the runner's own log ("<id> done in <n>s"); the
  // result events alone undercount a run that waited on background agents.
  const runner = path.join(path.dirname(WORK), `${path.basename(WORK)}.log`);
  const wall = fs.existsSync(runner) && fs.readFileSync(runner, 'utf8').match(new RegExp(`^${id} done in (\\d+)s`, 'm'));
  log.durationMin = +((wall ? +wall[1] * 1000 : log.agentMs ?? 0) / 60000).toFixed(1);
  log.durationSource = wall ? 'wall clock' : 'agent time';
  if (log.agentMs) log.agentMin = +(log.agentMs / 60000).toFixed(1);
  delete log.agentMs;
  if (log.codex) {
    // Codex counts the cached part inside input_tokens; split it the way the
    // Claude numbers are split.
    const { input, cached, output } = log.codex;
    log.tokens = { input: input - cached, output, cacheRead: cached, cacheWrite: 0, total: input + output };
    log.ok = !log.failed;
  }
  delete log.codex;
  delete log.failed;
  if (!log.tokens && log.perMessage) {
    const u = Object.values(log.perMessage);
    const sum = (k) => u.reduce((s, x) => s + (x[k] ?? 0), 0);
    const t = { input: sum('input_tokens'), output: sum('output_tokens'), cacheRead: sum('cache_read_input_tokens'), cacheWrite: sum('cache_creation_input_tokens') };
    log.tokens = { ...t, total: t.input + t.output + t.cacheRead + t.cacheWrite, partial: true };
    log.ok = false;
  }
  delete log.perMessage;
  return log;
}

function detect(url) {
  try {
    const out = execFileSync('npx', ['-y', 'impeccable', 'detect', '--json', url], { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'ignore'] });
    return JSON.parse(out);
  } catch (err) {
    // exit code 2 means "findings", stdout still holds the JSON
    try { return JSON.parse(err.stdout); } catch { return null; }
  }
}

async function measure(browser, id) {
  const src = path.join(WORK, id);
  const dest = path.join(OUT, id);
  if (!fs.existsSync(path.join(src, 'index.html'))) {
    console.log(`${id}: no index.html, skipped`);
    return { id, missing: true, log: runLog(id) };
  }

  // 1. Collect: copy only what the page requests (plus index.html).
  let server = await serve(src);
  let base = `http://127.0.0.1:${server.address().port}/`;
  // `used` is one desktop visit (what the weight figures count); `copied` is
  // everything any visit asks for, because a page may serve a different image
  // crop to a phone or a high-density screen, plus the local files it links to.
  const used = new Set(['index.html']);
  const copied = new Set(['index.html']);
  const external = new Set();
  let ctx;
  let page;
  const visits = [
    { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    { viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2 },
    { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
    { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  ];
  for (const [i, opts] of visits.entries()) {
    ctx = await browser.newContext(opts);
    page = await ctx.newPage();
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (u.origin === new URL(base).origin) {
        const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html';
        copied.add(rel);
        if (i === 0) used.add(rel);
      } else if (u.protocol.startsWith('http')) external.add(u.origin);
    });
    await page.goto(base, { waitUntil: 'networkidle' });
    await scrollThrough(page);
    if (i === 0) {
      const linked = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')));
      for (const href of linked) {
        if (/^(#|[a-z]+:|\/\/)/i.test(href)) continue;
        copied.add(decodeURIComponent(href.split(/[?#]/)[0]).replace(/^\.?\/+/, ''));
      }
    }
    await ctx.close();
  }
  server.close();
  fs.rmSync(dest, { recursive: true, force: true });
  for (const rel of copied) {
    const from = path.join(src, rel);
    if (!fs.existsSync(from) || fs.statSync(from).isDirectory()) continue;
    fs.mkdirSync(path.dirname(path.join(dest, rel)), { recursive: true });
    fs.copyFileSync(from, path.join(dest, rel));
  }

  // 2. Measure the copy.
  const files = [...used].filter((rel) => fs.existsSync(path.join(dest, rel)));
  const size = (pred) => files.filter(pred).reduce((s, rel) => s + fs.statSync(path.join(dest, rel)).size, 0);
  const html = fs.readFileSync(path.join(dest, 'index.html'), 'utf8');
  const inlineJs = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].reduce((s, m) => s + Buffer.byteLength(m[1]), 0);
  const inlineCss = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].reduce((s, m) => s + Buffer.byteLength(m[1]), 0);

  server = await serve(dest);
  base = `http://127.0.0.1:${server.address().port}/`;
  const consoleErrors = [];
  const shots = {};
  const axe = {};
  for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: name === 'mobile', hasTouch: name === 'mobile' });
    page = await ctx.newPage();
    page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text().slice(0, 160)));
    page.on('pageerror', (e) => consoleErrors.push(String(e).slice(0, 160)));
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500); // let hero entrances finish
    fs.mkdirSync(SHOTS, { recursive: true });
    shots[`${name}-first`] = `shots${TRIAL}/${id}-${name}-first.jpg`;
    await page.screenshot({ path: path.join(ROOT, shots[`${name}-first`]), type: 'jpeg', quality: 82 });
    await scrollThrough(page);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    shots[`${name}-full`] = `shots${TRIAL}/${id}-${name}-full.jpg`;
    await page.screenshot({ path: path.join(ROOT, shots[`${name}-full`]), type: 'jpeg', quality: 78, fullPage: true });
    const res = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    axe[name] = {
      height,
      violations: res.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
    };
    await ctx.close();
  }

  server.close();
  const slop = detect(path.join(dest, 'index.html'));

  const result = {
    id,
    log: runLog(id),
    files: files.length,
    bytes: { total: size(() => true), html: Buffer.byteLength(html), js: inlineJs + size((f) => /\.m?js$/.test(f)), css: inlineCss + size((f) => f.endsWith('.css')), images: size((f) => /\.(png|jpe?g|webp|avif|svg)$/i.test(f)) },
    htmlLines: html.split('\n').length,
    external: [...external],
    consoleErrors: [...new Set(consoleErrors)],
    axe,
    detector: Array.isArray(slop) ? slop.map((f) => ({ rule: f.antipattern, category: f.category, severity: f.severity, snippet: f.snippet?.slice(0, 120) })) : null,
    shots,
  };
  fs.writeFileSync(path.join(dest, 'meta.json'), JSON.stringify(result, null, 2));
  console.log(`${id}: ${files.length} files, ${(result.bytes.total / 1024).toFixed(0)} KB, axe ${axe.desktop.violations.length}/${axe.mobile.violations.length}`);
  return result;
}

const ids = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync(WORK).filter((f) => fs.statSync(path.join(WORK, f)).isDirectory()).sort();
const browser = await chromium.launch();
const results = [];
for (const id of ids) results.push(await measure(browser, id));
await browser.close();

const all = path.join(ROOT, `results${TRIAL}.json`);
const prev = fs.existsSync(all) ? JSON.parse(fs.readFileSync(all, 'utf8')) : [];
const merged = [...prev.filter((r) => !ids.includes(r.id)), ...results].sort((a, b) => a.id.localeCompare(b.id));
fs.writeFileSync(all, JSON.stringify(merged, null, 2));
