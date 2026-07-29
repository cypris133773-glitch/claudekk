// Game core: owns the world, entities, combat resolution and the wave loop.

import { createArena, LAYOUT_COUNT, LAYOUT_NAMES } from '../world/world.js';
import { BLOCKS } from '../world/blocks.js';
import { Player, buildMods } from './player.js';
import { Mob, MOB_TYPES } from './mobs.js';
import { Fiend } from './pets.js';
import { Projectile, Particle, Gib, Telegraph, Shockwave, Zone, FloatText, hexToRgb } from './effects.js';
import { TEAM } from './entity.js';
import { WaveDirector, waveScaling, waveClearBonus, isBossWave } from './waves.js';
import { rollUpgrades } from '../data/upgrades.js';
import { permanentMods, masteryMods, masteryRank } from '../data/permanent.js';
import { difficultyFor } from '../data/difficulty.js';
import { armorMods } from '../data/armor.js';
import { forwardVec, clamp, rand, dist2 } from '../core/math.js';
import { T } from '../render/atlas.js';

const INTERMISSION = 4.0;

export class Game {
  constructor(renderer, audio, profile) {
    this.r = renderer;
    this.audio = audio;
    this.profile = profile;
    this.reset();
  }

  reset() {
    this.mobs = [];
    this.projectiles = [];
    this.particles = [];
    this.telegraphs = [];
    this.shockwaves = [];
    this.zones = [];
    this.floaters = [];
    this.beams = [];
    this.gibs = [];
    this.pets = [];
    this.timers = [];
    this.running = false;
    this.paused = false;
    this.over = false;
    this.time = 0;
    this.timeSinceCombat = 0;
    this.wave = 0;
    this.runUpgrades = [];
    this.pendingUpgrades = null;
    this.rerollsLeft = 0;
    this.notifications = [];
    this.screenShake = 0;
    this.hitMarker = 0;
    this.soulsEarned = 0;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** `opts.layout` forces an arena layout; used by the balance harness. */
  startRun(classDef, opts = {}) {
    this.reset();
    this.cls = classDef;
    const cd = this.profile.classData(classDef.id);
    // Permanent power comes from three account-wide sources that all flatten
    // into the same bag: the Forge, the Armoury and this class's mastery rank.
    const perm = permanentMods(this.profile.data.permanent);
    for (const [k, v] of Object.entries(armorMods(this.profile.data.armor))) {
      perm[k] = (perm[k] || 0) + v;
    }
    for (const [k, v] of Object.entries(masteryMods(masteryRank(cd.mastery || 0)))) {
      perm[k] = (perm[k] || 0) + v;
    }
    this.permMods = perm;
    // The tier is fixed for the whole run: changing it mid-run would let a
    // player bank the higher soul rate and then dial the danger back down.
    this.difficulty = difficultyFor(
      opts.difficulty !== undefined ? opts.difficulty : this.profile.settings.difficulty);
    this.loadout = this.profile.loadout(classDef);
    this.baseMods = () => buildMods(classDef, cd.talents, perm, this.runUpgrades);

    this.theme = (Math.random() * 4) | 0;
    this.layout = opts.layout !== undefined
      ? opts.layout % LAYOUT_COUNT
      : (Math.random() * LAYOUT_COUNT) | 0;
    this.world = createArena(this.theme, 1 + ((Math.random() * 9000) | 0), this.layout);
    this.r.setWorld(this.world);
    // The renderer owns the palette now: sky gradient, sun colour and the
    // hemispheric bounce all come from one themed set.
    this.r.setTheme(this.theme);

    this.player = new Player(classDef, this.baseMods(), this.world, this.loadout);
    this.director = new WaveDirector(this.difficulty);
    this.rerollsLeft = perm.rerolls || 0;
    this.running = true;
    this.over = false;
    this.startTime = performance.now();

    // Head Start: free upgrades before wave 1.
    const freebies = perm.startingUpgrades || 0;
    for (let i = 0; i < freebies; i++) {
      const [pick] = rollUpgrades(1, perm.luck || 0, new Set(this.runUpgrades.map((u) => u.id)));
      if (pick) this.applyUpgrade(pick);
    }

    this.notify(LAYOUT_NAMES[this.layout] + ' Arena', 3);
    this.beginIntermission(2.0);
    this.audio.startMusic();
  }

  beginIntermission(duration = INTERMISSION) {
    this.director.state = 'intermission';
    this.director.intermission = duration;
    this.intermissionTotal = duration;
  }

  nextWave() {
    this.wave++;
    this.director.startWave(this.wave);
    this.notify(isBossWave(this.wave) ? `WAVE ${this.wave} — BOSS` : `WAVE ${this.wave}`, 2.4);
    this.audio.play('wave');
    this.audio.setMusicIntensity(Math.min(1, this.wave / 25));
  }

  /** Offer upgrade cards; the UI calls chooseUpgrade() to resolve. */
  offerUpgrades() {
    const exclude = new Set(this.runUpgrades.filter((u) => u.unique).map((u) => u.id));
    this.pendingUpgrades = rollUpgrades(3, this.permMods.luck || 0, exclude);
    this.paused = true;
  }

  rerollUpgrades() {
    if (this.rerollsLeft <= 0) { this.audio.play('deny'); return false; }
    this.rerollsLeft--;
    this.pendingUpgrades = rollUpgrades(3, this.permMods.luck || 0);
    this.audio.play('ui');
    return true;
  }

  applyUpgrade(up) {
    const existing = this.runUpgrades.find((u) => u.id === up.id);
    if (existing) existing.stacks = (existing.stacks || 1) + 1;
    else this.runUpgrades.push({ ...up, stacks: 1 });
    if (this.player) {
      const beforeMax = this.player.maxHp;
      this.player.mods = this.baseMods();
      this.player.recomputeStats();
      // Max-health upgrades also heal for the amount gained.
      if (this.player.maxHp > beforeMax) this.player.hp += this.player.maxHp - beforeMax;
    }
  }

  chooseUpgrade(up) {
    this.applyUpgrade(up);
    this.pendingUpgrades = null;
    this.paused = false;
    this.audio.play('levelup');
    this.beginIntermission();
  }

  endRun() {
    if (this.over) return;
    this.over = true;
    this.running = false;
    this.audio.play('death');
    this.audio.stopMusic();
    const duration = (performance.now() - this.startTime) / 1000;
    const wavesCleared = Math.max(0, this.wave - 1);
    this.result = {
      wave: wavesCleared,
      reachedWave: this.wave,
      kills: this.player.kills,
      souls: Math.round(this.soulsEarned),
      duration,
      damageDealt: Math.round(this.player.damageDealt),
    };
    this.profile.finishRun(this.cls.id, {
      wave: wavesCleared, kills: this.player.kills,
      souls: this.result.souls, duration,
    });
  }

  // -------------------------------------------------------------------------
  // Helpers used by mobs, skills and effects
  // -------------------------------------------------------------------------

  notify(text, duration = 1.6) {
    this.notifications.push({ text, life: duration, max: duration });
    if (this.notifications.length > 4) this.notifications.shift();
  }

  sfx(name) { this.audio.play(name); }

  delay(seconds, fn) {
    if (seconds <= 0) { fn(); return; }
    this.timers.push({ t: seconds, fn });
  }

  blockDamageAt(x, y, z) {
    const id = this.world.blockAt(x, y, z);
    return BLOCKS[id] && BLOCKS[id].damage ? BLOCKS[id].damage : 0;
  }

  allies() {
    const list = [this.player, ...this.pets.filter((p) => !p.dead && !p.isTotem)];
    return list.filter((e) => e && !e.dead);
  }

  /** Enemy AI target selection — pets can pull aggro. */
  pickEnemyTarget(mob) {
    let best = this.player;
    let bestD = mob.distanceXZ(this.player);
    for (const p of this.pets) {
      if (p.dead || p.isTotem) continue;
      const d = mob.distanceXZ(p);
      if (d < bestD * 0.7) { best = p; bestD = d; }
    }
    return best;
  }

  nearestEnemy(x, y, z, maxDist, exclude = null) {
    let best = null, bestD = maxDist * maxDist;
    for (const m of this.mobs) {
      if (m.dead) continue;
      if (exclude && exclude.has(m)) continue;
      const d = dist2(x, y, z, m.x, m.centerY, m.z);
      if (d < bestD) { bestD = d; best = m; }
    }
    return best;
  }

  /** The enemy the player is looking at, for targeted skills. */
  aimTarget(player, maxDist) {
    const dir = forwardVec(player.yaw, player.pitch);
    let best = null, bestScore = -1;
    for (const m of this.mobs) {
      if (m.dead) continue;
      const dx = m.x - player.x, dy = m.centerY - player.eyeY, dz = m.z - player.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > maxDist || d < 0.001) continue;
      const dot = (dx * dir[0] + dy * dir[1] + dz * dir[2]) / d;
      if (dot < 0.72) continue;
      const score = dot - d / maxDist * 0.3;
      if (score > bestScore) { bestScore = score; best = m; }
    }
    return best;
  }

