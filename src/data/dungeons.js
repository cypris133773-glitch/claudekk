// Dungeons: three rooms, a key, and a clock.
//
// WHAT THIS IS FOR, AND WHY IT IS NOT A SHORTER RAID
//
// The arena is an endless wave that comes to you. A raid is one boss in one
// room. Between them there was nothing that asked the question every dungeon in
// every RPG asks, which is: *how do you want to take this fight?*
//
// A dungeon answers that by never spawning anything at you. Every pack is
// already standing in the room when you walk in, asleep, with a leash. You
// choose which one to wake, from which side, and whether to take the two beside
// each other separately or together. Pulling well is the skill, and it is a
// skill the arena cannot teach because the arena decides for you.
//
// Three things make that a mode rather than a room full of idle mobs:
//
//   THE KEY     one pack in the middle room is carrying it, and the door to
//               the boss will not open without it. You do not know which pack
//               until it drops, so the room has to be cleared rather than run
//               past — but you also cannot skip to the boss, which is what
//               makes the trash matter at all.
//   THE ROUTE   the first and second rooms can be taken in either order, and
//               they are not the same shape. One is wide and open with big
//               packs; the other is tight with more, smaller ones. The order
//               is a real choice because your cooldowns do not reset between
//               rooms.
//   THE CLOCK   a par time, and a grade. Not a fail state — running out of
//               time costs you a letter, never the run — because a dungeon
//               that ejects you at zero is a dungeon nobody learning it can
//               finish.
//
// WHY THE TIMER GRADES INSTEAD OF FAILING
//
// The obvious design is a hard timer: beat it or wipe. It is also the design
// that makes a new player's first ten attempts worthless, and this game has one
// player at a time with no group to carry them. A grade keeps the pressure
// entirely intact — you can see the letter slipping while you fight — and lets
// somebody who is slow still finish, still get paid, and still learn the route.
// S is for people optimising. C is for people finishing. Both are playing.

import { GEAR_SLOT_IDS } from './armor.js';

/** Seconds added to par for each room, so a longer dungeon is not a harsher one. */
export const PAR_PER_ROOM = 95;

/**
 * The grades, best first. `mult` is what the run pays relative to par.
 *
 * The spread is deliberately narrow — 1.0x to 1.6x rather than 1x to 5x.
 * A grade should be something to chase, not something that makes every run
 * below it a waste of the time you just spent.
 */
export const GRADES = [
  { id: 'S', name: 'S', frac: 0.60, mult: 1.60, color: '#ffd24a', blurb: 'Nothing wasted.' },
  { id: 'A', name: 'A', frac: 0.80, mult: 1.35, color: '#7dffb0', blurb: 'Clean.' },
  { id: 'B', name: 'B', frac: 1.00, mult: 1.15, color: '#6ec8ff', blurb: 'Inside the time.' },
  { id: 'C', name: 'C', frac: 1.40, mult: 1.00, color: '#cfd6e6', blurb: 'Finished.' },
  { id: 'D', name: 'D', frac: Infinity, mult: 0.85, color: '#8b93a5', blurb: 'Slow, but done.' },
];

/**
 * The grade a finishing time earns.
 *
 * Takes the elapsed time and the par rather than a fraction, because the
 * caller having to do that division is how a UI and a payout end up disagreeing
 * about what somebody just got.
 */
export function gradeFor(seconds, par) {
  const f = seconds / Math.max(1, par);
  for (const g of GRADES) if (f <= g.frac) return g;
  return GRADES[GRADES.length - 1];
}

/**
 * Room shapes. Each is a hand-placed arrangement rather than a random one,
 * because the whole mode is about learning a route and you cannot learn a
 * route that is different every time.
 *
 *   packs   where the sleeping groups stand, as offsets from the room centre,
 *           with what is in them. `mix` is a list of mob type ids; `elite`
 *           promotes one member.
 *   open    how wide the room is. Not decoration: a wide room lets you pull a
 *           pack backwards away from its neighbour, and a tight one does not,
 *           which is the entire difference between the two side rooms.
 */
export const ROOM_SHAPES = {
  hall: {
    name: 'The Long Hall',
    blurb: 'Wide and open. Big packs, and room to drag them apart.',
    open: 15,
    packs: [
      { at: [-7, -6], mix: ['husk', 'husk', 'skele'], elite: false },
      { at: [8, -5], mix: ['husk', 'crawler', 'crawler'], elite: false },
      { at: [-6, 7], mix: ['bulwark', 'husk', 'husk', 'skele'], elite: true },
      { at: [7, 8], mix: ['brute', 'crawler', 'crawler'], elite: false },
    ],
  },
  warren: {
    name: 'The Warren',
    blurb: 'Tight and close. More packs, smaller, and nowhere to back into.',
    open: 10,
    packs: [
      { at: [-5, -5], mix: ['crawler', 'crawler'], elite: false },
      { at: [5, -5], mix: ['husk', 'skele'], elite: false },
      { at: [0, -8], mix: ['stalker', 'crawler'], elite: false },
      { at: [-5, 5], mix: ['husk', 'husk'], elite: false },
      { at: [5, 6], mix: ['lancer', 'skele'], elite: true },
      { at: [0, 9], mix: ['crawler', 'crawler', 'husk'], elite: false },
    ],
  },
  gallery: {
    name: 'The Gallery',
    blurb: 'A long room with pillars. Line of sight is the whole problem.',
    open: 13,
    packs: [
      { at: [-8, -7], mix: ['skele', 'skele', 'husk'], elite: false },
      { at: [8, -7], mix: ['hexer', 'husk'], elite: false },
      { at: [0, 0], mix: ['bulwark', 'bulwark'], elite: false },
      { at: [-8, 8], mix: ['stalker', 'stalker', 'crawler'], elite: true },
      { at: [8, 8], mix: ['husk', 'skele'], elite: false },
    ],
  },
  vault: {
    name: 'The Vault',
    blurb: 'One of these packs is carrying the key. Clear it to find out which.',
    open: 13,
    packs: [
      { at: [-6, -6], mix: ['bulwark', 'skele', 'husk'], elite: false },
      { at: [7, -6], mix: ['hexer', 'husk', 'husk'], elite: false },
      { at: [-7, 6], mix: ['brute', 'crawler', 'crawler'], elite: false },
      { at: [6, 7], mix: ['leech', 'skele', 'husk'], elite: true },
    ],
  },
};

