// Raids: seven of them, one per gear tier, six bosses each.
//
// A raid is where a tier's gear becomes *buyable*. Each boss drops a Core, and
// a Core is permission — not the item. The gold still has to be earned, and a
// boss pays roughly half what its piece costs, so the other half comes from the
// arena and from quests. That split is deliberate: a raid you can clear without
// ever playing the arena would make the arena optional, and the arena is the
// game.
//
// Two rules shape everything here.
//
// **A boss is consumed by killing it, not by fighting it.** Wiping costs
// nothing and the attempt repeats as often as needed. Without that, a player
// who out-levels their gear could lock themselves out of the rest of the game
// permanently — and a progression system that can deadlock is not a challenge,
// it is a bug with a difficulty setting.
//
// **Progress is per class.** Only gold is shared. Clearing Molten Core on the
// Paladin does nothing for the Rogue, for the same reason gear is per class: a
// class you have actually played should feel different from one you have not.

/**
 * Which slot each boss's Core belongs to, in kill order. Fixed across every
 * raid so a player learns it once: the first boss is always the weapon, the
 * last is always the trinket.
 */
export const CORE_ORDER = ['weapon', 'chest', 'helm', 'boots', 'ring', 'trinket'];

/**
 * Boss mechanics, kept to a small reusable set rather than forty-two bespoke
 * ones. Each maps onto something the arena engine already does, so a raid boss
 * is a parameterised version of a fight the game can already run rather than a
 * second combat system nobody would have time to balance.
 */
export const MECHANICS = {
  slam: { name: 'Shockwave', blurb: 'Rings of force march outward. Keep moving.' },
  breath: { name: 'Breath', blurb: 'A wide cone in front. Get behind it.' },
  adds: { name: 'Summons', blurb: 'Calls help. Clear it or be surrounded.' },
  charge: { name: 'Charge', blurb: 'Closes the gap instantly and knocks you back.' },
  bombs: { name: 'Detonate', blurb: 'Marks the ground, then it goes off.' },
  frost: { name: 'Frost', blurb: 'Freezing ground that slows and roots.' },
  shadow: { name: 'Affliction', blurb: 'Lingering rot in a wide area.' },
  enrage: { name: 'Frenzy', blurb: 'Below a third health it hits far harder.' },
};

/**
 * The seven raids. `tier` is the gear tier it unlocks, `level` the character
 * level required to enter, and `theme` is what the arena is built and lit from.
 *
 * Boss `power` is a multiplier on the tier's baseline, so the sixth boss of a
 * raid is meaningfully harder than the first without each one needing its own
 * hand-tuned health pool.
 */
