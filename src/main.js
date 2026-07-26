// Entry point: wires renderer, input, audio, game and menus into one loop.

import { Renderer } from './render/renderer.js';
import { tryLoadCustomHead, T } from './render/atlas.js';
import { Input, isTouchDevice } from './core/input.js';
import { Audio } from './core/audio.js';
import { Profile } from './core/save.js';
import { Game } from './game/game.js';
import { Hud } from './ui/hud.js';
import { Menus } from './ui/menus.js';
import { clamp } from './core/math.js';

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
  if (!window.BLOCKFRAY || !window.BLOCKFRAY.game.running) return;
  console.error(e.error || e.message);
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
renderer.renderScale = profile.settings.renderScale;

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
  startRun: (cls) => startRun(cls),
  resumeRun: () => resumeRun(),
  quitRun: () => quitRun(),
  onSettingsChanged: () => {
    renderer.renderScale = profile.settings.renderScale;
    audio.applySettings();
  },
});

function requestLock() {
  if (!isTouchDevice()) glCanvas.requestPointerLock?.();
}

// --- Fullscreen ------------------------------------------------------------

const fullscreenBtn = document.getElementById('fullscreen-btn');
const fullscreenSupported = !!(document.documentElement.requestFullscreen
  || document.documentElement.webkitRequestFullscreen);

function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

/** Must be called straight from a user gesture or browsers reject it. */
function enterFullscreen() {
  if (!fullscreenSupported || isFullscreen()) return;
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

if (fullscreenSupported) {
  document.body.classList.add('show-fullscreen-btn');
  fullscreenBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (isFullscreen()) exitFullscreen(); else enterFullscreen();
  });
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

async function startRun(cls) {
  // Both of these need the user gesture that is still on the stack.
  audio.ensure();
  if (isTouchDevice() && profile.settings.fullscreenOnPlay) enterFullscreen();

  // The hint has served its purpose once a run begins, and it sits where the
  // health bar goes.
  document.getElementById('rotate-hint').classList.add('hidden');

  menus.show(null);
  showLoading('Carving the arena…', 15);
  await nextPaint();

  try {
    // Generating and meshing the arena blocks for a moment on a phone; the
    // loading screen above is already painted, so it reads as loading.
    game.startRun(cls);
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
if (isTouchDevice() && !localStorage.getItem('blockfray.rotateHintSeen')) {
  rotateHint.classList.remove('hidden');
  document.getElementById('rotate-dismiss').addEventListener('click', () => {
    rotateHint.classList.add('hidden');
    localStorage.setItem('blockfray.rotateHintSeen', '1');
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

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;         // tab was hidden; do not simulate the gap

  const state = input.poll(dt);

  if (game.running && !game.paused) {
    // Look
    const [lx, ly] = input.takeLook();
    const p = game.player;
    p.yaw -= lx;
    p.pitch = clamp(p.pitch - ly, -1.45, 1.45);

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

    if (!profile.settings.autoAttack) state.attack = false;

    if (game.over) {
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
window.BLOCKFRAY = { game, profile, renderer, audio, menus };
