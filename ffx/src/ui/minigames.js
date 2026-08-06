// Two distractions: the Blitzchain Cup penalty shootout, and dodging
// liquidations on the plains.

import { el, button, clear } from '../core/dom.js';
import { audio } from '../core/audio.js';

export function runMinigame(app, which) {
  return which === 'blitz' ? blitz(app) : dodge(app);
}

/* ── Blitzchain Cup ───────────────────────────────────────────────────── */

const KEEPER_LINES = [
  'The keeper is a former maester. He saves everything and admits nothing.',
  'The keeper has a sponsorship deal with the ball.',
  'The keeper is 61% of the voting supply.',
  'The keeper says he is "just a fan of the sport".',
];

function blitz(app) {
  return new Promise((resolve) => {
    let shot = 0, scored = 0;
    const TOTAL = 5;

    const scoreEl = el('div', { class: 'mg-score' });
    const track = el('div', { class: 'od-track big' });
    const cursor = el('i', { class: 'od-cursor' });
    const zone = el('b', { class: 'od-zone' });
    const commentary = el('p', { class: 'fine' }, KEEPER_LINES[0]);
    track.append(zone, cursor);

    const wrap = el('div', { class: 'modal-wrap mg' },
      el('div', { class: 'modal wide' },
        el('h2', {}, 'THE BLITZCHAIN CUP'),
        el('p', { class: 'fine' }, 'Five shots. Hit the gold window. The keeper moves it between shots, which is legal because he wrote the rules.'),
        scoreEl, track, commentary,
        button('SHOOT', () => fire(), { class: 'btn big primary' }),
        button('Forfeit', () => finish(), { class: 'btn small' }),
      ),
    );

    let pos = 0, dir = 1, raf = 0, live = true, zoneStart = 40, zoneWidth = 20;

    function place() {
      zoneWidth = Math.max(8, 22 - shot * 3);
      zoneStart = 10 + Math.random() * (78 - zoneWidth);
      zone.style.left = zoneStart + '%';
      zone.style.width = zoneWidth + '%';
      commentary.textContent = KEEPER_LINES[shot % KEEPER_LINES.length];
    }

    function loop() {
      pos += dir * (1.8 + shot * 0.35);
      if (pos > 100) { pos = 100; dir = -1; }
      if (pos < 0) { pos = 0; dir = 1; }
      cursor.style.left = pos + '%';
      raf = requestAnimationFrame(loop);
    }

    function update() {
      scoreEl.textContent = `Shot ${Math.min(shot + 1, TOTAL)} / ${TOTAL}  ·  Scored ${scored}`;
    }

    function fire() {
      if (!live || shot >= TOTAL) return;
      const hit = pos >= zoneStart && pos <= zoneStart + zoneWidth;
      if (hit) { scored++; audio.sfx('crit'); app.flash('rgba(245,198,107,0.25)', 180); }
      else audio.sfx('miss');
      shot++;
      update();
      if (shot >= TOTAL) { finish(); return; }
      place();
    }

    function finish() {
      live = false;
      cancelAnimationFrame(raf);
      const won = scored >= 3;
      scoreEl.textContent = won
        ? `${scored}/${TOTAL} — the Aurochs win their first cup in twenty-three seasons.`
        : `${scored}/${TOTAL} — twenty-fourth season it is.`;
      audio.sfx(won ? 'levelup' : 'cancel');
      setTimeout(() => {
        window.removeEventListener('keydown', onKey);
        wrap.remove();
        resolve({ won, score: scored });
      }, 1600);
    }

    const onKey = (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); fire(); } };
    window.addEventListener('keydown', onKey);
    app.ui.append(wrap);
    place();
    update();
    raf = requestAnimationFrame(loop);
  });
}

/* ── Dodge the liquidations ───────────────────────────────────────────── */

function dodge(app) {
  return new Promise((resolve) => {
    const TARGET = 8;
    let dodged = 0, live = true, armed = false, timer = null, window_ = 0;

    const count = el('div', { class: 'mg-score' }, `0 / ${TARGET}`);
    const pad = el('div', { class: 'dodge-pad' }, 'wait for the flash');
    const note = el('p', { class: 'fine' }, 'The flash comes first. The thunder is the receipt. You cannot dodge a receipt.');

    const wrap = el('div', { class: 'modal-wrap mg' },
      el('div', { class: 'modal wide' },
        el('h2', {}, 'THE LIQUIDATION PLAINS'),
        el('p', { class: 'fine' }, `Dodge ${TARGET} in a row. Move on the flash, not the noise.`),
        count, pad, note,
        button('Give up', () => finish(false), { class: 'btn small' }),
      ),
    );

    function arm() {
      if (!live) return;
      pad.classList.remove('flash');
      pad.textContent = 'wait…';
      armed = false;
      timer = setTimeout(() => {
        if (!live) return;
        armed = true;
        window_ = performance.now();
        pad.classList.add('flash');
        pad.textContent = 'MOVE';
        audio.sfx('thunder');
        setTimeout(() => {
          if (armed && live) {
            pad.classList.remove('flash');
            pad.textContent = 'liquidated';
            dodged = 0;
            count.textContent = `0 / ${TARGET}`;
            armed = false;
            app.shake(14);
            setTimeout(arm, 700);
          }
        }, 620);
      }, 700 + Math.random() * 1800);
    }

    function tap() {
      if (!live) return;
      if (!armed) {
        pad.textContent = 'too early — the bots saw that';
        dodged = Math.max(0, dodged - 1);
        count.textContent = `${dodged} / ${TARGET}`;
        audio.sfx('error');
        clearTimeout(timer);
        setTimeout(arm, 600);
        return;
      }
      const ms = performance.now() - window_;
      armed = false;
      dodged++;
      count.textContent = `${dodged} / ${TARGET}  (${Math.round(ms)}ms)`;
      audio.sfx('confirm');
      if (dodged >= TARGET) { finish(true); return; }
      setTimeout(arm, 500);
    }

    function finish(won) {
      live = false;
      clearTimeout(timer);
      count.textContent = won
        ? `${TARGET} dodged. You have technically beaten the market.`
        : 'Position closed. The sky did not gloat, which is the worst part.';
      audio.sfx(won ? 'levelup' : 'ko');
      setTimeout(() => {
        window.removeEventListener('keydown', onKey);
        wrap.remove();
        resolve({ won, dodged });
      }, 1500);
    }

    const onKey = (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); tap(); } };
    pad.addEventListener('pointerdown', (e) => { e.preventDefault(); tap(); });
    window.addEventListener('keydown', onKey);
    app.ui.append(wrap);
    arm();
  });
}
