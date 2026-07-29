// The Forge: permanent, account-wide upgrades bought with gold in the main
// menu. Every level is kept in save data and applies to every future run.

/**
 * The Forge is endless. Every track runs to 100, but the per-level values are
 * roughly a third of what they were at a cap of 10: level 25 is about where
 * the old maximum sat, and everything past that is the long tail. Cost grows
 * ~8% a level, so the last stretch costs more than the first ninety combined
 * — which is the point of a grind that never runs out.
 *
 * Several of these feed stats the player clamps anyway (armor 75%, crit 85%,
 * cooldowns 60%), so the tracks that could otherwise spiral have a ceiling
 * built into the character rather than into the shop.
 */
export const PERMANENT = [
  { id: 'p_hp', name: 'Vitality', icon: '❤', desc: '+6 max health per level.', max: 100, baseCost: 45, growth: 1.075, effect: { maxHp: 6 } },
  { id: 'p_dmg', name: 'Might', icon: '⚔', desc: '+2% all damage per level.', max: 100, baseCost: 60, growth: 1.085, effect: { allDamage: 0.02 } },
  { id: 'p_armor', name: 'Warding', icon: '🛡', desc: '+1% armor per level.', max: 100, baseCost: 55, growth: 1.08, effect: { armor: 0.01 } },
  { id: 'p_crit', name: 'Precision', icon: '🎯', desc: '+0.8% crit chance per level.', max: 100, baseCost: 60, growth: 1.08, effect: { critChance: 0.008 } },
  { id: 'p_cdr', name: 'Attunement', icon: '⏱', desc: '-1.2% cooldowns per level.', max: 100, baseCost: 70, growth: 1.085, effect: { cooldownReduction: 0.012 } },
  { id: 'p_res', name: 'Reservoir', icon: '🫙', desc: '+4 max resource per level.', max: 100, baseCost: 42, growth: 1.075, effect: { resourceMax: 4 } },
  { id: 'p_regen', name: 'Flow', icon: '💧', desc: '+0.8 resource regen per level.', max: 100, baseCost: 65, growth: 1.08, effect: { resourceRegen: 0.8 } },
  { id: 'p_speed', name: 'Swiftness', icon: '👟', desc: '+0.8% move speed per level.', max: 100, baseCost: 58, growth: 1.08, effect: { moveSpeed: 0.008 } },
  { id: 'p_souls', name: 'Prospector', icon: '🪙', desc: '+4% gold earned per level.', max: 100, baseCost: 80, growth: 1.09, effect: { soulGain: 0.04 } },
  { id: 'p_luck', name: 'Fortune', icon: '🍀', desc: '+1% chance of a bonus skill rank per level.', max: 100, baseCost: 90, growth: 1.09, effect: { luck: 0.01 } },
  { id: 'p_thorns', name: 'Bramble', icon: '🌵', desc: 'Reflect 1.6% of damage taken per level.', max: 100, baseCost: 72, growth: 1.085, effect: { thorns: 0.016 } },
  { id: 'p_boss', name: 'Titanbane', icon: '🗿', desc: '+2.4% damage to bosses per level.', max: 100, baseCost: 85, growth: 1.088, effect: { bossDamage: 0.024 } },
  { id: 'p_vamp', name: 'Bloodbound', icon: '🩸', desc: 'Heal 1.2 health per kill, per level.', max: 100, baseCost: 78, growth: 1.085, effect: { killHeal: 1.2 } },
  { id: 'p_cost', name: 'Efficiency', icon: '⚗', desc: 'Skills cost 1.5% less per level.', max: 40, baseCost: 95, growth: 1.10, effect: { costReduction: 0.015 } },
  { id: 'p_melee', name: 'Butcher', icon: '🪓', desc: '+2% melee damage per level.', max: 100, baseCost: 62, growth: 1.085, effect: { meleeDamage: 0.02 } },
  { id: 'p_spell', name: 'Channeler', icon: '🔮', desc: '+2% spell damage per level.', max: 100, baseCost: 62, growth: 1.085, effect: { spellDamage: 0.02 } },
  { id: 'p_haste', name: 'Alacrity', icon: '⚡', desc: '+1% attack speed per level.', max: 100, baseCost: 68, growth: 1.085, effect: { attackSpeed: 0.01 } },
  { id: 'p_area', name: 'Wide Arc', icon: '🌀', desc: 'Area effects reach 1% further per level.', max: 60, baseCost: 75, growth: 1.09, effect: { aoeRadius: 0.01 } },
  { id: 'p_critdmg', name: 'Brutality', icon: '💥', desc: '+2% crit damage per level.', max: 100, baseCost: 70, growth: 1.086, effect: { critMult: 0.02 } },
  { id: 'p_mitig', name: 'Ironhide', icon: '🪨', desc: 'Take 0.6% less damage per level.', max: 80, baseCost: 88, growth: 1.09, effect: { damageReduction: 0.006 } },
  { id: 'p_leech', name: 'Sanguine', icon: '🧛', desc: '+0.5% lifesteal per level.', max: 80, baseCost: 92, growth: 1.09, effect: { lifesteal: 0.005 } },
  { id: 'p_dot', name: 'Festering', icon: '☠', desc: 'Damage over time ticks 2% harder per level.', max: 80, baseCost: 66, growth: 1.085, effect: { dotDamage: 0.02 } },
  // Unique effects stay rare: these change how a run plays rather than how
  // hard it hits, and a hundred levels of them would be meaningless.
  { id: 'p_start', name: 'Head Start', icon: '🎁', desc: 'Begin each run with 1 free upgrade per level.', max: 5, baseCost: 250, growth: 2.0, effect: { startingUpgrades: 1 } },
  { id: 'p_reroll', name: 'Second Thoughts', icon: '🔄', desc: '+1 upgrade reroll per wave.', max: 5, baseCost: 180, growth: 1.8, effect: { rerolls: 1 } },
  { id: 'p_revive', name: 'Phoenix Ember', icon: '🔥', desc: 'Revive once per run at 50% health.', max: 1, baseCost: 600, growth: 1, effect: { cheatDeathRun: 0.5 } },
];

export const PERMANENT_BY_ID = Object.fromEntries(PERMANENT.map((p) => [p.id, p]));

/**
 * Global price multiplier on everything bought with gold. Kept here, as
 * one number both shops import, so a price change is a single edit that cannot
 * miss a shop — and so a test can assert it is actually applied rather than
 * declared. Raising it makes every gold coin a run earns worth more, which is
 * what stretches the grind rather than shortening the game.
 */
export const PRICE_MULTIPLIER = 1.5;

export function upgradeCost(def, currentLevel) {
  return Math.round(def.baseCost * Math.pow(def.growth, currentLevel) * PRICE_MULTIPLIER);
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
