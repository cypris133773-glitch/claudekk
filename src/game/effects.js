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
    // Execute-style shots. Kept on the projectile rather than resolved at cast
    // time because the target's health is only known when the arrow lands.
    this.executeThreshold = opts.executeThreshold || 0;
    this.executeMult = opts.executeMult || 1;
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
      const hit = game.findHit(this.x, this.y, this.z, this.size + 0.35, this.team, this.hitList, this.owner);
      if (hit) { this.impact(game, hit); return; }
    }
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  impact(game, hit) {
    if (hit) {
      this.hitList.add(hit);
      let dmg = this.damage;
      if (this.executeThreshold && hit.maxHp && hit.hp / hit.maxHp <= this.executeThreshold) {
        dmg *= this.executeMult;
        game.burst(hit.x, hit.centerY, hit.z, 14, '#ff9a7a');
      }
      const dealt = game.dealDamage(this.owner, hit, dmg, {
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
  /**
   * `tile` is optional and almost always BLANK — a mote is a lit dot and a
   * texture on it is noise. It exists for the one case where the material is
   * the message: frost shards want to be seen as ice rather than as sparks.
   */
  constructor(x, y, z, vx, vy, vz, color, life, size, gravity = 14, tile = T.BLANK) {
    this.x = x; this.y = y; this.z = z;
    this.vx = vx; this.vy = vy; this.vz = vz;
    this.color = Array.isArray(color) ? color : hexToRgb(color);
    this.life = life; this.maxLife = life;
    this.size = size;
    this.gravity = gravity;
    this.tile = tile;
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
      tile: this.tile, color: this.color, emissive: 0.85, alpha: Math.min(1, t * 2),
    });
  }
}

/**
 * A chunk of a dead thing. Unlike a Particle it collides with the world,
 * bounces, tumbles and settles, then fades. Nothing sells a hit like debris
 * that lands on the floor and stays there for a moment.
 */
export class Gib {
  constructor(x, y, z, vx, vy, vz, color, size, life = 2.6, tile = T.CLOTH) {
    this.x = x; this.y = y; this.z = z;
    this.vx = vx; this.vy = vy; this.vz = vz;
    this.color = Array.isArray(color) ? color : hexToRgb(color);
    this.size = size;
    this.tile = tile;
    this.life = life;
    this.maxLife = life;
    this.yaw = Math.random() * Math.PI * 2;
    this.pitch = Math.random() * Math.PI * 2;
    this.spinY = (Math.random() - 0.5) * 14;
    this.spinP = (Math.random() - 0.5) * 14;
    this.resting = false;
    this.dead = false;
  }

  update(dt, game) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    if (this.resting) return;

    this.vy -= 26 * dt;
    const world = game.world;
    const half = this.size * 0.5;

    // Axis-separated stepping, so a chunk slides along a wall instead of
    // sticking to it, and bounces off the floor rather than through it.
    const nx = this.x + this.vx * dt;
    if (world.isSolid(nx + Math.sign(this.vx) * half, this.y, this.z)) this.vx *= -0.4;
    else this.x = nx;

    const nz = this.z + this.vz * dt;
    if (world.isSolid(this.x, this.y, nz + Math.sign(this.vz) * half)) this.vz *= -0.4;
    else this.z = nz;

    const ny = this.y + this.vy * dt;
    if (this.vy < 0 && world.isSolid(this.x, ny - half, this.z)) {
      this.y = Math.floor(ny - half) + 1 + half;
      this.vy *= -0.32;
      this.vx *= 0.62; this.vz *= 0.62;
      this.spinY *= 0.5; this.spinP *= 0.5;
      // Below this a bounce is just jitter; park it and stop simulating.
      if (Math.abs(this.vy) < 1.6) {
        this.resting = true;
        this.vx = this.vy = this.vz = 0;
        this.pitch = Math.round(this.pitch / (Math.PI / 2)) * (Math.PI / 2);
      }
    } else if (this.vy > 0 && world.isSolid(this.x, ny + half, this.z)) {
      this.vy = 0;
    } else {
      this.y = ny;
    }

    this.yaw += this.spinY * dt;
    this.pitch += this.spinP * dt;
  }

  draw(r) {
    // Only the last third fades, so debris reads as solid while it matters.
    const t = this.life / this.maxLife;
    const alpha = Math.min(1, t * 3);
    r.drawBox(this.x, this.y, this.z, this.size, this.size, this.size, {
      tile: this.tile, color: this.color, alpha, yaw: this.yaw, pitch: this.pitch,
    });
  }
}

