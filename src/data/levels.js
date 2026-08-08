// Character levels, 1 to 60, earned by killing things.
//
// Two numbers decide everything here, and they pull against each other.
//
// The first is how much XP a run is worth. A run to wave 5 and a run to wave
// 55 are the same activity, but the deep one kills forty times as many enemies
// — and if a kill's XP also scaled with the wave it came from, a strong
// player's run would be worth 123x a new player's. No level curve survives
// that: whatever is a month of grinding for one player is an evening for the
// other. So kills pay a flat rate and the bulk of a run's XP comes from
// clearing waves, which brings the spread down to about 48x. That is a gap a
// curve can actually hold.
//
// The second is the curve itself, and it is now short on purpose: level 2 in
// one run, level 10 inside ten minutes, and level 60 in about three hours of
// play. Measured, not asserted — `node tools/level-probe.mjs` walks a whole
// career on the clock and prints where each level lands.
//
// WHY THE CAP MOVED FROM A HUNDRED HOURS TO THREE
//
// Because the level was gating the wrong thing. Thirteen skills unlock across
// the sixty levels, and a curve that took a hundred hours meant most players
// would never see half of their own class — the last four skills sat behind
// levels 41, 48, 54 and 60, which is to say behind weeks. A class you have not
// finished meeting is a class you cannot have an opinion about.
//
// What is long in this game is not meant to be the level. It is the gear, the
// Forge, the Armoury sets and Mastery, all of which are bought with gold and
// all of which are uncapped. Levels are the ramp that hands you your kit; the
// game is what you do with it afterwards.
//
// One consequence, stated plainly because it is permanent: every existing
// character jumps forward the first time this build loads, because their
// banked XP now buys far more. Nobody loses anything — XP is only ever added
// — but a character who was level 30 last night is likely 60 this morning.

/** XP for one ordinary kill. Flat, and flat on purpose — see above. */
export const XP_PER_KILL = 2;
/** Elites and bosses are worth more per kill, but there are far fewer of them. */
export const XP_ELITE_MULT = 4;
export const XP_BOSS_MULT = 20;

/** XP for surviving a wave. This is where most of a run's XP comes from. */
export function xpForWave(wave) {
  return 50 + 6 * wave;
}

export const MAX_LEVEL = 60;

// The curve.
//
//   BASE    what the first level costs, and therefore the scale of the whole
//           thing. This is the dial that sets the length: the road to 60 is
//           very close to linear in it.
//   HEAD    a linear ramp, and where nearly all of the shape comes from. At
//           0.16 the last level costs about ten times the first, which is the
//           whole "later levels are longer" effect — no exponent required.
//   GROWTH  a small geometric term on top, so the final stretch tightens
//           rather than staying perfectly straight. Kept near 1 deliberately;
//           it compounds fifty-nine times and a third decimal place here is
//           worth more than a doubling of BASE.
//
// The measured result of these three, from tools/level-probe.mjs:
//
//   lv 2   2 min      lv 20   25 min      lv 50   2.2 h
//   lv 5   5 min      lv 30   54 min      lv 60   3.2 h
//
// Worth knowing before touching these: the curve was not the only thing that
// was too long, and past a point it is not the binding constraint at all.
// Even a completely flat curve could not deliver 60 in three hours until BASE
// came down — what a run pays is the other half of the equation, and at these
// speeds it is the half that dominates.
const BASE = 120;
const HEAD = 0.16;
const GROWTH = 1.008;

/**
 * XP needed to go from `level` to `level + 1`. Returns Infinity at the cap, so
 * every "have I got enough" test naturally answers no once you are maxed.
 */
export function xpToNext(level) {
  if (level >= MAX_LEVEL) return Infinity;
  return Math.round(BASE * (1 + (level - 1) * HEAD) * Math.pow(GROWTH, level - 1));
}

/** Total XP to have reached `level` from scratch. Cached: it is called a lot. */
const totals = [0, 0];
export function xpToReach(level) {
  const L = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  while (totals.length <= L) totals.push(totals[totals.length - 1] + xpToNext(totals.length - 1));
  return totals[L];
}

/** The level a total XP figure buys. */
export function levelFromXp(xp) {
  const total = Math.max(0, xp || 0);
  let L = 1;
  while (L < MAX_LEVEL && total >= xpToReach(L + 1)) L++;
  return L;
}

/**
 * Everything the UI needs about a class's progress, in one call — level, how
 * far into it, and the two raw numbers, because a bar with no numbers under it
 * is a bar nobody trusts.
 */
export function levelProgress(xp) {
  const total = Math.max(0, xp || 0);
  const level = levelFromXp(total);
  if (level >= MAX_LEVEL) {
    return { level, into: 0, need: 0, frac: 1, maxed: true, total };
  }
  const floor = xpToReach(level);
  const need = xpToNext(level);
  const into = total - floor;
  return { level, into, need, frac: Math.max(0, Math.min(1, into / need)), maxed: false, total };
}

/**
 * Talent points a level buys: one per level after the first, so 59 at the cap.
 *
 * A full tree costs far more than 59, and that is the design — you commit to a
 * specialisation rather than eventually owning everything. A cap that lets you
 * fill every branch turns the tree into a waiting room.
 */
export function talentPointsForLevel(level) {
  return Math.max(0, Math.min(MAX_LEVEL, level) - 1);
}

/**
 * XP a finished run was worth.
 *
 * `wavesCleared` is what was actually survived, not what was reached: dying on
 * wave 12 pays for eleven waves. Otherwise the optimal play is to walk into a
 * wave and die, which is not a strategy anyone should be rewarded for.
 */
export function xpForRun({ wavesCleared = 0, kills = 0, eliteKills = 0, bossKills = 0 }) {
  let xp = 0;
  for (let w = 1; w <= wavesCleared; w++) xp += xpForWave(w);
  // Elite and boss kills are also counted in `kills`, so the multipliers here
  // are the *extra* on top of the flat rate they already earned.
  xp += kills * XP_PER_KILL;
  xp += eliteKills * XP_PER_KILL * (XP_ELITE_MULT - 1);
  xp += bossKills * XP_PER_KILL * (XP_BOSS_MULT - 1);
  return Math.round(xp);
}
