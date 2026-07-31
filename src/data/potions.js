// Potion drops.
//
// The problem they solve is that a wave is a flat line: you fight the same way
// at the start of it as at the end. A potion on the floor is a decision with a
// cost — it is somewhere other than where you are, and walking to it means
// walking into the pack or away from the fight you were winning.
//
// Three of them, colour-coded so they are readable at a glance across a busy
// arena, which is the only place they are ever read:
//
//   red    health, instantly
//   yellow damage, for a while
//   green  speed, for a while
//
// Health is instant and the other two are timed on purpose. An instant heal is
// worth grabbing when you are hurt and worth ignoring when you are not, so it
// is a judgement call every time; a timed buff you picked up at full health
// would just be a worse version of the same pickup.

export const POTIONS = [
  {
    id: 'health',
    name: 'Flask of Vigour',
    color: '#e0473c',
    glow: '#ff8a7a',
    // A share of max health rather than a flat number: a flat heal is the
    // whole bar at wave 1 and a rounding error at wave 40.
    heal: 0.32,
    duration: 0,
    weight: 44,
    blurb: 'Restores a third of your health.',
  },
  {
    id: 'damage',
    name: 'Draught of Fury',
    color: '#ffd24a',
    glow: '#fff0a8',
    damageBonus: 0.45,
    duration: 14,
    weight: 30,
    blurb: '+45% damage for 14s.',
  },
  {
    id: 'speed',
    name: 'Essence of Haste',
    color: '#7dff9d',
    glow: '#c8ffd8',
    moveSpeed: 0.30,
    attackSpeedBonus: 0.25,
    duration: 14,
    weight: 26,
    blurb: '+30% move and +25% attack speed for 14s.',
  },
];

export const POTION_BY_ID = Object.fromEntries(POTIONS.map((p) => [p.id, p]));

/**
 * How often an ordinary kill leaves something behind.
 *
 * Deliberately low. A potion that drops from every third enemy stops being a
 * decision and becomes part of the damage rotation; at one in fourteen it is
 * a thing that happens *to* a fight rather than a resource you plan around.
 * Elites and bosses are the exception — those are set-piece kills, and a
 * guaranteed reward is what makes them worth committing cooldowns to.
 */
export const DROP_CHANCE = 0.07;
export const ELITE_DROP_CHANCE = 0.35;
export const BOSS_DROPS = 3;

/** Seconds a dropped potion waits before it despawns. */
export const POTION_LIFETIME = 22;

/**
 * Pick a potion type. Health is the most common because it is the one that
 * answers the situation potions exist for — being in trouble.
 */
/**
 * How many of each potion you may carry into a run.
 *
 * A cap at all is the point. Without one, the Potion Shop turns every fight
 * into a resource the player already bought — you would never be in trouble,
 * only out of money, and the arena would stop being the thing that kills you.
 * Five is enough to survive a bad wave you would otherwise lose and not
 * enough to survive four of them.
 */
export const POTION_STACK = 5;

/**
 * What one costs, in gold, at a given character level.
 *
 * Two things are being balanced. A potion has to stay worth buying at level
 * 60, where it heals a third of a much larger health bar — so a flat price
 * would make late-game potions free in practice. And it has to stay *cheap*:
 * this is a consumable you restock between runs, not a purchase you save for.
 * A tier of armour costs 800 gold at its cheapest and 3.3 million at its
 * dearest; a full potion rack should never read as competing with that.
 *
 * So: a small base, growing about seven-fold across the sixty levels. In
 * practice a full restock of all three types lands near one good run's takings
 * at any level, which is the ratio that keeps it a habit rather than a saving.
 *
 * Health is the cheapest because it is the most common drop, and pricing it
 * above the buffs would make the shop disagree with the arena about what a
 * potion is worth.
 */
export const POTION_BASE_PRICE = { health: 50, damage: 85, speed: 75 };

export function potionPrice(potionId, level) {
  const base = POTION_BASE_PRICE[potionId] || 60;
  const lv = Math.max(1, Math.min(60, level | 0));
  return Math.round(base * (1 + (lv - 1) * 0.11));
}

export function rollPotion(random = Math.random) {
  let total = 0;
  for (const p of POTIONS) total += p.weight;
  let roll = random() * total;
  for (const p of POTIONS) {
    roll -= p.weight;
    if (roll <= 0) return p;
  }
  return POTIONS[0];
}
