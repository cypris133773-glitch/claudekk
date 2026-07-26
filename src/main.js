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

function fatal(message) {
  bootMsg.classList.remove('hidden');
  bootMsg.innerHTML = `<h1>Cannot start</h1><p>${message}</p>
    <p class="small">This game needs WebGL2. Try an up-to-date Chrome, Edge, Firefox or Safari.</p>`;
}

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

function startRun(cls) {
  audio.ensure();
  game.startRun(cls);
  menus.show(null);
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
    game.draw();
    hud.draw(dt);
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
