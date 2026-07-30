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
 *
 * Taken from the Armoury's own slot order rather than written out again here.
 * Two lists that must agree and are maintained in two places eventually do not.
 */
import { GEAR_SLOT_IDS, coreId } from './armor.js';

export const CORE_ORDER = GEAR_SLOT_IDS;

// Boss mechanics, kept to a small reusable set rather than forty-two bespoke
// ones. Each maps onto something the arena engine already does, so a raid boss
// is a parameterised version of a fight the game can already run rather than a
// second combat system nobody would have time to balance.
//
// Every constant a mechanic needs lives here rather than on the forty-two
// bosses that use it. Two numbers that have to agree, written in two places,
// eventually disagree.
//
//   tell    which of the three telegraph languages this speaks, and so what
//           colour and shape the player sees:
//             burst  amber, a filled circle, it goes off where it is drawn
//             linger ice blue, an outline, it stays after it lands
//             aimed  violet, and it is following *you*
//   cue     the second sound, after the universal 'cast'
//   cast    seconds of telegraph. Never scaled by tier, power or phase — the
//           warning is the contract, and shortening it is how a fight stops
//           being hard and starts being unfair.
//   cd      base seconds between casts, before the phase rate multiplies it
//   dmg     multiplier on the boss's damageAmount
//   radius  blocks
export const MECHANICS = {
  slam: {
    name: 'Shockwave', blurb: 'Rings of force march outward. Keep moving.',
    tell: 'burst', cue: 'stomp', cast: 1.2, cd: 9, dmg: 2.6, radius: 4.5,
  },
  breath: {
    name: 'Breath', blurb: 'A wide spray in front. Get out of the arc.',
    tell: 'burst', cue: 'roar', cast: 1.4, cd: 11, dmg: 0.45, radius: 18,
  },
  adds: {
    name: 'Summons', blurb: 'Calls help. Clear it or be surrounded.',
    tell: 'aimed', cue: 'summon', cast: 1.0, cd: 14, dmg: 0, radius: 3,
  },
  charge: {
    name: 'Charge', blurb: 'Closes the gap instantly and knocks you back.',
    tell: 'aimed', cue: 'charge', cast: 0.9, cd: 8, dmg: 1.6, radius: 2.5,
  },
  bombs: {
    name: 'Detonate', blurb: 'Marks the ground, then it goes off.',
    tell: 'aimed', cue: 'fuse', cast: 1.5, cd: 8, dmg: 3.2, radius: 4.5,
  },
  // The blurb used to promise a root. It does not root, and that is deliberate:
  // with no dodge button, no interrupt and nothing that cleanses, a root is not
  // a decision the player gets to make, it is a free hit with extra steps.
  frost: {
    name: 'Frost', blurb: 'Freezing ground that slows. Do not stand in it.',
    tell: 'linger', cue: 'shatter', cast: 1.1, cd: 12, dmg: 0.45, radius: 4.2,
  },
  shadow: {
    name: 'Affliction', blurb: 'Lingering rot in a wide area.',
    tell: 'aimed', cue: 'curse', cast: 2.2, cd: 13, dmg: 2.0, radius: 9,
  },
  enrage: {
    name: 'Frenzy', blurb: 'Below a third health it hits far harder.',
    tell: 'burst', cue: 'roar', cast: 0.4, cd: 10, dmg: 0.75, radius: 5,
  },
};

/**
 * A boss fights at range or in your face, and which one is decided by the
 * mechanic rather than written out forty-two times. Breath and Affliction are
 * both cast from a distance and both stop working if the boss is standing on
 * the player; everything else wants to be close.
 *
 * A boss may override it with its own `stance` where the fight needs it.
 */
export function bossStance(boss) {
  if (boss.stance) return boss.stance;
  return (boss.mechanic === 'breath' || boss.mechanic === 'shadow') ? 'ranged' : 'melee';
}

