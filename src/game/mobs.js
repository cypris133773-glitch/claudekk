// Enemy definitions and AI.

import { Entity, TEAM, drawHumanoid } from './entity.js';
import { Particle, Gib } from './effects.js';
import { T } from '../render/atlas.js';
import { clamp, rand, pick } from '../core/math.js';
import { MECHANICS, PHASES, phaseFor, raidScaling, bossStance } from '../data/raids.js';
import { bossSkin, bossSize } from '../data/bossskins.js';

/**
 * The three telegraph languages, as colours. Keyed to the *action*, never to
 * the boss — a player learns three colours once instead of relearning a palette
 * every raid.
 *
 *   burst   it goes off where it is drawn, and then it is gone
 *   linger  it stays on the floor after it lands
 *   aimed   it is following you
 *
 * All three are chosen against the player's own palette: nothing the player
 * casts is amber-on-orange, ice-outline, or this violet.
 */
export const TELL_COLOR = {
  burst: '#ff7a3c',
  linger: '#8fe3ff',
  aimed: '#b06cff',
};

/**
 * The rule that keeps flavour and safety apart, and the reason a boss can be
 * red while its attacks are violet:
 *
 *   **The danger colour is on the ground. The boss's own colour is in the air.**
 *
 * Every ground ring, zone and shockwave uses the mechanic's colour class; every
 * mote, gib, projectile and trail uses the boss's own. The player reads the
 * floor to survive and the air to know what they are fighting, and neither read
 * is ever contaminated by the other.
 */

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
  /**
   * `defOverride` is for enemies whose definition is built rather than looked
   * up — raid bosses, whose forty-two entries differ only in a colour and a
   * multiplier and would never spawn from a wave anyway.
   */
  constructor(typeId, wave, x, y, z, scaling, defOverride = null) {
    const t = defOverride || MOB_TYPES[typeId];
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
    // The room has things in it. Rare, close, and staggered by mob id so a pack
    // does not speak in chorus — an ambient that fires often is a drone, and a
    // drone is the thing a player turns the sound off for.
    this.growlTimer = (this.growlTimer || (2 + (this.id % 900) / 100)) - dt;
    if (this.growlTimer <= 0) {
      this.growlTimer = rand(11, 6);
      const p = game.player;
      if (!p.dead && Math.hypot(p.x - this.x, p.z - this.z) < 16) game.sfx('growl');
    }
    this.checkFrenzy(game);
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
      case 'boss_raid': this.aiRaid(dt, game, target, dist, nx, nz, speed); break;
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
    if (game.director.state === 'clearing'
      && this.age - this.lastDamagedAge > (game.mobs.length <= 3 ? 12 : 25)) {
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

    // The leash tightens as a wave empties. Twelve seconds of no progress is a
    // reasonable grace period while thirty things are converging on you; with
    // two left on a big floor it is the player walking laps. Same rule, shorter
    // fuse, exactly when the waiting is most obvious.
    const few = game.mobs.length <= 3;
    this.windowTimer = (this.windowTimer || 0) + dt;
    if (this.windowTimer < (few ? 2.5 : 4)) return;
    this.windowTimer = 0;

    const improved = this.windowDist === undefined || dist < this.windowDist - 1.5;
    this.windowDist = dist;
    this.strikes = improved ? 0 : (this.strikes || 0) + 1;
    if (this.strikes < (few ? 2 : 3)) return;        // 5s when few are left, 12s otherwise

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
    game.sfx('mobswing');
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
  /**
   * The Frenzied affix, mob side. A boss already has its own enrage phase, so
   * stacking a second threshold on top of it would just make the same fight
   * spikier; this is the trash-only version, and it is what turns "leave them
   * on a sliver and clean up later" from a safe play into a losing one.
   */
  checkFrenzy(game) {
    if (!this.frenzyAffix || this.frenzied || this.def.boss) return;
    if (this.hp / this.maxHp > 0.35) return;
    this.frenzied = true;
    this.speed *= 1.45;
    this.damageAmount *= 1.35;
    game.burst(this.x, this.centerY, this.z, 12, '#ff5a3c');
    game.sfx('roar');
  }

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
    // A phase you noticed once and then forgot is a difficulty spike. The boss
    // stays visibly hotter for the rest of the fight — clamped, because two of
    // them already sit near the ceiling where anything brighter stops reading
    // as lit and starts reading as white.
    if (this.def.skin) {
      this.def = { ...this.def, skin: { ...this.def.skin,
        emissive: Math.min(0.40, (this.def.skin.emissive || 0) + 0.08) } };
    }
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

  // -------------------------------------------------------------------------
  // Raid bosses
  // -------------------------------------------------------------------------
  //
  // Forty-two bosses run through this one branch. What differs between them is
  // data — a mechanic, a stance, a power multiplier and the raid's own trial —
  // and nothing else, because forty-two hand-written AIs is forty-two places
  // for a fight to be subtly unfair and no way to tell which one.
  //
  // The guard rails live here rather than inside the eight mechanics, so a
  // rule like "no burst resolves while the player is slowed" is enforced once
  // and cannot be forgotten by the ninth mechanic somebody adds later.

  /** Which phase the health bar puts us in, and the transition when it moves. */
  updateRaidPhase(dt, game) {
    const want = phaseFor(this.hp / this.maxHp);
    if (want <= this.phase) return;
    this.phase = want;
    // A phase transition is a breath, not an ambush. Clearing zones and pausing
    // the caster is what stops a transition from landing on top of a live bomb,
    // which is a death the player could not have prevented by playing better.
    for (const z of game.zones) if (z.team === TEAM.ENEMY) z.dead = true;
    this.castTimer = Math.max(this.castTimer, 2.5);
    game.notify(`${this.def.name.toUpperCase()} — PHASE ${want + 1}`, 2.4);
    game.sfx('roar');
    game.screenShake = Math.max(game.screenShake, 0.42);
    game.burst(this.x, this.centerY, this.z, 30, this.raidColor || '#ff5a3c');
  }

  /**
   * Whether a mechanic may resolve right now.
   *
   * The slow test is the load-bearing one. Every escape in the set is quoted
   * against the slowest class at full speed; at 65% of it the arithmetic stops
   * working and the mechanic becomes unavoidable damage wearing a telegraph.
   */
  raidCastAllowed(game, mech) {
    const p = game.player;
    if (mech.tell === 'linger') return true;      // zones are the one thing a slow may not veto
    if (p.root > 0 || p.freeze > 0) return false;
    return !(p.slow > 0.2);
  }

  aiRaid(dt, game, target, dist, nx, nz, speed) {
    this.updateRaidPhase(dt, game);
    this.checkEnrage(game);

    // The charge state is committed movement and owns the frame outright: a
    // charge that re-aims mid-flight cannot be dodged, and one that also casts
    // is two mechanics resolving on one telegraph.
    if (this.state === 'charge') {
      this.chargeTime -= dt;
      this.vx = this.chargeVX;
      this.vz = this.chargeVZ;
      // A wake. Without it a fast voxel reads as teleporting rather than as
      // moving, and the player cannot tell which way it went.
      if (game.r.fancy) {
        for (let i = 0; i < 2; i++) {
          game.particles.push(new Particle(
            this.x + rand(0.5, -0.5), this.y + 0.3, this.z + rand(0.5, -0.5),
            rand(1, -1), rand(1.5, 0), rand(1, -1),
            this.raidColor || '#ff8a3c', 0.35, 0.22, 0));
        }
      }
      if (dist < 2.8 && this.attackTimer <= 0) {
        this.attackTimer = 0.6;
        this.meleeHit(game, target, MECHANICS.charge.dmg, 10);
        game.shockwave(this.x, this.y + 0.4, this.z, 2.5, TELL_COLOR.aimed);
      }
      if (this.chargeTime <= 0 || this.hitWallX || this.hitWallZ) this.state = 'chase';
      return;
    }

    // Breath freezes its facing at ignition and the boss becomes a turret. The
    // immobility is not a side effect, it is the player's damage window.
    if (this.channel > 0) {
      this.channel -= dt;
      this.vx *= 0.15; this.vz *= 0.15;
      this.channelTick -= dt;
      if (this.channelTick <= 0 && !this.dead) {
        this.channelTick = 0.3;
        this.breathVolley(game);
      }
      return;
    }

    const phase = PHASES[this.phase];
    this.castTimer -= dt;

    // Adds buy the player room: while its pack is up the boss casts less, so
    // clearing the pack is also the play that stops the telegraphs.
    const crowded = game.mobs.length > 4;

    if (this.castTimer <= 0 && !this.casting) {
      const id = this.pickRaidMechanic(game);
      const mech = MECHANICS[id];
      if (!this.raidCastAllowed(game, mech)) {
        // Postponed, not skipped, and only for a moment. A mechanic that waits
        // out a permanent slow never fires at all.
        this.castStall = (this.castStall || 0) + dt;
        this.castTimer = 0.35;
        if (this.castStall > 1.5) { this.castStall = 0; this.castRaid(id, game, target); }
      } else {
        this.castStall = 0;
        this.castRaid(id, game, target);
      }
      this.castTimer = Math.max(this.castTimer,
        (this.cadence || mech.cd) * phase.rate * (crowded ? 1.3 : 1));
    }

    if (this.casting > 0) {
      // Planted while a telegraph is up, so the picture on the floor is where
      // the blast lands. A boss that walks out of its own telegraph is a lie.
      this.casting -= dt;
      this.vx *= 0.4; this.vz *= 0.4;
      return;
    }

    if (this.raidStance === 'ranged') this.aiWardenStep(dt, game, target, dist, nx, nz, speed);
    else this.aiMelee(dt, game, target, dist, nx, nz, speed);
  }

  /** Kiting movement without the Warden's own zoning and blinking. */
  aiWardenStep(dt, game, target, dist, nx, nz, speed) {
    const ideal = 13;
    if (dist > ideal + 4) this.moveToward(nx, nz, speed);
    else if (dist < ideal - 4) this.moveToward(-nx, -nz, speed);
    else this.strafe(nx, nz, speed * 0.8, this.id % 2 ? 1 : -1);
    if (this.attackTimer <= 0 && dist < this.def.range) {
      this.attackTimer = 2.6;
      this.swing = 1;
      game.fireProjectile({
        owner: this, team: TEAM.ENEMY,
        x: this.x, y: this.eyeY, z: this.z,
        dir: [nx, 0.06, nz], damage: this.damageAmount * 0.6,
        speed: 26, gravity: 2, color: this.raidColor || '#ff8a3c', size: 0.3,
      });
      game.sfx('shoot');
    }
  }

  /**
   * Which mechanic fires next.
   *
   * The boss's own signature is the spine of the fight; the raid's trial joins
   * from phase 2 and is what makes six fights feel like one place. The
   * composition rules are the exceptions, and they are exceptions because a
   * pair that cannot both be survived is worse than either alone.
   */
  pickRaidMechanic(game) {
    const own = this.mechanic;
    const trial = this.raidTrial;
    let pool = [own];
    if (this.phase >= 1 && trial && trial !== own) pool.push(trial);
    // Rot plus a surround has the tightest escape requirement in the game and
    // is the pair that kills. The adds are already the threat; the rot is a
    // second one landing on the same beat.
    if (game.mobs.length > 4) pool = pool.filter((m) => m !== 'shadow');
    // A boss with no signature fights on pressure alone — autos, the trial, and
    // an escalation that starts earlier. The puzzle was the five bosses before.
    if (own === 'enrage' && pool.length > 1) pool = pool.filter((m) => m !== 'enrage');
    return pool[(Math.random() * pool.length) | 0];
  }

  castRaid(id, game, target) {
    const mech = MECHANICS[id];
    const reps = 1 + Math.min(this.phase, PHASES[this.phase].reps) * (this.reps || 1);
    this.casting = mech.cast;
    game.sfx('cast');
    game.sfx(mech.cue);
    game.impactFlash(TELL_COLOR[mech.tell], 0.18);
    switch (id) {
      case 'slam': return this.mechSlam(game, mech);
      case 'breath': return this.mechBreath(game, mech, target);
      case 'adds': return this.mechAdds(game, mech);
      case 'charge': return this.mechCharge(game, mech, target);
      case 'bombs': return this.mechBombs(game, mech, target, reps);
      case 'frost': return this.mechFrost(game, mech, target);
      case 'shadow': return this.mechShadow(game, mech, target);
      default: return this.mechNova(game, mech);
    }
  }

  /** Rings marching outward. Run straight away from the boss. */
  mechSlam(game, mech) {
    const rings = [[mech.radius, mech.dmg], [8, 2.2], [11, 1.8]];
    rings.forEach(([radius, k], i) => {
      game.delay(i * 0.55, () => {
        if (this.dead) return;
        game.telegraph(this.x, this.y, this.z, radius, i === 0 ? mech.cast : 0.5, () => {
          if (this.dead) return;
          game.explode(this.x, this.y + 0.4, this.z, radius, this.damageAmount * k, {
            team: TEAM.ENEMY, source: this, color: TELL_COLOR.burst, knockback: 8,
          });
          // Debris in the boss's own material, thrown from the ring it just
          // made. The blast is amber because amber means "this is about to go
          // off"; the rubble is basalt or ice or bone because that is what the
          // thing standing in front of you is made of.
          this.throwDebris(game, radius, 10);
          game.sfx('stomp');
        }, TELL_COLOR.burst);
      });
    });
  }

  /**
   * A stream of flying rock rather than a ground cone. The engine has no cone
   * test for the enemy side, and a stream reads better anyway: it collides with
   * the world, and you can see it from beside it as well as in front of it.
   */
  mechBreath(game, mech, target) {
    const dx = target.x - this.x, dz = target.z - this.z;
    const d = Math.hypot(dx, dz) || 1;
    // The wind-up, drawn where the stream will come from. There is no ground
    // telegraph for a cone and deliberately no new shape for one — the tell is
    // the boss gathering at head height, which reads from any angle you can see
    // the boss from, and the safe place for this mechanic is behind it anyway.
    for (let i = 0; i < 7; i++) {
      game.delay(i * 0.2, () => {
        if (this.dead) return;
        game.burst(this.x, this.eyeY, this.z, 6, this.raidColor || '#ff8a3c');
      });
    }
    game.delay(mech.cast, () => {
      if (this.dead) return;
      // Aim is sampled once, here, and frozen. A cone that keeps tracking is
      // the single most common way this mechanic is built undodgeable.
      this.breathX = dx / d;
      this.breathZ = dz / d;
      this.channel = 1.5;
      this.channelTick = 0;
      game.sfx('roar');
    });
  }

  breathVolley(game) {
    const mech = MECHANICS.breath;
    for (let i = 0; i < 6; i++) {
      const spread = (i - 2.5) * 0.16;
      const dx = this.breathX * Math.cos(spread) - this.breathZ * Math.sin(spread);
      const dz = this.breathX * Math.sin(spread) + this.breathZ * Math.cos(spread);
      game.fireProjectile({
        owner: this, team: TEAM.ENEMY,
        x: this.x, y: this.eyeY, z: this.z,
        dir: [dx, 0.05, dz], damage: this.damageAmount * mech.dmg,
        speed: 30, gravity: 1.5, color: this.raidColor || '#ff8a3c', size: 0.32,
      });
    }
  }

  /**
   * A pack, hard-capped. Unbounded adds is the classic way a solo fight becomes
   * unwinnable, so a summon that would breach the cap is dropped outright — and
   * the boss idles instead, which makes killing adds buy uptime as well as air.
   */
  mechAdds(game, mech) {
    const tier = this.raidTier || 0;
    const roster = tier <= 1 ? ['husk', 'crawler']
      : tier <= 3 ? ['stalker', 'skele']
        : ['hexer', 'wraith'];
    const count = this.power > 1.3 ? 4 : 3;
    // A ring where each one will appear. The add itself looks like an ordinary
    // mob, so the violet is the only thing that says one is coming.
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + this.age;
      game.telegraph(this.x + Math.cos(a) * mech.radius, this.y,
        this.z + Math.sin(a) * mech.radius, 1.6, mech.cast, () => {}, TELL_COLOR.aimed);
    }
    game.delay(mech.cast, () => {
      if (this.dead) return;
      for (let i = 0; i < count; i++) {
        if (game.mobs.length >= 8) break;
        const a = (i / count) * Math.PI * 2 + this.age;
        const typeId = roster[i % roster.length];
        const m = game.spawnMob(typeId,
          this.x + Math.cos(a) * mech.radius, this.y + 1, this.z + Math.sin(a) * mech.radius);
        // Adds are attrition, not a second boss: a few seconds of attention
        // each, and they never summon anything themselves.
        if (m) { m.maxHp = Math.round(this.maxHp * 0.06); m.hp = m.maxHp; m.isAdd = true; }
      }
      game.burst(this.x, this.y + 0.6, this.z, 14, TELL_COLOR.aimed);
    });
  }

  /** A line drawn as two rings. Two blocks sideways after the commit. */
  mechCharge(game, mech, target) {
    const dx = target.x - this.x, dz = target.z - this.z;
    const d = Math.hypot(dx, dz) || 1;
    const cx = dx / d, cz = dz / d;
    const ty = game.world.groundAt(target.x, target.z, target.y + 3);
    game.telegraph(target.x, ty, target.z, mech.radius, mech.cast, () => {}, TELL_COLOR.aimed);
    game.telegraph(this.x, this.y, this.z, mech.radius, mech.cast, () => {
      if (this.dead) return;
      this.state = 'charge';
      this.chargeTime = 1.1;
      this.chargeVX = cx * this.speed * 4.2;
      this.chargeVZ = cz * this.speed * 4.2;
      game.sfx('charge');
    }, TELL_COLOR.aimed);
  }

  /**
   * Marks the floor under you and does not follow. Walking out is the whole
   * mechanic, so the later bombs are spaced apart — a bomb in a compromise
   * position is a bomb nobody can read, and it is better dropped than moved.
   */
  mechBombs(game, mech, target, reps) {
    const placed = [];
    for (let i = 0; i < reps; i++) {
      game.delay(i * 0.6, () => {
        if (this.dead) return;
        const px = target.x, pz = target.z;
        for (const p of placed) {
          if (Math.hypot(px - p[0], pz - p[1]) < 6) return;
        }
        placed.push([px, pz]);
        const py = game.world.groundAt(px, pz, target.y + 3);
        game.sfx('fuse');
        game.telegraph(px, py, pz, mech.radius, mech.cast, () => {
          if (this.dead) return;
          game.explode(px, py + 0.4, pz, mech.radius, this.damageAmount * mech.dmg, {
            team: TEAM.ENEMY, source: this, color: TELL_COLOR.aimed, knockback: 6,
          });
        }, TELL_COLOR.aimed);
      });
    }
  }

  /**
   * Takes floor away rather than health. It is the cheapest mechanic per second
   * in the set on purpose: it is the only one that puts something at a third
   * place, neither on the boss nor on you, so it must never be the thing that
   * kills you — only the thing that makes the next mechanic harder.
   */
  mechFrost(game, mech, target) {
    const live = game.zones.filter((z) => z.team === TEAM.ENEMY && !z.dead);
    while (live.length >= 4) live.shift().dead = true;
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * 4;
      const px = target.x + Math.cos(a) * r;
      const pz = target.z + Math.sin(a) * r;
      const py = game.world.groundAt(px, pz, target.y + 3);
      game.telegraph(px, py, pz, mech.radius, mech.cast, () => {
        if (this.dead) return;
        // Measured from where the player is *now*, not where they were when
        // the telegraph went up: a pool that lands on your feet is unavoidable
        // damage, and three seconds is long enough to have walked into it.
        if (Math.hypot(px - game.player.x, pz - game.player.z) < 3) return;
        game.spawnZone(px, py, pz, {
          radius: mech.radius, dps: this.damageAmount * mech.dmg, duration: 8,
          team: TEAM.ENEMY, source: this, color: TELL_COLOR.linger, slow: 0.35,
        });
        // Shards rather than sparks: drawn on the ice tile so the material is
        // the message, and heavy enough to fall rather than drift.
        for (let i = 0; i < 10; i++) {
          const a = Math.random() * Math.PI * 2;
          game.particles.push(new Particle(
            px, py + 0.4, pz,
            Math.cos(a) * rand(4, 1), rand(7, 3), Math.sin(a) * rand(4, 1),
            TELL_COLOR.linger, rand(0.9, 0.5), 0.20, 20, T.ICE));
        }
        game.sfx('shatter');
      }, TELL_COLOR.linger);
    }
  }

  /**
   * The evacuation beat, and the mirror of slam: slam pushes you off the boss,
   * this pushes you off yourself. Together they are what stop a player finding
   * one safe tile and standing on it for the whole fight.
   */
  mechShadow(game, mech, target) {
    const py = game.world.groundAt(target.x, target.z, target.y + 3);
    const cx = target.x, cz = target.z;
    game.telegraph(cx, py, cz, mech.radius, mech.cast, () => {
      if (this.dead) return;
      game.explode(cx, py + 0.4, cz, mech.radius, this.damageAmount * mech.dmg, {
        team: TEAM.ENEMY, source: this, color: TELL_COLOR.aimed, knockback: 0,
      });
      const p = game.player;
      if (Math.hypot(p.x - cx, p.z - cz) < mech.radius) {
        p.applyDot(this.damageAmount * 0.30, 6, 'shadow', this);
        game.notify('AFFLICTED', 1.4);
        // The only visual the player wears, and it is deliberately sparse:
        // one rising mote every quarter second for six seconds. A dot
        // indicator that fills the bottom of the frame is the thing that hides
        // the next telegraph.
        for (let i = 0; i < 24; i++) {
          game.delay(i * 0.25, () => {
            if (p.dead) return;
            game.particles.push(new Particle(
              p.x + rand(0.4, -0.4), p.y + 0.2, p.z + rand(0.4, -0.4),
              0, 0.6, 0, TELL_COLOR.aimed, 0.8, 0.16, -2));
          });
        }
      }
    }, TELL_COLOR.aimed);
  }

  /**
   * Rubble in the boss's own material. `bodyTile` and `body` are what the thing
   * in front of you is built from, so a Molten Core slam throws basalt and an
   * Icecrown slam throws ice, without a per-raid table anywhere.
   */
  throwDebris(game, radius, count) {
    if (!game.r.fancy) return;
    const skin = this.def.skin || {};
    const tile = skin.bodyTile ?? T.STONE;
    const color = skin.body || [0.5, 0.5, 0.5];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random();
      const sp = radius * rand(1.8, 0.8);
      game.gibs.push(new Gib(
        this.x + Math.cos(a) * 0.8, this.y + 0.5, this.z + Math.sin(a) * 0.8,
        Math.cos(a) * sp, rand(10, 5), Math.sin(a) * sp,
        color, rand(0.30, 0.14), rand(2.0, 1.1), tile));
    }
  }

  mechNova(game, mech) {
    this.enrageNova(game, game.player);
  }

  draw(r) {
    const s = this.def.skin;
    const fusing = this.state === 'fuse';
    const pulse = fusing ? 0.5 + Math.sin(this.age * 40) * 0.5 : 0;
    // Spread rather than listed field by field: drawHumanoid understands horns,
    // pauldrons and a tile per limb, and the old list quietly dropped all of
    // them. A raid boss's identity is mostly in exactly those parts.
    drawHumanoid(r, this, {
      ...s,
      headTile: s.headTile ?? T.SKIN,
      bodyTile: s.bodyTile ?? T.CLOTH,
      faceTile: r.customHeadTile !== undefined && !this.def.boss
        ? r.customHeadTile : (s.faceTile ?? s.face),
      faceUntinted: r.customHeadTile !== undefined && !this.def.boss,
      emissive: Math.max(s.emissive || 0, pulse * 0.8, this.elite ? 0.15 : 0),
      scale: (s.scale || 1) * (this.elite ? 1.12 : 1),
    });
  }
}

