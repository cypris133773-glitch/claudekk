// Overdrives. Each character's gauge cashes out through a different bit of
// dexterity, because a limit break you just pick off a list is a spell.

import { el, button, clear } from '../core/dom.js';
import { audio } from '../core/audio.js';
import { ITEMS, mixResult } from '../data/items.js';
import { AEONS } from '../data/aeons.js';

function overlay(app, title, flavour, ...content) {
  const wrap = el('div', { class: 'od-layer' },
    el('div', { class: 'od-panel' },
      el('h2', { class: 'od-title' }, title),
      el('p', { class: 'od-flavour' }, flavour),
      ...content,
    ),
  );
  app.ui.append(wrap);
  return wrap;
}

/** @returns {Promise<object|null>} a command payload for Battle.command */
export function runOverdrive(app, unit, battle) {
  const od = unit.od;
  if (!od) return Promise.resolve({ type: 'overdrive', name: 'Overdrive', power: 2.5, hits: 3 });
  switch (od.type) {
    case 'timing': return timing(app, unit, od);
    case 'reels': return reels(app, unit, od);
    case 'mash': return mash(app, unit, od);
    case 'menu': return grandSummon(app, unit, od, battle);
    case 'mix': return mixer(app, unit, od);
    default: return Promise.resolve({ type: 'overdrive', name: od.name, power: 2.6, hits: 2 });
  }
}

/* ── Swordplay / Due Diligence: stop the cursor in the window ─────────── */
function timing(app, unit, od) {
  return new Promise((resolve) => {
    const uses = unit.odUses || 0;
    const moves = od.moves.filter((m) => m.at <= Math.min(od.moves.length - 1, uses + 1));
    let move = moves[moves.length - 1];

    const track = el('div', { class: 'od-track' });
    const cursor = el('i', { class: 'od-cursor' });
    const zone = el('b', { class: 'od-zone' });
    track.append(zone, cursor);

    const readout = el('div', { class: 'od-readout' }, 'Tap when the marker is in the gold.');
    const picker = el('div', { class: 'od-moves' });
    for (const m of moves) {
      picker.append(button(m.name, () => {
        move = m;
        [...picker.children].forEach((c) => c.classList.remove('sel'));
        picker.lastPicked = m;
        audio.sfx('cursor');
        for (const c of picker.children) if (c.textContent === m.name) c.classList.add('sel');
      }, { class: 'btn small' + (m === move ? ' sel' : '') }));
    }

    const wrap = overlay(app, od.name, od.flavour, picker, track, readout,
      button('STRIKE', () => fire(), { class: 'btn big primary' }));

    let pos = 0, dir = 1, raf = 0, done = false;
    const width = 100;
    const zoneStart = 42, zoneWidth = 16;
    zone.style.left = zoneStart + '%';
    zone.style.width = zoneWidth + '%';

    const loop = () => {
      pos += dir * 1.7;
      if (pos > width) { pos = width; dir = -1; }
      if (pos < 0) { pos = 0; dir = 1; }
      cursor.style.left = pos + '%';
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    function fire() {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      const centre = zoneStart + zoneWidth / 2;
      const off = Math.abs(pos - centre);
      let quality = off < zoneWidth / 2 ? (off < 3 ? 1.6 : 1.25) : off < 18 ? 0.9 : 0.55;
      readout.textContent = quality >= 1.6 ? 'PERFECT.' : quality >= 1.25 ? 'Clean hit.' : quality >= 0.9 ? 'Glancing.' : 'Fumbled it.';
      audio.sfx(quality >= 1.25 ? 'crit' : 'hit');
      unit.odUses = (unit.odUses || 0) + 1;
      setTimeout(() => {
        wrap.remove();
        resolve({
          type: 'overdrive', name: move.name, power: (move.power || 2) * quality,
          hits: move.hits || 1, all: !!move.all, pierce: true,
        });
      }, 420);
    }

    const onKey = (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); fire(); } };
    window.addEventListener('keydown', onKey);
    wrap.addEventListener('pointerdown', (e) => { if (!e.target.closest('button')) fire(); });
    const cleanup = setInterval(() => {
      if (!document.body.contains(wrap)) { window.removeEventListener('keydown', onKey); clearInterval(cleanup); }
    }, 500);
  });
}

/* ── Pump Reels: stop three reels on the ticker ───────────────────────── */
function reels(app, unit, od) {
  return new Promise((resolve) => {
    const SYM = ['📈', '💎', '🤡', '🔥', '📉'];
    const reelEls = [0, 1, 2].map(() => el('div', { class: 'od-reel' }, '?'));
    const row = el('div', { class: 'od-reels' }, ...reelEls);
    const readout = el('div', { class: 'od-readout' }, 'Stop each reel. Nobody has ever explained why this works.');
    const stopBtn = button('STOP', () => stop(), { class: 'btn big primary' });
    const wrap = overlay(app, od.name, od.flavour, row, readout, stopBtn);

    const results = [];
    let idx = 0;
    const spin = setInterval(() => {
      reelEls.forEach((r, i) => {
        if (i >= idx) r.textContent = SYM[Math.floor(Math.random() * SYM.length)];
      });
    }, 70);

    function stop() {
      if (idx >= 3) return;
      const sym = reelEls[idx].textContent;
      results.push(sym);
      reelEls[idx].classList.add('locked');
      audio.sfx('confirm');
      idx++;
      if (idx >= 3) finish();
    }

    function finish() {
      clearInterval(spin);
      const counts = {};
      for (const s of results) counts[s] = (counts[s] || 0) + 1;
      const best = Math.max(...Object.values(counts));
      const pumps = results.filter((s) => s === '📈').length;
      let hits = best === 3 ? 12 : best === 2 ? 6 : 3;
      let power = 0.85 + pumps * 0.22;
      if (results.filter((s) => s === '🤡').length === 3) {
        readout.textContent = 'Three clowns. Somehow this is the best outcome available.';
        hits = 12; power = 1.4;
      } else {
        readout.textContent = best === 3 ? 'ALL THREE. Attack Reels.' : best === 2 ? 'Two of a kind.' : 'Nothing lines up. Throw anyway.';
      }
      audio.sfx(best >= 2 ? 'overdrive' : 'hit');
      setTimeout(() => {
        wrap.remove();
        resolve({ type: 'overdrive', name: od.name, power, hits, all: false, pierce: true });
      }, 700);
    }

    const onKey = (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); stop(); } };
    window.addEventListener('keydown', onKey);
    wrap.addEventListener('pointerdown', (e) => { if (!e.target.closest('button')) stop(); });
    const cleanup = setInterval(() => {
      if (!document.body.contains(wrap)) { window.removeEventListener('keydown', onKey); clearInterval(cleanup); }
    }, 500);
  });
}

