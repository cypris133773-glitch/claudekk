// The mutable game. Every action a player can take is a function here, which
// keeps the UI layer a thin translation of clicks into calls — and lets the
// headless test drive a whole run without a browser.

import { STATIONS, stationById, MAX_LEVEL } from '../data/stations.js';
import { UPGRADES, upgradeById } from '../data/upgrades.js';
import { QUESTS, questsInChapter, CHAPTERS } from '../data/quests.js';
import * as E from './economy.js';

export const SAVE_VERSION = 1;
export const RESTAKE_CHAPTER = 3; // Restake opens once chapters 1-2 are done.

export function newState() {
  return {
    version: SAVE_VERSION,
    clock: 0, // seconds of game time; advanced by tick and by offline catch-up
    cash: 0,
    tshares: 0,
    sacrificePoints: 0,

    levels: {}, // stationId -> level
    cycles: {}, // stationId -> seconds elapsed in the current cycle
    active: {}, // stationId -> is a cycle currently running
    advisors: [], // stationIds that run themselves
    upgrades: [], // upgradeIds owned, permanent

    stakes: [],
    nextStakeId: 1,

    questsDone: [],
    chapter: 1,

    cash0: 0, // untouched: reserved so old saves stay loadable
    runEarned: 0,
    lifetimeEarned: 0,
    peakCash: 0,

    pumpUntil: -1,
    pumpReadyAt: 0,

    stats: {
      taps: 0,
      pumps: 0,
      stakesClaimed: 0,
      restakes: 0,
      playTime: 0,
    },

    lastSeen: Date.now(),
  };
}

function earn(state, amount) {
  if (!(amount > 0)) return;
  state.cash += amount;
  state.runEarned += amount;
  state.lifetimeEarned += amount;
  if (state.cash > state.peakCash) state.peakCash = state.cash;
}

// --- the tick --------------------------------------------------------------

// Returns the payouts that landed this tick so the scene can throw a number
// into the air for each one. Nothing else reads the return value.
export function tick(state, dt) {
  if (!(dt > 0)) return [];
  state.clock += dt;
  state.stats.playTime += dt;
  const payouts = [];

  for (const st of STATIONS) {
    const level = state.levels[st.id] || 0;
    if (level <= 0) continue;
    const automated = state.advisors.includes(st.id);
    if (automated) state.active[st.id] = true;
    if (!state.active[st.id]) continue;

    const time = E.cycleTime(st, level);
    let elapsed = (state.cycles[st.id] || 0) + dt;

    if (elapsed < time) {
      state.cycles[st.id] = elapsed;
      continue;
    }

    // A long offline catch-up or a very fast station can clear thousands of
    // cycles in one tick, so pay them in one arithmetic step rather than in a
    // loop that could run for minutes.
    const cycles = Math.floor(elapsed / time);
    const paid = E.cycleRevenue(state, st) * cycles;
    earn(state, paid);
    payouts.push({ id: st.id, amount: paid });

    if (automated) {
      state.cycles[st.id] = elapsed % time;
    } else {
      // Hand-run stations stop dead at the end of one cycle. That gap is
      // exactly what an advisor is sold to remove.
      state.cycles[st.id] = 0;
      state.active[st.id] = false;
    }
  }

  matureStakes(state);
  return payouts;
}

// Time passed while the tab was shut. Automated income is paid up to the cap;
// the clock itself always advances in full, so stakes mature in real time even
// when the earnings cap has long since been hit.
export function applyOffline(state, elapsedSeconds) {
  if (!(elapsedSeconds > 0)) return { seconds: 0, earned: 0 };
  const cap = E.offlineCapHours(state) * 3600;
  const paidSeconds = Math.min(elapsedSeconds, cap);
  const earned = E.incomePerSecond(state) * paidSeconds;
  earn(state, earned);
  state.clock += elapsedSeconds;
  matureStakes(state);
  return { seconds: elapsedSeconds, earned, capped: elapsedSeconds > cap };
}

// --- stations --------------------------------------------------------------

export function buyStation(state, id, mode) {
  const st = stationById(id);
  if (!st) return 0;
  const owned = state.levels[id] || 0;
  let count = E.buyCount(st, owned, state.cash, mode);
  if (count <= 0) return 0;
  let cost = E.costOf(st, owned, count);
  // A fixed-size buy you cannot afford buys nothing, the same as every other
  // game in the genre — the button is disabled, this is just the backstop.
  if (cost > state.cash) {
    count = E.affordable(st, owned, state.cash);
    if (count <= 0) return 0;
    cost = E.costOf(st, owned, count);
  }
  state.cash -= cost;
  state.levels[id] = owned + count;
  if (owned === 0) {
    state.cycles[id] = 0;
    state.active[id] = state.advisors.includes(id);
  }
  return count;
}

export function hireAdvisor(state, id) {
  const st = stationById(id);
  if (!st || state.advisors.includes(id)) return false;
  if (state.cash < st.advisor.cost) return false;
  state.cash -= st.advisor.cost;
  state.advisors.push(id);
  state.active[id] = (state.levels[id] || 0) > 0;
  return true;
}

