// End-to-end check in a real Chromium. Needs: npm i -D playwright && npx playwright install chromium
// Run: npm run test:e2e   (set CHROME_PATH to use an existing Chromium)
const { chromium } = require('playwright');
const ROOT = require('path').resolve(__dirname, '..');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push('PAGEERROR ' + e.message)); page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  await page.goto('file://' + ROOT + '/src/index.html');
  await page.evaluate(() => { D.store.mutate(S => { S.meta.onboarded = true; }); document.querySelectorAll('.personalize-onboard,[role=dialog]').forEach(e => e.remove()); D.notes.create('Plan'); D.go('notes'); });
  await page.click('[data-mode="canvas"]'); await page.waitForSelector('.board-tools');
  await page.evaluate(() => D.board.setView({ x: 0, y: 0, k: 1 }));
  const box = await page.locator('.canvas').boundingBox();
  const items = () => page.evaluate(() => JSON.parse(JSON.stringify(D.store.S.board.items)));
  const R = (n, v) => console.log(n.padEnd(36), v);
  const draw = async (x0, y0) => { await page.mouse.move(box.x + x0, box.y + y0); await page.mouse.down(); for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + x0 + i * 12, box.y + y0 + Math.sin(i / 2) * 20); await page.mouse.up(); };

  // ---- pen popover: kinds, palette size, sliders
  await page.click('[data-bt="pen"]');
  R('palette swatches', await page.locator('.bp-pal .sw-dot:not(.sw-wheel)').count());
  R('pen kinds shown', await page.locator('.bp-pen').count());
  await page.click('[data-bp="pentype:highlighter"]');
  R('highlighter default opacity', await page.evaluate(() => document.querySelector('[data-sl="pen.opacity"]').value + '%'));
  await draw(80, 80);
  let it = (await items()).filter(i => i.type === 'stroke').pop(); R('highlighter stroke saved', JSON.stringify({ kind: it.kind, opacity: it.opacity, width: it.width }));
  await page.click('[data-bt="pen"]');
  await page.click('[data-bp="pentype:dashed"]');
  await page.locator('[data-sl="pen.width"]').fill('9');
  await draw(80, 160);
  it = (await items()).filter(i => i.type === 'stroke').pop(); R('dashed + width slider', JSON.stringify({ kind: it.kind, width: it.width, opacity: it.opacity }));

  // ---- colour wheel: open, pick on disc, brightness, hex, recent
  await page.click('[data-bt="pen"]');
  await page.click('.sw-wheel'); await page.waitForSelector('[data-cw-disc]');
  const dr = await page.locator('[data-cw-disc]').boundingBox();
  await page.mouse.click(dr.x + dr.width * 0.5, dr.y + dr.height * 0.12); // top of the disc = red-ish, high saturation
  await page.waitForTimeout(100);
  const c1 = await page.evaluate(() => document.querySelector('[data-cw-hex]').value); R('wheel click (top) gives', c1);
  await page.mouse.click(dr.x + dr.width * 0.88, dr.y + dr.height * 0.5); // right side = ~90deg = green-cyan
  const c2 = await page.evaluate(() => document.querySelector('[data-cw-hex]').value); R('wheel click (right) gives', c2);
  await page.locator('[data-cw-v]').fill('55'); const c3 = await page.evaluate(() => document.querySelector('[data-cw-hex]').value); R('brightness 55% darkens', c3);
  await page.fill('[data-cw-hex]', '#FF6EC7'); await page.keyboard.press('Enter'); await page.locator('[data-cw-hex]').blur();
  await page.waitForTimeout(100);
  await draw(80, 240);
  it = (await items()).filter(i => i.type === 'stroke').pop(); R('stroke uses custom hex', it.color);
  R('recent colours remembered', await page.locator('.bp-rec .sw-dot').count());

  // ---- shape: fill vs border, then selection bar edits
  await page.click('[data-bt="shape"]'); await page.click('[data-bp="kind:ellipse"]'); await page.click('[data-bp="target:border"]'); await page.click('[data-bp="c:#3B5BDB"]');
  await page.click('[data-bp="target:fill"]'); await page.click('[data-bp="c:#F2D13B"]');
  await page.mouse.move(box.x + 500, box.y + 100); await page.mouse.down(); await page.mouse.move(box.x + 640, box.y + 200, { steps: 4 }); await page.mouse.up();
  it = (await items()).filter(i => i.type === 'shape').pop(); R('shape fill/border', `${it.fill} / ${it.border}`);
  R('selection bar visible', await page.locator('[data-bsel]').isVisible());
  await page.click('[data-bsa="style"]'); await page.waitForSelector('.bt-pop:not([hidden])');
  await page.click('[data-bp="c:#E5484D"]');
  it = (await items()).filter(i => i.type === 'shape').pop(); R('selbar recolours selected shape', it.fill);
  await page.keyboard.press('Control+z'); await page.waitForTimeout(150);
  it = (await items()).filter(i => i.type === 'shape').pop(); R('undo brings back old fill', it.fill);
  await page.click('[data-bt="select"]'); await page.mouse.click(box.x + 570, box.y + 150); // reselect shape
  await page.click('[data-bsa="dup"]'); R('duplicate adds a shape', (await items()).filter(i => i.type === 'shape').length);
  await page.click('[data-bsa="del"]'); R('delete removes it', (await items()).filter(i => i.type === 'shape').length);

  // ---- text size/colour, connector style
  await page.click('[data-bt="text"]'); await page.click('[data-bp="tsize:40"]'); await page.click('[data-bp="c:#12A594"]');
  await page.mouse.click(box.x + 230, box.y + 330); await page.waitForSelector('.bd-edit'); await page.keyboard.type('Hello'); await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  it = (await items()).filter(i => i.type === 'text').pop(); R('text size/colour', `${it.size} ${it.color}`);

  // ---- FULL SCREEN + Esc
  await page.click('[data-bt="select"]');
  await page.click('[data-bz="full"]'); await page.waitForTimeout(250);
  R('full screen on (class)', await page.locator('.board-wrap.bd-full').count());
  const fsBox = await page.locator('.board-wrap').boundingBox(); R('fills the window', `${fsBox.width}x${fsBox.height}`);
  R('exit button label', await page.getAttribute('[data-bz="full"]', 'aria-label'));
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  R('Esc leaves full screen', await page.locator('.board-wrap.bd-full').count() === 0);
  // prefs persist
  await page.evaluate(() => D.refresh()); await page.waitForTimeout(150);
  R('prefs saved in store', await page.evaluate(() => JSON.stringify({ k: D.store.S.board.prefs.pen.kind, w: D.store.S.board.prefs.pen.width, recent: D.store.S.board.prefs.recent })));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('TEST CRASH', e); process.exit(1); });
