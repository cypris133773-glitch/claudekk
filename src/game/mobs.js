// Enemy definitions and AI.

import { Entity, TEAM, drawHumanoid } from './entity.js';
import { T } from '../render/atlas.js';
import { clamp, rand, pick } from '../core/math.js';

const hex = (h) => [
  parseInt(h.slice(1, 3), 16) / 255,
  parseInt(h.slice(3, 5), 16) / 255,
  parseInt(h.slice(5, 7), 16) / 255,
];

/**
 * Mob archetypes. `weight` drives spawn frequency; `minWave` gates them in.
 * `face` is the atlas tile used for the front of the head cube.
 */
export const MOB_TYPES = {
  husk: {
    name: 'Husk', weight: 10, minWave: 1, cost: 1,
    hp: 60, damage: 9, speed: 3.1, range: 2.0, attackSpeed: 0.85, souls: 3,
    height: 1.8, width: 0.6, behavior: 'melee',
    skin: { head: hex('#6a8f5a'), body: hex('#3f6f8f'), arm: hex('#6a8f5a'), leg: hex('#33517a'), face: T.FACE_HUSK },
  },
  crawler: {
    name: 'Crawler', weight: 7, minWave: 2, cost: 1,
    hp: 42, damage: 7, speed: 5.4, range: 1.8, attackSpeed: 1.4, souls: 3,
    height: 1.2, width: 0.7, behavior: 'leaper',
    skin: { head: hex('#3b2b3f'), body: hex('#2a1e2e'), arm: hex('#4a3550'), leg: hex('#2a1e2e'), face: T.FACE_CRAWLER },
  },
  skele: {
    name: 'Bonecaster', weight: 6, minWave: 3, cost: 2,
    hp: 50, damage: 10, speed: 2.9, range: 18, attackSpeed: 0.6, souls: 5,
    height: 1.8, width: 0.55, behavior: 'ranged', projectile: { speed: 22, gravity: 6, color: '#e8e4d0', size: 0.22 },
    skin: { head: hex('#e0dcc4'), body: hex('#cfcab0'), arm: hex('#e0dcc4'), leg: hex('#cfcab0'), face: T.FACE_SKELE, headTile: T.BONE, bodyTile: T.BONE },
  },
  bomber: {
    name: 'Bomber', weight: 5, minWave: 4, cost: 2,
    hp: 45, damage: 32, speed: 4.0, range: 2.6, attackSpeed: 1, souls: 6,
    height: 1.6, width: 0.6, behavior: 'bomber', fuse: 1.15, blastRadius: 4.6,
    skin: { head: hex('#5fbf62'), body: hex('#4aa84d'), arm: hex('#4aa84d'), leg: hex('#3d8c40'), face: T.FACE_BOMBER },
  },
  brute: {
    name: 'Brute', weight: 4, minWave: 6, cost: 3,
    hp: 190, damage: 19, speed: 2.6, range: 2.8, attackSpeed: 0.6, souls: 12,
    height: 2.6, width: 0.9, behavior: 'slammer', knockResist: 0.7,
    skin: { head: hex('#8a6a4a'), body: hex('#6f5138'), arm: hex('#8a6a4a'), leg: hex('#5a4330'), face: T.FACE_HUSK, hat: hex('#3a2c20') },
  },
  reaper: {
    name: 'Reaper', weight: 3, minWave: 9, cost: 4,
    hp: 130, damage: 17, speed: 4.6, range: 2.4, attackSpeed: 1.1, souls: 15,
    height: 2.0, width: 0.6, behavior: 'blinker',
    skin: { head: hex('#3a2050'), body: hex('#221338'), arm: hex('#4a2a66'), leg: hex('#221338'), face: T.FACE_BOSS, emissive: 0.18 },
  },
  colossus: {
    name: 'Colossus', weight: 0, minWave: 5, cost: 0, boss: true,
    hp: 520, damage: 28, speed: 2.5, range: 4.0, attackSpeed: 0.55, souls: 90,
    height: 4.2, width: 1.5, behavior: 'boss', knockResist: 1,
    skin: { head: hex('#9a3f2f'), body: hex('#6d2a20'), arm: hex('#9a3f2f'), leg: hex('#4d1d16'), face: T.FACE_BOSS, hat: hex('#c9a227'), emissive: 0.12 },
  },
};

