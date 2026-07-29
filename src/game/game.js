// Game core: owns the world, entities, combat resolution and the wave loop.

import { createArena, LAYOUT_COUNT, LAYOUT_NAMES } from '../world/world.js';
import { BLOCKS } from '../world/blocks.js';
import { Player, buildMods } from './player.js';
import { Mob, MOB_TYPES } from './mobs.js';
import { Fiend } from './pets.js';
import { Projectile, Particle, Gib, Telegraph, Shockwave, Zone, Potion, FloatText, hexToRgb } from './effects.js';
import { TEAM } from './entity.js';
import { WaveDirector, waveScaling, waveClearBonus, isBossWave } from './waves.js';
import { permanentMods, masteryMods, masteryRank } from '../data/permanent.js';
import { difficultyFor } from '../data/difficulty.js';
import { affixesForWave, affixSoulBonus } from '../data/affixes.js';
import { rollPotion, DROP_CHANCE, ELITE_DROP_CHANCE, BOSS_DROPS, POTION_LIFETIME } from '../data/potions.js';
import { xpForRun, xpForWave, XP_PER_KILL, XP_ELITE_MULT, XP_BOSS_MULT } from '../data/levels.js';
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
    this.potions = [];
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
    this.pendingUpgrades = null;
    this.rerollsLeft = 0;
    this.notifications = [];
    this.screenShake = 0;
    this.hitMarker = 0;
    this.soulsEarned = 0;
    // Kill combo. The whole point is to make pressing forward pay: souls are
    // the only currency, and the multiplier only survives if you keep killing.
    this.combo = 0;
    this.comboTimer = 0;
    this.comboBest = 0;
    this.recordBeaten = false;
    this.affixes = [];
    this.affixSeed = 0;
    this.stormTimer = 0;
    this.grievous = 0;
    this.grievousTimer = 0;
    this.hitstop = 0;
    this.flash = 0;
    this.flashColor = '#ffffff';
    // Everything quests measure. Counted here rather than derived at the end
    // because most of it — elites, potions, casts — leaves no trace once the
    // run is over.
    this.tally = {
      eliteKills: 0, bossKills: 0, potionsDrunk: 0, skillsCast: 0, affixWaves: 0,
    };
    // XP is accumulated live rather than totalled at the end, because the HUD
    // bar has to fill while you play — a progress bar that only moves on the
    // results screen is a results screen, not a progress bar.
    this.xpEarned = 0;
    // Pending XP waiting to be shown. One popup per kill would be a hundred
    // popups a wave by wave 30; batching turns that into one readable number.
    this.xpPending = 0;
    this.xpFlush = 0;
    this.xpPops = [];
  }

  /** True while the named wave affix is in force. */
  hasAffix(id) {
    for (const a of this.affixes) if (a.id === id) return true;
    return false;
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
    this.baseMods = () => buildMods(classDef, cd.talents, perm);

    // Fixed for the run: the affix draw must survive a pause, a HUD redraw and
    // a wave being re-read, so it is a pure function of (seed, wave) and the
    // seed is rolled exactly once, here.
    this.affixSeed = opts.seed !== undefined ? opts.seed : (Math.random() * 0x7fffffff) | 0;
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

    // Mastery talents that grant a skill free ranks. Applied before Head Start
    // so a specialised skill is already ahead when the run's own ranks land on
    // top of it — that head start is the whole reason to spec into one skill
    // instead of spreading points across the generic branches.
    this.player.skills.forEach((skill, i) => {
      const free = Math.floor(this.player.skillMods(skill.id).startRank || 0);
      for (let n = 0; n < free; n++) this.player.rankUp(i);
    });
    // Head Start: free skill ranks before wave 1, spread across the loadout.
    const freebies = perm.startingUpgrades || 0;
    for (let i = 0; i < freebies; i++) this.player.rankUp(i % this.player.skills.length);

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
    // The one moment a run stops being routine. Called out once, loudly.
    const best = (this.profile.classData(this.cls.id) || {}).bestWave || 0;
    if (!this.recordBeaten && best > 0 && this.wave > best) {
      this.recordBeaten = true;
      this.notify('NEW RECORD', 3.2);
      this.audio.play('rankup');
      this.screenShake = Math.max(this.screenShake, 0.35);
    }
    this.affixes = affixesForWave(this.wave, this.affixSeed, this.difficulty);
    this.stormTimer = 3.5;
    this.grievous = 0;
    this.director.startWave(this.wave);
    this.notify(isBossWave(this.wave) ? `WAVE ${this.wave} — BOSS` : `WAVE ${this.wave}`, 2.4);
    // Named one per line rather than as a single run-on banner: the counterplay
    // is per affix, and a wall of text at the moment the wave starts is text
    // nobody reads.
    for (const a of this.affixes) this.notify(`${a.icon}  ${a.name} — ${a.blurb}`, 3.4);
    this.audio.play('wave');
    this.audio.setMusicIntensity(Math.min(1, this.wave / 25));
  }

  /**
   * What the next wave will be played under. Shown during the intermission so
   * the rules are something you plan around rather than discover mid-fight.
   */
  get upcomingAffixes() {
    return affixesForWave(this.wave + 1, this.affixSeed, this.difficulty);
  }

  /**
   * Clearing a wave ranks up one of the four equipped skills. Stat cards made
   * every run feel the same — a slightly bigger number on the same rotation.
   * Choosing which skill grows is a decision about how the rest of the run is
   * played, and it is legible at a glance because it is your own icons.
   */
  offerUpgrades() {
    this.pendingUpgrades = this.player.skills.map((skill, index) => ({
      index,
      skill,
      rank: this.player.rankOf(index),
    }));
    this.paused = true;
  }

  rerollUpgrades() {
    // Nothing to reroll: the choice is always your own four skills.
    return false;
  }

  /** `up` is one of the descriptors offerUpgrades() produced. */
  chooseUpgrade(up) {
    let rank = this.player.rankUp(up.index);
    // Fortune: a chance the wave pays out twice. Capped, because a run that
    // reliably doubles every reward outgrows the waves it is clearing.
    const luck = clamp(this.permMods.luck || 0, 0, 0.5);
    let bonus = false;
    if (luck > 0 && Math.random() < luck) {
      rank = this.player.rankUp(up.index);
      bonus = true;
    }
    // Surviving a wave restores you. Without any stat growth in a run, the
    // only other way to arrive at a boss alive is to have taken no damage at
    // all for five waves, which is not a plan — it is luck.
    this.player.hp = this.player.maxHp;
    // Every fifth wave is a boss, and a boss is a power check: the whole
    // loadout gains a rank so the spike is met with a spike.
    let mastered = false;
    if (isBossWave(this.wave + 1)) {
      for (let i = 0; i < this.player.skills.length; i++) this.player.rankUp(i);
      mastered = true;
    }
    this.pendingUpgrades = null;
    this.paused = false;
    this.audio.play('rankup');
    this.notify(`${up.skill.name} — rank ${rank}${bonus ? '  (Fortune!)' : ''}`, 2.2);
    if (mastered) this.notify('All skills +1 rank', 2.4);
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
      quests: this.questReport(wavesCleared),
      // Waves *cleared*, not reached: dying on wave 12 pays for eleven. Paying
      // for the wave you died in would make walking into a pack and dying the
      // fastest way to level, which is not a strategy worth rewarding.
      // The live total, not a recomputation. The HUD bar has been showing this
      // number all run; banking a different one would mean the bar was lying.
      xp: Math.round(this.xpEarned),
    });
    this.result.xp = Math.round(this.xpEarned);
    this.result.levelUps = this.profile.lastLevelUps || [];
    this.questsFinished = this.profile.lastQuestsFinished || [];
  }

  /**
   * What this run contributed, split the way the quest log needs it: `deltas`
   * accumulate forever, `peaks` only ever replace a previous best. Getting
   * that split wrong is the one bug here a player would actually notice — a
   * "reach wave 20" quest ticking up four every run.
   */
  questReport(wavesCleared) {
    return {
      deltas: {
        kills: this.player.kills,
        eliteKills: this.tally.eliteKills,
        bossKills: this.tally.bossKills,
        wavesCleared,
        damageDealt: Math.round(this.player.damageDealt),
        potionsDrunk: this.tally.potionsDrunk,
        skillsCast: this.tally.skillsCast,
        affixWaves: this.tally.affixWaves,
        runs: 1,
      },
      peaks: {
        bestWave: this.wave,
        bestCombo: this.comboBest,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Helpers used by mobs, skills and effects
  // -------------------------------------------------------------------------

  /**
   * Bank XP and queue it to be shown.
   *
   * Nothing is drawn here. The amount goes into a pending pot that flushes
   * once the killing stops for a moment, so a burst of eight kills reads as
   * one "+16 XP" instead of eight "+2 XP" fighting each other for the same
   * few pixels. That is the whole difference between a progress cue and
   * visual noise.
   */
  awardXp(amount) {
    if (!(amount > 0)) return;
    this.xpEarned += amount;
    this.xpPending += amount;
    // Restarted on every award, so a continuous fight shows nothing until
    // there is a gap — and a gap is exactly when a player has the attention
    // to read a number.
    this.xpFlush = 0.55;
  }

  updateXpPops(dt) {
    if (this.xpPending > 0) {
      this.xpFlush -= dt;
      // Flushed on a timer, but also whenever the pot gets large enough that
      // waiting would feel like the game had stopped counting.
      if (this.xpFlush <= 0 || this.xpPending >= 400) {
        this.xpPops.push({ amount: Math.round(this.xpPending), life: 1.15, max: 1.15 });
        this.xpPending = 0;
        this.xpFlush = 0;
        // Three at once is the most that stays readable; older ones go first.
        while (this.xpPops.length > 3) this.xpPops.shift();
      }
    }
    for (const p of this.xpPops) p.life -= dt;
    if (this.xpPops.length) this.xpPops = this.xpPops.filter((p) => p.life > 0);
  }

  /**
   * A brief full-screen wash in the colour of whatever just happened. Drawn by
   * the HUD, decayed here, and deliberately short — anything longer than a few
   * frames stops being punctuation and starts obscuring the fight.
   */
  impactFlash(color, strength) {
    if (strength <= (this.flash || 0)) return;
    this.flash = Math.min(0.9, strength);
    this.flashColor = color || '#ffffff';
  }

  notify(text, duration = 1.6) {
    this.notifications.push({ text, life: duration, max: duration });
    if (this.notifications.length > 4) this.notifications.shift();
  }

  sfx(name) { this.audio.play(name); }

  /**
   * A heartbeat under a quarter health. Audio is the only channel that reaches
   * a player whose eyes are on the crowd, and the red vignette alone is easy
   * to miss in a busy fight.
   */
  updateHeartbeat(dt) {
    const p = this.player;
    if (!p || p.dead) { this.heartbeat = 0; return; }
    const frac = p.hp / p.maxHp;
    if (frac > 0.25) { this.heartbeat = 0; return; }
    this.heartbeat = (this.heartbeat || 0) - dt;
    if (this.heartbeat > 0) return;
    // Faster the closer to death: 1.2s at the threshold, 0.55s at the brink.
    this.heartbeat = 0.55 + (frac / 0.25) * 0.65;
    this.audio.play('lowhp');
  }

  /**
   * The moment a skill goes off: a ring of motes thrown outward from the
   * caster's hands, brighter and wider the higher the skill is ranked. Cheap
   * — a dozen particles — but it is what makes a cast feel like it left the
   * character rather than simply happening somewhere.
   */
  /** A cone of sparks thrown along a hit direction. */
  burstDirected(x, y, z, dx, dz, count, color) {
    if (!this.r.fancy) return;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dx / len, nz = dz / len;
    for (let i = 0; i < count; i++) {
      const spread = rand(0.7, -0.7);
      const c = Math.cos(spread), s = Math.sin(spread);
      const vx = (nx * c - nz * s) * rand(7, 2.5);
      const vz = (nx * s + nz * c) * rand(7, 2.5);
      this.particles.push(new Particle(x, y, z, vx, rand(3.4, 0.6), vz,
        color, rand(0.34, 0.16), rand(0.10, 0.05), 16));
    }
  }

  castFlare(caster, color, rank = 0) {
    const n = 10 + Math.min(14, rank * 2);
    const spread = 1 + Math.min(1.4, rank * 0.12);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.time;
      const speed = (2.6 + Math.random() * 2.2) * spread;
      this.particles.push(new Particle(
        caster.x + Math.cos(a) * 0.34,
        caster.centerY + 0.15,
        caster.z + Math.sin(a) * 0.34,
        Math.cos(a) * speed, 1.4 + Math.random() * 1.6, Math.sin(a) * speed,
        color, 0.34 + Math.random() * 0.22, 0.10 + Math.min(0.10, rank * 0.012), 7));
    }
  }

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
  /**
   * `minDot` is how far off-centre a target may be. Skills use a wide cone so
   * a chain or a dash finds something; aim assist uses a tight one, because an
   * assist that acquires targets you were not pointing at does not help you
   * aim — it takes the aim away.
   */
  aimTarget(player, maxDist, minDot = 0.55) {
    const dir = forwardVec(player.yaw, player.pitch);
    let best = null, bestScore = -1;
    for (const m of this.mobs) {
      if (m.dead) continue;
      const dx = m.x - player.x, dy = m.centerY - player.eyeY, dz = m.z - player.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > maxDist || d < 0.001) continue;
      const dot = (dx * dir[0] + dy * dir[1] + dz * dir[2]) / d;
      if (dot < minDot) continue;
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
      if (crit) {
        this.screenShake = Math.max(this.screenShake, 0.22);
        this.hitstop = Math.max(this.hitstop, 0.045);
        // Sparks thrown along the blow, not scattered: the direction is what
        // makes a critical read as a hit rather than a light show.
        const kx = opts.kx || 0, kz = opts.kz || 0;
        this.burstDirected(target.x, target.centerY, target.z, kx, kz, 10, '#ffd24a');
      } else {
        this.burstDirected(target.x, target.centerY, target.z,
          opts.kx || 0, opts.kz || 0, 3, '#ffffff');
      }
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
        this.audio.play('dodge');
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
      // Grievous: every hit deepens a wound that only closes if you break off.
      // Stacks rather than refreshes, so trading twenty small hits is worse
      // than eating one big one — which is exactly the habit it exists to break.
      if (this.hasAffix('grievous')) {
        this.grievous = Math.min(8, this.grievous + 1);
        this.grievousTimer = 0;
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

  /** Seconds a combo survives without a kill. Shrinks as it climbs, so a long
   *  streak has to be *earned* rather than coasted on. */
  get comboWindow() {
    return Math.max(1.6, 4.0 - this.combo * 0.06);
  }

  /** Multiplier the current streak is worth. Capped so it stays a bonus. */
  get comboMult() {
    return 1 + Math.min(2.0, this.combo * 0.04);
  }

  updateCombo(dt) {
    if (this.combo <= 0) return;
    this.comboTimer -= dt;
    if (this.comboTimer > 0) return;
    this.combo = 0;
    this.comboTimer = 0;
  }

  onEnemyKilled(mob, killer, opts) {
    if (mob.counted) return;
    mob.counted = true;
    if (!(mob instanceof Mob)) return;

    this.combo++;
    this.comboTimer = this.comboWindow;
    this.comboBest = Math.max(this.comboBest, this.combo);
    // Every tenth kill in a streak is called out, with the cue pitched up by
    // the streak so the ear tracks it without looking at the counter.
    if (this.combo % 10 === 0) {
      this.notify(`${this.combo} KILL STREAK  ×${this.comboMult.toFixed(2)}`, 1.6);
      this.audio.play('levelup');
    }

    this.affixesOnKill(mob);
    this.rollPotionDrop(mob);
    if (mob.def.boss) this.tally.bossKills++;
    else if (mob.elite) this.tally.eliteKills++;
    this.awardXp(XP_PER_KILL * (mob.def.boss ? XP_BOSS_MULT : mob.elite ? XP_ELITE_MULT : 1));

    // Affixes pay. A wave under three rules is the hardest thing in the run and
    // has to also be the best place to be, or the optimal play is to farm the
    // plain waves and the whole system is a tax.
    const soulMult = (1 + (this.player.mods.soulGain || 0) + affixSoulBonus(this.affixes))
      * this.comboMult;
    const souls = mob.souls * soulMult;
    this.soulsEarned += souls;
    this.player.souls += souls;
    this.player.onKill(mob);

    this.burst(mob.x, mob.centerY, mob.z, mob.def.boss ? 40 : 12,
      mob.elite ? '#ffd24a' : '#c0392b');
    this.spawnGibs(mob);
    this.audio.play(mob.def.boss ? 'bossdown' : 'gib');
    if (mob.def.boss) {
      this.screenShake = 0.6;
      this.hitstop = Math.max(this.hitstop, 0.28);
      this.impactFlash('#ffd24a', 0.85);
      this.audio.play('explode');
      this.notify('BOSS SLAIN  +' + Math.round(souls) + ' 💠', 2.6);
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
    const color = opts.color || '#ff8a3c';
    this.shockwave(x, y, z, radius, color);
    // A second, wider and slower ring: the leading edge sells the reach, the
    // trailing one sells the weight.
    this.shockwaves.push(new Shockwave(x, y, z, radius * 1.45, color, 0.62));
    this.burst(x, y, z, Math.min(70, 16 + radius * 6), color);
    // Debris thrown upward and out, which is what a blast in a voxel world
    // should kick up. Cheap and gated behind the fancy switch like the rest.
    if (this.r.fancy) {
      const chunks = Math.min(14, 4 + Math.round(radius));
      for (let i = 0; i < chunks; i++) {
        const a = (i / chunks) * Math.PI * 2 + Math.random();
        const sp = radius * rand(2.4, 1.1);
        this.gibs.push(new Gib(
          x + Math.cos(a) * 0.5, y + 0.4, z + Math.sin(a) * 0.5,
          Math.cos(a) * sp, rand(11, 5), Math.sin(a) * sp,
          hexToRgb(color), rand(0.26, 0.12), rand(1.6, 0.9), T.BLANK));
      }
    }
    this.audio.play('explode');
    this.screenShake = Math.max(this.screenShake, Math.min(0.75, radius * 0.075));
    // Big blasts stop time and wash the screen; small ones do neither. Tying
    // both to the radius is what keeps a Meteor feeling different from a
    // Fireball rather than every cast producing the same light show.
    if (radius >= 4) {
      this.hitstop = Math.max(this.hitstop, Math.min(0.13, radius * 0.017));
      this.impactFlash(color, Math.min(0.5, radius * 0.045));
      // A rising column of fire at the seat of the blast. A ring alone reads
      // as flat on a voxel floor; the column is what gives it a middle.
      if (this.r.fancy) {
        for (let i = 0; i < Math.min(26, radius * 4); i++) {
          const a = Math.random() * Math.PI * 2;
          const rr = Math.random() * radius * 0.4;
          this.particles.push(new Particle(
            x + Math.cos(a) * rr, y, z + Math.sin(a) * rr,
            Math.cos(a) * rand(2.2, 0.2), rand(14, 7), Math.sin(a) * rand(2.2, 0.2),
            color, rand(0.9, 0.45), rand(0.4, 0.18), 9));
        }
      }
    }

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

  /**
   * Decide whether a kill leaves a potion behind. Elites and bosses are far
   * more generous on purpose: those are the kills you spend cooldowns on, and
   * a set-piece that pays nothing teaches you to walk around it.
   */
  rollPotionDrop(mob) {
    if (!mob.def) return;
    // A Spiteful shade is spawned by a kill, so paying out for killing it
    // would turn one affix into an unbounded potion fountain.
    if (mob.isShade) return;
    let drops = 0;
    if (mob.def.boss) drops = BOSS_DROPS;
    else if (Math.random() < (mob.elite ? ELITE_DROP_CHANCE : DROP_CHANCE)) drops = 1;
    for (let i = 0; i < drops; i++) {
      const def = rollPotion();
      this.potions.push(new Potion(
        mob.x + rand(0.6, -0.6), mob.centerY + 0.3, mob.z + rand(0.6, -0.6),
        def, POTION_LIFETIME));
    }
    if (drops) this.audio.play('drop');
  }

  /** Walked over a potion. */
  collectPotion(potion) {
    const def = potion.def;
    const p = this.player;
    if (def.heal) this.healEntity(p, p, p.maxHp * def.heal);
    if (def.duration > 0) {
      // Keyed by the potion id, so a second Draught of Fury refreshes the
      // timer instead of stacking into something the balance never saw.
      p.addBuff('potion_' + def.id, {
        duration: def.duration,
        damageBonus: def.damageBonus || 0,
        moveSpeed: def.moveSpeed || 0,
        attackSpeedBonus: def.attackSpeedBonus || 0,
        icon: '🧪',
        color: def.color,
        name: def.name,
      });
    }
    this.tally.potionsDrunk++;
    this.notify(`${def.name} — ${def.blurb}`, 2.0);
    this.audio.play(def.heal ? 'quaff' : 'buff');
    this.burst(potion.x, potion.y + 0.3, potion.z, 18, def.glow);
    this.shockwave(potion.x, potion.y, potion.z, 1.8, def.glow);
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
    this.applyAffixes(mob);
    this.mobs.push(mob);
    return mob;
  }

  /**
   * Stamp the wave's rules onto a newly spawned enemy. Applied here rather than
   * in the Mob constructor so anything summoned mid-wave — a Broodmother's
   * spawn, a Spiteful shade — is bound by the same rules as the wave it joined.
   */
  applyAffixes(mob) {
    if (!this.affixes.length) return mob;
    const boss = !!(mob.def && mob.def.boss);
    for (const a of this.affixes) {
      switch (a.id) {
        case 'fortified':
          // Trash only. Paired with Tyrannical it would make every wave a wall;
          // split, each one tells you where to spend your cooldowns.
          if (!boss) {
            mob.maxHp = Math.round(mob.maxHp * 1.55);
            mob.hp = mob.maxHp;
          }
          break;
        case 'tyrannical':
          if (boss) {
            mob.maxHp = Math.round(mob.maxHp * 1.45);
            mob.hp = mob.maxHp;
            mob.damageAmount *= 1.25;
          }
          break;
        case 'quickened':
          mob.speed *= 1.22;
          break;
        case 'warded':
          // A flat share of health, so a ward is worth the same fraction of a
          // fight on any enemy — and big single hits are the efficient answer.
          mob.absorb = (mob.absorb || 0) + mob.maxHp * (boss ? 0.20 : 0.35);
          mob.warded = true;
          break;
        case 'frenzied':
          mob.frenzyAffix = true;
          break;
        default: break;
      }
    }
    return mob;
  }

  /** Corpse-triggered affixes. Called from onEnemyKilled. */
  affixesOnKill(mob) {
    if (!this.affixes.length) return;
    const scale = waveScaling(this.wave, this.difficulty);
    for (const a of this.affixes) {
      switch (a.id) {
        case 'volatile': {
          // Scales off the wave, not off the enemy: otherwise clearing trash
          // would be free and the one big kill would be the only dangerous one.
          const dmg = 7 * scale.damage * (mob.def.boss ? 2.4 : 1);
          this.telegraph(mob.x, mob.y, mob.z, 3.6, 0.55, () => {
            this.explode(mob.x, mob.y + 0.6, mob.z, 3.6, dmg, {
              team: TEAM.ENEMY, source: null, color: a.color, knockback: 5,
            });
          }, a.color);
          break;
        }
        case 'sanguine':
          this.spawnZone(mob.x, mob.y, mob.z, {
            radius: 3.0, dps: 6 * scale.damage, team: TEAM.ENEMY,
            source: null, color: a.color, duration: 7, heals: 0.05,
          });
          break;
        case 'spiteful': {
          // Not every corpse — a shade per kill turns a cleared wave into a
          // second wave. One in three keeps it a threat you can outpace.
          if (mob.isShade || Math.random() > 0.34) break;
          const shade = this.spawnMob('wraith', mob.x, mob.y + 0.4, mob.z, false);
          shade.isShade = true;
          shade.souls = 0;              // no soul farm off an infinite spawner
          shade.maxHp = Math.max(1, Math.round(shade.maxHp * 0.35));
          shade.hp = shade.maxHp;
          shade.speed *= 1.35;
          this.burst(mob.x, mob.centerY, mob.z, 10, a.color);
          break;
        }
        default: break;
      }
    }
  }

  /**
   * Storming: lightning walks the arena on a timer, aimed near the player but
   * never on them — the telegraph is the whole mechanic, and a strike you
   * cannot step out of is just unavoidable damage with extra steps.
   */
  updateAffixes(dt) {
    if (!this.affixes.length || !this.player || this.player.dead) return;
    if (!this.hasAffix('storming')) return;
    this.stormTimer -= dt;
    if (this.stormTimer > 0) return;
    this.stormTimer = 2.4;
    const scale = waveScaling(this.wave, this.difficulty);
    const a = Math.random() * Math.PI * 2;
    const d = 3.5 + Math.random() * 5;
    const x = this.player.x + Math.cos(a) * d;
    const z = this.player.z + Math.sin(a) * d;
    const y = this.world.groundAt(x, z, this.player.y + 3);
    this.telegraph(x, y, z, 2.6, 1.0, () => {
      this.beam(x, y + 14, z, x, y, z, '#ffe58a');
      this.shockwave(x, y + 0.1, z, 2.6, '#ffe58a');
      this.explode(x, y + 0.6, z, 2.6, 11 * scale.damage, {
        team: TEAM.ENEMY, source: null, color: '#ffe58a', knockback: 4,
      });
      this.audio.play('explode');
    }, '#ffe58a');
  }

  // -------------------------------------------------------------------------
  // Frame update
  // -------------------------------------------------------------------------

  update(dt, input) {
    if (!this.running || this.paused) return;
    // Hit stop. A few frames of near-frozen time on a crit or a kill is the
    // single cheapest thing that makes a blow land — the eye reads the pause
    // as weight. Time is *slowed*, never skipped: dropping frames outright
    // would let a fast projectile tunnel through a wall, and the fixed step
    // above this call is what keeps the simulation stable.
    if (this.hitstop > 0) {
      this.hitstop = Math.max(0, this.hitstop - dt);
      dt *= 0.16;
    }
    this.flash = Math.max(0, (this.flash || 0) - dt * 4.5);
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
    this.updateHeartbeat(dt);
    this.updateCombo(dt);
    this.updateAffixes(dt);
    this.updateGrievous(dt);
    this.updateXpPops(dt);
    for (const t of this.telegraphs) t.update(dt);
    for (const s of this.shockwaves) s.update(dt);
    for (const z of this.zones) z.update(dt, this);
    for (const q of this.potions) q.update(dt, this);
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
    this.potions = this.potions.filter((q) => !q.dead);
    this.floaters = this.floaters.filter((f) => !f.dead);
    this.beams = this.beams.filter((b) => b.life > 0);
    this.notifications = this.notifications.filter((n) => n.life > 0);

    this.updateWaves(dt);
  }

  /**
   * Grievous bleeds for as long as it is stacked, and three clean seconds
   * clears the whole thing at once. Not a decaying stack: a partial reprieve
   * for a partial disengage would let you keep trading through it.
   */
  updateGrievous(dt) {
    if (this.grievous <= 0) return;
    // Its own clock, not timeSinceCombat: the bleed is player damage, and
    // damageEntity resets the combat timer, so sharing one would mean the
    // wound kept itself open forever and no amount of disengaging cleared it.
    this.grievousTimer = (this.grievousTimer || 0) + dt;
    if (this.grievousTimer >= 3) {
      this.grievous = 0;
      this.notify('Wounds closed');
      return;
    }
    // Applied straight to the entity rather than through damageEntity: routed
    // the normal way this would fire the hurt cue and shake the screen sixty
    // times a second, and armour would soak a tick that is already tuned.
    const scale = waveScaling(this.wave, this.difficulty);
    this.player.damage(this.grievous * 1.7 * scale.damage * dt, { isDot: true, source: null });
    if (this.player.dead) this.endRun();
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
      // The clear bonus is the larger half of a wave's payout, so it has to
      // carry the affix multiplier too — paying the bonus only on kills would
      // mean the rules cost a third of the run's depth and returned a rounding
      // error on the currency that depth exists to earn.
      if (this.affixes.length) this.tally.affixWaves++;
      this.awardXp(xpForWave(this.wave));
      const bonus = Math.round(waveClearBonus(this.wave) * (1 + affixSoulBonus(this.affixes)));
      this.soulsEarned += bonus * (1 + (this.player.mods.soulGain || 0));
      this.notify(`Wave ${this.wave} cleared  +${bonus} 💠`, 2.2);
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
    this.drawAuras();
    // Sky fills the gaps left by the opaque pass, before anything blended.
    this.r.drawSky();
    for (const p of this.projectiles) p.draw(this.r);
    for (const t of this.telegraphs) t.draw(this.r);
    for (const z of this.zones) z.draw(this.r);
    for (const q of this.potions) q.draw(this.r);
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
  /**
   * A slow ring of motes around elites and bosses. A health bar tells you
   * something is dangerous only once you have already looked at it; an aura
   * reads from the corner of the eye, which is where a threat in a crowd is
   * actually noticed.
   */
  drawAuras() {
    if (!this.r.fancy) return;
    for (const m of this.mobs) {
      if (m.dead || (!m.elite && !m.def.boss)) continue;
      const boss = m.def.boss;
      const color = boss ? [1.0, 0.35, 0.22] : [1.0, 0.82, 0.29];
      const segs = boss ? 16 : 10;
      const radius = (m.width || 0.6) * (boss ? 2.2 : 1.6);
      const spin = this.time * (boss ? 0.9 : 1.4);
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2 + spin;
        const bob = Math.sin(this.time * 3 + i) * 0.16;
        const s = boss ? 0.20 : 0.13;
        this.r.drawBox(
          m.x + Math.cos(a) * radius, m.y + 0.25 + bob, m.z + Math.sin(a) * radius,
          s, s, s,
          { tile: T.BLANK, color, emissive: 1, alpha: 0.55 });
      }
    }
  }

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
      const t = b.life / b.max;
      // Denser sampling and a thicker core: ten sparse cubes read as a dotted
      // line, which is not what a bolt of lightning looks like.
      const steps = 22;
      for (let i = 0; i <= steps; i++) {
        const k = i / steps;
        const x = b.x0 + (b.x1 - b.x0) * k;
        const y = b.y0 + (b.y1 - b.y0) * k;
        const z = b.z0 + (b.z1 - b.z0) * k;
        // Jitter grows toward the middle, so the bolt arcs rather than wobbling
        // uniformly along its whole length.
        const wob = Math.sin(k * Math.PI) * 0.22;
        const s = (0.26 * t + 0.06) * (0.6 + Math.sin(k * Math.PI) * 0.6);
        this.r.drawBox(
          x + rand(wob, -wob), y + rand(wob, -wob), z + rand(wob, -wob),
          s, s, s, { tile: T.BLANK, color: b.color, emissive: 1, alpha: t });
      }
      // Flare at the impact end.
      const flare = 0.5 * t;
      this.r.drawBox(b.x1, b.y1, b.z1, flare, flare, flare,
        { tile: T.BLANK, color: b.color, emissive: 1, alpha: t * 0.9 });
    }
  }
}

export { MOB_TYPES };
