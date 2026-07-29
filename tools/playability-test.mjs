#!/usr/bin/env node
/**
 * End-to-end playability test for CRAFTARENA on a phone, inside a fully
 * sandboxed iframe.
 *
 *   node tools/playability-test.mjs [--json] [--only=portrait|landscape]
 *                                  [--class=mage] [--headed] [--shots=DIR]
 *
 * Why this exists
 * ---------------
 * Earlier harnesses "passed" while the real game was unplayable, because they
 * cheated in three specific ways. This one refuses all three:
 *
 *   1. No calling game internals. Nothing here calls startRun(), setEnabled(),
 *      _down() or any other function to *make* something happen. The run is
 *      started by clicking the real menu buttons, and every in-game action is a
 *      synthesised touch delivered through CDP Input.dispatchTouchEvent, which
 *      goes through the browser's real hit-testing and event dispatch.
 *
 *   2. No measuring input state. input.state is drained every frame by the
 *      running game loop, so reading it proves nothing. Every assertion here
 *      reads GAME state — player velocity, position, yaw, swing, attackTimer,
 *      cooldowns, onGround, mob count — sampled from a requestAnimationFrame
 *      probe inside the frame so transient values are not missed.
 *
 *   3. No allow-same-origin. The iframe is sandbox="allow-scripts" and nothing
 *      else: opaque origin, no localStorage, no fullscreen, no pointer lock.
 *      That is the hostile host the game actually ships into.
 *
 * Reading window.CRAFTARENA.input.buttonRects to find where the on-screen
 * buttons are drawn is test targeting, not input bypass: it is the same
 * information a player gets from looking at the screen.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRAGMENT = path.join(ROOT, 'dist/craftarena-fragment.html');

// --- options ---------------------------------------------------------------

const argv = process.argv.slice(2);
const opt = (name, dflt = null) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return dflt;
  return hit.includes('=') ? hit.split('=').slice(1).join('=') : true;
};
const JSON_OUT = !!opt('json');
const ONLY = opt('only');
const CLASS_NAME = String(opt('class', 'Mage'));
const HEADED = !!opt('headed');
const SHOTS = opt('shots');

// --- playwright ------------------------------------------------------------

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
  throw new Error('playwright-core not found; set PW_MODULES to a dir containing node_modules/playwright-core');
}

const CHROME = process.env.CHROME_PATH
  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const LAUNCH_ARGS = [
  '--use-gl=swiftshader', '--enable-unsafe-swiftshader',
  '--no-sandbox', '--disable-dev-shm-usage',
];

// --- host page: the game in a locked-down frame -----------------------------

// No allow-same-origin (opaque origin, no storage), no allow attribute
// (no fullscreen, no pointer lock). Exactly what an embed host gives you.
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
      // The shipped fragment, byte for byte. It has no <html>/<head>/<body>;
      // the browser supplies those, which is the whole point of a fragment.
      const body = fs.readFileSync(FRAGMENT);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(body);
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

// --- the in-frame probe ----------------------------------------------------

/**
 * Installed once per run. Samples game state every animation frame and keeps
 * running maxima, so nothing that lives for a single frame can be missed.
 * Read-only: it never writes to the game.
 */
