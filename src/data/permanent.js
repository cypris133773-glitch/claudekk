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
  // --- Foundation ----------------------------------------------------------
  // Eight small, cheap tracks that finish inside the first few hours. They
  // exist to lift the floor for a new account, not to be a power curve: a
  // fully bought foundation is about +10% damage and +20% health, against the
  // +70%/+65% a full gear set gives and everything a talent tree adds on top.
  //
  // They used to run to level 100 and grant +200% damage, +240% boss damage
  // and +600 health. That was the largest power source in the game, it was
  // account-wide, and it applied to every class equally — which is what made a
  // maxed account play every class the same and made the wave curve
  // meaningless. Ten levels is the whole track now.
  { id: 'p_hp', name: 'Vitality', icon: '❤', desc: '+2% max health per level.', max: 10, baseCost: 300, growth: 1.52, effect: { maxHpPct: 0.02 } },
  { id: 'p_dmg', name: 'Might', icon: '⚔', desc: '+1% all damage per level.', max: 10, baseCost: 340, growth: 1.53, effect: { allDamage: 0.01 } },
  { id: 'p_armor', name: 'Warding', icon: '🛡', desc: '+1% armor per level.', max: 10, baseCost: 300, growth: 1.52, effect: { armor: 0.01 } },
  { id: 'p_crit', name: 'Precision', icon: '🎯', desc: '+0.5% crit chance per level.', max: 10, baseCost: 320, growth: 1.52, effect: { critChance: 0.005 } },
  { id: 'p_cdr', name: 'Attunement', icon: '⏱', desc: '-1% cooldowns per level.', max: 10, baseCost: 360, growth: 1.53, effect: { cooldownReduction: 0.01 } },
  { id: 'p_res', name: 'Reservoir', icon: '🫙', desc: '+5 max resource per level.', max: 10, baseCost: 280, growth: 1.51, effect: { resourceMax: 5 } },
  { id: 'p_regen', name: 'Flow', icon: '💧', desc: '+0.6 resource regen per level.', max: 10, baseCost: 320, growth: 1.52, effect: { resourceRegen: 0.6 } },
  { id: 'p_speed', name: 'Swiftness', icon: '👟', desc: '+1% move speed per level.', max: 10, baseCost: 300, growth: 1.52, effect: { moveSpeed: 0.01 } },

  // --- How a run works -----------------------------------------------------
  // The reason to keep earning. None of these makes a hit land harder; they
  // change what a run *is* — how it opens, what it drops, what it pays. That
  // is the job the Forge is actually good at, and the one nothing else in the
  // game is doing.
  { id: 'p_gold', name: 'Prospector', icon: '🪙', desc: '+3% gold earned per level.', max: 10, baseCost: 900, growth: 1.58, effect: { soulGain: 0.03 } },
  { id: 'p_xp', name: 'Scholar', icon: '📘', desc: '+3% experience earned per level.', max: 10, baseCost: 1100, growth: 1.60, effect: { xpGain: 0.03 } },
  { id: 'p_alch', name: 'Alchemist', icon: '⚗', desc: 'Enemies drop potions 15% more often per level.', max: 5, baseCost: 1400, growth: 1.95, effect: { potionChance: 0.15 } },
  { id: 'p_potency', name: 'Potency', icon: '🧪', desc: 'Potions are 10% stronger per level.', max: 5, baseCost: 1300, growth: 1.92, effect: { potionPower: 0.10 } },
  { id: 'p_start', name: 'Head Start', icon: '🎁', desc: 'Begin each run with 1 free skill rank per level.', max: 3, baseCost: 2600, growth: 2.8, effect: { startingUpgrades: 1 } },
  { id: 'p_reroll', name: 'Second Thoughts', icon: '🔄', desc: '+1 upgrade reroll per wave.', max: 3, baseCost: 2200, growth: 2.6, effect: { rerolls: 1 } },
  { id: 'p_luck', name: 'Fortune', icon: '🍀', desc: '+3% chance a wave pays a bonus skill rank, per level.', max: 5, baseCost: 1800, growth: 2.05, effect: { luck: 0.03 } },
  { id: 'p_revive', name: 'Phoenix Ember', icon: '🔥', desc: 'Revive once per run at 50% health.', max: 1, baseCost: 9000, growth: 1, effect: { cheatDeathRun: 0.5 } },
];

/**
 * Tracks that no longer exist, or whose cap came down. A save holding levels in
 * either is refunded rather than silently losing them — see Profile.refundForge.
 */
export const RETIRED_TRACKS = [
  'p_souls', 'p_thorns', 'p_boss', 'p_vamp', 'p_cost', 'p_melee', 'p_spell',
  'p_haste', 'p_area', 'p_critdmg', 'p_mitig', 'p_leech', 'p_dot',
];

export const PERMANENT_BY_ID = Object.fromEntries(PERMANENT.map((p) => [p.id, p]));

/**
 * Global price multiplier on everything bought with gold. Kept here, as
 * one number both shops import, so a price change is a single edit that cannot
 * miss a shop — and so a test can assert it is actually applied rather than
 * declared. Raising it makes every gold coin a run earns worth more, which is
 * what stretches the grind rather than shortening the game.
 */
// The Forge was 606,482 gold for every track a class can buy — 2.3% of what a
// full Armoury set costs, which meant a player finished it almost by accident
// on the way to the gear that actually paces the game. It is the *third* power
// source behind talents and gear and it must never be the cheap one.
//
// 3.4 on top of a steeper growth curve puts a full Forge at about four million,
// which is roughly a sixth of the Armoury and a real decision at every rank
// past the fourth. The early ranks stay cheap on purpose: a new player has to
// be able to buy something.
export const PRICE_MULTIPLIER = 3.4;

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
