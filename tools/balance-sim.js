// Headless balance harness. Runs full games in Node with a scripted bot and
// reports how deep each class gets, so the difficulty curve can be tuned
// without a browser and deep-run crashes surface early.
//
//   node tools/balance-sim.js                 # every class, 5 runs each
//   node tools/balance-sim.js mage 20         # one class, 20 runs
//   node tools/balance-sim.js --forge 5       # simulate a maxed-ish account
//   node tools/balance-sim.js --gear 6        # simulate a full T6 set
//
// The bot is deliberately mediocre: it kites or closes depending on range,
// attacks constantly and fires skills off cooldown. Treat its results as a
// floor for a real player, not a target.

import { Game } from '../src/game/game.js';
import { CLASSES, CLASS_BY_ID, defaultLoadout, resolveLoadout } from '../src/data/classes.js';
import { GEAR_SLOT_IDS, MAX_TIER } from '../src/data/armor.js';
import { PERMANENT, talentPointsForBestWave } from '../src/data/permanent.js';
import { talentPointsForLevel } from '../src/data/levels.js';
import { RAIDS } from '../src/data/raids.js';
import { forwardVec } from '../src/core/math.js';
import { LAYOUT_NAMES } from '../src/world/world.js';

const FIXED = 1 / 60;
// The bot plays a fully levelled character: the point of the harness is to
// measure the ceiling, and a level-1 pool of two skills measures the floor.
const SIM_LEVEL = 60;
const MAX_WAVE = 80;
const MAX_SECONDS = 60 * 45;         // give up after 45 simulated minutes

// --- Stubs for the browser-only collaborators -------------------------------

const stubRenderer = {
  setWorld() {}, setTheme() {}, project: () => null,
  skyTint: [0, 0, 0], fancy: false,
};
const stubAudio = {
  play() {}, startMusic() {}, stopMusic() {}, setMusicIntensity() {}, ensure() {},
};

function stubProfile(forgeLevel = 0, gearTier = -1, level = SIM_LEVEL) {
  const classes = {};
  for (const c of CLASSES) {
    classes[c.id] = {
      talents: {}, bestWave: 0, kills: 0, runs: 0, mastery: 0,
      loadout: defaultLoadout(c, level),
    };
  }
  const permanent = {};
  if (forgeLevel > 0) {
    // The Forge is per class now, so the simulated account stocks every
    // class's bag to the requested level rather than one shared one.
    for (const def of PERMANENT) permanent[def.id] = Math.min(def.max, forgeLevel);
    for (const c of CLASSES) {
      classes[c.id].forge = {};
      for (const def of PERMANENT) classes[c.id].forge[def.id] = Math.min(def.max, forgeLevel);
    }
  }
  // Gear is per class and absence means unowned, so a tier of -1 is a
  // character wearing nothing rather than one in a full T0 set.
  if (gearTier >= 0) {
    for (const c of CLASSES) {
      classes[c.id].gear = Object.fromEntries(
        GEAR_SLOT_IDS.map((id) => [id, Math.min(MAX_TIER, gearTier)]));
    }
  }
  return {
    data: { permanent, armor: {}, classes, souls: 0, stats: {} },
    settings: { showDamage: false, difficulty: DIFFICULTY },
    classData: (id) => classes[id],
    // The Forge moved into the per-class bag; the harness keeps one bag per
    // class so a fixture can hand a single class a stocked Forge.
    forgeLevels: (id) => (classes[id].forge || (classes[id].forge = {})),
    gear: (id) => (classes[id].gear || (classes[id].gear = {})),
    raidState: (id) => (classes[id].raid || (classes[id].raid = { killed: {} })),
    level: () => level,
    // The bot always fights with the default kit; unlockable skills are a
    // player choice, and simulating them would measure the harness's taste.
    loadout: (cls) => resolveLoadout(cls, classes[cls.id].loadout, level),
    finishRun() {},
    save() {},
  };
}

/** Spend talent points top-down, the way a new player usually does. */
function autoSpendTalents(profile, cls, points) {
  const ranks = profile.classData(cls.id).talents;
  let left = points;
  for (const branch of cls.talents) {
    for (const node of branch.nodes) {
      const take = Math.min(node.max, left);
      if (take > 0) { ranks[node.id] = take; left -= take; }
      if (left <= 0) return;
    }
  }
}

// --- The bot ----------------------------------------------------------------

