// Logic checks with no browser involved. Everything under src/game and
// src/core is deliberately DOM-free so this file can import it directly.

import * as G from '../src/game/state.js';
import * as E from '../src/game/economy.js';
import { STATIONS } from '../src/data/stations.js';
import { UPGRADES } from '../src/data/upgrades.js';
import { QUESTS, CHAPTERS, questsInChapter } from '../src/data/quests.js';
import { fmt, money, duration } from '../src/core/format.js';
import { readFileSync } from 'node:fs';

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(name + ' — ' + err.message);
  }
}

function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || 'expected') + ': got ' + a + ', want ' + b);
}

function near(a, b, tol, msg) {
  if (Math.abs(a - b) > tol) throw new Error((msg || 'expected') + ': got ' + a + ', want ~' + b);
}

function ok(cond, msg) {
  if (!cond) throw new Error(msg || 'expected truthy');
}

// --- formatting --------------------------------------------------------------

check('fmt keeps small numbers plain', () => {
  eq(fmt(0), '0');
  eq(fmt(14), '14');
  eq(fmt(999), '999');
});

check('fmt walks the suffix ladder', () => {
  eq(fmt(1000), '1.00K');
  eq(fmt(1.5e6), '1.50M');
  eq(fmt(2.25e12), '2.25T');
});

check('fmt does not print 1000K', () => {
  eq(fmt(999999), '1.00M');
});

check('fmt survives infinity and money prefixes', () => {
  eq(fmt(Infinity), '∞');
  eq(money(1234), '$1.23K');
});

check('duration reads down from days to seconds', () => {
  eq(duration(45), '45s');
  eq(duration(90), '1m 30s');
  eq(duration(3700), '1h 1m');
});

// --- data sanity -------------------------------------------------------------

check('every id is unique', () => {
  const ids = [...STATIONS.map((s) => s.id), ...UPGRADES.map((u) => u.id), ...QUESTS.map((q) => q.id)];
  eq(new Set(ids).size, ids.length, 'duplicate id');
});

check('station upgrades point at real stations', () => {
  for (const u of UPGRADES) {
    if (u.kind !== 'station') continue;
    ok(STATIONS.some((s) => s.id === u.target), u.id + ' targets missing station ' + u.target);
  }
});

check('the ladder always climbs', () => {
  for (let i = 1; i < STATIONS.length; i++) {
    ok(STATIONS[i].cost > STATIONS[i - 1].cost, 'cost order at ' + i);
    ok(STATIONS[i].revenue / STATIONS[i].time > STATIONS[i - 1].revenue / STATIONS[i - 1].time,
      'rate order at ' + i);
  }
});

check('every chapter has quests and every quest has a chapter', () => {
  for (const c of CHAPTERS) ok(questsInChapter(c.n).length > 0, 'chapter ' + c.n + ' empty');
  for (const q of QUESTS) ok(CHAPTERS.some((c) => c.n === q.chapter), q.id + ' has no chapter');
});

// --- costs -------------------------------------------------------------------

check('a block buy costs what the singles cost', () => {
  const st = STATIONS[0];
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += E.costOf(st, 7 + i, 1);
  near(E.costOf(st, 7, 10), sum, sum * 1e-9, 'geometric series');
});

check('affordable is the inverse of costOf', () => {
  const st = STATIONS[1];
  const cash = E.costOf(st, 12, 9) + 0.5;
  eq(E.affordable(st, 12, cash), 9);
});

check('affordable refuses when you cannot even buy one', () => {
  const st = STATIONS[2];
  eq(E.affordable(st, 0, st.cost - 1), 0);
});

check('buy modes respect the level cap', () => {
  const st = STATIONS[0];
  eq(E.buyCount(st, G.MAX_LEVEL - 3, Infinity, 100), 3);
  eq(E.buyCount(st, G.MAX_LEVEL, Infinity, 'max'), 0);
});

