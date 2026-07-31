// The Armoury: six gear slots, seven tiers, bought per class with global gold.
//
// The old Armoury was fourteen account-wide slots running to tier 100, priced
// only in gold. It failed in a specific, measurable way: gold per run grew
// faster than the price curve did, so the grind got *easier* the deeper you
// went, and a player reaching wave 40 bought every slot to tier 25 in three
// runs. Worse, it was account-wide, so a maxed account started every new class
// already geared — which is exactly what made nine classes feel like one.
//
// Both are fixed at the root here:
//
//   * A tier cannot be bought below its level. No amount of gold buys past the
//     content, which is the same thing levelling already does — so the two
//     systems pace each other instead of racing.
//   * Gold is one global pile, gear is per class. A run on the Rogue funds the
//     Paladin, but the Paladin's T1 Ring is not the Rogue's. You are never
//     starved of funding for a second class, and a class you have actually
//     played still feels different from one you have not.
//
// Ownership uses absence, not zero. `gear.helm === 0` means the T0 Helm is
// bought; not owning the slot at all means the key is missing. Every read here
// goes through `ownedTier`, which returns -1 for "nothing", and `src/data/
// raids.js` relies on the same convention for its set-completion gate.

import { PRICE_MULTIPLIER } from './permanent.js';

/**
 * Slot order is the order raid bosses drop Cores in, so the first boss of a
 * raid drops the piece that matters most. `raids.js` imports this rather than
 * keeping a second copy that could drift.
 */
export const GEAR_SLOTS = [
  { id: 'weapon', name: 'Weapon', icon: '⚔', school: 'physical', lead: 'damage' },
  { id: 'chest', name: 'Chestplate', icon: '🦺', school: 'physical', lead: 'health' },
  { id: 'helm', name: 'Helm', icon: '⛑', school: 'physical', lead: 'health, crit' },
  { id: 'boots', name: 'Boots', icon: '🥾', school: 'nature', lead: 'speed, dodge' },
  { id: 'ring', name: 'Signet', icon: '💍', school: 'arcane', lead: 'damage, crit damage' },
  { id: 'trinket', name: 'Trinket', icon: '🪬', school: 'holy', lead: 'class-defining' },
];

export const GEAR_SLOT_IDS = GEAR_SLOTS.map((s) => s.id);
export const GEAR_BY_ID = Object.fromEntries(GEAR_SLOTS.map((s) => [s.id, s]));

export const MAX_TIER = 6;

/**
 * The seven tiers. `level` is the character level the tier unlocks at, and it
 * is the whole pacing mechanism — T6 is buyable only at the cap, so the last
 * set is the chase that starts the moment you ding 60.
 *
 * Names are the raid each tier's Cores come from, so a player reading "Molten
 * Chestplate" in the Armoury knows which raid they are meant to be running.
 */
export const GEAR_TIERS = [
  { tier: 0, level: 1,  name: 'Battleworn',  color: '#cfd6e6', tile: 'STONE',    raid: "Zul'Gurub" },
  { tier: 1, level: 11, name: 'Molten',      color: '#7dff9d', tile: 'METAL',    raid: 'Molten Core' },
  { tier: 2, level: 21, name: 'Spectral',    color: '#6ec8ff', tile: 'GOLD',     raid: 'Karazhan' },
  { tier: 3, level: 31, name: 'Titanforged', color: '#c98fff', tile: 'CRYSTAL',  raid: 'Ulduar' },
  { tier: 4, level: 41, name: 'Demonforged', color: '#ffb27a', tile: 'RUNE',     raid: 'Black Temple' },
  { tier: 5, level: 51, name: 'Firelord',    color: '#ff5a3c', tile: 'OBSIDIAN', raid: 'Firelands' },
  { tier: 6, level: 60, name: 'Frostwrought', color: '#ffd24a', tile: 'GLOW',    raid: 'Icecrown Citadel' },
];

/** Gold for one piece at `tier`. 800 x 4^tier: T0 is 800, T6 is 3,276,800. */
export function gearCost(tier) {
  return 800 * Math.pow(4, tier);
}

