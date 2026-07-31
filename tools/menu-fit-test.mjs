// Every menu must fit the viewport. The game claims nothing scrolls; this is
// what makes that a checked property rather than a hope.
//
// For each viewport size it opens every screen, asserts the UI layer is not
// scrollable, and asserts the primary action of that screen is inside the
// visible area — a screen that fits only because it was scaled into the
// bottom bezel is not actually usable.
//
//   node tools/menu-fit-test.mjs
//
// Requires playwright-core and the bundled fragment (npm run build:fragment).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRAGMENT = path.join(ROOT, 'dist/craftarena-fragment.html');

const require_ = createRequire(import.meta.url);
async function loadChromium() {
  const roots = [
    process.env.PW_MODULES,
    ROOT,
    process.env.SCRATCHPAD,
    '/tmp/claude-0/-home-user-claudekk/6e1ff4ef-d006-50e3-98cf-f197651cae20/scratchpad',
  ].filter(Boolean);
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
      res.end(fs.readFileSync(FRAGMENT));
      return;
    }
    if (url === '/' || url === '/host.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(HOST_HTML);
      return;
    }
    res.writeHead(404).end('not found');
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/** Every screen, including the three that only appear during a run. */
const SCREENS = [
  'title', 'roster', 'classes', 'loadout', 'talents', 'forge', 'armoury',
  'potions', 'raids', 'raid',
  'stats', 'settings', 'howto', 'diag',
  'pause', 'upgrade', 'results', 'raidkill', 'raidwipe',
];

/**
 * The in-run overlays need a live run behind them. Starting one directly is
 * far more reliable than driving the menus, and it is the same call the PLAY
 * button makes.
 */
function primeRun() {
  const B = window.CRAFTARENA;
  // A full roster, because the character pickers that head the Forge, the
  // Armoury, the Talents and the Potion Shop wrap once they run out of width —
  // and a wrapped pill under the fixed corner control looks placed and cannot
  // be tapped. Measuring one character proves nothing about eight.
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
  // A seven-figure balance is the widest the souls badge ever gets, and width
  // is the whole question for the corner it shares with the fullscreen button.
  // Measuring it at "0 Souls" proves nothing about the account that has played.
  B.profile.data.souls = 2500000;
  // The pause screen lists the wave's affixes with a blurb and a counterplay
  // line each. Three is the maximum a wave can carry and therefore the only
  // version worth measuring — a screen that fits with one proves nothing.
  B.game.affixes = B.AFFIXES.slice(0, 3);
  B.game.offerUpgrades();
  B.game.result = {
    reachedWave: 7, wave: 6, kills: 88, souls: 420, duration: 305, damageDealt: 12345,
  };

  // The raid screens, primed to their widest case rather than their middle
  // one, for the same reason the souls badge is measured at seven figures:
  //   longest raid name   Icecrown Citadel
  //   longest boss name   High Warlord Naj'entus, which is also the FIGHT label
  //   longest lock reason "Buy the full T4 set first — 6 pieces short."
  //   longest Core chip   T6 Trinket Core
  // Black Temple at level 41 with no T4 gear is shut on the *set* gate, which
  // is the longest sentence raidAccess ever writes.
  B.menus.raidId = 'blacktemple';
  B.profile.character(charId).xp = 3.2e6;           // comfortably past level 41
  const st = B.profile.raidState(charId);
  for (const b of B.RAID_BY_ID.zulgurub.bosses) st.killed[b.id] = true;
  st.killed.najentus = true;      // one Core taken, so both row states draw
  // The between-fights window reads the live game, so it needs one.
  B.game.mode = 'raid';
  B.game.raid = B.RAID_BY_ID.blacktemple;
  B.game.raidBossIndex = 0;
  B.game.lastBoss = B.RAID_BY_ID.blacktemple.bosses[0];
}

const VIEWPORTS = [
  { name: 'phone portrait', width: 390, height: 844 },
  { name: 'phone landscape', width: 844, height: 390 },
  { name: 'small portrait', width: 320, height: 568 },
  { name: 'small landscape', width: 667, height: 375 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'desktop', width: 1440, height: 900 },
];

/**
 * Measured inside the frame. A screen passes when the UI layer has nothing to
 * scroll to and every button's centre lands inside the viewport.
 */
