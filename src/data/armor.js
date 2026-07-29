// The Armoury: five equipment slots bought with Souls in the main menu.
// Unlike the Forge, armour has no ceiling — every tier costs more and gives a
// little more, so late-game Souls always have somewhere to go.

/** Material names cycle every 5 tiers, then repeat with a numeral suffix. */
const MATERIALS = ['Cloth', 'Leather', 'Chain', 'Iron', 'Steel', 'Obsidian', 'Runed', 'Void'];

export const ARMOR_SLOTS = [
  {
    id: 'helm', name: 'Helm', icon: '⛑', school: 'physical',
    desc: '+7 health, +1.2% crit',
    baseCost: 90, growth: 1.11,
    effect: { maxHp: 7, critChance: 0.012 },
  },
  {
    id: 'chest', name: 'Chestplate', icon: '🦺', school: 'physical',
    desc: '+12 health, +1.2% armor',
    baseCost: 110, growth: 1.115,
    effect: { maxHp: 12, armor: 0.012 },
  },
  {
    id: 'legs', name: 'Greaves', icon: '👖', school: 'physical',
    desc: '+9 health, +1% speed',
    baseCost: 95, growth: 1.11,
    effect: { maxHp: 9, moveSpeed: 0.01 },
  },
  {
    id: 'boots', name: 'Boots', icon: '🥾', school: 'nature',
    desc: '+1.2% dodge, +1.2% speed',
    baseCost: 100, growth: 1.112,
    effect: { dodge: 0.012, moveSpeed: 0.012 },
  },
  {
    id: 'gloves', name: 'Gauntlets', icon: '🧤', school: 'physical',
    desc: '+1% attack speed, +1.5% melee',
    baseCost: 105, growth: 1.113,
    effect: { attackSpeed: 0.01, meleeDamage: 0.015 },
  },
  {
    id: 'cloak', name: 'Cloak', icon: '🧣', school: 'shadow',
    desc: '+0.5% less damage taken, +6 health',
    baseCost: 115, growth: 1.115,
    effect: { damageReduction: 0.005, maxHp: 6 },
  },
  {
    id: 'ring', name: 'Signet', icon: '💍', school: 'arcane',
    desc: '+1.5% crit damage, +1.5% spell',
    baseCost: 120, growth: 1.118,
    effect: { critMult: 0.015, spellDamage: 0.015 },
  },
  {
    id: 'amulet', name: 'Amulet', icon: '📿', school: 'holy',
    desc: '+0.4% lifesteal, +3 max resource',
    baseCost: 125, growth: 1.12,
    effect: { lifesteal: 0.004, resourceMax: 3 },
  },
  {
    id: 'sigil', name: 'Sigil', icon: '🔱', school: 'fire',
    desc: '+2% all damage, +1.5% area',
    baseCost: 130, growth: 1.122,
    effect: { allDamage: 0.02, aoeRadius: 0.015 },
  },
];

/**
 * Set bonuses reward spreading tiers across the whole kit rather than pouring
 * everything into one slot. The threshold is the *lowest* tier you own, so a
 * single unforged slot holds the whole set back — which is what makes them a
 * goal rather than a side effect of buying anything at all.
 */
export const ARMOR_SETS = [
  { tier: 5, name: 'Matched Kit', effect: { maxHp: 40, armor: 0.03 } },
  { tier: 12, name: 'Warplate', effect: { allDamage: 0.06, damageReduction: 0.03 } },
  { tier: 25, name: 'Runed Regalia', effect: { critChance: 0.05, critMult: 0.15, maxHp: 90 } },
  { tier: 40, name: 'Voidforged', effect: { allDamage: 0.12, lifesteal: 0.04, moveSpeed: 0.06 } },
  { tier: 60, name: 'Ascendant', effect: { allDamage: 0.20, damageReduction: 0.06, maxHp: 220 } },
];

export const ARMOR_BY_ID = Object.fromEntries(ARMOR_SLOTS.map((s) => [s.id, s]));

/**
 * Nominally the ceiling, but the cost curve is the real limit: tier 100 of a
 * single slot costs more than tiers 1-70 together. Nobody finishes this.
 */
export const ARMOR_MAX_TIER = 100;

export function armorCost(def, tier) {
  return Math.round(def.baseCost * Math.pow(def.growth, tier));
}

/** Flavour name for a tier, e.g. tier 7 boots -> "Chain Boots II". */
export function armorTierName(def, tier) {
  if (tier <= 0) return 'Unforged ' + def.name;
  const idx = Math.min(MATERIALS.length - 1, Math.floor((tier - 1) / 5));
  const cycle = Math.floor((tier - 1) / (MATERIALS.length * 5));
  const roman = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII'][Math.min(7, cycle)];
  return `${MATERIALS[idx]} ${def.name}${roman}`;
}

/** The highest set threshold every slot has reached. */
export function armorSets(tiers) {
  const lowest = ARMOR_SLOTS.reduce(
    (m, d) => Math.min(m, (tiers || {})[d.id] || 0), Infinity);
  return ARMOR_SETS.filter((s) => lowest >= s.tier);
}

/** The next set to aim for, and how far off it is. */
export function nextArmorSet(tiers) {
  const lowest = ARMOR_SLOTS.reduce(
    (m, d) => Math.min(m, (tiers || {})[d.id] || 0), Infinity);
  const set = ARMOR_SETS.find((s) => lowest < s.tier);
  return set ? { set, from: lowest, need: set.tier - lowest } : null;
}

/** Sum every equipped tier, plus any completed set bonuses, into one bag. */
export function armorMods(tiers) {
  const mods = {};
  for (const def of ARMOR_SLOTS) {
    const t = (tiers || {})[def.id] || 0;
    if (!t) continue;
    for (const [k, v] of Object.entries(def.effect)) mods[k] = (mods[k] || 0) + v * t;
  }
  for (const set of armorSets(tiers)) {
    for (const [k, v] of Object.entries(set.effect)) mods[k] = (mods[k] || 0) + v;
  }
  return mods;
}

/** Total tiers bought across every slot — shown as an "armour rating". */
export function armorRating(tiers) {
  return ARMOR_SLOTS.reduce((s, d) => s + ((tiers || {})[d.id] || 0), 0);
}
