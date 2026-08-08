// Entry point: wires renderer, input, audio, game and menus into one loop.

import { Renderer } from './render/renderer.js';
import { tryLoadCustomHead, T } from './render/atlas.js';
import { Input, isTouchDevice } from './core/input.js';
import { Audio } from './core/audio.js';
import { Profile, storage } from './core/save.js';
import { Game } from './game/game.js';
import { MOB_TYPES } from './game/mobs.js';
import { Hud } from './ui/hud.js';
import { Menus } from './ui/menus.js';
import { CLASSES } from './data/classes.js';
import { AFFIXES } from './data/affixes.js';
import { nextBoss, RAID_BY_ID } from './data/raids.js';
import { GEAR_SLOT_IDS } from './data/armor.js';
import { clamp } from './core/math.js';

// The viewport meta must exist or mobile browsers lay the page out at a
// 980px virtual width and scale it down: the game renders huge, gets shrunk
// to fit, and every touch target lands in the wrong place. index.html has the
// tag, but an embed host supplies its own <head>, so set it from script — that
// covers both cases and browsers re-evaluate the viewport when it changes.
(function ensureViewport() {
  let tag = document.querySelector('meta[name="viewport"]');
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('name', 'viewport');
    document.head.appendChild(tag);
  }
  tag.setAttribute('content',
    'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
})();

export const BUILD = '2026-07-30 07:08 UTC';
console.info('CRAFT ARENA build', BUILD);

const glCanvas = document.getElementById('view');
const hudCanvas = document.getElementById('hud');
const uiRoot = document.getElementById('ui');
const bootMsg = document.getElementById('boot');

function fatal(message, detail) {
  bootMsg.classList.remove('hidden');
  bootMsg.innerHTML = `<h1>Cannot start</h1><p>${message}</p>
    ${detail ? `<p class="small">${detail}</p>` : ''}
    <p class="small">This game needs WebGL2. Try an up-to-date Chrome, Edge,
    Firefox or Safari, and check that hardware acceleration is on.</p>`;
}

// Anything unhandled becomes a visible message. A silent black screen is the
// worst possible failure mode — it gives the player nothing to report.
window.addEventListener('error', (e) => {
  window.__craftarenaError = String((e.error && e.error.message) || e.message || e);
  console.error(e.error || e.message);
  // A throw during module evaluation leaves the page blank with no menu, which
  // is indistinguishable from a crash. Surface it instead.
  if (!window.CRAFTARENA) {
    fatal('The game failed to start.', window.__craftarenaError);
  }
});
window.addEventListener('unhandledrejection', (e) => {
  window.__craftarenaError = 'unhandled promise: ' + String(e.reason);
});

let renderer;
try {
  renderer = new Renderer(glCanvas);
} catch (err) {
  fatal(err.message);
  throw err;
}
bootMsg.classList.add('hidden');

const profile = new Profile();
const audio = new Audio(profile.settings);
const input = new Input(glCanvas, profile.settings);
const game = new Game(renderer, audio, profile);
const hud = new Hud(hudCanvas, game, input, profile);

hud.touchMode = isTouchDevice();
// Aim assist is for thumbs, not mice; a pointer already tracks precisely.
const applyAimAssist = () => {
  if (game.player) {
    game.player.aimAssist = isTouchDevice() && profile.settings.aimAssist !== false;
  }
};
renderer.renderScale = profile.settings.renderScale;
renderer.fancy = profile.settings.fancyGraphics !== false;

// Optional custom enemy head texture (see assets/README.md).
tryLoadCustomHead(renderer.gl, renderer.atlas).then((ok) => {
  if (ok) renderer.customHeadTile = T.CUSTOM_HEAD;
});

// Optional sound pack (see assets/sounds/README.md). Missing files just keep
// the built-in procedural audio, so this never blocks startup.
const unlockAudio = () => {
  audio.ensure();
  audio.loadSoundPack().then((n) => { if (n) console.info(`Sound pack: ${n} cues loaded.`); });
  window.removeEventListener('pointerdown', unlockAudio);
  window.removeEventListener('keydown', unlockAudio);
};
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

