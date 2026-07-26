// Shared entity base: physics, status effects, damage, and the blocky
// humanoid model every creature in the game is drawn with.

import { T } from '../render/atlas.js';
import { clamp, angleDelta } from '../core/math.js';

export const TEAM = { PLAYER: 0, ENEMY: 1 };

export class Entity {
  constructor(opts = {}) {
    this.x = opts.x || 0; this.y = opts.y || 0; this.z = opts.z || 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = opts.yaw || 0;
    this.pitch = 0;
    this.width = opts.width || 0.6;
    this.height = opts.height || 1.8;
    this.maxHp = opts.hp || 100;
    this.hp = this.maxHp;
    this.team = opts.team ?? TEAM.ENEMY;
    this.onGround = false;
    this.dead = false;
    this.gravity = 26;
    this.hurtFlash = 0;
    this.walkPhase = 0;
    this.swing = 0;              // 0..1 attack animation
    this.attackCooldown = 0;
    this.dots = [];              // { dps, remaining, source, type }
    this.freeze = 0;
    this.stun = 0;
    this.root = 0;
    this.slow = 0; this.slowTimer = 0;
    this.absorb = 0;
    this.invuln = 0;
    this.knockResist = 0;
    this.lifetime = Infinity;
    this.age = 0;
  }

  get eyeY() { return this.y + this.height * 0.9; }
  get centerY() { return this.y + this.height * 0.5; }

  get disabled() { return this.freeze > 0 || this.stun > 0; }

  /** Damage entry point. Returns the amount actually applied. */
  damage(amount, opts = {}) {
    if (this.dead || this.invuln > 0) return 0;
    let dmg = amount;
    if (this.damageTakenMult) dmg *= this.damageTakenMult;
    if (this.absorb > 0) {
      const soaked = Math.min(this.absorb, dmg);
      this.absorb -= soaked;
      dmg -= soaked;
      if (this.absorb <= 0 && this.onAbsorbBroken) this.onAbsorbBroken();
    }
    if (dmg <= 0) return 0;
    this.hp -= dmg;
    this.hurtFlash = 0.22;
    if (opts.knockback && this.knockResist < 1) {
      const k = opts.knockback * (1 - this.knockResist);
      this.vx += (opts.kx || 0) * k;
      this.vz += (opts.kz || 0) * k;
      this.vy += Math.min(k * 0.35, 7);
    }
    if (this.hp <= 0) {
      if (this.onLethal && this.onLethal()) return dmg;
      this.hp = 0;
      this.dead = true;
      this.deathCause = opts.source;
    }
    return dmg;
  }

  heal(amount) {
    if (this.dead) return 0;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp - before;
  }

  /** Add a damage-over-time stack. */
  applyDot(dps, duration, type = 'poison', source = null) {
    const existing = this.dots.find((d) => d.type === type && d.source === source);
    if (existing) {
      existing.dps = Math.max(existing.dps, dps);
      existing.remaining = Math.max(existing.remaining, duration);
    } else {
      this.dots.push({ dps, remaining: duration, type, source });
    }
  }

  totalDotDamageRemaining() {
    return this.dots.reduce((s, d) => s + d.dps * d.remaining, 0);
  }

  applySlow(pct, duration) {
    if (pct >= this.slow || this.slowTimer <= 0) this.slow = pct;
    this.slowTimer = Math.max(this.slowTimer, duration);
  }