function installProbe() {
  const B = window.CRAFTARENA;
  const blank = () => ({
    frames: 0, t0: performance.now(),
    maxSpeed: 0, maxVy: 0, airFrames: 0, groundFrames: 0,
    maxSwing: 0, attackFires: 0, dmgStart: 0, killsStart: 0,
    cdMax: [0, 0, 0, 0], casts: 0,
    maxMobs: 0, mobsSeen: 0, waveMax: 0, states: [],
    x0: 0, y0: 0, z0: 0, maxDisp: 0, maxRise: 0,
    yaw0: 0, pitch0: 0, maxYawDelta: 0, maxPitchDelta: 0,
    longestFrameMs: 0,
  });
  let P = blank();
  let prevAttack = 0;
  let prevCd = [0, 0, 0, 0];
  let prevFrameAt = performance.now();
  let seenMobs = new WeakSet();

  const snapshot = () => {
    const g = B.game, p = g.player;
    return {
      running: g.running, paused: g.paused, over: g.over,
      wave: g.wave, state: g.director ? g.director.state : null,
      mobs: g.mobs.length, pending: !!g.pendingUpgrades,
      screen: B.menus.screen, enabled: B.input.enabled,
      x: p ? p.x : null, y: p ? p.y : null, z: p ? p.z : null,
      vx: p ? p.vx : null, vy: p ? p.vy : null, vz: p ? p.vz : null,
      yaw: p ? p.yaw : null, pitch: p ? p.pitch : null,
      onGround: p ? p.onGround : null,
      hp: p ? p.hp : null, resource: p ? p.resource : null,
      cooldowns: p ? p.cooldowns.slice() : null,
      swing: p ? p.swing : null, attackTimer: p ? (p.attackTimer || 0) : 0,
      kills: p ? p.kills : 0, damageDealt: p ? p.damageDealt : 0,
      touchMode: !!(window.__hudTouchMode ?? true),
    };
  };

  const tick = () => {
    requestAnimationFrame(tick);
    const now = performance.now();
    const frameMs = now - prevFrameAt;
    prevFrameAt = now;
    const g = B.game, p = g.player;
    if (!p || !g.running) return;
    P.frames++;
    if (P.frames > 3) P.longestFrameMs = Math.max(P.longestFrameMs, frameMs);
    P.maxSpeed = Math.max(P.maxSpeed, Math.hypot(p.vx, p.vz));
    P.maxVy = Math.max(P.maxVy, p.vy);
    if (p.onGround) P.groundFrames++; else P.airFrames++;
    P.maxSwing = Math.max(P.maxSwing, p.swing || 0);
    const at = p.attackTimer || 0;
    if (at > prevAttack + 1e-6) P.attackFires++;
    prevAttack = at;
    for (let i = 0; i < p.cooldowns.length && i < 4; i++) {
      P.cdMax[i] = Math.max(P.cdMax[i], p.cooldowns[i]);
      if (p.cooldowns[i] > prevCd[i] + 1e-6) P.casts++;
      prevCd[i] = p.cooldowns[i];
    }
    P.maxDisp = Math.max(P.maxDisp, Math.hypot(p.x - P.x0, p.z - P.z0));
    P.maxRise = Math.max(P.maxRise, p.y - P.y0);
    P.maxYawDelta = Math.max(P.maxYawDelta, Math.abs(p.yaw - P.yaw0));
    P.maxPitchDelta = Math.max(P.maxPitchDelta, Math.abs(p.pitch - P.pitch0));
    P.maxMobs = Math.max(P.maxMobs, g.mobs.length);
    for (const m of g.mobs) if (!seenMobs.has(m)) { seenMobs.add(m); P.mobsSeen++; }
    P.waveMax = Math.max(P.waveMax, g.wave);
    const st = g.director ? g.director.state : null;
    if (st && P.states[P.states.length - 1] !== st) P.states.push(st);
  };

  window.__PLAYTEST = {
    reset() {
      const s = snapshot();
      P = blank();
      // The identity set must be cleared too, or enemies that spawned before
      // the reset stay marked as seen and mobsSeen can never rise again —
      // which reads as "0 enemies spawned" while several are plainly alive.
      seenMobs = new WeakSet();   // WeakSet has no clear()
      P.x0 = s.x || 0; P.y0 = s.y || 0; P.z0 = s.z || 0;
      P.yaw0 = s.yaw || 0; P.pitch0 = s.pitch || 0;
      P.dmgStart = s.damageDealt; P.killsStart = s.kills;
      prevAttack = s.attackTimer;
      prevCd = (s.cooldowns || [0, 0, 0, 0]).slice();
      prevFrameAt = performance.now();
      return s;
    },
    read() {
      const s = snapshot();
      const elapsed = (performance.now() - P.t0) / 1000;
      return {
        ...P,
        elapsed,
        fps: elapsed > 0 ? P.frames / elapsed : 0,
        dispNow: Math.hypot(s.x - P.x0, s.z - P.z0),
        yawDeltaNow: s.yaw - P.yaw0,
        pitchDeltaNow: s.pitch - P.pitch0,
        dmgDelta: s.damageDealt - P.dmgStart,
        killsDelta: s.kills - P.killsStart,
        now: s,
      };
    },
    rects() {
      const r = B.input.buttonRects;
      return r ? r.map((b) => ({ name: b.name, cx: b.cx, cy: b.cy, r: b.r })) : null;
    },
    env() {
      const view = document.getElementById('view');
      const hud = document.getElementById('hud');
      const boot = document.getElementById('boot');
      return {
        booted: !!window.CRAFTARENA,
        build: (window.CRAFTARENA && window.CRAFTARENA.BUILD) || null,
        error: window.__craftarenaError || null,
        bootVisible: boot ? !boot.classList.contains('hidden') : false,
        bootText: boot ? boot.textContent.trim().slice(0, 200) : null,
        inIframe: window.self !== window.top,
        hasTouchStart: 'ontouchstart' in window,
        maxTouchPoints: navigator.maxTouchPoints,
        dpr: window.devicePixelRatio,
        inner: [window.innerWidth, window.innerHeight],
        viewCss: view ? [view.clientWidth, view.clientHeight] : null,
        viewBuf: view ? [view.width, view.height] : null,
        hudCss: hud ? [hud.clientWidth, hud.clientHeight] : null,
        hudRect: hud ? (({ x, y, width, height }) => ({ x, y, width, height }))(hud.getBoundingClientRect()) : null,
        fullscreenEnabled: document.fullscreenEnabled,
        storageOk: (() => { try { window.localStorage.setItem('__p', '1'); window.localStorage.removeItem('__p'); return true; } catch { return false; } })(),
        pointerLockBlocked: !!(window.CRAFTARENA && window.CRAFTARENA.input.pointerLockBlocked),
        settings: window.CRAFTARENA ? { ...window.CRAFTARENA.profile.settings } : null,
      };
    },
  };
  requestAnimationFrame(tick);
  return true;
}