const menus = new Menus(uiRoot, {
  profile,
  audio,
  game,
  build: BUILD,
  // Menus own a full-width fullscreen control; the 44px corner button is easy
  // to miss and cannot be found at all mid-run.
  fullscreen: {
    get usable() { return fullscreenUsable; },
    isOn: () => isFullscreen(),
    toggle: () => { if (isFullscreen()) exitFullscreen(); else enterFullscreen(); },
  },
  startRun: (charId) => startRun(charId),
  startRaid: (charId, raid) => startRaid(charId, raid),
  continueRaid: () => continueRaid(),
  leaveRaid: (to) => leaveRaid(to),
  resumeRun: () => resumeRun(),
  quitRun: () => quitRun(),
  onSettingsChanged: () => {
    applyAimAssist();
    renderer.renderScale = profile.settings.renderScale;
    renderer.fancy = profile.settings.fancyGraphics !== false;
    audio.applySettings();
  },
});

function requestLock() {
  // Best effort only. If the browser refuses — an iframe without
  // allow="pointer-lock", for instance — Input falls back to drag-to-look
  // rather than leaving the mouse dead.
  if (!isTouchDevice()) input.tryPointerLock();
}

// --- Fullscreen ------------------------------------------------------------

const fullscreenBtn = document.getElementById('fullscreen-btn');
const inIframe = window.self !== window.top;
// An embed only gets fullscreen if the host iframe carries allow="fullscreen".
// document.fullscreenEnabled is the reliable signal; the method exists either
// way and simply rejects, which would look like the button doing nothing.
const fullscreenAllowed = document.fullscreenEnabled !== false;
const fullscreenSupported = !!(document.documentElement.requestFullscreen
  || document.documentElement.webkitRequestFullscreen);
const fullscreenUsable = fullscreenSupported && fullscreenAllowed;

function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

/** Must be called straight from a user gesture or browsers reject it. */
function enterFullscreen() {
  if (!fullscreenUsable || isFullscreen()) return;
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  try {
    const p = req.call(el, { navigationUI: 'hide' });
    // Landscape is the better view; the lock is unsupported on iOS, so this
    // is an attempt rather than a requirement and must not throw.
    if (p && p.then) p.then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
    else screen.orientation?.lock?.('landscape').catch(() => {});
  } catch { /* user or browser said no; the game plays windowed either way */ }
}

function exitFullscreen() {
  if (!isFullscreen()) return;
  try {
    screen.orientation?.unlock?.();
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } catch { /* nothing to do */ }
}

function syncFullscreenUi() {
  document.body.classList.toggle('is-fullscreen', isFullscreen());
}
document.addEventListener('fullscreenchange', syncFullscreenUi);
document.addEventListener('webkitfullscreenchange', syncFullscreenUi);

if (fullscreenUsable) {
  document.body.classList.add('show-fullscreen-btn');
  fullscreenBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (isFullscreen()) exitFullscreen(); else enterFullscreen();
  });
} else if (inIframe) {
  // An embed without allow="fullscreen" can never go fullscreen from inside,
  // so offer the only thing that actually works: the same page in its own
  // tab, where fullscreen and pointer lock are available. A real anchor is
  // used because window.open is blocked in a sandboxed frame.
  const link = document.createElement('a');
  link.id = 'popout-btn';
  link.href = location.href;
  link.target = '_blank';
  link.rel = 'noopener';
  link.title = 'Open in a new tab for fullscreen';
  link.textContent = '⇱';
  document.body.appendChild(link);
  document.body.classList.add('show-popout-btn');
} else {
  fullscreenBtn.remove();
}

/** Brief centred message for things the player needs told immediately. */
let toastTimer = null;
function showToast(text, ms = 4000) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// --- Loading screen --------------------------------------------------------

const loadingEl = document.getElementById('loading');
const loadingStep = document.getElementById('loading-step');
const loadingFill = document.getElementById('loading-fill');

function showLoading(step, pct) {
  loadingStep.textContent = step;
  loadingFill.style.width = pct + '%';
  loadingEl.classList.remove('hidden');
}

function hideLoading() { loadingEl.classList.add('hidden'); }

/** Yield twice so the browser actually paints before a blocking step. */
const nextPaint = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