export class Mob extends Entity {
  constructor(typeId, wave, x, y, z, scaling) {
    const t = MOB_TYPES[typeId];
    super({ x, y, z, width: t.width, height: t.height, hp: Math.round(t.hp * scaling.hp), team: TEAM.ENEMY });
    this.typeId = typeId;
    this.def = t;
    this.damageAmount = t.damage * scaling.damage;
    this.speed = t.speed * scaling.speed;
    this.souls = Math.round(t.souls * scaling.souls);
    this.knockResist = t.knockResist || 0;
    this.attackTimer = rand(0.6, 0);
    this.state = 'chase';
    this.fuse = 0;
    this.blinkTimer = rand(5, 3);
    this.slamTimer = rand(4, 2);
    this.wave = wave;
    this.elite = false;
    this.id = (Math.random() * 100000) | 0;   // used for per-mob strafe direction
    this.stuckTimer = 0;
    this.strikes = 0;                         // consecutive windows with no progress
    this.windowTimer = 0;
    this.windowDist = undefined;
    this.avoidTimer = 0;
    this.avoidSign = 1;
  }

  makeElite() {
    this.elite = true;
    this.maxHp = Math.round(this.maxHp * 2.4);
    this.hp = this.maxHp;
    this.damageAmount *= 1.5;
    this.speed *= 1.12;
    this.souls = Math.round(this.souls * 3);
    this.height *= 1.15;
    return this;
  }

  update(dt, game) {
    const world = game.world;
    const player = game.player;
    this.updateBase(dt, world);
    if (this.dead) return;

    // Lava hurts everyone.
    const inLava = game.blockDamageAt(this.x, this.y + 0.2, this.z);
    if (inLava) this.damage(inLava * dt, { source: null });

    this.avoidTimer = Math.max(0, this.avoidTimer - dt);

    if (this.disabled) { this.vx *= 0.2; this.vz *= 0.2; return; }

    const target = game.pickEnemyTarget(this) || player;
    const dx = target.x - this.x, dz = target.z - this.z;
    const dist = Math.hypot(dx, dz);
    const nx = dist > 0.001 ? dx / dist : 0;
    const nz = dist > 0.001 ? dz / dist : 0;
    // Face the target (camera convention: forward = (-sin, -cos)).
    this.turnToward(Math.atan2(-nx, -nz), dt, 7);

    const speed = this.speed * (1 - this.slow) * (this.root > 0 ? 0 : 1);
    this.attackTimer = Math.max(0, this.attackTimer - dt);

    switch (this.def.behavior) {
      case 'ranged': this.aiRanged(dt, game, target, dist, nx, nz, speed); break;
      case 'bomber': this.aiBomber(dt, game, target, dist, nx, nz, speed); break;
      case 'leaper': this.aiLeaper(dt, game, target, dist, nx, nz, speed); break;
      case 'slammer': this.aiSlammer(dt, game, target, dist, nx, nz, speed); break;
      case 'blinker': this.aiBlinker(dt, game, target, dist, nx, nz, speed); break;
      case 'boss': this.aiBoss(dt, game, target, dist, nx, nz, speed); break;
      default: this.aiMelee(dt, game, target, dist, nx, nz, speed);
    }

    this.walkPhase += Math.hypot(this.vx, this.vz) * dt * 2.4;
    this.autoJump(world, nx, nz);
    this.checkStuck(dt, game, dist);
  }

  /**
   * Leash failsafe. Terrain can strand a mob where it will never reach the
   * player — stuck on a tower, wedged in geometry, or across a lava channel it
   * will not path around. The wave then never clears and the run softlocks.
   *
   * Progress is measured over a sliding window rather than instantaneously, so
   * a mob that is genuinely closing the gap is never punished. The check only
   * arms when a mob is far away or is one of the stragglers holding up the end
   * of a wave, so ordinary combat and player kiting are unaffected.
   */
  checkStuck(dt, game, dist) {
    const target = game.player;
    // A ranged mob only counts as engaged if it can actually land a shot —
    // sitting at nominal range behind a wall is exactly the stuck case.
    const engaged = this.def.behavior === 'ranged'
      ? dist < this.def.range
        && game.world.lineOfSight(this.x, this.eyeY, this.z, target.x, target.centerY, target.z)
      : dist <= this.def.range + 1.5;
    if (engaged) {
      this.strikes = 0;
      this.windowDist = dist;
      this.windowTimer = 0;
      return;
    }

    this.windowTimer = (this.windowTimer || 0) + dt;
    if (this.windowTimer < 4) return;
    this.windowTimer = 0;

    const improved = this.windowDist === undefined || dist < this.windowDist - 1.5;
    this.windowDist = dist;
    this.strikes = improved ? 0 : (this.strikes || 0) + 1;
    if (this.strikes < 3) return;         // 12s of no progress

    this.strikes = 0;
    const pt = game.world.pickSpawn(game.player.x, game.player.z, 9);
    game.burst(this.x, this.centerY, this.z, 8, '#6a2fb5');
    this.x = pt.x; this.y = pt.y + 0.2; this.z = pt.z;
    this.vx = this.vy = this.vz = 0;
    this.windowDist = undefined;
    game.burst(this.x, this.centerY, this.z, 8, '#6a2fb5');
  }

