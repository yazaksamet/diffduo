/* Shared by every page: helpers, translations, toast, language menu, theme. */
const $ = s => document.querySelector(s);
const store = {
  get(k){ try { return localStorage.getItem(k); } catch { return null; } },
  set(k,v){ try { localStorage.setItem(k,v); } catch {} },
  del(k){ try { localStorage.removeItem(k); } catch {} }
};
const esc = s => s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------- translations (filled in by build.js) ---------- */
const I18N = {{@i18n}};
const LOCALE = I18N.locale, plurals = new Intl.PluralRules(LOCALE);
const num = n => n.toLocaleString(LOCALE);
// t('key', { n, name, … }): picks the plural form for n; {n} shows the formatted number unless nHtml overrides it
function t(key, vars = {}, nHtml){
  let s = I18N.s[key];
  if (typeof s === 'object') s = s[plurals.select(vars.n)] || s.other;
  return s.replace(/\{(\w+)\}/g, (m, k) => k === 'n' ? (nHtml ?? num(vars.n)) : k in vars ? vars[k] : m);
}

const ICON_FILE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>';
const MAX_FILE = 50 * 1024 * 1024;   // bytes
const fmtSize = n => n < 1048576 ? `${num(Math.max(1, Math.round(n / 1024)))} KB` : `${(n / 1048576).toLocaleString(LOCALE, { maximumFractionDigits: 1 })} MB`;
function countLines(t){
  if (!t) return 0;
  let c = 1, i = -1;
  while ((i = t.indexOf('\n', i + 1)) !== -1) c++;
  return t.endsWith('\n') ? c - 1 : c;
}
// Reads a dropped/opened file as text; returns null (after telling the user) if it's too big or binary.
async function readTextFile(f){
  if (f.size > MAX_FILE){ toast(t('tooLarge', { name: f.name })); return null; }
  const head = new Uint8Array(await f.slice(0, 8000).arrayBuffer());
  if (head.includes(0)){ toast(t('binary', { name: f.name })); return null; }
  return f.text();
}
async function copyText(text, msg){
  try { await navigator.clipboard.writeText(text); toast(msg); }
  catch { toast(t('noClipboard')); }
}
function downloadText(text, name, type = 'text/plain'){
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toast(msg){
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2200);
}

/* language menu: close on outside click or Escape */
const langMenu = $('#lang');
document.addEventListener('click', e => { if (langMenu.open && !langMenu.contains(e.target)) langMenu.open = false; });
document.addEventListener('keydown', e => { if (e.key === 'Escape') langMenu.open = false; });

/* theme */
const root = document.documentElement;
const savedTheme = store.get('dd.theme');
if (savedTheme) root.dataset.theme = savedTheme;
$('#theme').onclick = () => {
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  store.set('dd.theme', root.dataset.theme);
};
