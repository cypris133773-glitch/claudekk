// Title screen: the animated sea, the logo, the save slots, and the notice
// that this is a parody and you are an adult.

import { el, button, clear } from '../core/dom.js';
import { audio } from '../core/audio.js';
import * as SaveIO from '../core/save.js';
import { Backdrop } from '../render/backdrop.js';
import { DISCLAIMER } from '../data/story.js';
import { CHAPTERS } from '../data/story.js';

const TITLE_REGION = {
  name: 'title',
  sky: ['#05060f', '#180f38', '#3a1a5a'],
  ground: { color: '#0b1030', accent: '#4ee0e6', type: 'water' },
  layers: [
    { type: 'mountains', color: '#080a20', height: 0.44, speed: 0.05, count: 7 },
    { type: 'towers', color: '#0e1233', height: 0.5, speed: 0.1, count: 18 },
    { type: 'ruins', color: '#141a44', height: 0.24, speed: 0.2, count: 12 },
  ],
  weather: 'sparks',
};

export function makeTitleScreen(app) {
  const back = new Backdrop();
  let scroll = 0;
  let mounted = null;

  function render() {
    clear(app.ui);
    const slots = SaveIO.SLOTS.map((s) => ({ id: s, info: SaveIO.peek(s) }));
    const hasSave = slots.some((s) => s.info);

    const panel = el('div', { class: 'title-screen' },
      el('div', { class: 'title-mark' },
        el('div', { class: 'title-kicker' }, 'A PARODY JRPG ABOUT A CULT AND A MAN WITH A WATCH'),
        el('h1', { class: 'game-title' },
          el('span', { class: 'gt-1' }, 'FINAL'),
          el('span', { class: 'gt-2' }, 'SACRIFICE'),
          el('span', { class: 'gt-x' }, 'X'),
        ),
        el('p', { class: 'title-sub' }, 'The Calm is temporary. The Spiral is forever. The presale is Monday.'),
      ),
      el('div', { class: 'title-menu' },
        button('▶  New Pilgrimage', () => {
          audio.sfx('confirm');
          app.startNewGame();
        }, { class: 'btn big primary' }),
        hasSave && button('⟳  Continue', () => {
          audio.sfx('confirm');
          const best = slots.filter((s) => s.info).sort((a, b) => b.info.savedAt - a.info.savedAt)[0];
          app.loadGame(best.id);
        }, { class: 'btn big' }),
        button('💾  Load / Slots', () => { audio.sfx('cursor'); showSlots(); }, { class: 'btn big' }),
        button('⚙  Options', () => { audio.sfx('cursor'); showOptions(); }, { class: 'btn big' }),
        button('ⓘ  What is this', () => { audio.sfx('cursor'); showAbout(); }, { class: 'btn big' }),
      ),
      el('div', { class: 'title-foot' },
        el('span', { class: 'rating' }, '18+'),
        ' Satire. Fiction. Everyone in here is made up, including the maester.',
      ),
    );
    mounted = panel;
    app.ui.append(panel);
  }

  function modal(title, ...content) {
    const wrap = el('div', { class: 'modal-wrap', onclick: (e) => { if (e.target === wrap) wrap.remove(); } },
      el('div', { class: 'modal' },
        el('h2', {}, title),
        ...content,
        button('Close', () => { audio.sfx('cancel'); wrap.remove(); }, { class: 'btn' }),
      ),
    );
    app.ui.append(wrap);
    return wrap;
  }

  function showSlots() {
    const rows = SaveIO.SLOTS.map((slot) => {
      const info = SaveIO.peek(slot);
      const label = slot === 'auto' ? 'Autosave' : `Slot ${slot.toUpperCase()}`;
      return el('div', { class: 'slot-row' },
        el('div', { class: 'slot-meta' },
          el('strong', {}, label),
          el('span', {}, info
            ? `${CHAPTERS[info.chapter]?.title || 'Chapter ?'} · ${info.battles} fights · ${info.pls.toLocaleString()} PLS`
            : 'Empty'),
        ),
        el('div', { class: 'slot-actions' },
          button('Load', () => { if (app.loadGame(slot)) audio.sfx('confirm'); }, { class: 'btn small', disabled: !info }),
          button('Wipe', () => {
            SaveIO.wipe(slot);
            audio.sfx('cancel');
            showSlots();
          }, { class: 'btn small danger', disabled: !info }),
        ),
      );
    });
    document.querySelector('.modal-wrap')?.remove();
    modal('Saves', el('div', { class: 'slot-list' }, ...rows));
  }

  function showOptions() {
    const toggle = (label, get, set) => {
      const b = button(`${label}: ${get() ? 'ON' : 'OFF'}`, () => {
        set(!get());
        b.textContent = `${label}: ${get() ? 'ON' : 'OFF'}`;
        audio.sfx('cursor');
      }, { class: 'btn' });
      return b;
    };
    modal('Options',
      el('div', { class: 'opt-list' },
        toggle('Music', () => audio.enabled, (v) => audio.setEnabled(v)),
        toggle('Sound effects', () => audio.sfxEnabled, (v) => { audio.sfxEnabled = v; }),
      ),
      el('p', { class: 'fine' }, 'Audio is generated live in the browser — there are no sound files in this game. If it sounds like a PlayStation 1 having a religious experience, that is the intended effect.'),
    );
  }

  function showAbout() {
    modal('What is this',
      el('p', {}, 'A full turn-based JRPG in the shape of a very famous tenth entry in a very famous series, rebuilt as a satire of a fictional blockchain cult and its maester.'),
      ...DISCLAIMER.map((d) => el('p', { class: 'fine' }, d)),
      el('p', { class: 'fine' }, 'Conditional turn order, a sphere grid, seven characters who each counter a different enemy type, summons, overdrives, temple puzzles and a stadium minigame. Everything is drawn and composed in code. No engine, no build step, no assets.'),
    );
  }

  return {
    music: 'dream',
    enter() { render(); },
    exit() { mounted = null; },
    update(dt) {
      scroll += dt * 14;
      back.update(dt, TITLE_REGION, app.w, app.h);
    },
    draw(ctx, w, h) {
      back.draw(ctx, TITLE_REGION, w, h, scroll, app.t);
      // A slow shimmer over the water line.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const y = h * 0.78 + i * 14;
        ctx.globalAlpha = 0.06;
        ctx.fillStyle = '#4ee0e6';
        ctx.fillRect(0, y + Math.sin(app.t * 0.8 + i) * 5, w, 3);
      }
      ctx.restore();
    },
  };
}
