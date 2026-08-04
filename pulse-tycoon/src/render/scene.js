// The canvas half of the game: a chart that never stops, a coin that wants to
// be tapped, and a ring of stations that visibly do work. Everything is drawn
// from shapes — no image files anywhere in this project.

import { STATIONS } from '../data/stations.js';
import * as E from '../game/economy.js';
import { fmt, money, clamp01 } from '../core/format.js';
import { HYPE_NAME, HYPE_TAG } from '../data/hypeman.js';

const CANDLE_COUNT = 48;
const CANDLE_PERIOD = 0.32; // seconds between new candles

export function createScene(canvas, getState) {
  const ctx = canvas.getContext('2d');
  let w = 0;
  let h = 0;
  let dpr = 1;

  const candles = [];
  let candleClock = 0;
  let price = 100;
  const floats = [];
  const rings = [];
  let t = 0;
  let coinPress = 0; // 0..1, decays; drives the squash on tap
  let speech = { text: '', until: 0 };
  let lastIncome = 0;

  for (let i = 0; i < CANDLE_COUNT; i++) candles.push(makeCandle(price, 0));

  function makeCandle(prev, bias) {
    const drift = (Math.random() - 0.5 + bias) * 6;
    const open = prev;
    const close = Math.max(8, open + drift);
    const wick = Math.random() * 4 + 1;
    return {
      o: open,
      c: close,
      h: Math.max(open, close) + wick,
      l: Math.min(open, close) - wick,
    };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    w = Math.max(1, Math.round(rect.width));
    h = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // The bottom strip belongs to the man in the sunglasses and his speech
  // bubble, so the coin sits above centre and the station ring is squashed
  // into an ellipse rather than a circle.
  function layout() {
    const cx = w * 0.5;
    const cy = h * 0.44;
    const r = Math.min(w, h) * 0.15;
    return { cx, cy, r, orbitX: r * 2.35, orbitY: r * 1.75 };
  }

  function nodeAt(i) {
    const { cx, cy, orbitX, orbitY } = layout();
    const a = angleFor(i);
    return { x: cx + Math.cos(a) * orbitX, y: cy + Math.sin(a) * orbitY };
  }

  function hypeScale() {
    return Math.max(0.9, Math.min(1.7, h * 0.0038));
  }

  // --- public pokes ---------------------------------------------------------

  function pop(stationId, amount) {
    const i = STATIONS.findIndex((s) => s.id === stationId);
    if (i < 0) return;
    const { x, y } = nodeAt(i);
    floats.push({
      x,
      y,
      vy: -34 - Math.random() * 16,
      life: 1,
      text: '+' + money(amount, 1),
      hue: STATIONS[i].hue,
      size: 12,
    });
    rings.push({ x, y, life: 1, hue: STATIONS[i].hue, r0: 12 });
    if (floats.length > 40) floats.splice(0, floats.length - 40);
  }

  function popTap(amount) {
    const { cx, cy, r } = layout();
    floats.push({
      x: cx + (Math.random() - 0.5) * r,
      y: cy - r * 0.4,
      vy: -60,
      life: 1.2,
      text: '+' + money(amount, 1),
      hue: 320,
      size: 17,
    });
    coinPress = 1;
    rings.push({ x: cx, y: cy, life: 1, hue: 320, r0: r });
  }

  function say(text, seconds = 6) {
    speech = { text, until: t + seconds };
  }

  // Only the coin is clickable; the station ring is a readout, and making it
  // tappable would fight the list below for the same intent.
  function hitTest(x, y) {
    const { cx, cy, r } = layout();
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= r * r * 1.35 ? 'coin' : null;
  }

  // --- drawing --------------------------------------------------------------

  function angleFor(i) {
    // Start at the top and go clockwise, so station 1 is where the eye lands.
    return -Math.PI / 2 + (i / STATIONS.length) * Math.PI * 2;
  }

  function drawBackground(state, pumping) {
    const g = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
    g.addColorStop(0, pumping ? '#2a1140' : '#161029');
    g.addColorStop(1, '#07060f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = '#7b5cff';
    ctx.lineWidth = 1;
    const step = Math.max(28, Math.round(h / 8));
    ctx.beginPath();
    for (let y = step; y < h; y += step) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawCandles() {
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of candles) {
      if (c.l < lo) lo = c.l;
      if (c.h > hi) hi = c.h;
    }
    const span = Math.max(1, hi - lo);
    const bw = w / CANDLE_COUNT;
    const top = h * 0.08;
    const bot = h * 0.92;
    const yOf = (v) => bot - ((v - lo) / span) * (bot - top);

    ctx.globalAlpha = 0.5;
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const x = i * bw + bw * 0.5;
      const up = c.c >= c.o;
      ctx.strokeStyle = up ? '#26d07c' : '#ff4d6d';
      ctx.fillStyle = up ? '#26d07c' : '#ff4d6d';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, yOf(c.h));
      ctx.lineTo(x, yOf(c.l));
      ctx.stroke();
      const yo = yOf(c.o);
      const yc = yOf(c.c);
      ctx.fillRect(x - bw * 0.3, Math.min(yo, yc), bw * 0.6, Math.max(1.5, Math.abs(yc - yo)));
    }
    ctx.globalAlpha = 1;
  }

  function hexPath(cx, cy, r, rot) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = rot + (i / 6) * Math.PI * 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function drawCoin(state, pumping) {
    const { cx, cy, r } = layout();
    // Two pulses layered: a slow breath, and the fast squash from a tap.
    const breath = 1 + Math.sin(t * 2.2) * 0.03;
    const squash = 1 - coinPress * 0.12;
    const rr = r * breath * squash;

    ctx.save();
    ctx.shadowBlur = pumping ? 46 : 26;
    ctx.shadowColor = pumping ? '#ffd166' : '#ff45c0';

    const g = ctx.createLinearGradient(cx - rr, cy - rr, cx + rr, cy + rr);
    g.addColorStop(0, pumping ? '#ffd166' : '#ff45c0');
    g.addColorStop(0.55, '#a02bff');
    g.addColorStop(1, '#2ad2ff');
    ctx.fillStyle = g;
    hexPath(cx, cy, rr, t * 0.25);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 2;
    hexPath(cx, cy, rr * 0.82, t * 0.25);
    ctx.stroke();

    // A heartbeat trace across the face — the one motif that says what this
    // whole thing is a joke about.
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const s = rr * 0.62;
    const pts = [
      [-1, 0], [-0.55, 0], [-0.4, -0.45], [-0.18, 0.5],
      [0.05, -0.7], [0.28, 0.28], [0.45, 0], [1, 0],
    ];
    for (let i = 0; i < pts.length; i++) {
      const px = cx + pts[i][0] * s;
      const py = cy + pts[i][1] * s * 0.72;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '600 11px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('TAP', cx, cy + rr + 18);
  }

  function drawStations(state) {
    const nodeR = Math.max(10, Math.min(w, h) * 0.042);

    for (let i = 0; i < STATIONS.length; i++) {
      const st = STATIONS[i];
      const level = state.levels[st.id] || 0;
      const { x, y } = nodeAt(i);
      const owned = level > 0;
      const auto = state.advisors.includes(st.id);

      ctx.globalAlpha = owned ? 1 : 0.25;
      ctx.fillStyle = owned ? `hsl(${st.hue} 85% 60%)` : '#3a3550';
      hexPath(x, y, nodeR, 0);
      ctx.fill();

      if (owned) {
        const time = E.cycleTime(st, level);
        const p = clamp01((state.cycles[st.id] || 0) / time);
        // The arc is the only place cycle progress is visible at a glance, so
        // it gets the bright stroke even when the node is dim.
        ctx.strokeStyle = auto ? '#ffffff' : 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, nodeR + 5, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#0b0916';
        ctx.font = '700 10px ui-monospace, Menlo, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(level), x, y);
        ctx.textBaseline = 'alphabetic';
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawFloats(dt) {
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.life -= dt * 0.85;
      f.y += f.vy * dt;
      f.vy *= 0.94;
      if (f.life <= 0) {
        floats.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = clamp01(f.life);
      ctx.fillStyle = `hsl(${f.hue} 90% 72%)`;
      ctx.font = `700 ${f.size}px ui-monospace, Menlo, Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    for (let i = rings.length - 1; i >= 0; i--) {
      const rg = rings[i];
      rg.life -= dt * 1.8;
      if (rg.life <= 0) {
        rings.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = clamp01(rg.life) * 0.6;
      ctx.strokeStyle = `hsl(${rg.hue} 90% 70%)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(rg.x, rg.y, rg.r0 + (1 - rg.life) * 30, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // The caricature: bald head, shades, chain, and a watch the size of a coaster.
  function drawHypeman() {
    const scale = hypeScale();
    const x = 46 * scale + 12;
    const y = h - 10;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    // shoulders
    ctx.fillStyle = '#191426';
    ctx.beginPath();
    ctx.moveTo(-46, 0);
    ctx.quadraticCurveTo(-38, -46, 0, -46);
    ctx.quadraticCurveTo(38, -46, 46, 0);
    ctx.closePath();
    ctx.fill();

    // chain
    ctx.fillStyle = '#ffd166';
    for (let i = -4; i <= 4; i++) {
      const cxx = i * 5.2;
      const cyy = -30 + Math.abs(i) * Math.abs(i) * 0.62;
      ctx.beginPath();
      ctx.arc(cxx, cyy, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }

    // head
    ctx.fillStyle = '#e8b48c';
    ctx.beginPath();
    ctx.ellipse(0, -70, 22, 26, 0, 0, Math.PI * 2);
    ctx.fill();

    // stubble jaw
    ctx.fillStyle = 'rgba(40,30,45,0.45)';
    ctx.beginPath();
    ctx.ellipse(0, -58, 16, 11, 0, 0, Math.PI);
    ctx.fill();

    // sunglasses, permanently
    ctx.fillStyle = '#0d0b16';
    ctx.beginPath();
    ctx.roundRect(-21, -80, 42, 13, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.roundRect(-18, -78, 12, 5, 2);
    ctx.fill();

    // raised hand + watch
    ctx.fillStyle = '#e8b48c';
    ctx.beginPath();
    ctx.ellipse(40, -34, 9, 11, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(45, -22, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0d0b16';
    ctx.beginPath();
    ctx.arc(45, -22, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Anchored to the bottom edge next to the figure and grown upwards, so a
  // long line never creeps up into the coin.
  function drawSpeech() {
    if (!speech.text || t > speech.until) return;
    const scale = hypeScale();
    const bx = 12 + 92 * scale;
    const bottom = h - 12;
    const maxW = Math.min(w - bx - 12, 320);
    if (maxW < 120) return; // too narrow to read; the line will come round again

    const pad = 10;
    ctx.font = '500 12px system-ui, -apple-system, Segoe UI, sans-serif';
    const words = speech.text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const probe = line ? line + ' ' + word : word;
      if (ctx.measureText(probe).width > maxW - pad * 2 && line) {
        lines.push(line);
        line = word;
      } else line = probe;
    }
    if (line) lines.push(line);

    const bh = lines.length * 16 + pad * 2 + 14;
    const top = bottom - bh;
    ctx.fillStyle = 'rgba(12,10,24,0.92)';
    ctx.strokeStyle = 'rgba(255,69,192,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx, top, maxW, bh, 10);
    ctx.fill();
    ctx.stroke();

    // The name lives inside the bubble, where the "(parody)" tag is next to
    // the words rather than floating loose over the chart.
    ctx.textAlign = 'left';
    ctx.font = '700 9px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillStyle = 'rgba(255,69,192,0.9)';
    ctx.fillText(HYPE_NAME, bx + pad, top + pad + 4);
    const nameW = ctx.measureText(HYPE_NAME).width;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText('· ' + HYPE_TAG, bx + pad + nameW + 5, top + pad + 4);

    ctx.font = '500 12px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], bx + pad, top + pad + 22 + i * 16);
    }
  }

  function drawPumpBanner(state) {
    const left = state.pumpUntil - state.clock;
    if (left <= 0) return;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#ffd166';
    ctx.font = '800 15px ui-monospace, Menlo, Consolas, monospace';
    // Bottom-right: the top strip belongs to the HUD and the bottom-left to
    // the man in the sunglasses.
    ctx.textAlign = 'right';
    ctx.fillText(`PUMP x${E.pumpMult(state)} · ${left.toFixed(1)}s`, w - 14, h - 14);
    ctx.restore();
  }

  function render(dt) {
    const state = getState();
    t += dt;
    coinPress = Math.max(0, coinPress - dt * 4);

    const pumping = state.pumpUntil > state.clock;
    const income = E.incomePerSecond(state);
    // The chart leans green while the empire is growing. It is cosmetic, and
    // it is the fastest read on the screen.
    const bias = pumping ? 0.5 : income > lastIncome ? 0.15 : -0.05;
    lastIncome = income;

    candleClock += dt;
    const period = pumping ? CANDLE_PERIOD * 0.45 : CANDLE_PERIOD;
    while (candleClock >= period) {
      candleClock -= period;
      price = candles[candles.length - 1].c;
      candles.push(makeCandle(price, bias));
      candles.shift();
    }

    drawBackground(state, pumping);
    drawCandles();
    drawStations(state);
    drawCoin(state, pumping);
    drawFloats(dt);
    drawHypeman();
    drawSpeech();
    drawPumpBanner(state);
  }

  resize();
  return { resize, render, pop, popTap, say, hitTest };
}
