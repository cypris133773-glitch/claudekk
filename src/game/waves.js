// Endless wave director: scaling, spawn budgets, boss cadence.

import { MOB_TYPES, BOSS_IDS, rollMobType } from './mobs.js';

export const BOSS_EVERY = 5;

/**
 * Difficulty multipliers for a given wave. Endless, so this never caps.
 * Health climbs faster than damage: later waves should mean longer, more
 * dangerous fights rather than instant deaths.
 */
export function waveScaling(wave) {
  const w = wave - 1;
  return {
    hp: 1 + w * 0.16 + Math.pow(w, 1.42) * 0.012,
    damage: 1 + w * 0.065 + Math.pow(w, 1.30) * 0.005,
    speed: Math.min(1.55, 1 + w * 0.012),
    souls: 1 + w * 0.09,
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
export function waveConcurrent(wave, cap = 30) {
  return Math.min(cap, 4 + Math.floor(wave * 0.7));
}

export function isBossWave(wave) {
  return wave % BOSS_EVERY === 0;
}

export function eliteChance(wave) {
  return Math.min(0.35, Math.max(0, (wave - 6) * 0.018));
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
export function buildWaveQueue(wave) {
  const queue = [];
  let budget = waveBudget(wave);
  const chance = eliteChance(wave);

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
  constructor() {
    this.wave = 0;
    this.queue = [];
    this.spawnTimer = 0;
    this.state = 'intermission';   // 'intermission' | 'spawning' | 'clearing'
    this.intermission = 0;
    this.spawnedThisWave = 0;
  }

  startWave(wave) {
    this.wave = wave;
    this.queue = buildWaveQueue(wave);
    this.total = this.queue.length;
    this.spawnedThisWave = 0;
    this.spawnTimer = 0.6;
    this.state = 'spawning';
  }

  /** Returns an array of spawn descriptors to create this frame. */
  update(dt, aliveCount) {
    const out = [];
    if (this.state !== 'spawning') return out;
    this.spawnTimer -= dt;
    const limit = waveConcurrent(this.wave);
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