  /** Hop up a single block when walking into a ledge. */
  autoJump(world, nx, nz) {
    if (!this.onGround) return;
    const ahead = 0.55;
    const fx = this.x + nx * ahead, fz = this.z + nz * ahead;
    if (world.isSolid(fx, this.y + 0.1, fz) && !world.isSolid(fx, this.y + 1.2, fz)) {
      this.vy = 8.4;
    }
  }

  /**
   * Steer toward a direction, swinging wide around anything solid.
   * The mobs have no pathfinder — they steer straight at their target — so
   * without this they wedge against pillars and walls and never arrive.
   * On a collision the mob commits to one side for a moment and slides along
   * the obstruction until it is clear.
   */
  moveToward(nx, nz, speed) {
    if (this.hitWallX || this.hitWallZ) {
      if (this.avoidTimer <= 0) this.avoidSign = this.id % 2 ? 1 : -1;
      this.avoidTimer = 0.9;
    }
    let dx = nx, dz = nz;
    if (this.avoidTimer > 0) {
      // Rotate the desired heading ~70 degrees to the committed side.
      const a = this.avoidSign * 1.22;
      const c = Math.cos(a), s = Math.sin(a);
      dx = nx * c - nz * s;
      dz = nx * s + nz * c;
    }
    this.vx += (dx * speed - this.vx) * 0.28;
    this.vz += (dz * speed - this.vz) * 0.28;
  }

  strafe(nx, nz, speed, sign) {
    this.vx += (-nz * speed * sign - this.vx) * 0.18;
    this.vz += (nx * speed * sign - this.vz) * 0.18;
  }

  meleeHit(game, target, mult = 1, knockback = 4) {
    this.swing = 1;
    const dx = target.x - this.x, dz = target.z - this.z;
    const d = Math.hypot(dx, dz) || 1;
    game.dealDamage(this, target, this.damageAmount * mult, { knockback, kx: dx / d, kz: dz / d });
  }

  aiMelee(dt, game, target, dist, nx, nz, speed) {
    if (dist > this.def.range) this.moveToward(nx, nz, speed);
    else {
      this.moveToward(nx, nz, speed * 0.15);
      if (this.attackTimer <= 0) {
        this.attackTimer = 1 / this.def.attackSpeed;
        this.meleeHit(game, target);
      }
    }
  }

  aiLeaper(dt, game, target, dist, nx, nz, speed) {
    if (dist < this.def.range) {
      if (this.attackTimer <= 0) {
        this.attackTimer = 1 / this.def.attackSpeed;
        this.meleeHit(game, target, 1, 3);
      }
      this.moveToward(nx, nz, speed * 0.3);
    } else {
      this.moveToward(nx, nz, speed);
      // Pounce from mid range.
      if (this.onGround && dist > 4 && dist < 9 && Math.random() < dt * 0.9) {
        this.vy = 9.5;
        this.vx = nx * speed * 2.1;
        this.vz = nz * speed * 2.1;
      }
    }
  }

  aiRanged(dt, game, target, dist, nx, nz, speed) {
    const ideal = 11;
    if (dist > ideal + 3) this.moveToward(nx, nz, speed);
    else if (dist < ideal - 3) this.moveToward(-nx, -nz, speed);
    else this.strafe(nx, nz, speed * 0.7, this.id % 2 ? 1 : -1);

    if (this.attackTimer <= 0 && dist < this.def.range
      && game.world.lineOfSight(this.x, this.eyeY, this.z, target.x, target.centerY, target.z)) {
      this.attackTimer = 1 / this.def.attackSpeed;
      this.swing = 1;
      game.fireProjectile({
        owner: this, team: TEAM.ENEMY,
        x: this.x, y: this.eyeY, z: this.z,
        target, damage: this.damageAmount,
        ...this.def.projectile,
      });
    }
  }

