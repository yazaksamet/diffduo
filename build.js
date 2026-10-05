#!/usr/bin/env node
/* Builds one static page per language from src/page.html and src/i18n/<code>.json.
   English is served at /, other languages at /<code>/. Also writes sitemap.xml.

   node build.js              validate all translations and build every page
   node build.js --check tr   only validate the given translation(s)
   node build.js --draft      build only the translations that exist so far      */
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

const ROOT = __dirname, SRC = path.join(ROOT, 'src');
const load = code => JSON.parse(fs.readFileSync(path.join(SRC, 'i18n', `${code}.json`), 'utf8'));

/* ---------- validation ---------- */
const tags = s => (s.match(/<\/?[a-z]+/g) || []).sort().join(' ');
const holes = s => (s.match(/\{\w+\}/g) || []).sort().join(' ');
const isPlural = v => v && typeof v === 'object' && !Array.isArray(v) && 'other' in v && 'one' in v;

function validate(lang){
  const en = load('en'), tr = load(lang.code), errors = [];
  const cats = new Intl.PluralRules(lang.locale).resolvedOptions().pluralCategories;
  const walk = (a, b, at) => {
    if (isPlural(a)){
      if (!b || typeof b !== 'object') return errors.push(`${at}: expected plural forms object`);
      for (const c of cats) if (typeof b[c] !== 'string' || !b[c].trim()) errors.push(`${at}.${c}: missing plural form (needed: ${cats.join(', ')})`);
      for (const k of Object.keys(b)) {
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
  return errors;
}

/* ---------- rendering ---------- */
const attr = s => String(s).replace(/<[^>]+>/g, '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const plain = s => String(s).replace(/<[^>]+>/g, '');
const get = (obj, key) => key.split('.').reduce((o, k) => o == null ? o : o[k], obj);
const urlOf = l => SITE + l.path;
const GLOBE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';

function jsonLd(l, t){
  const url = urlOf(l);
  const graph = [
    { '@type': 'WebSite', '@id': SITE + '#website', url: SITE, name: 'DiffDuo' },
    {
      '@type': 'WebApplication', '@id': url + '#app', name: t.meta.appName, url, inLanguage: l.hreflang,
      applicationCategory: 'DeveloperApplication', operatingSystem: 'Any', browserRequirements: 'Requires JavaScript',
      isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      image: SITE + 'og-image.png', screenshot: SITE + 'og-image.png',
      description: t.meta.appDescription, featureList: t.meta.featureList,
    },
    {
      '@type': 'FAQPage', '@id': url + '#faq', inLanguage: l.hreflang,
      mainEntity: t.content.faq.map(f => ({ '@type': 'Question', name: plain(f.q), acceptedAnswer: { '@type': 'Answer', text: plain(f.a) } })),
    },
  ];
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2).replace(/<\//g, '<\\/');
}

function render(template, l, names){
  const t = load(l.code), root = l.path ? '../' : '', c = t.content;
  const href = target => (root + target.path) || './';
  const special = {
    lang: l.locale, dir: l.rtl ? 'rtl' : 'ltr', root, url: urlOf(l), ogLocale: l.og, globe: GLOBE,
    hreflang: LANGS.map(x => `<link rel="alternate" hreflang="${x.hreflang}" href="${urlOf(x)}">`).join('\n') +
      `\n<link rel="alternate" hreflang="x-default" href="${SITE}">`,
    ogAlternates: LANGS.filter(x => x !== l).map(x => `<meta property="og:locale:alternate" content="${x.og}">`).join('\n'),
    langLinks: LANGS.map(x => `<li><a href="${href(x)}" hreflang="${x.hreflang}" lang="${x.locale}"${x === l ? ' aria-current="page"' : ''}>${names[x.code]}</a></li>`).join(''),
    jsonld: jsonLd(l, t),
    i18n: JSON.stringify({ locale: l.locale, s: t.js }).replace(/<\//g, '<\\/'),
    steps: c.steps.map(s => `<li><b>${s.title}</b>${s.text}</li>`).join('\n        '),
    features: c.features.map(s => `<article><h3>${s.title}</h3><p>${s.text}</p></article>`).join('\n        '),
    uses: c.uses.map(s => `<div><h3>${s.title}</h3><p>${s.text}</p></div>`).join('\n        '),
    legend: c.legend.map((s, i) => `<li><span class="sw ${['sw-del', 'sw-add', 'sw-word', 'sw-hunk'][i]}">${['−', '+', 'ab', '@@'][i]}</span><span>${s}</span></li>`).join('\n        '),
    faq: c.faq.map(f => `<details><summary>${f.q}</summary><p>${f.a}</p></details>`).join('\n      '),
  };
  return template.replace(/\{\{(@|attr:)?([\w.]+)\}\}/g, (m, kind, key) => {
    const v = kind === '@' ? special[key] : get(t, key);
    if (v === undefined || typeof v === 'object') throw new Error(`${l.code}: no value for ${m}`);
    return kind === 'attr:' ? attr(v) : v;
  });
}

function sitemap(){
  const today = new Date().toISOString().slice(0, 10);
  const alts = LANGS.map(x => `    <xhtml:link rel="alternate" hreflang="${x.hreflang}" href="${urlOf(x)}"/>`).join('\n') +
    `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    LANGS.map(l => `  <url>\n    <loc>${urlOf(l)}</loc>\n    <lastmod>${today}</lastmod>\n${alts}\n  </url>`).join('\n') + '\n</urlset>\n';
}

/* ---------- main ---------- */
const args = process.argv.slice(2);
if (args[0] === '--check'){
  const codes = args.slice(1).length ? args.slice(1) : LANGS.map(l => l.code);
  let bad = 0;
  for (const code of codes){
    const l = LANGS.find(x => x.code === code);
    if (!l){ console.error(`unknown language: ${code}`); bad++; continue; }
    const errs = validate(l);
    console.log(errs.length ? `✗ ${code}\n  ${errs.join('\n  ')}` : `✓ ${code}`);
    bad += errs.length;
  }
  process.exit(bad ? 1 : 0);
}

const available = LANGS.filter(l => fs.existsSync(path.join(SRC, 'i18n', `${l.code}.json`)));
const missing = LANGS.filter(l => !available.includes(l)).map(l => l.code);
if (args[0] === '--draft'){
  // preview while translations are in progress: build only the languages that exist
  if (missing.length) console.warn(`draft build without: ${missing.join(', ')}`);
  LANGS.splice(0, LANGS.length, ...available);
} else if (missing.length){ console.error(`missing translations: ${missing.join(', ')}`); process.exit(1); }
const problems = available.map(l => [l.code, validate(l)]).filter(([, e]) => e.length);
if (problems.length){
  for (const [code, e] of problems) console.error(`✗ ${code}\n  ${e.join('\n  ')}`);
  process.exit(1);
}
const template = fs.readFileSync(path.join(SRC, 'page.html'), 'utf8');
const names = Object.fromEntries(LANGS.map(l => [l.code, load(l.code).langName]));
for (const l of LANGS){
  const out = path.join(ROOT, l.path, 'index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, render(template, l, names));
}
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap());
console.log(`built ${LANGS.length} pages + sitemap.xml`);
