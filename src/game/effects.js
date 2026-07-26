// Projectiles, particles, ground telegraphs and floating damage numbers.

import { T } from '../render/atlas.js';
import { TEAM } from './entity.js';
import { rand } from '../core/math.js';

const hexToRgb = (h) => {
  if (Array.isArray(h)) return h;
  return [
    parseInt(h.slice(1, 3), 16) / 255,
    parseInt(h.slice(3, 5), 16) / 255,
    parseInt(h.slice(5, 7), 16) / 255,
  ];
};

export class Projectile {
  constructor(opts) {
    this.x = opts.x; this.y = opts.y; this.z = opts.z;
    this.owner = opts.owner;
    this.team = opts.team;
    this.damage = opts.damage;
    this.radius = opts.radius || 0;
    this.size = opts.size || 0.25;
    this.color = hexToRgb(opts.color || '#ffffff');
    this.gravity = opts.gravity ?? 0;
    this.life = opts.life ?? 4;
    this.dot = opts.dot || null;
    this.burn = opts.burn || 0;
    this.lifesteal = opts.lifesteal || 0;
    this.pierce = opts.pierce || 0;
    this.onHit = opts.onHit || null;
    this.spin = rand(6, -6);
    this.dead = false;
    this.hitList = new Set();

    const speed = opts.speed || 24;
    if (opts.dir) {
      this.vx = opts.dir[0] * speed;
      this.vy = opts.dir[1] * speed;
      this.vz = opts.dir[2] * speed;
    } else if (opts.target) {
      // Lead the target a little so ranged mobs are not trivially dodged.
      const tx = opts.target.x + (opts.target.vx || 0) * 0.25;
      const ty = opts.target.centerY;
      const tz = opts.target.z + (opts.target.vz || 0) * 0.25;
      const dx = tx - this.x, dy = ty - this.y, dz = tz - this.z;
      const d = Math.hypot(dx, dy, dz) || 1;
      const drop = this.gravity * d / speed * 0.5;
      this.vx = dx / d * speed;
      this.vy = (dy + drop) / d * speed;
      this.vz = dz / d * speed;
    } else {
      this.vx = this.vy = this.vz = 0;
    }
  }

  update(dt, game) {
    this.vy -= this.gravity * dt;
    const steps = Math.max(1, Math.ceil(Math.hypot(this.vx, this.vy, this.vz) * dt / 0.3));
    const sdt = dt / steps;
    for (let s = 0; s < steps && !this.dead; s++) {
      this.x += this.vx * sdt;
      this.y += this.vy * sdt;
      this.z += this.vz * sdt;
      if (game.world.isSolid(this.x, this.y, this.z)) { this.impact(game, null); return; }
      const hit = game.findHit(this.x, this.y, this.z, this.size + 0.35, this.team, this.hitList);
      if (hit) { this.impact(game, hit); return; }
    }
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  impact(game, hit) {
    if (hit) {
      this.hitList.add(hit);
      const dealt = game.dealDamage(this.owner, hit, this.damage, {
        knockback: 3, kx: this.vx, kz: this.vz, source: this.owner,
      });
      if (this.dot) hit.applyDot(this.dot.dps, this.dot.duration, this.dot.type || 'poison', this.owner);
      if (this.burn) hit.applyDot(this.burn, 4, 'burn', this.owner);
      if (this.lifesteal && this.owner) this.owner.heal(dealt * this.lifesteal);
      if (this.onHit) this.onHit(hit, this);
      if (this.pierce > 0) { this.pierce--; return; }
    }
    if (this.radius > 0) {
      game.explode(this.x, this.y, this.z, this.radius, this.damage, {
        team: this.team, source: this.owner, color: this.color, burn: this.burn, exclude: hit,
      });
    } else {
      game.burst(this.x, this.y, this.z, 6, this.color);
    }
    this.dead = true;
  }

  draw(r) {
    const s = this.size;
    r.drawBox(this.x, this.y, this.z, s, s, s, {
      tile: T.BLANK, color: this.color, emissive: 0.9,
      yaw: this.spin * this.life, pitch: this.spin * this.life * 0.7,
    });
  }
}

export class Particle {
  constructor(x, y, z, vx, vy, vz, color, life, size, gravity = 14) {
    this.x = x; this.y = y; this.z = z;
    this.vx = vx; this.vy = vy; this.vz = vz;
    this.color = hexToRgb(color);
    this.life = life; this.maxLife = life;
    this.size = size;
    this.gravity = gravity;
    this.dead = false;
  }

  update(dt) {
    this.vy -= this.gravity * dt;
    this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
    this.vx *= 0.96; this.vz *= 0.96;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  draw(r) {
    const t = this.life / this.maxLife;
    const s = this.size * (0.35 + t * 0.65);
    r.drawBox(this.x, this.y, this.z, s, s, s, {
      tile: T.BLANK, color: this.color, emissive: 0.85, alpha: Math.min(1, t * 2),
    });
  }
}

/** Glowing ring on the ground warning of an incoming AoE. */
export class Telegraph {
  constructor(x, y, z, radius, duration, onComplete, color = '#ff5a3c') {
    this.x = x; this.y = y; this.z = z;
    this.radius = radius;
    this.duration = duration;
    this.timer = duration;
    this.onComplete = onComplete;
    this.color = hexToRgb(color);
    this.dead = false;
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.dead = true;
      if (this.onComplete) this.onComplete();
    }
  }