async function startRun(charId) {
  // Both of these need the user gesture that is still on the stack.
  audio.ensure();
  // Desktop benefits from this as much as a phone does — a windowed browser
  // wastes a third of the screen on chrome.
  if (profile.settings.fullscreenOnPlay && fullscreenUsable) enterFullscreen();

  // The hint has served its purpose once a run begins, and it sits where the
  // health bar goes.
  document.getElementById('rotate-hint').classList.add('hidden');

  menus.show(null);
  showLoading('Carving the arena…', 15);
  await nextPaint();

  try {
    // Generating and meshing the arena blocks for a moment on a phone; the
    // loading screen above is already painted, so it reads as loading.
    game.startRun(charId);
    applyAimAssist();
  } catch (err) {
    hideLoading();
    fatal('The arena failed to build.', String(err && err.message ? err.message : err));
    console.error(err);
    return;
  }

  showLoading('Entering the arena…', 100);
  await nextPaint();
  hideLoading();
  input.setEnabled(true);
  requestLock();
}

/**
 * Enter a raid at whatever boss this character has left standing. Shares startRun's
 * whole preamble — audio, fullscreen, the loading screen — because the failure
 * it guards against is the same one: generating an arena blocks for a moment on
 * a phone, and a frozen black screen reads as a crash.
 */
async function startRaid(charId, raid) {
  audio.ensure();
  if (profile.settings.fullscreenOnPlay && fullscreenUsable) enterFullscreen();
  document.getElementById('rotate-hint').classList.add('hidden');

  const st = profile.raidState(charId);
  const next = nextBoss(st, raid);
  if (!next) return;

  menus.show(null);
  showLoading('Opening the gates…', 15);
  await nextPaint();
  try {
    game.startRaid(charId, raid, next.index);
    applyAimAssist();
  } catch (err) {
    hideLoading();
    fatal('The raid failed to build.', String(err && err.message ? err.message : err));
    console.error(err);
    return;
  }
  showLoading('Entering…', 100);
  await nextPaint();
  hideLoading();
  input.setEnabled(true);
  requestLock();
}

/** Yes, from the window between fights: the next boss, everything restored. */
function continueRaid() {
  if (game.raidCleared ? !game.continueRaid() : !game.retryRaid()) { leaveRaid(); return; }
  menus.show(null);
  input.setEnabled(true);
  requestLock();
}

/**
 * No. The run ends and banks what it earned, exactly as a normal run does —
 * the Cores and their gold were already written when each boss died, so this
 * only decides which screen comes next.
 */
function leaveRaid(to) {
  game.paused = false;
  game.endRun();
  input.setEnabled(false);
  document.exitPointerLock?.();
  menus.show(to || 'results');
}

function resumeRun() {
  if (!game.running) return;
  game.paused = false;
  menus.show(null);
  input.setEnabled(true);
  requestLock();
}

function pauseRun() {
  if (!game.running || game.paused) return;
  game.paused = true;
  input.setEnabled(false);
  document.exitPointerLock?.();
  menus.show('pause');
}

function quitRun() {
  game.endRun();
  showResults();
}

function showResults() {
  input.setEnabled(false);
  document.exitPointerLock?.();
  menus.show('results');
}

input.onPointerUnlock = () => {
  // Losing pointer lock mid-fight normally means the player tabbed away, but
  // a controller player never holds pointer lock in the first place.
  if (input.gamepadActive) return;
  if (game.running && !game.paused && !game.pendingUpgrades) pauseRun();
};

window.addEventListener('gamepadconnected', (e) => {
  if (game.running) game.notify('Controller connected', 2);
  console.info('Gamepad:', e.gamepad.id);
});
window.addEventListener('gamepaddisconnected', () => {
  input.gamepadActive = false;
  if (game.running && !game.paused) pauseRun();
});

// Landscape hint: informational only, dismissible, never blocks input.
const rotateHint = document.getElementById('rotate-hint');
if (isTouchDevice() && !storage.get('craftarena.rotateHintSeen')) {
  rotateHint.classList.remove('hidden');
  document.getElementById('rotate-dismiss').addEventListener('click', () => {
    rotateHint.classList.add('hidden');
    storage.set('craftarena.rotateHintSeen', '1');
  });
  setTimeout(() => rotateHint.classList.add('hidden'), 6000);
}

menus.show('title');

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

let last = performance.now();
let acc = 0;
const FIXED = 1 / 60;