export const RAIDS = [
  {
    id: 'zulgurub', tier: 0, level: 1,
    name: "Zul'Gurub", blurb: 'A drowned troll city, thick with poison and old blood.',
    theme: { sky: '#2b3a22', fog: '#3d5230', stone: '#4a5a3a', accent: '#8ce06a', lava: false },
    bosses: [
      { id: 'venoxis', name: 'High Priest Venoxis', mechanic: 'shadow', power: 1.00, color: '#8ce06a' },
      { id: 'mandokir', name: 'Bloodlord Mandokir', mechanic: 'charge', power: 1.10, color: '#e0473c' },
      { id: 'arlokk', name: 'High Priestess Arlokk', mechanic: 'adds', power: 1.20, color: '#a35cff' },
      { id: 'jindo', name: "Jin'do the Hexxer", mechanic: 'shadow', power: 1.30, color: '#6ec8ff' },
      { id: 'gahzranka', name: "Gahz'ranka", mechanic: 'slam', power: 1.42, color: '#4aa3ff' },
      { id: 'hakkar', name: 'Hakkar the Soulflayer', mechanic: 'enrage', power: 1.60, color: '#c0392b' },
    ],
  },
  {
    id: 'moltencore', tier: 1, level: 11,
    name: 'Molten Core', blurb: 'Grey stone over a lake of fire, and something older beneath it.',
    theme: { sky: '#3a1408', fog: '#5a2410', stone: '#4c4c4c', accent: '#ff8a3c', lava: true },
    bosses: [
      { id: 'lucifron', name: 'Lucifron', mechanic: 'shadow', power: 1.00, color: '#ff8a3c' },
      { id: 'magmadar', name: 'Magmadar', mechanic: 'breath', power: 1.12, color: '#ff5a3c' },
      { id: 'gehennas', name: 'Gehennas', mechanic: 'adds', power: 1.22, color: '#ffb27a' },
      { id: 'garr', name: 'Garr', mechanic: 'bombs', power: 1.34, color: '#c9a06a' },
      { id: 'geddon', name: 'Baron Geddon', mechanic: 'bombs', power: 1.46, color: '#ffd24a' },
      { id: 'ragnaros1', name: 'Ragnaros', mechanic: 'enrage', power: 1.70, color: '#ff3c14' },
    ],
  },
  {
    id: 'karazhan', tier: 2, level: 21,
    name: 'Karazhan', blurb: 'A haunted tower where the rooms do not stay where you left them.',
    theme: { sky: '#1a1426', fog: '#2e2440', stone: '#3a3348', accent: '#c98fff', lava: false },
    bosses: [
      { id: 'attumen', name: 'Attumen the Huntsman', mechanic: 'charge', power: 1.00, color: '#cfd6e6' },
      { id: 'moroes', name: 'Moroes', mechanic: 'adds', power: 1.12, color: '#a35cff' },
      { id: 'maiden', name: 'Maiden of Virtue', mechanic: 'slam', power: 1.24, color: '#ffe9a8' },
      { id: 'bigbadwolf', name: 'The Big Bad Wolf', mechanic: 'charge', power: 1.36, color: '#8b5a2b' },
      { id: 'curator', name: 'The Curator', mechanic: 'adds', power: 1.48, color: '#7ef0ff' },
      { id: 'malchezaar', name: 'Prince Malchezaar', mechanic: 'bombs', power: 1.72, color: '#ff5a3c' },
    ],
  },
  {
    id: 'ulduar', tier: 3, level: 31,
    name: 'Ulduar', blurb: 'Titan machinery, still running, still guarding what it was told to.',
    theme: { sky: '#132030', fog: '#1e3448', stone: '#5a6470', accent: '#7ef0ff', lava: false },
    bosses: [
      { id: 'leviathan', name: 'Flame Leviathan', mechanic: 'charge', power: 1.00, color: '#ff8a3c' },
      { id: 'razorscale', name: 'Razorscale', mechanic: 'breath', power: 1.14, color: '#c9a06a' },
      { id: 'ignis', name: 'Ignis the Furnace Master', mechanic: 'bombs', power: 1.26, color: '#ff5a3c' },
      { id: 'kologarn', name: 'Kologarn', mechanic: 'slam', power: 1.40, color: '#8b93a5' },
      { id: 'thorim', name: 'Thorim', mechanic: 'adds', power: 1.54, color: '#7ef0ff' },
      { id: 'yogg', name: 'Yogg-Saron', mechanic: 'shadow', power: 1.80, color: '#7dff9d' },
    ],
  },
  {
    id: 'blacktemple', tier: 4, level: 41,
    name: 'Black Temple', blurb: 'A fortress of fel green and black stone, and the one who kept it.',
    theme: { sky: '#0f1a12', fog: '#1c2e1e', stone: '#2e3630', accent: '#9dff7a', lava: false },
    bosses: [
      { id: 'najentus', name: "High Warlord Naj'entus", mechanic: 'bombs', power: 1.00, color: '#4aa3ff' },
      { id: 'supremus', name: 'Supremus', mechanic: 'charge', power: 1.16, color: '#ff5a3c' },
      { id: 'akama', name: 'Shade of Akama', mechanic: 'adds', power: 1.30, color: '#a35cff' },
      { id: 'teron', name: 'Teron Gorefiend', mechanic: 'shadow', power: 1.46, color: '#6a2fb5' },
      { id: 'bloodboil', name: 'Gurtogg Bloodboil', mechanic: 'enrage', power: 1.62, color: '#c0392b' },
      { id: 'illidan', name: 'Illidan Stormrage', mechanic: 'breath', power: 1.90, color: '#9dff7a' },
    ],
  },
  {
    id: 'firelands', tier: 5, level: 51,
    name: 'Firelands', blurb: 'The Firelord rebuilt his home. It is worse this time.',
    theme: { sky: '#4a1206', fog: '#7a2410', stone: '#3c2a22', accent: '#ffb03c', lava: true },
    bosses: [
      { id: 'bethtilac', name: "Beth'tilac", mechanic: 'adds', power: 1.00, color: '#ff8a3c' },
      { id: 'rhyolith', name: 'Lord Rhyolith', mechanic: 'slam', power: 1.18, color: '#8b5a2b' },
      { id: 'alysrazor', name: 'Alysrazor', mechanic: 'breath', power: 1.34, color: '#ffd24a' },
      { id: 'shannox', name: 'Shannox', mechanic: 'charge', power: 1.50, color: '#c9a06a' },
      { id: 'baleroc', name: 'Baleroc', mechanic: 'bombs', power: 1.68, color: '#ff5a3c' },
      { id: 'ragnaros2', name: 'Ragnaros, Firelord', mechanic: 'enrage', power: 2.00, color: '#ff3c14' },
    ],
  },
  {
    id: 'icecrown', tier: 6, level: 60,
    name: 'Icecrown Citadel', blurb: 'A frost keep at the top of the world, and the throne inside it.',
    theme: { sky: '#0e1c2e', fog: '#1c3450', stone: '#7a8ea0', accent: '#8fe3ff', lava: false },
    bosses: [
      { id: 'marrowgar', name: 'Lord Marrowgar', mechanic: 'bombs', power: 1.00, color: '#cfd6e6' },
      { id: 'deathwhisper', name: 'Lady Deathwhisper', mechanic: 'adds', power: 1.20, color: '#a35cff' },
      { id: 'saurfang', name: 'Deathbringer Saurfang', mechanic: 'enrage', power: 1.40, color: '#c0392b' },
      { id: 'festergut', name: 'Festergut', mechanic: 'shadow', power: 1.60, color: '#8ce06a' },
      { id: 'sindragosa', name: 'Sindragosa', mechanic: 'frost', power: 1.82, color: '#8fe3ff' },
      { id: 'lichking', name: 'The Lich King', mechanic: 'frost', power: 2.20, color: '#7ef0ff' },
    ],
  },
];