// --- multipliers -------------------------------------------------------------

check('milestones double at the listed levels', () => {
  eq(E.profitMult(24), 1);
  eq(E.profitMult(25), 2);
  eq(E.profitMult(50), 4);
  eq(E.speedMult(99), 1);
  eq(E.speedMult(100), 2);
});

check('cycle time never drops below the floor', () => {
  const st = { ...STATIONS[0], time: 0.05 };
  ok(E.cycleTime(st, 1000) >= 0.05);
});

check('sacrifice points are worth 2% each', () => {
  const s = G.newState();
  s.sacrificePoints = 50;
  near(E.sacrificeMult(s), 2, 1e-9);
});

check('pump upgrades pick the best rather than stacking', () => {
  const s = G.newState();
  s.upgrades.push('megaphone', 'supercycle');
  s.pumpUntil = s.clock + 10;
  eq(E.pumpMult(s), 3);
  eq(E.pumpDuration(s), E.PUMP_SECONDS * 2);
});

// --- running a station -------------------------------------------------------

check('buying deducts cash and adds levels', () => {
  const s = G.newState();
  s.cash = 1000;
  const n = G.buyStation(s, 'shill', 10);
  eq(n, 10);
  eq(s.levels.shill, 10);
  ok(s.cash < 1000 && s.cash > 0);
});

check('a MAX buy never overdraws', () => {
  const s = G.newState();
  s.cash = 5000;
  G.buyStation(s, 'shill', 'max');
  ok(s.cash >= -1e-6, 'went negative: ' + s.cash);
});

check('an un-automated station stops after one cycle', () => {
  const s = G.newState();
  s.cash = 100;
  G.buyStation(s, 'shill', 1);
  G.tap(s); // starts the cycle
  const before = s.cash;
  G.tick(s, 5); // far longer than one 0.6s cycle
  const after = s.cash;
  G.tick(s, 5); // nothing should happen without another tap
  eq(s.cash, after, 'kept earning without a tap');
  ok(after > before, 'did not pay at all');
});

check('an advisor makes the station run forever', () => {
  const s = G.newState();
  s.cash = 1e6;
  G.buyStation(s, 'shill', 20);
  G.hireAdvisor(s, 'shill');
  const cash = s.cash;
  G.tick(s, 6);
  const gained = s.cash - cash;
  near(gained, E.stationPerSecond(s, STATIONS[0]) * 6, gained * 0.02 + 1e-6, 'six seconds of income');
});

check('income per second only counts automated stations', () => {
  const s = G.newState();
  s.cash = 1e6;
  G.buyStation(s, 'shill', 10);
  eq(E.incomePerSecond(s), 0);
  G.hireAdvisor(s, 'shill');
  ok(E.incomePerSecond(s) > 0);
});

// --- offline -----------------------------------------------------------------

check('offline pays up to the cap and no further', () => {
  const s = G.newState();
  s.cash = 1e7;
  G.buyStation(s, 'shill', 50);
  G.hireAdvisor(s, 'shill');
  const rate = E.incomePerSecond(s);
  const cash = s.cash;
  const r = G.applyOffline(s, 48 * 3600);
  near(r.earned, rate * E.offlineCapHours(s) * 3600, rate, 'capped payout');
  ok(r.capped);
  near(s.cash - cash, r.earned, 1e-6);
});

check('a backwards clock does not refund anything', () => {
  const s = G.newState();
  const cash = s.cash;
  G.applyOffline(s, -500);
  eq(s.cash, cash);
});

// --- stakes ------------------------------------------------------------------

check('a stake locks cash and returns it with T-Shares', () => {
  const s = G.newState();
  s.cash = 1e9;
  s.peakCash = 1e9;
  const stake = G.openStake(s, 1e8, 'short');
  ok(stake, 'stake not opened');
  eq(s.cash, 9e8);
  eq(G.claimStake(s, stake.id), null, 'claimed before maturity');
  G.tick(s, 61);
  const claimed = G.claimStake(s, stake.id);
  ok(claimed, 'not claimable after maturity');
  near(s.cash, 1e9, 1, 'principal returned');
  ok(s.tshares > 0, 'no T-Shares paid');
});

