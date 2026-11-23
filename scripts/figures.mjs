// Composes the comparison figures used in the blog posts from shots/.
// Usage: node scripts/figures.mjs   (writes PNGs to figures/, which is not committed)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'figures');
fs.mkdirSync(OUT, { recursive: true });
const shot = (id, kind) => pathToFileURL(path.join(ROOT, 'shots', `${id}-${kind}.jpg`)).href;

const MODELS = [['sonnet-5-5', 'Sonnet 5.5'], ['opus-5-5', 'Opus 5.5'], ['fable-5-2', 'Fable 5.2']];
const SETUPS = (lang) => [
  ['none', lang === 'pl' ? 'Bez skilla' : 'No skill'],
  ['emil-design-eng', 'emil-design-eng'],
  ['frontend-design', 'frontend-design'],
  ['impeccable', 'Impeccable'],
  ['design-taste-frontend', 'Taste Skill'],
];

const BASE = `body{margin:0;background:#f3f5f8;font-family:Inter,"Segoe UI",system-ui,sans-serif;color:#14161a}
.h{font-weight:700;font-size:20px;align-self:end;padding-bottom:2px}
.l{font-weight:700;font-size:19px;align-self:center;line-height:1.25}
img{display:block;object-fit:cover;object-position:top;border-radius:6px;border:1px solid #d5dae1;background:#fff}`;

// Rows are setups, columns are models: desktop first screens.
const grid = (lang) => `<style>${BASE}
.g{display:grid;grid-template-columns:170px repeat(3,460px);gap:16px;padding:24px;width:max-content}
img{width:460px;height:287px}</style><div class="g"><div></div>
${MODELS.map(([, n]) => `<div class="h">${n}</div>`).join('')}
${SETUPS(lang).map(([s, n]) => `<div class="l">${n}</div>` + MODELS.map(([m]) => `<img src="${shot(`${m}-${s}`, 'desktop-first')}">`).join('')).join('')}</div>`;

// One setup, three models side by side, larger.
const row = (setup) => `<style>${BASE}
.g{display:grid;grid-template-columns:repeat(3,720px);gap:20px;padding:24px;width:max-content}
img{width:720px;height:450px}</style><div class="g">
${MODELS.map(([, n]) => `<div class="h">${n}</div>`).join('')}
${MODELS.map(([m]) => `<img src="${shot(`${m}-${setup}`, 'desktop-first')}">`).join('')}</div>`;

// Rows are models, columns are setups: phone first screens.
const phones = (lang) => `<style>${BASE}
.g{display:grid;grid-template-columns:120px repeat(5,300px);gap:16px;padding:24px;width:max-content}
img{width:300px;height:649px}.h{font-size:18px}</style><div class="g"><div></div>
${SETUPS(lang).map(([, n]) => `<div class="h">${n}</div>`).join('')}
${MODELS.map(([m, n]) => `<div class="l">${n}</div>` + SETUPS(lang).map(([s]) => `<img src="${shot(`${m}-${s}`, 'mobile-first')}">`).join('')).join('')}</div>`;

// A plain board of ten first screens for the post cover's backdrop.
const BOARD = ['sonnet-5-5-none', 'opus-5-5-impeccable', 'sonnet-5-5-design-taste-frontend', 'fable-5-2-none', 'sonnet-5-5-impeccable',
  'opus-5-5-none', 'fable-5-2-impeccable', 'fable-5-2-design-taste-frontend', 'fable-5-2-emil-design-eng', 'opus-5-5-frontend-design'];
const board = () => `<style>body{margin:0;background:#1d1f24}
.g{display:grid;grid-template-columns:repeat(5,560px);gap:24px;padding:30px;width:max-content}
img{display:block;width:560px;height:350px;object-fit:cover;object-position:top;border-radius:4px}</style>
<div class="g">${BOARD.map((id) => `<img src="${shot(id, 'desktop-first')}">`).join('')}</div>`;

// The chat apps, with the plan each account was on. Three free ones in the
// first row; Copilot and the two Gemini runs (thinking level Low and High, which
// the Polish interface calls Podstawowy and Rozszerzony) in the second.
const chats = (lang) => {
  const pl = lang === 'pl';
  const items = [
    ['chatgpt-free', pl ? 'ChatGPT (plan Free)' : 'ChatGPT (Free plan)'],
    ['grok-free', pl ? 'Grok (plan darmowy)' : 'Grok (free plan)'],
    ['deepseek-free', pl ? 'DeepSeek (darmowy)' : 'DeepSeek (free)'],
    ['copilot-free', pl ? 'Copilot (aplikacja w Windows, darmowy)' : 'Copilot (Windows app, free)'],
    ['gemini-plus', pl ? 'Gemini (plan Plus, myślenie podstawowe)' : 'Gemini (Plus plan, thinking Low)'],
    ['gemini-plus-high', pl ? 'Gemini (plan Plus, myślenie rozszerzone)' : 'Gemini (Plus plan, thinking High)'],
  ];
  return `<style>${BASE}
.g{display:grid;grid-template-columns:repeat(3,720px);gap:24px 20px;padding:24px;width:max-content}
.c{display:grid;gap:10px}
img{width:720px;height:450px}</style><div class="g">
${items.map(([id, n]) => `<div class="c"><div class="h">${n}</div><img src="${shot(id, 'desktop-first')}"></div>`).join('')}</div>`;
};

const figures = {
  'grid-en': grid('en'), 'grid-pl': grid('pl'),
  taste: row('design-taste-frontend'), impeccable: row('impeccable'), none: row('none'), 'frontend-design': row('frontend-design'),
  'phones-en': phones('en'), 'phones-pl': phones('pl'),
  board: board(),
  'chats-en': chats('en'), 'chats-pl': chats('pl'),
};

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1.5, viewport: { width: 2400, height: 900 } });
for (const [name, body] of Object.entries(figures)) {
  const file = path.join(OUT, `${name}.html`);
  fs.writeFileSync(file, `<!doctype html><meta charset="utf-8">${body}`);
  await page.goto(pathToFileURL(file).href, { waitUntil: 'networkidle' });
  await (await page.$('.g')).screenshot({ path: path.join(OUT, `${name}.png`), type: 'png' });
  fs.rmSync(file);
  console.log(`figures/${name}.png`);
}
await browser.close();
