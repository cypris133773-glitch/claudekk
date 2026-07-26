// In-game HUD drawn on a 2D canvas over the WebGL view. Also owns the
// on-screen touch controls and reports their hit rects back to Input.

import { skillCooldown, skillCost } from '../game/skills.js';
import { clamp } from '../core/math.js';

const FONT = "700 %spx 'Segoe UI', system-ui, -apple-system, sans-serif";

export class Hud {
  constructor(canvas, game, input, profile) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.input = input;
    this.profile = profile;
    this.touchMode = false;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
      this.canvas.width = w * dpr;
      this.canvas.height = h * dpr;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w; this.h = h;
  }

  font(size) { this.ctx.font = FONT.replace('%s', size); }

  roundRect(x, y, w, h, r) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  bar(x, y, w, h, pct, color, bg = 'rgba(0,0,0,0.55)', label = null) {
    const c = this.ctx;
    c.fillStyle = bg;
    this.roundRect(x, y, w, h, h / 2); c.fill();
    c.fillStyle = color;
    const fw = Math.max(0, Math.min(1, pct)) * (w - 4);
    if (fw > 0) { this.roundRect(x + 2, y + 2, fw, h - 4, (h - 4) / 2); c.fill(); }
    c.strokeStyle = 'rgba(255,255,255,0.18)';
    c.lineWidth = 1;
    this.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, h / 2); c.stroke();
    if (label) {
      this.font(Math.round(h * 0.62));
      c.fillStyle = 'rgba(255,255,255,0.95)';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.shadowColor = 'rgba(0,0,0,0.8)';
      c.shadowBlur = 4;
      c.fillText(label, x + w / 2, y + h / 2 + 0.5);
      c.shadowBlur = 0;
    }
  }

  draw(dt) {
    this.resize();
    const c = this.ctx;
    const g = this.game;
    c.clearRect(0, 0, this.w, this.h);
    if (!g.running && !g.over) return;
    const p = g.player;
    if (!p) return;

    this.drawFloaters();
    this.drawEnemyHealth();
    this.drawCrosshair();
    this.drawVitals(p);
    this.drawWaveInfo();
    this.drawBuffs(p);
    this.drawNotifications();
    this.drawOffscreenMarkers();
    this.drawSkills(p);
    if (this.touchMode) this.drawJoystick();
    this.drawDamageVignette(p);
  }

  drawDamageVignette(p) {
    const c = this.ctx;
    const hurt = 1 - p.hp / p.maxHp;
    if (hurt < 0.45) return;
    const a = (hurt - 0.45) / 0.55 * 0.5;
    const grad = c.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.25,
      this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.62);
    grad.addColorStop(0, 'rgba(160,0,0,0)');
    grad.addColorStop(1, `rgba(160,0,0,${a.toFixed(3)})`);
    c.fillStyle = grad;
    c.fillRect(0, 0, this.w, this.h);
  }

  drawCrosshair() {
    const c = this.ctx;
    const x = this.w / 2, y = this.h / 2;
    const hit = this.game.hitMarker;
    c.strokeStyle = hit > 0 ? 'rgba(255,90,60,0.95)' : 'rgba(255,255,255,0.65)';
    c.lineWidth = 2;
    const gap = 5 + hit * 14;
    const len = 7;
    c.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      c.moveTo(x + dx * gap, y + dy * gap);
      c.lineTo(x + dx * (gap + len), y + dy * (gap + len));
    }
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.fillRect(x - 1, y - 1, 2, 2);
  }

  drawVitals(p) {
    const c = this.ctx;
    const pad = 16;
    // On phones the bars sit bottom-left, clear of the right-hand button
    // cluster and above the joystick zone.
    const w = this.touchMode ? Math.min(260, this.w * 0.30) : Math.min(340, this.w * 0.42);
    const y = this.h - 78;

    this.bar(pad, y, w, 20, p.hp / p.maxHp, '#e0473c', 'rgba(0,0,0,0.55)',
      `${Math.ceil(p.hp)} / ${p.maxHp}`);
    if (p.absorb > 0) {
      this.bar(pad, y - 12, w * Math.min(1, p.absorb / p.maxHp), 8,
        1, 'rgba(180,220,255,0.9)', 'rgba(0,0,0,0.4)');
    }
    const rd = p.resourceDef;
    this.bar(pad, y + 25, w, 14, p.resource / p.resourceMax, rd.color, 'rgba(0,0,0,0.55)',
      `${Math.floor(p.resource)}`);

    this.font(12);
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.fillText(p.cls.name.toUpperCase() + ' · ' + rd.name, pad + 2, y + 43);
  }

  drawWaveInfo() {
    const c = this.ctx;
    const g = this.game;
    const d = g.director;
    c.textAlign = 'center';
    c.textBaseline = 'top';

    this.font(26);
    c.fillStyle = '#ffffff';
    c.shadowColor = 'rgba(0,0,0,0.7)';
    c.shadowBlur = 6;
    if (d.state === 'intermission') {
      c.fillText(`Wave ${g.wave + 1} in ${Math.ceil(d.intermission)}`, this.w / 2, 14);
    } else {
      c.fillText(`WAVE ${g.wave}`, this.w / 2, 12);
      this.font(14);
      c.fillStyle = 'rgba(255,255,255,0.75)';
      const left = g.mobs.length + d.remaining;
      c.fillText(`${left} enemies left`, this.w / 2, 44);
    }
    c.shadowBlur = 0;

    // Souls counter
    this.font(15);
    c.textAlign = 'right';
    c.fillStyle = '#c9a6ff';
    c.fillText('💠 ' + Math.round(g.soulsEarned), this.w - 16, 16);
    this.font(13);
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.fillText(`${g.player.kills} kills`, this.w - 16, 38);
  }

  drawBuffs(p) {
    const c = this.ctx;
    let x = 16, y = 68;
    this.font(11);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const b of p.buffs) {
      const size = 34;
      c.fillStyle = 'rgba(0,0,0,0.5)';
      this.roundRect(x, y, size, size, 8); c.fill();
      c.strokeStyle = b.color || '#fff';
      c.lineWidth = 2;
      this.roundRect(x + 1, y + 1, size - 2, size - 2, 7); c.stroke();
      this.font(17);
      c.fillStyle = '#fff';
      c.fillText(b.icon || '★', x + size / 2, y + size / 2 - 3);
      this.font(10);
      c.fillStyle = 'rgba(255,255,255,0.85)';
      c.fillText(b.remaining.toFixed(1), x + size / 2, y + size - 6);
      x += size + 6;
    }
    if (p.rampageStacks > 0) {
      this.font(12);
      c.fillStyle = '#ffb27a';
      c.textAlign = 'left';
      c.fillText('Rampage x' + p.rampageStacks, 16, y + 44);
    }
  }

  drawNotifications() {
    const c = this.ctx;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    let y = this.h * 0.26;
    for (const n of this.game.notifications) {
      const a = clamp(n.life / Math.min(0.5, n.max), 0, 1);
      this.font(n.text.includes('WAVE') ? 34 : 20);
      c.globalAlpha = a;
      c.fillStyle = '#fff';
      c.shadowColor = 'rgba(0,0,0,0.8)';
      c.shadowBlur = 8;
      c.fillText(n.text, this.w / 2, y);
      c.shadowBlur = 0;
      c.globalAlpha = 1;
      y += 34;
    }
  }

  drawFloaters() {
    const c = this.ctx;
    const r = this.game.r;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const f of this.game.floaters) {
      const s = r.project(f.x, f.y, f.z);
      if (!s) continue;
      const a = clamp(f.life / f.maxLife, 0, 1);
      const size = (f.crit ? 26 : 18) * clamp(20 / (s.depth + 6), 0.5, 1.4);
      this.font(Math.round(size));
      c.globalAlpha = a;
      c.fillStyle = f.color;
      c.shadowColor = 'rgba(0,0,0,0.9)';
      c.shadowBlur = 5;
      c.fillText(f.text, s.x, s.y);
      c.shadowBlur = 0;
      c.globalAlpha = 1;
    }
  }

  /** Health bars above nearby enemies. */
  drawEnemyHealth() {
    const c = this.ctx;
    const r = this.game.r;
    const p = this.game.player;
    for (const m of this.game.mobs) {
      if (m.dead) continue;
      const d = m.distanceTo(p);
      if (d > 34) continue;
      const s = r.project(m.x, m.y + m.height + 0.35, m.z);
      if (!s || s.x < -60 || s.x > this.w + 60) continue;
      const w = clamp(340 / (s.depth + 4), 24, 90);
      const h = m.def.boss ? 7 : 4;
      const pct = m.hp / m.maxHp;
      c.fillStyle = 'rgba(0,0,0,0.55)';
      c.fillRect(s.x - w / 2, s.y, w, h);
      c.fillStyle = m.def.boss ? '#ff5a3c' : (m.elite ? '#ffd24a' : '#77dd66');
      c.fillRect(s.x - w / 2 + 1, s.y + 1, (w - 2) * pct, h - 2);
      if (m.def.boss || m.elite) {
        this.font(11);
        c.textAlign = 'center';
        c.fillStyle = m.def.boss ? '#ff9a7a' : '#ffd24a';
        c.fillText((m.elite ? 'ELITE ' : '') + m.def.name, s.x, s.y - 8);
      }
    }
  }

  /** Arrows at the screen edge pointing at off-screen threats. */
  drawOffscreenMarkers() {
    const c = this.ctx;
    const r = this.game.r;
    const cx = this.w / 2, cy = this.h / 2;
    for (const m of this.game.mobs) {
      if (m.dead) continue;
      if (!m.def.boss && !m.elite) continue;
      const s = r.project(m.x, m.centerY, m.z);
      const onScreen = s && s.x > 20 && s.x < this.w - 20 && s.y > 20 && s.y < this.h - 20;
      if (onScreen) continue;
      const dx = m.x - this.game.player.x, dz = m.z - this.game.player.z;
      const yaw = this.game.player.yaw;
      // Rotate into view space so the marker sits on the right side of screen.
      const rx = dx * Math.cos(yaw) - dz * Math.sin(yaw);
      const rz = -dx * Math.sin(yaw) - dz * Math.cos(yaw);
      const a = Math.atan2(rx, -rz);
      const rad = Math.min(this.w, this.h) * 0.38;
      const px = cx + Math.sin(a) * rad;
      const py = cy - Math.cos(a) * rad * 0.6;
      c.save();
      c.translate(px, py);
      c.rotate(a);
      c.fillStyle = m.def.boss ? 'rgba(255,90,60,0.9)' : 'rgba(255,210,74,0.9)';
      c.beginPath();
      c.moveTo(0, -10); c.lineTo(7, 6); c.lineTo(-7, 6);
      c.closePath(); c.fill();
      c.restore();
    }
  }

  drawJoystick() {
    const j = this.input.joystick;
    if (!j) return;
    const c = this.ctx;
    c.beginPath();
    c.arc(j.ox, j.oy, j.radius, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(255,255,255,0.25)';
    c.lineWidth = 3;
    c.stroke();
    const dx = j.x - j.ox, dy = j.y - j.oy;
    const d = Math.hypot(dx, dy);
    const k = d > j.radius ? j.radius / d : 1;
    c.beginPath();
    c.arc(j.ox + dx * k, j.oy + dy * k, 26, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,0.30)';
    c.fill();
  }

  /** Skill buttons — clickable on touch, keybind hints on desktop. */
  drawSkills(p) {
    const c = this.ctx;
    const touch = this.touchMode;
    const size = touch ? 62 : 52;
    const gap = touch ? 12 : 10;
    const lefty = this.profile.settings.leftHanded;
    const rects = [];

    const n = p.cls.skills.length;
    const margin = 20;
    const padW = size * 2 + gap;          // width of the 2x2 touch pad
    let baseX, baseY;
    if (touch) {
      // 2x2 pad tucked into the thumb corner; mirrored for left-handed play.
      baseX = lefty ? margin : this.w - margin - padW;
      baseY = this.h - margin - size;
    } else {
      const totalW = n * size + (n - 1) * gap;
      baseX = this.w / 2 - totalW / 2;
      baseY = this.h - size - 18;
    }

    for (let i = 0; i < n; i++) {
      const skill = p.cls.skills[i];
      let x, y;
      if (touch) {
        x = baseX + (i % 2) * (size + gap);
        y = baseY - Math.floor(i / 2) * (size + gap);
      } else {
        x = baseX + i * (size + gap);
        y = baseY;
      }

      const cd = p.cooldowns[i];
      const maxCd = skillCooldown(p, skill);
      const cost = skillCost(p, skill);
      const ready = cd <= 0 && p.resource >= cost;

      c.fillStyle = ready ? 'rgba(18,22,32,0.78)' : 'rgba(10,12,18,0.72)';
      this.roundRect(x, y, size, size, 12); c.fill();
      c.strokeStyle = ready ? p.cls.accent : 'rgba(255,255,255,0.14)';
      c.lineWidth = ready ? 2.5 : 1.5;
      this.roundRect(x + 1, y + 1, size - 2, size - 2, 11); c.stroke();

      this.font(Math.round(size * 0.42));
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.globalAlpha = ready ? 1 : 0.4;
      c.fillStyle = '#fff';
      c.fillText(skill.icon, x + size / 2, y + size / 2 - 2);
      c.globalAlpha = 1;

      if (cd > 0) {
        // Radial cooldown sweep.
        c.save();
        c.beginPath();
        c.moveTo(x + size / 2, y + size / 2);
        c.arc(x + size / 2, y + size / 2, size * 0.7, -Math.PI / 2,
          -Math.PI / 2 + (cd / maxCd) * Math.PI * 2);
        c.closePath();
        c.fillStyle = 'rgba(0,0,0,0.6)';
        c.fill();
        c.restore();
        this.font(Math.round(size * 0.30));
        c.fillStyle = '#fff';
        c.fillText(cd < 1 ? cd.toFixed(1) : Math.ceil(cd), x + size / 2, y + size / 2);
      } else if (p.resource < cost) {
        this.font(11);
        c.fillStyle = '#ff8080';
        c.fillText(Math.round(cost), x + size / 2, y + size - 10);
      }

      if (!touch) {
        this.font(11);
        c.fillStyle = 'rgba(255,255,255,0.55)';
        c.fillText(String(i + 1), x + size / 2, y + size - 8);
      }
      rects.push({ name: 'skill' + i, cx: x + size / 2, cy: y + size / 2, r: size * 0.62 });
    }

    if (touch) {
      // Action cluster sits inboard of the skill pad, on the same thumb.
      const dir = lefty ? 1 : -1;                    // step away from the pad
      const padEdge = lefty ? baseX + padW : baseX;
      const ar = Math.min(46, this.h * 0.13);
      const ax = padEdge + dir * (20 + ar);
      const ay = this.h - margin - ar;
      this.touchButton(ax, ay, ar, '⚔', 'attack', rects, '#ff8a5c');
      this.touchButton(ax, ay - ar - 54, 30, '⤒', 'jump', rects, '#8fd8ff');
      this.touchButton(ax + dir * (ar + 34), ay - 14, 26, '»', 'sprint', rects, '#c9ffb0');
    }
    this.input.setButtonRects(rects);
  }

  touchButton(cx, cy, r, glyph, name, rects, color) {
    const c = this.ctx;
    const held = this.input.heldButtons.has(name);
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fillStyle = held ? 'rgba(255,255,255,0.22)' : 'rgba(12,16,24,0.6)';
    c.fill();
    c.strokeStyle = color;
    c.lineWidth = 2.5;
    c.stroke();
    this.font(Math.round(r * 0.9));
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#fff';
    c.fillText(glyph, cx, cy + 1);
    rects.push({ name, cx, cy, r: r * 1.15 });
  }
}