/* ── Fury / Ronso Rage: thumb endurance ──────────────────────────────── */
function mash(app, unit, od) {
  return new Promise((resolve) => {
    let taps = 0;
    const DURATION = 3.6;
    let left = DURATION;
    const counter = el('div', { class: 'od-count' }, '0');
    const bar = el('div', { class: 'od-timer' }, el('i', {}));
    const fill = bar.querySelector('i');
    const pad = el('div', { class: 'od-pad' }, 'TAP');
    const wrap = overlay(app, od.name, od.flavour, counter, bar, pad);

    const tap = (e) => {
      e?.preventDefault?.();
      taps++;
      counter.textContent = String(taps);
      pad.classList.remove('pulse');
      void pad.offsetWidth;
      pad.classList.add('pulse');
      if (taps % 4 === 0) audio.sfx('hit');
    };
    pad.addEventListener('pointerdown', tap);
    const onKey = (e) => { if (!e.repeat && (e.key === ' ' || e.key === 'Enter')) tap(e); };
    window.addEventListener('keydown', onKey);

    const t0 = performance.now();
    const timer = setInterval(() => {
      left = DURATION - (performance.now() - t0) / 1000;
      fill.style.width = Math.max(0, (left / DURATION) * 100) + '%';
      if (left <= 0) {
        clearInterval(timer);
        window.removeEventListener('keydown', onKey);
        const hits = Math.max(1, Math.min(16, Math.floor(taps / 2.2)));
        counter.textContent = `${taps} taps → ${hits} casts`;
        audio.sfx('overdrive');
        setTimeout(() => {
          wrap.remove();
          resolve({
            type: 'overdrive', name: od.name, power: 1.05, hits, all: true,
            magic: unit.id === 'luna', element: unit.id === 'luna' ? 'fire' : null,
          });
        }, 700);
      }
    }, 40);
  });
}

/* ── Grand Summon ─────────────────────────────────────────────────────── */
function grandSummon(app, unit, od, battle) {
  return new Promise((resolve) => {
    const owned = app.state.aeons;
    if (!owned.length) {
      app.toast('No airdrops yet. Awkward.', 'bad');
      resolve(null);
      return;
    }
    const list = el('div', { class: 'od-moves col' });
    const wrap = overlay(app, od.name, od.flavour, list,
      button('Cancel', () => { wrap.remove(); resolve(null); }, { class: 'btn' }));
    for (const id of owned) {
      const a = AEONS[id];
      list.append(button(`${a.name} — ${a.epithet}`, () => {
        wrap.remove();
        app.state.aeonOd[id] = 100;
        app.state.aeonHp[id] = undefined;
        audio.sfx('summon');
        resolve({ type: 'summon', aeon: id, grand: true });
      }, { class: 'btn' }));
    }
  });
}

/* ── Mix ──────────────────────────────────────────────────────────────── */
function mixer(app, unit, od) {
  return new Promise((resolve) => {
    const picks = [];
    const list = el('div', { class: 'od-moves col scroll' });
    const readout = el('div', { class: 'od-readout' }, 'Pick two. There is no undo and no supervision.');
    const wrap = overlay(app, od.name, od.flavour, readout, list,
      button('Cancel', () => { wrap.remove(); resolve(null); }, { class: 'btn' }));

    function refresh() {
      clear(list);
      for (const [id, n] of Object.entries(app.state.inv)) {
        const it = ITEMS[id];
        if (!it || !it.battle || !it.mix) continue;
        const used = picks.filter((p) => p === id).length;
        if (n - used <= 0) continue;
        list.append(button(`${it.name} ×${n - used}`, () => {
          picks.push(id);
          audio.sfx('cursor');
          if (picks.length === 2) {
            const r = mixResult(ITEMS[picks[0]], ITEMS[picks[1]]);
            readout.textContent = `${ITEMS[picks[0]].name} + ${ITEMS[picks[1]].name} → ${r.name}!`;
            audio.sfx('overdrive');
            setTimeout(() => {
              wrap.remove();
              resolve({ type: 'mix', item: picks[0], itemB: picks[1] });
            }, 800);
          } else {
            readout.textContent = `${it.name} in the blender. One more.`;
            refresh();
          }
        }, { class: 'btn small' }));
      }
      if (!list.children.length) {
        list.append(el('p', { class: 'fine' }, 'Nothing mixable in the bag. Rugku is furious.'));
      }
    }
    refresh();
  });
}