/** Level required to buy `tier`. */
export function tierLevel(tier) {
  return (GEAR_TIERS[tier] || GEAR_TIERS[MAX_TIER]).level;
}

export function tierName(tier) {
  return (GEAR_TIERS[tier] || {}).name || 'Unforged';
}

export function tierColor(tier) {
  return (GEAR_TIERS[tier] || {}).color || '#8b93a5';
}

/** The highest tier a character of this level may buy, or -1 below level 1. */
export function maxTierForLevel(level) {
  let out = -1;
  for (const t of GEAR_TIERS) if (level >= t.level) out = t.tier;
  return out;
}

/**
 * The tier owned in a slot, or -1 for nothing.
 *
 * Absence, not zero: T0 is a real tier that costs real gold, so `gear.ring === 0`
 * has to mean "owns the T0 Signet" and cannot double as "owns nothing".
 */
export function ownedTier(gear, slotId) {
  const g = gear || {};
  return (slotId in g) ? Math.max(-1, Math.min(MAX_TIER, g[slotId] | 0)) : -1;
}

// --- Stats -------------------------------------------------------------------
//
// Everything scales linearly in *rungs owned*, where T0 is the first rung — so
// a full T6 set is seven rungs, not six, and the T0 set you buy at level 1 is a
// small real upgrade rather than an entry fee for nothing.
//
// The four shared slots are the same for every class. Weapon and Trinket are
// where the classes diverge, so gear reinforces what a class already is instead
// of flattening nine of them into one stat block.
//
// Health is a *percentage* of the class's base, never a flat number: +200 flat
// is a third of a Paladin's health and nearly double a Hunter's, and one table
// has to be fair to all nine.

/** Slot effects every class shares, per rung. */
export const SHARED_SLOT_EFFECTS = {
  chest: { effect: { maxHpPct: 0.060 } },
  helm: { effect: { maxHpPct: 0.034, critChance: 0.010 } },
  boots: { effect: { moveSpeed: 0.0215, dodge: 0.0085 } },
  ring: { effect: { allDamage: 0.026, critMult: 0.017 } },
};

/**
 * Per class: what the Weapon and the Trinket grant, per rung.
 *
 * Weapons all come to about +7% damage a rung, routed through whichever
 * multiplier that class actually uses — so the numbers are comparable across
 * classes without every class getting the same generic stat.
 */
export const CLASS_GEAR = {
  warrior: {
    weapon: { effect: { meleeDamage: 0.070 } },
    trinket: { effect: { thorns: 0.045, onHitGain: 0.7 } },
    trinketDesc: 'Thorns, and Rage on every hit landed',
  },
  mage: {
    weapon: { effect: { spellDamage: 0.070 } },
    trinket: { effect: { aoeRadius: 0.030, cooldownReduction: 0.012 } },
    trinketDesc: 'Wider spell radius, shorter cooldowns',
  },
  warlock: {
    weapon: { effect: { dotDamage: 0.035, spellDamage: 0.045 } },
    trinket: { effect: { petPower: 0.050, lifesteal: 0.005 } },
    trinketDesc: 'Stronger demons, and life drained on every hit',
  },
  shaman: {
    weapon: { effect: { spellDamage: 0.070 } },
    trinket: { effect: { totemDuration: 0.55, jumps: 0.15 } },
    trinketDesc: 'Totems last longer, chains jump further',
  },
  priest: {
    weapon: { effect: { spellDamage: 0.055, healing: 0.030 } },
    trinket: { effect: { absorb: 3.5, healing: 0.028 } },
    trinketDesc: 'Bigger shields and stronger healing',
  },
  rogue: {
    weapon: { effect: { meleeDamage: 0.050, critMult: 0.045 } },
    trinket: { effect: { attackSpeed: 0.022, dodge: 0.012 } },
    trinketDesc: 'Faster strikes and more dodge',
  },
  demonslayer: {
    weapon: { effect: { meleeDamage: 0.065, lifesteal: 0.005 } },
    trinket: { effect: { onHitGain: 0.6, moveSpeed: 0.018 } },
    trinketDesc: 'Hatred on every hit, and speed to reach the next one',
  },
  paladin: {
    weapon: { effect: { meleeDamage: 0.055, healing: 0.030 } },
    trinket: { effect: { armor: 0.012, damageReduction: 0.008 } },
    trinketDesc: 'Heavier plate and less damage taken',
  },
  hunter: {
    weapon: { effect: { spellDamage: 0.070 } },
    trinket: { effect: { petPower: 0.050, pierce: 0.15 } },
    trinketDesc: 'A stronger pet, and shots that punch through',
  },
};