/**
 * The dungeons, one per gear tier from 1 to 5.
 *
 * Deliberately not one per tier all the way to 6. Tier 0 is the first hour of
 * the game and does not need a third mode in it, and tier 6 is the endgame
 * chase where the raid should be the thing you are running. Dungeons sit in
 * the middle, which is exactly where a player has a class figured out and
 * nothing new to do with it.
 *
 * `tier` is the gear tier this dungeon pays toward — a clear grants gold and a
 * chance at that tier's Core, so a dungeon is a second route to the same
 * permission a raid gives. That matters for anyone stuck on one raid boss:
 * being blocked should never mean having nowhere to go.
 */
export const DUNGEONS = [
  {
    id: 'sunken', name: 'The Sunken Ward', tier: 1, level: 12, theme: 2,
    blurb: 'Flooded cells under the old keep. Something down here never left.',
    rooms: ['hall', 'warren', 'vault'],
    boss: { type: 'colossus', name: 'Wardenmaster Gruul', power: 1.15 },
  },
  {
    id: 'spire', name: 'Ashen Spire', tier: 2, level: 22, theme: 0,
    blurb: 'A tower that burned and kept standing. The stairs still glow.',
    rooms: ['warren', 'gallery', 'vault'],
    boss: { type: 'warden', name: 'Emberwarden Kaal', power: 1.25 },
  },
  {
    id: 'hollow', name: 'The Hollow Reach', tier: 3, level: 32, theme: 3,
    blurb: 'A hole in the world with a nest at the bottom of it.',
    rooms: ['gallery', 'hall', 'vault'],
    boss: { type: 'broodmother', name: 'The Reachmother', power: 1.35 },
  },
  {
    id: 'foundry', name: 'The Black Foundry', tier: 4, level: 42, theme: 1,
    blurb: 'They were making something here, and it is still being made.',
    rooms: ['warren', 'hall', 'vault'],
    boss: { type: 'colossus', name: 'Forgelord Vashk', power: 1.5 },
  },
  {
    id: 'throne', name: 'The Drowned Throne', tier: 5, level: 52, theme: 2,
    blurb: 'The last king sat down here and never got back up.',
    rooms: ['gallery', 'warren', 'vault'],
    boss: { type: 'warden', name: 'The Drowned King', power: 1.7 },
  },
];

export const DUNGEON_BY_ID = Object.fromEntries(DUNGEONS.map((d) => [d.id, d]));

/** Par time for a dungeon, in seconds. */
export function parFor(dungeon) {
  return dungeon.rooms.length * PAR_PER_ROOM;
}

/**
 * Which room holds the key. Always the last one, and always the vault shape.
 *
 * The route choice is between the first two rooms; a key in either of those
 * would make one order strictly better than the other, which is not a choice.
 * Asserted in the smoke test rather than trusted, because a data edit that
 * moved a vault would quietly delete the mode's only decision.
 */
export function keyRoomIndex(dungeon) {
  return dungeon.rooms.length - 1;
}

/**
 * Whether a class may enter, and if not, why.
 *
 * One gate only: character level. Deliberately not gated on the previous
 * dungeon or on wearing a set, the way raids are — a raid is a ladder because
 * its Cores are the only route to the next tier, and a second ladder to the
 * same place would just be the first one again with more steps.
 */
export function dungeonAccess(dungeon, { level }) {
  if (level < dungeon.level) {
    return { ok: false, reason: `Requires level ${dungeon.level} — you are ${level}.` };
  }
  return { ok: true, reason: '' };
}

/** Gold a clear pays, before the grade multiplier. */
export function clearGold(dungeon) {
  return Math.round(900 * Math.pow(2.6, dungeon.tier - 1));
}

/**
 * The Core a clear can drop, or null.
 *
 * A dungeon drops one random slot from its tier rather than a fixed one, so it
 * complements the raid ladder — where each boss always drops the same slot —
 * instead of replacing it.
 *
 * Named `dungeonCoreSlot` rather than `coreSlotFor` because raids.js already
 * exports a `coreSlotFor` that takes a boss index. Two functions with one name
 * and different arguments is a bug waiting for whoever imports both.
 */
export function dungeonCoreSlot(dungeon, roll) {
  const r = roll === undefined ? Math.random() : roll;
  return GEAR_SLOT_IDS[Math.floor(r * GEAR_SLOT_IDS.length) % GEAR_SLOT_IDS.length];
}
