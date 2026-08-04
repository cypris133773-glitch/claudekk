// Pure functions over a state object. Nothing in here mutates, nothing in here
// touches the DOM — which is what lets tools/test.js run the whole economy in
// node with no browser.

import {
  STATIONS,
  PROFIT_MILESTONES,
  SPEED_MILESTONES,
  MAX_LEVEL,
} from '../data/stations.js';
import { UPGRADES, upgradeById } from '../data/upgrades.js';

export const BASE_OFFLINE_HOURS = 2;
export const PUMP_SECONDS = 30;
export const PUMP_COOLDOWN = 180;

// --- costs -----------------------------------------------------------------

// Levels are priced as a geometric series, so buying ten at once costs exactly
// what buying ten in a row would. Anything else and players notice instantly.
export function costOf(station, ownedLevel, count) {
  if (count <= 0) return 0;
  const g = station.growth;
  const first = station.cost * Math.pow(g, ownedLevel);
  return (first * (Math.pow(g, count) - 1)) / (g - 1);
}

// The inverse: how many levels does `cash` buy? Solved rather than looped,
// because at 1.07 growth a MAX buy near level 900 is a lot of iterations.
export function affordable(station, ownedLevel, cash) {
  if (cash < costOf(station, ownedLevel, 1)) return 0;
  const g = station.growth;
  const first = station.cost * Math.pow(g, ownedLevel);
  const n = Math.log((cash * (g - 1)) / first + 1) / Math.log(g);
  const capped = Math.min(Math.floor(n), MAX_LEVEL - ownedLevel);
  return Math.max(0, capped);
}

// How many levels a given buy-mode actually buys — clamped by the level cap so
// the button never offers to sell you level 1001.
export function buyCount(station, ownedLevel, cash, mode) {
  const room = MAX_LEVEL - ownedLevel;
  if (room <= 0) return 0;
  if (mode === 'max') return affordable(station, ownedLevel, cash);
  return Math.min(mode, room);
}

// --- multipliers -----------------------------------------------------------

function countAtOrBelow(list, level) {
  let n = 0;
  for (const m of list) if (level >= m) n++;
  return n;
}

export function profitMult(level) {
  return Math.pow(2, countAtOrBelow(PROFIT_MILESTONES, level));
}

export function speedMult(level) {
  return Math.pow(2, countAtOrBelow(SPEED_MILESTONES, level));
}

export function nextMilestone(level) {
  for (const m of PROFIT_MILESTONES) if (level < m) return { at: m, kind: 'profit' };
  return null;
}

// Sacrifice Points are the prestige currency: flat, additive, and always worth
// having, which is what makes a Restake feel like a gain rather than a reset.
export function sacrificeMult(state) {
  return 1 + 0.02 * state.sacrificePoints;
}

export function upgradeMult(state, kind, target) {
  let m = 1;
  for (const id of state.upgrades) {
    const u = upgradeById(id);
    if (!u || u.kind !== kind) continue;
    if (kind === 'station' && u.target !== target) continue;
    m *= u.value;
  }
  return m;
}

export function upgradeSum(state, kind) {
  let sum = 0;
  for (const id of state.upgrades) {
    const u = upgradeById(id);
    if (u && u.kind === kind) sum += u.value;
  }
  return sum;
}

export function pumpMult(state) {
  if (state.pumpUntil <= state.clock) return 1;
  // Two Pump upgrades exist: one lengthens it, one deepens it. Only the
  // deepening one changes the multiplier, and we take the best rather than
  // stacking, so buying both is an upgrade and not a squaring.
  let best = 2;
  for (const id of state.upgrades) {
    const u = upgradeById(id);
    if (u && u.kind === 'pump' && u.value > best) best = u.value;
  }
  return best;
}

export function pumpDuration(state) {
  const long = state.upgrades.includes('megaphone') ? 2 : 1;
  return PUMP_SECONDS * long;
}

export function globalMult(state) {
  return upgradeMult(state, 'global') * sacrificeMult(state) * pumpMult(state);
}

export function offlineCapHours(state) {
  return BASE_OFFLINE_HOURS + upgradeSum(state, 'offline');
}

export function clickMult(state) {
  return upgradeMult(state, 'click');
}

// --- station output --------------------------------------------------------

export function cycleTime(station, level) {
  // A floor of 50ms: below that the bar is a strobe and the tick loop starts
  // paying more in loop overhead than the station pays in cash.
  return Math.max(0.05, station.time / speedMult(level));
}

export function cycleRevenue(state, station) {
  const level = state.levels[station.id] || 0;
  if (level <= 0) return 0;
  return (
    station.revenue *
    level *
    profitMult(level) *
    upgradeMult(state, 'station', station.id) *
    globalMult(state)
  );
}

export function stationPerSecond(state, station) {
  const level = state.levels[station.id] || 0;
  if (level <= 0) return 0;
  return cycleRevenue(state, station) / cycleTime(station, level);
}

// Only automated stations count: an un-automated station earns nothing unless
// a finger is involved, and showing it in $/sec would be a lie the player
// notices the first time they put the phone down.
export function incomePerSecond(state) {
  let total = 0;
  for (const s of STATIONS) {
    if (state.advisors.includes(s.id)) total += stationPerSecond(state, s);
  }
  return total;
}

// What one tap pays. Scales with the empire so tapping never becomes literally
// pointless, but stays far below just waiting, so it never becomes mandatory.
export function clickValue(state) {
  const idle = incomePerSecond(state);
  const floor = 1 * globalMult(state);
  return Math.max(floor, idle * 0.25) * clickMult(state);
}

// --- prestige --------------------------------------------------------------

// The classic square-root curve: the first Restake is cheap, the tenth needs a
// hundred times the empire. Divisor is tuned so chapter 4 hands you ~40 SP.
export function pendingSacrifice(state) {
  const sp = 150 * Math.sqrt(state.runEarned / 1e12);
  return Math.max(0, Math.floor(sp) - state.sacrificePoints);
}

// --- stakes ----------------------------------------------------------------

export const STAKE_TERMS = [
  { id: 'short', label: '1 min', seconds: 60, bonus: 1 },
  { id: 'mid', label: '10 min', seconds: 600, bonus: 1.8 },
  { id: 'long', label: '1 hour', seconds: 3600, bonus: 3 },
];

// Share price is frozen at open and tracks the biggest bank you have ever had,
// so a stake opened when you were poor cannot be cashed in when you are rich.
// It is also the reason T-Shares stay scarce across a whole run.
export function sharePrice(state) {
  return Math.max(1e4, state.peakCash / 20);
}

export function stakeYield(principal, price, term) {
  if (principal <= 0) return 0;
  const base = principal / price;
  // Bigger pays better, but with a hard ceiling — otherwise one enormous stake
  // out-earns every sensible one and the panel collapses to a single button.
  const size = 1 + Math.min(0.2, base / 500);
  return base * term.bonus * size;
}

export function stakeProgress(stake, clock) {
  const span = stake.end - stake.start;
  if (span <= 0) return 1;
  return Math.min(1, (clock - stake.start) / span);
}

// Ending early burns the yield and takes a bite of the principal. This is the
// one place the game is deliberately unkind, and it is signposted everywhere.
export function earlyEndPenalty(stake, clock) {
  const p = stakeProgress(stake, clock);
  return stake.principal * 0.5 * (1 - p);
}

export { STATIONS, UPGRADES };
