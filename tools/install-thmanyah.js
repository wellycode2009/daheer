#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const input = process.argv[2] || process.env.THMANYAH_FONT_ZIP || process.env.THMANYAH_FONT_DIR;
if (!input) { console.error('Usage: npm run prepare:arabic -- "/path/to/Thmanyah-Font-Family.zip"'); process.exit(1); }
const target = process.env.DAHEER_THMANYAH_FONT_DIR || path.join(os.homedir(), '.local', 'share', 'daheer', 'thmanyah-fonts');
const families = ['thmanyahsans', 'thmanyahserifdisplay', 'thmanyahseriftext'];
const weights = { thmanyahsans:['Light','Regular','Medium','Bold','Black'], thmanyahserifdisplay:['Light','Regular','Medium','Bold','Black'], thmanyahseriftext:['Light','Regular','Medium','Bold','Black'] };

function copyFrom(root) {
  fs.mkdirSync(target, { recursive: true });
  let n=0;
  for (const fam of families) for (const w of weights[fam]) {
    const name = `${fam}-${w}.woff2`, src = path.join(root, fam, 'woff2', name);
    if (!fs.existsSync(src)) throw new Error(`Missing ${name}`);
    fs.copyFileSync(src, path.join(target, name)); n++;
  }
  return n;
}

const st = fs.statSync(input);
if (st.isDirectory()) { console.log(`Installed ${copyFrom(input)} Thmanyah weights to ${target}`); process.exit(0); }
if (!/\.zip$/i.test(input)) throw new Error('Input must be a Thmanyah font directory or .zip file');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'daheer-thmanyah-'));
try { execFileSync('unzip',['-q','-o',input,'-d',tmp],{stdio:'inherit'}); const root = path.join(tmp,'thmanyah typeface'); console.log(`Installed ${copyFrom(root)} Thmanyah weights to ${target}`); } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