/**
 * A raid boss's stat block, derived rather than authored forty-two times.
 *
 * Power scales health nearly in full and damage only weakly. The reason is that
 * the player's mitigation does not improve *within* a raid: six bosses buy them
 * at most six gear rungs, worth about +13% damage and +9% health, and only if
 * they have the gold for it. A last boss hitting 2.2x as hard as the first
 * would turn "hard" into "one mistake ends the attempt" for someone wearing
 * exactly the gear the gate asked for. So the last boss is mostly a *longer*
 * fight — more repetitions of a mechanic you now know — hitting half again as
 * heavy.
 *
 * 2600 is a starting constant, not a measured one. `tools/balance-sim.js --raid`
 * is what trues it up; until then this is playable rather than balanced.
 */
export function raidScaling(tier, power) {
  // What a character standing at this raid's gate is carrying: the full
  // previous tier set, which is `tier` rungs at about +9.4% health a rung, on
  // a class base whose median is 112.
  const php = 115 * (1 + 0.144 * tier);
  return {
    hp: Math.round(2600 * (1 + 0.45 * tier + 0.04 * tier * tier) * power),
    damage: php * 0.10 * (0.55 + 0.45 * power),
    php,
  };
}

/**
 * How the fight paces itself. Thresholds choose the rules, the timer chooses
 * the beats — each alone fails a different way. A pure timer means an
 * over-geared player never sees phase 3 and an under-geared one meets it while
 * still learning phase 1; pure thresholds mean nothing changes for forty
 * seconds if the player is cautious.
 */
export const PHASES = [
  { at: 1.00, rate: 1.00, reps: 0 },
  { at: 0.70, rate: 0.82, reps: 1 },
  { at: 0.35, rate: 0.68, reps: 2 },
];

export function phaseFor(hpFraction) {
  let out = 0;
  for (let i = 0; i < PHASES.length; i++) if (hpFraction <= PHASES[i].at) out = i;
  return out;
}

/**
 * The seven raids. `tier` is the gear tier it unlocks, `level` the character
 * level required to enter, and `theme` is what the arena is built and lit from.
 *
 * Boss `id`s are never renamed. They are the keys a class's raid record is
 * written under, so changing one would silently un-kill a boss on every save
 * that had already put it down. Display names are free to move; ids are not.
 *
 * Boss `power` is a multiplier on the tier's baseline, so the sixth boss of a
 * raid is meaningfully harder than the first without each one needing its own
 * hand-tuned health pool.
 */