function botInput(game) {
  const p = game.player;
  const state = {
    moveX: 0, moveY: 0, attack: true, jump: false, sprint: true,
    skills: [false, false, false, false],
  };

  const target = game.nearestEnemy(p.x, p.centerY, p.z, 60);
  if (target) {
    const dx = target.x - p.x, dz = target.z - p.z;
    const dist = Math.hypot(dx, dz) || 1;
    p.yaw = Math.atan2(-dx / dist, -dz / dist);
    p.pitch = Math.atan2(target.centerY - p.eyeY, dist) * 0.8;

    const ideal = p.isMelee ? 2.0 : 12;
    if (dist > ideal + 1.5) state.moveY = 1;
    else if (dist < ideal - 1.5) state.moveY = -1;
    // Constant strafe so the bot is not a stationary punching bag.
    state.moveX = Math.sin(game.time * 1.7) > 0 ? 1 : -1;
  } else {
    state.moveY = 1;
    p.yaw += 0.02;
  }

  // Fire skills off cooldown, cheapest first so resources are not starved.
  const order = p.skills
    .map((s, i) => ({ i, cost: s.cost }))
    .sort((a, b) => a.cost - b.cost);
  for (const { i } of order) {
    if (p.cooldowns[i] <= 0 && p.resource >= p.skills[i].cost) {
      state.skills[i] = true;
      break;                              // one cast per frame, like a human
    }
  }

  // Hop out of lava rather than melting in it.
  if (game.blockDamageAt(p.x, p.y + 0.2, p.z) > 0) {
    state.jump = true;
    state.moveY = 1;
  }
  return state;
}

function simulateRun(classId, { forge = 0, gear = -1, talentPoints = 0, layout } = {}) {
  const cls = CLASS_BY_ID[classId];
  const profile = stubProfile(forge, gear);
  if (talentPoints > 0) autoSpendTalents(profile, cls, talentPoints);

  const game = new Game(stubRenderer, stubAudio, profile);
  game.startRun(cls, layout === undefined ? {} : { layout });

  let steps = 0;
  const maxSteps = MAX_SECONDS * 60;
  let peakMobs = 0;
  let lastAdvance = 0;
  let lastWave = 0;

  while (game.running && steps < maxSteps && game.wave <= MAX_WAVE) {
    game.update(FIXED, botInput(game));
    if (game.wave !== lastWave) { lastWave = game.wave; lastAdvance = steps; }
    // The real game blocks on the upgrade screen; take a card and continue.
    if (game.pendingUpgrades) {
      // Rank up the cheapest skill: the bot's own rotation favours it, so this
      // is the choice a player following the same habit would make.
      const pick = [...game.pendingUpgrades].sort((a, b) => a.skill.cost - b.skill.cost)[0];
      game.chooseUpgrade(pick);
    }
    peakMobs = Math.max(peakMobs, game.mobs.length);
    steps++;
  }

  const reached = game.wave;
  const ranOut = steps >= maxSteps;
  // Running out of budget is not the same as being stuck. A strong build can
  // legitimately still be clearing waves when the clock expires; a genuine
  // soft-lock has made no progress for minutes. Only the latter is a bug, and
  // conflating them would fail CI on good runs.
  const STALL_STEPS = 3 * 60 * 60;              // 3 simulated minutes
  const timedOut = ranOut && (steps - lastAdvance) > STALL_STEPS;
  const stall = timedOut ? {
    waveState: game.director.state,
    queued: game.director.remaining,
    alive: game.mobs.map((m) => ({
      type: m.typeId,
      pos: [+m.x.toFixed(1), +m.y.toFixed(1), +m.z.toFixed(1)],
      hp: Math.round(m.hp),
      dist: +m.distanceXZ(game.player).toFixed(1),
    })).slice(0, 8),
    player: [+game.player.x.toFixed(1), +game.player.y.toFixed(1), +game.player.z.toFixed(1)],
    playerHp: Math.round(game.player.hp),
  } : null;

  if (game.running) game.endRun();
  return {
    classId,
    wave: reached,
    kills: game.player.kills,
    souls: Math.round(game.soulsEarned),
    minutes: steps / 3600,
    peakMobs,
    upgrades: game.player.skillRanks.reduce((s, r) => s + r, 0),
    timedOut,
    stall,
    ranOut,
    stalledFor: +((steps - lastAdvance) / 3600).toFixed(1),
    cappedOut: reached > MAX_WAVE,
  };
}