  draw(r) {
    const p = 1 - this.timer / this.duration;
    const segs = Math.max(12, Math.round(this.radius * 6));
    const pulse = 0.5 + 0.5 * Math.sin(p * 18);
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const rr = this.radius * (0.35 + p * 0.65);
      r.drawBox(this.x + Math.cos(a) * rr, this.y + 0.06, this.z + Math.sin(a) * rr,
        0.34, 0.06, 0.34, { tile: T.BLANK, color: this.color, emissive: 0.7 + pulse * 0.3, alpha: 0.85 });
    }
  }
}

/** A short-lived ring/burst rendered as expanding blocks. */
export class Shockwave {
  constructor(x, y, z, radius, color, duration = 0.35) {
    this.x = x; this.y = y; this.z = z;
    this.radius = radius;
    this.color = hexToRgb(color);
    this.timer = duration;
    this.duration = duration;
    this.dead = false;
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer <= 0) this.dead = true;
  }

  draw(r) {
    const p = 1 - this.timer / this.duration;
    const rr = this.radius * p;
    const segs = Math.max(10, Math.round(this.radius * 5));
    const a0 = p * 1.4;
    for (let i = 0; i < segs; i++) {
      const a = a0 + (i / segs) * Math.PI * 2;
      const s = 0.42 * (1 - p);
      r.drawBox(this.x + Math.cos(a) * rr, this.y + 0.4 + p * 0.6, this.z + Math.sin(a) * rr,
        s, s, s, { tile: T.BLANK, color: this.color, emissive: 1, alpha: 1 - p });
    }
  }
}

/**
 * A lingering damage area — burning ground, poison, and similar. Ticks on a
 * fixed cadence rather than every frame so damage does not scale with frame
 * rate, and so the numbers that pop are readable.
 */
export class Zone {
  constructor(x, y, z, opts) {
    this.x = x; this.y = y; this.z = z;
    this.radius = opts.radius;
    this.dps = opts.dps;
    this.team = opts.team;
    this.source = opts.source || null;
    this.color = hexToRgb(opts.color || '#ff8a3c');
    this.life = opts.duration;
    this.maxLife = opts.duration;
    this.slow = opts.slow || 0;
    this.tick = 0;
    this.dead = false;
  }

  update(dt, game) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    this.tick -= dt;
    if (this.tick > 0) return;
    this.tick = 0.4;

    const targets = this.team === TEAM.PLAYER ? game.mobs : game.allies();
    for (const e of targets) {
      if (e.dead) continue;
      if (Math.hypot(e.x - this.x, e.z - this.z) > this.radius) continue;
      if (Math.abs(e.centerY - this.y) > 3.5) continue;
      if (this.team === TEAM.PLAYER) game.dealDamage(this.source, e, this.dps * 0.4, { silent: true });
      else game.damageEntity(this.source, e, this.dps * 0.4, { melee: false });
      if (this.slow) e.applySlow(this.slow, 0.6);
    }
  }

  draw(r) {
    const fade = Math.min(1, this.life / 0.6);
    const segs = Math.max(10, Math.round(this.radius * 4));
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2 + this.life * 0.6;
      const wobble = 0.85 + Math.sin(this.life * 4 + i) * 0.15;
      const rr = this.radius * wobble;
      const bob = Math.sin(this.life * 6 + i * 0.7) * 0.12;
      r.drawBox(this.x + Math.cos(a) * rr, this.y + 0.12 + bob, this.z + Math.sin(a) * rr,
        0.36, 0.10, 0.36, { tile: T.BLANK, color: this.color, emissive: 0.95, alpha: 0.75 * fade });
    }
    // A sparse inner scatter so the middle of the area reads as dangerous too.
    for (let i = 0; i < segs / 2; i++) {
      const a = (i / (segs / 2)) * Math.PI * 2 - this.life;
      const rr = this.radius * (0.25 + (i % 3) * 0.22);
      r.drawBox(this.x + Math.cos(a) * rr, this.y + 0.1, this.z + Math.sin(a) * rr,
        0.22, 0.06, 0.22, { tile: T.BLANK, color: this.color, emissive: 0.9, alpha: 0.5 * fade });
    }
  }
}

/** Damage number that floats up in screen space (drawn by the HUD). */
export class FloatText {
  constructor(x, y, z, text, color, crit = false) {
    this.x = x; this.y = y; this.z = z;
    this.text = text;
    this.color = color;
    this.crit = crit;
    this.life = crit ? 1.2 : 0.9;
    this.maxLife = this.life;
    this.vy = crit ? 2.4 : 1.8;
    this.dx = rand(0.5, -0.5);
    this.dz = rand(0.5, -0.5);
    this.dead = false;
  }

  update(dt) {
    this.y += this.vy * dt;
    this.x += this.dx * dt;
    this.z += this.dz * dt;
    this.vy *= 0.94;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
}

export { hexToRgb, TEAM };
