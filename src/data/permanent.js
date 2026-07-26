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
  // 1 point at wave 1, then one per wave cleared, with a bonus every 5th.
  return bestWave + Math.floor(bestWave / 5) * 2;
}
