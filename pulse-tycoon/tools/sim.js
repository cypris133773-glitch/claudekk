// Balance simulation. Plays the game with a plausible-but-dumb strategy and
// prints when each thing first happens, so a tuning change can be judged
// against a timeline instead of a feeling.
//
//   node tools/sim.js [hours]

import * as G from '../src/game/state.js';
import * as E from '../src/game/economy.js';
import { STATIONS } from '../src/data/stations.js';
import { money, fmt, duration } from '../src/core/format.js';

const HOURS = Number(process.argv[2]) || 6;
const DT = 0.25;
const STEPS = Math.round((HOURS * 3600) / DT);

const s = G.newState();
const log = [];
const seen = new Set();

function note(key, text) {
  if (seen.has(key)) return;
  seen.add(key);
  log.push({ at: s.clock, text });
}

for (let step = 0; step < STEPS; step++) {
  G.tick(s, DT);

  // Tap twice a second for the first hour, then assume the player has found
  // something better to do with their thumb.
  if (s.clock < 3600 && step % 2 === 0) G.tap(s);

  // Buy the deepest affordable rung, keeping a 2x buffer. Hire any advisor in
  // reach — automation is always the better purchase in this genre.
  for (let i = STATIONS.length - 1; i >= 0; i--) {
    const st = STATIONS[i];
    const prev = i === 0 ? 1 : s.levels[STATIONS[i - 1].id] || 0;
    if (!prev) continue;
    const level = s.levels[st.id] || 0;
    if (level > 0 && !s.advisors.includes(st.id) && s.cash >= st.advisor.cost) {
      G.hireAdvisor(s, st.id);
      note('advisor:' + st.id, 'hired ' + st.advisor.name + ' (' + st.name + ')');
    }
    if (s.cash >= E.costOf(st, level, 1) * 2) {
      G.buyStation(s, st.id, 1);
      if (level === 0) note('open:' + st.id, 'opened ' + st.name);
      break;
    }
  }

  // Stake a quarter of the bank whenever nothing is locked up.
  if (!s.stakes.length && s.cash > 1e5) {
    const st = G.openStake(s, s.cash * 0.25, 'mid');
    if (st) note('stake', 'first stake: ' + money(st.principal) + ' → ' + fmt(st.tshares) + ' TS');
  }
  for (const stake of [...s.stakes]) {
    if (stake.matured) G.claimStake(s, stake.id);
  }

  if (G.pumpReady(s) && s.clock > 60) G.startPump(s);

  // Spend T-Shares as soon as they cover the cheapest thing not yet owned.
  for (const u of E.UPGRADES) {
    if (s.upgrades.includes(u.id) || s.tshares < u.cost) continue;
    G.buyUpgrade(s, u.id);
    note('perk:' + u.id, 'bought perk: ' + u.name);
    break;
  }

  if (step % 4 === 0) {
    const before = s.chapter;
    G.checkQuests(s);
    if (s.chapter !== before) note('chapter:' + s.chapter, 'reached chapter ' + s.chapter);
    if (G.canRestake(s)) note('restake', 'Restake became available (+' + E.pendingSacrifice(s) + ' SP)');
  }

  for (const mark of [1e6, 1e9, 1e12, 1e15]) {
    if (s.runEarned >= mark) note('earn:' + mark, 'earned ' + money(mark) + ' total');
  }
}

console.log(`\nPULSE TYCOON — ${HOURS}h simulation\n`);
for (const e of log) console.log('  ' + duration(e.at).padStart(9) + '   ' + e.text);

console.log('\n  ' + 'final'.padStart(9) + '   ' + money(s.cash) + ' banked, ' + money(E.incomePerSecond(s)) + '/s');
console.log('  ' + ''.padStart(9) + '   ' + fmt(s.tshares) + ' T-Shares, ' + s.upgrades.length + ' perks, chapter ' + s.chapter);
console.log('  ' + ''.padStart(9) + '   levels: ' + STATIONS.map((x) => (s.levels[x.id] || 0)).join('/'));
console.log();