/**
 * Set bonuses, at two, four and six pieces of a tier.
 *
 * Two rules keep this from doubling the Armoury's power:
 *
 *   * Only the *highest* tier you have a complete threshold at pays out. Seven
 *     tiers of stacking bonuses would be worth more than the gear underneath
 *     them, and a player wearing a full T6 set would still be collecting a
 *     bonus for the T0 set they replaced six tiers ago.
 *   * The numbers are small on purpose. A full T6 set is already about +70%
 *     damage and +65% health; these add roughly a tenth of that. They exist to
 *     reward finishing a set rather than magpie-ing the cheapest upgrade, and
 *     a reward that big enough to change what you buy is big enough to break
 *     the price curve the whole Armoury is paced by.
 *
 * Per class, because that is what makes a set feel like *your* set rather than
 * a second copy of the stat table you already read on the pieces.
 */
export const SET_BONUSES = {
  warrior: {
    2: { effect: { meleeDamage: 0.06, maxHpPct: 0.04 }, desc: '+6% melee damage, +4% health' },
    4: { effect: { bloodsurge: 0.26 }, desc: 'Up to +26% melee damage, scaling with the Rage you hold' },
    6: { effect: { bleedBurst: 1.0, bleedPct: 0.25 },
      desc: 'Bleeds hit 25% harder, and a bleeding enemy that dies detonates the rest' },
  },
  mage: {
    2: { effect: { spellDamage: 0.06, critChance: 0.02 }, desc: '+6% spell damage, +2% crit' },
    4: { effect: { critCdr: 0.5, burnDamage: 0.20 }, desc: 'Crits cut cooldowns 0.5s, +20% burn' },
    6: { effect: { spellEcho: 0.25 }, desc: '25% chance a damaging skill casts itself again for half' },
  },
  warlock: {
    2: { effect: { dotDamage: 0.09, petPower: 0.08 }, desc: '+9% damage over time, +8% demon power' },
    4: { effect: { dotDuration: 1, dotLifesteal: 0.05 },
      desc: 'Rot lasts 1s longer and heals you for 5%' },
    6: { effect: { dotBurst: 0.30, maxPets: 1 },
      desc: '+1 demon, and rot that runs its full course detonates for 30% of its total' },
  },
  shaman: {
    2: { effect: { spellDamage: 0.06, totemDuration: 1.5 },
      desc: '+6% spell damage, totems last 1.5s longer' },
    4: { effect: { overload: 0.25 }, desc: '25% chance your chain skills fire a second time' },
    6: { effect: { jumps: 1, maelstrom: 0.6, moveSpeed: 0.06 },
      desc: '+1 chain jump, melee hits cut Chain Lightning 0.6s, +6% speed' },
  },
  priest: {
    2: { effect: { spellDamage: 0.05, healing: 0.08, absorb: 10 },
      desc: '+5% spell damage, +8% healing, +10 shield' },
    4: { effect: { wardedDamage: 0.18 },
      desc: '+18% spell damage while a shield of yours is holding' },
    6: { effect: { absorb: 20, rapture: 15, resourceRegen: 2 },
      desc: '+20 shield, a breaking shield refunds 15 mana, +2 mana regen' },
  },
  rogue: {
    2: { effect: { critMult: 0.12, attackSpeed: 0.04 }, desc: '+12% crit damage, +4% attack speed' },
    4: { effect: { exposeWeakness: 0.22 },
      desc: '+22% damage to anything already carrying one of your poisons' },
    6: { effect: { doubleStrike: 0.18, critCdr: 0.4 },
      desc: '18% chance to strike twice, crits cut every cooldown' },
  },
  demonslayer: {
    2: { effect: { meleeDamage: 0.06, moveSpeed: 0.05, onHitGain: 0.5 },
      desc: '+6% melee damage, +5% speed, +0.5 Hatred a hit' },
    4: { effect: { momentumDamage: 0.22 }, desc: '+22% damage for 4s after any dash' },
    6: { effect: { aoeRadius: 0.18, lifesteal: 0.06, onKillGain: 6 },
      desc: '+18% area, +6% lifesteal, +6 Hatred a kill' },
  },
  paladin: {
    2: { effect: { meleeDamage: 0.05, armor: 0.03 }, desc: '+5% melee damage, +3% armor' },
    4: { effect: { zeal: 0.04 },
      desc: 'Each hit you take: +4% melee damage, stacking 5 times' },
    6: { effect: { damageReduction: 0.08, killHeal: 14, healing: 0.15 },
      desc: '-8% damage taken, 14 health a kill, +15% healing' },
  },
  hunter: {
    2: { effect: { spellDamage: 0.06, petPower: 0.08 }, desc: '+6% ranged damage, +8% beast power' },
    4: { effect: { sharpshooter: 0.25 }, desc: '+25% damage beyond 12 blocks' },
    6: { effect: { pierce: 1, extraProjectiles: 1, maxPets: 1 },
      desc: '+1 pierce, +1 extra shot, +1 beast' },
  },
};