/** Glowing ring on the ground warning of an incoming AoE. */
/**
 * A potion lying on the arena floor, waiting to be walked over.
 *
 * It falls, settles, then bobs and spins so it stays visible in a crowd, and
 * throws a column of motes upward — a small object on a busy voxel floor is
 * otherwise invisible from head height, and a pickup nobody can see is not a
 * decision, it is a thing that occasionally happens.
 *
 * The last four seconds blink, because a potion that vanishes without warning
 * feels stolen.
 */
export class Potion {
  constructor(x, y, z, def, lifetime) {
    this.x = x; this.y = y; this.z = z;
    this.def = def;
    this.color = hexToRgb(def.color);
    this.glow = hexToRgb(def.glow);
    this.vy = 5.5;
    this.vx = rand(2.2, -2.2);
    this.vz = rand(2.2, -2.2);
    this.life = lifetime;
    this.maxLife = lifetime;
    this.spin = Math.random() * Math.PI * 2;
    this.resting = false;
    this.dead = false;
  }

  update(dt, game) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    this.spin += dt * 2.2;

    if (!this.resting) {
      this.vy -= 24 * dt;
      const world = game.world;
      const nx = this.x + this.vx * dt;
      if (!world.isSolid(nx, this.y, this.z)) this.x = nx; else this.vx *= -0.4;
      const nz = this.z + this.vz * dt;
      if (!world.isSolid(this.x, this.y, nz)) this.z = nz; else this.vz *= -0.4;
      const ny = this.y + this.vy * dt;
      if (this.vy < 0 && world.isSolid(this.x, ny - 0.16, this.z)) {
        this.y = Math.floor(ny - 0.16) + 1.16;
        this.vy = 0; this.vx = 0; this.vz = 0;
        this.resting = true;
        this.restY = this.y;
      } else {
        this.y = ny;
      }
    }