// One tap: pays a flat cut of the empire, and kicks every hand-run station
// into motion. That second half is the whole reason to tap once you are rich.
export function tap(state) {
  const value = E.clickValue(state);
  earn(state, value);
  state.stats.taps++;
  for (const st of STATIONS) {
    if ((state.levels[st.id] || 0) <= 0) continue;
    if (state.advisors.includes(st.id)) continue;
    if (!state.active[st.id]) {
      state.active[st.id] = true;
      state.cycles[st.id] = 0;
    }
  }
  return value;
}

// --- upgrades --------------------------------------------------------------

export function buyUpgrade(state, id) {
  const u = upgradeById(id);
  if (!u || state.upgrades.includes(id)) return false;
  if (state.tshares < u.cost) return false;
  state.tshares -= u.cost;
  state.upgrades.push(id);
  return true;
}

// --- pump ------------------------------------------------------------------

export function pumpReady(state) {
  return state.clock >= state.pumpReadyAt && state.pumpUntil <= state.clock;
}

export function startPump(state) {
  if (!pumpReady(state)) return false;
  state.pumpUntil = state.clock + E.pumpDuration(state);
  state.pumpReadyAt = state.pumpUntil + E.PUMP_COOLDOWN;
  state.stats.pumps++;
  return true;
}

// --- stakes ----------------------------------------------------------------

export function openStake(state, amount, termId) {
  const term = E.STAKE_TERMS.find((t) => t.id === termId);
  if (!term) return null;
  if (!(amount > 0) || amount > state.cash) return null;
  const price = E.sharePrice(state);
  const stake = {
    id: state.nextStakeId++,
    principal: amount,
    price,
    term: term.id,
    tshares: E.stakeYield(amount, price, term),
    start: state.clock,
    end: state.clock + term.seconds,
    matured: false,
  };
  state.cash -= amount;
  state.stakes.push(stake);
  return stake;
}

function matureStakes(state) {
  for (const s of state.stakes) {
    if (!s.matured && state.clock >= s.end) s.matured = true;
  }
}

export function claimStake(state, stakeId) {
  const i = state.stakes.findIndex((s) => s.id === stakeId);
  if (i < 0) return null;
  const s = state.stakes[i];
  if (!s.matured) return null;
  state.stakes.splice(i, 1);
  earn(state, s.principal);
  state.tshares += s.tshares;
  state.stats.stakesClaimed++;
  return s;
}

export function endStakeEarly(state, stakeId) {
  const i = state.stakes.findIndex((s) => s.id === stakeId);
  if (i < 0) return null;
  const s = state.stakes[i];
  if (s.matured) return claimStake(state, stakeId);
  const penalty = E.earlyEndPenalty(s, state.clock);
  state.stakes.splice(i, 1);
  earn(state, Math.max(0, s.principal - penalty));
  return { ...s, penalty, tshares: 0 };
}

// --- quests ----------------------------------------------------------------

export function questProgress(state, quest) {
  const { have, need } = quest.probe(state);
  return { have, need, done: state.questsDone.includes(quest.id) || have >= need };
}

// Called once a second rather than every frame: the probes walk arrays and
// nothing in here can complete between two frames anyway.
export function checkQuests(state) {
  const finished = [];
  for (const q of QUESTS) {
    if (state.questsDone.includes(q.id)) continue;
    if (q.chapter > state.chapter) continue;
    const { have, need } = q.probe(state);
    if (have >= need) {
      state.questsDone.push(q.id);
      state.tshares += q.reward;
      finished.push(q);
    }
  }
  // Chapters advance when every quest in the current one is signed off.
  while (state.chapter < CHAPTERS.length) {
    const all = questsInChapter(state.chapter);
    if (all.every((q) => state.questsDone.includes(q.id))) state.chapter++;
    else break;
  }
  return finished;
}

export function chapterComplete(state, n) {
  return questsInChapter(n).every((q) => state.questsDone.includes(q.id));
}

// --- restake ---------------------------------------------------------------

export function canRestake(state) {
  return state.chapter >= RESTAKE_CHAPTER && E.pendingSacrifice(state) > 0;
}

// Wipes the run and keeps everything that was bought with time rather than
// cash. Open stakes are paid out in full first — losing them to a reset you
// chose to press would be a trap, and traps are not funny twice.
export function restake(state) {
  if (!canRestake(state)) return null;
  const gained = E.pendingSacrifice(state);
  let stakeYield = 0;
  for (const s of state.stakes) stakeYield += s.tshares;
  state.tshares += stakeYield;
  state.stakes = [];

  state.sacrificePoints += gained;
  state.cash = 0;
  state.levels = {};
  state.cycles = {};
  state.active = {};
  state.advisors = [];
  state.runEarned = 0;
  state.pumpUntil = -1;
  state.pumpReadyAt = state.clock;
  state.stats.restakes++;
  return { gained, stakeYield };
}

export { STATIONS, UPGRADES, QUESTS, CHAPTERS, MAX_LEVEL };