export const RAIDS = [
  {
    // Level 8, not 1. The gear tier opens at 1 — that part is the Armoury's
    // and it has not moved — but a level-1 character has two skills, no
    // talents and nothing bought, and putting a raid boss in front of them is
    // offering a fight the game knows they cannot win. Eight is where the
    // second pair of skills and a handful of talent points have landed, still
    // inside the band T0 gear covers.
    id: 'zulgurub', tier: 0, level: 8,
    name: "Zul'Craftub", blurb: 'A drowned troll city, thick with poison and old blood.',
    theme: { sky: '#1e3016', fog: '#3f5c33', stone: '#3a4234', accent: '#c9a227', hazard: '#6edc3c', lava: false, fogNear: 26, fogFar: 62 },
    trial: 'bombs',
    bosses: [
      { id: 'venoxis', name: 'High Priest Venocraft', mechanic: 'shadow', power: 1.00, color: '#8ce06a' },
      { id: 'mandokir', name: 'Bloodlord Craftokir', mechanic: 'charge', power: 1.10, color: '#e0473c' },
      { id: 'arlokk', name: 'High Priestess Craflokk', mechanic: 'adds', power: 1.20, color: '#a35cff' },
      { id: 'jindo', name: "Craft'do the Hexxer", mechanic: 'shadow', power: 1.30, color: '#6ec8ff' },
      { id: 'gahzranka', name: "Gahz'crafta", mechanic: 'slam', power: 1.42, color: '#4aa3ff' },
      { id: 'hakkar', name: 'Crafkar the Soulflayer', mechanic: 'enrage', power: 1.60, color: '#c0392b' },
    ],
  },
  {
    id: 'moltencore', tier: 1, level: 11,
    name: 'Molten Core', blurb: 'Grey stone over a lake of fire, and something older beneath it.',
    theme: { sky: '#120806', fog: '#40140a', stone: '#3e3e44', stoneHi: '#6e6e74', accent: '#9fd0ff', hazard: '#ff8a3c', lava: true, fogNear: 22, fogFar: 58 },
    trial: 'frost',
    bosses: [
      { id: 'lucifron', name: 'Lucicraft', mechanic: 'shadow', power: 1.00, color: '#ff8a3c' },
      { id: 'magmadar', name: 'Magmacraft', mechanic: 'breath', power: 1.12, color: '#ff5a3c' },
      { id: 'gehennas', name: 'Crafthennas', mechanic: 'adds', power: 1.22, color: '#ffb27a' },
      { id: 'garr', name: 'Crafgarr', mechanic: 'bombs', power: 1.34, color: '#c9a06a' },
      { id: 'geddon', name: 'Baron Craftdon', mechanic: 'bombs', power: 1.46, color: '#ffd24a' },
      { id: 'ragnaros1', name: 'Ragnacraft', mechanic: 'enrage', power: 1.70, color: '#ff3c14' },
    ],
  },
  {
    id: 'karazhan', tier: 2, level: 21,
    name: 'Karacraft', blurb: 'A haunted tower where the rooms do not stay where you left them.',
    theme: { sky: '#140f22', fog: '#2a2036', stone: '#3a3348', stoneAlt: '#2e2840', accent: '#ffbf6a', hazard: '#d0491a', lava: false, fogNear: 30, fogFar: 70 },
    trial: 'shadow',
    bosses: [
      { id: 'attumen', name: 'Craftumen the Huntsman', mechanic: 'charge', power: 1.00, color: '#cfd6e6' },
      { id: 'moroes', name: 'Morocraft', mechanic: 'adds', power: 1.12, color: '#a35cff' },
      { id: 'maiden', name: 'Maiden of Virtue', mechanic: 'slam', power: 1.24, color: '#ffe9a8' },
      { id: 'bigbadwolf', name: 'The Big Bad Wolf', mechanic: 'charge', power: 1.36, color: '#8b5a2b' },
      { id: 'curator', name: 'The Curator', mechanic: 'adds', power: 1.48, color: '#7ef0ff' },
      { id: 'malchezaar', name: 'Prince Craftchezaar', mechanic: 'bombs', power: 1.72, color: '#ff5a3c' },
    ],
  },
  {
    id: 'ulduar', tier: 3, level: 31,
    name: 'Craftuar', blurb: 'Titan machinery, still running, still guarding what it was told to.',
    theme: { sky: '#0e1a26', fog: '#1c3040', stone: '#3e4048', stoneHi: '#949aa0', accent: '#ffa62b', accentHi: '#7ef0ff', hazard: '#ff8a3c', lava: true, fogNear: 34, fogFar: 86 },
    trial: 'slam',
    bosses: [
      { id: 'leviathan', name: 'Flame Craftathan', mechanic: 'charge', power: 1.00, color: '#ff8a3c' },
      { id: 'razorscale', name: 'Razorcraft', mechanic: 'breath', power: 1.14, color: '#c9a06a' },
      { id: 'ignis', name: 'Craftnis the Furnace Master', mechanic: 'bombs', power: 1.26, color: '#ff5a3c' },
      { id: 'kologarn', name: 'Crafogarn', mechanic: 'slam', power: 1.40, color: '#8b93a5' },
      { id: 'thorim', name: 'Craftorim', mechanic: 'adds', power: 1.54, color: '#7ef0ff' },
      { id: 'yogg', name: 'Yogg-Craftron', mechanic: 'shadow', power: 1.80, color: '#7dff9d' },
    ],
  },
  {
    id: 'blacktemple', tier: 4, level: 41,
    name: 'Black Temple', blurb: 'A fortress of fel green and black stone, and the one who kept it.',
    theme: { sky: '#060a07', fog: '#101a12', stone: '#22261f', daisStone: '#3a4038', accent: '#a8ff5c', hazard: '#a8ff5c', lava: false, fogNear: 18, fogFar: 52 },
    trial: 'frost',
    bosses: [
      { id: 'najentus', name: "High Warlord Craft'entus", mechanic: 'bombs', power: 1.00, color: '#4aa3ff' },
      { id: 'supremus', name: 'Craftremus', mechanic: 'charge', power: 1.16, color: '#ff5a3c' },
      { id: 'akama', name: 'Shade of Crafama', mechanic: 'adds', power: 1.30, color: '#a35cff' },
      { id: 'teron', name: 'Craferon Gorefiend', mechanic: 'shadow', power: 1.46, color: '#6a2fb5' },
      { id: 'bloodboil', name: 'Crafttogg Bloodboil', mechanic: 'enrage', power: 1.62, color: '#c0392b' },
      { id: 'illidan', name: 'Craftidan Stormrage', mechanic: 'breath', power: 1.90, color: '#9dff7a' },
    ],
  },
  {
    id: 'firelands', tier: 5, level: 51,
    name: 'Firelands', blurb: 'The Firelord rebuilt his home. It is worse this time.',
    theme: { sky: '#ff7a24', fog: '#3a0e06', stone: '#1e1614', accent: '#ffb03c', hazard: '#ff8a3c', lava: true, fogNear: 30, fogFar: 74 },
    trial: 'bombs',
    bosses: [
      { id: 'bethtilac', name: "Craft'tilac", mechanic: 'adds', power: 1.00, color: '#ff8a3c' },
      { id: 'rhyolith', name: 'Lord Craftolith', mechanic: 'slam', power: 1.18, color: '#8b5a2b' },
      { id: 'alysrazor', name: 'Craftsrazor', mechanic: 'breath', power: 1.34, color: '#ffd24a' },
      { id: 'shannox', name: 'Craftnox', mechanic: 'charge', power: 1.50, color: '#c9a06a' },
      { id: 'baleroc', name: 'Craferoc', mechanic: 'bombs', power: 1.68, color: '#ff5a3c' },
      { id: 'ragnaros2', name: 'Ragnacraft, Firelord', mechanic: 'enrage', power: 2.00, color: '#ff3c14' },
    ],
  },
  {
    id: 'icecrown', tier: 6, level: 60,
    name: 'Craftcrown Citadel', blurb: 'A frost keep at the top of the world, and the throne inside it.',
    theme: { sky: '#0a1424', fog: '#16304c', stone: '#1a2230', stoneHi: '#b9dcf0', accent: '#e8d6a0', hazard: '#cfeeff', lava: false, fogNear: 28, fogFar: 78 },
    trial: 'frost',
    bosses: [
      { id: 'marrowgar', name: 'Lord Craftowgar', mechanic: 'bombs', power: 1.00, color: '#cfd6e6' },
      { id: 'deathwhisper', name: 'Lady Craftwhisper', mechanic: 'adds', power: 1.20, color: '#a35cff' },
      { id: 'saurfang', name: 'Craftbringer Saurfang', mechanic: 'enrage', power: 1.40, color: '#c0392b' },
      { id: 'festergut', name: 'Craftergut', mechanic: 'shadow', power: 1.60, color: '#8ce06a' },
      // Near-white rather than the mid-cyan it was: #8fe3ff is now the colour
      // of frost *on the floor*, and a frost boss wearing the colour of its own
      // hazard is the one collision this whole separation exists to prevent.
      // Value, not hue, does the separating — the patches stay cyan, the dragon
      // is nearly white, and the two never read as the same thing.
      { id: 'sindragosa', name: 'Craftragosa', mechanic: 'frost', power: 1.82, color: '#dff2ff' },
      { id: 'lichking', name: 'The Craft King', mechanic: 'frost', power: 2.20, color: '#7ef0ff' },
    ],
  },
];

export const RAID_BY_ID = Object.fromEntries(RAIDS.map((r) => [r.id, r]));
export const RAID_BY_TIER = Object.fromEntries(RAIDS.map((r) => [r.tier, r]));

/** The Core a boss drops, given its position in the raid. */
export function coreSlotFor(index) {
  return CORE_ORDER[Math.min(index, CORE_ORDER.length - 1)];
}

/** A Core's id, e.g. "t3.helm". Defined in armor.js, which is the file that
 *  checks for it, and re-exported here because this is where Cores are earned. */
export { coreId };

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