// --- touch driver ----------------------------------------------------------

/** Multi-touch sequencer over CDP. Nothing else is allowed to move the game. */
class Touch {
  constructor(cdp, ox = 0, oy = 0) {
    this.cdp = cdp;
    this.ox = ox; this.oy = oy;           // iframe offset in top-level coords
    this.points = new Map();
    this.partialEndOk = true;
  }

  _list() {
    return [...this.points.entries()].map(([id, p]) => ({ x: p.x + this.ox, y: p.y + this.oy, id }));
  }

  async _send(type, points) {
    await this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  }

  async down(id, x, y) {
    this.points.set(id, { x, y });
    await this._send('touchStart', this._list());
  }

  async move(id, x, y) {
    this.points.set(id, { x, y });
    await this._send('touchMove', this._list());
  }

  async up(id) {
    this.points.delete(id);
    const remaining = this._list();
    if (!remaining.length) { await this._send('touchEnd', []); return; }
    if (this.partialEndOk) {
      try { await this._send('touchEnd', remaining); return; }
      catch { this.partialEndOk = false; }
    }
    // Fallback for protocol builds that reject a partial release: drop every
    // finger and immediately re-press the ones that are still down.
    await this._send('touchEnd', []);
    await this._send('touchStart', remaining);
  }

  async release() {
    if (this.points.size) { this.points.clear(); await this._send('touchEnd', []); }
  }

  /** A tap: press, hold briefly (a real thumb is never instantaneous), lift. */
  async tap(x, y, holdMs = 90, id = 90) {
    await this.down(id, x, y);
    await sleep(holdMs);
    await this.up(id);
  }

