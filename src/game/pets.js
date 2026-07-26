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
    drawHumanoid(r, this, {
      head: hex('#7a2f9e'), body: hex('#4a1a66'), arm: hex('#7a2f9e'), leg: hex('#3a1050'),
      faceTile: T.FACE_FIEND, emissive: 0.3, scale: 1,
    });
  }
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
