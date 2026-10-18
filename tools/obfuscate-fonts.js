/*
  Packs the Thmanyah Arabic fonts for the app.
  The Thmanyah licence lets you embed the font inside a compiled/packaged product, but not
  ship loose font files. This script XOR-scrambles the ORIGINAL, unmodified .woff2 files
  (no subsetting, no editing) into .dat blobs; js/i18n.js decodes them in memory at runtime.

  Usage:  node tools/obfuscate-fonts.js "/path/to/thmanyah typeface"
  Keep the original font files private: do not commit them or publish them.
*/
const fs = require('fs'), path = require('path');
const src = process.argv[2];
if (!src) { console.error('usage: node tools/obfuscate-fonts.js "<path to the thmanyah typeface folder>"'); process.exit(1); }
const out = path.join(__dirname, '..', 'src', 'assets', 'fonts', 'ar');
const KEY = [0x44, 0x61, 0x68, 0x65, 0x65, 0x72, 0x21, 0x5A]; // must match D.fontKey default in i18n.js
const jobs = [
  ['thmanyahsans', ['Light', 'Regular', 'Medium', 'Bold']],
  ['thmanyahserifdisplay', ['Light', 'Regular', 'Medium', 'Bold']],
  ['thmanyahseriftext', ['Regular', 'Medium']]
];
fs.mkdirSync(out, { recursive: true });
let n = 0;
for (const [fam, weights] of jobs) for (const w of weights) {
  const f = path.join(src, fam, 'woff2', `${fam}-${w}.woff2`);
  const b = fs.readFileSync(f);
  for (let i = 0; i < b.length; i++) b[i] ^= KEY[i % KEY.length];
  fs.writeFileSync(path.join(out, `${fam}-${w}.dat`), b); n++;
}
console.log(`packed ${n} fonts into ${out}`);