export const RAID_BY_ID = Object.fromEntries(RAIDS.map((r) => [r.id, r]));
export const RAID_BY_TIER = Object.fromEntries(RAIDS.map((r) => [r.tier, r]));

/** The Core a boss drops, given its position in the raid. */
export function coreSlotFor(index) {
  return CORE_ORDER[Math.min(index, CORE_ORDER.length - 1)];
}

/** A Core's id, e.g. "t3.helm" — the key gear checks for permission to buy. */
export function coreId(tier, slot) {
  return `t${tier}.${slot}`;
}

/**
 * A fresh per-class raid record. `killed` holds boss ids, so a boss stays dead
 * across sessions and a wipe leaves no trace — which is the whole rule.
 *
 * Gear, elsewhere, follows the same convention this file relies on: a slot the
 * class has never bought is *absent* from the map rather than present at 0,
 * because tier 0 is a real tier somebody paid for.
 */
export function emptyRaidState() {
  return { killed: {} };
}

/** Repair a raid record from disk; a save from before raids has none. */
export function normaliseRaidState(state) {
  if (!state || typeof state !== 'object') return emptyRaidState();
  const killed = {};
  const valid = new Set(RAIDS.flatMap((r) => r.bosses.map((b) => b.id)));
  for (const id of Object.keys(state.killed || {})) {
    if (valid.has(id) && state.killed[id]) killed[id] = true;
  }
  return { killed };
}

export function isBossDead(state, bossId) {
  return !!(state && state.killed && state.killed[bossId]);
}

/** How many of a raid's six bosses this class has put down. */
export function bossesDown(state, raid) {
  let n = 0;
  for (const b of raid.bosses) if (isBossDead(state, b.id)) n++;
  return n;
}

export function isRaidCleared(state, raid) {
  return bossesDown(state, raid) === raid.bosses.length;
}

/** Every Core this class has earned, as a Set of core ids. */
export function earnedCores(state) {
  const out = new Set();
  for (const raid of RAIDS) {
    raid.bosses.forEach((b, i) => {
      if (isBossDead(state, b.id)) out.add(coreId(raid.tier, coreSlotFor(i)));
    });
  }
  return out;
}

/**
 * Whether a class may enter a raid, and if not, why.
 *
 * Three gates, and all three must be open. Returning the *reason* rather than a
 * bare boolean is what lets the menu say "you are level 45, Firelands opens at
 * 51" instead of greying a button out and leaving the player to guess.
 */
export function raidAccess(raid, { level, raidState, gear }) {
  if (level < raid.level) {
    return { ok: false, reason: `Requires level ${raid.level} — you are ${level}.` };
  }
  const prev = RAID_BY_TIER[raid.tier - 1];
  if (prev) {
    if (!isRaidCleared(raidState, prev)) {
      const down = bossesDown(raidState, prev);
      return { ok: false, reason: `Clear ${prev.name} first — ${down} of ${prev.bosses.length} down.` };
    }
    // And the previous tier's set must actually be worn, not merely unlocked.
    // Otherwise a player skips straight up the raids on level alone and arrives
    // at Icecrown in tier-0 gear, which is not a challenge, it is a wall.
    // Checked against CORE_ORDER rather than the Armoury's slot list: those six
    // *are* the new slots, and reading them from here keeps raids independent
    // of a shop that is still being rebuilt.
    // Absence, not zero. Tier 0 is a real tier you buy, so a slot that has
    // never been bought cannot be represented as 0 — that would make "own the
    // full T0 set" true for a character wearing nothing at all.
    const owned = gear || {};
    const missing = CORE_ORDER.filter((slot) => !(slot in owned) || owned[slot] < prev.tier);
    if (missing.length) {
      return {
        ok: false,
        reason: `Buy the full T${prev.tier} set first — ${missing.length} piece${missing.length > 1 ? 's' : ''} short.`,
      };
    }
  }
  return { ok: true, reason: '' };
}

/**
 * Gold a boss pays. Half of what its piece costs, so the other half has to come
 * from the arena — a raid that funded itself would make the arena optional.
 */
export function bossGold(raid, index, slotCost) {
  return Math.round(slotCost * 0.5);
}

/** The next boss a class faces in a raid, or null once it is cleared. */
export function nextBoss(state, raid) {
  for (let i = 0; i < raid.bosses.length; i++) {
    if (!isBossDead(state, raid.bosses[i].id)) return { ...raid.bosses[i], index: i };
  }
  return null;
}
