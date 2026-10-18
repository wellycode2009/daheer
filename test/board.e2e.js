// End-to-end check in a real Chromium. Needs: npm i -D playwright && npx playwright install chromium
// Run: npm run test:e2e   (set CHROME_PATH to use an existing Chromium)
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  await page.goto('file://' + require('path').resolve(__dirname, '..', 'src', 'index.html'));
  await page.evaluate(() => { D.store.mutate(S => { S.meta.onboarded = true; }); document.querySelectorAll('.personalize-onboard, .modal-back, [role=dialog]').forEach(e => e.remove()); });
  await page.evaluate(() => { D.notes.create('Plan'); D.notes.create('Ideas'); });
  await page.evaluate(() => D.go('notes'));
  await page.click('[data-mode="canvas"]');
  await page.waitForSelector('.board-tools');
  const R = async (name, v) => console.log(name.padEnd(34), v);
  await page.evaluate(() => D.board.setView({ x: 0, y: 0, k: 1 }));
  const box = await page.locator('.canvas').boundingBox();
  const at = (x, y) => [box.x + x, box.y + y];
  const items = () => page.evaluate(() => JSON.parse(JSON.stringify(D.store.S.board.items)));

  await R('toolbar buttons', await page.locator('.board-tools [data-bt]').count());
  

  // PEN
  await page.click('[data-bt="pen"]');
  await R('pen popover visible', await page.locator('.bt-pop').isVisible());
  await page.click('[data-bp="c:#3E9FDB"]');
  await page.mouse.move(...at(700, 120)); await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(box.x + 700 + i * 8, box.y + 120 + Math.sin(i / 3) * 30);
  await page.mouse.up();
  let it = await items(); await R('stroke committed', it.filter(i => i.type === 'stroke').length + ' pts=' + (it[0] && it[0].pts.length));

  // SHAPE
  await page.click('[data-bt="shape"]'); await page.click('[data-bp="kind:ellipse"]');
  await page.mouse.move(...at(700, 260)); await page.mouse.down(); await page.mouse.move(...at(820, 340), { steps: 5 }); await page.mouse.up();
  it = await items(); const sh = it.find(i => i.type === 'shape'); await R('shape committed', JSON.stringify(sh && { k: sh.kind, w: sh.w, h: sh.h }));
  await R('tool back to select', await page.getAttribute('.canvas', 'data-tool'));

  // FRAME
  await page.click('[data-bt="frame"]');
  await page.mouse.move(...at(20, 20)); await page.mouse.down(); await page.mouse.move(...at(620, 380), { steps: 5 }); await page.mouse.up();
  it = await items(); const fr = it.find(i => i.type === 'frame'); await R('frame committed', JSON.stringify(fr && { t: fr.title, w: fr.w, h: fr.h }));

  // TEXT (click then type)
  await page.click('[data-bt="text"]'); await page.mouse.click(...at(700, 420));
  await page.waitForSelector('.bd-edit'); await page.keyboard.type('Hello board'); await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  it = await items(); const tx = it.find(i => i.type === 'text'); await R('text committed', tx && tx.text);

  // CONNECTOR from card to shape
  const cards = await page.locator('.cv').count(); await R('page cards', cards);
  const c0 = await page.locator('.cv').first().boundingBox();
  await page.click('[data-bt="connector"]');
  await page.mouse.move(c0.x + 40, c0.y + 30); await page.mouse.down(); await page.mouse.move(...at(760, 300), { steps: 6 }); await page.mouse.up();
  it = await items(); const cn = it.find(i => i.type === 'connector'); await R('connector committed', JSON.stringify(cn && { from: cn.from, to: cn.to, style: cn.style }));
  await R('connector drawn in svg', await page.locator('[data-bd-conn] path').count());

  // SELECT + MOVE the shape, then UNDO
  await page.click('[data-bt="select"]');
  const before = (await items()).find(i => i.type === 'shape');
  await page.mouse.move(...at(before.x + 5, before.y + before.h / 2)); await page.mouse.down(); await page.mouse.move(...at(before.x + 85, before.y + 60), { steps: 5 }); await page.mouse.up();
  const after = (await items()).find(i => i.type === 'shape'); await R('shape moved', `${before.x},${before.y} -> ${after.x},${after.y}`);
  await page.keyboard.press('Control+z'); await page.waitForTimeout(150);
  const undone = (await items()).find(i => i.type === 'shape'); await R('undo restores position', `${undone.x},${undone.y}`);

  // ERASER removes the stroke
  await page.click('[data-bt="eraser"]'); await page.mouse.move(...at(700, 120)); await page.mouse.down(); await page.mouse.move(...at(870, 120), { steps: 12 }); await page.mouse.up();
  it = await items(); await R('stroke erased', it.filter(i => i.type === 'stroke').length === 0);

  // NOTE tool creates a page card
  await page.click('[data-bt="note"]'); await page.mouse.click(...at(300, 470)); await page.waitForTimeout(200);
  await R('page cards after Note tool', await page.locator('.cv').count());

  // IMAGE via file input (1x1 png)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.setInputFiles('[data-bfile]', { name: 'a.png', mimeType: 'image/png', buffer: png }); await page.waitForTimeout(400);
  it = await items(); await R('image committed', it.filter(i => i.type === 'image').length);

  // PRESENT
  await page.click('[data-bt="present"]'); await page.waitForTimeout(900);
  await R('presenting class', await page.locator('.board-wrap.presenting').count());
  await R('present counter', await page.locator('[data-bpres-n]').textContent());
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await R('present exited', await page.locator('.board-wrap.presenting').count() === 0);

  // persistence across re-render
  await page.evaluate(() => D.refresh()); await page.waitForTimeout(150);
  await R('items after refresh', (await items()).length + ' svg children=' + await page.locator('[data-bd-main] > *').count());


  // ---- EDGELESS: pan, zoom, negative coordinates, persistence
  const v0 = await page.evaluate(() => D.board.getView());
  await page.click('[data-bt="select"]');
  await page.mouse.move(box.x + 500, box.y + 560); await page.mouse.down(); await page.mouse.move(box.x + 380, box.y + 500, { steps: 6 }); await page.mouse.up();
  const v1 = await page.evaluate(() => D.board.getView()); await R('drag empty space pans', `${v0.x},${v0.y} -> ${v1.x},${v1.y}`);
  await page.mouse.move(box.x + 600, box.y + 300); await page.keyboard.down('Control'); await page.mouse.wheel(0, -200); await page.keyboard.up('Control');
  const v2 = await page.evaluate(() => D.board.getView()); await R('ctrl+wheel zooms in', v2.k.toFixed(2) + ' (was ' + v1.k.toFixed(2) + ')');
  await page.mouse.wheel(0, 120); const v3 = await page.evaluate(() => D.board.getView()); await R('plain wheel pans', `${v2.y.toFixed(0)} -> ${v3.y.toFixed(0)}`);
  await page.click('[data-bz="reset"]'); await R('reset zoom label', await page.locator('[data-bz="reset"]').textContent());
  await page.click('[data-bz="fit"]'); const v4 = await page.evaluate(() => D.board.getView()); await R('fit to content', 'k=' + v4.k.toFixed(2));
  // draw far outside the old 0..N box, at negative world coords
  await page.evaluate(() => D.board.setView({ x: 600, y: 400, k: 1 }));
  await page.click('[data-bt="shape"]'); await page.click('[data-bp="kind:rect"]');
  await page.mouse.move(box.x + 100, box.y + 100); await page.mouse.down(); await page.mouse.move(box.x + 260, box.y + 190, { steps: 4 }); await page.mouse.up();
  const neg = (await items()).filter(i => i.type === 'shape').pop(); await R('shape at negative coords', `${neg.x},${neg.y}`);
  // zoomed drawing keeps world coordinates correct
  await page.evaluate(() => D.board.setView({ x: 0, y: 0, k: 0.5 }));
  await page.click('[data-bt="shape"]'); await page.mouse.move(box.x + 100, box.y + 100); await page.mouse.down(); await page.mouse.move(box.x + 200, box.y + 160, { steps: 4 }); await page.mouse.up();
  const z = (await items()).filter(i => i.type === 'shape').pop(); await R('shape drawn at 50% zoom', `x=${z.x} y=${z.y} w=${z.w} h=${z.h} (expect 200,200,200,120)`);
  // card dragged left of the origin
  await page.evaluate(() => D.board.setView({ x: 400, y: 300, k: 1 }));
  const cb = await page.locator('.cv').first().boundingBox();
  await page.mouse.move(cb.x + 30, cb.y + 20); await page.mouse.down(); await page.mouse.move(cb.x - 300, cb.y - 100, { steps: 6 }); await page.mouse.up();
  const pc = await page.evaluate(() => D.store.S.notes.map(n => n.canvas)); await R('card at negative coords', JSON.stringify(pc.filter(c => c && (c.x < 0 || c.y < 0))));
  await page.evaluate(() => D.board.setView({ x: 123, y: 77, k: 0.8 })); await page.waitForTimeout(600);
  await page.evaluate(() => D.refresh()); await page.waitForTimeout(200);
  await R('view persists across refresh', JSON.stringify(await page.evaluate(() => D.board.getView())));

  // Arabic RTL
  await page.evaluate(() => D.i18n && 0);
  await page.evaluate(() => D.board.setView({ x: 200, y: 120, k: 0.9 })); await page.waitForTimeout(200);
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('TEST CRASH', e); process.exit(1); });