function probeScreen(name) {
  const B = window.CRAFTARENA;
  B.menus.show(name);
  const ui = document.getElementById('ui');
  const vw = window.innerWidth, vh = window.innerHeight;
  // Measured from bounding rects, not scrollHeight: Chromium's scrollHeight
  // is pure layout and ignores the fit-to-screen transform entirely, so it
  // reports overflow on a screen that is visibly, provably on screen.
  const screenEl = ui.firstElementChild;
  const box = screenEl.getBoundingClientRect();
  const overflowY = Math.round(Math.max(0, box.bottom - vh) + Math.max(0, -box.top));
  const overflowX = Math.round(Math.max(0, box.right - vw) + Math.max(0, -box.left));
  const offscreen = [];
  for (const b of ui.querySelectorAll('button, a.ghost-btn, .class-card, .skill-card, .upgrade-card')) {
    const r = b.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;      // display:none
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cy < 0 || cy > vh || cx < 0 || cx > vw) {
      offscreen.push(`${(b.textContent || b.className).trim().slice(0, 24)}@${Math.round(cx)},${Math.round(cy)}`);
    }
  }
  // Icons must be *in the layout*, not merely in the DOM. A bare `canvas`
  // selector meant for the game surfaces yanked every menu icon out of flow
  // and stretched it across the screen behind the UI: present in the DOM,
  // invisible on screen, and the picker read as plain text.
  const icons = [...ui.querySelectorAll('.skill-slot canvas, .kit-icon canvas, .forge-icon canvas')];
  const brokenIcons = [];
  for (const cv of icons) {
    const r = cv.getBoundingClientRect();
    // No box at all means an ancestor is display:none — the short-screen
    // layouts hide the class detail on purpose. Deliberately hidden is not
    // the same as torn out of the layout.
    if (r.width === 0 && r.height === 0) continue;
    const pos = getComputedStyle(cv).position;
    if (pos === 'fixed' || pos === 'absolute' || r.width < 8 || r.height < 8
      || r.width > 400 || r.height > 400) {
      brokenIcons.push(`${pos} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
  }

  // The fullscreen / pop-out control is position:fixed, so it is invisible to
  // the menus' flex layout and can sit straight on top of a corner element
  // that looks perfectly placed in the layout tree.
  // Both are checked, not the first one found: an embed that cannot go
  // fullscreen leaves #fullscreen-btn in the DOM at display:none and adds
  // #popout-btn beside it, so picking one and testing its visibility silently
  // skipped the control that was actually on screen.
  const covered = [];
  const corners = ['fullscreen-btn', 'popout-btn']
    .map((id) => document.getElementById(id))
    .filter((e) => e && getComputedStyle(e).display !== 'none');
  for (const corner of corners) {
    const c = corner.getBoundingClientRect();
    for (const e of ui.querySelectorAll('.souls-badge, .back-bar button, .back-bar a')) {
      const r = e.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const overlap = Math.max(0, Math.min(r.right, c.right) - Math.max(r.left, c.left))
        * Math.max(0, Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top));
      if (overlap > 4) covered.push((e.textContent || e.className).trim().slice(0, 24));
    }
  }

  // How hard the safety net had to work. Anything under MIN_SCALE means the
  // screen does not really fit — it was shrunk until it did, and shrunk text
  // on a phone is its own failure.
  const m = /scale\(([\d.]+)\)/.exec(screenEl.style.transform || '');
  return {
    overflowY,
    overflowX,
    offscreen,
    scale: m ? Number(m[1]) : 1,
    buttons: ui.querySelectorAll('button').length,
    icons: icons.length,
    brokenIcons,
    covered,
  };
}

const MIN_SCALE = 0.8;

const results = [];
let failures = 0;

async function run() {
  if (!fs.existsSync(FRAGMENT)) {
    console.error('Missing dist/craftarena-fragment.html — run: npm run build:fragment');
    process.exit(1);
  }
  const chromium = await loadChromium();
  const { server, port } = await startServer();
  const browser = await chromium.launch({ executablePath: CHROME, args: LAUNCH_ARGS });

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: vp.width < 900,
    });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
    const frame = page.frames().find((f) => f !== page.mainFrame());
    await frame.waitForFunction(() => !!window.CRAFTARENA, null, { timeout: 20000 });
    await frame.evaluate(primeRun);

    console.log(`\n=== ${vp.name}  ${vp.width}x${vp.height} ===`);
    for (const name of SCREENS) {
      const r = await frame.evaluate(probeScreen, name);
      // One CSS pixel of slack: sub-pixel layout rounding is not a scrollbar.
      const ok = r.overflowY <= 1 && r.overflowX <= 1 && r.offscreen.length === 0
        && r.scale >= MIN_SCALE && r.brokenIcons.length === 0 && r.covered.length === 0;
      if (!ok) failures++;
      results.push({ vp: vp.name, name, ok });
      const fit = r.scale < 1 ? ` (scaled to ${r.scale.toFixed(2)})` : '';
      const detail = ok
        ? `${r.buttons} controls${r.icons ? `, ${r.icons} icons` : ''}, fits${fit}`
        : [
          r.overflowY > 1 ? `${r.overflowY}px below the fold` : '',
          r.overflowX > 1 ? `${r.overflowX}px past the edge` : '',
          r.scale < MIN_SCALE ? `had to shrink to ${r.scale.toFixed(2)}` : '',
          r.offscreen.length ? `offscreen: ${r.offscreen.join(', ')}` : '',
          r.brokenIcons.length ? `icons out of layout: ${r.brokenIcons.slice(0, 3).join(', ')}` : '',
          r.covered.length ? `hidden under the corner button: ${r.covered.join(', ')}` : '',
        ].filter(Boolean).join('; ');
      console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name.padEnd(10)} ${detail}`);
    }
    await context.close();
  }

  await browser.close();
  server.close();

  console.log(`\n================ SUMMARY ================`);
  console.log(`${results.length - failures}/${results.length} screen layouts fit`);
  process.exit(failures ? 1 : 0);
}

run().catch((err) => { console.error(err); process.exit(1); });
