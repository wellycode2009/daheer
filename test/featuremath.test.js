// i18n completeness: English must define every key used in code, and no other language may define keys English lacks.
const { spawnSync } = require('child_process');
const r = spawnSync(process.execPath, [require('path').join(__dirname, '..', 'tools', 'check-i18n.js')], { stdio: 'inherit' });
process.exit(r.status);
