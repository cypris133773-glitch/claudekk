// The pause menu: party order, inventory, the airdrop roster, a bestiary that
// is mostly editorial, saves and options.

import { el, button, clear, fmt } from '../core/dom.js';
import { audio } from '../core/audio.js';
import * as SaveIO from '../core/save.js';
import { CHARACTERS } from '../data/characters.js';
import { AEONS } from '../data/aeons.js';
import { ITEMS } from '../data/items.js';
import { ALL_FOES } from '../data/enemies.js';
import { CHAPTERS } from '../data/story.js';
import { charStats, learned } from '../game/party.js';
import { ABILITIES } from '../data/abilities.js';
import { drawPortrait } from '../render/art.js';

const TABS = ['Party', 'Items', 'Airdrops', 'Bestiary', 'System'];

export function makeMenuScreen(app, onBack) {
  const state = app.state;
  let tab = 'Party';
  let body;

  function build() {
    clear(app.ui);
    const bar = el('div', { class: 'topbar' },
      el('div', { class: 'topbar-left' },
        el('div', { class: 'chapter-name' }, CHAPTERS[state.chapter]?.title || 'Menu'),
        el('div', { class: 'region-name' }, `${fmt(state.pls)} PLS · ${fmt(state.stats.battles)} fights · ${timeStr(state.stats.playtime)}`),
      ),
      el('div', { class: 'topbar-right' },
        button('★ Grid', () => app.toGrid(() => app.toMenu(onBack)), { class: 'btn' }),
        button('✕ Back', () => { audio.sfx('cancel'); onBack ? onBack() : app.toField({}); }, { class: 'btn' }),
      ),
    );
    const tabs = el('div', { class: 'menu-tabs' },
      ...TABS.map((t) => button(t, () => { tab = t; audio.sfx('cursor'); render(); }, { class: `menu-tab ${tab === t ? 'on' : ''}` })),
    );
    body = el('div', { class: 'menu-body' });
    app.ui.append(bar, tabs, body);
    render();
  }

  function render() {
    for (const b of app.ui.querySelectorAll('.menu-tab')) {
      b.classList.toggle('on', b.textContent === tab);
    }
    clear(body);
    ({ Party: party, Items: items, Airdrops: aeons, Bestiary: bestiary, System: system })[tab]();
  }

  /* ── party ────────────────────────────────────────────────────────── */

  function party() {
    body.append(el('p', { class: 'fine' }, 'The first three fight. Everyone can be swapped in mid-battle for free, and swapping is how you learn — AP only goes to whoever actually took a turn.'));
    const grid = el('div', { class: 'card-grid' });
    for (const id of state.party) {
      const c = CHARACTERS[id];
      const ch = state.chars[id];
      const s = charStats(state, id);
      const inFront = state.active.includes(id);
      const port = el('canvas', { class: 'card-port', width: 96, height: 96 });
      setTimeout(() => drawPortrait(port.getContext('2d'), 48, 48, 44, c.palette, c.build), 0);

      const abilities = learned(state, id);
      const card = el('div', { class: `char-card ${inFront ? 'front' : ''}`, style: { '--tone': c.palette.main } },
        el('div', { class: 'card-head' },
          port,
          el('div', {},
            el('h3', {}, c.name),
            el('div', { class: 'epithet' }, c.epithet),
            el('div', { class: 'role' }, c.role),
          ),
        ),
        el('p', { class: 'bio' }, c.bio),
        el('div', { class: 'counter-note' },
          el('b', {}, c.counters === 'none' ? 'Generalist' : `Counters: ${c.counters}`), ' — ', c.counterNote),
        el('div', { class: 'mini-stats' },
          ...[['HP', `${fmt(ch.hp)}/${fmt(s.maxHp)}`], ['MP', `${fmt(ch.mp)}/${fmt(s.maxMp)}`],
            ['STR', s.str], ['DEF', s.def], ['MAG', s.mag], ['MDEF', s.mdef],
            ['AGI', s.agi], ['ACC', s.acc], ['EVA', s.eva], ['LUCK', s.luck],
            ['S.Lv', ch.sLv], ['AP', fmt(ch.ap)]].map(([k, v]) => el('span', {}, el('b', {}, k), ' ', String(v))),
        ),
        el('div', { class: 'ability-chips' },
          ...abilities.slice(0, 18).map((a) => el('span', { class: 'chip', title: ABILITIES[a]?.desc }, ABILITIES[a]?.name || a)),
        ),
        el('div', { class: 'card-actions' },
          button(inFront ? 'Move to bench' : 'Move to front', () => {
            if (inFront) {
              if (state.active.length <= 1) { app.toast('Somebody has to fight.', 'bad'); return; }
              state.active = state.active.filter((x) => x !== id);
            } else {
              if (state.active.length >= 3) state.active.shift();
              state.active.push(id);
            }
            audio.sfx('confirm');
            render();
          }, { class: 'btn small' }),
        ),
      );
      grid.append(card);
    }
    body.append(grid);
  }

  /* ── items ────────────────────────────────────────────────────────── */

  function items() {
    const entries = Object.entries(state.inv).filter(([, n]) => n > 0);
    if (!entries.length) { body.append(el('p', { class: 'fine' }, 'The bag is empty. Bleak.')); return; }
    const groups = { Consumable: [], Sphere: [], Loot: [] };
    for (const [id, n] of entries) {
      const it = ITEMS[id];
      if (!it) continue;
      const g = it.kind === 'sphere' || it.kind === 'key' ? 'Sphere' : it.kind === 'junk' ? 'Loot' : 'Consumable';
      groups[g].push([it, n]);
    }
    for (const [name, list] of Object.entries(groups)) {
      if (!list.length) continue;
      body.append(el('h3', { class: 'section' }, name));
      const wrap = el('div', { class: 'item-list' });
      for (const [it, n] of list) {
        wrap.append(el('div', { class: 'item-row' },
          el('div', {}, el('b', {}, it.name), el('i', {}, it.desc)),
          el('span', { class: 'qty' }, `×${n}`),
          it.sell ? button(`Sell ${fmt(it.sell)}`, () => {
            state.inv[it.id] -= 1;
            if (!state.inv[it.id]) delete state.inv[it.id];
            state.pls += it.sell;
            audio.sfx('chest');
            render();
          }, { class: 'btn tiny' }) : null,
        ));
      }
      body.append(wrap);
    }
  }

  /* ── aeons ────────────────────────────────────────────────────────── */

  function aeons() {
    if (!state.aeons.length) {
      body.append(el('p', { class: 'fine' }, 'No airdrops yet. Yield is saving herself, which is the joke and also the plot.'));
      return;
    }
    const grid = el('div', { class: 'card-grid' });
    for (const id of state.aeons) {
      const a = AEONS[id];
      grid.append(el('div', { class: 'char-card', style: { '--tone': a.palette.main } },
        el('h3', {}, a.name),
        el('div', { class: 'epithet' }, a.epithet),
        el('p', { class: 'bio' }, a.desc),
        el('div', { class: 'counter-note' }, el('b', {}, 'Overdrive'), ' — ', a.overdrive.name),
        a.paid ? el('p', { class: 'fine' }, 'Requires payment per swing. He can tell when you are lowballing.') : null,
      ));
    }
    body.append(grid);
  }

  /* ── bestiary ─────────────────────────────────────────────────────── */

  function bestiary() {
    const seen = state.seen || {};
    body.append(el('p', { class: 'fine' }, 'Everything you have met. Kill counts are not a personality, but they are a metric, and this world runs on metrics.'));
    const wrap = el('div', { class: 'item-list' });
    let any = false;
    for (const [id, f] of Object.entries(ALL_FOES)) {
      if (!seen[id]) continue;
      any = true;
      wrap.append(el('div', { class: 'item-row' },
        el('div', {},
          el('b', {}, f.name),
          el('i', {}, f.desc),
          el('small', {}, `${f.kind}${f.armored ? ' · armoured' : ''}${f.flying ? ' · airborne' : ''}${f.physImmune ? ' · immune to steel' : ''}`),
        ),
        el('span', { class: 'qty' }, `×${seen[id]}`),
      ));
    }
    if (!any) wrap.append(el('p', { class: 'fine' }, 'Nothing recorded yet.'));
    body.append(wrap);
  }

  /* ── system ───────────────────────────────────────────────────────── */

  function system() {
    const slots = el('div', { class: 'slot-list' });
    for (const slot of SaveIO.SLOTS) {
      const info = SaveIO.peek(slot);
      slots.append(el('div', { class: 'slot-row' },
        el('div', { class: 'slot-meta' },
          el('strong', {}, slot === 'auto' ? 'Autosave' : `Slot ${slot.toUpperCase()}`),
          el('span', {}, info ? `${CHAPTERS[info.chapter]?.title || '?'} · ${fmt(info.pls)} PLS` : 'Empty'),
        ),
        el('div', { class: 'slot-actions' },
          slot !== 'auto' && button('Save', () => { SaveIO.save(state, slot); audio.sfx('levelup'); render(); }, { class: 'btn small primary' }),
          button('Load', () => { app.loadGame(slot); }, { class: 'btn small', disabled: !info }),
        ),
      ));
    }
    const tog = (label, get, set) => {
      const b = button(`${label}: ${get() ? 'ON' : 'OFF'}`, () => {
        set(!get());
        b.textContent = `${label}: ${get() ? 'ON' : 'OFF'}`;
        audio.sfx('cursor');
      }, { class: 'btn' });
      return b;
    };
    body.append(
      el('h3', { class: 'section' }, 'Saves'), slots,
      el('h3', { class: 'section' }, 'Options'),
      el('div', { class: 'opt-list' },
        tog('Music', () => audio.enabled, (v) => audio.setEnabled(v)),
        tog('Sound effects', () => audio.sfxEnabled, (v) => { audio.sfxEnabled = v; }),
      ),
      el('h3', { class: 'section' }, 'Run'),
      el('div', { class: 'item-list' },
        ...[['Battles', state.stats.battles], ['Kills', state.stats.kills], ['Steals', state.stats.steals],
          ['Overdrives', state.stats.overdrives], ['Wipes', state.stats.deaths],
          ['Grid nodes lit', state.stats.gridNodes], ['Time', timeStr(state.stats.playtime)]]
          .map(([k, v]) => el('div', { class: 'item-row' }, el('div', {}, el('b', {}, k)), el('span', { class: 'qty' }, String(v)))),
      ),
      el('div', { class: 'danger-zone' },
        button('Abandon run → Title', () => { audio.sfx('cancel'); app.toTitle(); }, { class: 'btn danger' }),
      ),
    );
  }

  return {
    music: 'creep',
    enter() { build(); },
    exit() {},
    update() {},
    draw(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#080b1c');
      g.addColorStop(1, '#04050d');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.globalAlpha = 0.06;
      ctx.strokeStyle = '#4ee0e6';
      for (let i = 0; i < 12; i++) {
        const y = ((app.t * 12 + i * 90) % (h + 120)) - 60;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y + 30);
        ctx.stroke();
      }
      ctx.restore();
    },
  };
}

function timeStr(sec) {
  const s = Math.floor(sec);
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}`;
}
