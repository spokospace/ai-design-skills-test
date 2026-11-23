// Reads the code of every collected page: document head, structure, ARIA,
// links and forms, CSS habits, and whether the layout holds at five widths.
//
// It counts what is in the markup. It does not judge whether a label is
// well written or a heading well chosen, and it does not replace axe, whose
// results stay in results.json.
//
// Usage: node scripts/audit-code.mjs [id ...]   (default: every page in runs/)
//        TRIAL=2 node scripts/audit-code.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { serve } from './lib/static.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const TRIAL = process.env.TRIAL ? `-${process.env.TRIAL}` : '';
const RUNS = path.join(ROOT, `runs${TRIAL}`);
const WIDTHS = [320, 375, 768, 1024, 1440];

/** Runs in the page. Everything it returns is a count or a short string. */
function inspect() {
  const q = (sel, root = document) => [...root.querySelectorAll(sel)];
  const shown = (el) => {
    const box = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return box.width > 0 && box.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const content = (sel) => document.querySelector(sel)?.getAttribute('content')?.trim() || null;
  const byId = (id) => (id ? document.getElementById(id) : null);

  // --- head
  const jsonLd = q('script[type="application/ld+json"]').flatMap((s) => {
    try {
      const data = JSON.parse(s.textContent);
      return [data, ...(data['@graph'] ?? [])].flatMap((n) => n?.['@type'] ?? []);
    } catch {
      return ['invalid'];
    }
  });
  const head = {
    doctype: document.doctype?.name === 'html',
    lang: document.documentElement.getAttribute('lang'),
    charset: !!document.querySelector('meta[charset]'),
    viewport: content('meta[name="viewport"]'),
    title: document.title.trim().length,
    description: content('meta[name="description"]')?.length ?? 0,
    canonical: !!document.querySelector('link[rel="canonical"]'),
    robots: content('meta[name="robots"]'),
    openGraph: q('meta[property^="og:"]').map((m) => m.getAttribute('property').slice(3)),
    twitterCard: !!document.querySelector('meta[name="twitter:card"]'),
    jsonLd,
    favicon: !!document.querySelector('link[rel~="icon"]'),
    themeColor: !!document.querySelector('meta[name="theme-color"]'),
  };

  // --- structure
  const landmark = (tag, role) => q(`${tag}, [role="${role}"]`).length;
  const levels = q('h1,h2,h3,h4,h5,h6').filter(shown).map((h) => +h.tagName[1]);
  const focusable = q('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
  const first = focusable[0];
  // A skip link is the first focusable element and leads to the main content.
  // A menu link to a section is not one, so the target or the wording has to say so.
  const mainEl = document.querySelector('main, [role="main"]');
  const skipTarget = first?.matches('a[href^="#"]') ? byId(first.getAttribute('href').slice(1)) : null;
  const navs = q('nav, [role="navigation"]');
  const structure = {
    header: landmark('body > header, body > * > header', 'banner'),
    nav: navs.length,
    navUnnamed: navs.length > 1 ? navs.filter((n) => !n.hasAttribute('aria-label') && !n.hasAttribute('aria-labelledby')).length : 0,
    main: landmark('main', 'main'),
    footer: landmark('body > footer, body > * > footer', 'contentinfo'),
    skipLink: !!skipTarget && (skipTarget === mainEl || (!!mainEl && skipTarget.contains(mainEl)) || /przejd|pomi|skip|tre[śs]ci/i.test(first.textContent)),
    h1: levels.filter((l) => l === 1).length,
    headings: levels.length,
    skippedLevels: levels.filter((l, i) => i && l > levels[i - 1] + 1).length,
    time: q('time[datetime]').length,
    address: q('address').length,
    tables: q('table').length,
    tablesWithoutTh: q('table').filter((t) => !t.querySelector('th')).length,
    descriptionLists: q('dl').length,
  };

  // --- ARIA and non-text content
  const count = (attr) => q(`[${attr}]`).length;
  const svgs = q('svg');
  const emoji = { total: 0, hidden: 0 };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement.closest('script, style, noscript')) continue;
    const found = node.nodeValue.match(/\p{Extended_Pictographic}/gu)?.length ?? 0;
    if (!found) continue;
    emoji.total += found;
    if (node.parentElement.closest('[aria-hidden="true"]')) emoji.hidden += found;
  }
  const refs = q('[aria-labelledby], [aria-describedby], [aria-controls], label[for]').flatMap((el) =>
    ['aria-labelledby', 'aria-describedby', 'aria-controls', 'for'].flatMap((a) => (el.getAttribute(a) ?? '').split(/\s+/).filter(Boolean)),
  );
  const ids = q('[id]').map((el) => el.id);
  const aria = {
    label: count('aria-label'),
    labelledby: count('aria-labelledby'),
    describedby: count('aria-describedby'),
    hidden: count('aria-hidden'),
    live: count('aria-live') + q('[role="status"], [role="alert"]').length,
    current: count('aria-current'),
    expanded: count('aria-expanded'),
    roles: count('role'),
    brokenRefs: refs.filter((id) => !byId(id)).length,
    duplicateIds: ids.length - new Set(ids).size,
    img: q('img').length,
    imgNoAlt: q('img:not([alt])').length,
    imgEmptyAlt: q('img[alt=""]').length,
    svg: svgs.length,
    svgUnmarked: svgs.filter((s) => !s.closest('[aria-hidden="true"]') && !s.hasAttribute('aria-label') && !s.hasAttribute('aria-labelledby') && !s.querySelector('title')).length,
    emoji: emoji.total,
    emojiHidden: emoji.hidden,
  };

  // --- links, buttons, forms
  const links = q('a');
  const fields = q('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea');
  const named = (el) =>
    el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby') || !!el.closest('label') || (el.id && !!document.querySelector(`label[for="${CSS.escape(el.id)}"]`));
  const interactive = {
    links: links.length,
    deadLinks: links.filter((a) => !a.hasAttribute('href') || ['', '#'].includes(a.getAttribute('href').trim()) || a.getAttribute('href').startsWith('javascript:')).length,
    brokenAnchors: links.filter((a) => /^#.+/.test(a.getAttribute('href') ?? '') && !byId(decodeURIComponent(a.getAttribute('href').slice(1)))).length,
    tel: q('a[href^="tel:"]').length,
    mailto: q('a[href^="mailto:"]').length,
    newTabNoRel: q('a[target="_blank"]:not([rel~="noopener"])').length,
    buttons: q('button').length,
    buttonsNoType: q('form button:not([type])').length,
    clickableDivs: q('div[onclick], span[onclick], [role="button"]:not(button)').length,
    inlineHandlers: q('*').filter((el) => [...el.attributes].some((a) => a.name.startsWith('on'))).length,
    forms: q('form').length,
    fields: fields.length,
    fieldsUnnamed: fields.filter((f) => !named(f)).length,
    fieldsAutocomplete: fields.filter((f) => f.hasAttribute('autocomplete')).length,
    search: q('input[type="search"], [role="search"], search').length,
  };

  // --- images and DOM
  const dom = {
    nodes: q('*').length,
    inlineStyles: q('[style]').length,
    imgNoSize: q('img:not([width]), img:not([height])').length,
    imgLazy: q('img[loading="lazy"]').length,
    imgResponsive: q('img[srcset], picture source').length,
    scripts: q('script:not([type="application/ld+json"])').length,
    externalScripts: q('script[src]').filter((s) => new URL(s.src).host !== location.host).length,
  };

  return { head, structure, aria, interactive, dom };
}

/** The page's CSS as text: every <style> block and every stylesheet served from the same folder. */
async function cssOf(page) {
  return page.evaluate(async () => {
    const parts = [...document.querySelectorAll('style')].map((s) => s.textContent);
    for (const link of document.querySelectorAll('link[rel~="stylesheet"]')) {
      if (new URL(link.href).host !== location.host) continue;
      parts.push(await fetch(link.href).then((r) => (r.ok ? r.text() : '')).catch(() => ''));
    }
    return parts.join('\n');
  });
}

function cssHabits(css) {
  const n = (re) => css.match(re)?.length ?? 0;
  const breakpoints = new Set();
  for (const m of css.matchAll(/@media[^{]*?(?:(?:min|max)-width\s*:|width\s*[<>]=?)\s*([\d.]+(?:px|em|rem))/g)) breakpoints.add(m[1]);
  return {
    bytes: Buffer.byteLength(css),
    breakpoints: [...breakpoints].sort((a, b) => parseFloat(a) - parseFloat(b)),
    containerQueries: n(/@container\b/g),
    clamp: n(/\bclamp\(/g),
    customProperties: new Set(css.match(/(?<![\w-])--[\w-]+(?=\s*:)/g) ?? []).size,
    reducedMotion: /prefers-reduced-motion/.test(css),
    colorScheme: /prefers-color-scheme/.test(css),
    contrastModes: /prefers-contrast|forced-colors/.test(css),
    print: /@media[^{]*\bprint\b/.test(css),
    focusVisible: n(/:focus-visible/g),
    focus: n(/:focus(?![-\w])/g),
    outlineNone: n(/outline\s*:\s*(?:none|0)\b/g),
    important: n(/!important/g),
    keyframes: n(/@keyframes\b/g),
    fontSizePx: n(/font-size\s*:\s*[\d.]+px/g),
    fontSizeRelative: n(/font-size\s*:\s*(?:[\d.]+r?em|clamp\(|var\()/g),
  };
}

async function audit(browser, id) {
  const server = await serve(path.join(RUNS, id));
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(600);
    const result = { id, ...(await page.evaluate(inspect)), css: cssHabits(await cssOf(page)) };

    // Width by width: does anything push the page sideways, and how small does text get.
    result.widths = {};
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(250);
      result.widths[width] = await page.evaluate(() => {
        const sizes = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const el = node.parentElement;
          if (!node.nodeValue.trim() || el.closest('script, style, noscript')) continue;
          const box = el.getBoundingClientRect();
          if (box.width && box.height) sizes.push(parseFloat(getComputedStyle(el).fontSize));
        }
        // The element that reaches furthest past the right edge, to name the cause.
        let widest = null;
        for (const el of document.body.querySelectorAll('*')) {
          const right = el.getBoundingClientRect().right;
          if (right > innerWidth + 1 && (!widest || right > widest.right)) widest = { right, el };
        }
        return {
          overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
          widest: widest ? widest.el.tagName.toLowerCase() + (widest.el.classList[0] ? `.${widest.el.classList[0]}` : '') : null,
          minFont: sizes.length ? Math.min(...sizes) : null,
          textUnder12: sizes.filter((s) => s < 12).length,
        };
      });
    }
    return result;
  } finally {
    await ctx.close();
    server.close();
  }
}

const all = fs.readdirSync(RUNS).filter((id) => fs.existsSync(path.join(RUNS, id, 'index.html')));
const ids = process.argv.slice(2).length ? process.argv.slice(2) : all;
const browser = await chromium.launch();
// Four pages at a time: each has its own context and its own port.
const results = [];
const queue = [...ids];
await Promise.all(Array.from({ length: 4 }, async () => {
  for (let id = queue.shift(); id; id = queue.shift()) {
    results.push(await audit(browser, id));
    console.log(`audited ${id}`);
  }
}));
await browser.close();

const out = path.join(ROOT, `code${TRIAL}.json`);
const kept = ids.length === all.length || !fs.existsSync(out) ? [] : JSON.parse(fs.readFileSync(out, 'utf8')).filter((r) => !ids.includes(r.id));
fs.writeFileSync(out, `${JSON.stringify([...kept, ...results].sort((a, b) => a.id.localeCompare(b.id)), null, 1)}\n`);
console.log(`${path.basename(out)} written (${kept.length + results.length} pages)`);
