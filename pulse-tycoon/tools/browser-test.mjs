// Drives the real page in a real browser: nothing in src/ui or src/render is
// reachable from tools/test.js, so this is the only thing that would catch a
// typo in a canvas call or a dead button.
//
//   node tools/browser-test.mjs           # check only
//   SHOT_DIR=/tmp node tools/browser-test.mjs --shots
//
// Set PW_MODULES if playwright lives somewhere unusual.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WANT_SHOTS = process.argv.includes('--shots');
const OUT = process.env.SHOT_DIR || path.join(ROOT, '.shots');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

async function loadChromium() {
  const roots = [
    process.env.PW_MODULES,
    ROOT,
    '/opt/node22/lib/node_modules',
    '/usr/lib/node_modules',
  ].filter(Boolean);
  for (const r of roots) {
    for (const name of ['playwright', 'playwright-core']) {
      try {
        const p = require_.resolve(name, { paths: [r] });
        const m = await import(`file://${p}`);
        const c = m.chromium || (m.default && m.default.chromium);
        if (c) return c;
      } catch {
        /* try the next candidate */
      }
    }
  }
  throw new Error('playwright not found; set PW_MODULES');
}

function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const file = path.join(ROOT, path.normalize(p));
    if (!file.startsWith(ROOT)) return res.writeHead(403).end();
    fs.readFile(file, (err, body) => {
      if (err) return res.writeHead(404).end();
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(body);
    });
  });
  return new Promise((ok) => server.listen(0, () => ok({ server, port: server.address().port })));
}

const failures = [];
function ok(cond, msg) {
  if (!cond) failures.push(msg);
}

const chromium = await loadChromium();
const { server, port } = await serve();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium/chrome-linux/chrome' })
  .catch(() => chromium.launch());

for (const view of [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 820 },
]) {
  const ctx = await browser.newContext({ viewport: { width: view.width, height: view.height } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  // The boot card removes itself only once main.js has run to the end.
  ok((await page.locator('#boot').count()) === 0, `${view.name}: boot overlay never cleared`);
  ok((await page.locator('.station').count()) === 9, `${view.name}: station rows missing`);

  // Tap the coin. The stat readout is the proof it landed.
  const box = await page.locator('#stage').boundingBox();
  for (let i = 0; i < 12; i++) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.52);
  }
  await page.waitForTimeout(250);
  const cash = await page.locator('.stat.big').textContent();
  ok(cash !== '$0', `${view.name}: tapping the coin paid nothing (${cash})`);

  // Buy the first station, then check the row reports a level.
  await page.locator('.station .buy').first().click();
  await page.waitForTimeout(150);
  const level = await page.locator('.station .st-level').first().textContent();
  ok(Number(level) > 0, `${view.name}: buying did not raise the level`);

  // Every tab must build without throwing.
  for (const label of ['Stakes', 'Perks', 'Quests', 'Restake', 'About', 'Empire']) {
    await page.locator('.tab', { hasText: label }).click();
    await page.waitForTimeout(120);
    ok((await page.locator('.panel').count()) === 1, `${view.name}: ${label} panel vanished`);
    if (WANT_SHOTS) {
      fs.mkdirSync(OUT, { recursive: true });
      await page.screenshot({ path: path.join(OUT, `${view.name}-${label.toLowerCase()}.png`) });
    }
  }

  // A page that survives a minute of ticking is a page whose loop is sound.
  await page.waitForTimeout(1200);
  ok(errors.length === 0, `${view.name}: console errors — ${errors.slice(0, 3).join(' | ')}`);
  await ctx.close();
}

await browser.close();
server.close();

if (failures.length) {
  console.error(`\n${failures.length} browser checks failed\n`);
  for (const f of failures) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log('\nbrowser checks passed\n');
