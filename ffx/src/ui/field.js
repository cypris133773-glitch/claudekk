// The field: a corridor you walk left to right, with events pinned at fixed
// positions. Deliberately linear — so was the game this is imitating.

import { el, button, clear, fmt } from '../core/dom.js';
import { audio } from '../core/audio.js';
import { Backdrop } from '../render/backdrop.js';
import { drawHero } from '../render/art.js';
import { CHAPTERS, ENDING } from '../data/story.js';
import { CHARACTERS } from '../data/characters.js';
import { AEONS } from '../data/aeons.js';
import { ITEMS } from '../data/items.js';
import { rollEncounter } from '../game/battle.js';
import { recruit, addItem, restoreParty } from '../game/party.js';
import { runScene } from './dialogue.js';
import { openShop } from './shop.js';
import { runPuzzle } from './puzzle.js';
import { runMinigame } from './minigames.js';
import { rng } from '../core/rng.js';

const WALK_SPEED = 210;

export function makeFieldScreen(app, opts = {}) {
  const back = new Backdrop();
  const state = app.state;
  let chapter = CHAPTERS[state.chapter] || CHAPTERS[0];
  let camera = 0;
  let vx = 0;
  let held = 0;          // -1 / 0 / 1 from buttons or keys
  let walkTarget = null;
  let encounterMeter = 0;
  let busy = false;
  let bannerTimer = 3.2;
  let hud = {};

  const keys = new Set();

  function key(id) { return `${chapter.id}:${id}`; }
  function isDone(ev) { return !!state.flags[key(ev.id || `${ev.type}@${ev.x}`)]; }
  function markDone(ev) { state.flags[key(ev.id || `${ev.type}@${ev.x}`)] = true; }

  function onKeyDown(e) {
    if (busy) return;
    keys.add(e.key);
    if (e.key === 'Escape') openMenu();
  }
  function onKeyUp(e) { keys.delete(e.key); }

  function readKeys() {
    let d = 0;
    if (keys.has('ArrowLeft') || keys.has('a') || keys.has('A')) d -= 1;
    if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) d += 1;
    return d;
  }

  /* ── HUD ──────────────────────────────────────────────────────────── */

  function buildHud() {
    clear(app.ui);
    const bar = el('div', { class: 'topbar' },
      el('div', { class: 'topbar-left' },
        el('div', { class: 'chapter-name' }, chapter.title),
        el('div', { class: 'region-name' }, chapter.region.name),
      ),
      el('div', { class: 'topbar-right' },
        el('div', { class: 'pls' }, el('b', {}, fmt(state.pls)), ' PLS'),
        button('☰', () => openMenu(), { class: 'btn icon', attrs: { 'aria-label': 'Menu' } }),
      ),
    );

    const walkBtn = (label, dir) => {
      const b = button(label, () => {}, { class: 'walk-btn' });
      const down = (e) => { e.preventDefault(); held = dir; walkTarget = null; b.classList.add('on'); };
      const up = () => { if (held === dir) held = 0; b.classList.remove('on'); };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointerleave', up);
      b.addEventListener('pointercancel', up);
      return b;
    };

    const controls = el('div', { class: 'field-controls' },
      walkBtn('◀', -1),
      el('div', { class: 'field-hint' }, hintText()),
      walkBtn('▶', 1),
    );

    const banner = el('div', { class: 'chapter-banner' },
      el('h2', {}, chapter.title),
      el('p', {}, chapter.subtitle),
    );

    app.ui.append(bar, controls, banner);
    hud = { bar, controls, banner, hint: controls.querySelector('.field-hint') };
  }

  function hintText() {
    const next = chapter.events.filter((e) => !isDone(e) && e.x > state.x).sort((a, b) => a.x - b.x)[0];
    if (!next) return 'onward →';
    const label = {
      scene: 'a conversation', battle: 'something enormous', chest: 'a chest',
      save: 'a save sphere', shop: 'a shop', puzzle: 'a cloister', minigame: 'a distraction',
      ending: 'the end',
    }[next.type] || 'something';
    const d = Math.round(next.x - state.x);
    return `${label} · ${d}m →`;
  }

  /* ── events ───────────────────────────────────────────────────────── */

  async function trigger(ev) {
    busy = true;
    held = 0;
    walkTarget = null;
    hud.controls?.classList.add('hidden');
    try {
      switch (ev.type) {
        case 'scene': await doScene(ev); break;
        case 'battle': await doBossBattle(ev); break;
        case 'chest': await doChest(ev); break;
        case 'save': await doSave(ev); break;
        case 'shop': await openShop(app, ev); break;
        case 'puzzle': await doPuzzle(ev); break;
        case 'minigame': await doMinigame(ev); break;
        case 'ending': await doEnding(); return;
        default: break;
      }
      if (ev.once !== false) markDone(ev);
      if (ev.then === 'nextChapter') { await advanceChapter(); return; }
    } finally {
      busy = false;
      hud.controls?.classList.remove('hidden');
      if (hud.hint) hud.hint.textContent = hintText();
    }
  }

  function grantFrom(ev) {
    for (const who of ev.join || []) {
      recruit(state, who);
      app.toast(`${CHARACTERS[who].name} joins — ${CHARACTERS[who].epithet}`, 'good');
    }
    if (ev.aeon && !state.aeons.includes(ev.aeon)) {
      state.aeons.push(ev.aeon);
      audio.sfx('summon');
      app.toast(`Airdrop acquired: ${AEONS[ev.aeon].name}`, 'good');
    }
  }

  async function doScene(ev) {
    if (ev.lines) await runScene(app, ev.lines, { shake: ev.shake });
    grantFrom(ev);
  }

  async function doBossBattle(ev) {
    if (ev.pre) await runScene(app, ev.pre);
    grantFrom(ev);
    await app.transition('swirl');
    audio.sfx('summon');
    await new Promise((resolve) => {
      app.toBattle({ foes: [ev.boss], boss: true, canFlee: false }, async (outcome) => {
        if (outcome === 'defeat') { await gameOver(); resolve(); return; }
        // Everything that changes the world has to happen *before* the new
        // field screen exists, or it walks straight back into the boss it just
        // beat: the fresh screen re-checks events on its first frame, and the
        // one under the player's feet is still unflagged.
        markDone(ev);
        if (ev.then === 'nextChapter' && !bumpChapter()) { await doEnding(); resolve(); return; }
        app.toField({ afterBattle: ev.post });
        resolve();
      });
    });
  }

  async function doChest(ev) {
    audio.sfx('chest');
    const got = [];
    for (const [id, n] of ev.loot) { addItem(state, id, n); got.push(`${ITEMS[id].name} ×${n}`); }
    app.flash('rgba(245,198,107,0.35)', 260);
    await runScene(app, [{ who: 'sys', text: `Found: ${got.join(', ')}.` }]);
  }

  async function doSave(ev) {
    restoreParty(state);
    app.save('auto');
    audio.sfx('levelup');
    app.flash('rgba(78,224,230,0.28)', 300);
    await runScene(app, [{
      who: 'sys',
      text: 'Save sphere. Party fully restored, progress written to the autosave. Unlike the temple, this one actually holds your assets.',
    }]);
  }

  async function doPuzzle(ev) {
    const ok = await runPuzzle(app, ev.level);
    if (ok) {
      for (const [id, n] of ev.reward || []) addItem(state, id, n);
      app.toast('Cloister cleared. The mechanism was a hydraulic ram and a mirror.', 'good');
    }
  }

  async function doMinigame(ev) {
    if (ev.pre) await runScene(app, ev.pre);
    const result = await runMinigame(app, ev.game);
    if (result.won) {
      for (const [id, n] of ev.reward || []) addItem(state, id, n);
      app.toast('Winner. Nobody can explain the rules.', 'good');
    }
  }

  /** Move the save on a chapter. Returns false when the pilgrimage is over. */
  function bumpChapter() {
    state.chapter += 1;
    state.x = 60;
    if (state.chapter >= CHAPTERS.length) return false;
    for (const who of CHAPTERS[state.chapter].party || []) recruit(state, who);
    restoreParty(state);
    app.save('auto');
    return true;
  }

  async function advanceChapter() {
    if (!bumpChapter()) { await doEnding(); return; }
    chapter = CHAPTERS[state.chapter];
    camera = 0;
    back.reset(chapter.region.weather);
    buildHud();
    bannerTimer = 3.2;
    audio.play(chapter.music);
  }

  async function doEnding() {
    busy = true;
    await runScene(app, ENDING.lines);
    state.flags.completed = true;
    app.save('auto');
    app.toTitle();
  }

  async function gameOver() {
    await runScene(app, [
      { who: 'sys', text: 'Wiped out. Your positions were closed for you, which the Church calls "a teaching moment".' },
      { who: 'sys', text: 'Reloading from the last save sphere. Nothing is lost except dignity, which was never on the balance sheet.' },
    ]);
    state.stats.deaths++;
    if (!app.loadGame('auto')) {
      restoreParty(state);
      app.toField({});
    }
  }

  /* ── random encounters ────────────────────────────────────────────── */

  async function randomBattle() {
    const enc = rollEncounter(chapter, rng);
    if (!enc) return;
    busy = true;
    held = 0;
    await app.transition('swirl');
    await new Promise((resolve) => {
      app.toBattle(enc, async (outcome) => {
        if (outcome === 'defeat') { await gameOver(); resolve(); return; }
        app.toField({});
        resolve();
      });
    });
  }

  function openMenu() {
    if (busy) return;
    audio.sfx('cursor');
    app.toMenu(() => app.toField({}));
  }

  /* ── screen ───────────────────────────────────────────────────────── */

  function onPointerDown(e) {
    if (busy) return;
    if (e.target.closest('.topbar, .field-controls, .dlg-layer, .modal-wrap')) return;
    const worldX = state.x + (e.clientX - app.w * 0.34);
    walkTarget = Math.max(0, Math.min(chapter.length, worldX));
  }

  return {
    get music() { return chapter.music; },

    enter() {
      chapter = CHAPTERS[state.chapter] || CHAPTERS[0];
      for (const who of chapter.party || []) recruit(state, who);
      back.reset(chapter.region.weather);
      buildHud();
      if (opts.intro) bannerTimer = 4;
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      app.canvas.addEventListener('pointerdown', onPointerDown);

      // Coming back from a boss: hold the controls until its closing scene has
      // played, so the player is not walking around underneath the dialogue.
      if (opts.afterBattle) {
        busy = true;
        hud.controls?.classList.add('hidden');
        runScene(app, opts.afterBattle).then(() => {
          busy = false;
          hud.controls?.classList.remove('hidden');
          if (hud.hint) hud.hint.textContent = hintText();
        });
      }
    },

    exit() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      app.canvas.removeEventListener('pointerdown', onPointerDown);
      keys.clear();
    },

    update(dt) {
      bannerTimer -= dt;
      if (bannerTimer < 0 && hud.banner) hud.banner.classList.add('gone');
      if (busy) { vx = 0; return; }

      let dir = held || readKeys();
      if (!dir && walkTarget != null) {
        const d = walkTarget - state.x;
        if (Math.abs(d) < 8) walkTarget = null;
        else dir = Math.sign(d);
      }

      vx = dir * WALK_SPEED;
      if (dir) state.facing = dir;
      const before = state.x;
      state.x = Math.max(0, Math.min(chapter.length, state.x + vx * dt));
      const moved = Math.abs(state.x - before);

      // events
      for (const ev of chapter.events) {
        if (isDone(ev)) continue;
        const crossed = (before < ev.x && state.x >= ev.x) || (before > ev.x && state.x <= ev.x)
          || Math.abs(state.x - ev.x) < 6;
        if (crossed) { trigger(ev); break; }
      }

      // random encounters
      if (moved > 0 && chapter.encounters) {
        encounterMeter += moved * chapter.encounters.rate;
        if (encounterMeter > 1 + rng() * 0.6) {
          encounterMeter = 0;
          randomBattle();
        }
      }

      if (hud.hint && Math.random() < 0.06) hud.hint.textContent = hintText();
      const targetCam = state.x - app.w * 0.34;
      camera += (targetCam - camera) * Math.min(1, dt * 6);
      back.update(dt, chapter.region, app.w, app.h);
    },

    draw(ctx, w, h) {
      back.draw(ctx, chapter.region, w, h, camera, app.t);
      const groundY = h * 0.74;
      const scale = Math.min(1.25, Math.max(0.7, h / 620));

      // event markers
      for (const ev of chapter.events) {
        if (isDone(ev) || ev.type === 'scene' || ev.type === 'battle') continue;
        const sx = ev.x - camera;
        if (sx < -80 || sx > w + 80) continue;
        drawMarker(ctx, sx, groundY + 34, ev.type, app.t);
      }

      // party: leader plus two trailing
      const leadX = state.x - camera;
      const walking = Math.abs(vx) > 1;
      const order = state.active.length ? state.active : state.party;
      order.slice(0, 3).forEach((id, i) => {
        const c = CHARACTERS[id];
        if (!c) return;
        const lag = i * 42 * (state.facing || 1);
        const x = leadX - lag;
        const t = app.t * (walking ? 4.2 : 1) - i * 0.4;
        drawHero(ctx, {
          x, y: groundY + 40 + i * 5, h: 132 * scale * (c.build.height || 1),
          build: c.build, palette: c.palette, t,
          state: walking ? 'walk' : 'idle', flip: (state.facing || 1) < 0,
          lunge: walking ? Math.sin(t * 2) * 0.12 : 0,
        });
      });

      // distance ribbon
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#0b1020';
      ctx.fillRect(0, h - 4, w, 4);
      ctx.fillStyle = chapter.region.ground.accent;
      ctx.fillRect(0, h - 4, w * (state.x / chapter.length), 4);
      ctx.restore();
    },
  };
}

function drawMarker(ctx, x, y, type, t) {
  const bob = Math.sin(t * 2.4 + x) * 5;
  const glyph = { chest: '🎁', save: '◈', shop: '⚑', puzzle: '⌘', minigame: '★', ending: '∞' }[type] || '•';
  const color = { chest: '#f5c66b', save: '#4ee0e6', shop: '#7ee081', puzzle: '#a06bff', minigame: '#ff58c8' }[type] || '#fff';
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y - 26 + bob, 0, x, y - 26 + bob, 40);
  g.addColorStop(0, color);
  g.addColorStop(1, 'transparent');
  ctx.globalAlpha = 0.42;
  ctx.fillStyle = g;
  ctx.fillRect(x - 40, y - 66 + bob, 80, 80);
  ctx.restore();
  ctx.save();
  ctx.font = '22px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(glyph, x, y - 20 + bob);
  ctx.restore();
}