// --- CLI --------------------------------------------------------------------

const args = process.argv.slice(2).filter((a, i, arr) =>
  a !== '--difficulty' && arr[i - 1] !== '--difficulty');
let forge = 0;
const forgeIdx = args.indexOf('--forge');
if (forgeIdx >= 0) {
  forge = Number.isFinite(Number(args[forgeIdx + 1])) ? Number(args[forgeIdx + 1]) : 3;
  args.splice(forgeIdx, 2);
}
let DIFFICULTY = 2;
const diffIdx = process.argv.indexOf('--difficulty');
if (diffIdx >= 0) DIFFICULTY = Number(process.argv[diffIdx + 1]) || 2;

let gear = -1;
const gearIdx = args.indexOf('--gear');
if (gearIdx >= 0) {
  gear = Number.isFinite(Number(args[gearIdx + 1])) ? Number(args[gearIdx + 1]) : MAX_TIER;
  args.splice(gearIdx, 2);
}
let layout;
const layoutIdx = args.indexOf('--layout');
if (layoutIdx >= 0) {
  layout = Number(args[layoutIdx + 1]) || 0;
  args.splice(layoutIdx, 2);
}
// --- Raid mode ---------------------------------------------------------------
//
// A different question from the arena's. The arena asks "how deep does a class
// get"; a raid asks "does a tier-appropriate character beat this boss, and how
// close was it". Time-to-kill is the number that matters: under 45 s the boss
// never reaches phase 3 and its mechanics never teach, over 120 s a phone fight
// becomes an endurance test with a thumb.
let raidTier = -1;
const raidIdx = args.indexOf('--raid');
if (raidIdx >= 0) {
  raidTier = Number.isFinite(Number(args[raidIdx + 1])) ? Number(args[raidIdx + 1]) : 0;
  args.splice(raidIdx, 2);
}

function simulateRaid(classId, raid, bossIndex) {
  const cls = CLASS_BY_ID[classId];
  // Exactly what the gate asks for and nothing more: the character is at the
  // raid's own level, carrying the full previous tier's set, with the talent
  // points and the skill pool that level actually buys. A tier-0 raider is
  // level 1 with two skills, not a level-60 character in starter gear — and
  // measuring the second one tells you nothing about the first.
  const profile = stubProfile(0, Math.max(0, raid.tier - 1), raid.level);
  autoSpendTalents(profile, cls, talentPointsForLevel(raid.level));
  const game = new Game(stubRenderer, stubAudio, profile);
  game.startRaid(cls, raid, bossIndex);

  let steps = 0;
  const cap = 180 * 60;
  let lowest = 1;
  while (game.running && steps < cap) {
    game.update(FIXED, botInput(game));
    if (game.raidBoss) lowest = Math.min(lowest, game.raidBoss.hp / game.raidBoss.maxHp);
    if (game.raidCleared) break;
    steps++;
  }
  return {
    cleared: game.raidCleared,
    seconds: steps / 60,
    bossLeft: game.raidCleared ? 0 : lowest,
    timedOut: steps >= cap,
  };
}

if (raidTier >= 0) {
  const raid = RAIDS.find((r) => r.tier === raidTier);
  if (!raid) { console.error(`no raid at tier ${raidTier}`); process.exit(1); }
  const targets = args.find((a) => CLASS_BY_ID[a]) ? [args.find((a) => CLASS_BY_ID[a])] : CLASSES.map((c) => c.id);
  console.log(`\n${raid.name} — tier ${raid.tier}, at level ${raid.level} `
    + `in a full T${Math.max(0, raid.tier - 1)} set, `
    + `${talentPointsForLevel(raid.level)} talent points\n`);
  console.log('boss                        ' + targets.map((t) => t.slice(0, 5).padStart(6)).join(''));
  console.log('-'.repeat(28 + targets.length * 6));
  for (let bi = 0; bi < raid.bosses.length; bi++) {
    const cells = targets.map((id) => {
      const r = simulateRaid(id, raid, bi);
      return (r.cleared ? r.seconds.toFixed(0) + 's' : Math.round(r.bossLeft * 100) + '%').padStart(6);
    });
    console.log(raid.bosses[bi].name.slice(0, 26).padEnd(28) + cells.join(''));
  }
  console.log('-'.repeat(28 + targets.length * 6));
  console.log('seconds = killed and how long it took; % = wiped, boss health left\n');
  process.exit(0);
}

