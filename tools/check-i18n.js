#!/usr/bin/env node
// Reports: keys used in code but undefined in English, keys defined in other languages but missing from English,
// and per-language coverage. Exit code 1 if English is incomplete. Usage: node tools/check-i18n.js
const fs = require('fs'), path = require('path');
const JS = path.join(__dirname, '..', 'src', 'js');
const win = { console }; win.D = {};
const load = f => new Function('window', fs.readFileSync(path.join(JS, f), 'utf8'))(win);
['core.js', 'strings-main.js', 'strings-calc.js', 'strings-tools.js', 'strings-locales.js'].forEach(load);
const S = win.D.strings, en = S.en, enKeys = Object.keys(en);
let bad = 0;
const used = new Set();
const files = fs.readdirSync(JS).filter(f => f.endsWith('.js') && !f.startsWith('strings')).map(f => path.join(JS, f))
  .concat(path.join(__dirname, '..', 'src', 'index.html'));
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bt\(\s*['"]([\w.\-]+)['"]/g)) used.add(m[1]);
  for (const m of src.matchAll(/data-i18n="([\w.\-]+)"/g)) used.add(m[1]);
  for (const m of src.matchAll(/data-i18n-attr="([^"]+)"/g)) m[1].split(';').forEach(p => { const a = p.split(':'); if (a[1]) used.add(a[1].trim()); });
}
const undef = [...used].filter(k => !k.endsWith('.') && !/^key2?$/.test(k) && !(k in en)); // trailing-dot = dynamic prefix (t('sg.' + id)), skipped
if (undef.length) { bad++; console.log('Used in code but missing in English:', undef.join(', ')); }
for (const l of Object.keys(S).filter(l => l !== 'en')) {
  const k = Object.keys(S[l]), extra = k.filter(x => !(x in en));
  if (extra.length) { bad++; console.log(`${l}: keys not in English: ${extra.join(', ')}`); }
  console.log(`${l}: ${k.length}/${enKeys.length} translated (${Math.round(100 * k.length / enKeys.length)}%)`);
}
process.exit(bad ? 1 : 0);
