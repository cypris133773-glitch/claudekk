// Wave affixes — arena-wide rules that change how a wave has to be played.
//
// The problem they solve: past wave 15 the numbers keep climbing but the fight
// stops changing. You have found the rotation that works and you repeat it.
// Affixes attack that directly. They are not stat multipliers dressed up with
// a name — each one invalidates a habit. Volatile punishes fighting inside the
// pack, Sanguine punishes standing on a corpse, Grievous punishes trading hits,
// Spiteful punishes turning your back on a kill. The build that beat wave 20
// last run is not automatically the build that beats it this run.
//
// They are announced before the wave, not during it, so the counterplay is a
// decision you make rather than a surprise you eat. And they pay: every active
// affix adds to the wave's soul yield, so the deep waves that stack three of
// them are also the efficient place to grind.

/**
 * Each affix declares:
 *   tier   — the earliest wave it may appear on, so the roster opens up
 *   souls  — the share it adds to the wave's payout
 *   group  — at most one affix per group is active at a time, so you never
 *            draw two that ask for the same counterplay (or that cancel out)
 */
export const AFFIXES = [
  {
    id: 'volatile',
    name: 'Volatile',
    icon: '💥',
    color: '#ff8a3c',
    blurb: 'Slain enemies detonate.',
    counter: 'Kill at the edge of the pack, not inside it.',
    tier: 4,
    souls: 0.14,
    group: 'corpse',
  },
  {
    id: 'sanguine',
    name: 'Sanguine',
    icon: '🩸',
    color: '#c0392b',
    blurb: 'Corpses bleed pools that heal enemies and burn you.',
    counter: 'Move off the kill. Do not fight over a body.',
    tier: 8,
    souls: 0.16,
    group: 'corpse',
  },
  {
    id: 'spiteful',
    name: 'Spiteful',
    icon: '👻',
    color: '#a35cff',
    blurb: 'The dead send a shade after you.',
    counter: 'Shades are fragile. Turn and clear them.',
    tier: 12,
    souls: 0.18,
    group: 'corpse',
  },
  {
    id: 'frenzied',
    name: 'Frenzied',
    icon: '🔥',
    color: '#ff5a3c',
    blurb: 'Wounded enemies go berserk.',
    counter: 'Finish what you start — do not leave a row on low health.',
    tier: 4,
    souls: 0.14,
    group: 'behaviour',
  },
  {
    id: 'quickened',
    name: 'Quickened',
    icon: '💨',
    color: '#8fd8ff',
    blurb: 'Everything moves faster.',
    counter: 'Kiting stops working. Hold ground and use slows.',
    tier: 6,
    souls: 0.15,
    group: 'behaviour',
  },
  {
    id: 'warded',
    name: 'Warded',
    icon: '🔷',
    color: '#7ad7ff',
    blurb: 'Enemies arrive behind a ward that soaks the first hits.',
    counter: 'Big single hits break wards; chip damage wastes itself.',
    tier: 10,
    souls: 0.16,
    group: 'defence',
  },
  {
    id: 'fortified',
    name: 'Fortified',
    icon: '🛡',
    color: '#9fb4d8',
    blurb: 'Lesser enemies are far tougher.',
    counter: 'Sustained damage over burst. Bosses are unchanged.',
    tier: 5,
    souls: 0.13,
    group: 'defence',
  },
  {
    id: 'tyrannical',
    name: 'Tyrannical',
    icon: '👑',
    color: '#ffd24a',
    blurb: 'Bosses hit and endure far harder.',
    counter: 'Save cooldowns for the boss. Trash is unchanged.',
    tier: 5,
    souls: 0.13,
    group: 'defence',
  },
  {
    id: 'grievous',
    name: 'Grievous',
    icon: '🗡',
    color: '#ff6f91',
    blurb: 'Wounds fester until you break away.',
    counter: 'Three seconds untouched clears it. Disengage, do not trade.',
    tier: 9,
    souls: 0.17,
    group: 'player',
  },
  {
    id: 'storming',
    name: 'Storming',
    icon: '⚡',
    color: '#ffe58a',
    blurb: 'Lightning lashes the arena.',
    counter: 'Never stand still. The ground telegraphs before it hits.',
    tier: 14,
    souls: 0.19,
    group: 'player',
  },
];

export const AFFIX_BY_ID = Object.fromEntries(AFFIXES.map((a) => [a.id, a]));

/**
 * How many affixes a wave carries. The ramp is deliberately slow: the first
 * ten waves are where a player learns their class, and a rule they have not
 * met yet reads as unfairness rather than depth. Higher difficulties start the
 * ramp earlier instead of adding raw numbers on top of it.
 */
export function affixCount(wave, diff = null) {
  const shift = diff ? (diff.id - 1) * 3 : 0;
  const w = wave + shift;
  if (w < 4) return 0;
  if (w < 12) return 1;
  if (w < 22) return 2;
  return 3;
}

/**
 * Deterministic per-run hash. Affixes must not change when the same wave is
 * re-entered or re-read by the HUD, and a player must not be able to reroll a
 * bad draw by pausing, so the roll is a pure function of (seed, wave).
 */
function hash(seed, wave, salt) {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ wave, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ salt, 0xc2b2ae35) >>> 0;
  h ^= h >>> 15;
  return h >>> 0;
}

/**
 * The affixes active on a wave, as full definitions. Boss waves keep whatever
 * they drew: a boss under Tyrannical + Volatile is the run's high point, and
 * stripping the rules for it would make the hardest wave the plainest one.
 */
export function affixesForWave(wave, seed = 0, diff = null) {
  const n = affixCount(wave, diff);
  if (n <= 0) return [];
  const pool = AFFIXES.filter((a) => wave >= a.tier);
  if (!pool.length) return [];

  const picked = [];
  const usedGroups = new Set();
  // Walk the pool in a per-wave rotated order rather than sampling with
  // replacement: a wave must never draw the same affix twice, and rotation
  // keeps consecutive waves from feeling like the same wave.
  for (let attempt = 0; attempt < pool.length && picked.length < n; attempt++) {
    const idx = hash(seed, wave, attempt) % pool.length;
    for (let probe = 0; probe < pool.length && picked.length < n; probe++) {
      const a = pool[(idx + probe) % pool.length];
      if (picked.includes(a) || usedGroups.has(a.group)) continue;
      picked.push(a);
      usedGroups.add(a.group);
      break;
    }
  }
  return picked;
}

/** Extra souls the wave pays for being played under its rules. */
export function affixSoulBonus(list) {
  let bonus = 0;
  for (const a of list) bonus += a.souls;
  return bonus;
}
