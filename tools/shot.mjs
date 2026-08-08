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
  while (B.profile.canCreate()) {
    B.profile.createCharacter(B.CLASSES[B.profile.characters.length % B.CLASSES.length].id);
  }
  const charId = B.profile.characters[0].id;
  B.profile.setActive(charId);
  B.menus.selectedChar = charId;
  B.menus.talentChar = charId;
  if (!B.game.running) B.game.startRun(charId);
  B.game.wave = 7;
  B.game.soulsEarned = 420;
  B.profile.data.souls = 250000;
  // Optional: hand the shown class a level and a full set, so gear screens can
  // be photographed in the state that matters rather than empty.
  if (window.__shotGear !== undefined) {
    for (const cd of B.profile.characters) {
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
  await frame.evaluate((n) => { window.__shotBoss = n; }, Number(process.env.SHOT_BOSS || 0));
  await frame.evaluate((v) => { window.__shotStay = v; }, !!process.env.SHOT_STAY);
  await frame.evaluate((id) => {
    const B = window.CRAFTARENA;
    B.menus.show(null);
    B.game.startRaid(B.profile.characters[0].id, B.RAID_BY_ID[id], Number(window.__shotBoss || 0));
  }, process.env.SHOT_RAID);
  await page.waitForTimeout(900);
  // Walk the aim lock onto the boss so the outline is in the shot.
  await frame.evaluate(() => {
    const B = window.CRAFTARENA;
    const b = B.game.raidBoss, p = B.game.player;
    if (window.__shotStay) return;
    // Stand off and look straight at it, so the outline is what the shot is of.
    const dx = b.x - p.x, dz = b.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    // Inside the melee assist's 9-block range, or it never locks on.
    p.x = b.x - dx / d * 6.5; p.z = b.z - dz / d * 6.5;
    p.y = B.game.world.groundAt(p.x, p.z, p.y + 6) + 1;
    p.yaw = Math.atan2(-dx / d, -dz / d);
    p.pitch = 0.1;
    // Let the assist acquire it for itself — aimLock is recomputed every frame,
    // so anything set here is gone before the next one.
    p.aimAssist = true;
  });
  await page.waitForTimeout(200);
  const file = path.join(OUT, `room-${process.env.SHOT_RAID}-${width}x${height}.png`);
  await page.screenshot({ path: file });
  console.log(file);
  await browser.close();
  server.close();
  process.exit(0);
}
// SHOT_ARENA=<layout number> photographs an arena mid-wave instead of a menu.
// Graphics work needs to be looked at in the place people actually spend their
// time, and that is a wave, not a raid room and not the title screen.
if (process.env.SHOT_ARENA !== undefined) {
  await frame.evaluate((layout) => {
    const B = window.CRAFTARENA;
    B.menus.show(null);
    B.game.startRun(B.profile.characters[0].id, { layout });
    B.game.wave = 12;
    // A wave's worth of enemies, spread around, so the shot has a fight in it.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const p = B.game.player;
      B.game.spawnMob(i % 3 === 0 ? 'skele' : i % 3 === 1 ? 'brute' : 'husk',
        p.x + Math.cos(a) * (7 + i), p.y, p.z + Math.sin(a) * (7 + i));
    }
    B.game.player.pitch = -0.05;
  }, Number(process.env.SHOT_ARENA));
  await page.waitForTimeout(1100);
  // SHOT_CAST fires the whole kit and photographs the frame mid-effect, which
  // is the state the effects work is actually about and the one no resting
  // screenshot ever shows.
  if (process.env.SHOT_CAST) {
    await frame.evaluate(() => {
      const B = window.CRAFTARENA;
      const p = B.game.player;
      p.resource = p.resourceMax;
      for (let i = 0; i < p.skills.length; i++) p.cooldowns[i] = 0;
      const input = {
        moveX: 0, moveY: 0, lookX: 0, lookY: 0, attack: true, sprint: false,
        pause: false, skills: [true, true, true, true], potions: [false, false, false],
        ultimate: true,
      };
      for (let f = 0; f < 22; f++) B.game.update(1 / 60, input);
    });
    await page.waitForTimeout(120);
  }
  const file = path.join(OUT, `arena-${process.env.SHOT_ARENA}-${width}x${height}.png`);
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
