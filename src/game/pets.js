// Player-side summons: warlock fiends and shaman totems.

import { Entity, TEAM, drawHumanoid } from './entity.js';
import { T } from '../render/atlas.js';
import { hex } from './mobs.js';

export class Fiend extends Entity {
  constructor(x, y, z, opts) {
    super({ x, y, z, width: 0.5, height: 1.2, hp: opts.hp, team: TEAM.PLAYER });
    this.damageAmount = opts.damage;
    this.speed = opts.speed || 6;
    this.lifetime = opts.duration;
    this.owner = opts.owner;
    this.attackTimer = 0;
    this.isPet = true;
    this.shape = opts.shape || 'imp';
    // A beast stands on four legs, so it is wider and lower than the imp that
    // shares this class.
    if (this.shape === 'beast') { this.width = 0.7; this.height = 1.0; }
    this.spawnOpts = opts;      // kept so Demonic Rebirth can rebuild it
  }

  update(dt, game) {
    this.updateBase(dt, game.world);
    if (this.dead) return;
    this.attackTimer = Math.max(0, this.attackTimer - dt);

    const target = game.nearestEnemy(this.x, this.y, this.z, 26);
    const anchor = target || this.owner;
    if (!anchor) return;

    const dx = anchor.x - this.x, dz = anchor.z - this.z;
    const dist = Math.hypot(dx, dz);
    const nx = dist > 0.01 ? dx / dist : 0;
    const nz = dist > 0.01 ? dz / dist : 0;
    this.turnToward(Math.atan2(-nx, -nz), dt, 8);

    const stopAt = target ? 1.6 : 3.0;
    if (dist > stopAt) {
      this.vx += (nx * this.speed - this.vx) * 0.3;
      this.vz += (nz * this.speed - this.vz) * 0.3;
      if (this.onGround && game.world.isSolid(this.x + nx * 0.5, this.y + 0.1, this.z + nz * 0.5)) this.vy = 8;
    }
    if (target && dist < 2.2 && this.attackTimer <= 0) {
      this.attackTimer = 0.8;
      this.swing = 1;
      game.dealDamage(this, target, this.damageAmount, { knockback: 2, kx: nx, kz: nz });
    }
    this.walkPhase += Math.hypot(this.vx, this.vz) * dt * 3;
  }

  draw(r) {
    if (this.shape === 'beast') return drawBeast(r, this);
    // An imp: small, top-heavy, horned, with a whipping tail and stubby wings.
    // The proportions do most of the work — a head half again too big and legs
    // half as long is what reads as "imp" rather than "small person", and it
    // costs nothing but numbers.
    drawHumanoid(r, this, {
      head: hex('#8f3bb5'), body: hex('#4a1a66'), arm: hex('#7a2f9e'), leg: hex('#3a1050'),
      faceTile: T.FACE_FIEND, emissive: 0.34, scale: 1,
      headScale: 1.5, limbScale: 0.62,
      horns: hex('#2a0c3a'), hornCount: 2,
      tail: hex('#5e1f80'), tailSegs: 5, tailCurl: 1.3,
      wings: hex('#6a2590'), wingAlpha: 0.75, wingScale: 0.7,
    });
  }
}

/**
 * A four-legged animal, drawn as its own thing rather than as a humanoid.
 *
 * The Hunter's beast used the shared biped, which meant the class whose whole
 * identity is a companion animal was followed around by a small purple person.
 * There is no way to fix that with colours: the silhouette is the problem, and
 * a body along Z with four legs under its corners is a different silhouette.
 */
