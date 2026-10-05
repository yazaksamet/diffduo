#!/usr/bin/env node
/* Builds one static page per tool per language.

   Sources
     src/pages/<template>.html      page templates ({{>partial}} includes, <!--if:mode-->…<!--/if--> blocks)
     src/partials/*                 shared head, header, footer, styles and scripts
     src/i18n/<set>/<code>.json     translations; a page's strings = text + common + its own set

   Output
     /index.html, /<code>/index.html                          text compare
     /json-compare/index.html, /<code>/json-compare/…          JSON compare
     /compare-lists/index.html, /<code>/compare-lists/…        list compare
     sitemap.xml

   node build.js              validate all translations and build every page
   node build.js --check tr   only validate the given language(s)
   node build.js --draft      build only what has translations so far            */
const fs = require('fs'), path = require('path');

const SITE = 'https://diffduo.com/';
const LANGS = [
  { code: 'en', path: '',    hreflang: 'en',    locale: 'en',    og: 'en_US' },
  { code: 'tr', path: 'tr/', hreflang: 'tr',    locale: 'tr',    og: 'tr_TR' },
  { code: 'es', path: 'es/', hreflang: 'es',    locale: 'es',    og: 'es_ES' },
  { code: 'pt', path: 'pt/', hreflang: 'pt',    locale: 'pt-BR', og: 'pt_BR' },
  { code: 'fr', path: 'fr/', hreflang: 'fr',    locale: 'fr',    og: 'fr_FR' },
  { code: 'de', path: 'de/', hreflang: 'de',    locale: 'de',    og: 'de_DE' },
  { code: 'it', path: 'it/', hreflang: 'it',    locale: 'it',    og: 'it_IT' },
  { code: 'nl', path: 'nl/', hreflang: 'nl',    locale: 'nl',    og: 'nl_NL' },
  { code: 'pl', path: 'pl/', hreflang: 'pl',    locale: 'pl',    og: 'pl_PL' },
  { code: 'ru', path: 'ru/', hreflang: 'ru',    locale: 'ru',    og: 'ru_RU' },
  { code: 'uk', path: 'uk/', hreflang: 'uk',    locale: 'uk',    og: 'uk_UA' },
  { code: 'ar', path: 'ar/', hreflang: 'ar',    locale: 'ar',    og: 'ar_AR', rtl: true },
  { code: 'hi', path: 'hi/', hreflang: 'hi',    locale: 'hi',    og: 'hi_IN' },
  { code: 'id', path: 'id/', hreflang: 'id',    locale: 'id',    og: 'id_ID' },
  { code: 'vi', path: 'vi/', hreflang: 'vi',    locale: 'vi',    og: 'vi_VN' },
  { code: 'ja', path: 'ja/', hreflang: 'ja',    locale: 'ja',    og: 'ja_JP' },
  { code: 'ko', path: 'ko/', hreflang: 'ko',    locale: 'ko',    og: 'ko_KR' },
  { code: 'zh', path: 'zh/', hreflang: 'zh-CN', locale: 'zh-CN', og: 'zh_CN' },
];
const PAGES = [
  { id: 'text',  slug: '',               template: 'compare.html', mode: 'text' },
  { id: 'json',  slug: 'json-compare/',  template: 'compare.html', mode: 'json' },
  { id: 'lists', slug: 'compare-lists/', template: 'lists.html',   mode: 'lists' },
];
const SETS = ['text', 'common', 'json', 'lists'];
const setsFor = page => ['text', 'common', ...(page.id === 'text' ? [] : [page.id])];

const ROOT = __dirname, SRC = path.join(ROOT, 'src');
const fileOf = (set, code) => path.join(SRC, 'i18n', set, `${code}.json`);
const has = (set, code) => fs.existsSync(fileOf(set, code));
const load = (set, code) => JSON.parse(fs.readFileSync(fileOf(set, code), 'utf8'));

/* ---------- validation: every translation must match its English source ---------- */
const tags = s => (s.match(/<\/?[a-z]+/g) || []).sort().join(' ');
const holes = s => (s.match(/\{\w+\}/g) || []).sort().join(' ');
const isPlural = v => v && typeof v === 'object' && !Array.isArray(v) && 'other' in v && 'one' in v;

