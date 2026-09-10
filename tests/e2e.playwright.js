/* MDgen end-to-end test (optional, for contributors).
 *
 *   cd MDgen && python3 -m http.server 8000          # serve the app
 *   cd tests && npm init -y && npm i playwright-core
 *   npx playwright-core install chromium --only-shell
 *   node e2e.playwright.js                            # set APP_URL to override
 *
 * Validates the real browser pipeline: vendored tesseract worker + WASM core +
 * bundled eng model, OCR → Markdown, cleanup, compact, preview, CSV, TXT, PDF.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const APP = process.env.APP_URL || 'http://localhost:8000/';
const FIX = p => path.join(__dirname, 'fixtures', p);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const results = [];
  const check = (name, cond) => { results.push([name, !!cond]); console.log((cond ? 'PASS ' : 'FAIL ') + name); };

  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#dropCard', { state: 'visible', timeout: 10000 });

  /* 1 — image → local OCR */
  await page.setInputFiles('#fileInput', FIX('screen.png'));
  await page.waitForSelector('#studio:not([hidden])', { timeout: 120000 });
  await page.waitForSelector('#queueSection', { state: 'hidden', timeout: 120000 });
  let md = await page.$eval('#editor', el => el.value);
  check('image: front matter', md.startsWith('---'));
  check('image: H1 from geometry', /^# QUARTERLY SALES REPORT/m.test(md));
  check('image: bullets', /^- Launch two new pricing tiers/m.test(md));
  check('image: table', /\| Region\s*\|\s*Revenue\s*\|/.test(md));

  const before = await page.$eval('#statTokens', el => el.textContent);
  await page.click('#btnTables');
  await page.click('#btnCompact');
  const after = await page.$eval('#statTokens', el => el.textContent);
  console.log(`  tokens: ${before} -> ${after}`);
  await page.click('#tabPreview');
  const html = await page.$eval('#preview', el => el.innerHTML);
  check('image: preview renders GFM', /<table|<h1/.test(html));

  /* 2 — CSV → table */
  const tmpCsv = path.join(__dirname, '_tmp.csv');
  fs.writeFileSync(tmpCsv, 'city,pop\nNYC,8335897\n');
  await page.click('#resetBtn');
  await page.setInputFiles('#fileInput', tmpCsv);
  await page.waitForSelector('#studio:not([hidden])', { timeout: 30000 });
  md = await page.$eval('#editor', el => el.value);
  check('csv: table', /\| city\s*\|\s*pop/.test(md) && /NYC/.test(md));
  fs.unlinkSync(tmpCsv);

  /* 3 — scanned PDF (2 pages, render → OCR per page) */
  await page.click('#resetBtn');
  await page.setInputFiles('#fileInput', FIX('scan.pdf'));
  await page.waitForSelector('#studio:not([hidden])', { timeout: 180000 });
  md = await page.$eval('#editor', el => el.value);
  check('pdf: page separators', /## Page 1/.test(md) && /## Page 2/.test(md));
  check('pdf: page 1 OCR', /QUARTERLY SALES REPORT/.test(md));
  check('pdf: page 2 OCR', /NOTES FOR NEXT QUARTER/.test(md));

  console.log('page errors:', errors.length ? errors : 'NONE');
  await browser.close();
  const failed = results.filter(([, v]) => !v).length + errors.length;
  console.log(`\n${results.length} checks, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('E2E ERROR', e); process.exit(2); });
