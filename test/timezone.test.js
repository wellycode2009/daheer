// Unit test for src/js/timezone.js (the clock logic behind the desk time card and the sign-up picker).
// It loads the compiled script with a minimal stand-in for the app namespace.
const fs = require('fs'), path = require('path'), assert = require('assert');
const JS = path.join(__dirname, '..', 'src', 'js');
const win = { D: { t: k => k, esc: s => String(s), icon: () => '', i18n: { lang: 'en' }, store: { S: { settings: { tz: '', clockFormat: 'auto' } } } } };
global.document = { querySelector() { return null; }, querySelectorAll() { return []; } };
for (const f of ['tzdata.js', 'timezone.js']) new Function('window', fs.readFileSync(path.join(JS, f), 'utf8'))(win);
const D = win.D, set = (tz, fmt) => { D.store.S.settings.tz = tz; D.store.S.settings.clockFormat = fmt || 'auto'; };
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok', name); };

ok('zone table is loaded', () => assert(D.tz.count() > 400));
ok('Morocco is in the table with its country name', () => { assert.strictEqual(D.tz.place('Africa/Casablanca'), 'Casablanca, Morocco'); });
ok('old browser zone names are mapped (Asia/Calcutta -> Kolkata)', () => { set('Asia/Calcutta'); assert.strictEqual(D.tz.current(), 'Asia/Kolkata'); });
ok('an invalid stored zone falls back to the system clock', () => { set('Mars/Olympus'); assert.strictEqual(D.tz.current(), ''); });
ok('offsets are right, including half-hour and 45-minute zones', () => {
  const jan = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));
  assert.strictEqual(D.tz.offsetMinutes('Asia/Tokyo', jan), 540);
  assert.strictEqual(D.tz.offsetMinutes('Asia/Kolkata', jan), 330);
  assert.strictEqual(D.tz.offsetMinutes('Asia/Kathmandu', jan), 345);
  assert.strictEqual(D.tz.offsetMinutes('America/New_York', jan), -300);
  assert.strictEqual(D.tz.offsetLabel(330), 'UTC+5:30');
  assert.strictEqual(D.tz.offsetLabel(-300), 'UTC\u22125');
});
ok('daylight saving is respected (London winter vs summer)', () => {
  assert.strictEqual(D.tz.offsetMinutes('Europe/London', new Date(Date.UTC(2026, 0, 15, 12))), 0);
  assert.strictEqual(D.tz.offsetMinutes('Europe/London', new Date(Date.UTC(2026, 6, 15, 12))), 60);
});
ok('D.now() shows the wall clock of the chosen zone', () => {
  set('Asia/Tokyo');
  const real = new Date(), z = win.D.now();
  const tokyo = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).format(real);
  assert.strictEqual(String(z.getHours()).padStart(2, '0') + ':' + String(z.getMinutes()).padStart(2, '0'), tokyo.replace(/^24/, '00'));
});
ok('12-hour and 24-hour display', () => {
  const d = new Date(2026, 5, 1, 15, 7, 0);
  set('', '24'); assert.deepStrictEqual(D.tz.timeParts(d), { hour: '15', min: '07', ap: '' });
  set('', '12'); const p = D.tz.timeParts(d); assert.strictEqual(p.hour, '3'); assert.strictEqual(p.min, '07'); assert(/pm/i.test(p.ap));
  assert.strictEqual(D.tz.timeParts(new Date(2026, 5, 1, 0, 5)).hour, '12'); // midnight is 12, not 0
});
console.log(n + ' timezone checks passed');