function drawBeast(r, e) {
  const unit = e.height / 1.2;
  const bodyL = 1.05 * unit, bodyH = 0.42 * unit, bodyW = 0.44 * unit;
  const y = e.y + 0.30 * unit + bodyH / 2;
  const c = Math.cos(e.yaw), sn = Math.sin(e.yaw);
  // Local (right, forward) -> world. Forward is -Z in this game's convention.
  const at = (rt, fw) => [e.x + rt * c - fw * sn, e.z - rt * sn - fw * c];
  const skin = e.beastSkin || { body: '#6f5a3c', head: '#8a7047', leg: '#4a3a26', eye: '#ffd24a' };
  const col = (h) => hex(h);
  const common = { yaw: e.yaw, tile: T.SKIN };

  // Barrel.
  r.drawBox(e.x, y, e.z, bodyW, bodyH, bodyL, { ...common, color: col(skin.body) });
  // Head and muzzle, out front and a little high.
  const [hx, hz] = at(0, bodyL * 0.60);
  const headS = 0.40 * unit;
  r.drawBox(hx, y + bodyH * 0.42, hz, headS, headS, headS,
    { ...common, color: col(skin.head), tile: T.SKIN });
  const [mx, mz] = at(0, bodyL * 0.60 + headS * 0.52);
  r.drawBox(mx, y + bodyH * 0.30, mz, headS * 0.52, headS * 0.42, headS * 0.5,
    { ...common, color: col(skin.leg) });
  // Ears, which are most of what makes it read as an animal at distance.
  for (const side of [-1, 1]) {
    const [ex, ez] = at(side * headS * 0.30, bodyL * 0.58);
    r.drawBox(ex, y + bodyH * 0.42 + headS * 0.60, ez, headS * 0.20, headS * 0.44, headS * 0.14,
      { ...common, color: col(skin.head) });
  }
  // Eyes, emissive so the thing looks alive in a dark room.
  for (const side of [-1, 1]) {
    const [ex, ez] = at(side * headS * 0.22, bodyL * 0.60 + headS * 0.44);
    r.drawBox(ex, y + bodyH * 0.50, ez, headS * 0.15, headS * 0.15, headS * 0.08,
      { ...common, color: col(skin.eye), emissive: 0.9 });
  }
  // Four legs, swinging in diagonal pairs off the walk cycle.
  const legH = 0.42 * unit, legW = 0.15 * unit;
  const swing = Math.sin(e.walkPhase || 0) * 0.35;
  let i = 0;
  for (const fw of [bodyL * 0.34, -bodyL * 0.34]) {
    for (const side of [-1, 1]) {
      const phase = (i++ % 2 === 0) ? swing : -swing;
      const [lx, lz] = at(side * bodyW * 0.42, fw + phase * 0.3 * unit);
      r.drawBox(lx, y - bodyH / 2 - legH / 2, lz, legW, legH, legW,
        { ...common, color: col(skin.leg) });
    }
  }
  // Tail, a short taper that sways.
  const [tx, tz] = at(0, -bodyL * 0.58);
  r.drawBox(tx, y + bodyH * 0.25, tz, legW * 0.8, legW * 0.8, 0.35 * unit,
    { ...common, color: col(skin.body), yaw: e.yaw + Math.sin(e.walkPhase || 0) * 0.5 });
}

export class Totem extends Entity {
  constructor(x, y, z, opts) {
    super({ x, y, z, width: 0.5, height: 1.1, hp: opts.hp, team: TEAM.PLAYER });
    this.lifetime = opts.duration;
    this.kind = opts.totem;
    this.radius = opts.radius;
    this.healPerSecond = opts.healPerSecond || 0;
    this.damagePerSecond = opts.damagePerSecond || 0;
    this.owner = opts.owner;
    this.pulse = 0;
    this.isTotem = true;
    this.knockResist = 1;
  }

  update(dt, game) {
    this.updateBase(dt, game.world);
    if (this.dead) return;
    this.vx = 0; this.vz = 0;
    this.pulse += dt;
    if (this.pulse >= 0.5) {
      this.pulse -= 0.5;
      if (this.healPerSecond) {
        for (const ally of game.allies()) {
          if (Math.hypot(ally.x - this.x, ally.z - this.z) <= this.radius) {
            game.healEntity(this.owner, ally, this.healPerSecond * 0.5);
          }
        }
        game.burst(this.x, this.y + 1.2, this.z, 3, '#9dffe0');
      }
      if (this.damagePerSecond) {
        for (const m of game.mobs) {
          if (m.dead) continue;
          if (Math.hypot(m.x - this.x, m.z - this.z) <= this.radius) {
            game.dealDamage(this.owner, m, this.damagePerSecond * 0.5, { silent: true });
          }
        }
      }
    }
  }

  draw(r) {
    const c = this.kind === 'heal' ? [0.36, 1.0, 0.78] : [1.0, 0.6, 0.25];
    r.drawBox(this.x, this.y + 0.3, this.z, 0.34, 0.6, 0.34, { tile: T.LOG_SIDE, color: [0.6, 0.45, 0.3] });
    r.drawBox(this.x, this.y + 0.85, this.z, 0.46, 0.46, 0.46, { tile: T.RUNE, color: c, emissive: 0.9 });
    const bob = Math.sin(this.age * 3) * 0.08;
    r.drawBox(this.x, this.y + 1.35 + bob, this.z, 0.22, 0.22, 0.22, { tile: T.BLANK, color: c, emissive: 1 });
  }
}
