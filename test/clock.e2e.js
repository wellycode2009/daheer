// End-to-end: sign-up (time zone detection, name filter), desk time card, Arabic. Needs: npm i -D playwright && npx playwright install chromium
// Run: npm run test:e2e  (set CHROME_PATH to use an existing Chromium)
const { chromium } = require('playwright');
const ROOT=require('path').resolve(__dirname,'..');
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:1440,height:900},timezoneId:'Africa/Casablanca',locale:'en-US'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
const R=(n,v)=>console.log(n.padEnd(36),v);
await p.goto('file://'+ROOT+'/src/index.html'); await p.waitForTimeout(800);
// name filter now works (it was silently disabled before) and does not reject Hassan
const bad = await p.evaluate(()=>D.blocklist.en[0]); await p.fill('[data-on-name]',bad); await p.click('.personalize-submit'); await p.waitForTimeout(400);
R('blocked word is rejected', await p.evaluate(()=>document.querySelector('.name-error').textContent.length>0)); R('still on sign-up', await p.locator('.personalize-onboard').count());
await p.fill('[data-on-name]','Hassan');
await p.click('.personalize-onboard .tz-input'); await p.waitForSelector('.tz-list:not([hidden])'); await p.fill('.personalize-onboard .tz-input','mor'); await p.waitForTimeout(250);
await p.keyboard.press('Escape'); await p.fill('.personalize-onboard .tz-input',''); await p.click('.personalize-submit'); await p.waitForTimeout(900);
R('name saved with capital', await p.evaluate(()=>D.store.S.settings.name)); R('zone saved (detected default)', await p.evaluate(()=>D.store.S.settings.tz));
await p.evaluate(()=>{D.i18n.setLang('ar'); D.store.mutate(S=>{S.settings.lang='ar';S.settings.digits='arab';},{silent:true}); D.refresh(); D.paintChrome();}); await p.waitForTimeout(700);
R('Arabic title', (await p.textContent('[data-clockcard] h3')).trim()); R('Arabic place', (await p.textContent('.ck-zone')).trim()); R('Arabic % label', (await p.textContent('[data-ck-day]')).trim());
console.log('ERRORS:',errs.length?errs.join('\n'):'none'); await b.close();})().catch(e=>{console.error('CRASH',e);process.exit(1)});
