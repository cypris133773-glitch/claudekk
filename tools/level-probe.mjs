#!/usr/bin/env node
/**
 * How long the road to 60 actually is, in hours.
 *
 *   node tools/level-probe.mjs
 *
 * A level curve is two numbers multiplied together — what a run pays and what
 * a level costs — and only the second one is written down anywhere. This
 * builds the first from the simulator's own measurements, so "60 in three
 * hours" is a claim that can be checked rather than a number in a comment.
 *
 * THE CAREER MODEL, AND WHY IT RUNS ON THE CLOCK
 *
 * The obvious model asks "how deep does a level-30 character get" and walks up
 * the levels. That model is wrong at every speed except the one it was written
 * for, and it is wrong in the flattering direction: shorten the curve and it
 * cheerfully assumes a player who hit 30 in twenty minutes is clearing wave
 * 29, which pays six times what they are really earning, which makes the
 * shortened curve look shorter still.
 *
 * How deep you get is not a function of your level. It is a function of your
 * gear, your Forge, your talents and your hands — all of which are bought with
 * time, not with levels. So this walks the *clock*: at each minute the model
 * knows how deep the player is getting from how long they have played, and the
 * level is whatever the XP they have banked says it is. Level 60 arrives when
 * it arrives.
 *
 * The anchors:
 *
 *   t = 0      wave 5, about 2.0 minutes a run. Both measured, on a fresh
 *              character with no permanent upgrades, by tools/balance-sim.js.
 *   later      depth grows with the square root of time played, because the
 *              things that buy depth — gear tiers, Forge levels — all cost
 *              more the more you have. Linear growth would have a player
 *              clearing wave 300 in a weekend.
 *
 * Every number here is an estimate and should be read as one. What it is good
 * for is ratios: if the model says the curve is forty times too long, it is
 * forty times too long, whatever the absolute hours turn out to be.
 */

import { xpForRun, xpToReach, xpToNext, MAX_LEVEL } from '../src/data/levels.js';

/** The deepest wave a player habitually clears after `hours` of play. */
const waveAfter = (hours) => 4 + 11 * Math.sqrt(Math.max(0, hours));

/** Seconds a wave takes, including the breath between waves. */
const waveSeconds = (w) => 18 + 1.2 * w;

/** Enemies killed clearing one wave. */
const waveKills = (w) => 4 + 1.4 * w;

/** One typical run at a given point in a career: what it pays and costs. */
function runAfter(hours) {
  const deepest = Math.max(1, Math.round(waveAfter(hours)));
  let seconds = 0, kills = 0;
  for (let w = 1; w <= deepest; w++) {
    seconds += waveSeconds(w);
    kills += waveKills(w);
  }
  const bossKills = Math.floor(deepest / 5);
  const eliteKills = Math.round(kills * 0.1);
  return {
    deepest,
    // Thirty seconds between runs: results, shop, choosing again.
    seconds: seconds + 30,
    xp: xpForRun({ wavesCleared: deepest, kills: Math.round(kills), eliteKills, bossKills }),
  };
}

/** Play until level 60, one run at a time. Returns the whole career. */
export function career() {
  let seconds = 0, xp = 0, runs = 0, level = 1;
  const marks = new Map([[1, 0]]);
  // A hard stop, because a curve long enough to never finish should report
  // that rather than spin.
  while (level < MAX_LEVEL && seconds < 3600 * 400) {
    const run = runAfter(seconds / 3600);
    seconds += run.seconds;
    xp += run.xp;
    runs++;
    while (level < MAX_LEVEL && xp >= xpToReach(level + 1)) {
      level++;
      if (!marks.has(level)) marks.set(level, seconds / 3600);
    }
  }
  return { hours: seconds / 3600, runs, level, marks };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const c = career();
  console.log('\nthe road to 60\n');
  console.log('   lv     reached at     xp for that level     wave by then');
  console.log('  ' + '-'.repeat(60));
  for (const lv of [2, 5, 10, 20, 30, 40, 50, 60]) {
    const at = c.marks.get(lv);
    if (at === undefined) continue;
    console.log('  '
      + String(lv).padStart(3)
      + (fmtTime(at)).padStart(15)
      + Math.round(xpToNext(lv - 1)).toLocaleString().padStart(22)
      + String(Math.round(waveAfter(at))).padStart(17));
  }
  console.log('  ' + '-'.repeat(60));
  if (c.level < MAX_LEVEL) {
    console.log(`\n  never reached 60 — stopped at ${c.level} after ${c.hours.toFixed(0)} hours\n`);
  } else {
    console.log(`\n  ${c.runs} runs, ${fmtTime(c.hours)} to level 60`);
    console.log(`  ${xpToReach(MAX_LEVEL).toLocaleString()} XP in total\n`);
  }
}

function fmtTime(hours) {
  const m = Math.round(hours * 60);
  return m < 90 ? `${m} min` : `${(m / 60).toFixed(1)} h`;
}
