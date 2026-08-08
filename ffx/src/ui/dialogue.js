// Cutscene player. Returns a promise so a screen can `await runScene(...)`
// and carry on afterwards.

import { el, button, clear } from '../core/dom.js';
import { audio } from '../core/audio.js';
import { SPEAKERS } from '../data/story.js';
import { CHARACTERS } from '../data/characters.js';
import { drawPortrait } from '../render/art.js';

const HEART_PALETTE = { main: '#3f7bd8', trim: '#f5c66b', dark: '#0a1030', hair: '#2a2a2a' };
const NPC_PALETTE = { main: '#6a7290', trim: '#cfd8f0', dark: '#1a1e2e', hair: '#2a2f40' };

function paletteFor(who) {
  if (CHARACTERS[who]) return CHARACTERS[who].palette;
  if (who === 'heart') return HEART_PALETTE;
  if (who === 'yunalisa') return { main: '#e0c0ff', trim: '#ff58c8', dark: '#2a1040', hair: '#4a2a6a' };
  if (who === 'yevon') return { main: '#ff58c8', trim: '#ffe98f', dark: '#0b0716', hair: '#000' };
  return NPC_PALETTE;
}

export function runScene(app, lines, opts = {}) {
  return new Promise((resolve) => {
    let i = 0;
    let typing = null;
    let shown = '';

    const nameEl = el('div', { class: 'dlg-name' });
    const textEl = el('div', { class: 'dlg-text' });
    const port = el('canvas', { class: 'dlg-portrait', width: 128, height: 128 });
    const box = el('div', { class: 'dialogue' },
      el('div', { class: 'dlg-inner' },
        port,
        el('div', { class: 'dlg-body' }, nameEl, textEl),
      ),
      el('div', { class: 'dlg-hint' }, 'tap to continue'),
    );
    const skip = button('Skip ⏭', () => finish(), { class: 'btn tiny dlg-skip' });
    const layer = el('div', { class: 'dlg-layer' }, box, skip);

    function drawPort(who) {
      const ctx = port.getContext('2d');
      ctx.clearRect(0, 0, 128, 128);
      if (who === 'narr' || who === 'sys') { port.style.visibility = 'hidden'; return; }
      port.style.visibility = 'visible';
      drawPortrait(ctx, 64, 64, 58, paletteFor(who), CHARACTERS[who]?.build);
    }

    function show(line) {
      const spk = SPEAKERS[line.who] || { name: '', tone: 'npc' };
      box.dataset.tone = spk.tone;
      nameEl.textContent = spk.name || '';
      nameEl.style.display = spk.name ? '' : 'none';
      drawPort(line.who);
      shown = '';
      textEl.textContent = '';
      clearInterval(typing);
      let k = 0;
      const speed = line.who === 'narr' ? 13 : 17;
      typing = setInterval(() => {
        k += 2;
        shown = line.text.slice(0, k);
        textEl.textContent = shown;
        if (k % 6 === 0 && line.who !== 'narr') audio.sfx('cursor');
        if (k >= line.text.length) { clearInterval(typing); typing = null; }
      }, speed);
    }

    function next() {
      if (typing) { // first tap completes the line
        clearInterval(typing);
        typing = null;
        textEl.textContent = lines[i].text;
        return;
      }
      i++;
      if (i >= lines.length) return finish();
      show(lines[i]);
    }

    function finish() {
      clearInterval(typing);
      layer.remove();
      window.removeEventListener('keydown', onKey);
      resolve();
    }

    function onKey(e) {
      if ([' ', 'Enter', 'z', 'Z', 'ArrowRight'].includes(e.key)) { e.preventDefault(); next(); }
      if (e.key === 'Escape') finish();
    }

    layer.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.dlg-skip')) return;
      next();
    });
    window.addEventListener('keydown', onKey);
    app.ui.append(layer);
    show(lines[0]);
    if (opts.shake) app.shake(18);
  });
}