export const SET_THRESHOLDS = [2, 4, 6];

/** How many slots sit at `tier` or better. */
export function piecesAt(gear, tier) {
  let n = 0;
  for (const s of GEAR_SLOTS) if (ownedTier(gear, s.id) >= tier) n++;
  return n;
}

/**
 * The one set that pays out: the highest tier with at least two pieces, and
 * the deepest threshold met at that tier.
 */
export function activeSet(gear) {
  for (let tier = MAX_TIER; tier >= 0; tier--) {
    const n = piecesAt(gear, tier);
    if (n < SET_THRESHOLDS[0]) continue;
    const met = SET_THRESHOLDS.filter((t) => n >= t);
    return { tier, pieces: n, met };
  }
  return null;
}

/**
 * Weapon riders: what a class's weapon does to an ordinary attack.
 *
 * This is the half of the Armoury that changes how a class *plays* rather than
 * how hard it hits. Every value scales with the weapon's own rungs, so it
 * arrives gradually rather than switching on, and every one is deliberately
 * small — an auto-attack rider fires several times a second, and a number that
 * looks modest on paper is enormous once it is multiplied by an attack speed.
 */
export const WEAPON_RIDERS = {
  warrior: { key: 'autoBleed', per: 0.045, desc: 'attacks bleed for {v}% over 3s' },
  mage: { key: 'critChance', per: 0.010, desc: '+{v}% crit chance' },
  warlock: { key: 'autoDot', per: 0.040, desc: 'attacks rot for {v}% over 4s' },
  shaman: { key: 'autoChain', per: 0.055, desc: 'attacks arc to a second target for {v}%' },
  priest: { key: 'autoRegen', per: 0.55, desc: '+{r} mana on every hit landed' },
  rogue: { key: 'attackSpeed', per: 0.018, desc: '+{v}% attack speed' },
  demonslayer: { key: 'autoSplash', per: 0.050, desc: 'attacks splash for {v}% around the target' },
  paladin: { key: 'autoHeal', per: 0.30, desc: 'heals you {r} on every hit landed' },
  hunter: { key: 'autoPierce', per: 0.020, desc: '+{v}% damage, and shots carry further' },
};

/** The rider a class's weapon grants at the tier it is currently at. */
export function weaponRider(classId, gear) {
  const spec = WEAPON_RIDERS[classId];
  if (!spec) return null;
  const tier = ownedTier(gear, 'weapon');
  if (tier < 0) return null;
  const value = spec.per * (tier + 1);
  return { key: spec.key, value, tier, desc: riderText(spec, value) };
}