  /** Timers, DoT ticks, gravity and world collision. */
  updateBase(dt, world) {
    this.age += dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.swing = Math.max(0, this.swing - dt * 4.5);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.freeze = Math.max(0, this.freeze - dt);
    this.stun = Math.max(0, this.stun - dt);
    this.root = Math.max(0, this.root - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.slowTimer = Math.max(0, this.slowTimer - dt);
    if (this.slowTimer <= 0) this.slow = 0;

    for (let i = this.dots.length - 1; i >= 0; i--) {
      const d = this.dots[i];
      const tick = Math.min(dt, d.remaining);
      const dealt = this.damage(d.dps * tick, { source: d.source, isDot: true });
      if (d.source && d.source.onDotDamage) d.source.onDotDamage(dealt);
      d.remaining -= dt;
      if (d.remaining <= 0) this.dots.splice(i, 1);
    }

    if (!this.noGravity) this.vy -= this.gravity * dt;
    if (world) world.moveAABB(this, dt);
    else { this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt; }

    // Ground friction / air drag.
    const drag = this.onGround ? 0.0016 : 0.28;
    const f = Math.pow(drag, dt);
    this.vx *= f; this.vz *= f;
    if (this.lifetime !== Infinity) {
      this.lifetime -= dt;
      if (this.lifetime <= 0) this.dead = true;
    }
  }

  /** Smoothly turn toward a yaw angle. */
  turnToward(targetYaw, dt, rate = 9) {
    this.yaw += angleDelta(this.yaw, targetYaw) * clamp(dt * rate, 0, 1);
  }

  distanceTo(other) {
    return Math.hypot(this.x - other.x, this.centerY - other.centerY, this.z - other.z);
  }

  distanceXZ(other) {
    return Math.hypot(this.x - other.x, this.z - other.z);
  }
}

// ---------------------------------------------------------------------------
// Blocky humanoid rendering
// ---------------------------------------------------------------------------

/**
 * Draw a Minecraft-style humanoid.
 * `skin` = { head, body, arm, leg, headTile, faceTile, emissive, scale }
 */
export function drawHumanoid(r, e, skin) {
  const s = skin.scale || 1;
  const unit = e.height / 1.8 * s;           // 1.8-block reference height
  const headSize = 0.5 * unit;
  const bodyH = 0.75 * unit, bodyW = 0.55 * unit, bodyD = 0.28 * unit;
  const limbH = 0.72 * unit, limbW = 0.24 * unit;
  const legTop = e.y + limbH;
  const bodyCenterY = legTop + bodyH / 2;
  const headY = legTop + bodyH + headSize / 2;
  const flash = e.hurtFlash > 0 ? Math.min(1, e.hurtFlash * 3.5) : 0;
  const frozen = e.freeze > 0;
  const tintMul = frozen ? 0.6 : 1;
  const col = (c) => [c[0] * tintMul + (frozen ? 0.35 : 0), c[1] * tintMul + (frozen ? 0.45 : 0), c[2] * tintMul + (frozen ? 0.55 : 0)];
  const common = { flash, emissive: skin.emissive || 0, alpha: skin.alpha ?? 1 };

  // Entity yaw follows the camera convention: forward = (-sin, 0, -cos).
  // A cube's local +Z points the other way, so models are drawn at yaw + PI.
  const yaw = e.yaw + Math.PI;
  const rx = Math.cos(e.yaw), rz = -Math.sin(e.yaw);     // world right
  const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw);    // world forward

  const at = (lx, ly, lz) => [e.x + rx * lx + fx * lz, ly, e.z + rz * lx + fz * lz];

  // Legs — swing opposite to each other while walking.
  const swingAmt = Math.sin(e.walkPhase) * 0.7;
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1;
    const p = at(side * limbW * 0.55, legTop, 0);
    r.drawLimb(p[0], p[1], p[2], yaw, side * swingAmt, limbW, limbH, limbW, -limbH / 2,
      { ...common, tile: skin.legTile ?? T.CLOTH, color: col(skin.leg) });
  }

  // Body
  const bp = at(0, bodyCenterY, 0);
  r.drawBox(bp[0], bp[1], bp[2], bodyW, bodyH, bodyD,
    { ...common, tile: skin.bodyTile ?? T.CLOTH, color: col(skin.body), yaw });

  // Arms — the right arm also plays the attack swing.
  const swingPitch = -e.swing * 2.2;
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1;
    const shoulderY = legTop + bodyH - limbW * 0.4;
    const p = at(side * (bodyW / 2 + limbW / 2), shoulderY, 0);
    const pitch = side > 0 ? swingPitch - Math.abs(swingAmt) * 0.4 : -side * swingAmt * 0.8;
    r.drawLimb(p[0], p[1], p[2], yaw, pitch, limbW, limbH, limbW, -limbH / 2,
      { ...common, tile: skin.armTile ?? T.SKIN, color: col(skin.arm) });
  }

  // Head — front face uses the face tile so mobs read as characters.
  const hp = at(0, headY, 0);
  const headPitch = clamp(e.pitch * 0.6, -0.7, 0.7);
  r.drawBox(hp[0], hp[1], hp[2], headSize, headSize, headSize,
    { ...common, tile: skin.headTile ?? T.SKIN, color: col(skin.head), yaw, pitch: headPitch });
  if (skin.faceTile !== undefined && skin.faceTile !== null) {
    // Thin quad-ish slab pushed just in front of the head's forward face.
    const off = headSize / 2 + 0.008;
    const fp = at(0, headY, off);
    r.drawBox(fp[0], fp[1], fp[2], headSize, headSize, 0.001, {
      ...common,
      tile: skin.faceTile,
      color: skin.faceUntinted ? [1, 1, 1] : col(skin.head),
      yaw,
      pitch: headPitch,
    });
  }
  if (skin.hat) {
    const p = at(0, headY + headSize * 0.55, 0);
    r.drawBox(p[0], p[1], p[2], headSize * 1.12, headSize * 0.25, headSize * 1.12,
      { ...common, tile: skin.hatTile ?? T.CLOTH, color: col(skin.hat), yaw });
  }
}