  enemiesInRadius(x, y, z, radius) {
    const r2 = radius * radius;
    return this.mobs.filter((m) => !m.dead && dist2(x, y, z, m.x, m.centerY, m.z) <= r2);
  }

  enemiesInCone(source, range, halfAngle) {
    const dir = forwardVec(source.yaw, 0);
    const out = [];
    for (const m of this.mobs) {
      if (m.dead) continue;
      const dx = m.x - source.x, dz = m.z - source.z;
      const dy = m.centerY - source.centerY;
      const d = Math.hypot(dx, dz);
      if (d > range + m.width || Math.abs(dy) > 3.2) continue;
      if (d < 0.001) { out.push(m); continue; }
      const dot = (dx * dir[0] + dz * dir[2]) / d;
      if (dot >= Math.cos(halfAngle)) out.push(m);
    }
    return out;
  }

  /** Any hostile entity of the opposite team near a point (projectile hits). */
  findHit(x, y, z, radius, team, exclude) {
    const candidates = team === TEAM.PLAYER
      ? this.mobs
      : [this.player, ...this.pets.filter((p) => !p.isTotem)];
    for (const e of candidates) {
      if (!e || e.dead) continue;
      if (exclude && exclude.has(e)) continue;
      const hw = e.width / 2 + radius;
      if (Math.abs(x - e.x) > hw || Math.abs(z - e.z) > hw) continue;
      if (y < e.y - radius || y > e.y + e.height + radius) continue;
      return e;
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Combat resolution
  // -------------------------------------------------------------------------

  /** Player/pet -> enemy damage, with crit, lifesteal, thorns and floaters. */
  dealDamage(source, target, amount, opts = {}) {
    if (!target || target.dead) return 0;
    const isPlayer = source === this.player;
    let dmg = amount;
    let crit = false;
    if (isPlayer) {
      crit = source.rollCrit(opts.forceCrit);
      if (crit) dmg *= source.critMult;
      // Shatter: frozen targets take extra damage.
      if (source.mods.frozenDamage && target.freeze > 0) dmg *= 1 + source.mods.frozenDamage;
      // Titanbane and the class capstones that specialise into boss fights.
      if (source.stats.bossMult > 1 && target.def && target.def.boss) dmg *= source.stats.bossMult;
    } else if (opts.forceCrit) {
      crit = true;
      dmg *= 2;
    }

    const dealt = target.damage(dmg, { ...opts, source });
    if (dealt <= 0) return 0;

    if (isPlayer) {
      source.damageDealt += dealt;
      if (source.lifesteal) source.heal(dealt * source.lifesteal);
      // Deep Wounds: crits leave a bleed scaled off the hit that landed.
      if (crit && source.mods.bleedPct && !opts.isDot && !target.dead) {
        target.applyDot(dealt * source.mods.bleedPct / 3, 3, 'bleed', source);
      }
      // Rage-style resources build by landing hits.
      if (!opts.isDot) {
        const perHit = (source.resourceDef.onHitGain || 0) + (source.mods.onHitGain || 0);
        if (perHit) source.gainResource(perHit);
      }
      if (source.mods.critCdr && crit) {
        for (let i = 0; i < source.cooldowns.length; i++) {
          source.cooldowns[i] = Math.max(0, source.cooldowns[i] - source.mods.critCdr);
        }
      }
      this.hitMarker = crit ? 0.32 : 0.18;
      this.timeSinceCombat = 0;
      if (this.profile.settings.showDamage && !opts.silent) {
        this.floaters.push(new FloatText(
          target.x, target.centerY + 0.4, target.z,
          Math.round(dealt).toString(), crit ? '#ffd24a' : '#ffffff', crit));
      }
      this.audio.play(crit ? 'crit' : 'hit');
      if (crit) this.screenShake = Math.max(this.screenShake, 0.12);
    }

    if (target.dead) this.onEnemyKilled(target, source, opts);
    return dealt;
  }

  /** Enemy -> player damage, with dodge, armor and thorns. */
  damageEntity(source, target, amount, opts = {}) {
    if (!target || target.dead) return 0;
    if (target === this.player) {
      if (Math.random() < this.player.dodge) {
        this.floaters.push(new FloatText(target.x, target.centerY + 1, target.z, 'DODGE', '#7dffb0'));
        return 0;
      }
      amount *= 1 - this.player.armor;
    } else if (target.armorPct) {
      amount *= 1 - target.armorPct;
    }
    const dealt = target.damage(amount, opts);
    if (target === this.player && dealt > 0) {
      this.timeSinceCombat = 0;
      this.screenShake = Math.max(this.screenShake, Math.min(0.45, dealt / this.player.maxHp * 1.6));
      this.audio.play('hurt');
      const r = this.player.resourceDef;
      if (r.onTakeGain) this.player.gainResource(r.onTakeGain);
      // Thorns reflect a share of the damage that actually landed — a flat
      // number would be worthless by wave 10 and free wave-1 clears before it.
      if (this.player.thorns && source && opts.melee !== false && source.damage) {
        source.damage(dealt * this.player.thorns, { source: this.player });
        if (source.dead) this.onEnemyKilled(source, this.player, {});
      }
      // Soul Link: split incoming damage with fiends.
      if (this.player.mods.soulLink) {
        const pets = this.pets.filter((p) => !p.dead && !p.isTotem);
        if (pets.length) pets[0].damage(dealt * this.player.mods.soulLink, {});
      }
      if (this.player.dead) this.endRun();
    }
    return dealt;
  }

  healEntity(source, target, amount) {
    const healed = target.heal(amount);
    if (healed > 0) {
      if (this.profile.settings.showDamage) {
        this.floaters.push(new FloatText(target.x, target.centerY + 0.6, target.z,
          '+' + Math.round(healed), '#7dff9d'));
      }
      // Atonement: healing yourself also damages nearby enemies.
      if (source === this.player && this.player.mods.atonement) {
        for (const m of this.enemiesInRadius(target.x, target.centerY, target.z, 7)) {
          this.dealDamage(this.player, m, healed * this.player.mods.atonement, { silent: true });
        }
      }
    }
    return healed;
  }

  onEnemyKilled(mob, killer, opts) {
    if (mob.counted) return;
    mob.counted = true;
    if (!(mob instanceof Mob)) return;

    const soulMult = 1 + (this.player.mods.soulGain || 0);
    const souls = mob.souls * soulMult;
    this.soulsEarned += souls;
    this.player.souls += souls;
    this.player.onKill(mob);

    this.burst(mob.x, mob.centerY, mob.z, mob.def.boss ? 40 : 12,
      mob.elite ? '#ffd24a' : '#c0392b');
    this.spawnGibs(mob);
    if (mob.def.boss) {
      this.screenShake = 0.6;
      this.audio.play('explode');
      this.notify('BOSS SLAIN  +' + Math.round(souls) + ' souls', 2.6);
    }

    // Chain Reaction / Living Bomb
    const explode = this.player.mods.corpseExplode || 0;
    if (explode > 0 && !mob.exploded) {
      this.explode(mob.x, mob.centerY, mob.z, 4.2, explode, {
        team: TEAM.PLAYER, source: this.player, color: '#ff8a3c', silentSelf: true,
      });
    }
    // Contagion: spread remaining rot to nearby enemies.
    const spread = this.player.mods.spread || 0;
    if (spread > 0 && mob.dots.length) {
      const dot = mob.dots[0];
      const near = this.enemiesInRadius(mob.x, mob.centerY, mob.z, 8).slice(0, spread);
      for (const n of near) n.applyDot(dot.dps, dot.remaining, dot.type, this.player);
    }
  }

  // -------------------------------------------------------------------------
  // Effect spawners
  // -------------------------------------------------------------------------

  fireProjectile(opts) {
    this.projectiles.push(new Projectile(opts));
  }

  explode(x, y, z, radius, damage, opts = {}) {
    this.shockwave(x, y, z, radius, opts.color || '#ff8a3c');
    this.burst(x, y, z, Math.min(40, 8 + radius * 3), opts.color || '#ff8a3c');
    this.audio.play('explode');
    this.screenShake = Math.max(this.screenShake, Math.min(0.5, radius * 0.05));

    if (opts.team === TEAM.PLAYER) {
      for (const m of this.enemiesInRadius(x, y, z, radius)) {
        if (opts.exclude === m) continue;
        const d = Math.hypot(m.x - x, m.z - z);
        const falloff = clamp(1 - d / radius * 0.55, 0.35, 1);
        const dx = m.x - x, dz = m.z - z;
        const dd = Math.hypot(dx, dz) || 1;
        if (opts.detonate) {
          const stored = m.totalDotDamageRemaining();
          m.dots.length = 0;
          this.dealDamage(opts.source, m, stored * 1.5, { silent: true });
        }
        this.dealDamage(opts.source, m, damage * falloff, {
          knockback: opts.knockback || 0, kx: dx / dd, kz: dz / dd,
          forceCrit: opts.forceCrit, skillId: opts.skillId,
        });
        if (opts.burn) m.applyDot(opts.burn, 4, 'burn', opts.source);
        if (opts.stun) m.stun = Math.max(m.stun, opts.stun);
      }
    } else {
      for (const a of this.allies()) {
        const d = Math.hypot(a.x - x, a.z - z);
        if (d > radius) continue;
        const falloff = clamp(1 - d / radius * 0.6, 0.3, 1);
        const dx = a.x - x, dz = a.z - z;
        const dd = Math.hypot(dx, dz) || 1;
        this.damageEntity(opts.source, a, damage * falloff, {
          knockback: opts.knockback || 6, kx: dx / dd, kz: dz / dd, melee: false,
        });
      }
    }
  }

  /** Leave a lingering hazard on the ground. */
  spawnZone(x, y, z, opts) {
    this.zones.push(new Zone(x, y, z, opts));
  }

  telegraph(x, y, z, radius, delay, onComplete, color) {
    this.telegraphs.push(new Telegraph(x, y, z, radius, delay, onComplete, color));
  }

  shockwave(x, y, z, radius, color) {
    this.shockwaves.push(new Shockwave(x, y, z, radius, color));
  }

  burst(x, y, z, count, color) {
    for (let i = 0; i < count; i++) {
      this.particles.push(new Particle(
        x, y, z,
        rand(5, -5), rand(7, 0.5), rand(5, -5),
        color, rand(0.7, 0.3), rand(0.22, 0.08)));
    }
  }

  beam(x0, y0, z0, x1, y1, z1, color) {
    this.beams.push({ x0, y0, z0, x1, y1, z1, color: hexToRgb(color || '#ffffff'), life: 0.16, max: 0.16 });
  }

  spawnMob(typeId, x, y, z, elite = false) {
    const scaling = waveScaling(this.wave, this.difficulty);
    const mob = new Mob(typeId, this.wave, x, y, z, scaling);
    if (elite) mob.makeElite();
    this.mobs.push(mob);
    return mob;
  }

  // -------------------------------------------------------------------------
  // Frame update
  // -------------------------------------------------------------------------

  update(dt, input) {
    if (!this.running || this.paused) return;
    this.time += dt;
    this.timeSinceCombat += dt;
    this.screenShake = Math.max(0, this.screenShake - dt * 1.8);
    this.hitMarker = Math.max(0, this.hitMarker - dt * 3);

    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }

    this.player.update(dt, this, input);
    if (this.player.dead) { this.endRun(); return; }

    for (const m of this.mobs) if (!m.dead) m.update(dt, this);
    for (const p of this.pets) if (!p.dead) p.update(dt, this);
    for (const p of this.projectiles) if (!p.dead) p.update(dt, this);
    for (const p of this.particles) p.update(dt);
    for (const g of this.gibs) g.update(dt, this);
    for (const t of this.telegraphs) t.update(dt);
    for (const s of this.shockwaves) s.update(dt);
    for (const z of this.zones) z.update(dt, this);
    for (const f of this.floaters) f.update(dt);
    for (const b of this.beams) b.life -= dt;
    for (const n of this.notifications) n.life -= dt;

    this.updatePetRebirth(dt);

    // Retire dead things.
    this.mobs = this.mobs.filter((m) => {
      if (m.dead) { this.onEnemyKilled(m, null, {}); return false; }
      return true;
    });
    this.pets = this.pets.filter((p) => !p.dead);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    this.particles = this.particles.filter((p) => !p.dead);
    this.gibs = this.gibs.filter((g) => !g.dead);
    this.telegraphs = this.telegraphs.filter((t) => !t.dead);
    this.shockwaves = this.shockwaves.filter((s) => !s.dead);
    this.zones = this.zones.filter((z) => !z.dead);
    this.floaters = this.floaters.filter((f) => !f.dead);
    this.beams = this.beams.filter((b) => b.life > 0);
    this.notifications = this.notifications.filter((n) => n.life > 0);

    this.updateWaves(dt);
  }

  /** Demonic Rebirth: a fiend killed in combat claws its way back, on a timer. */
  updatePetRebirth(dt) {
    this.petRebirthCd = Math.max(0, (this.petRebirthCd || 0) - dt);
    if (!this.player.mods.petRebirth) return;
    for (const pet of this.pets) {
      if (!pet.dead || !pet.isPet || pet.rebirthChecked) continue;
      pet.rebirthChecked = true;
      if (pet.expired || this.petRebirthCd > 0) continue;
      this.petRebirthCd = 30;
      const sx = this.player.x + rand(2, -2), sz = this.player.z + rand(2, -2);
      const sy = this.world.groundAt(sx, sz, this.player.y + 2);
      this.pets.push(new Fiend(sx, sy, sz, { ...pet.spawnOpts, owner: this.player }));
      this.burst(sx, sy + 0.8, sz, 16, '#a35cff');
      this.notify('Fiend reborn');
      this.audio.play('summon');
    }
  }

  updateWaves(dt) {
    const d = this.director;
    if (d.state === 'intermission') {
      d.intermission -= dt;
      if (d.intermission <= 0) this.nextWave();
      return;
    }

    const spawns = d.update(dt, this.mobs.length);
    for (const s of spawns) {
      const pt = this.world.pickSpawn(this.player.x, this.player.z, s.boss ? 16 : 11);
      const mob = this.spawnMob(s.typeId, pt.x, pt.y + 0.2, pt.z, s.elite);
      if (s.boss) {
        this.notify(mob.def.name.toUpperCase() + ' AWAKENS', 2.6);
        this.audio.play('roar');
        this.screenShake = 0.5;
      }
      this.burst(pt.x, pt.y + 1, pt.z, 8, '#6a2fb5');
    }

    if (d.state === 'clearing' && this.mobs.length === 0) {
      const bonus = waveClearBonus(this.wave);
      this.soulsEarned += bonus * (1 + (this.player.mods.soulGain || 0));
      this.notify(`Wave ${this.wave} cleared  +${bonus} souls`, 2.2);
      this.player.heal(this.player.maxHp * 0.25);
      this.rerollsLeft = this.permMods.rerolls || 0;
      this.player.cheatDeathUsed = false;
      this.offerUpgrades();
    }
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  get camera() {
    const p = this.player;
    const shake = this.screenShake;
    const sx = shake ? rand(shake * 0.22, -shake * 0.22) : 0;
    const sy = shake ? rand(shake * 0.22, -shake * 0.22) : 0;
    const bob = Math.sin(p.bobPhase * 2) * 0.035 * (p.onGround ? 1 : 0.2);
    return {
      x: p.x + sx,
      y: p.eyeY + bob + sy,
      z: p.z,
      yaw: p.yaw + sx * 0.1,
      pitch: clamp(p.pitch - p.viewKick * 0.06 + sy * 0.1, -1.5, 1.5),
      fov: this.profile.settings.fov + (p.sprinting ? 4 : 0),
    };
  }

  draw() {
    const cam = this.camera;
    this.r.beginFrame(cam, this.r.skyTint);
    this.r.drawWorld();
    this.drawShadows();
    for (const m of this.mobs) m.draw(this.r);
    for (const p of this.pets) p.draw(this.r);
    // Sky fills the gaps left by the opaque pass, before anything blended.
    this.r.drawSky();
    for (const p of this.projectiles) p.draw(this.r);
    for (const t of this.telegraphs) t.draw(this.r);
    for (const z of this.zones) z.draw(this.r);
    for (const s of this.shockwaves) s.draw(this.r);
    for (const g of this.gibs) g.draw(this.r);
    for (const p of this.particles) p.draw(this.r);
    this.drawBeams();
    if (!this.player.dead) this.player.drawViewModel(this.r, cam);
  }

  /**
   * Contact shadows, drawn in one pass between the world and the characters
   * so nothing casts a shadow onto another character's face. The blob is
   * dropped onto the first solid surface below the entity and fades with the
   * distance it had to fall, which reads as a jump.
   */
  drawShadows() {
    if (!this.r.fancy) return;
    const cast = (e, scale = 1) => {
      if (!e || e.dead) return;
      const gy = this.world.groundAt(e.x, e.z, e.y + 0.5);
      const drop = Math.max(0, e.y - gy);
      if (drop > 6) return;
      const fade = 1 - Math.min(1, drop / 6);
      this.r.drawShadow(e.x, gy, e.z, (e.width || 0.6) * 0.95 * scale * (1 + drop * 0.10),
        0.45 * fade * fade);
    };
    for (const m of this.mobs) cast(m, m.def && m.def.boss ? 1.25 : 1);
    for (const p of this.pets) cast(p);
    if (!this.player.dead) cast(this.player);
  }

  /**
   * Break a corpse into tumbling chunks in its own colours, thrown along
   * whatever killed it. Capped hard: a deep wave kills a dozen things a
   * second, and unbounded debris is the fastest way to stall a phone.
   */
  spawnGibs(mob) {
    if (!this.r.fancy) return;
    const MAX = 90;
    if (this.gibs.length > MAX) return;
    const skin = mob.def.skin;
    const parts = mob.def.boss ? 14 : mob.elite ? 9 : 6;
    const unit = mob.height / 1.8;
    const kx = mob.lastHitKX || 0, kz = mob.lastHitKZ || 0;
    for (let i = 0; i < parts; i++) {
      const colors = [skin.head, skin.body, skin.arm, skin.leg];
      const color = colors[i % colors.length];
      this.gibs.push(new Gib(
        mob.x + rand(0.3, -0.3),
        mob.y + 0.4 + Math.random() * mob.height * 0.8,
        mob.z + rand(0.3, -0.3),
        rand(3.4, -3.4) + kx * 2.4,
        3 + Math.random() * 5,
        rand(3.4, -3.4) + kz * 2.4,
        color,
        (0.16 + Math.random() * 0.12) * unit,
        1.8 + Math.random() * 1.4,
        i % 2 ? T.CLOTH : T.SKIN,
      ));
    }
    // Oldest first, so the newest kill always gets its debris.
    while (this.gibs.length > MAX) this.gibs.shift();
  }

  drawBeams() {
    for (const b of this.beams) {
      const steps = 10;
      const t = b.life / b.max;
      for (let i = 0; i <= steps; i++) {
        const k = i / steps;
        const x = b.x0 + (b.x1 - b.x0) * k;
        const y = b.y0 + (b.y1 - b.y0) * k;
        const z = b.z0 + (b.z1 - b.z0) * k;
        const s = 0.14 * t + 0.04;
        this.r.drawBox(x + rand(0.06, -0.06), y + rand(0.06, -0.06), z + rand(0.06, -0.06),
          s, s, s, { tile: 0, color: b.color, emissive: 1, alpha: t });
      }
    }
  }
}

export { MOB_TYPES };