function riderText(spec, value) {
  return spec.desc
    .replace('{v}', (value * 100).toFixed(0))
    .replace('{r}', value.toFixed(1));
}

/**
 * Mods that count things rather than scale them. A fractional `jumps` would
 * round up the moment it went above zero — one rung of a Trinket buying a whole
 * extra chain jump — so these accumulate as fractions and are floored once, at
 * the end, in `gearMods`.
 */
const INTEGER_MODS = new Set(['jumps', 'pierce', 'maxPets', 'extraProjectiles']);

/** The effect bag for one slot on one class, per rung. */
export function slotEffect(classId, slotId) {
  const cls = CLASS_GEAR[classId] || CLASS_GEAR.warrior;
  if (slotId === 'weapon' || slotId === 'trinket') return cls[slotId].effect;
  return (SHARED_SLOT_EFFECTS[slotId] || { effect: {} }).effect;
}

/** Human-readable line for a slot, before any tier is bought. */
export function slotDesc(classId, slotId) {
  if (slotId === 'trinket') {
    return (CLASS_GEAR[classId] || CLASS_GEAR.warrior).trinketDesc;
  }
  return describeEffect(slotEffect(classId, slotId), 1);
}

/** Everything a class's gear grants, flattened into one bag. */
export function gearMods(classId, gear) {
  const mods = {};
  for (const slot of GEAR_SLOTS) {
    const tier = ownedTier(gear, slot.id);
    if (tier < 0) continue;
    const rungs = tier + 1;
    for (const [k, v] of Object.entries(slotEffect(classId, slot.id))) {
      mods[k] = (mods[k] || 0) + v * rungs;
    }
  }
  // The set, and only the highest one that pays.
  const set = activeSet(gear);
  if (set) {
    const table = SET_BONUSES[classId] || SET_BONUSES.warrior;
    for (const th of set.met) {
      for (const [k, v] of Object.entries(table[th].effect)) mods[k] = (mods[k] || 0) + v;
    }
  }
  // The weapon's rider. One key per class, scaled by the weapon's own rungs.
  const rider = weaponRider(classId, gear);
  if (rider) mods[rider.key] = (mods[rider.key] || 0) + rider.value;
  for (const k of INTEGER_MODS) {
    if (k in mods) {
      const n = Math.floor(mods[k] + 1e-9);
      if (n > 0) mods[k] = n; else delete mods[k];
    }
  }
  return mods;
}

// --- Buying ------------------------------------------------------------------

/**
 * Whether a slot can be upgraded right now, and if not, exactly why.
 *
 * Tiers cannot be skipped. A level-31 character cannot buy a T3 Ring outright —
 * it must already own T2, which needed T1, which needed T0. Level says how high
 * a slot may go; the ladder says you walk up it. Catching up is cheap, because
 * the rungs you skipped are the cheap ones: the whole ladder to a T3 Ring is
 * 68,000 gold, about three quarters of one run at level 31.
 */
export function canBuy(classId, slotId, gear, level, gold, cores) {
  const cur = ownedTier(gear, slotId);
  const next = cur + 1;
  if (next > MAX_TIER) return { ok: false, reason: 'Fully upgraded.', maxed: true, next, cost: 0 };
  const need = tierLevel(next);
  const cost = gearCost(next);
  if (level < need) {
    return { ok: false, reason: `T${next} unlocks at level ${need}.`, locked: true, next, cost };
  }
  // The Core, and it is the gate that makes gear per class rather than merely
  // stored per class. Gold is global, so without this an account that has
  // raided once buys a full set for every alt it ever rolls — the level gate
  // stops a level-1 character reaching T3, and nothing at all stopped it
  // buying the whole of T0 with somebody else's gold.
  //
  // `cores` is passed in rather than looked up, because raids.js already
  // imports this file and a cycle between the two is not worth the tidiness.
  // Passing null skips the check, which is for previews only.
  if (cores && !cores.has(coreId(next, slotId))) {
    return { ok: false, reason: `Needs the T${next} ${GEAR_BY_ID[slotId].name} Core.`, needsCore: true, next, cost };
  }
  if ((gold || 0) < cost) {
    return { ok: false, reason: `Costs ${cost.toLocaleString()} gold.`, poor: true, next, cost };
  }
  return { ok: true, reason: '', next, cost };
}