const only = args.find((a) => CLASS_BY_ID[a]);
const runs = Number(args.find((a) => /^\d+$/.test(a))) || 5;
const targets = only ? [only] : CLASSES.map((c) => c.id);

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

console.log(`\nCRAFT ARENA balance simulation — ${runs} run(s) per class`
  + (forge ? `, Forge level ${forge}` : ', no permanent upgrades')
  + (gear >= 0 ? `, gear T${gear}` : '')
  + `, difficulty ${DIFFICULTY}`
  + (layout === undefined ? ', mixed layouts' : `, ${LAYOUT_NAMES[layout % LAYOUT_NAMES.length]} layout`)
  + '\n');
console.log('class        median  best  worst   kills   min   peak  upg');
console.log('-'.repeat(58));

const all = [];
for (const id of targets) {
  const results = [];
  for (let i = 0; i < runs; i++) {
    // Talent points scale with the best wave reached so far, like the real game.
    const best = results.length ? Math.max(...results.map((r) => r.wave)) : 0;
    results.push(simulateRun(id, {
      forge, gear, layout, talentPoints: talentPointsForBestWave(best),
    }));
  }
  const waves = results.map((r) => r.wave);
  const row = [
    id.padEnd(12),
    String(median(waves)).padStart(6),
    String(Math.max(...waves)).padStart(5),
    String(Math.min(...waves)).padStart(6),
    String(Math.round(median(results.map((r) => r.kills)))).padStart(7),
    median(results.map((r) => r.minutes)).toFixed(1).padStart(6),
    String(Math.max(...results.map((r) => r.peakMobs))).padStart(6),
    String(Math.round(median(results.map((r) => r.upgrades)))).padStart(4),
  ].join(' ');
  console.log(row);
  all.push({ id, waves, results });
}

console.log('-'.repeat(58));
const allWaves = all.flatMap((a) => a.waves);
console.log(`overall median wave ${median(allWaves)}, `
  + `spread ${Math.min(...allWaves)}–${Math.max(...allWaves)}`);

const slow = all.flatMap((a) => a.results).filter((r) => r.ranOut && !r.timedOut);
if (slow.length) {
  console.log(`\n${slow.length} run(s) were still progressing when the clock ran out `
    + `(deepest wave ${Math.max(...slow.map((r) => r.wave))}). Not a stall.`);
}

const stalled = all.flatMap((a) => a.results).filter((r) => r.timedOut);
if (stalled.length) {
  console.log(`\n⚠ ${stalled.length} run(s) could not end — no wave progress for minutes.`);
  for (const r of stalled.slice(0, 3)) {
    console.log(`  ${r.classId}: wave ${r.wave} (${r.stall.waveState}, `
      + `${r.stall.queued} queued), player hp ${r.stall.playerHp} at `
      + `${r.stall.player.join(',')}`);
    for (const m of r.stall.alive) {
      console.log(`    ${m.type.padEnd(9)} hp ${String(m.hp).padStart(4)} `
        + `at ${m.pos.join(',')} — ${m.dist} away`);
    }
  }
}

// A class that is wildly out of line with the others is a balance smell — but
// only once there are enough runs to tell a smell from a coin flip. Talent
// points come from the *previous* run's best wave, so a batch that opens with
// one bad run stays poor for the whole batch: at five runs a class can read as
// median 10 and median 50 on consecutive invocations of this harness with no
// code change between them. Chasing that as a regression costs more time than
// the warning ever saves.
const MIN_RUNS_FOR_OUTLIERS = 8;
const medians = all.map((a) => ({ id: a.id, m: median(a.waves) }));
const overall = median(medians.map((x) => x.m));
if (runs < MIN_RUNS_FOR_OUTLIERS) {
  console.log(`\n(${runs} runs per class is too few to flag outliers — `
    + `re-run with ${MIN_RUNS_FOR_OUTLIERS}+ before treating a spread as real.)`);
}
for (const { id, m } of medians) {
  if (runs < MIN_RUNS_FOR_OUTLIERS) break;
  if (overall > 0 && (m > overall * 1.8 || m < overall * 0.55)) {
    console.log(`⚠ ${id} median ${m} is far from the ${overall} baseline.`);
  }
}
console.log();