/**
 * Build a raid boss.
 *
 * Its `def` is manufactured rather than looked up: forty-two entries in
 * MOB_TYPES that differ only in a colour and a multiplier would be forty-two
 * places to make a typo, and none of them would ever spawn from a wave. The
 * stat block comes from `raidScaling`, the silhouette from the boss's power,
 * and the skin is derived from the one colour each boss already carries.
 *
 * `power` reads as size as well as damage, so the sixth boss of a raid is
 * visibly the sixth boss before it has done anything. Capped at 5.2 blocks:
 * past about six the head leaves the screen in melee and the fight stops being
 * readable at exactly the range it is fought.
 */
export function createRaidBoss(raid, boss, x, y, z) {
  const stats = raidScaling(raid.tier, boss.power);
  const base = hex(boss.color);
  const dark = base.map((c) => c * 0.45);
  const stance = bossStance(boss);
  // Authored silhouette and skin where there is one; otherwise derived from the
  // one colour the boss carries, so a boss added tomorrow still draws.
  const size = bossSize(boss.id);
  const skin = bossSkin(boss.id);
  const def = {
    name: boss.name, weight: 0, minWave: 1, cost: 0, boss: true,
    hp: stats.hp, damage: stats.damage, souls: 0,
    speed: stance === 'ranged' ? 3.2 : 2.9,
    range: stance === 'ranged' ? 30 : 3.8,
    attackSpeed: 0.6,
    height: size ? size.height : Math.min(5.2, 3.0 + boss.power * 0.9),
    width: size ? size.width : Math.min(1.7, 1.0 + boss.power * 0.28),
    behavior: 'boss_raid', knockResist: 1,
    tagline: MECHANICS[boss.mechanic].blurb,
    skin: skin || {
      head: base, body: dark, arm: base, leg: dark,
      face: T.FACE_BOSS, hat: base.map((c) => Math.min(1, c * 1.3)),
      emissive: 0.18,
    },
  };
  // Scaling of 1 everywhere: raidScaling has already done the whole job, and
  // running it through the wave curve as well would scale it twice.
  const m = new Mob(boss.id, 1, x, y, z, { hp: 1, damage: 1, speed: 1, souls: 1 }, def);
  m.level = raid.level;
  // Raid state, all of it read by aiRaid.
  m.mechanic = boss.mechanic;
  m.raidTrial = raid.trial;
  m.raidTier = raid.tier;
  m.raidColor = boss.color;
  m.raidStance = stance;
  m.power = boss.power;
  m.cadence = boss.cadence;
  m.reps = boss.reps;
  m.phase = 0;
  m.casting = 0;
  m.channel = 0;
  m.channelTick = 0;
  m.castStall = 0;
  // The first cast waits: dropping a telegraph on a player who has been in the
  // room for half a second teaches them nothing except that the fight started
  // before they did.
  m.castTimer = 3.5;
  return m;
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