    // Generous pickup radius. This is a phone game played with a thumb, and a
    // pickup you have to stand exactly on is a pickup you walk past.
    const p = game.player;
    if (p && !p.dead && Math.hypot(p.x - this.x, p.z - this.z) < 1.5
      && Math.abs(p.y - this.y) < 2.4) {
      game.collectPotion(this);
      this.dead = true;
    }
  }

  draw(r) {
    // Blink out over the last four seconds rather than simply vanishing.
    if (this.life < 4 && Math.floor(this.life * 6) % 2 === 0) return;
    const bob = this.resting ? Math.sin(this.spin * 1.6) * 0.09 : 0;
    const y = this.y + bob;
    // Body, cork and a soft halo underneath, so it reads on a dark floor.
    r.drawBox(this.x, y, this.z, 0.26, 0.30, 0.26,
      { tile: T.CRYSTAL, color: this.color, emissive: 0.85, yaw: this.spin });
    r.drawBox(this.x, y + 0.21, this.z, 0.11, 0.10, 0.11,
      { tile: T.BLANK, color: this.glow, emissive: 1, yaw: this.spin });
    r.drawBox(this.x, y - 0.20, this.z, 0.62, 0.002, 0.62,
      { tile: T.BLANK, color: this.glow, emissive: 1, alpha: 0.22 });
    // A slow column of motes, which is what actually catches the eye at range.
    for (let i = 0; i < 3; i++) {
      const t = (this.spin * 0.5 + i / 3) % 1;
      r.drawBox(this.x, y + 0.15 + t * 0.9, this.z, 0.07, 0.07, 0.07,
        { tile: T.BLANK, color: this.glow, emissive: 1, alpha: 0.75 * (1 - t) });
    }
  }
}

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
    // Capped, because this runs every frame for the whole warning and raid
    // telegraphs are large: at six segments a block a 9-block ring was 54 boxes
    // a frame for 2.2 seconds, and a raid can have three of them up at once.
    // Past about 40 the segments are closer together than they are wide and the
    // extra ones are drawing on top of each other anyway.
    const segs = Math.min(40, Math.max(12, Math.round(this.radius * 6)));
    const pulse = 0.5 + 0.5 * Math.sin(p * 18);
    // Two rings, and the outer one is the point.
    //
    // The sweeping ring alone was a lie for most of its life: it starts at 35%
    // of the radius and only reaches the true edge on the frame the blast goes
    // off, so a player standing at 80% of a big telegraph saw clear floor right
    // up until it killed them. The dim boundary ring is drawn at the real
    // radius for the whole warning, so where it is safe to stand is known from
    // the first frame; the bright sweep is then just the clock running out.
    //
    // The boundary is drawn at half the density and reads as a dashed line,
    // which costs a third of the frame budget the pair would otherwise want and
    // also tells the two rings apart at a glance.
    const edge = Math.max(0.28, 0.34 - this.radius * 0.01);
    const rr = this.radius * (0.35 + p * 0.65);
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      if (i % 2 === 0) {
        r.drawBox(this.x + Math.cos(a) * this.radius, this.y + 0.05, this.z + Math.sin(a) * this.radius,
          edge, 0.05, edge, { tile: T.BLANK, color: this.color, emissive: 0.35, alpha: 0.42 });
      }
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
    const segs = Math.max(14, Math.round(this.radius * 7));
    // Three rings at different radii and heights instead of one. A single
    // expanding circle of blocks reads as a diagram; a stacked, leaning wall
    // of them reads as a blast.
    for (let ring = 0; ring < 3; ring++) {
      const lag = ring * 0.16;
      const rp = Math.max(0, p - lag) / (1 - lag || 1);
      if (rp <= 0) continue;
      const rr = this.radius * rp;
      const a0 = p * 1.4 + ring * 0.5;
      const height = this.y + 0.35 + rp * (0.7 + ring * 0.55);
      const alpha = (1 - rp) * (1 - ring * 0.22);
      const s = (0.55 - ring * 0.10) * (1 - rp * 0.8);
      if (s <= 0.01 || alpha <= 0.02) continue;
      for (let i = 0; i < segs; i++) {
        const a = a0 + (i / segs) * Math.PI * 2;
        r.drawBox(this.x + Math.cos(a) * rr, height, this.z + Math.sin(a) * rr,
          s, s * 1.8, s, { tile: T.BLANK, color: this.color, emissive: 1, alpha });
      }
    }
    // A column of light at the origin for the first half, so the eye is drawn
    // to where it went off rather than only to the edge that is leaving.
    if (p < 0.55) {
      const a = (1 - p / 0.55);
      r.drawBox(this.x, this.y + 1.4 + p * 3, this.z,
        this.radius * 0.30 * a, 3.2 + p * 5, this.radius * 0.30 * a,
        { tile: T.BLANK, color: this.color, emissive: 1, alpha: a * 0.55 });
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
    // Sanguine pools cut both ways: they burn the player and mend whatever
    // stands in them, as a fraction of max health per tick. That is what makes
    // walking off the corpse the play rather than a preference.
    this.heals = opts.heals || 0;
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

    if (this.heals && this.team === TEAM.ENEMY) {
      for (const m of game.mobs) {
        if (m.dead) continue;
        if (Math.hypot(m.x - this.x, m.z - this.z) > this.radius) continue;
        if (Math.abs(m.centerY - this.y) > 3.5) continue;
        m.heal(m.maxHp * this.heals);
      }
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