  aiBomber(dt, game, target, dist, nx, nz, speed) {
    if (this.state === 'fuse') {
      this.fuse -= dt;
      this.vx *= 0.7; this.vz *= 0.7;
      if (this.fuse <= 0) {
        game.explode(this.x, this.centerY, this.z, this.def.blastRadius, this.damageAmount, {
          team: TEAM.ENEMY, source: this, color: '#7dff7d',
        });
        this.hp = 0;
        this.dead = true;
        this.exploded = true;
      }
      return;
    }
    this.moveToward(nx, nz, speed);
    if (dist < this.def.range) {
      this.state = 'fuse';
      this.fuse = this.def.fuse;
      game.sfx('fuse');
    }
  }

  aiSlammer(dt, game, target, dist, nx, nz, speed) {
    this.slamTimer -= dt;
    if (dist > this.def.range) this.moveToward(nx, nz, speed);
    else {
      this.moveToward(nx, nz, speed * 0.2);
      if (this.slamTimer <= 0) {
        this.slamTimer = rand(6, 4);
        this.swing = 1;
        game.telegraph(this.x, this.y, this.z, 5.0, 0.6, () => {
          game.explode(this.x, this.y + 0.4, this.z, 5.0, this.damageAmount * 1.6, {
            team: TEAM.ENEMY, source: this, color: '#c9a06a', knockback: 9,
          });
        });
      } else if (this.attackTimer <= 0) {
        this.attackTimer = 1 / this.def.attackSpeed;
        this.meleeHit(game, target, 1, 6);
      }
    }
  }

  aiBlinker(dt, game, target, dist, nx, nz, speed) {
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0 && dist > 5) {
      this.blinkTimer = rand(7, 4);
      const bx = target.x - nx * 2.2, bz = target.z - nz * 2.2;
      const by = game.world.groundAt(bx, bz, target.y + 3);
      game.burst(this.x, this.centerY, this.z, 14, '#a35cff');
      this.x = bx; this.y = by; this.z = bz;
      game.burst(this.x, this.centerY, this.z, 14, '#a35cff');
      game.sfx('blink');
    }
    this.aiMelee(dt, game, target, dist, nx, nz, speed);
  }

  aiBoss(dt, game, target, dist, nx, nz, speed) {
    this.slamTimer -= dt;
    if (this.slamTimer <= 0) {
      this.slamTimer = rand(7, 5);
      const phase = this.hp / this.maxHp;
      if (phase < 0.5 && Math.random() < 0.5) {
        // Enrage phase: summon adds.
        game.sfx('roar');
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          game.spawnMob('husk', this.x + Math.cos(a) * 3, this.y + 1, this.z + Math.sin(a) * 3);
        }
      } else {
        this.swing = 1;
        game.telegraph(target.x, target.y, target.z, 7.0, 1.35, () => {
          game.explode(target.x, target.y + 0.4, target.z, 7.0, this.damageAmount * 1.4, {
            team: TEAM.ENEMY, source: this, color: '#ff7a3c', knockback: 12,
          });
        });
      }
    }
    this.aiMelee(dt, game, target, dist, nx, nz, speed);
  }

  draw(r) {
    const s = this.def.skin;
    const fusing = this.state === 'fuse';
    const pulse = fusing ? 0.5 + Math.sin(this.age * 40) * 0.5 : 0;
    drawHumanoid(r, this, {
      head: s.head, body: s.body, arm: s.arm, leg: s.leg, hat: s.hat,
      headTile: s.headTile ?? T.SKIN,
      bodyTile: s.bodyTile ?? T.CLOTH,
      faceTile: r.customHeadTile !== undefined && !this.def.boss ? r.customHeadTile : s.face,
      faceUntinted: r.customHeadTile !== undefined && !this.def.boss,
      emissive: Math.max(s.emissive || 0, pulse * 0.8, this.elite ? 0.15 : 0),
      scale: this.elite ? 1.12 : 1,
    });
  }
}

/** Choose a mob type for the current wave, respecting unlock gates. */
export function rollMobType(wave) {
  const pool = [];
  for (const [id, t] of Object.entries(MOB_TYPES)) {
    if (t.boss || t.weight <= 0) continue;
    if (wave < t.minWave) continue;
    for (let i = 0; i < t.weight; i++) pool.push(id);
  }
  return pool.length ? pick(pool) : 'husk';
}

export { hex };
