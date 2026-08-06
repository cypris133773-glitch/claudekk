// Boot, screen router, render loop.
//
// One canvas underneath for everything that moves, one DOM layer on top for
// everything you can read or press. Screens are plain objects with
// enter/exit/update/draw and own whatever they put in the DOM layer.

import { el, clear } from './core/dom.js';
import { audio } from './core/audio.js';
import { newGame } from './game/party.js';
import * as SaveIO from './core/save.js';
import { makeTitleScreen } from './ui/title.js';
import { makeFieldScreen } from './ui/field.js';
import { makeBattleScreen } from './ui/battle.js';
import { makeGridScreen } from './ui/gridscreen.js';
import { makeMenuScreen } from './ui/menu.js';

class App {
  constructor() {
    this.canvas = document.getElementById('scene');
    this.ctx = this.canvas.getContext('2d');
    this.ui = document.getElementById('ui');
    this.fx = document.getElementById('fx');
    this.state = null;
    this.screen = null;
    this.stack = [];
    this.t = 0;
    this.shakeAmount = 0;
    this.paused = false;
    this.dpr = 1;

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));
    this.resize();

    const unlock = () => { audio.resume(); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) audio.stop();
      else if (this.screen?.music) audio.play(this.screen.music);
    });
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.w = w;
    this.h = h;
    this.portrait = h > w;
    document.body.classList.toggle('portrait', this.portrait);
    document.body.classList.toggle('landscape', !this.portrait);
    this.screen?.onResize?.();
  }

  /* ── screens ────────────────────────────────────────────────────────── */

  setScreen(screen, { keep = false } = {}) {
    if (this.screen) {
      this.screen.exit?.();
      if (keep) this.stack.push(this.screen);
    }
    clear(this.ui);
    this.screen = screen;
    screen.enter?.();
    if (screen.music) audio.play(screen.music);
  }

  pop() {
    const prev = this.stack.pop();
    if (!prev) return;
    this.screen?.exit?.();
    clear(this.ui);
    this.screen = prev;
    prev.enter?.();
    if (prev.music) audio.play(prev.music);
  }

  /* ── convenience routing ────────────────────────────────────────────── */

  toTitle() { this.setScreen(makeTitleScreen(this)); }
  toField(opts) { this.setScreen(makeFieldScreen(this, opts)); }
  toBattle(encounter, onDone) { this.setScreen(makeBattleScreen(this, encounter, onDone)); }
  toGrid(onBack) { this.setScreen(makeGridScreen(this, onBack), { keep: false }); }
  toMenu(onBack) { this.setScreen(makeMenuScreen(this, onBack), { keep: false }); }

  startNewGame() {
    SaveIO.resetLocks();
    this.state = newGame();
    this.toField({ intro: true });
  }

  loadGame(slot) {
    const data = SaveIO.load(slot);
    if (!data) return false;
    this.state = data;
    this.toField({});
    return true;
  }

  save(slot = 'auto') {
    if (!this.state) return false;
    return SaveIO.save(this.state, slot);
  }

  /* ── feedback ───────────────────────────────────────────────────────── */

  shake(amount = 10) { this.shakeAmount = Math.max(this.shakeAmount, amount); }

  toast(text, tone = '') {
    const node = el('div', { class: `toast ${tone}` }, text);
    this.fx.append(node);
    setTimeout(() => node.classList.add('out'), 1500);
    setTimeout(() => node.remove(), 2100);
  }

  flash(color = '#fff', ms = 200) {
    const node = el('div', { class: 'screen-flash', style: { background: color, animationDuration: ms + 'ms' } });
    this.fx.append(node);
    setTimeout(() => node.remove(), ms);
  }

  /** The swirl that eats the screen before a battle. */
  async transition(kind = 'swirl') {
    return new Promise((resolve) => {
      const node = el('div', { class: `transition ${kind}` });
      this.fx.append(node);
      setTimeout(() => resolve(), 460);
      setTimeout(() => node.remove(), 1100);
    });
  }

  /* ── loop ───────────────────────────────────────────────────────────── */

  start() {
    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.t += dt;
      if (this.state) this.state.stats.playtime += dt;

      try {
        this.screen?.update?.(dt);
      } catch (err) {
        console.error('update', err);
      }

      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);
      if (this.shakeAmount > 0.4) {
        const a = this.shakeAmount;
        ctx.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
        this.shakeAmount *= 0.86;
      } else this.shakeAmount = 0;

      try {
        this.screen?.draw?.(ctx, this.w, this.h);
      } catch (err) {
        console.error('draw', err);
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}

const app = new App();
window.__game = app; // handy in a phone browser console, harmless everywhere else
app.toTitle();
app.start();

document.getElementById('boot')?.remove();
