// Boot, loop, and the wiring between a click and a state change.

import { load, save, wipe } from './core/save.js';
import * as G from './game/state.js';
import * as E from './game/economy.js';
import { createScene } from './render/scene.js';
import { createUI } from './ui/ui.js';
import { pickLine } from './data/hypeman.js';
import { money, fmt, duration } from './core/format.js';

const canvas = document.getElementById('stage');
const uiRoot = document.getElementById('ui');
const toastHost = document.getElementById('toasts');
const boot = document.getElementById('boot');

const loaded = load();
let state = loaded.state;

const scene = createScene(canvas, () => state);

function toast(text, kind = '') {
  const n = document.createElement('div');
  n.className = 'toast ' + kind;
  n.textContent = text;
  toastHost.append(n);
  // Removal is driven by the animation ending rather than a timer, so a
  // backgrounded tab does not pile up ghosts and flush them all at once.
  n.addEventListener('animationend', () => n.remove());
  while (toastHost.children.length > 4) toastHost.firstChild.remove();
}

const actions = {
  buy(id, mode) {
    const before = state.levels[id] || 0;
    const n = G.buyStation(state, id, mode);
    if (!n) return;
    const after = state.levels[id];
    // Crossing a milestone is the one purchase worth interrupting for.
    const crossed = E.profitMult(after) > E.profitMult(before);
    if (crossed) {
      toast('Milestone — that station now pays double', 'good');
      scene.say(pickLine('milestone'));
    }
  },
  hire(id) {
    if (!G.hireAdvisor(state, id)) return;
    const st = G.STATIONS.find((s) => s.id === id);
    toast(st.advisor.name + ' hired — ' + st.name + ' runs itself now', 'good');
    scene.say(st.advisor.quip);
  },
  buyUpgrade(id) {
    if (!G.buyUpgrade(state, id)) return;
    toast('Perk unlocked', 'good');
  },
  pump() {
    if (!G.startPump(state)) return;
    scene.say(pickLine('pump'));
  },
  openStake(amount, term) {
    const s = G.openStake(state, amount, term);
    if (!s) return;
    toast('Staked ' + money(s.principal) + ' for ' + fmt(s.tshares) + ' T-Shares', 'good');
    scene.say(pickLine('stake'));
  },
  claimStake(id) {
    const s = G.claimStake(state, id);
    if (s) toast('Claimed ' + fmt(s.tshares) + ' T-Shares', 'good');
  },
  endStakeEarly(id) {
    const s = G.endStakeEarly(state, id);
    if (s) toast('Ended early — penalty ' + money(s.penalty || 0), 'bad');
  },
  restake() {
    const r = G.restake(state);
    if (!r) return;
    toast('Restaked · +' + fmt(r.gained) + ' Sacrifice Points', 'good');
    scene.say(pickLine('restake'));
    save(state);
  },
  wipe() {
    wipe();
    state = G.newState();
    ui.setTab('empire');
    toast('Save wiped. Back to a phone and an opinion.');
  },
};

const ui = createUI(uiRoot, { getState: () => state, actions });

// --- input -------------------------------------------------------------------

function pointAt(ev) {
  const rect = canvas.getBoundingClientRect();
  return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
}

canvas.addEventListener('pointerdown', (ev) => {
  const p = pointAt(ev);
  if (scene.hitTest(p.x, p.y) !== 'coin') return;
  ev.preventDefault();
  const value = G.tap(state);
  scene.popTap(value);
  if (state.stats.taps % 25 === 0) scene.say(pickLine('tap'));
});

// Space and Enter tap too — this is a clicker, and a keyboard is a click.
window.addEventListener('keydown', (ev) => {
  if (ev.code !== 'Space' && ev.code !== 'Enter') return;
  if (ev.target && ev.target.tagName === 'BUTTON') return;
  ev.preventDefault();
  scene.popTap(G.tap(state));
});

window.addEventListener('resize', () => scene.resize());

// --- offline catch-up --------------------------------------------------------

function bankOffline(seconds, announce) {
  if (!(seconds > 1)) return;
  const r = G.applyOffline(state, seconds);
  if (announce && r.earned > 0) {
    toast(
      'Away ' + duration(r.seconds) + ' — your advisors banked ' + money(r.earned) +
        (r.capped ? ' (capped)' : ''),
      'good'
    );
  }
}

bankOffline(loaded.offlineSeconds, true);

// A backgrounded tab stops getting frames, so the wall clock is the only
// honest source of elapsed time. Reconcile on the way back in.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    save(state);
  } else if (hiddenAt) {
    bankOffline((Date.now() - hiddenAt) / 1000, true);
    hiddenAt = 0;
  }
});
window.addEventListener('pagehide', () => save(state));

// --- loop --------------------------------------------------------------------

let last = performance.now();
let questClock = 0;
let saveClock = 0;
let uiClock = 0;
let idleTalk = 8;

function frame(now) {
  // Clamped so a stalled frame does not hand the economy a two-second tick and
  // pop every progress bar at once; real absence is handled by bankOffline.
  const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
  last = now;

  const payouts = G.tick(state, dt);
  for (const p of payouts) scene.pop(p.id, p.amount);

  questClock += dt;
  if (questClock >= 1) {
    questClock = 0;
    for (const q of G.checkQuests(state)) {
      toast('Quest complete: ' + q.text + ' · +' + q.reward + ' T-Shares', 'good');
    }
  }

  idleTalk -= dt;
  if (idleTalk <= 0) {
    idleTalk = 18 + Math.random() * 14;
    scene.say(pickLine('idle'));
  }

  uiClock += dt;
  if (uiClock >= 0.1) {
    uiClock = 0;
    ui.update();
  }

  saveClock += dt;
  if (saveClock >= 10) {
    saveClock = 0;
    save(state);
  }

  scene.render(dt);
  requestAnimationFrame(frame);
}

scene.resize();
scene.say(pickLine('idle'));
boot.remove();
requestAnimationFrame(frame);