/**
 * A Core's id. The same string raids.js builds, and it lives here too because
 * this is the file that checks for it — the alternative is importing raids.js
 * into the module raids.js already imports.
 */
export function coreId(tier, slot) {
  return `t${tier}.${slot}`;
}

/** Gold to take a slot from what it owns now up to `tier`, ladder included. */
export function ladderCost(gear, slotId, tier) {
  let total = 0;
  for (let t = ownedTier(gear, slotId) + 1; t <= tier; t++) total += gearCost(t);
  return total;
}

/** The lowest tier owned across all six slots — what a "set" is measured by. */
export function setTier(gear) {
  let low = MAX_TIER;
  for (const s of GEAR_SLOTS) low = Math.min(low, ownedTier(gear, s.id));
  return low;
}

/** True when every slot is at `tier` or better — the raid gate's question. */
export function hasFullSet(gear, tier) {
  return setTier(gear) >= tier;
}

/** Slots still below `tier`, for "3 pieces short" messages. */
export function missingForSet(gear, tier) {
  return GEAR_SLOTS.filter((s) => ownedTier(gear, s.id) < tier).map((s) => s.id);
}

/**
 * One number for the whole kit, shown on the menu button. Rungs owned across
 * six slots, so a full T6 set reads 42 and an empty one reads 0.
 */
export function gearRating(gear) {
  let n = 0;
  for (const s of GEAR_SLOTS) n += ownedTier(gear, s.id) + 1;
  return n;
}

// --- Presentation -------------------------------------------------------------

const LABELS = {
  maxHpPct: (v) => `+${(v * 100).toFixed(1)}% health`,
  allDamage: (v) => `+${(v * 100).toFixed(1)}% damage`,
  meleeDamage: (v) => `+${(v * 100).toFixed(1)}% melee damage`,
  spellDamage: (v) => `+${(v * 100).toFixed(1)}% spell damage`,
  dotDamage: (v) => `+${(v * 100).toFixed(1)}% damage over time`,
  critChance: (v) => `+${(v * 100).toFixed(1)}% crit`,
  critMult: (v) => `+${(v * 100).toFixed(1)}% crit damage`,
  moveSpeed: (v) => `+${(v * 100).toFixed(1)}% speed`,
  dodge: (v) => `+${(v * 100).toFixed(1)}% dodge`,
  armor: (v) => `+${(v * 100).toFixed(1)}% armor`,
  damageReduction: (v) => `-${(v * 100).toFixed(1)}% damage taken`,
  attackSpeed: (v) => `+${(v * 100).toFixed(1)}% attack speed`,
  lifesteal: (v) => `+${(v * 100).toFixed(1)}% lifesteal`,
  aoeRadius: (v) => `+${(v * 100).toFixed(1)}% area`,
  cooldownReduction: (v) => `-${(v * 100).toFixed(1)}% cooldowns`,
  healing: (v) => `+${(v * 100).toFixed(1)}% healing`,
  petPower: (v) => `+${(v * 100).toFixed(1)}% pet power`,
  thorns: (v) => `+${(v * 100).toFixed(0)}% thorns`,
  onHitGain: (v) => `+${v.toFixed(1)} resource per hit`,
  absorb: (v) => `+${Math.round(v)} shield`,
  totemDuration: (v) => `+${v.toFixed(1)}s totem duration`,
  jumps: (v) => `+${Math.floor(v + 1e-9)} chain jump${Math.floor(v + 1e-9) === 1 ? '' : 's'}`,
  pierce: (v) => `+${Math.floor(v + 1e-9)} pierce`,
};

/** "+42.0% health, +7.0% crit" for an effect bag scaled by `rungs`. */
export function describeEffect(effect, rungs) {
  const parts = [];
  for (const [k, v] of Object.entries(effect)) {
    const total = v * rungs;
    if (INTEGER_MODS.has(k) && Math.floor(total + 1e-9) < 1) continue;
    parts.push(LABELS[k] ? LABELS[k](total) : `${k} +${total.toFixed(2)}`);
  }
  return parts.length ? parts.join(', ') : 'nothing yet';
}

