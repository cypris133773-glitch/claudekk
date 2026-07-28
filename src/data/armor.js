// The Armoury: five equipment slots bought with Souls in the main menu.
// Unlike the Forge, armour has no ceiling — every tier costs more and gives a
// little more, so late-game Souls always have somewhere to go.

/** Material names cycle every 5 tiers, then repeat with a numeral suffix. */
const MATERIALS = ['Cloth', 'Leather', 'Chain', 'Iron', 'Steel', 'Obsidian', 'Runed', 'Void'];

export const ARMOR_SLOTS = [
  {
    id: 'helm', name: 'Helm', icon: '⛑',
    desc: '+8 health and +1.5% crit chance per tier.',
    baseCost: 90, growth: 1.28,
    effect: { maxHp: 8, critChance: 0.015 },
  },
  {
    id: 'chest', name: 'Chestplate', icon: '🦺',
    desc: '+14 health and +1.5% armor per tier.',
    baseCost: 110, growth: 1.30,
    effect: { maxHp: 14, armor: 0.015 },
  },
  {
    id: 'legs', name: 'Greaves', icon: '👖',
    desc: '+10 health and +1.2% move speed per tier.',
    baseCost: 95, growth: 1.28,
    effect: { maxHp: 10, moveSpeed: 0.012 },
  },
  {
    id: 'boots', name: 'Boots', icon: '🥾',
    desc: '+1.5% dodge and +1.5% move speed per tier.',
    baseCost: 100, growth: 1.29,
    effect: { dodge: 0.015, moveSpeed: 0.015 },
  },
  {
    id: 'sigil', name: 'Sigil', icon: '🔱',
    desc: '+2.5% all damage and +4 max resource per tier.',
    baseCost: 130, growth: 1.32,
    effect: { allDamage: 0.025, resourceMax: 4 },
  },
];

export const ARMOR_BY_ID = Object.fromEntries(ARMOR_SLOTS.map((s) => [s.id, s]));

/** Highest tier the shop will sell. Reaching it is a very long grind. */
export const ARMOR_MAX_TIER = 40;

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

/** Sum every equipped tier into the same flat modifier bag talents use. */
export function armorMods(tiers) {
  const mods = {};
  for (const def of ARMOR_SLOTS) {
    const t = (tiers || {})[def.id] || 0;
    if (!t) continue;
    for (const [k, v] of Object.entries(def.effect)) mods[k] = (mods[k] || 0) + v * t;
  }
  return mods;
}

/** Total tiers bought across every slot — shown as an "armour rating". */
export function armorRating(tiers) {
  return ARMOR_SLOTS.reduce((s, d) => s + ((tiers || {})[d.id] || 0), 0);
}
