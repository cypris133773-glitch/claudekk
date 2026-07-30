// Screenshot a menu screen at a chosen viewport, for eyeballing visual work.
//
//   node tools/shot.mjs title 1440 900
//   node tools/shot.mjs class,forge,pause 390 844
//
// Writes into the scratchpad, or $SHOT_DIR if set. This is a look-at-it tool,
// not a check — menu-fit-test.mjs is what decides whether a layout is correct.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRAGMENT = path.join(ROOT, 'dist', 'craftarena-fragment.html');
const OUT = process.env.SHOT_DIR || path.join(ROOT, '.shots');

async function loadChromium() {
  const roots = [process.env.PW_MODULES, ROOT, process.env.SCRATCHPAD].filter(Boolean);
  for (const r of roots) {
    try {
      const p = require_.resolve('playwright-core', { paths: [r] });
      const m = await import(`file://${p}`);
      const c = m.chromium || (m.default && m.default.chromium);
      if (c) return c;
    } catch { /* try the next root */ }
  }
  throw new Error('playwright-core not found; set PW_MODULES');
}

const CHROME = process.env.CHROME_PATH
  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const LAUNCH_ARGS = [
  '--use-gl=swiftshader', '--enable-unsafe-swiftshader',
  '--no-sandbox', '--disable-dev-shm-usage',
];

const HOST_HTML = `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>host</title>
<style>html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#000}
#f{position:absolute;inset:0;width:100%;height:100%;border:0;display:block}</style>
</head><body>
<iframe id="f" src="/game.html" sandbox="allow-scripts"></iframe>
</body></html>`;

function startServer() {
  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    if (url === '/game.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(FRAGMENT, 'utf8'));
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(HOST_HTML);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function prime() {
  const B = window.CRAFTARENA;
  const cls = B.CLASSES[0];
  if (!B.game.running) B.game.startRun(cls);
  B.game.wave = 7;
  B.game.soulsEarned = 420;
  B.profile.data.souls = 250000;
  // Optional: hand the shown class a level and a full set, so gear screens can
  // be photographed in the state that matters rather than empty.
  if (window.__shotGear !== undefined) {
    for (const c of B.CLASSES) {
      const cd = B.profile.data.classes[c.id];
      cd.xp = 1e9;
      cd.gear = {};
      for (const s of B.GEAR_SLOT_IDS) cd.gear[s] = window.__shotGear;
    }
  }
  B.game.affixes = B.AFFIXES.slice(0, 3);
  // Land on the branch/tab worth looking at rather than the default first one.
  if (window.__shotTab !== undefined) B.menus.talentBranch = window.__shotTab;
  B.game.offerUpgrades();
  B.game.result = {
    reachedWave: 7, wave: 6, kills: 88, souls: 420, duration: 305, damageDealt: 12345,
  };
}

const screens = (process.argv[2] || 'title').split(',');
const width = Number(process.argv[3] || 1440);
const height = Number(process.argv[4] || 900);

const chromium = await loadChromium();
const { server, port } = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: LAUNCH_ARGS });
const context = await browser.newContext({
  viewport: { width, height }, deviceScaleFactor: 2,
  hasTouch: width < 900, isMobile: width < 900,
});
const page = await context.newPage();
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
const frame = page.frames().find((f) => f !== page.mainFrame());
await frame.waitForFunction(() => !!window.CRAFTARENA, null, { timeout: 20000 });
if (process.env.SHOT_GEAR !== undefined) {
  await frame.evaluate((t) => { window.__shotGear = t; }, Number(process.env.SHOT_GEAR));
}
if (process.env.SHOT_TAB !== undefined) {
  await frame.evaluate((t) => { window.__shotTab = t; }, Number(process.env.SHOT_TAB));
}
await frame.evaluate(prime);

fs.mkdirSync(OUT, { recursive: true });
// SHOT_RAID=<raid id> photographs the room itself rather than a menu: start the
// raid, close the menus, and let a few frames run so the fog and the boss are
// where they will be when a player walks in.
if (process.env.SHOT_RAID) {
  await frame.evaluate((id) => {
    const B = window.CRAFTARENA;
    B.menus.show(null);
    B.game.startRaid(B.CLASSES[0], B.RAID_BY_ID[id], 0);
  }, process.env.SHOT_RAID);
  await page.waitForTimeout(900);
  const file = path.join(OUT, `room-${process.env.SHOT_RAID}-${width}x${height}.png`);
  await page.screenshot({ path: file });
  console.log(file);
  await browser.close();
  server.close();
  process.exit(0);
}
for (const name of screens) {
  await frame.evaluate((n) => window.CRAFTARENA.menus.show(n), name);
  // Let the entry fade settle so the shot is of the resting state.
  await page.waitForTimeout(450);
  const file = path.join(OUT, `${name}-${width}x${height}.png`);
  await page.screenshot({ path: file });
  console.log(file);
}

await browser.close();
server.close();
