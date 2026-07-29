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
  stalker: {
    name: 'Stalker', weight: 5, minWave: 7, cost: 2,
    hp: 78, damage: 13, speed: 6.2, range: 2.2, attackSpeed: 1.6, souls: 8,
    height: 1.9, width: 0.5, behavior: 'leaper',
    skin: { head: hex('#2a3f2a'), body: hex('#1c2b1c'), arm: hex('#38543a'), leg: hex('#1c2b1c'), face: T.FACE_CRAWLER, horns: hex('#c9d6b0') },
  },
  hexer: {
    name: 'Hexer', weight: 4, minWave: 11, cost: 3,
    hp: 95, damage: 15, speed: 3.4, range: 20, attackSpeed: 0.7, souls: 14,
    height: 1.9, width: 0.6, behavior: 'ranged', projectile: { speed: 20, gravity: 3, color: '#b06cff', size: 0.3 },
    skin: { head: hex('#4a2a5e'), body: hex('#2c1838'), arm: hex('#5e3575'), leg: hex('#241629'), face: T.FACE_BOSS, hat: hex('#7a3f9e'), emissive: 0.2, horns: hex('#c98fff') },
  },
  juggernaut: {
    name: 'Juggernaut', weight: 3, minWave: 14, cost: 4,
    hp: 320, damage: 26, speed: 2.9, range: 3.0, attackSpeed: 0.5, souls: 22,
    height: 3.0, width: 1.05, behavior: 'slammer', knockResist: 0.85,
    skin: { head: hex('#5a5a62'), body: hex('#3e3e46'), arm: hex('#5a5a62'), leg: hex('#2e2e36'), face: T.FACE_HUSK, headTile: T.METAL, bodyTile: T.METAL, hat: hex('#8a2f22'), horns: hex('#c9c9d2'), pauldrons: hex('#6f6f7a') },
  },
  wraith: {
    name: 'Wraith', weight: 3, minWave: 18, cost: 4,
    hp: 150, damage: 21, speed: 5.2, range: 2.4, attackSpeed: 1.2, souls: 26,
    height: 2.2, width: 0.55, behavior: 'blinker',
    skin: { head: hex('#10303a'), body: hex('#0a1e26'), arm: hex('#164654'), leg: hex('#0a1e26'), face: T.FACE_BOSS, emissive: 0.35, alpha: 0.82, horns: hex('#7ef0ff') },
  },
  // --- Bosses. One is drawn per boss wave, rotating so the fight changes. ---
  colossus: {
    name: 'Colossus', weight: 0, minWave: 5, cost: 0, boss: true,
    hp: 520, damage: 28, speed: 2.5, range: 4.0, attackSpeed: 0.55, souls: 90,
    height: 4.2, width: 1.5, behavior: 'boss', knockResist: 1,
    tagline: 'Slow, enormous, hits like a landslide.',
    skin: { head: hex('#9a3f2f'), body: hex('#6d2a20'), arm: hex('#9a3f2f'), leg: hex('#4d1d16'), face: T.FACE_BOSS, hat: hex('#c9a227'), emissive: 0.12 },
  },
  warden: {
    name: 'Warden', weight: 0, minWave: 10, cost: 0, boss: true,
    hp: 430, damage: 22, speed: 3.4, range: 30, attackSpeed: 0.8, souls: 100,
    height: 3.4, width: 1.0, behavior: 'boss_warden', knockResist: 1,
    tagline: 'Keeps its distance, burns the ground you stand on.',
    projectile: { speed: 26, gravity: 2, color: '#7ef0ff', size: 0.3 },
    skin: { head: hex('#2f6f9a'), body: hex('#1d4a6d'), arm: hex('#2f6f9a'), leg: hex('#153549'), face: T.FACE_BOSS, hat: hex('#7ef0ff'), emissive: 0.22 },
  },
  broodmother: {
    name: 'Broodmother', weight: 0, minWave: 15, cost: 0, boss: true,
    hp: 620, damage: 24, speed: 3.0, range: 3.2, attackSpeed: 0.7, souls: 110,
    height: 2.8, width: 1.4, behavior: 'boss_brood', knockResist: 0.9,
    tagline: 'Never fights alone. Kill it before the swarm buries you.',
    skin: { head: hex('#4a2a5e'), body: hex('#33203f'), arm: hex('#5e3575'), leg: hex('#241629'), face: T.FACE_CRAWLER, emissive: 0.14 },
  },
};