function validate(set, lang){
  const en = load(set, 'en'), tr = load(set, lang.code), errors = [];
  const cats = new Intl.PluralRules(lang.locale).resolvedOptions().pluralCategories;
  const walk = (a, b, at) => {
    if (isPlural(a)){
      if (!b || typeof b !== 'object') return errors.push(`${at}: expected plural forms object`);
      for (const c of cats) if (typeof b[c] !== 'string' || !b[c].trim()) errors.push(`${at}.${c}: missing plural form (needed: ${cats.join(', ')})`);
      for (const k of Object.keys(b)){
        if (!cats.includes(k)) errors.push(`${at}.${k}: "${lang.code}" has no "${k}" plural form (allowed: ${cats.join(', ')})`);
        else if (holes(b[k]) !== holes(a.other)) errors.push(`${at}.${k}: placeholders must be ${holes(a.other)}`);
      }
      return;
    }
    if (Array.isArray(a)){
      if (!Array.isArray(b) || b.length !== a.length) return errors.push(`${at}: expected an array of ${a.length}`);
      return a.forEach((x, i) => walk(x, b[i], `${at}[${i}]`));
    }
    if (typeof a === 'object'){
      if (!b || typeof b !== 'object') return errors.push(`${at}: expected an object`);
      for (const k of Object.keys(a)) walk(a[k], b[k], at ? `${at}.${k}` : k);
      for (const k of Object.keys(b)) if (!(k in a)) errors.push(`${at ? at + '.' : ''}${k}: unknown key`);
      return;
    }
    if (typeof b !== 'string' || !b.trim()) return errors.push(`${at}: missing text`);
    if (tags(a) !== tags(b)) errors.push(`${at}: HTML tags must match English (${tags(a) || 'none'}), got (${tags(b) || 'none'})`);
    if (holes(a) !== holes(b)) errors.push(`${at}: placeholders must match English (${holes(a) || 'none'})`);
  };
  walk(en, tr, '');
  return errors.map(e => `${set}/${lang.code}.json ${e}`);
}

/* ---------- rendering ---------- */
const attr = s => String(s).replace(/<[^>]+>/g, '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const plain = s => String(s).replace(/<[^>]+>/g, '');
const get = (obj, key) => key.split('.').reduce((o, k) => o == null ? o : o[k], obj);
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const merge = (a, b) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(a[k]) ? merge(a[k], v) : v;
  return out;
};
const strings = (page, code) => setsFor(page).map(s => load(s, code)).reduce(merge, {});
const urlOf = (l, page) => SITE + l.path + page.slug;

const GLOBE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
const ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const ICON_DOWNLOAD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>';
// swatches for the "how to read" legend, per tool
const LEGEND = {
  text: [['sw-del', '−'], ['sw-add', '+'], ['sw-word', 'ab'], ['sw-hunk', '@@']],
  json: [['sw-chg', '~'], ['sw-add', '+'], ['sw-del', '−'], ['sw-hunk', '{ }']],
};
const LIST_CARDS = ['onlyA', 'both', 'onlyB', 'union', 'dupA', 'dupB'];

function jsonLd(l, page, d){
  const url = urlOf(l, page);
  const graph = [
    { '@type': 'WebSite', '@id': SITE + '#website', url: SITE, name: 'DiffDuo' },
    {
      '@type': 'WebApplication', '@id': url + '#app', name: d.meta.appName, url, inLanguage: l.hreflang,
      applicationCategory: 'DeveloperApplication', operatingSystem: 'Any', browserRequirements: 'Requires JavaScript',
      isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      image: SITE + 'og-image.png', screenshot: SITE + 'og-image.png',
      description: d.meta.appDescription, featureList: d.meta.featureList,
    },
    {
      '@type': 'FAQPage', '@id': url + '#faq', inLanguage: l.hreflang,
      mainEntity: d.content.faq.map(f => ({ '@type': 'Question', name: plain(f.q), acceptedAnswer: { '@type': 'Answer', text: plain(f.a) } })),
    },
  ];
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2).replace(/<\//g, '<\\/');
}

function expand(template, mode){
  let html = template, guard = 0;
  while (/\{\{>([\w.-]+)\}\}/.test(html)){
    if (++guard > 20) throw new Error('include loop');
    html = html.replace(/\{\{>([\w.-]+)\}\}/g, (m, f) => fs.readFileSync(path.join(SRC, 'partials', f), 'utf8').replace(/\n$/, ''));
  }
  return html.replace(/<!--if:(\w+)-->([\s\S]*?)<!--\/if-->/g, (m, want, body) => want === mode ? body : '');
}