  /** Press, drag to (x2,y2) over `steps` moves, then hold without lifting. */
  async dragHold(id, x1, y1, x2, y2, steps = 8, stepMs = 16) {
    await this.down(id, x1, y1);
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      await this.move(id, x1 + (x2 - x1) * k, y1 + (y2 - y1) * k);
      await sleep(stepMs);
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- results ---------------------------------------------------------------

class Report {
  constructor(label) { this.label = label; this.rows = []; }
  add(name, pass, detail, numbers = {}) {
    this.rows.push({ name, pass, detail, numbers });
    if (!JSON_OUT) {
      const tag = pass === null ? 'SKIP' : pass ? 'PASS' : 'FAIL';
      console.log(`  [${tag}] ${name.padEnd(26)} ${detail}`);
    }
    return pass;
  }
  get failed() { return this.rows.filter((r) => r.pass === false); }
}

const n = (v, d = 2) => (typeof v === 'number' && isFinite(v) ? v.toFixed(d) : String(v));

/** Run context, appended to every measurement: a dead control and a paused
 *  game look identical from the outside, and they are not the same defect. */
const where = (r) => ` [screen=${r.now.screen} paused=${r.now.paused} `
  + `input.enabled=${r.now.enabled} running=${r.now.running} probeFrames=${r.frames}]`;

// --- one viewport run ------------------------------------------------------

async function runViewport(browser, port, vp) {
  const rep = new Report(vp.label);
  if (!JSON_OUT) console.log(`\n=== ${vp.label}  ${vp.width}x${vp.height} dpr${vp.dpr} ===`);

  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dpr,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 '
      + '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  const errors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  const shot = async (name) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, `${vp.label}-${name}.png`) });
  };

  try {
    await page.goto(`http://127.0.0.1:${port}/host.html`, { waitUntil: 'load' });

    // ---- 1. boots inside the sandboxed frame ------------------------------
    let frame = null;
    for (let i = 0; i < 60 && !frame; i++) {
      frame = page.frames().find((f) => f.url().includes('/game.html')) || null;
      if (!frame) await sleep(100);
    }
    if (!frame) {
      rep.add('boot in sandboxed frame', false, 'the iframe never appeared as a frame');
      await ctx.close();
      return rep;
    }

    let booted = true;
    try {
      await frame.waitForFunction(() => !!window.CRAFTARENA, null, { timeout: 20000 });
    } catch { booted = false; }

    await frame.evaluate(installProbe).catch(() => {});
    const env = booted ? await frame.evaluate(() => window.__PLAYTEST.env()) : null;
    await shot('boot');

    rep.add('boot in sandboxed frame', booted,
      booted
        ? `CRAFTARENA live; sandbox opaque origin (localStorage usable: ${env.storageOk}), `
          + `inIframe=${env.inIframe}, canvas ${env.viewCss?.join('x')} css / ${env.viewBuf?.join('x')} buf`
        : 'window.CRAFTARENA never appeared within 20s',
      env || {});
    if (!booted) { await ctx.close(); return rep; }

    rep.add('touch detected', env.hasTouchStart,
      `'ontouchstart' in window = ${env.hasTouchStart}, maxTouchPoints = ${env.maxTouchPoints}, dpr = ${env.dpr}`);

    // ---- 2. menu navigation -----------------------------------------------
    // Menu buttons are DOM. Clicking them is navigation, not gameplay.
    const nav = await frame.evaluate(async (className) => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const hit = (sel, re) => [...document.querySelectorAll(sel)]
        .find((e) => re.test((e.textContent || '').trim()));
      const out = { play: false, cls: false, enter: false, chosen: null };
      const play = hit('button', /^PLAY/);
      if (play) { play.click(); out.play = true; }
      await wait(350);
      const card = hit('.class-card', new RegExp(className, 'i'))
        || document.querySelector('.class-card');
      if (card) {
        out.chosen = (card.querySelector('.class-name') || {}).textContent || null;
        card.click(); out.cls = true;
      }
      await wait(350);
      const enter = hit('button', /ENTER THE ARENA/);
      if (enter) { enter.click(); out.enter = true; }
      return out;
    }, CLASS_NAME);

    let inRun = true;
    try {
      await frame.waitForFunction(
        () => window.CRAFTARENA.game.running && window.CRAFTARENA.input.enabled
          && window.CRAFTARENA.menus.screen === null,
        null, { timeout: 20000 });
    } catch { inRun = false; }
    await shot('ingame');

    const after = await frame.evaluate(() => window.__PLAYTEST.read());
    rep.add('PLAY -> class -> ARENA', inRun && nav.enter,
      inRun
        ? `run live as ${nav.chosen}; screen=${after.now.screen}, input.enabled=${after.now.enabled}`
        : `stuck: running=${after.now.running}, enabled=${after.now.enabled}, screen=${after.now.screen}`,
      { nav });
    if (!inRun) { await ctx.close(); return rep; }

    // ---- geometry ---------------------------------------------------------
    const off = await page.evaluate(() => {
      const r = document.getElementById('f').getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    const cdp = await ctx.newCDPSession(page);
    const touch = new Touch(cdp, off.x, off.y);
    const W = env.inner[0], H = env.inner[1];

    let rects = await frame.evaluate(() => window.__PLAYTEST.rects());
    const byName = (nm) => (rects || []).find((b) => b.name === nm);
    rep.add('on-screen buttons drawn', !!(rects && rects.length),
      rects && rects.length
        ? `${rects.length} hit rects: ${rects.map((b) => `${b.name}@${Math.round(b.cx)},${Math.round(b.cy)}r${Math.round(b.r)}`).join(' ')}`
        : 'input.buttonRects is empty — the HUD registered no touch buttons',
      { rects });

    const clearOf = (x, y) => !(rects || []).some((b) => Math.hypot(x - b.cx, y - b.cy) <= b.r + 12);
    const pickFree = (fx, fy) => {
      for (const dy of [0, -0.1, 0.1, -0.2, 0.2]) {
        const x = W * fx, y = H * (fy + dy);
        if (clearOf(x, y)) return [x, y];
      }
      return [W * fx, H * fy];
    };

    // ---- 3. left half drags the character ---------------------------------
    {
      const [lx, ly] = pickFree(0.25, 0.62);
      let best = null;
      // Two directions, so a wall in front of spawn cannot fake a failure.
      for (const [dx, dy] of [[0, -90], [0, 90], [90, 0]]) {
        await frame.evaluate(() => window.__PLAYTEST.reset());
        await touch.dragHold(1, lx, ly, lx + dx, ly + dy, 8, 16);
        await sleep(700);                      // hold: joystick must stay latched
        const r = await frame.evaluate(() => window.__PLAYTEST.read());
        await touch.up(1);
        await sleep(120);
        if (!best || r.maxDisp > best.maxDisp) best = r;
        if (best.maxSpeed > 0.5 && best.maxDisp > 0.5) break;
      }
      rep.add('move: left-half drag', best.maxSpeed > 0.5 && best.maxDisp > 0.5,
        `peak speed ${n(best.maxSpeed)} blocks/s, moved ${n(best.maxDisp)} blocks over ${n(best.elapsed)}s `
        + `(${n(best.fps, 1)} fps, worst frame ${n(best.longestFrameMs, 0)}ms)`,
        { maxSpeed: best.maxSpeed, maxDisp: best.maxDisp, fps: best.fps });
    }

    // ---- 4. right half turns the view -------------------------------------
    {
      const [rx, ry] = pickFree(0.75, 0.35);
      await frame.evaluate(() => window.__PLAYTEST.reset());
      await touch.dragHold(2, rx, ry, rx - 200, ry, 20, 16);
      await sleep(80);
      const yawR = await frame.evaluate(() => window.__PLAYTEST.read());
      await touch.up(2);
      await sleep(60);
      await frame.evaluate(() => window.__PLAYTEST.reset());
      await touch.dragHold(2, rx, ry, rx, ry - 120, 12, 16);
      await sleep(80);
      const pitchR = await frame.evaluate(() => window.__PLAYTEST.read());
      await touch.up(2);
      await sleep(80);
      rep.add('look: right-half drag', Math.abs(yawR.yawDeltaNow) > 0.25,
        `yaw moved ${n(yawR.yawDeltaNow, 3)} rad over a 200px drag `
        + `(pitch moved ${n(pitchR.pitchDeltaNow, 3)} rad over a 120px drag)`,
        { yawDelta: yawR.yawDeltaNow, pitchDelta: pitchR.pitchDeltaNow });
    }

    // ---- 5. attack button --------------------------------------------------
    {
      const b = byName('attack');
      if (!b) {
        rep.add('attack button', false, 'no "attack" hit rect exists in input.buttonRects');
      } else {
        await frame.evaluate(() => window.__PLAYTEST.reset());
        await touch.tap(b.cx, b.cy, 120, 3);
        await sleep(400);
        const r = await frame.evaluate(() => window.__PLAYTEST.read());
        rep.add('attack: tap ⚔ button', r.attackFires > 0 || r.maxSwing > 0,
          `attackTimer resets ${r.attackFires}, peak swing ${n(r.maxSwing)}, `
          + `damage dealt ${n(r.dmgDelta, 1)}`,
          { attackFires: r.attackFires, maxSwing: r.maxSwing, dmg: r.dmgDelta });
      }
    }

    // ---- 6. skill buttons --------------------------------------------------
    {
      const before = await frame.evaluate(() => window.__PLAYTEST.reset());
      const results = [];
      for (let i = 0; i < 4; i++) {
        const b = byName('skill' + i);
        if (!b) { results.push({ i, found: false }); continue; }
        await frame.evaluate(() => window.__PLAYTEST.reset());
        await touch.tap(b.cx, b.cy, 110, 4 + i);
        await sleep(320);
        const r = await frame.evaluate(() => window.__PLAYTEST.read());
        results.push({ i, found: true, cdMax: r.cdMax[i], cdNow: r.now.cooldowns[i], resource: r.now.resource });
      }
      const anyCd = results.filter((r) => r.found && r.cdMax > 0);
      rep.add('skill: tap skill pad', anyCd.length > 0,
        results.map((r) => r.found
          ? `skill${r.i} cd ${n(r.cdMax, 1)}s`
          : `skill${r.i} MISSING`).join(', ')
        + ` (resource ${n(before.resource, 0)})`,
        { results });
    }

    // ---- 7. jump button ----------------------------------------------------
    {
      const b = byName('jump');
      if (!b) {
        rep.add('jump button', false, 'no "jump" hit rect exists in input.buttonRects');
      } else {
        await frame.evaluate(() => window.__PLAYTEST.reset());
        await touch.tap(b.cx, b.cy, 150, 8);
        await sleep(900);
        const r = await frame.evaluate(() => window.__PLAYTEST.read());
        rep.add('jump: tap ⤒ button', r.airFrames > 2 && (r.maxRise > 0.25 || r.maxVy > 2),
          `airborne ${r.airFrames} frames, peak rise ${n(r.maxRise)} blocks, peak vy ${n(r.maxVy)}`,
          { airFrames: r.airFrames, maxRise: r.maxRise, maxVy: r.maxVy });
      }
    }

    // ---- 8. simultaneous move + look + attack ------------------------------
    {
      const [lx, ly] = pickFree(0.25, 0.62);
      const [rx, ry] = pickFree(0.75, 0.35);
      await frame.evaluate(() => window.__PLAYTEST.reset());
      await touch.dragHold(10, lx, ly, lx, ly - 90, 6, 16);      // thumb 1: run
      await touch.dragHold(11, rx, ry, rx - 140, ry, 10, 16);    // thumb 2: turn
      const b = byName('attack');
      if (b) await touch.tap(b.cx, b.cy, 110, 12);               // thumb 3: hit
      await sleep(350);
      const r = await frame.evaluate(() => window.__PLAYTEST.read());
      await touch.release();
      await sleep(120);
      const ok = r.maxSpeed > 0.5 && Math.abs(r.yawDeltaNow) > 0.15
        && (!b || r.attackFires > 0 || r.maxSwing > 0);
      rep.add('combined move+look+attack', ok,
        `speed ${n(r.maxSpeed)}, yaw ${n(r.yawDeltaNow, 3)} rad, swings ${r.attackFires}`
        + (touch.partialEndOk ? '' : ' [partial touchEnd unsupported, used release-and-repress]'),
        { maxSpeed: r.maxSpeed, yawDelta: r.yawDeltaNow, attackFires: r.attackFires });
    }

    // ---- 8b. two thumbs only: hold attack and aim with the same one -------
    // The three-finger case above passes even when the attack button eats the
    // finger that pressed it, because a third finger is doing the aiming. A
    // phone has two thumbs. This is the case the player actually reported:
    // holding attack must not cost you the ability to look.
    {
      const b = byName('attack');
      if (!b) {
        rep.add('two-thumb attack + aim', false, 'no "attack" hit rect exists');
      } else {
        const [lx, ly] = pickFree(0.25, 0.62);
        await frame.evaluate(() => window.__PLAYTEST.reset());
        await touch.dragHold(20, lx, ly, lx, ly - 90, 6, 16);       // left thumb: run
        // Right thumb presses the button and then drags off it to aim.
        await touch.dragHold(21, b.cx, b.cy, b.cx - 130, b.cy, 10, 18);
        await sleep(350);
        const r = await frame.evaluate(() => window.__PLAYTEST.read());
        await touch.release();
        await sleep(120);
        const moved = r.maxSpeed > 0.5;
        const aimed = Math.abs(r.yawDeltaNow) > 0.15;
        const hit = r.attackFires > 0 || r.maxSwing > 0;
        rep.add('two-thumb attack + aim', moved && aimed && hit,
          `speed ${n(r.maxSpeed)}${moved ? '' : ' NOT MOVING'}, `
          + `yaw ${n(r.yawDeltaNow, 3)} rad${aimed ? '' : ' NOT AIMING'}, `
          + `swings ${r.attackFires}${hit ? '' : ' NOT ATTACKING'}`,
          { maxSpeed: r.maxSpeed, yawDelta: r.yawDeltaNow, attackFires: r.attackFires });
      }
    }

    // ---- 8c. the pause button reaches the menu ----------------------------
    // Esc and gamepad Start are the only other ways out of a run, and a phone
    // has neither. Without this button a touch player cannot reach Settings or
    // abandon a run at all.
    {
      const b = byName('pause');
      if (!b) {
        rep.add('pause button opens the menu', false, 'no "pause" hit rect exists');
      } else {
        await touch.tap(b.cx, b.cy, 110, 30);
        await sleep(450);
        const after = await frame.evaluate(() => {
          const B = window.CRAFTARENA;
          return { screen: B.menus.screen, paused: B.game.paused, running: B.game.running };
        });
        const opened = after.screen === 'pause' && after.paused;
        rep.add('pause button opens the menu', opened,
          `screen=${after.screen}, paused=${after.paused}, running=${after.running}`,
          after);
        // Resume so the checks that follow still have a live run.
        if (opened) {
          await frame.evaluate(() => {
            const btns = [...document.querySelectorAll('#ui button')];
            const resume = btns.find((x) => /RESUME/i.test(x.textContent || ''));
            if (resume) resume.click();
          });
          await sleep(400);
        }
      }
    }

    // ---- 8d. aim assist must never fight the hand that is turning ---------
    // A strong assist that pulls back onto a target while the player is
    // sweeping the view cancels the drag: you turn, and nothing happens. That
    // reads as broken controls, not as help.
    {
      const [rx, ry] = pickFree(0.75, 0.35);
      await frame.evaluate(() => window.__PLAYTEST.reset());
      // Deliberately drag *away* across a wide arc, the motion an assist is
      // most likely to undo.
      await touch.dragHold(30, rx, ry, rx - 240, ry, 22, 16);
      await sleep(200);
      const r = await frame.evaluate(() => window.__PLAYTEST.read());
      await touch.release();
      await sleep(120);
      const turned = Math.abs(r.yawDeltaNow) > 0.4;
      rep.add('aim assist does not cancel a look drag', turned,
        `yaw moved ${n(r.yawDeltaNow, 3)} rad over a 240px drag`
        + (turned ? '' : ' — the assist is overriding player input'),
        { yawDelta: r.yawDeltaNow });
    }

    // ---- 9. the wave actually runs ----------------------------------------
    {
      await frame.evaluate(() => window.__PLAYTEST.reset());
      let r = null;
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        r = await frame.evaluate(() => window.__PLAYTEST.read());
        if (r.waveMax >= 1 && r.mobsSeen >= 3) break;
        if (r.now.pending || r.now.over || !r.now.running) break;
        await sleep(500);
      }
      // Nudge combat: swing at whatever wandered in, so "state advances" is
      // exercised by play and not only by the clock.
      const b = byName('attack');
      if (b) for (let i = 0; i < 6; i++) { await touch.tap(b.cx, b.cy, 90, 20); await sleep(250); }
      const r2 = await frame.evaluate(() => window.__PLAYTEST.read());
      rep.add('wave progresses', r2.waveMax >= 1 && r2.mobsSeen >= 1,
        `wave ${r2.waveMax}, director ${r2.states.join('->') || r2.now.state}, `
        + `${r2.mobsSeen} enemies spawned (peak ${r2.maxMobs} alive), `
        + `player damage ${n(r2.dmgDelta, 0)}, kills ${r2.killsDelta}`,
        { wave: r2.waveMax, mobsSeen: r2.mobsSeen, maxMobs: r2.maxMobs, states: r2.states,
          dmg: r2.dmgDelta, kills: r2.killsDelta });

      rep.add('loop stays live', r2.fps > 20,
        `${n(r2.fps, 1)} fps average over ${n(r2.elapsed, 1)}s, worst frame ${n(r2.longestFrameMs, 0)}ms`,
        { fps: r2.fps, worstFrameMs: r2.longestFrameMs });
      await shot('wave');
    }

    // ---- 10. nothing blew up ----------------------------------------------
    const finalEnv = await frame.evaluate(() => window.__PLAYTEST.env());
    rep.add('no runtime errors', errors.length === 0 && !finalEnv.error,
      errors.length || finalEnv.error
        ? `${errors.length} page errors: ${errors.slice(0, 3).join(' | ')} ${finalEnv.error || ''}`
        : 'clean',
      { errors, consoleErrors: consoleErrors.slice(0, 5) });
  } finally {
    await ctx.close().catch(() => {});
  }
  return rep;
}

// --- main ------------------------------------------------------------------

const VIEWPORTS = [
  { label: 'portrait', width: 390, height: 844, dpr: 3 },
  { label: 'landscape', width: 844, height: 390, dpr: 3 },
];

const chromium = await loadChromium();
if (!fs.existsSync(FRAGMENT)) {
  console.error(`missing ${FRAGMENT} — run: npm run build:fragment`);
  process.exit(2);
}
const { server, port } = await startServer();
const browser = await chromium.launch({
  executablePath: CHROME, args: LAUNCH_ARGS, headless: !HEADED,
});

const reports = [];
for (const vp of VIEWPORTS) {
  if (ONLY && ONLY !== true && vp.label !== ONLY) continue;
  reports.push(await runViewport(browser, port, vp));
}

await browser.close();
server.close();

if (JSON_OUT) {
  console.log(JSON.stringify(reports.map((r) => ({ viewport: r.label, rows: r.rows })), null, 2));
} else {
  console.log('\n================ SUMMARY ================');
  for (const r of reports) {
    const bad = r.failed;
    console.log(`${r.label}: ${r.rows.filter((x) => x.pass === true).length}/${r.rows.length} passed`
      + (bad.length ? `  FAILED: ${bad.map((x) => x.name).join(', ')}` : '  — all good'));
  }
}

const anyFail = reports.some((r) => r.failed.length > 0);
process.exit(anyFail ? 1 : 0);