check('longer terms pay better', () => {
  const price = 1e5;
  const [short, , long] = E.STAKE_TERMS;
  ok(E.stakeYield(1e7, price, long) > E.stakeYield(1e7, price, short));
});

check('ending early costs the yield and part of the principal', () => {
  const s = G.newState();
  s.cash = 1e9;
  s.peakCash = 1e9;
  const stake = G.openStake(s, 1e8, 'long');
  const ts = s.tshares;
  G.tick(s, 60);
  const out = G.endStakeEarly(s, stake.id);
  eq(s.tshares, ts, 'paid T-Shares on an early end');
  ok(out.penalty > 0, 'no penalty applied');
  ok(s.cash < 1e9, 'principal came back whole');
});

check('a matured stake ended "early" just pays out', () => {
  const s = G.newState();
  s.cash = 1e9;
  s.peakCash = 1e9;
  const stake = G.openStake(s, 1e8, 'short');
  G.tick(s, 61);
  const out = G.endStakeEarly(s, stake.id);
  ok(out.tshares > 0, 'lost the yield on a matured stake');
});

// --- quests and prestige -----------------------------------------------------

check('quests complete, pay out, and advance the chapter', () => {
  const s = G.newState();
  s.cash = 1e12;
  G.buyStation(s, 'shill', 25);
  G.buyStation(s, 'telegram', 1);
  s.stats.taps = 100;
  s.runEarned = 1e5;
  const done = G.checkQuests(s);
  eq(done.length, 4, 'chapter one should finish in one go');
  eq(s.chapter, 2);
  eq(s.tshares, 2 + 2 + 3 + 3);
});

check('a quest only pays once', () => {
  const s = G.newState();
  s.stats.taps = 500;
  G.checkQuests(s);
  const ts = s.tshares;
  G.checkQuests(s);
  eq(s.tshares, ts);
});

check('restake is gated on chapter and on having points to take', () => {
  const s = G.newState();
  s.runEarned = 1e15;
  eq(G.canRestake(s), false, 'allowed before the chapter gate');
  s.chapter = G.RESTAKE_CHAPTER;
  eq(G.canRestake(s), true);
  s.runEarned = 0;
  eq(G.canRestake(s), false, 'allowed with nothing to gain');
});

check('restake wipes the run and keeps the permanents', () => {
  const s = G.newState();
  s.chapter = G.RESTAKE_CHAPTER;
  s.cash = 1e13;
  s.peakCash = 1e13;
  s.runEarned = 1e13;
  s.tshares = 40;
  s.upgrades.push('conviction-i');
  G.buyStation(s, 'shill', 30);
  G.hireAdvisor(s, 'shill');
  const stake = G.openStake(s, 1e10, 'long');
  ok(stake);
  const r = G.restake(s);
  ok(r.gained > 0, 'no sacrifice points');
  eq(s.cash, 0);
  eq(s.advisors.length, 0);
  eq(Object.keys(s.levels).length, 0);
  eq(s.stakes.length, 0, 'stakes survived');
  ok(s.tshares >= 40 + stake.tshares - 1e-9, 'open stake was not paid out');
  ok(s.upgrades.includes('conviction-i'), 'lost a permanent upgrade');
  eq(s.sacrificePoints, r.gained);
});

check('a second restake needs a bigger run than the first', () => {
  const s = G.newState();
  s.chapter = G.RESTAKE_CHAPTER;
  s.runEarned = 1e13;
  const first = E.pendingSacrifice(s);
  s.sacrificePoints = first;
  s.runEarned = 1e13;
  eq(E.pendingSacrifice(s), 0);
});

// --- upgrades ----------------------------------------------------------------

