// Endless wave director: scaling, spawn budgets, boss cadence.

import { MOB_TYPES, BOSS_IDS, rollMobType } from './mobs.js';

export const BOSS_EVERY = 5;

/**
 * Difficulty multipliers for a given wave. Endless, so this never caps.
 * Health climbs faster than damage: later waves should mean longer, more
 * dangerous fights rather than instant deaths.
 */
export function waveScaling(wave, diff = null) {
  // Clamped at zero: a fractional power of a negative base is NaN, and wave 0
  // is reachable — anything spawned during the opening intermission, or by a
  // harness priming a fight, would come out with NaN damage and quietly
  // poison every hit point it touched.
  const w = Math.max(0, wave - 1);
  const d = diff || { hp: 1, damage: 1, souls: 1 };
  return {
    hp: (1 + w * 0.16 + Math.pow(w, 1.42) * 0.012) * d.hp,
    damage: (1 + w * 0.075 + Math.pow(w, 1.30) * 0.008) * d.damage,
    speed: Math.min(1.55, 1 + w * 0.012),
    souls: (1 + w * 0.09) * d.souls,
  };
}

/** How many "cost points" of enemies this wave is worth. */
export function waveBudget(wave) {
  return Math.round(4 + wave * 1.9 + Math.pow(wave, 1.35) * 0.30);
}

/**
 * Enemies alive at once. This is the real difficulty dial early on — being
 * surrounded is what kills new players — and it doubles as the performance
 * ceiling that keeps phones smooth on deep waves.
 */
export function waveConcurrent(wave, cap = 30, diff = null) {
  const bonus = diff ? diff.concurrent : 0;
  return Math.min(cap + bonus, 4 + bonus + Math.floor(wave * 0.7));
}

export function isBossWave(wave) {
  return wave % BOSS_EVERY === 0;
}

export function eliteChance(wave, diff = null) {
  const bonus = diff ? diff.elite : 0;
  return Math.min(0.55, Math.max(0, (wave - 6) * 0.018) + bonus);
}

/**
 * Which boss headlines a given boss wave. The first is always the Colossus so
 * the fight is learned before the roster opens up; after that they rotate, and
 * each is gated behind its own minWave so they arrive as an escalation rather
 * than all at once.
 */
export function bossForWave(wave) {
  const unlocked = BOSS_IDS.filter((id) => wave >= MOB_TYPES[id].minWave);
  if (!unlocked.length) return BOSS_IDS[0];
  const index = Math.floor(wave / BOSS_EVERY) - 1;
  return unlocked[index % unlocked.length];
}

/**
 * Build the spawn queue for a wave: a list of { typeId, elite } entries.
 */
export function buildWaveQueue(wave, diff = null) {
  const queue = [];
  let budget = waveBudget(wave);
  const chance = eliteChance(wave, diff);

  if (isBossWave(wave)) {
    const bosses = 1 + Math.floor((wave - BOSS_EVERY) / (BOSS_EVERY * 4));
    const headline = bossForWave(wave);
    const unlocked = BOSS_IDS.filter((id) => wave >= MOB_TYPES[id].minWave);
    for (let i = 0; i < bosses; i++) {
      // Extra bosses on deep waves are different types, so a double boss is a
      // combination of mechanics rather than the same fight twice.
      const typeId = i === 0 ? headline : unlocked[(unlocked.indexOf(headline) + i) % unlocked.length];
      queue.push({ typeId, elite: false, boss: true });
    }
    budget = Math.round(budget * 0.6);
  }

  let guard = 0;
  while (budget > 0 && guard++ < 500) {
    const typeId = rollMobType(wave);
    const cost = MOB_TYPES[typeId].cost || 1;
    if (cost > budget && queue.length) break;
    const elite = Math.random() < chance;
    queue.push({ typeId, elite });
    budget -= cost * (elite ? 2 : 1);
  }
  // Shuffle so the tough stuff is not always last.
  for (let i = queue.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  return queue;
}

/** Seconds between spawns; ramps up with wave number. */
export function spawnInterval(wave) {
  return Math.max(0.22, 1.05 - wave * 0.028);
}

/** Souls awarded for clearing a wave outright. */
export function waveClearBonus(wave) {
  return Math.round(12 + wave * 4.5 + (isBossWave(wave) ? 60 : 0));
}

export class WaveDirector {
  constructor(difficulty = null) {
    this.difficulty = difficulty;
    this.wave = 0;
    this.queue = [];
    this.spawnTimer = 0;
    this.state = 'intermission';   // 'intermission' | 'spawning' | 'clearing'
    this.intermission = 0;
    this.spawnedThisWave = 0;
    // Beats inside a wave. Both fire once, and both are consumed by firing.
    this.reinforced = false;
    this.lastStand = false;
    // Initialised here as well as in startWave: `beat` can be reached before
    // any wave has started — a raid sets the state directly — and an
    // undefined reserve is a crash rather than an empty one.
    this.reserve = [];
    this.total = 0;
  }

  startWave(wave) {
    this.wave = wave;
    this.queue = buildWaveQueue(wave, this.difficulty);
    this.total = this.queue.length;
    this.spawnedThisWave = 0;
    this.spawnTimer = 0.6;
    this.state = 'spawning';
    this.reinforced = false;
    this.lastStand = false;
    // Held back from the wave's own budget rather than added on top, so a wave
    // with a middle is not also a harder wave. The director spends the same
    // number of enemies; it just does not spend them all at once.
    this.reserve = [];
    const hold = Math.floor(this.queue.length * 0.28);
    for (let i = 0; i < hold; i++) this.reserve.push(this.queue.pop());
  }

  /**
   * A wave used to be flat: spawn a queue, wait for the room to empty. Wave 30
   * was wave 10 with bigger numbers in the same three beats, and the only
   * thing that ever varied it was an affix — which is a rule for the whole
   * wave rather than something that happens during one.
   *
   * Two beats give it a middle. At the halfway point the reserve arrives from
   * behind the player, so the room turns over instead of emptying from one
   * direction; and when the last few are left they close in and press, so the
   * tail of a wave is the dangerous part rather than the cleanup.
   *
   * Returns a string when a beat fires, for the caller to announce.
   */
  beat(aliveCount, killedThisWave) {
    if (this.state === 'intermission') return null;
    const total = this.total || 1;
    if (!this.reinforced && this.reserve.length && killedThisWave >= total * 0.5) {
      this.reinforced = true;
      // Back into the queue, at the front, so they arrive at once rather than
      // trickling in behind whatever is left.
      this.queue.unshift(...this.reserve);
      this.reserve = [];
      this.spawnTimer = 0;
      if (this.state === 'clearing') this.state = 'spawning';
      return 'reinforcements';
    }
    if (!this.lastStand && !this.queue.length && !this.reserve.length
      && aliveCount > 0 && aliveCount <= Math.max(2, Math.ceil(total * 0.2))) {
      this.lastStand = true;
      return 'laststand';
    }
    return null;
  }

  /** Returns an array of spawn descriptors to create this frame. */
  update(dt, aliveCount) {
    const out = [];
    if (this.state !== 'spawning') return out;
    this.spawnTimer -= dt;
    const limit = waveConcurrent(this.wave, 30, this.difficulty);
    while (this.spawnTimer <= 0 && this.queue.length && aliveCount + out.length < limit) {
      out.push(this.queue.shift());
      this.spawnedThisWave++;
      this.spawnTimer += spawnInterval(this.wave);
    }
    if (this.spawnTimer < 0) this.spawnTimer = 0;
    if (!this.queue.length) this.state = 'clearing';
    return out;
  }

  get remaining() { return this.queue.length; }
}
