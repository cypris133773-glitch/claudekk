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
// The second is the curve itself, and it is deliberately Classic-shaped: the
// first levels are an evening, the last ones are a project. Level 2 arrives in
// two runs, level 5 in ten, and level 60 in roughly five hundred — about 100
// hours. A level cap reached in a week is a level cap that stops mattering in
// a week; a hundred hours is a season.

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

// The curve. A gentle linear head (HEAD) keeps the opening levels quick, and
// the geometric term (GROWTH) is what turns the last ten into the grind the
// cap is supposed to be.
//
// GROWTH is the one dial that moves the whole thing, and it moves it a long
// way for a small change, because it compounds fifty-nine times. Measured
// against the real spawn budgets and a career that deepens as you level:
//
//   1.065 -> ~80 hours    1.070 -> ~97    1.075 -> ~117    1.088 -> ~197
//
// BASE and HEAD are what hold the opening anchors — level 2 in two runs,
// level 5 in ten — so retuning the length means touching GROWTH and nothing
// else.
const BASE = 1100;
const HEAD = 0.16;
const GROWTH = 1.071;

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