function render(page, l, langs){
  const d = strings(page, l.code), c = d.content;
  const depth = (l.path ? 1 : 0) + (page.slug ? 1 : 0), root = '../'.repeat(depth);
  const href = (lang, p) => (root + lang.path + p.slug) || './';
  const special = {
    lang: l.locale, dir: l.rtl ? 'rtl' : 'ltr', mode: page.mode, root, url: urlOf(l, page), ogLocale: l.og, globe: GLOBE,
    home: href(l, PAGES[0]),
    hreflang: langs.map(x => `<link rel="alternate" hreflang="${x.hreflang}" href="${urlOf(x, page)}">`).join('\n') +
      `\n<link rel="alternate" hreflang="x-default" href="${urlOf(LANGS[0], page)}">`,
    ogAlternates: langs.filter(x => x !== l).map(x => `<meta property="og:locale:alternate" content="${x.og}">`).join('\n'),
    langLinks: langs.map(x => `<li><a href="${href(x, page)}" hreflang="${x.hreflang}" lang="${x.locale}"${x === l ? ' aria-current="page"' : ''}>${load('text', x.code).langName}</a></li>`).join(''),
    toolsNav: PAGES.map(p => `<a href="${href(l, p)}"${p === page ? ' aria-current="page"' : ''}>${d.tools[p.id].name}</a>`).join(''),
    moreTools: PAGES.filter(p => p !== page).map(p => `<a href="${href(l, p)}"><b>${d.tools[p.id].name}</b><span>${d.tools[p.id].desc}</span></a>`).join(''),
    jsonld: jsonLd(l, page, d),
    i18n: JSON.stringify({ locale: l.locale, s: d.js }).replace(/<\//g, '<\\/'),
    steps: c.steps.map(s => `<li><b>${s.title}</b>${s.text}</li>`).join('\n        '),
    features: c.features.map(s => `<article><h3>${s.title}</h3><p>${s.text}</p></article>`).join('\n        '),
    uses: c.uses.map(s => `<div><h3>${s.title}</h3><p>${s.text}</p></div>`).join('\n        '),
    legend: (LEGEND[page.mode] || []).map(([cls, sym], i) => `<li><span class="sw ${cls}">${sym}</span><span>${c.legend[i]}</span></li>`).join('\n        '),
    faq: c.faq.map(f => `<details><summary>${f.q}</summary><p>${f.a}</p></details>`).join('\n      '),
    listCards: page.mode !== 'lists' ? '' : LIST_CARDS.map(k =>
      `<article class="lcard"><div class="lhead"><span class="ldot k-${k}"></span><h3>${d.ui[k]}</h3><span class="lcount" id="c-${k}">0</span>` +
      `<button class="mini" data-copy="${k}" title="${attr(d.ui.copyList)}" aria-label="${attr(d.ui.copyList)}">${ICON_COPY}</button>` +
      `<button class="mini" data-dl="${k}" title="${attr(d.ui.downloadList)}" aria-label="${attr(d.ui.downloadList)}">${ICON_DOWNLOAD}</button></div>` +
      `<textarea id="r-${k}" readonly spellcheck="false" placeholder="${attr(d.ui.none)}" aria-label="${attr(d.ui[k])}"></textarea>` +
      `<p class="ltrunc" id="t-${k}" hidden></p></article>`).join('\n      '),
  };
  const template = expand(fs.readFileSync(path.join(SRC, 'pages', page.template), 'utf8'), page.mode);
  return template.replace(/\{\{(@|attr:)?([\w.]+)\}\}/g, (m, kind, key) => {
    const v = kind === '@' ? special[key] : get(d, key);
    if (v === undefined || typeof v === 'object') throw new Error(`${page.id}/${l.code}: no value for ${m}`);
    return kind === 'attr:' ? attr(v) : v;
  });
}

function sitemap(built){
  const today = new Date().toISOString().slice(0, 10);
  const out = [];
  for (const [page, langs] of built){
    const alts = langs.map(x => `    <xhtml:link rel="alternate" hreflang="${x.hreflang}" href="${urlOf(x, page)}"/>`).join('\n') +
      `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${urlOf(LANGS[0], page)}"/>`;
    for (const l of langs) out.push(`  <url>\n    <loc>${urlOf(l, page)}</loc>\n    <lastmod>${today}</lastmod>\n${alts}\n  </url>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${out.join('\n')}\n</urlset>\n`;
}

/* ---------- main ---------- */
const args = process.argv.slice(2);
if (args[0] === '--check'){
  const codes = args.slice(1).length ? args.slice(1) : LANGS.map(l => l.code);
  let bad = 0;
  for (const code of codes){
    const l = LANGS.find(x => x.code === code);
    if (!l){ console.error(`unknown language: ${code}`); bad++; continue; }
    const errs = [];
    for (const set of SETS) has(set, code) ? errs.push(...validate(set, l)) : errs.push(`${set}/${code}.json is missing`);
    console.log(errs.length ? `✗ ${code}\n  ${errs.join('\n  ')}` : `✓ ${code}`);
    bad += errs.length;
  }
  process.exit(bad ? 1 : 0);
}

const draft = args[0] === '--draft';
const errors = [], built = [];
for (const page of PAGES){
  const langs = LANGS.filter(l => setsFor(page).every(s => has(s, l.code)));
  const missing = LANGS.filter(l => !langs.includes(l)).map(l => l.code);
  if (missing.length){
    if (draft) console.warn(`${page.id}: draft build without ${missing.join(', ')}`);
    else errors.push(`${page.id}: missing translations for ${missing.join(', ')}`);
  }
  for (const l of langs) for (const s of setsFor(page)) if (l.code !== 'en') errors.push(...validate(s, l));
  built.push([page, langs]);
}
const unique = [...new Set(errors)];
if (unique.length){ console.error(unique.join('\n')); process.exit(1); }

let count = 0;
for (const [page, langs] of built){
  for (const l of langs){
    const out = path.join(ROOT, l.path, page.slug, 'index.html');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, render(page, l, langs));
    count++;
  }
}
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap(built));
console.log(`built ${count} pages + sitemap.xml`);
