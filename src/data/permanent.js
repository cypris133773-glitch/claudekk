// The Forge: permanent, account-wide upgrades bought with Souls in the main
// menu. Every level is kept in save data and applies to every future run.

export const PERMANENT = [
  { id: 'p_hp', name: 'Vitality', icon: '❤', desc: '+15 max health per level.', max: 10, baseCost: 60, growth: 1.35, effect: { maxHp: 15 } },
  { id: 'p_dmg', name: 'Might', icon: '⚔', desc: '+5% all damage per level.', max: 10, baseCost: 75, growth: 1.4, effect: { allDamage: 0.05 } },
  { id: 'p_armor', name: 'Warding', icon: '🛡', desc: '+3% armor per level.', max: 8, baseCost: 70, growth: 1.35, effect: { armor: 0.03 } },
  { id: 'p_crit', name: 'Precision', icon: '🎯', desc: '+2% crit chance per level.', max: 8, baseCost: 80, growth: 1.4, effect: { critChance: 0.02 } },
  { id: 'p_cdr', name: 'Attunement', icon: '⏱', desc: '-3% cooldowns per level.', max: 8, baseCost: 90, growth: 1.45, effect: { cooldownReduction: 0.03 } },
  { id: 'p_res', name: 'Reservoir', icon: '🫙', desc: '+10 max resource per level.', max: 8, baseCost: 55, growth: 1.3, effect: { resourceMax: 10 } },
  { id: 'p_regen', name: 'Flow', icon: '💧', desc: '+2 resource regen per level.', max: 6, baseCost: 85, growth: 1.4, effect: { resourceRegen: 2 } },
  { id: 'p_speed', name: 'Swiftness', icon: '👟', desc: '+3% move speed per level.', max: 6, baseCost: 70, growth: 1.4, effect: { moveSpeed: 0.03 } },
  { id: 'p_souls', name: 'Soul Harvest', icon: '💠', desc: '+10% souls earned per level.', max: 8, baseCost: 100, growth: 1.5, effect: { soulGain: 0.10 } },
  { id: 'p_luck', name: 'Fortune', icon: '🍀', desc: '+15% rare upgrade chance per level.', max: 6, baseCost: 120, growth: 1.5, effect: { luck: 0.15 } },
  { id: 'p_start', name: 'Head Start', icon: '🎁', desc: 'Begin each run with 1 free upgrade per level.', max: 3, baseCost: 250, growth: 2.0, effect: { startingUpgrades: 1 } },
  { id: 'p_reroll', name: 'Second Thoughts', icon: '🔄', desc: '+1 upgrade reroll per wave.', max: 3, baseCost: 180, growth: 1.8, effect: { rerolls: 1 } },
  { id: 'p_revive', name: 'Phoenix Ember', icon: '🔥', desc: 'Revive once per run at 50% health.', max: 1, baseCost: 600, growth: 1, effect: { cheatDeathRun: 0.5 } },
  { id: 'p_thorns', name: 'Bramble', icon: '🌵', desc: 'Reflect 4% of damage taken per level.', max: 8, baseCost: 95, growth: 1.4, effect: { thorns: 0.04 } },
  { id: 'p_boss', name: 'Titanbane', icon: '🗿', desc: '+6% damage to bosses per level.', max: 8, baseCost: 110, growth: 1.45, effect: { bossDamage: 0.06 } },
  { id: 'p_vamp', name: 'Bloodbound', icon: '🩸', desc: 'Heal 3 health per kill, per level.', max: 8, baseCost: 105, growth: 1.42, effect: { killHeal: 3 } },
  { id: 'p_cost', name: 'Efficiency', icon: '⚗', desc: 'Skills cost 4% less per level.', max: 6, baseCost: 120, growth: 1.45, effect: { costReduction: 0.04 } },
];

export const PERMANENT_BY_ID = Object.fromEntries(PERMANENT.map((p) => [p.id, p]));

export function upgradeCost(def, currentLevel) {
  return Math.round(def.baseCost * Math.pow(def.growth, currentLevel));
}

/** Flatten purchased permanent levels into a modifier bag. */
export function permanentMods(levels) {
  const mods = {};
  for (const def of PERMANENT) {
    const lv = levels[def.id] || 0;
    if (!lv) continue;
    for (const [k, v] of Object.entries(def.effect)) mods[k] = (mods[k] || 0) + v * lv;
  }
  return mods;
}

/** Talent points are earned by reaching new best waves. */
export function talentPointsForBestWave(bestWave) {
  // One point per wave cleared, with a bonus every 5th and a second bonus
  // every 10th. The trees hold well over a hundred ranks, so pushing deeper
  // keeps paying out long after the early branches are full.
  return bestWave + Math.floor(bestWave / 5) * 2 + Math.floor(bestWave / 10) * 3;
}

// --- Mastery: the endless per-class track ----------------------------------
// Talent points run out once a tree is full. Mastery never does: every run
// banks progress toward the next rank, and each rank is a small permanent
// bump for that class. The curve is quadratic, so ranks slow down without
// ever stopping.

/** Mastery progress a finished run is worth. */
export function masteryFromRun({ wave = 0, kills = 0 }) {
  return Math.round(wave * wave * 2 + wave * 10 + kills);
}

/** Total progress needed to have reached `rank`. */
export function masteryThreshold(rank) {
  return Math.round(120 * rank + 26 * rank * rank);
}

export function masteryRank(progress) {
  // Inverse of the threshold curve; the loop only tidies up rounding.
  let rank = Math.max(0, Math.floor((-120 + Math.sqrt(14400 + 104 * (progress || 0))) / 52));
  while (masteryThreshold(rank + 1) <= (progress || 0)) rank++;
  while (rank > 0 && masteryThreshold(rank) > (progress || 0)) rank--;
  return rank;
}

/** Progress into the current rank, for a progress bar. */
export function masteryProgress(progress) {
  const rank = masteryRank(progress);
  const from = masteryThreshold(rank);
  const to = masteryThreshold(rank + 1);
  return { rank, into: (progress || 0) - from, need: to - from };
}

/** What a class's mastery ranks are worth, as a modifier bag. */
export function masteryMods(rank) {
  if (!rank) return {};
  return {
    allDamage: 0.012 * rank,
    maxHp: 4 * rank,
    critChance: 0.002 * rank,
  };
}