/**
 * Drop to the fast renderer if the device cannot hold a playable frame rate
 * with the extras on. Phones vary by an order of magnitude and no static
 * check predicts it; measuring for a few seconds of real play does. It only
 * ever steps down, and only once, so it can never oscillate — and it leaves
 * the setting visible so the player can turn it back on.
 */
const perf = { samples: 0, slow: 0, decided: false };
function watchPerformance(dt) {
  if (perf.decided || !renderer.fancy || !game.running || game.paused) return;
  if (dt <= 0 || dt > 0.25) return;
  perf.samples++;
  if (dt > 1 / 34) perf.slow++;
  if (perf.samples < 240) return;              // ~4s of play
  perf.decided = true;
  // Only step down when most frames missed, not on a couple of stutters.
  if (perf.slow / perf.samples > 0.55) {
    renderer.fancy = false;
    profile.settings.fancyGraphics = false;
    profile.save();
    showToast('Switched to fast graphics to keep the frame rate up. '
      + 'Settings → Fancy graphics turns it back on.', 5000);
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;         // tab was hidden; do not simulate the gap
  watchPerformance(dt);

  const state = input.poll(dt);

  if (game.running && !game.paused) {
    // Look
    const [lx, ly] = input.takeLook();
    const p = game.player;
    p.yaw -= lx;
    p.pitch = clamp(p.pitch - ly, -1.45, 1.45);
    // Aim assist must never fight the hand that is turning. Recording how hard
    // the player is looking lets the assist stand down while they are, and do
    // its work in the gaps — which is where tracking a moving target is hard.
    p.lookInput = Math.max(Math.hypot(lx, ly), (p.lookInput || 0) * 0.82);

    if (input.takePause()) { pauseRun(); }

    // Fixed-step simulation keeps physics stable on every device.
    acc += dt;
    let steps = 0;
    while (acc >= FIXED && steps < 5) {
      game.update(FIXED, state);
      acc -= FIXED;
      steps++;
      if (!game.running) break;
    }
    if (steps >= 5) acc = 0;

    // In a raid the run does not end on a kill or on a death — both open the
    // same window, and the window is what decides whether there is another
    // fight. Results only ever comes from "stop here".
    if (game.mode === 'raid' && (game.raidCleared || game.player.dead)
      && menus.screen !== 'raidkill' && menus.screen !== 'raidwipe') {
      const won = game.raidCleared;
      game.holdRaid();
      input.setEnabled(false);
      document.exitPointerLock?.();
      menus.show(won ? 'raidkill' : 'raidwipe');
    } else if (game.over) {
      showResults();
    } else if (game.pendingUpgrades && menus.screen !== 'upgrade') {
      input.setEnabled(false);
      document.exitPointerLock?.();
      menus.show('upgrade');
    }
  } else if (game.running && input.takePause() && game.paused && menus.screen === 'pause') {
    resumeRun();
  }

  if (game.running || game.over) {
    try {
      game.draw();
      hud.draw(dt);
    } catch (err) {
      game.running = false;
      fatal('The game hit an error while drawing.', String(err && err.message ? err.message : err));
      console.error(err);
    }
  } else {
    // Menu backdrop: clear to a calm colour.
    const gl = renderer.gl;
    renderer.resize();
    gl.viewport(0, 0, renderer.canvas.width, renderer.canvas.height);
    gl.clearColor(0.055, 0.06, 0.086, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    hud.resize();
    hud.ctx.clearRect(0, 0, hud.w, hud.h);
  }
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------------------
// Platform glue
// ---------------------------------------------------------------------------

window.addEventListener('resize', () => {
  renderer.resize();
  hud.resize();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseRun();
});

// Keep phones from scrolling / zooming while playing.
document.addEventListener('touchmove', (e) => {
  if (game.running && !game.paused) e.preventDefault();
}, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

// Expose a tiny handle for debugging and for a future Steam/Electron wrapper.
// Exposed for the diagnostics screen and the headless test harnesses; a
// shipped build is a single file, so there is nothing else to inspect with.
window.CRAFTARENA = {
  game, profile, renderer, audio, menus, input, CLASSES, AFFIXES, GEAR_SLOT_IDS,
  RAID_BY_ID, MOB_TYPES,
};