/** What a slot currently grants, given what is owned. */
export function slotSummary(classId, slotId, gear) {
  const tier = ownedTier(gear, slotId);
  if (tier < 0) return 'not owned';
  return describeEffect(slotEffect(classId, slotId), tier + 1);
}

/** Flavour name, e.g. "Firelord Signet". Unowned slots are just the slot. */
export function gearName(slotId, tier) {
  const slot = GEAR_BY_ID[slotId] || { name: slotId };
  if (tier < 0) return slot.name;
  return `${tierName(tier)} ${slot.name}`;
}

// --- The visible weapon --------------------------------------------------------
//
// Sixty-three appearances — nine classes by seven tiers — generated rather than
// modelled, from dials the first-person renderer already has. The point is that
// your own progress is in your hands for the whole run instead of on a menu
// screen you left ten minutes ago.

function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * How a class's weapon looks at a given tier. `tier` of -1 (no weapon bought)
 * returns the class's plain starting look, so an ungeared character still holds
 * something recognisable.
 *
 *   material  stone -> metal -> gold -> crystal -> rune -> obsidian -> glow
 *   colour    drifts toward the tier's colour and brightens
 *   size      grows about 4% a tier, so T6 is noticeably heavier in the hand
 *   core      T2+ gain a coloured inlay along the blade
 *   gem       T4+ gain an emissive stone at the guard
 *   trail     T6 alone leaves a slow trail
 */
export function weaponAppearance(cls, tier) {
  const t = Math.max(-1, Math.min(MAX_TIER, tier === undefined || tier === null ? -1 : tier | 0));
  const base = cls.weapon;
  const baseColor = hexToRgb(base.color);
  if (t < 0) {
    return {
      type: base.type, tile: base.tile, color: baseColor, accent: baseColor,
      scale: 1, emissive: 0, core: false, gem: false, trail: false, tier: -1,
    };
  }
  const tint = hexToRgb(tierColor(t));
  const color = mix(baseColor, tint, 0.18 + 0.085 * t).map((c) => Math.min(1, c * (1 + 0.035 * t)));
  return {
    type: base.type,
    tile: GEAR_TIERS[t].tile,
    color,
    accent: tint,
    scale: 1 + 0.042 * t,
    emissive: Math.min(1, 0.10 * t),
    core: t >= 2,
    gem: t >= 4,
    trail: t >= 6,
    tier: t,
  };
}

// --- Migrating off the old Armoury ---------------------------------------------
//
// The old shop was account-wide with fourteen slots and no ceiling; this one is
// per class with six. There is no honest mapping between them — "tier 74 Idol"
// has no equivalent in a shop that no longer sells boss damage, and inventing
// one would be a guess dressed up as a conversion. So every gold piece spent on
// it is refunded, exactly, and re-spent here at whatever tier the level allows.

/** The old price table, kept only so the refund can be exact. */
const LEGACY_ARMOR_PRICES = {
  helm: [90, 1.11], chest: [110, 1.115], legs: [95, 1.11], boots: [100, 1.112],
  gloves: [105, 1.113], cloak: [115, 1.115], ring: [120, 1.118], amulet: [125, 1.12],
  sigil: [130, 1.122], shoulders: [108, 1.114], bracers: [112, 1.116], belt: [106, 1.114],
  trinket: [135, 1.124], idol: [140, 1.126],
};

/** Gold spent on the old account-wide Armoury, to the coin. */
export function legacyArmorRefund(tiers) {
  let total = 0;
  for (const [id, tier] of Object.entries(tiers || {})) {
    const [baseCost, growth] = LEGACY_ARMOR_PRICES[id] || [110, 1.115];
    for (let t = 0; t < (tier | 0); t++) {
      total += Math.round(baseCost * Math.pow(growth, t) * PRICE_MULTIPLIER);
    }
  }
  return Math.round(total);
}
