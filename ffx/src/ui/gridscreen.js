// The Stake Grid: pan, pinch, tap a neighbouring node to walk to it, tap the
// node you are standing on to switch it on. Seven petals, seven characters,
// and locks between them so the late game is everybody stealing each other's
// abilities.

import { el, button, clear, fmt } from '../core/dom.js';
import { audio } from '../core/audio.js';
import { GRID, NODE_TYPES } from '../data/grid.js';
import { ABILITIES } from '../data/abilities.js';
import { ITEMS } from '../data/items.js';
import { CHARACTERS } from '../data/characters.js';
import { charStats, canMove, moveTo, canActivate, activate } from '../game/party.js';

export function makeGridScreen(app, onBack) {
  const state = app.state;
  let who = state.party[0];
  let cam = { x: 0, y: 0, z: 0.62 };
  let selected = null;
  let dom = {};
  const drag = { on: false, x: 0, y: 0, moved: 0, pinch: 0 };

  function centreOn(nodeId) {
    const n = GRID.get(nodeId);
    if (!n) return;
    // Frame the whole petal with the pawn in it, rather than putting the pawn
    // dead centre and leaving half the screen empty.
    let cx = 0, cy = 0, count = 0;
    for (const [, node] of GRID) {
      if (node.petal !== n.petal) continue;
      cx += node.x; cy += node.y; count++;
    }
    if (count) { cx /= count; cy /= count; } else { cx = n.x; cy = n.y; }
    cam.x = n.x * 0.35 + cx * 0.65;
    cam.y = n.y * 0.35 + cy * 0.65;
    // A petal is ~700 units across; fit one on screen rather than dropping the
    // player into a wall of dots at 1:1.
    cam.z = Math.max(0.34, Math.min(0.9, Math.min(app.w, app.h) / 820));
  }

  function build() {
    clear(app.ui);
    dom.tabs = el('div', { class: 'grid-tabs' });
    dom.info = el('div', { class: 'grid-info' });
    dom.spheres = el('div', { class: 'grid-spheres' });
    const bar = el('div', { class: 'topbar' },
      el('div', { class: 'topbar-left' },
        el('div', { class: 'chapter-name' }, 'THE STAKE GRID'),
        el('div', { class: 'region-name' }, 'Move costs a Stake Level. Activating costs a sphere.'),
      ),
      el('div', { class: 'topbar-right' },
        button('✕ Back', () => { audio.sfx('cancel'); onBack ? onBack() : app.toField({}); }, { class: 'btn' }),
      ),
    );
    app.ui.append(bar, dom.tabs, dom.spheres, dom.info);
    renderTabs();
    renderSpheres();
    renderInfo();
  }

  function renderTabs() {
    clear(dom.tabs);
    for (const id of state.party) {
      const c = CHARACTERS[id];
      const ch = state.chars[id];
      const b = button(
        el('span', {}, c.name, el('em', {}, ` ${ch.sLv} S.Lv`)),
        () => { who = id; centreOn(state.chars[id].node); selected = null; audio.sfx('cursor'); renderTabs(); renderInfo(); },
        { class: `grid-tab ${who === id ? 'on' : ''}` },
      );
      b.style.setProperty('--tone', c.palette.main);
      dom.tabs.append(b);
    }
  }

  function renderSpheres() {
    clear(dom.spheres);
    for (const id of ['gasSphere', 'copiumSphere', 'mevSphere', 'alphaSphere', 'whaleSphere', 'multisig']) {
      dom.spheres.append(el('div', { class: 'sphere-count', title: ITEMS[id].desc },
        el('b', {}, ITEMS[id].name.replace(' Sphere', '').replace('Multisig Key', 'Key')),
        el('span', {}, fmt(state.inv[id] || 0)),
      ));
    }
  }

  function renderInfo() {
    clear(dom.info);
    const c = state.chars[who];
    const s = charStats(state, who);
    const node = GRID.get(selected || c.node);
    const t = node ? NODE_TYPES[node.type] : null;
    const owned = node && c.nodes.includes(node.id);
    const here = node && node.id === c.node;

    const statLine = el('div', { class: 'grid-stats' },
      ...['hp', 'mp', 'str', 'def', 'mag', 'mdef', 'agi', 'acc', 'eva', 'luck'].map((k) =>
        el('span', {}, el('b', {}, k.toUpperCase()), ' ', fmt(s[k]))),
    );

    let action = null;
    if (node && !here) {
      const chk = canMove(state, who, node.id);
      action = button(chk.ok ? `Walk here — 1 S.Lv` : chk.why, () => {
        const r = moveTo(state, who, node.id);
        if (r.ok) { audio.sfx('confirm'); renderTabs(); renderInfo(); } else audio.sfx('error');
      }, { class: 'btn primary', disabled: !chk.ok });
    } else if (node && here && !owned) {
      const chk = canActivate(state, who, node.id);
      action = button(chk.ok ? `Activate — 1 ${ITEMS[chk.sphere].name}` : chk.why, () => {
        const r = activate(state, who, node.id);
        if (r.ok) {
          audio.sfx('levelup');
          app.flash('rgba(255,88,200,0.2)', 200);
          renderSpheres();
          renderInfo();
        } else audio.sfx('error');
      }, { class: 'btn primary', disabled: !chk.ok });
    }

    dom.info.append(
      el('div', { class: 'grid-node-card' },
        el('h3', {}, node
          ? (node.type === 'ability' ? ABILITIES[node.ability]?.name || 'Ability' : t.label)
          : 'Nowhere'),
        el('p', { class: 'fine' }, node
          ? (node.type === 'ability'
            ? ABILITIES[node.ability]?.desc || ''
            : node.type === 'lock' ? 'A locked gate. Opening it opens it for everybody.' : 'A stat node.')
          : ''),
        owned ? el('p', { class: 'good' }, 'Already active.') : null,
        action,
      ),
      statLine,
    );
  }

  /* ── input ────────────────────────────────────────────────────────── */

  function screenToWorld(sx, sy) {
    return {
      x: (sx - app.w / 2) / cam.z + cam.x,
      y: (sy - app.h / 2) / cam.z + cam.y,
    };
  }

  function nodeAt(sx, sy) {
    const p = screenToWorld(sx, sy);
    let best = null, bestD = 26 / cam.z;
    for (const [, n] of GRID) {
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  function onDown(e) {
    if (e.target.closest('.topbar, .grid-tabs, .grid-info, .grid-spheres')) return;
    drag.on = true;
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.moved = 0;
    app.canvas.setPointerCapture?.(e.pointerId);
  }

  function onMove(e) {
    if (!drag.on) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    cam.x -= dx / cam.z;
    cam.y -= dy / cam.z;
    drag.x = e.clientX;
    drag.y = e.clientY;
  }

  function onUp(e) {
    if (!drag.on) return;
    drag.on = false;
    if (drag.moved < 8) {
      const n = nodeAt(e.clientX, e.clientY);
      if (n) { selected = n.id; audio.sfx('cursor'); renderInfo(); }
    }
  }

  function onWheel(e) {
    e.preventDefault();
    cam.z = Math.max(0.35, Math.min(2.4, cam.z * (e.deltaY > 0 ? 0.9 : 1.1)));
  }

  function onTouchStart() { drag.pinch = 0; }
  function onTouchMove(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (drag.pinch) cam.z = Math.max(0.35, Math.min(2.4, cam.z * (d / drag.pinch)));
      drag.pinch = d;
      drag.on = false;
    }
  }
  function onTouchEnd() { drag.pinch = 0; }

  return {
    music: 'creep',
    enter() {
      build();
      centreOn(state.chars[who].node);
      app.canvas.addEventListener('pointerdown', onDown);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      app.canvas.addEventListener('wheel', onWheel, { passive: false });
      app.canvas.addEventListener('touchstart', onTouchStart, { passive: true });
      app.canvas.addEventListener('touchmove', onTouchMove, { passive: false });
      app.canvas.addEventListener('touchend', onTouchEnd);
    },
    exit() {
      app.canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      app.canvas.removeEventListener('wheel', onWheel);
      app.canvas.removeEventListener('touchstart', onTouchStart);
      app.canvas.removeEventListener('touchmove', onTouchMove);
      app.canvas.removeEventListener('touchend', onTouchEnd);
    },
    update() {},
    draw(ctx, w, h) {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.75);
      g.addColorStop(0, '#0d1030');
      g.addColorStop(1, '#04050d');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(cam.z, cam.z);
      ctx.translate(-cam.x, -cam.y);

      const c = state.chars[who];
      const active = new Set(c.nodes);
      const here = GRID.get(c.node);
      const reach = new Set(here?.links || []);

      // links
      ctx.lineWidth = 2 / cam.z;
      ctx.strokeStyle = 'rgba(120,140,220,0.22)';
      const drawn = new Set();
      for (const [, n] of GRID) {
        for (const l of n.links) {
          const k = n.id < l ? n.id + l : l + n.id;
          if (drawn.has(k)) continue;
          drawn.add(k);
          const m = GRID.get(l);
          if (!m) continue;
          ctx.beginPath();
          ctx.moveTo(n.x, n.y);
          ctx.lineTo(m.x, m.y);
          ctx.stroke();
        }
      }

      // nodes
      for (const [, n] of GRID) {
        const t = NODE_TYPES[n.type];
        const on = active.has(n.id);
        const near = reach.has(n.id);
        const r = n.type === 'ability' ? 11 : n.type === 'lock' ? 12 : 8;
        if (on) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const gg = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 3);
          gg.addColorStop(0, t.tone);
          gg.addColorStop(1, 'transparent');
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = gg;
          ctx.beginPath();
          ctx.arc(n.x, n.y, r * 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.beginPath();
        if (n.type === 'lock') {
          ctx.rect(n.x - r, n.y - r, r * 2, r * 2);
        } else if (n.type === 'ability') {
          ctx.moveTo(n.x, n.y - r);
          ctx.lineTo(n.x + r, n.y);
          ctx.lineTo(n.x, n.y + r);
          ctx.lineTo(n.x - r, n.y);
          ctx.closePath();
        } else {
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        }
        ctx.fillStyle = n.open ? '#2a3a20' : on ? t.tone : n.type === 'empty' ? '#161c2e' : '#1b2340';
        ctx.fill();
        ctx.lineWidth = (near ? 2.6 : 1.4) / cam.z;
        ctx.strokeStyle = near ? '#ffe98f' : on ? '#ffffff88' : t.tone + '66';
        ctx.stroke();

        if (selected === n.id) {
          ctx.lineWidth = 3 / cam.z;
          ctx.strokeStyle = '#4ee0e6';
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 7, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // other characters' pawns, then yours on top
      for (const id of state.party) {
        const node = GRID.get(state.chars[id].node);
        if (!node) continue;
        const isMe = id === who;
        ctx.save();
        ctx.globalAlpha = isMe ? 1 : 0.42;
        ctx.fillStyle = CHARACTERS[id].palette.main;
        ctx.beginPath();
        ctx.arc(node.x, node.y - 20, isMe ? 9 : 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#04050d';
        ctx.font = `700 ${isMe ? 10 : 8}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(CHARACTERS[id].name.slice(0, 2).toUpperCase(), node.x, node.y - 17);
        ctx.restore();
      }
      ctx.restore();
    },
  };
}