/** Boss ids in the order they are introduced. */
export const BOSS_IDS = ['colossus', 'warden', 'broodmother'];

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
    // Every enemy carries a level, so the same Husk at wave 30 reads as a
    // different threat from the one at wave 2 rather than looking identical
    // and hitting six times harder for no visible reason.
    this.level = Math.max(1, wave);
    this.elite = false;
    this.id = (Math.random() * 100000) | 0;   // used for per-mob strafe direction
    this.stuckTimer = 0;
    this.strikes = 0;                         // consecutive windows with no progress
    this.windowTimer = 0;
    this.windowDist = undefined;
    this.avoidTimer = 0;
    this.avoidSign = 1;
    this.windup = 0;                          // telegraphed swing in progress
    this.flinch = 0;                          // staggered by a heavy hit
    this.flinchLock = 0;                      // immunity window after a stagger
    this.sepX = 0;
    this.sepZ = 0;
    // A fixed per-mob lean, so a pack spreads into an arc around the player
    // instead of every member steering at the same point.
    this.slotBias = (((this.id % 7) - 3) / 3) * 0.55;
  }

  /** Name as it appears over the enemy: "Husk lvl 12", "Elite Brute lvl 20". */
  get title() {
    return `${this.elite ? 'Elite ' : ''}${this.def.name} lvl ${this.level}`;
  }

  makeElite() {
    this.elite = true;
    // An elite is a tougher version of the same thing, and the level should
    // say so: it is worth the attention its brighter bar asks for.
    this.level += 3;
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
    // A hit worth a fifth of its health staggers it. Cancelling the wind-up
    // is the point: interrupting a swing is what makes a big hit feel big,
    // and it gives melee a reason to commit rather than only trade.
    this.flinchLock = Math.max(0, this.flinchLock - dt);
    if (this.flinchLock <= 0 && this.hurtFlash > 0.21
      && this.lastHitFraction > 0.18 && !this.def.boss) {
      this.flinch = this.lastHitFraction > 0.4 ? 0.4 : 0.22;
      game.sfx('stagger');
      // Without this window a fast, hard-hitting build chain-staggers a mob
      // for the whole fight: it never closes, never dies, and the wave never
      // ends. The lock is what keeps a stagger a moment rather than a state.
      this.flinchLock = this.flinch + 1.4;
      this.windup = 0;
      this.lastHitFraction = 0;
    }
    if (this.flinch > 0) {
      this.flinch -= dt;
      this.vx *= 0.86; this.vz *= 0.86;
      this.walkPhase += Math.hypot(this.vx, this.vz) * dt * 2.4;
      // Still run the leash: a mob that cannot act must not also be exempt
      // from the failsafe that rescues a stalled wave.
      this.checkStuck(dt, game, this.distanceXZ(game.player));
      return;
    }

    if (this.disabled) { this.vx *= 0.2; this.vz *= 0.2; return; }

    const target = game.pickEnemyTarget(this) || player;
    const dx = target.x - this.x, dz = target.z - this.z;
    const dist = Math.hypot(dx, dz);
    let nx = dist > 0.001 ? dx / dist : 0;
    let nz = dist > 0.001 ? dz / dist : 0;

    this.updateSeparation(game);
    this.crowd = this.crowdRank(game, target);
    // Approach on an arc rather than a straight line. Mobs at the back of a
    // pack lean harder, so a group fans out and surrounds instead of forming
    // one conga line that the player can out-walk forever.
    if (dist > this.def.range * 0.8 && !this.def.boss) {
      const lean = this.slotBias * Math.min(1, this.crowd / 3);
      if (lean) {
        const cs = Math.cos(lean), sn = Math.sin(lean);
        const ax = nx * cs - nz * sn, az = nx * sn + nz * cs;
        nx = ax; nz = az;
      }
    }
    // Face the target (camera convention: forward = (-sin, -cos)).
    this.turnToward(Math.atan2(-nx, -nz), dt, 7);

    const speed = this.speed * (1 - this.slow) * (this.root > 0 ? 0 : 1);
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.resolveWindup(dt, game, target, dist);

    switch (this.def.behavior) {
      case 'ranged': this.aiRanged(dt, game, target, dist, nx, nz, speed); break;
      case 'bomber': this.aiBomber(dt, game, target, dist, nx, nz, speed); break;
      case 'leaper': this.aiLeaper(dt, game, target, dist, nx, nz, speed); break;
      case 'slammer': this.aiSlammer(dt, game, target, dist, nx, nz, speed); break;
      case 'blinker': this.aiBlinker(dt, game, target, dist, nx, nz, speed); break;
      case 'boss': this.aiBoss(dt, game, target, dist, nx, nz, speed); break;
      case 'boss_warden': this.aiWarden(dt, game, target, dist, nx, nz, speed); break;
      case 'boss_brood': this.aiBrood(dt, game, target, dist, nx, nz, speed); break;
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

    // Last-resort failsafe, keyed on damage rather than geometry. Whatever the
    // cause — wedged terrain, a pit that eats projectiles, a range the player
    // will not close — a survivor that has taken no damage for a long time
    // while gating the next wave is relocated into the player's lap. Distance
    // heuristics cannot cover every cause; "cannot be hurt" covers all of them.
    if (game.director.state === 'clearing' && this.age - this.lastDamagedAge > 25) {
      this.relocateNear(game, target);
      return;
    }

    // Anything that fights at range only counts as engaged if it can actually
    // land a shot — sitting at nominal range behind a wall is the stuck case.
    const ranged = this.def.behavior === 'ranged' || this.def.behavior === 'boss_warden';
    const engaged = ranged
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
    this.relocateNear(game, target);
  }

  /** Teleport onto a fresh spawn point near the player. */
  relocateNear(game, target) {
    const pt = game.world.pickSpawn(target.x, target.z, 9);
    game.burst(this.x, this.centerY, this.z, 8, '#6a2fb5');
    this.x = pt.x; this.y = pt.y + 0.2; this.z = pt.z;
    this.vx = this.vy = this.vz = 0;
    this.windowDist = undefined;
    this.strikes = 0;
    this.lastDamagedAge = this.age;
    game.burst(this.x, this.centerY, this.z, 8, '#6a2fb5');
  }

  /**
   * Repulsion from other enemies. Without it every mob steers at the same
   * point and the pack collapses into a single stack: only the front one can
   * ever land a hit, and area damage kills the entire wave at once. Bosses
   * push but are not pushed — being shoved out of a slam is not a fight.
   */
  updateSeparation(game) {
    let sx = 0, sz = 0;
    for (const other of game.mobs) {
      if (other === this || other.dead) continue;
      const dx = this.x - other.x, dz = this.z - other.z;
      const want = (this.width + other.width) * 1.15 + 0.35;
      const d2 = dx * dx + dz * dz;
      if (d2 > want * want || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      // Falls off linearly to zero at the desired spacing.
      const push = (1 - d / want) * (other.def.boss ? 2 : 1);
      sx += (dx / d) * push;
      sz += (dz / d) * push;
    }
    const mag = Math.hypot(sx, sz);
    if (mag > 1.6) { sx = sx / mag * 1.6; sz = sz / mag * 1.6; }
    this.sepX = sx;
    this.sepZ = sz;
  }

  /** How many other enemies are already closer to the target than this one. */
  crowdRank(game, target) {
    const mine = (this.x - target.x) ** 2 + (this.z - target.z) ** 2;
    let n = 0;
    for (const other of game.mobs) {
      if (other === this || other.dead) continue;
      if ((other.x - target.x) ** 2 + (other.z - target.z) ** 2 < mine) n++;
      if (n >= 6) break;
    }
    return n;
  }

  /**
   * Melee attacks land at the end of a short wind-up rather than the instant
   * a mob is in range. That is the whole difference between a hit you could
   * have stepped out of and one that simply happened to you.
   */
  startSwing(damageMult = 1, knockback = 4, windup = 0.20) {
    if (this.windup > 0 || this.attackTimer > 0) return false;
    // Deliberately no "attack token" cap here. Limiting how many of a crowd
    // may swing at once reads well on paper, but measured against the balance
    // harness it cut enemy pressure hardest for the ranged classes that were
    // already the safest, and widened the class spread rather than closing it.
    // Spacing comes from separation instead, which thins a pile without
    // making being surrounded survivable.
    this.windup = windup;
    this.windupMult = damageMult;
    this.windupKnock = knockback;
    this.swing = 1;
    this.pendingWindupSfx = true;
    return true;
  }

  resolveWindup(dt, game, target, dist) {
    if (this.windup <= 0) return;
    // The tell only sounds for enemies close enough to matter, or a crowd
    // turns the mix into static.
    if (this.pendingWindupSfx) {
      this.pendingWindupSfx = false;
      if (dist < 12) game.sfx('windup');
    }
    this.windup -= dt;
    if (this.windup > 0) return;
    this.windup = 0;
    this.attackTimer = 1 / this.def.attackSpeed;
    // Stepping out of reach during the wind-up makes the swing miss, which is
    // what makes the tell worth reading.
    if (!this.disabled && dist <= this.def.range + 0.9) {
      this.meleeHit(game, target, this.windupMult, this.windupKnock);
    }
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
    dx += this.sepX * 0.85;
    dz += this.sepZ * 0.85;
    const len = Math.hypot(dx, dz);
    if (len > 1) { dx /= len; dz /= len; }
    this.vx += (dx * speed - this.vx) * 0.28;
    this.vz += (dz * speed - this.vz) * 0.28;
  }

  strafe(nx, nz, speed, sign) {
    const dx = -nz * sign + this.sepX * 0.7;
    const dz = nx * sign + this.sepZ * 0.7;
    const len = Math.hypot(dx, dz) || 1;
    this.vx += ((dx / len) * speed - this.vx) * 0.18;
    this.vz += ((dz / len) * speed - this.vz) * 0.18;
  }

  meleeHit(game, target, mult = 1, knockback = 4) {
    this.swing = 1;
    const dx = target.x - this.x, dz = target.z - this.z;
    const d = Math.hypot(dx, dz) || 1;
    game.dealDamage(this, target, this.damageAmount * mult, { knockback, kx: dx / d, kz: dz / d });
  }

  aiMelee(dt, game, target, dist, nx, nz, speed) {
    if (this.windup > 0) {
      // Planted mid-swing: a mob that keeps sliding forward while winding up
      // gives the player nothing to step away from.
      this.vx *= 0.55; this.vz *= 0.55;
      return;
    }
    if (dist > this.def.range) {
      // Anything held out of the front rank hangs back a body-width, ready to
      // step in the moment a slot opens, instead of shoving from behind.
      const press = this.crowd >= 4 ? speed * 0.62 : speed;
      this.moveToward(nx, nz, press);
    } else {
      this.moveToward(nx, nz, speed * 0.15);
      this.startSwing();
    }
  }

  aiLeaper(dt, game, target, dist, nx, nz, speed) {
    if (this.windup > 0) { this.vx *= 0.6; this.vz *= 0.6; return; }
    if (dist < this.def.range) {
      this.startSwing(1, 3, 0.14);      // fast and twitchy, but still readable
      this.moveToward(nx, nz, speed * 0.3);
    } else {
      this.moveToward(nx, nz, speed);
      // Pounce from mid range, but only with a clear line — leaping into a
      // wall was the single most common way these stranded themselves.
      const clear = game.world.lineOfSight(this.x, this.eyeY, this.z, target.x, target.centerY, target.z);
      if (this.onGround && clear && dist > 4 && dist < 9 && Math.random() < dt * 0.9) {
        this.vy = 9.5;
        this.vx = nx * speed * 2.1;
        this.vz = nz * speed * 2.1;
      }
    }
  }

  aiRanged(dt, game, target, dist, nx, nz, speed) {
    const ideal = 11;
    const los = game.world.lineOfSight(this.x, this.eyeY, this.z, target.x, target.centerY, target.z);
    if (!los) {
      // No shot from here. Close in rather than plinking at a wall — this is
      // what used to leave archers stalled at nominal range forever.
      this.moveToward(nx, nz, speed);
    } else if (dist > ideal + 3) this.moveToward(nx, nz, speed);
    else if (dist < ideal - 3) {
      // Back off, but keep circling so retreating does not walk it into a
      // corner it cannot get out of.
      this.moveToward(-nx, -nz, speed);
      this.strafe(nx, nz, speed * 0.45, this.id % 2 ? 1 : -1);
    } else this.strafe(nx, nz, speed * 0.7, this.id % 2 ? 1 : -1);

    if (this.attackTimer <= 0 && dist < this.def.range && los) {
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
    // The last few blocks are a sprint. A bomber that ambles in at walking
    // pace is free damage; one that commits has to be dealt with.
    const commit = dist < this.def.range + 5 ? 1.45 : 1;
    this.moveToward(nx, nz, speed * commit);
    // Only light the fuse when it can actually reach — a bomber that primes
    // through a wall just removes itself from the wave for free.
    if (dist < this.def.range
      && game.world.lineOfSight(this.x, this.eyeY, this.z, target.x, target.centerY, target.z)) {
      this.state = 'fuse';
      this.fuse = this.def.fuse;
      game.sfx('fuse');
    }
  }

  aiSlammer(dt, game, target, dist, nx, nz, speed) {
    this.slamTimer -= dt;
    if (this.windup > 0) { this.vx *= 0.5; this.vz *= 0.5; return; }
    if (dist > this.def.range) this.moveToward(nx, nz, speed);
    else {
      this.moveToward(nx, nz, speed * 0.2);
      if (this.slamTimer <= 0) {
        this.slamTimer = rand(6, 4);
        this.swing = 1;
        game.sfx('stomp');
        game.telegraph(this.x, this.y, this.z, 5.0, 0.6, () => {
          game.explode(this.x, this.y + 0.4, this.z, 5.0, this.damageAmount * 1.6, {
            team: TEAM.ENEMY, source: this, color: '#c9a06a', knockback: 9,
          });
        });
      } else {
        this.startSwing(1, 6, 0.32);      // heavy and slow: a real tell
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

  /**
   * Shared second phase. A boss that just keeps doing the same thing while its
   * bar empties is a damage sponge; one that changes at a threshold makes the
   * back half of the fight a different fight. Announced loudly, because a
   * phase you did not notice is just a difficulty spike.
   */
  checkEnrage(game) {
    if (this.enraged || !this.def.boss) return false;
    if (this.hp / this.maxHp > 0.35) return false;
    this.enraged = true;
    this.speed *= 1.28;
    this.damageAmount *= 1.25;
    game.notify(`${this.def.name.toUpperCase()} ENRAGES`, 2.6);
    game.sfx('roar');
    game.screenShake = Math.max(game.screenShake, 0.5);
    game.burst(this.x, this.centerY, this.z, 40, '#ff5a3c');
    return true;
  }

  /**
   * The enraged boss's own attack: a ring of shockwaves marching outward, so
   * standing anywhere near it costs you. Telegraphed like everything else.
   */
  enrageNova(game, target) {
    for (let ring = 0; ring < 3; ring++) {
      const radius = 5 + ring * 3.5;
      game.delay(ring * 0.42, () => {
        if (this.dead) return;
        game.telegraph(this.x, this.y, this.z, radius, 0.4, () => {
          game.explode(this.x, this.y + 0.4, this.z, radius, this.damageAmount * 0.75, {
            team: TEAM.ENEMY, source: this, color: '#ff7a3c', knockback: 8,
          });
        }, '#ff7a3c');
      });
    }
    game.sfx('stomp');
  }

  aiBoss(dt, game, target, dist, nx, nz, speed) {
    this.checkEnrage(game);
    this.slamTimer -= dt;
    if (this.slamTimer <= 0) {
      this.slamTimer = rand(7, 5);
      const phase = this.hp / this.maxHp;
      if (this.enraged && Math.random() < 0.45) {
        this.enrageNova(game, target);
      } else if (phase < 0.5 && Math.random() < 0.5) {
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

  /**
   * Warden — a zoning boss. It holds range, fires spreads, and burns the
   * ground under you, so standing still loses. Punishes pure melee builds,
   * which is exactly what the Colossus rewards.
   */
  aiWarden(dt, game, target, dist, nx, nz, speed) {
    this.checkEnrage(game);
    const ideal = 13;
    if (dist > ideal + 4) this.moveToward(nx, nz, speed);
    else if (dist < ideal - 4) this.moveToward(-nx, -nz, speed);
    else this.strafe(nx, nz, speed * 0.8, this.id % 2 ? 1 : -1);

    const enraged = this.enraged;

    // The enraged Warden stops zoning and starts detonating where it stands.
    if (enraged && this.novaTimer === undefined) this.novaTimer = 4;
    if (enraged) {
      this.novaTimer -= dt;
      if (this.novaTimer <= 0) {
        this.novaTimer = rand(9, 6);
        this.enrageNova(game, target);
      }
    }

    // Volley of projectiles in a fan.
    if (this.attackTimer <= 0 && dist < this.def.range) {
      this.attackTimer = enraged ? 2.0 : 3.2;
      this.swing = 1;
      const shots = enraged ? 7 : 5;
      for (let i = 0; i < shots; i++) {
        const spread = (i - (shots - 1) / 2) * 0.14;
        const dx = nx * Math.cos(spread) - nz * Math.sin(spread);
        const dz = nx * Math.sin(spread) + nz * Math.cos(spread);
        game.fireProjectile({
          owner: this, team: TEAM.ENEMY,
          x: this.x, y: this.eyeY, z: this.z,
          dir: [dx, 0.06, dz], damage: this.damageAmount * 0.6,
          ...this.def.projectile,
        });
      }
      game.sfx('shoot');
    }

    // Scorch the ground where the player is standing.
    this.slamTimer -= dt;
    if (this.slamTimer <= 0) {
      this.slamTimer = enraged ? rand(5, 3.5) : rand(8, 6);
      const pools = enraged ? 3 : 2;
      for (let i = 0; i < pools; i++) {
        const px = target.x + rand(5, -5);
        const pz = target.z + rand(5, -5);
        const py = game.world.groundAt(px, pz, target.y + 3);
        game.telegraph(px, py, pz, 4.2, 1.1, () => {
          game.spawnZone(px, py, pz, {
            radius: 4.2, dps: this.damageAmount * 0.55, duration: 6,
            team: TEAM.ENEMY, source: this, color: '#7ef0ff', slow: 0.25,
          });
        }, '#7ef0ff');
      }
      game.sfx('cast');
    }

    // Refuse to be cornered by melee.
    this.blinkTimer -= dt;
    if (dist < 6 && this.blinkTimer <= 0) {
      this.blinkTimer = 4;
      game.spawnZone(this.x, this.y, this.z, {
        radius: 3.4, dps: this.damageAmount * 0.5, duration: 4,
        team: TEAM.ENEMY, source: this, color: '#7ef0ff',
      });
      const pt = game.world.pickSpawn(target.x, target.z, 14);
      game.burst(this.x, this.centerY, this.z, 18, '#7ef0ff');
      this.x = pt.x; this.y = pt.y; this.z = pt.z;
      this.vx = this.vz = 0;
      game.burst(this.x, this.centerY, this.z, 18, '#7ef0ff');
      game.sfx('blink');
    }
  }

  /**
   * Broodmother — a swarm boss. Constant adds mean single-target builds
   * drown; it rewards anything with area damage.
   */
  aiBrood(dt, game, target, dist, nx, nz, speed) {
    this.checkEnrage(game);
    const enraged = this.hp / this.maxHp < 0.5;

    // Charge: telegraphed, then a committed lunge.
    if (this.state === 'charge') {
      this.chargeTime -= dt;
      this.vx = this.chargeVX;
      this.vz = this.chargeVZ;
      if (dist < 2.6 && this.attackTimer <= 0) {
        this.attackTimer = 0.6;
        this.meleeHit(game, target, 1.5, 10);
      }
      if (this.chargeTime <= 0 || this.hitWallX || this.hitWallZ) this.state = 'chase';
      return;
    }

    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0 && dist > 6 && dist < 22) {
      this.blinkTimer = rand(9, 6);
      const cx = nx, cz = nz;
      game.telegraph(this.x, this.y, this.z, 3.0, 0.7, () => {
        if (this.dead) return;
        this.state = 'charge';
        this.chargeTime = 1.1;
        this.chargeVX = cx * speed * 4.2;
        this.chargeVZ = cz * speed * 4.2;
        game.sfx('charge');
      }, '#b06cff');
    }

    // Spawn broods. Capped against the wave's concurrency so a long fight
    // cannot bury the arena in crawlers.
    this.slamTimer -= dt;
    if (this.slamTimer <= 0) {
      this.slamTimer = enraged ? rand(5, 3.5) : rand(8, 6);
      if (game.mobs.length < 26) {
        const count = enraged ? 4 : 3;
        game.sfx('roar');
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + this.age;
          game.spawnMob('crawler', this.x + Math.cos(a) * 2.5, this.y + 1, this.z + Math.sin(a) * 2.5);
        }
        game.burst(this.x, this.y + 0.6, this.z, 14, '#b06cff');
      }
    }

    // Poison spray when you are in its face.
    if (dist < 7 && this.attackTimer <= 0) {
      this.attackTimer = 3.0;
      this.swing = 1;
      for (let i = 0; i < 5; i++) {
        const spread = (i - 2) * 0.2;
        const dx = nx * Math.cos(spread) - nz * Math.sin(spread);
        const dz = nx * Math.sin(spread) + nz * Math.cos(spread);
        game.fireProjectile({
          owner: this, team: TEAM.ENEMY,
          x: this.x, y: this.centerY, z: this.z,
          dir: [dx, 0.12, dz], speed: 16, gravity: 8,
          damage: this.damageAmount * 0.4, color: '#8ce06a', size: 0.26,
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
