// In-run upgrade cards, offered three at a time between waves.
// `effect` keys feed straight into the modifier bag (see player.buildMods).

const C = {
  offense: '#ff7a5c',
  defense: '#7aa8ff',
  utility: '#7dffb0',
  power: '#d98cff',
};

export const UPGRADES = [
  // Offense
  { id: 'u_dmg', name: 'Whetstone', rarity: 'common', cat: C.offense, icon: '⚔', desc: '+12% all damage.', effect: { allDamage: 0.12 } },
  { id: 'u_crit', name: 'Keen Eye', rarity: 'common', cat: C.offense, icon: '🎯', desc: '+6% critical strike chance.', effect: { critChance: 0.06 } },
  { id: 'u_critdmg', name: 'Cruel Edge', rarity: 'uncommon', cat: C.offense, icon: '💥', desc: '+25% critical damage.', effect: { critMult: 0.25 } },
  { id: 'u_haste', name: 'Quickblade', rarity: 'common', cat: C.offense, icon: '⚡', desc: '+15% attack speed.', effect: { attackSpeed: 0.15 } },
  { id: 'u_spell', name: 'Arcane Core', rarity: 'uncommon', cat: C.offense, icon: '🔮', desc: '+18% spell damage.', effect: { spellDamage: 0.18 } },
  { id: 'u_melee', name: 'Brutality', rarity: 'uncommon', cat: C.offense, icon: '🪓', desc: '+20% melee damage.', effect: { meleeDamage: 0.20 } },
  { id: 'u_dot', name: 'Festering', rarity: 'uncommon', cat: C.offense, icon: '☣', desc: '+30% damage over time.', effect: { dotDamage: 0.30 } },
  { id: 'u_aoe', name: 'Wide Blast', rarity: 'uncommon', cat: C.offense, icon: '💫', desc: '+20% area of effect radius.', effect: { aoeRadius: 0.20 } },
  { id: 'u_burn', name: 'Everburn', rarity: 'rare', cat: C.offense, icon: '🔥', desc: '+45% burn damage.', effect: { burnDamage: 0.45 } },

  // Defense
  { id: 'u_hp', name: 'Iron Heart', rarity: 'common', cat: C.defense, icon: '❤', desc: '+35 maximum health.', effect: { maxHp: 35 } },
  { id: 'u_armor', name: 'Plating', rarity: 'common', cat: C.defense, icon: '🛡', desc: '+7% armor.', effect: { armor: 0.07 } },
  { id: 'u_regen', name: 'Vital Surge', rarity: 'uncommon', cat: C.defense, icon: '💗', desc: 'Regenerate 2.5 hp/s out of combat.', effect: { regen: 2.5 } },
  { id: 'u_lifesteal', name: 'Bloodthirst', rarity: 'rare', cat: C.defense, icon: '🩸', desc: 'Heal for 7% of damage dealt.', effect: { lifesteal: 0.07 } },
  { id: 'u_dodge', name: 'Slippery', rarity: 'uncommon', cat: C.defense, icon: '🌀', desc: '+8% dodge chance.', effect: { dodge: 0.08 } },
  { id: 'u_dr', name: 'Stoneform', rarity: 'rare', cat: C.defense, icon: '🪨', desc: 'Take 10% less damage.', effect: { damageReduction: 0.10 } },
  { id: 'u_absorb', name: 'Ward', rarity: 'uncommon', cat: C.defense, icon: '🔰', desc: 'Shields absorb 40 more.', effect: { absorb: 40 } },

  // Utility
  { id: 'u_speed', name: 'Fleetfoot', rarity: 'common', cat: C.utility, icon: '👟', desc: '+10% movement speed.', effect: { moveSpeed: 0.10 } },
  { id: 'u_cdr', name: 'Momentum', rarity: 'uncommon', cat: C.utility, icon: '⏱', desc: '-10% skill cooldowns.', effect: { cooldownReduction: 0.10 } },
  { id: 'u_res', name: 'Deep Well', rarity: 'common', cat: C.utility, icon: '🫙', desc: '+25 maximum resource.', effect: { resourceMax: 25 } },
  { id: 'u_regen2', name: 'Wellspring', rarity: 'uncommon', cat: C.utility, icon: '💧', desc: '+5 resource regeneration.', effect: { resourceRegen: 5 } },
  { id: 'u_cost', name: 'Efficiency', rarity: 'rare', cat: C.utility, icon: '📉', desc: 'Skills cost 18% less.', effect: { costReduction: 0.18 } },
  { id: 'u_souls', name: 'Soul Magnet', rarity: 'uncommon', cat: C.utility, icon: '💠', desc: '+25% souls earned.', effect: { soulGain: 0.25 } },

  // Build-defining
  { id: 'u_extraproj', name: 'Split Shot', rarity: 'epic', cat: C.power, icon: '🏹', desc: 'Basic attacks fire 1 extra projectile.', effect: { extraProjectiles: 1 } },
  { id: 'u_pet', name: 'Pack Leader', rarity: 'epic', cat: C.power, icon: '🐺', desc: 'Summons are 40% stronger and you may have 1 more.', effect: { petPower: 0.40, maxPets: 1 } },
  { id: 'u_double', name: 'Echo Strike', rarity: 'epic', cat: C.power, icon: '🔁', desc: '20% chance for melee hits to strike twice.', effect: { doubleStrike: 0.20 } },
  { id: 'u_corpse', name: 'Chain Reaction', rarity: 'epic', cat: C.power, icon: '💣', desc: 'Enemies explode for 55 damage on death.', effect: { corpseExplode: 55 } },
  { id: 'u_thorns', name: 'Spiked Hide', rarity: 'rare', cat: C.power, icon: '🌵', desc: 'Reflect 25 damage to melee attackers.', effect: { thorns: 25 } },
];

export const RARITY = {
  common: { weight: 46, color: '#b9c2d0', label: 'Common' },
  uncommon: { weight: 30, color: '#5ce07a', label: 'Uncommon' },
  rare: { weight: 17, color: '#5ca8ff', label: 'Rare' },
  epic: { weight: 7, color: '#c46bff', label: 'Epic' },
};

/** Draw `count` distinct upgrade cards, weighted by rarity. */
export function rollUpgrades(count, luckBonus = 0, exclude = new Set()) {
  const pool = UPGRADES.filter((u) => !exclude.has(u.id));
  const picked = [];
  const used = new Set();
  let guard = 0;
  while (picked.length < count && guard++ < 500) {
    let total = 0;
    for (const u of pool) {
      if (used.has(u.id)) continue;
      const r = RARITY[u.rarity];
      total += r.weight * (u.rarity === 'epic' || u.rarity === 'rare' ? 1 + luckBonus : 1);
    }
    if (total <= 0) break;
    let roll = Math.random() * total;
    for (const u of pool) {
      if (used.has(u.id)) continue;
      const r = RARITY[u.rarity];
      roll -= r.weight * (u.rarity === 'epic' || u.rarity === 'rare' ? 1 + luckBonus : 1);
      if (roll <= 0) { picked.push(u); used.add(u.id); break; }
    }
  }
  return picked;
}
