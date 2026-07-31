// In-game HUD drawn on a 2D canvas over the WebGL view. Also owns the
// on-screen touch controls and reports their hit rects back to Input.

import { skillCooldown, skillCost } from '../game/skills.js';
import { clamp } from '../core/math.js';
import { drawSkillIcon } from './icons.js';
import { levelProgress } from '../data/levels.js';
import { POTIONS } from '../data/potions.js';
import { humanoidBoxes } from '../game/entity.js';

const FONT = "700 %spx 'Segoe UI', system-ui, -apple-system, sans-serif";

// Accessibility floor for a touch target, in CSS px. Every on-screen control
// is sized so its *hit* circle clears this even on a 360px-wide phone.
const MIN_TOUCH = 44;

export class Hud {
  constructor(canvas, game, input, profile) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.input = input;
    this.profile = profile;
    this.touchMode = false;
    this.safe = { t: 0, r: 0, b: 0, l: 0 };
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
      this.canvas.width = w * dpr;
      this.canvas.height = h * dpr;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Insets only ever change with the viewport, and reading them forces a
    // style recalc, so this must not happen on every frame.
    if (w !== this.w || h !== this.h) this.safe = this.readSafeArea();
    this.w = w; this.h = h;
  }

  /** Notch / home-indicator insets, via the #safe-probe element in styles.css.
   *  A canvas cannot read env() itself, and controls drawn under the home bar
   *  are swallowed by the system swipe gesture rather than reaching the game. */
  readSafeArea() {
    let el = this.safeProbe;
    if (!el || !el.isConnected) {
      el = document.getElementById('safe-probe');
      if (!el) {
        el = document.createElement('div');
        el.id = 'safe-probe';
        document.body.appendChild(el);
      }
      this.safeProbe = el;
    }
    const s = getComputedStyle(el);
    return {
      t: parseFloat(s.paddingTop) || 0,
      r: parseFloat(s.paddingRight) || 0,
      b: parseFloat(s.paddingBottom) || 0,
      l: parseFloat(s.paddingLeft) || 0,
    };
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
      // Floored: a proportional size makes the resource readout unreadable on
      // the thinner bars.
      this.font(Math.max(11, Math.round(h * 0.62)));
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
    this.drawAimLock(p);
    this.drawEnemyHealth();
    this.drawCrosshair();
    this.drawVitals(p);
    this.drawWaveInfo();
    this.drawAffixes();
    this.drawPotionBelt(p);
    this.drawBuffs(p);
    this.drawCombo();
    this.drawXpPops();
    this.drawNotifications();
    this.drawOffscreenMarkers();
    this.drawMinimap(p);
    this.drawSkills(p);
    if (this.touchMode) this.drawJoystick();
    this.drawDamageVignette(p);
    this.drawImpactFlash();
  }

  /**
   * The wash from a big blast or a boss dying. Drawn last so it sits over the
   * whole HUD, and additively weak enough that the health bars stay readable
   * through it — a flash that hides your own health at the moment a boss
   * explodes is a flash that kills you.
   */
  drawImpactFlash() {
    const g = this.game;
    if (!g.flash || g.flash <= 0.01) return;
    const c = this.ctx;
    const a = g.flash;
    const grad = c.createRadialGradient(
      this.w / 2, this.h / 2, 0,
      this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
    const col = g.flashColor || '#ffffff';
    grad.addColorStop(0, this.rgba(col, a * 0.5));
    grad.addColorStop(0.55, this.rgba(col, a * 0.22));
    grad.addColorStop(1, this.rgba(col, 0));
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = grad;
    c.fillRect(0, 0, this.w, this.h);
    c.restore();
  }

  /** '#ff8a3c' + alpha -> 'rgba(255,138,60,0.4)'. */
  rgba(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha.toFixed(3)})`;
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
    const s = this.safe;
    const pad = 16 + s.l;
    // On desktop the bars sit bottom-left. On touch they go top-left instead:
    // the bottom of a phone screen belongs to the thumbs, and in portrait the
    // control cluster is tall enough to collide with anything down there.
    const w = this.touchMode
      ? Math.min(240, this.w * 0.46)
      : Math.min(340, this.w * 0.42);
    // The block now carries a level bar above the absorb sliver above the
    // health bar, so on touch it has to start clear of the notch by all three
    // — 16px used to be enough and is not any more.
    const y = this.touchMode ? s.t + 30 : this.h - 78 - s.b;
    // Slightly chunkier on touch: these are read at arm's length, mid-fight.
    const hpH = this.touchMode ? 22 : 20;
    const resH = this.touchMode ? 16 : 14;

    // Level and XP, above the health bar and deliberately thin. It is the one
    // number here that does not change during a fight, so it must not compete
    // with the two that do — a fat XP bar over your health is a bar you resent.
    this.drawLevelBar(pad, y - (p.absorb > 0 ? 22 : 11), w);
    this.bar(pad, y, w, hpH, p.hp / p.maxHp, '#e0473c', 'rgba(0,0,0,0.55)',
      `${Math.ceil(p.hp)} / ${p.maxHp}`);
    if (p.absorb > 0) {
      this.bar(pad, y - 12, w * Math.min(1, p.absorb / p.maxHp), 8,
        1, 'rgba(180,220,255,0.9)', 'rgba(0,0,0,0.4)');
    }
    const rd = p.resourceDef;
    this.bar(pad, y + hpH + 5, w, resH, p.resource / p.resourceMax, rd.color,
      'rgba(0,0,0,0.55)', `${Math.floor(p.resource)}`);

    const labelY = y + hpH + resH + 8;
    this.font(12);
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.fillText(p.cls.name.toUpperCase() + ' · ' + rd.name, pad + 2, labelY);
    // Everything else stacked down the left edge follows this cursor, so the
    // blocks cannot drift into each other when a bar changes height.
    this.leftColY = labelY + 18;
  }

  /**
   * The wave's rules, as a row of coloured chips. Kept on screen for the whole
   * wave rather than only announced at the start: an affix you have forgotten
   * is indistinguishable from a bug, and the row is the only place a player can
   * check what just killed them.
   *
   * During the intermission it previews the *next* wave, dimmed, so the rules
   * arrive while there is still time to plan around them.
   */
  drawAffixes() {
    const g = this.game;
    const d = g.director;
    const preview = d.state === 'intermission';
    const list = preview ? (g.upcomingAffixes || []) : (g.affixes || []);
    if (!list.length) return;

    const c = this.ctx;
    const s = this.safe;
    const h = 22;
    const gap = 6;
    const alpha = preview ? 0.55 : 1;

    // Widths first, so the desktop row can be centred as one block and the
    // touch column can stay inside the left margin it shares with the bars.
    this.font(12);
    const chips = list.map((a) => ({ a, w: 26 + c.measureText(a.name.toUpperCase()).width }));
    const total = chips.reduce((n, ch) => n + ch.w, 0) + gap * (chips.length - 1);

    let x, y;
    if (this.touchMode) {
      x = 18 + s.l;
      y = this.leftColY;
      this.leftColY = y + h + 6;
    } else {
      x = Math.max(12, this.w / 2 - total / 2);
      y = preview ? 48 : 64;
    }

    for (const { a, w } of chips) {
      c.globalAlpha = alpha;
      c.fillStyle = 'rgba(8,10,16,0.72)';
      this.roundRect(x, y, w, h, 6);
      c.fill();
      c.strokeStyle = a.color;
      c.lineWidth = 1.5;
      c.stroke();
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      this.font(13);
      c.fillText(a.icon, x + 6, y + h / 2 + 1);
      this.font(12);
      c.fillStyle = a.color;
      c.fillText(a.name.toUpperCase(), x + 24, y + h / 2 + 1);
      c.globalAlpha = 1;
      x += w + gap;
    }
    c.textBaseline = 'top';
  }

  /**
   * Level and progress into it, including whatever this run has already earned.
   * Four pixels tall with the level number beside it — enough to notice fill,
   * small enough to ignore while something is trying to kill you.
   */
  drawLevelBar(x, y, w) {
    const g = this.game;
    if (!g.cls || !g.profile) return;
    const banked = g.profile.classXp ? g.profile.classXp(g.cls.id) : 0;
    const prog = levelProgress(banked + (g.xpEarned || 0));
    const c = this.ctx;
    this.font(10);
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillStyle = prog.maxed ? '#ff9a7a' : '#c9a0ff';
    const label = `Lv ${prog.level}`;
    c.fillText(label, x, y + 4);
    const lw = c.measureText(label).width + 6;

    const bx = x + lw, bw = Math.max(20, w - lw);
    c.fillStyle = 'rgba(0,0,0,0.55)';
    this.roundRect(bx, y + 1, bw, 6, 3); c.fill();
    if (prog.frac > 0) {
      c.fillStyle = prog.maxed ? '#ff7a5a' : '#a35cff';
      this.roundRect(bx + 1, y + 2, Math.max(1, (bw - 2) * prog.frac), 4, 2); c.fill();
    }
    c.strokeStyle = 'rgba(255,255,255,0.14)';
    c.lineWidth = 1;
    this.roundRect(bx + 0.5, y + 1.5, bw - 1, 5, 2.5); c.stroke();
  }

  /**
   * The "+N XP" ticker, under the vitals on the left.
   *
   * Purple, because nothing else in the HUD is — health is red, resource is
   * class-coloured, damage numbers are white and gold. It rises and fades over
   * about a second, and the game batches the awards behind it, so a busy wave
   * produces a handful of readable numbers rather than one per kill.
   */
  drawXpPops() {
    const pops = this.game.xpPops;
    if (!pops || !pops.length) return;
    const c = this.ctx;
    const s = this.safe;
    const x = 18 + s.l;
    // Clear of the left column by more than the rise, or a fresh popup starts
    // inside the affix chip above it and the two are unreadable together.
    const baseY = (this.leftColY || 120) + 24;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    for (let i = 0; i < pops.length; i++) {
      const p = pops[i];
      const t = 1 - p.life / p.max;
      // Quick in, slow out: full opacity almost immediately so it is never
      // missed, then a long fade so it never snaps away.
      const alpha = t < 0.12 ? t / 0.12 : Math.max(0, 1 - (t - 0.12) / 0.88);
      const rise = t * 18;
      const y = baseY + i * 19 - rise;
      this.font(14);
      c.globalAlpha = alpha;
      c.shadowColor = 'rgba(0,0,0,0.9)';
      c.shadowBlur = 5;
      c.fillStyle = '#c9a0ff';
      c.fillText(`+${p.amount.toLocaleString()} XP`, x, y);
      c.shadowBlur = 0;
      c.globalAlpha = 1;
    }
  }

  drawWaveInfo() {
    const c = this.ctx;
    const g = this.game;
    const d = g.director;
    const s = this.safe;
    c.textBaseline = 'top';
    c.shadowColor = 'rgba(0,0,0,0.7)';
    c.shadowBlur = 6;

    if (this.touchMode) {
      // A centred banner does not fit a phone: it lands on the buff row coming
      // up the left edge and directly under the big wave popup, which is drawn
      // centred too. One compact line in the left column collides with neither.
      const x = 18 + s.l;
      const y = this.leftColY;
      this.font(16);
      c.textAlign = 'left';
      c.fillStyle = '#ffffff';
      // A raid has no waves and nothing left to count. The line that carries
      // the run's state has to carry the raid's instead: which raid, and how
      // far into its six you are.
      const head = g.mode === 'raid'
        ? g.raid.name.toUpperCase()
        : (d.state === 'intermission'
          ? `WAVE ${g.wave + 1} IN ${Math.ceil(d.intermission)}`
          : `WAVE ${g.wave}`);
      c.fillText(head, x, y);
      if (g.mode === 'raid') {
        const headW = c.measureText(head).width;
        this.font(13);
        c.fillStyle = 'rgba(255,255,255,0.72)';
        c.fillText(`· boss ${g.raidBossIndex + 1} of ${g.raid.bosses.length}`, x + headW + 8, y + 3);
      } else if (d.state !== 'intermission') {
        const headW = c.measureText(head).width;
        this.font(13);
        c.fillStyle = 'rgba(255,255,255,0.72)';
        c.fillText(`· ${g.mobs.length + d.remaining} left`, x + headW + 8, y + 3);
      }
      this.leftColY = y + 24;
    } else {
      c.textAlign = 'center';
      this.font(this.w < 520 ? 22 : 26);
      c.fillStyle = '#ffffff';
      if (g.mode === 'raid') {
        c.fillText(g.raid.name.toUpperCase(), this.w / 2, 12);
        this.font(14);
        c.fillStyle = 'rgba(255,255,255,0.75)';
        c.fillText(`Boss ${g.raidBossIndex + 1} of ${g.raid.bosses.length}`, this.w / 2, 42);
      } else if (d.state === 'intermission') {
        c.fillText(`Wave ${g.wave + 1} in ${Math.ceil(d.intermission)}`, this.w / 2, 14);
      } else {
        c.fillText(`WAVE ${g.wave}`, this.w / 2, 12);
        this.font(14);
        c.fillStyle = 'rgba(255,255,255,0.75)';
        c.fillText(`${g.mobs.length + d.remaining} enemies left`, this.w / 2, 42);
      }
    }
    c.shadowBlur = 0;

    // Souls counter, inset clear of the 44px fullscreen/pop-out button.
    const rightEdge = this.w - s.r - (this.touchMode ? 62 : 16);
    const top = this.touchMode ? s.t + 16 : 16;
    this.font(15);
    c.textAlign = 'right';
    c.fillStyle = '#c9a6ff';
    c.fillText('🪙 ' + Math.round(g.soulsEarned), rightEdge, top);
    this.font(13);
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.fillText(`${g.player.kills} kills`, rightEdge, top + 22);
  }

  /**
   * The belt: what this class bought in the Potion Shop and has not drunk yet.
   *
   * Round, because everything else stacked down this edge is a rectangle — a
   * bar, a buff, an affix — and the belt has to be findable without reading
   * it. Mid-fight the only question being asked here is "do I still have a
   * red one", and a circle among rectangles answers that in peripheral vision.
   *
   * An empty slot stays on the belt rather than collapsing the row. A belt
   * that reflows as you drink means the icon under your thumb changes while
   * your thumb is moving toward it, and the potion you meant to drink is not
   * the one you drink.
   */
  drawPotionBelt(p) {
    const g = this.game;
    if (!g.cls) return;
    const c = this.ctx;
    const r = this.touchMode ? 19 : 17;
    const gap = this.touchMode ? 12 : 10;
    let x = 16 + this.safe.l + r;
    const y = (this.touchMode ? this.leftColY : 68) + r;

    this.potionRects = [];
    for (let i = 0; i < POTIONS.length; i++) {
      const def = POTIONS[i];
      const held = this.profile.potionCount(g.cls.id, def.id);
      const dim = held <= 0;

      c.save();
      c.globalAlpha = dim ? 0.32 : 1;
      // The glass: the potion's own colour, lit from the top left so it reads
      // as a bottle rather than a token.
      const grad = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
      grad.addColorStop(0, def.glow);
      grad.addColorStop(0.55, def.color);
      grad.addColorStop(1, 'rgba(0,0,0,0.55)');
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fillStyle = grad;
      c.fill();
      c.lineWidth = 2;
      c.strokeStyle = dim ? 'rgba(255,255,255,0.25)' : def.glow;
      c.stroke();
      // A single specular dot. Cheap, and it is what makes the circle read as
      // glass instead of a flat disc.
      c.beginPath();
      c.arc(x - r * 0.34, y - r * 0.36, r * 0.20, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,0.55)';
      c.fill();
      c.restore();

      // Count, in a badge at the lower right so it never sits over the glass.
      c.beginPath();
      c.arc(x + r * 0.72, y + r * 0.72, r * 0.52, 0, Math.PI * 2);
      c.fillStyle = held > 0 ? '#14161d' : 'rgba(20,22,29,0.7)';
      c.fill();
      c.lineWidth = 1.5;
      c.strokeStyle = held > 0 ? '#ffd24a' : 'rgba(255,255,255,0.22)';
      c.stroke();
      this.font(Math.round(r * 0.72));
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = held > 0 ? '#ffd24a' : 'rgba(255,255,255,0.35)';
      c.fillText(String(held), x + r * 0.72, y + r * 0.75);

      // On a keyboard the belt continues the action bar's number row.
      if (!this.touchMode) {
        this.font(10);
        c.fillStyle = 'rgba(255,255,255,0.5)';
        c.fillText(String(5 + i), x, y + r + 9);
      }

      this.potionRects.push({
        name: 'potion' + i, cx: x, cy: y,
        r: Math.max(MIN_TOUCH / 2, r + gap / 2),
      });
      x += r * 2 + gap;
    }
    // Everything stacked below follows the same cursor, so the buffs cannot
    // land on top of the belt. On touch that cursor is the shared one the
    // vitals block sets; on desktop the buffs are the only thing under here.
    const bottom = y + r + (this.touchMode ? 10 : 20);
    if (this.touchMode) this.leftColY = bottom;
    this.buffTop = bottom;
  }

  drawBuffs(p) {
    const c = this.ctx;
    // Sit below the vitals block, wherever that ended up.
    const size = 34;
    let x = 16 + this.safe.l;
    // Below the belt, which is drawn first because it is always there and the
    // buffs are not — a fixture the transient thing flows around.
    let y = this.buffTop !== undefined ? this.buffTop : (this.touchMode ? this.leftColY : 68);
    this.font(11);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const b of p.buffs) {
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
      c.fillText('Rampage x' + p.rampageStacks,
        16 + this.safe.l, y + size + (p.buffs.length ? 12 : 0));
    }
  }

  /**
   * The kill streak, drawn where the eye already is: just above the crosshair.
   * It grows and reddens as it climbs, and the shrinking bar under it is the
   * thing that actually creates the pressure — the streak is always about to
   * die, and pressing forward is the only way to keep it.
   */
  drawCombo() {
    const g = this.game;
    if (!g.combo || g.combo < 3) return;
    const c = this.ctx;
    const heat = Math.min(1, g.combo / 40);
    const x = this.w / 2;
    const y = this.h / 2 - (this.touchMode ? 74 : 92);

    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.shadowColor = 'rgba(0,0,0,0.85)';
    c.shadowBlur = 8;
    this.font(Math.round(22 + heat * 20));
    c.fillStyle = `rgb(255, ${Math.round(210 - heat * 130)}, ${Math.round(90 - heat * 70)})`;
    c.fillText(`${g.combo}`, x, y);
    this.font(12);
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.fillText(`×${g.comboMult.toFixed(2)} gold`, x, y + 20 + heat * 10);
    c.shadowBlur = 0;

    // Time left, as a bar that drains.
    const w = 84 + heat * 40;
    const frac = clamp(g.comboTimer / g.comboWindow, 0, 1);
    c.fillStyle = 'rgba(0,0,0,0.5)';
    this.roundRect(x - w / 2, y + 32 + heat * 10, w, 4, 2); c.fill();
    c.fillStyle = `rgb(255, ${Math.round(200 - heat * 120)}, 70)`;
    this.roundRect(x - w / 2, y + 32 + heat * 10, w * frac, 4, 2); c.fill();
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
  /**
   * An outline around whatever auto-aim is holding, following the shape of the
   * thing rather than a box drawn around it.
   *
   * The assist used to be completely invisible: it quietly turned the view and
   * the player had no way to tell which enemy it had decided on, so a shot that
   * went somewhere unexpected read as the controls misbehaving. The first fix
   * was a rounded rectangle around the projected bounding box, which said the
   * right thing and looked like a screenshot tool.
   *
   * This projects the six boxes the model is actually built from and outlines
   * their union: fill the silhouette, then erase it inset by the line width,
   * which leaves exactly the rim. The HUD is a transparent overlay, so erasing
   * takes the red away and puts nothing back.
   *
   * Red, with a dark halo under it. Red alone disappears in Firelands and
   * Molten Core, which are the two rooms most likely to have something worth
   * locking onto in them.
   */
  drawAimLock(p) {
    const m = p.aimLock;
    if (!m || m.dead) return;
    const r = this.game.r;
    const c = this.ctx;

    // One screen-space rectangle per part. A part behind the camera drops out
    // rather than folding the projection inside out.
    const rects = [];
    for (const b of humanoidBoxes(m, (m.def && m.def.skin && m.def.skin.scale) || 1)) {
      const hw = b.w * 0.5, hh = b.h * 0.5, hd = b.d * 0.5;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let ok = true;
      for (const dx of [-hw, hw]) {
        for (const dy of [-hh, hh]) {
          for (const dz of [-hd, hd]) {
            const sp = r.project(b.x + dx, b.y + dy, b.z + dz);
            if (!sp) { ok = false; break; }
            if (sp.x < minX) minX = sp.x;
            if (sp.y < minY) minY = sp.y;
            if (sp.x > maxX) maxX = sp.x;
            if (sp.y > maxY) maxY = sp.y;
          }
        }
      }
      if (!ok) continue;
      const w = maxX - minX, h = maxY - minY;
      if (!(w > 0) || !(h > 0) || w > this.w * 2 || h > this.h * 2) continue;
      rects.push([minX, minY, w, h]);
    }
    if (rects.length < 2) return;

    // Thickness scales with how big the target is on screen, so a distant husk
    // gets a hairline and a raid boss filling the frame gets a real edge.
    const span = Math.max(...rects.map((q) => q[3]));
    const lw = Math.max(1.6, Math.min(5, span * 0.045));

    const addAll = (inset) => {
      c.beginPath();
      for (const [x, y, w, h] of rects) {
        // A negative inset grows the rect. Positive is clamped so a thin limb
        // cannot invert into a rectangle with negative width.
        const ix = inset < 0 ? inset : Math.min(inset, w * 0.45);
        const iy = inset < 0 ? inset : Math.min(inset, h * 0.45);
        c.rect(x + ix, y + iy, w - ix * 2, h - iy * 2);
      }
    };

    // The rim is drawn *outside* the silhouette rather than inside it: fill the
    // parts grown by the line width, then erase them at their true size. That
    // is what removes the seams where head meets torso and torso meets leg —
    // with an inside rim, two abutting parts each keep a band at the joint and
    // the figure ends up drawn with lines across its neck and hips.
    c.save();
    // A dark halo under it, one step wider again, so the outline survives on a
    // floor of its own hue. Firelands is orange and Molten Core is lit by lava;
    // red on its own disappears in both.
    c.fillStyle = 'rgba(0,0,0,0.5)';
    addAll(-lw * 2);
    c.fill();
    c.globalCompositeOperation = 'destination-out';
    addAll(-lw);
    c.fill();

    c.globalCompositeOperation = 'source-over';
    c.fillStyle = 'rgba(255,58,44,0.95)';
    addAll(-lw);
    c.fill();
    c.globalCompositeOperation = 'destination-out';
    addAll(0);
    c.fill();
    c.restore();
  }


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
      // A 4px bar is invisible on a phone held at arm's length, so touch
      // layouts get a taller bar and a wider floor.
      const touch = this.touchMode;
      const w = clamp(340 / (s.depth + 4), touch ? 32 : 24, 90);
      const h = m.def.boss ? (touch ? 9 : 7) : (touch ? 6 : 4);
      const pct = m.hp / m.maxHp;
      c.fillStyle = 'rgba(0,0,0,0.65)';
      c.fillRect(s.x - w / 2, s.y, w, h);
      c.fillStyle = m.def.boss ? '#ff5a3c' : (m.elite ? '#ffd24a' : '#77dd66');
      c.fillRect(s.x - w / 2 + 1, s.y + 1, (w - 2) * pct, h - 2);
      // A ward is worth reading before you commit a cooldown into it, so it
      // gets its own sliver above the bar rather than being folded into it.
      if (m.absorb > 0) {
        const wp = Math.min(1, m.absorb / m.maxHp);
        c.fillStyle = 'rgba(150,215,255,0.92)';
        c.fillRect(s.x - w / 2, s.y - 4, w * wp, 3);
      }
      // Name and level on everything, not just the headliners: knowing what
      // just walked in and how hard it hits is the difference between reading
      // a fight and being surprised by it. Ordinary mobs get it small and
      // dim so a crowd does not turn into a wall of text.
      const near = d < (m.def.boss || m.elite ? 34 : 16);
      if (near) {
        this.font(m.def.boss ? (touch ? 13 : 12) : (touch ? 11 : 10));
        c.textAlign = 'center';
        c.fillStyle = m.def.boss ? '#ff9a7a' : (m.elite ? '#ffd24a' : 'rgba(255,255,255,0.72)');
        c.shadowColor = 'rgba(0,0,0,0.9)';
        c.shadowBlur = 4;
        c.fillText(m.title, s.x, s.y - 8);
        c.shadowBlur = 0;
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

  /**
   * The stick floats to wherever the thumb lands, which is the right feel but
   * gives a new player nothing to aim at. When it is idle a faint ring marks
   * the resting spot; once a thumb is down the live stick is drawn there
   * instead, with a dead-zone marker so "not moving" is visible.
   */
  drawJoystick() {
    const c = this.ctx;
    const s = this.safe;
    const j = this.input.joystick;
    const radius = this.input.stickRadius;
    const lefty = this.profile.settings.leftHanded;
    const homeX = lefty ? this.w - s.r - 30 - radius : s.l + 30 + radius;
    const homeY = this.h - s.b - 30 - radius;

    if (!j) {
      c.beginPath();
      c.arc(homeX, homeY, radius, 0, Math.PI * 2);
      c.strokeStyle = 'rgba(255,255,255,0.10)';
      c.lineWidth = 2;
      c.stroke();
      c.beginPath();
      c.arc(homeX, homeY, radius * 0.34, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,0.07)';
      c.fill();
      return;
    }

    c.beginPath();
    c.arc(j.ox, j.oy, radius, 0, Math.PI * 2);
    c.fillStyle = 'rgba(8,10,16,0.28)';
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.30)';
    c.lineWidth = 3;
    c.stroke();
    // Dead-zone ring: inside this the character deliberately stands still.
    c.beginPath();
    c.arc(j.ox, j.oy, radius * 0.14, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(255,255,255,0.16)';
    c.lineWidth = 1.5;
    c.stroke();

    const dx = j.x - j.ox, dy = j.y - j.oy;
    const d = Math.hypot(dx, dy);
    const k = d > radius ? radius / d : 1;
    const kx = j.ox + dx * k, ky = j.oy + dy * k;
    c.beginPath();
    c.arc(kx, ky, radius * 0.42, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,0.34)';
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    c.lineWidth = 2;
    c.stroke();
  }

  /**
   * Radar. Shows the arena around you, rotated so "up" is where you are
   * facing — a north-up map forces a mental rotation mid-fight, which is
   * exactly when nobody has the attention for it. Enemies are dots sized by
   * threat; anything outside the range is pinned to the rim so a boss is
   * never simply absent.
   */
  drawMinimap(p) {
    const c = this.ctx;
    const s = this.safe;
    const g = this.game;
    const r = this.touchMode ? clamp(this.w * 0.11, 42, 58) : 68;
    const cx = this.w - s.r - r - 16;
    const cy = s.t + r + (this.touchMode ? 58 : 72);
    const range = 46;                      // world blocks the radar covers

    c.save();
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fillStyle = 'rgba(8,10,16,0.62)';
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.20)';
    c.lineWidth = 1.5;
    c.stroke();

    // Facing wedge, so the dish reads as a view cone rather than a circle.
    c.beginPath();
    c.moveTo(cx, cy);
    c.arc(cx, cy, r, -Math.PI / 2 - 0.62, -Math.PI / 2 + 0.62);
    c.closePath();
    c.fillStyle = 'rgba(255,255,255,0.07)';
    c.fill();

    // Range rings, so distance is readable rather than merely implied.
    c.strokeStyle = 'rgba(255,255,255,0.09)';
    c.lineWidth = 1;
    for (const frac of [0.35, 0.68]) {
      c.beginPath();
      c.arc(cx, cy, r * frac, 0, Math.PI * 2);
      c.stroke();
    }

    c.beginPath();
    c.arc(cx, cy, r - 1, 0, Math.PI * 2);
    c.clip();

    const k = (r - 5) / range;
    const cos = Math.cos(p.yaw), sin = Math.sin(p.yaw);
    /**
     * World delta -> radar pixel. `fwd` is how far ahead of the player the
     * point is; canvas Y grows downward, so it is *subtracted*. Adding it
     * mirrored the whole dish and drew everything in front of you behind you,
     * which is what made the first version useless.
     */
    const project = (dx, dz) => {
      const right = dx * cos - dz * sin;
      const fwd = -dx * sin - dz * cos;
      return { x: cx + right * k, y: cy - fwd * k, dist: Math.hypot(right, fwd) };
    };

    // The end of a wave is where a big arena turns into a search. Once only a
    // few are left, every one of them gets a boss's treatment: pinned to the
    // rim when it is off the dish, drawn larger, and pulsing. Hunting the last
    // husk across the whole floor is not difficulty, it is dead time.
    const hunting = g.mobs.filter((m) => !m.dead).length <= 3;
    const pulse = hunting ? 0.75 + 0.25 * Math.sin(g.time * 6) : 1;
    for (const m of g.mobs) {
      if (m.dead) continue;
      const q = project(m.x - p.x, m.z - p.z);
      let { x: px, y: py } = q;
      const outside = q.dist > range;
      if (outside) {
        // Pinned to the rim: an off-radar boss must still be findable.
        if (!m.def.boss && !m.elite && !hunting) continue;
        const a = Math.atan2(py - cy, px - cx);
        px = cx + Math.cos(a) * (r - 5);
        py = cy + Math.sin(a) * (r - 5);
      }
      const base = m.def.boss ? 4.5 : m.elite ? 3.2 : 2.1;
      const size = hunting && !m.def.boss ? Math.max(base, 3.6) * pulse : base;
      c.beginPath();
      c.arc(px, py, size, 0, Math.PI * 2);
      c.fillStyle = m.def.boss ? '#ff5a3c' : m.elite ? '#ffd24a' : '#ff9a7a';
      c.globalAlpha = outside ? 0.75 : 1;
      c.fill();
      c.globalAlpha = 1;
    }

    // Allies, so a summoned fiend is not mistaken for a threat.
    for (const pet of g.pets) {
      if (pet.dead) continue;
      const q = project(pet.x - p.x, pet.z - p.z);
      if (q.dist > range) continue;
      c.beginPath();
      c.arc(q.x, q.y, 2, 0, Math.PI * 2);
      c.fillStyle = '#7dff9d';
      c.fill();
    }
    c.restore();

    // The player, always dead centre and always pointing up.
    c.beginPath();
    c.moveTo(cx, cy - 5);
    c.lineTo(cx + 3.6, cy + 4);
    c.lineTo(cx - 3.6, cy + 4);
    c.closePath();
    c.fillStyle = '#ffffff';
    c.fill();
  }

  /**
   * The radar's world-to-dish projection, exposed so it can be tested without
   * a canvas. A mirrored radar is worse than none: it points you away from
   * every threat, confidently.
   */
  static radarProject(yaw, dx, dz) {
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    return { right: dx * cos - dz * sin, forward: -dx * sin - dz * cos };
  }

  /** Skill buttons — clickable on touch, keybind hints on desktop. */
  drawSkills(p) {
    const c = this.ctx;
    const touch = this.touchMode;
    const s = this.safe;
    const lefty = this.profile.settings.leftHanded;
    const rects = [];

    const n = p.skills.length;
    // One centred row along the bottom edge, on phone and desktop alike. The
    // corner pad this replaced sat under the same thumb as the attack button,
    // so casting meant letting go of attack; from the middle both thumbs can
    // reach it and neither has to leave its stick.
    // Action-button radius, shrunk on narrow phones so the centred row still
    // has somewhere to live. 170px is what four minimum-size skill buttons
    // plus their gaps need.
    const ar = clamp(Math.min(this.w * 0.085, (this.w - 170) / 4.3), 28, 44);
    // Keep the row clear of the thumb clusters at both edges: overlapping hit
    // circles resolve in list order, so an attack tap would silently cast.
    // 2.15 is the attack button's hit radius as a multiple of its drawn one.
    const reserve = touch ? 18 + ar * 2.15 + 8 : 0;
    const gap = touch ? 8 : 10;
    const avail = Math.max(150, this.w - reserve * 2);
    const size = touch
      ? Math.round(clamp(Math.min(this.w * 0.115, (avail - (n - 1) * gap) / n), 30, 50))
      : 52;
    const totalW = n * size + (n - 1) * gap;
    const baseX = this.w / 2 - totalW / 2;
    const baseY = this.h - size - (touch ? 14 + s.b : 18);

    for (let i = 0; i < n; i++) {
      const skill = p.skills[i];
      const x = baseX + i * (size + gap);
      const y = baseY;

      const cd = p.cooldowns[i];
      const rank = p.rankOf(i);
      const maxCd = skillCooldown(p, skill, rank);
      const cost = skillCost(p, skill);
      const ready = cd <= 0 && p.resource >= cost;

      // Framed slot in the skill's own school colour; readiness is carried by
      // the art itself rather than a separate indicator.
      drawSkillIcon(c, skill, x, y, size, { ready });

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
      // Cap the hit circle at half the pitch so neighbouring buttons cannot
      // claim each other's taps — the first match in the list would win.
      // Rank pip. A player who put four wave-clears into one skill should be
      // able to see that at a glance, on the button they press.
      if (rank > 0) {
        const pr = Math.max(7, size * 0.19);
        c.beginPath();
        c.arc(x + size - pr * 0.7, y + size - pr * 0.7, pr, 0, Math.PI * 2);
        c.fillStyle = '#ffd24a';
        c.fill();
        this.font(Math.round(pr * 1.25));
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = '#14161d';
        c.fillText(String(rank), x + size - pr * 0.7, y + size - pr * 0.62);
      }
      rects.push({
        name: 'skill' + i, cx: x + size / 2, cy: y + size / 2,
        r: Math.max(MIN_TOUCH / 2, Math.min(size * 0.62, (size + gap) / 2)),
      });
    }

    if (touch) {
      // Jump is the only action button left in the thumb corner.
      //
      // Attacking is a tap on the view instead. The attack button was the
      // largest control on the screen and it did the one thing the game
      // already does when you touch anything that is not a control — so it
      // spent its space competing with the look drag it sat next to.
      //
      // Sprint went for the same reason from the other direction: it was on
      // by default, nobody turned it off mid-fight, and a button nobody
      // presses is a button in the way of the ones they do.
      const dir = lefty ? 1 : -1;                     // toward the screen edge
      const edge = lefty ? s.l : this.w - s.r;
      const ax = edge + dir * (18 + ar);
      const ay = this.h - s.b - 22 - ar;
      this.touchButton(ax, ay, ar, '⤒', 'jump', rects, '#8fd8ff');
      // Pause, top centre. On a phone there was no way to reach the menu at
      // all — Esc and the gamepad Start button are the only other routes, and
      // neither exists on a touchscreen. Top centre is the one area no thumb
      // rests on, so it cannot be hit by accident mid-fight.
      this.touchButton(this.w / 2, s.t + 26, 22, '❚❚', 'pause', rects, '#cfd6e6');
    }
    // The belt is drawn far earlier but registers here, because this one call
    // replaces the whole rect list — appending from two places would mean
    // whichever ran second silently deleted the other's buttons.
    //
    // Last in the list on purpose: hits resolve in order, so the belt can
    // never steal a tap from a skill button it happens to overlap on a small
    // screen. Both are in the top-left only in landscape, but that is exactly
    // where a mis-resolved tap would cost the most.
    if (this.potionRects) for (const q of this.potionRects) rects.push(q);
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