check('an upgrade is paid for once and applies its multiplier', () => {
  const s = G.newState();
  s.cash = 1e6;
  G.buyStation(s, 'shill', 10);
  G.hireAdvisor(s, 'shill');
  const before = E.incomePerSecond(s);
  s.tshares = 100;
  ok(G.buyUpgrade(s, 'bot-farm'));
  eq(G.buyUpgrade(s, 'bot-farm'), false, 'bought twice');
  near(E.incomePerSecond(s), before * 5, before * 1e-6);
  eq(s.tshares, 95);
});

check('a perk you cannot afford is not sold to you', () => {
  const s = G.newState();
  s.tshares = 1;
  eq(G.buyUpgrade(s, 'conviction-iii'), false);
  eq(s.tshares, 1);
});

// --- the loop actually goes somewhere ----------------------------------------

// A greedy bot: tap constantly, buy the deepest station it can afford, hire
// any advisor within reach. If this cannot get off the ground the numbers are
// wrong no matter what the unit tests say.
check('a greedy bot reaches the fourth station inside an hour', () => {
  const s = G.newState();
  const dt = 0.25;
  for (let step = 0; step < 3600 / dt; step++) {
    G.tick(s, dt);
    if (step % 2 === 0) G.tap(s);
    for (let i = STATIONS.length - 1; i >= 0; i--) {
      const st = STATIONS[i];
      const prev = i === 0 ? 1 : s.levels[STATIONS[i - 1].id] || 0;
      if (!prev) continue;
      if (!s.advisors.includes(st.id) && (s.levels[st.id] || 0) > 0 && s.cash >= st.advisor.cost) {
        G.hireAdvisor(s, st.id);
      }
      // Leave a buffer so the bot does not spend every cent on the cheapest
      // rung the instant it can — that is a known way to stall an idle game.
      if (s.cash >= E.costOf(st, s.levels[st.id] || 0, 1) * 2) {
        G.buyStation(s, st.id, 1);
        break;
      }
    }
    G.checkQuests(s);
  }
  ok((s.levels.validator || 0) > 0, 'never reached the Validator Node');
  ok(s.advisors.length >= 2, 'hired only ' + s.advisors.length + ' advisors');
  ok(s.chapter >= 2, 'still on chapter 1 after an hour');
});

// --- deploy config -----------------------------------------------------------

// Vercel schema-validates vercel.json on every deploy and rejects any key it
// does not recognise — including a "//" comment, which is legal JSON and a
// failed build here. Cheaper to catch it in `npm test`.
check('vercel.json is valid and uses only known keys', () => {
  const url = new URL('../vercel.json', import.meta.url);
  const raw = readFileSync(url, 'utf8');
  const cfg = JSON.parse(raw);
  const known = new Set([
    '$schema', 'cleanUrls', 'framework', 'buildCommand', 'outputDirectory',
    'headers', 'redirects', 'rewrites', 'trailingSlash', 'installCommand',
    'devCommand', 'regions', 'public', 'github', 'ignoreCommand',
  ]);
  for (const key of Object.keys(cfg)) ok(known.has(key), 'unknown key ' + key);
  eq(cfg.outputDirectory, '.', 'the site is served from the project root');
  eq(cfg.framework, null, 'there is no framework to detect');
  for (const h of cfg.headers) ok(typeof h.source === 'string' && Array.isArray(h.headers));
});

check('the shipped site does not reach into tools/', () => {
  const ignored = readFileSync(new URL('../.vercelignore', import.meta.url), 'utf8');
  ok(/^tools\/$/m.test(ignored), 'tools/ is not excluded from the deploy');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  ok(!html.includes('tools/'), 'index.html loads something from tools/');
});

// --- report ------------------------------------------------------------------

if (failures.length) {
  console.error(`\n${failures.length} failed, ${passed} passed\n`);
  for (const f of failures) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`\n${passed} checks passed\n`);
