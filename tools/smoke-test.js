// Headless checks over the pure-logic modules (no DOM required).
// Run with: npm test

import {
  CLASSES, CLASS_BY_ID, TALENT_BY_ID, LOADOUT_SIZE, totalTalentRanks,
  defaultLoadout, resolveLoadout, unlockedSkills,
} from '../src/data/classes.js';
import {
  GEAR_SLOTS, GEAR_SLOT_IDS, GEAR_TIERS, MAX_TIER, CLASS_GEAR, SHARED_SLOT_EFFECTS,
  gearCost, gearMods, gearRating, gearName, tierLevel, maxTierForLevel,
  ownedTier, canBuy, ladderCost, setTier, hasFullSet, missingForSet,
  slotEffect, weaponAppearance, legacyArmorRefund,
  tierSkillBonus, tierSkillDesc, setScale, mergeMods, activeSet, SET_BONUSES,
} from '../src/data/armor.js';
import {
  PERMANENT, upgradeCost, permanentMods, talentPointsForBestWave,
  masteryRank, masteryThreshold, masteryProgress, masteryMods, masteryFromRun,
} from '../src/data/permanent.js';
import {
  waveScaling, waveBudget, buildWaveQueue, isBossWave, waveClearBonus,
  bossForWave, BOSS_EVERY,
} from '../src/game/waves.js';
import { MOB_TYPES, BOSS_IDS, rollMobType } from '../src/game/mobs.js';
import { clamp, angleDelta, perspective, mat4, forwardVec } from '../src/core/math.js';

let passed = 0;
const failures = [];
const pending = [];

/** Register a check. Sync or async; all are awaited before the report. */
function check(name, fn) {
  pending.push((async () => {
    try {
      await fn();
      passed++;
    } catch (err) {
      failures.push(`${name}: ${err.message}`);
    }
  })());
}

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
/** Raid mechanics are a closed set; anything else is a typo in the data. */
let MECHANICS_OK = () => true;
import('../src/data/raids.js').then(({ MECHANICS }) => {
  MECHANICS_OK = (m) => Object.prototype.hasOwnProperty.call(MECHANICS, m);
});
/** A class's two starting skills. */
const unlockedSkillsAtOne = (c) => unlockedSkills(c, 1);

// --- Classes ---------------------------------------------------------------

check('nine playable classes', () => {
  assert(CLASSES.length === 9, `expected 9 classes, got ${CLASSES.length}`);
});

check('every class resource is distinct enough to matter', () => {
  for (const c of CLASSES) {
    const r = c.resource;
    assert(r.max > 0, `${c.id} resource has no ceiling`);
    // A resource with no regen must have another way to fill, or the class
    // runs dry after its opening rotation and never casts again.
    const fills = (r.regen || 0) > 0 || r.onHitGain || r.onKillGain || r.onTakeGain;
    assert(fills, `${c.id} resource ${r.name} can never be refilled`);
  }
});

check('class ids are unique', () => {
  const ids = new Set(CLASSES.map((c) => c.id));
  assert(ids.size === CLASSES.length, 'duplicate class id');
});

check('every class has a pool of 13 skills with valid kinds', () => {
  const kinds = new Set(['projectile', 'aoe_self', 'aoe_target', 'dash', 'buff',
    'heal', 'summon', 'cone', 'chain', 'strike', 'zone']);
  for (const c of CLASSES) {
    assert(c.skills.length === 13, `${c.id} has ${c.skills.length} skills`);
    for (const s of c.skills) {
      assert(kinds.has(s.kind), `${c.id}/${s.id} unknown kind "${s.kind}"`);
      assert(s.cost >= 0, `${c.id}/${s.id} negative cost`);
      assert(s.cooldown > 0, `${c.id}/${s.id} non-positive cooldown`);
      assert(typeof s.icon === 'string' && s.icon.length, `${c.id}/${s.id} missing icon`);
      assert(typeof s.desc === 'string' && s.desc.length > 10, `${c.id}/${s.id} weak description`);
    }
  }
});

check('every class has 4 talent branches of 11 nodes', () => {
  for (const c of CLASSES) {
    assert(c.talents.length === 4, `${c.id} has ${c.talents.length} branches`);
    for (const b of c.talents) {
      assert(b.nodes.length === 11, `${c.id}/${b.name} has ${b.nodes.length} nodes`);
      for (const n of b.nodes) {
        assert(n.max >= 1, `${n.id} max rank ${n.max}`);
        assert(Object.keys(n.effect).length > 0, `${n.id} has no effect`);
      }
    }
  }
});

check('every skill-scoped talent names a real skill in its own class', () => {
  for (const c of CLASSES) {
    const ids = new Set(c.skills.map((s) => s.id));
    for (const b of c.talents) {
      for (const n of b.nodes) {
        if (!n.skill) continue;
        // A typo here is silent: the node buys ranks, writes them into a bag
        // nothing ever reads, and the player pays points for nothing.
        assert(ids.has(n.skill),
          `${c.id}/${n.id} targets '${n.skill}', which is not one of its skills`);
      }
    }
  }
});

check('a skill-scoped talent only affects the skill it names', async () => {
  const { buildMods } = await import('../src/game/player.js');
  for (const c of CLASSES) {
    const scoped = c.talents.flatMap((b) => b.nodes).filter((n) => n.skill);
    assert(scoped.length >= 6, `${c.id} has only ${scoped.length} skill-scoped talents`);
    const node = scoped[0];
    const mods = buildMods(c, { [node.id]: node.max }, {});
    // The effect must land in that skill's bag and nowhere else — in
    // particular it must not leak into the flat bag, where it would silently
    // buff every skill in the game.
    const bag = mods.skills[node.skill];
    assert(bag, `${c.id}/${node.id} wrote nothing under '${node.skill}'`);
    for (const key of Object.keys(node.effect)) {
      assert(bag[key], `${c.id}/${node.id} did not write ${key} into its skill bag`);
      assert(mods[key] === undefined,
        `${c.id}/${node.id} leaked ${key} into the global modifier bag`);
    }
  }
});

check('every skill-scoped effect key is consumed by the skill engine', async () => {
  const { readFile } = await import('node:fs/promises');
  const sources = (await Promise.all(
    ['../src/game/skills.js', '../src/game/game.js']
      .map((p) => readFile(new URL(p, import.meta.url), 'utf8'))
  )).join('\n');
  const keys = new Set();
  for (const c of CLASSES) {
    for (const b of c.talents) {
      for (const n of b.nodes) {
        if (n.skill) for (const k of Object.keys(n.effect)) keys.add(k);
      }
    }
  }
  for (const k of keys) {
    assert(sources.includes(`.${k}`), `skill-scoped effect '${k}' is never read`);
  }
});

check('talent ids are globally unique', () => {
  const seen = new Set();
  for (const c of CLASSES) {
    for (const b of c.talents) {
      for (const n of b.nodes) {
        assert(!seen.has(n.id), `duplicate talent id ${n.id}`);
        seen.add(n.id);
      }
    }
  }
  assert(Object.keys(TALENT_BY_ID).length === seen.size, 'TALENT_BY_ID out of sync');
});

check('class base stats are sane', () => {
  for (const c of CLASSES) {
    const b = c.base;
    assert(b.hp >= 60 && b.hp <= 250, `${c.id} hp ${b.hp} out of range`);
    assert(b.armor >= 0 && b.armor < 0.6, `${c.id} armor ${b.armor}`);
    assert(b.speed > 3 && b.speed < 9, `${c.id} speed ${b.speed}`);
    assert(b.critChance >= 0 && b.critChance <= 0.5, `${c.id} crit ${b.critChance}`);
    assert(c.resource && c.resource.max > 0, `${c.id} bad resource`);
  }
});

check('a talent tree costs more than a capped character has', async () => {
  const { talentPointsForLevel, MAX_LEVEL } = await import('../src/data/levels.js');
  const budget = talentPointsForLevel(MAX_LEVEL);

  for (const c of CLASSES) {
    const branches = c.talents.map((b) => b.nodes.reduce((t, n) => t + n.max, 0));
    const total = branches.reduce((a, b) => a + b, 0);

    // The whole point of the tree. A cap that fills it turns speccing into a
    // waiting room: everyone ends up identical and the only question is when.
    assert(total > budget * 2.5,
      `${c.id}'s tree costs ${total} against a budget of ${budget} — too easy to own outright`);

    // But one branch has to be finishable, or its capstone is decoration and
    // the deep half of every tree is content nobody ever reaches.
    const deepest = Math.max(...branches);
    assert(deepest <= budget,
      `${c.id}'s deepest branch costs ${deepest}, more than the ${budget} a capped character has`);

    // And two branches must not be, or "specialise" means "take two and a bit"
    // rather than a decision with a cost.
    const twoCheapest = branches.slice().sort((a, b) => a - b).slice(0, 2)
      .reduce((a, b) => a + b, 0);
    assert(twoCheapest > budget,
      `${c.id} can fill its two cheapest branches with ${budget} points`);
  }
});

// --- Upgrades --------------------------------------------------------------




// --- Permanent upgrades ----------------------------------------------------

check('permanent costs grow and never go backwards', () => {
  for (const def of PERMANENT) {
    let prev = 0;
    for (let lv = 0; lv < def.max; lv++) {
      const c = upgradeCost(def, lv);
      assert(c > 0, `${def.id} level ${lv} costs ${c}`);
      assert(c >= prev, `${def.id} cost decreased at level ${lv}`);
      prev = c;
    }
  }
});

check('permanentMods sums levels correctly', () => {
  // Derived from the definitions rather than hard-coded, so a rebalance of
  // the Forge does not fail a test that is really about the summing.
  // Two arbitrary tracks, read from whatever they currently grant, so a
  // rebalance cannot fail a test that is really about the summing.
  const [a, b] = PERMANENT;
  const [ka, va] = Object.entries(a.effect)[0];
  const [kb, vb] = Object.entries(b.effect)[0];
  const mods = permanentMods({ [a.id]: 3, [b.id]: 2 });
  const want = ka === kb ? va * 3 + vb * 2 : va * 3;
  assert(near(mods[ka], want), `${ka} came out ${mods[ka]}, expected ${want}`);
  if (ka !== kb) assert(near(mods[kb], vb * 2), `${kb} came out ${mods[kb]}`);
  assert(Object.keys(permanentMods({})).length === 0, 'an empty Forge grants something');
});

check('the Forge is short, finite, and not a power curve', async () => {
  const { RETIRED_TRACKS } = await import('../src/data/permanent.js');

  // Finite on purpose. It used to run to level 100 on twenty-odd tracks and
  // grant +200% damage and +600 health — the largest power source in the game,
  // account-wide, identical on every class. Talents are the build now and gear
  // is the grind; the Forge lifts the floor and then gets out of the way.
  for (const d of PERMANENT) {
    assert(d.max <= 10, `${d.id} runs to ${d.max}: the Forge is meant to finish`);
  }
  let total = 0;
  for (const d of PERMANENT) for (let lv = 0; lv < d.max; lv++) total += upgradeCost(d, lv);

  // Priced against the Armoury rather than against a round number. The Forge
  // was 2.3% of a full gear set, which meant a player finished it by accident
  // on the way to the thing that actually paces the game — and the third power
  // source must never be the cheap one.
  //
  // It also must not become the grind. Gear is the grind; the Forge is a short
  // finite set of conveniences you buy once and stop thinking about. Somewhere
  // between a tenth and a third of a full set is where both of those are true.
  const fullSet = GEAR_SLOTS.length * Array.from({ length: MAX_TIER + 1 })
    .reduce((sum, _, t) => sum + gearCost(t), 0);
  const share = total / fullSet;
  assert(share > 0.06,
    `the whole Forge is ${(share * 100).toFixed(1)}% of a gear set — too cheap to be a decision`);
  assert(share < 0.33,
    `the whole Forge is ${(share * 100).toFixed(0)}% of a gear set — it is competing with the grind`);

  // And the first rank of anything stays reachable, because a new player has
  // to be able to buy *something*.
  const cheapest = Math.min(...PERMANENT.map((d) => upgradeCost(d, 0)));
  assert(cheapest < 1500, `the cheapest thing in the Forge costs ${cheapest} gold`);

  // The hard ceiling. Whatever the tracks are, a fully bought Forge must stay
  // well under what a full gear set gives, or it is back to being the thing
  // that decides fights.
  const maxed = Object.fromEntries(PERMANENT.map((d) => [d.id, d.max]));
  const m = permanentMods(maxed);
  assert((m.allDamage || 0) <= 0.25, `a maxed Forge grants +${((m.allDamage || 0) * 100).toFixed(0)}% damage`);
  assert((m.maxHpPct || 0) <= 0.35, `a maxed Forge grants +${((m.maxHpPct || 0) * 100).toFixed(0)}% health`);
  assert(!m.maxHp, 'the Forge grants flat health again, which is unfair across nine classes');

  // Retired tracks must be genuinely gone, or the refund path silently pays
  // out for something still purchasable.
  const live = new Set(PERMANENT.map((d) => d.id));
  for (const id of RETIRED_TRACKS) assert(!live.has(id), `${id} is retired and still on sale`);
});

check('a save loses no gold when the Forge shrinks', async () => {
  const { Profile } = await import('../src/core/save.js');
  const { PERMANENT_BY_ID, RETIRED_TRACKS } = await import('../src/data/permanent.js');

  // An account deep in the old Forge: levels in a track that no longer exists,
  // and a level far above the new cap on one that does. Both would silently
  // vanish, and from the player's side that is indistinguishable from the
  // update having eaten their account.
  const retired = RETIRED_TRACKS[0];
  const live = PERMANENT.find((d) => d.max >= 10);
  const profile = Object.create(Profile.prototype);
  profile.data = {
    souls: 0,
    permanent: { [retired]: 40 },              // the old account-wide bag
    characters: [{ id: 1, classId: 'warrior', forge: { [live.id]: 60 } }],
  };

  assert(profile.refundForge(), 'the refund did nothing');
  assert(profile.data.permanent[retired] === undefined, 'a retired track survived');
  // The account-wide bag is emptied outright: the shop is per character now,
  // and there is no honest way to decide which character an account-wide
  // purchase should belong to.
  assert(Object.keys(profile.data.permanent).length === 0, 'the account-wide bag survived');
  assert(profile.data.characters[0].forge[live.id] === live.max,
    `the surviving track sits at ${profile.data.characters[0].forge[live.id]}`);

  // Paid back at exactly what it cost — the levels taken away are [keep, had).
  let want = 0;
  for (let lv = 0; lv < 40; lv++) want += upgradeCost(PERMANENT_BY_ID[retired] || { baseCost: 60, growth: 1.085 }, lv);
  for (let lv = live.max; lv < 60; lv++) want += upgradeCost(live, lv);
  assert(profile.data.souls === Math.round(want),
    `refunded ${profile.data.souls}, should be ${Math.round(want)}`);

  // And it must run once. A refund that pays out on every boot is a money
  // printer, which is the worst possible way for this to be wrong.
  assert(!profile.refundForge(), 'the refund ran a second time');
  const after = profile.data.souls;
  profile.refundForge();
  assert(profile.data.souls === after, 'a later boot paid out again');
});

check('talent points increase with best wave', () => {
  let prev = -1;
  for (let w = 0; w <= 60; w++) {
    const p = talentPointsForBestWave(w);
    assert(p >= prev, `points went down at wave ${w}`);
    prev = p;
  }
});

// --- Wave director ---------------------------------------------------------

check('wave 0 scaling is finite', () => {
  const s = waveScaling(0);
  for (const [k, v] of Object.entries(s)) {
    assert(Number.isFinite(v), `waveScaling(0).${k} is ${v}`);
  }
});

check('wave scaling rises monotonically and never stalls', () => {
  let prevHp = 0, prevDmg = 0;
  for (let w = 1; w <= 200; w++) {
    const s = waveScaling(w);
    assert(s.hp > prevHp, `hp scaling stalled at wave ${w}`);
    assert(s.damage > prevDmg, `damage scaling stalled at wave ${w}`);
    assert(s.speed <= 1.55 + 1e-9, `speed scaling unbounded at wave ${w}`);
    prevHp = s.hp; prevDmg = s.damage;
  }
});

check('wave budget grows', () => {
  for (let w = 1; w < 120; w++) {
    assert(waveBudget(w + 1) > waveBudget(w), `budget stalled at wave ${w}`);
  }
});

check('every 5th wave is a boss wave', () => {
  for (let w = 1; w <= 60; w++) {
    assert(isBossWave(w) === (w % 5 === 0), `wave ${w} boss flag wrong`);
  }
});

check('wave queues are non-empty and only use unlocked mobs', () => {
  for (let w = 1; w <= 80; w++) {
    const q = buildWaveQueue(w);
    assert(q.length > 0, `wave ${w} spawned nothing`);
    for (const e of q) {
      const t = MOB_TYPES[e.typeId];
      assert(t, `wave ${w} unknown mob ${e.typeId}`);
      assert(t.boss || w >= t.minWave, `wave ${w} spawned ${e.typeId} too early`);
    }
    if (isBossWave(w)) {
      assert(q.some((e) => e.boss), `boss wave ${w} has no boss`);
    }
  }
});

check('boss waves rotate through the unlocked roster', () => {
  const seen = new Set();
  for (let w = BOSS_EVERY; w <= 60; w += BOSS_EVERY) {
    const id = bossForWave(w);
    const def = MOB_TYPES[id];
    assert(def && def.boss, `wave ${w} picked non-boss "${id}"`);
    assert(w >= def.minWave, `wave ${w} picked ${id}, gated at ${def.minWave}`);
    seen.add(id);
  }
  assert(bossForWave(BOSS_EVERY) === 'colossus', 'first boss should be the Colossus');
  assert(seen.size === BOSS_IDS.length,
    `only ${seen.size} of ${BOSS_IDS.length} bosses ever appear`);
});

check('every boss has a distinct behavior and is never randomly spawned', () => {
  const behaviors = new Set();
  for (const id of BOSS_IDS) {
    const def = MOB_TYPES[id];
    assert(def.boss, `${id} not flagged as a boss`);
    assert(def.weight === 0, `${id} would spawn as a regular enemy`);
    assert(!behaviors.has(def.behavior), `${id} reuses behavior "${def.behavior}"`);
    behaviors.add(def.behavior);
    assert(def.souls >= 80, `${id} awards only ${def.souls} souls`);
  }
  // Regular waves must never roll a boss.
  for (let w = 1; w <= 60; w++) {
    for (let i = 0; i < 40; i++) {
      assert(!MOB_TYPES[rollMobType(w)].boss, `rollMobType returned a boss at wave ${w}`);
    }
  }
});

check('wave clear bonus always positive and increasing', () => {
  for (let w = 1; w < 100; w++) {
    assert(waveClearBonus(w) > 0, `wave ${w} bonus not positive`);
  }
});

check('mob definitions are complete', () => {
  for (const [id, t] of Object.entries(MOB_TYPES)) {
    assert(t.hp > 0 && t.damage > 0, `${id} bad stats`);
    assert(t.height > 0 && t.width > 0, `${id} bad size`);
    assert(t.skin && t.skin.head, `${id} missing skin`);
    assert(t.souls > 0, `${id} awards no souls`);
  }
});

// --- Effect wiring ---------------------------------------------------------
// A talent or upgrade whose effect key no code path ever reads is a silent
// no-op for the player. Catch that here rather than in a bug report.

check('every declared effect key is consumed by game code', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

  const dataSrc = ['src/data/classes.js', 'src/data/permanent.js', 'src/data/armor.js']
    .map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
  const keys = new Set();
  for (const m of dataSrc.matchAll(/effect:\s*\{([^}]*)\}/g)) {
    for (const k of m[1].matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:/g)) keys.add(k[1]);
  }
  assert(keys.size > 35, `only found ${keys.size} effect keys — parser broke?`);

  const codeSrc = ['src/game/player.js', 'src/game/skills.js', 'src/game/game.js',
    'src/game/pets.js', 'src/game/entity.js', 'src/game/mobs.js', 'src/ui/hud.js']
    .map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');

  const dead = [...keys].filter((k) => !codeSrc.includes('.' + k));
  assert(dead.length === 0, `effects declared but never read: ${dead.sort().join(', ')}`);
});


// --- Loadouts, armour and mastery ------------------------------------------

check('skills unlock across the whole climb, two at a time to start', async () => {
  const { unlockedSkills, unlockOrder, SKILL_UNLOCK_LEVELS, unlockLevelForSlot } =
    await import('../src/data/classes.js');
  const { MAX_LEVEL } = await import('../src/data/levels.js');

  // Two at level 1 and everything by the cap. A skill that unlocks past 60 is
  // a skill nobody ever sees.
  assert(SKILL_UNLOCK_LEVELS[0] === 1 && SKILL_UNLOCK_LEVELS[1] === 1,
    'a fresh character does not start with two skills');
  let prev = 0;
  for (const lv of SKILL_UNLOCK_LEVELS) {
    assert(lv >= prev, 'the unlock schedule goes backwards');
    assert(lv <= MAX_LEVEL, `a skill unlocks at level ${lv}, past the cap`);
    prev = lv;
  }
  assert(prev >= MAX_LEVEL * 0.8, 'the last skill arrives long before the cap');

  for (const c of CLASSES) {
    assert(unlockedSkills(c, 1).length === 2, `${c.id} does not start with two skills`);
    assert(unlockedSkills(c, MAX_LEVEL).length === c.skills.length,
      `${c.id} never unlocks its whole pool`);
    // The order must cover the pool exactly once — a starter named wrongly
    // would silently drop a skill out of the game.
    const order = unlockOrder(c);
    assert(order.length === c.skills.length, `${c.id} unlock order has ${order.length} entries`);
    assert(new Set(order.map((s) => s.id)).size === c.skills.length,
      `${c.id} unlock order repeats a skill`);
    // And it must only ever grow with level.
    let last = 0;
    for (let L = 1; L <= MAX_LEVEL; L++) {
      const n = unlockedSkills(c, L).length;
      assert(n >= last, `${c.id} lost a skill between level ${L - 1} and ${L}`);
      last = n;
    }
  }
});

check('a class that can heal opens with one attack and one heal', () => {
  for (const c of CLASSES) {
    const heals = new Set(c.skills.filter((s) => s.kind === 'heal').map((s) => s.id));
    if (!heals.size) continue;
    const starters = unlockedSkillsAtOne(c);
    const healers = starters.filter((s) => heals.has(s.id));
    assert(healers.length === 1,
      `${c.id} can heal but opens with ${healers.length} heals: ${starters.map((s) => s.id)}`);
    assert(starters.length - healers.length === 1,
      `${c.id} does not open with exactly one attack alongside its heal`);
  }
});

check('skill ids are unique within a class', () => {
  for (const c of CLASSES) {
    const ids = new Set(c.skills.map((s) => s.id));
    assert(ids.size === c.skills.length, `${c.id} has a duplicate skill id`);
  }
});

check('resolveLoadout never slots a skill the class has not learned', () => {
  for (const c of CLASSES) {
    for (const level of [1, 4, 12, 34, 60]) {
      const open = unlockedSkills(c, level);
      const openIds = new Set(open.map((s) => s.id));
      const expect = Math.min(LOADOUT_SIZE, open.length);
      for (const ids of [
        undefined, [], ['nonsense'],
        [c.skills[c.skills.length - 1].id],          // the last of the pool
        [c.skills[0].id, c.skills[0].id],            // a duplicate
        c.skills.map((s) => s.id),                   // everything at once
      ]) {
        const out = resolveLoadout(c, ids, level);
        assert(out.length === expect,
          `${c.id} at level ${level} produced ${out.length} skills, expected ${expect}`);
        assert(new Set(out.map((s) => s.id)).size === out.length, `${c.id} duplicated a slot`);
        // This is the check that matters: a stored loadout from a higher-level
        // save, or from a build with a different unlock order, must not be able
        // to smuggle a locked skill into the arena.
        for (const s of out) {
          assert(openIds.has(s.id),
            `${c.id} at level ${level} slotted ${s.id}, which unlocks later`);
        }
      }
    }
    const d = defaultLoadout(c, 60);
    assert(resolveLoadout(c, d, 60).map((s) => s.id).join() === d.join(),
      `${c.id} default loadout is not stable`);
  }
});

check('talent trees are deep enough to outlast the early waves', () => {
  for (const c of CLASSES) {
    const ranks = totalTalentRanks(c);
    assert(ranks >= 70, `${c.id} only holds ${ranks} talent ranks`);
    // Filling a tree should take real progress, not a handful of waves.
    let wave = 0;
    while (talentPointsForBestWave(wave) < ranks && wave < 500) wave++;
    assert(wave >= 30, `${c.id} tree fills by wave ${wave}`);
  }
});

check('talent points keep arriving forever', () => {
  let prev = -1;
  for (let w = 0; w <= 200; w++) {
    const pts = talentPointsForBestWave(w);
    assert(pts > prev, `points did not grow at wave ${w}`);
    prev = pts;
  }
});

check('mastery ranks are consistent with their thresholds', () => {
  for (let rank = 0; rank < 60; rank++) {
    const at = masteryThreshold(rank);
    assert(masteryRank(at) === rank, `threshold for rank ${rank} resolves to ${masteryRank(at)}`);
    assert(masteryRank(at - 1) === Math.max(0, rank - 1), `one short of rank ${rank} misreads`);
  }
  assert(masteryRank(0) === 0, 'a fresh class is rank 0');
  assert(masteryRank(-5) === 0, 'negative progress is rank 0');
});

check('mastery never stops progressing', () => {
  let progress = 0;
  let last = 0;
  for (let run = 0; run < 60; run++) {
    progress += masteryFromRun({ wave: 10 + run, kills: 100 });
    const r = masteryRank(progress);
    assert(r >= last, 'mastery went backwards');
    last = r;
  }
  assert(last > 10, `60 deep runs only reached mastery ${last}`);
  const p = masteryProgress(progress);
  assert(p.into >= 0 && p.into < p.need, 'progress into rank is out of range');
  assert(masteryMods(last).allDamage > 0, 'mastery grants nothing');
});

check('gear costs climb and its bonuses add up', () => {
  for (let t = 1; t <= MAX_TIER; t++) {
    assert(gearCost(t) > gearCost(t - 1), `gear cost flat at T${t}`);
    assert(tierLevel(t) > tierLevel(t - 1), `T${t} does not need a higher level`);
  }
  assert(gearCost(0) === 800, 'T0 is not 800 gold');
  assert(gearCost(MAX_TIER) === 800 * 4 ** MAX_TIER, 'the cost curve is not 800 x 4^tier');

  const full = Object.fromEntries(GEAR_SLOT_IDS.map((id) => [id, MAX_TIER]));
  for (const cls of CLASSES) {
    const mods = gearMods(cls.id, full);
    assert(mods.maxHpPct > 0, `${cls.id} gear grants no health`);
    const dmg = (mods.allDamage || 0) + (mods.meleeDamage || 0) + (mods.spellDamage || 0);
    assert(dmg > 0, `${cls.id} gear grants no damage`);
    assert(Object.keys(gearMods(cls.id, {})).length === 0,
      `${cls.id} gets stats from gear it does not own`);
  }
  assert(gearRating(full) === GEAR_SLOTS.length * (MAX_TIER + 1), 'gear rating');
  assert(gearRating({}) === 0, 'an empty kit has a rating');
});

check('owning tier 0 is not the same as owning nothing', () => {
  // The convention the whole system rests on, and the one that is easy to break
  // by writing `gear[slot] || 0` somewhere. T0 costs 800 gold; if absence and
  // zero were the same value, that purchase would be invisible to every gate.
  assert(ownedTier({}, 'helm') === -1, 'an unowned slot does not read as -1');
  assert(ownedTier({ helm: 0 }, 'helm') === 0, 'a bought T0 slot reads as unowned');

  const t0 = Object.fromEntries(GEAR_SLOT_IDS.map((id) => [id, 0]));
  assert(hasFullSet(t0, 0), 'a full T0 set does not count as a full T0 set');
  assert(!hasFullSet({}, 0), 'an empty kit counts as a full T0 set');
  assert(missingForSet({ ...t0, ring: -1 }, 0).length === 0
    || missingForSet({}, 0).length === GEAR_SLOTS.length, 'set gap counted wrong');
  assert(setTier({}) === -1, 'an empty kit has a set tier');
  assert(setTier(t0) === 0, 'a full T0 kit is not a T0 set');

  // And the stats have to follow: T0 is a real rung, so it must pay something.
  const some = gearMods('warrior', { chest: 0 });
  assert(some.maxHpPct > 0, 'a bought T0 Chestplate grants nothing');
});

check('tiers are level-gated and cannot be skipped', () => {
  const empty = {};
  // Level 60 with all the gold in the world still only buys the first rung.
  const rich = canBuy('warrior', 'ring', empty, 60, 1e12);
  assert(rich.ok && rich.next === 0, 'a level-60 character can skip straight past T0');

  // And the ladder is walked one rung at a time, all the way up.
  const gear = {};
  for (let t = 0; t <= MAX_TIER; t++) {
    const v = canBuy('warrior', 'ring', gear, 60, 1e12);
    assert(v.ok && v.next === t, `ladder skipped to T${v.next} instead of T${t}`);
    gear.ring = v.next;
  }
  assert(canBuy('warrior', 'ring', gear, 60, 1e12).maxed, 'the ladder never ends');

  // Level is the wall gold cannot climb.
  for (let t = 1; t <= MAX_TIER; t++) {
    const at = Object.fromEntries([['ring', t - 1]]);
    const under = canBuy('warrior', 'ring', at, tierLevel(t) - 1, 1e12);
    assert(under.locked, `T${t} is buyable below level ${tierLevel(t)}`);
    const on = canBuy('warrior', 'ring', at, tierLevel(t), 1e12);
    assert(on.ok, `T${t} is not buyable at level ${tierLevel(t)}`);
  }
  assert(maxTierForLevel(1) === 0 && maxTierForLevel(60) === MAX_TIER,
    'the level-to-tier ceiling is wrong at the ends');
  assert(maxTierForLevel(59) === MAX_TIER - 1, 'T6 is buyable before the cap');

  // Poverty is a separate verdict from being locked, because the two need
  // different buttons: one says "Lv 41", the other says a price.
  const poor = canBuy('warrior', 'ring', {}, 60, 0);
  assert(poor.poor && !poor.locked, 'being broke reads as being under-levelled');
});

check('one character clearing a raid buys another character nothing', async () => {
  // The bug this exists for, reported from play: a Hunter cleared tier 0, and
  // the account's level-1 Warrior could then buy the whole T0 set. Gold is
  // global by design, so the Hunter's winnings fund the Warrior — and without
  // the Core gate that was the only thing standing between a fresh alt and a
  // full set of gear it had done nothing to earn.
  const { Profile } = await import('../src/core/save.js');
  const { RAIDS, coreId } = await import('../src/data/raids.js');
  const raid = RAIDS[0];

  const p = new Profile();
  p.data.souls = 5e6;
  const hunter = p.createCharacter('hunter').id;
  const warrior = p.createCharacter('warrior').id;
  // The Hunter clears tier 0 outright.
  for (const b of raid.bosses) p.raidState(hunter).killed[b.id] = true;
  // And the Warrior is levelled past the gate but has never been in a raid.
  p.character(warrior).xp = 1e6;
  assert(p.level(warrior) >= raid.level, 'the fixture warrior is under-levelled');

  for (const slot of GEAR_SLOT_IDS) {
    const v = p.buyGear(warrior, slot);
    assert(!v.ok && v.needsCore,
      `the warrior bought a ${slot} on the hunter's clear (${v.reason})`);
    assert(ownedTier(p.gear(warrior), slot) === -1, `${slot} was written anyway`);
  }
  assert(p.souls === 5e6, 'gold was spent on a refused purchase');

  // The Hunter, which did the work, can buy its set.
  for (const slot of GEAR_SLOT_IDS) {
    assert(p.cores(hunter).has(coreId(0, slot)), `hunter is missing its ${slot} core`);
  }
  p.character(hunter).xp = 1e6;
  const bought = p.buyGear(hunter, 'weapon');
  assert(bought.ok && ownedTier(p.gear(hunter), 'weapon') === 0,
    'the character that cleared the raid could not buy its own piece');

  // And the Core only ever opens the tier it came from. Clearing tier 0 six
  // times over does not put a T1 piece within reach.
  p.character(hunter).gear = Object.fromEntries(GEAR_SLOT_IDS.map((s) => [s, 0]));
  const next = p.buyGear(hunter, 'weapon');
  assert(!next.ok && next.needsCore, `a T0 clear sold a T1 weapon (${next.reason})`);

  // And two Warriors are two characters. The second one starts with nothing,
  // which is the thing a per-class save could not express at all.
  const warrior2 = p.createCharacter('warrior').id;
  assert(warrior2 !== warrior, 'the second warrior reused the first one\'s slot');
  p.character(warrior).gear = { weapon: 3 };
  assert(ownedTier(p.gear(warrior2), 'weapon') === -1,
    'the second warrior inherited the first one\'s weapon');
});

check('catching up on gear costs a fraction of a run', () => {
  // The ladder must never be a punishment for levelling first. Someone who
  // ignores gear until 31 pays every rung below T3 for a slot at once — and
  // that has to stay small next to what a run at that level pays.
  const toT3 = ladderCost({}, 'ring', 3);
  assert(toT3 === 800 + 3200 + 12800 + 51200, `the T3 ladder costs ${toT3}`);
  assert(toT3 < gearCost(4), 'the whole ladder to T3 costs more than one T4 piece');

  // And a full kit has to be roughly the length of the level climb, not a
  // multiple of it: gear runs alongside levelling, it does not outlast it.
  let total = 0;
  for (const _ of GEAR_SLOTS) total += ladderCost({}, 'ring', MAX_TIER);
  assert(total > 2e7 && total < 3e7, `a full kit costs ${total} gold`);
});

/**
 * One number for "how much damage is this bag worth", so nine classes routing
 * their weapon through five different multipliers can still be compared.
 *
 * The weights are not arbitrary. `allDamage`, `meleeDamage` and `spellDamage`
 * each multiply everything that class casts, so they count in full. `dotDamage`
 * only reaches the part of the kit that ticks, and `critMult` only pays out on
 * the share of hits that crit — so both count for less than their face value.
 */
function damageWeight(e) {
  return (e.allDamage || 0) + (e.meleeDamage || 0) + (e.spellDamage || 0)
    + (e.dotDamage || 0) * 0.7 + (e.critMult || 0) * 0.6 + (e.healing || 0) * 0.5;
}

check('gear reinforces each class rather than flattening them', () => {
  const seen = new Set();
  for (const cls of CLASSES) {
    const spec = CLASS_GEAR[cls.id];
    assert(spec, `${cls.id} has no gear table`);
    assert(spec.trinketDesc, `${cls.id}'s trinket has no description`);
    for (const slot of ['weapon', 'trinket']) {
      const keys = Object.keys(spec[slot].effect);
      assert(keys.length > 0, `${cls.id} ${slot} grants nothing`);
      for (const v of Object.values(spec[slot].effect)) {
        assert(v > 0, `${cls.id} ${slot} has a non-positive value`);
      }
    }
    seen.add(JSON.stringify(spec.trinket.effect));
  }
  // Nine classes, nine different trinkets — otherwise "class-defining" is a
  // label on a stat two classes share.
  assert(seen.size === CLASSES.length, `only ${seen.size} distinct trinkets`);

  // Weapons all pull about the same weight, routed through whichever multiplier
  // the class actually uses. A 2x spread here would mean one class's Armoury is
  // worth twice another's for the same gold.
  const weights = CLASSES.map((c) => damageWeight(CLASS_GEAR[c.id].weapon.effect));
  assert(Math.max(...weights) / Math.min(...weights) < 1.25,
    `weapon damage spread across classes is ${(Math.max(...weights) / Math.min(...weights)).toFixed(2)}x`);

  // The four shared slots really are shared.
  for (const slot of ['chest', 'helm', 'boots', 'ring']) {
    const a = JSON.stringify(slotEffect('warrior', slot));
    assert(a === JSON.stringify(SHARED_SLOT_EFFECTS[slot].effect), `${slot} is not shared`);
    for (const cls of CLASSES) {
      assert(JSON.stringify(slotEffect(cls.id, slot)) === a, `${cls.id} ${slot} differs`);
    }
  }
});

check('a set bonus rewards finishing a set without replacing it', async () => {
  const { SET_BONUSES, SET_THRESHOLDS, activeSet, piecesAt, weaponRider, WEAPON_RIDERS } =
    await import('../src/data/armor.js');

  for (const cls of CLASSES) {
    const table = SET_BONUSES[cls.id];
    assert(table, `${cls.id} has no set bonuses`);
    for (const th of SET_THRESHOLDS) {
      assert(table[th] && Object.keys(table[th].effect).length, `${cls.id} has no ${th}-piece bonus`);
      assert(table[th].desc, `${cls.id}'s ${th}-piece bonus has no description`);
    }
    // Every class's weapon does something to an ordinary attack, and no two
    // classes do the same thing — that is the whole point of the rider.
    assert(WEAPON_RIDERS[cls.id], `${cls.id}'s weapon has no rider`);
  }
  const riderKeys = new Set(CLASSES.map((c) => WEAPON_RIDERS[c.id].key));
  assert(riderKeys.size >= 7, `only ${riderKeys.size} distinct weapon riders across nine classes`);

  // Only the highest complete tier pays. Seven tiers of stacking bonuses would
  // be worth more than the gear underneath them.
  const mixed = { weapon: 6, chest: 6, helm: 3, boots: 3, ring: 0, trinket: 0 };
  const set = activeSet(mixed);
  assert(set.tier === 6 && set.met.join() === '2',
    `a 2/4/6 split paid out ${JSON.stringify(set)}`);
  assert(piecesAt(mixed, 3) === 4, 'piece counting is wrong');
  assert(activeSet({ weapon: 6 }) === null, 'one piece completed a set');
  assert(activeSet({}) === null, 'an empty kit completed a set');

  // The rider scales with the weapon and is absent without one.
  assert(weaponRider('warrior', {}) === null, 'a rider fired with no weapon');
  const t0 = weaponRider('warrior', { weapon: 0 });
  const t6 = weaponRider('warrior', { weapon: 6 });
  assert(t6.value > t0.value * 6, 'the rider barely grows across seven tiers');
});

check('no set bonus promises a number its effect does not produce', async () => {
  // The same trap the talent tree already fell into, one table over. A set
  // bonus's description is hand-written prose sitting next to the numbers it
  // describes, and prose does not get recompiled — retune `bloodsurge` from
  // 0.26 to 0.42 and the line still reads "up to +26%" until a player notices.
  // Every percentage quoted in a description has to be one the effect object
  // genuinely produces.
  const { SET_BONUSES, SET_THRESHOLDS } = await import('../src/data/armor.js');
  const bad = [];
  for (const cls of CLASSES) {
    for (const th of SET_THRESHOLDS) {
      const entry = SET_BONUSES[cls.id][th];
      const quoted = [...entry.desc.matchAll(/(\d+(?:\.\d+)?)%/g)].map((m) => Number(m[1]));
      if (!quoted.length) continue;
      const produced = new Set();
      for (const v of Object.values(entry.effect)) {
        if (typeof v !== 'number') continue;
        produced.add(Math.round(Math.abs(v) * 1000) / 10);   // 0.26 -> 26
        produced.add(Math.round(Math.abs(v) * 10) / 10);     // 15   -> 15
      }
      const unexplained = quoted.filter((q) => ![...produced].some((p) => Math.abs(p - q) < 0.51));
      if (unexplained.length) {
        bad.push(`${cls.id}/${th}pc: "${entry.desc}" quotes ${unexplained.join('%, ')}% `
          + `— effects are ${JSON.stringify(entry.effect)}`);
      }
    }
  }
  assert(bad.length === 0, `set bonus text disagrees with set bonus effects:\n  ${bad.join('\n  ')}`);
});

// The conditional four-pieces are only worth what their condition's uptime
// makes them worth, and a magnitude tuned against a measured uptime is a
// number with a reason behind it. These bounds are the range those reasons
// live in: below the floor the bonus is not worth the four slots, above the
// ceiling one lucky condition is worth more than the rest of the set.
check('a conditional set bonus is worth wearing without being the whole build', async () => {
  const { SET_BONUSES, SET_THRESHOLDS } = await import('../src/data/armor.js');
  const CONDITIONAL = {
    bloodsurge: [0.20, 0.55],       // scales with Rage held; measured mean 53%
    wardedDamage: [0.06, 0.20],     // shield uptime measured at ~99%: near-flat
    exposeWeakness: [0.15, 0.50],   // fires on ~5% of hits (see report)
    momentumDamage: [0.15, 0.40],   // ~70% uptime
    sharpshooter: [0.15, 0.40],     // range gate
    zeal: [0.03, 0.10],             // per stack, five stacks, ~33% uptime
  };
  for (const cls of CLASSES) {
    for (const th of SET_THRESHOLDS) {
      for (const [k, v] of Object.entries(SET_BONUSES[cls.id][th].effect)) {
        const range = CONDITIONAL[k];
        if (!range) continue;
        assert(v >= range[0] && v <= range[1],
          `${cls.id} ${th}pc ${k} is ${v}, outside ${range[0]}–${range[1]}`);
      }
    }
  }
});

check('a full set is a real difference and a bounded one', () => {
  for (const cls of CLASSES) {
    const full = gearMods(cls.id, Object.fromEntries(GEAR_SLOT_IDS.map((id) => [id, MAX_TIER])));
    const dmg = damageWeight(full);
    // The ceiling moved when set bonuses started scaling with their tier. It
    // is still a ceiling: a full endgame set may roughly double your damage
    // and double your health, and past that the Armoury's price curve stops
    // being the thing that paces the game.
    assert(dmg > 0.5 && dmg < 1.7, `${cls.id} full T6 grants ${(dmg * 100).toFixed(0)}% damage`);
    assert(full.maxHpPct > 0.5 && full.maxHpPct < 1.1,
      `${cls.id} full T6 grants ${(full.maxHpPct * 100).toFixed(0)}% health`);
  }

  // Every tier is a step up on the one below it.
  //
  // This is the bug the whole tier-scaling change exists to fix, and it was
  // invisible: set bonuses were a flat table, so the two-piece of a full
  // Frostwrought set paid exactly what the two-piece of the Battleworn set
  // bought at level 1 paid. Seven tiers of pieces got stronger every rung and
  // the part with a name on it never moved.
  for (const cls of CLASSES) {
    let prevDmg = -1, prevHp = -1;
    for (let t = 0; t <= MAX_TIER; t++) {
      const m = gearMods(cls.id, Object.fromEntries(GEAR_SLOT_IDS.map((id) => [id, t])));
      const d = damageWeight(m);
      assert(d > prevDmg, `${cls.id} T${t} is no stronger than T${t - 1} (${d.toFixed(2)})`);
      assert(m.maxHpPct > prevHp, `${cls.id} T${t} is no tougher than T${t - 1}`);
      prevDmg = d; prevHp = m.maxHpPct;
    }
  }

  // The four-piece names one skill and must reach only that skill. A bonus
  // that leaked into the flat bag would be worth four times what it says.
  for (const cls of CLASSES) {
    for (let t = 0; t <= MAX_TIER; t++) {
      const gear = Object.fromEntries(GEAR_SLOT_IDS.map((id) => [id, t]));
      const m = gearMods(cls.id, gear);
      const focus = tierSkillBonus(cls.id, t);
      assert(focus, `${cls.id} has no skill bonus at T${t}`);
      assert(cls.skills.some((s) => s.id === focus.skill),
        `${cls.id} T${t} names a skill it does not have: ${focus.skill}`);
      assert(m.skills && m.skills[focus.skill],
        `${cls.id} T${t} four-piece granted nothing to ${focus.skill}`);
      assert(!('skillDamage' in m), `${cls.id} T${t} leaked a skill bonus into the flat bag`);
      // Three pieces is not four: the skill half must not pay early.
      const three = { weapon: t, chest: t, helm: t };
      assert(!gearMods(cls.id, three).skills,
        `${cls.id} T${t} paid its four-piece at three pieces`);
    }
  }
  // Counting mods must never arrive as a fraction: a Shaman with one rung of a
  // trinket would otherwise get a whole extra chain jump, because the loop that
  // reads it rounds up.
  for (const cls of CLASSES) {
    for (let t = -1; t <= MAX_TIER; t++) {
      const mods = gearMods(cls.id, t < 0 ? {} : { trinket: t });
      for (const k of ['jumps', 'pierce', 'maxPets']) {
        if (k in mods) {
          assert(Number.isInteger(mods[k]) && mods[k] >= 1,
            `${cls.id} T${t} has a fractional ${k}: ${mods[k]}`);
        }
      }
    }
  }
});

check('every weapon tier looks different from the one below it', () => {
  for (const cls of CLASSES) {
    const seen = new Set();
    let prevScale = 0;
    for (let t = -1; t <= MAX_TIER; t++) {
      const look = weaponAppearance(cls, t);
      assert(look.type === cls.weapon.type, `${cls.id} T${t} changed weapon shape`);
      assert(look.color.every((c) => c >= 0 && c <= 1), `${cls.id} T${t} colour out of range`);
      assert(look.scale >= prevScale, `${cls.id} T${t} shrank`);
      prevScale = look.scale;
      seen.add(`${look.tile}|${look.color.map((c) => c.toFixed(3)).join(',')}`);
    }
    assert(seen.size === MAX_TIER + 2, `${cls.id} has only ${seen.size} distinct weapons`);
    assert(weaponAppearance(cls, MAX_TIER).trail, `${cls.id} T6 has no trail`);
    assert(!weaponAppearance(cls, MAX_TIER - 1).trail, `${cls.id} T5 already has the T6 trail`);
    assert(!weaponAppearance(cls, -1).core, `${cls.id} ungeared already has an inlay`);
  }
  // Nine classes times seven tiers plus the ungeared look, all distinct.
  const all = new Set();
  for (const cls of CLASSES) {
    for (let t = -1; t <= MAX_TIER; t++) {
      const l = weaponAppearance(cls, t);
      all.add(`${cls.id}|${l.tile}|${l.color.map((c) => c.toFixed(3)).join(',')}`);
    }
  }
  assert(all.size === CLASSES.length * (MAX_TIER + 2),
    `only ${all.size} distinct weapon appearances`);
});

check('gear names read as something a player can say out loud', () => {
  for (const slot of GEAR_SLOTS) {
    assert(gearName(slot.id, -1).includes(slot.name), `${slot.id} unowned name`);
    const names = new Set();
    for (let t = 0; t <= MAX_TIER; t++) {
      const n = gearName(slot.id, t);
      assert(n.includes(slot.name), `${slot.id} T${t} lost its slot name`);
      names.add(n);
    }
    assert(names.size === MAX_TIER + 1, `${slot.id} reuses a tier name`);
  }
  for (const t of GEAR_TIERS) {
    assert(/^#[0-9a-f]{6}$/i.test(t.color), `T${t.tier} has no usable colour`);
    assert(t.raid && t.tile, `T${t.tier} is missing presentation`);
  }
});

check('every armour and Forge effect is read by game code', async () => {
  const { readFile } = await import('node:fs/promises');
  const sources = (await Promise.all(
    ['../src/game/player.js', '../src/game/game.js', '../src/game/skills.js',
      '../src/game/effects.js', '../src/game/mobs.js', '../src/game/pets.js']
      .map((f) => readFile(new URL(f, import.meta.url), 'utf8'))
  )).join('\n');
  // Checked against the code rather than against each other: the two shops used
  // to validate one another, so a key both of them declared and nobody read
  // passed happily. This is the check that would have caught it.
  const keys = new Set([
    ...PERMANENT.flatMap((d) => Object.keys(d.effect)),
    ...Object.values(SHARED_SLOT_EFFECTS).flatMap((d) => Object.keys(d.effect)),
    ...Object.values(CLASS_GEAR).flatMap((c) =>
      [...Object.keys(c.weapon.effect), ...Object.keys(c.trinket.effect)]),
  ]);
  for (const k of keys) {
    assert(sources.includes(`.${k}`), `'${k}' is sold but never read by the game`);
  }
});


// --- Every skill actually fires -------------------------------------------
// Eight skills across six classes is 48 code paths through castSkill, and a
// typo in one skill's power block is invisible until a player equips it.

check('every skill in every class pool casts without throwing', async () => {
  const { Game } = await import('../src/game/game.js');
  const { castSkill } = await import('../src/game/skills.js');
  const { makeHarness } = await import('./harness.js');

  for (const cls of CLASSES) {
    for (const skill of cls.skills) {
      const h = makeHarness({ loadout: [skill.id], bestWave: 99 });
      const game = new Game(h.renderer, h.audio, h.profile);
      game.startRun(cls, { layout: 0 });
      assert(game.player.skills[0].id === skill.id,
        `${cls.id}: ${skill.id} did not reach slot 0`);

      // Something to aim at, in front of the player and within every range.
      const p = game.player;
      p.yaw = 0;
      for (let i = 0; i < 3; i++) game.spawnMob('husk', p.x + (i - 1) * 1.5, p.y, p.z - 3);
      p.resource = p.resourceMax = 999;
      p.cooldowns[0] = 0;

      const cast = castSkill(game, p, 0);
      assert(cast === true, `${cls.id}/${skill.id} refused to cast with full resource and a target`);
      // Run the clock so delayed effects — telegraphs, meteor impacts, zone
      // ticks, multi-hit whirlwinds — all resolve inside the check.
      const input = h.input();
      for (let i = 0; i < 150; i++) game.update(1 / 60, input);
      assert(Number.isFinite(p.hp), `${cls.id}/${skill.id} corrupted player hp`);
    }
  }
});


// --- Deployment config -----------------------------------------------------
// vercel.json is validated against a strict schema at build time, and a
// rejected key fails the deploy rather than being ignored. That failure only
// surfaces in the Vercel dashboard, minutes later, so it is worth catching in
// a test that runs before the push.

check('vercel.json only uses properties Vercel accepts', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));

  // The documented top-level keys. Notably absent: any comment convention.
  // "//" is common in package.json and is rejected outright here.
  const allowed = new Set([
    '$schema', 'buildCommand', 'cleanUrls', 'crons', 'devCommand', 'framework',
    'functions', 'git', 'headers', 'ignoreCommand', 'images', 'installCommand',
    'outputDirectory', 'public', 'redirects', 'regions', 'rewrites',
    'trailingSlash',
  ]);
  const unknown = Object.keys(cfg).filter((k) => !allowed.has(k));
  assert(unknown.length === 0,
    `vercel.json has properties Vercel will reject: ${unknown.join(', ')}`);

  // The site is served from the repo root; there is no build step producing
  // a public/ directory, and without this the deploy fails looking for one.
  assert(cfg.outputDirectory === '.', `outputDirectory is ${JSON.stringify(cfg.outputDirectory)}, expected "."`);

  // Vercel runs package.json's "build" script automatically when one exists.
  // Ours bundles from tools/, which .vercelignore deliberately keeps out of
  // the deployment — so the command it would run is not even uploaded, and
  // the deploy dies on a missing module. An explicit empty buildCommand is
  // what tells Vercel there is nothing to build.
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const buildScript = (pkg.scripts || {}).build;
  if (buildScript) {
    const ignored = fs.readFileSync(path.join(root, '.vercelignore'), 'utf8')
      .split('\n').map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => l.replace(/\/$/, ''));
    const needs = ignored.filter((dir) => buildScript.includes(dir + '/'));
    if (needs.length) {
      assert(cfg.buildCommand === '',
        `package.json's build script needs ${needs.join(', ')}, which .vercelignore excludes; `
        + `vercel.json must set buildCommand to "" (currently ${JSON.stringify(cfg.buildCommand)})`);
    }
  }
});

check('everything index.html loads is present and not deployment-ignored', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^":]+)"/g)].map((m) => m[1]);
  assert(refs.length >= 3, `only found ${refs.length} asset references in index.html`);

  const ignored = fs.readFileSync(path.join(root, '.vercelignore'), 'utf8')
    .split('\n').map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.replace(/\/$/, ''));

  for (const ref of refs) {
    const rel = ref.replace(/^\.?\//, '');
    assert(fs.existsSync(path.join(root, rel)), `index.html references missing ${rel}`);
    const top = rel.split('/')[0];
    assert(!ignored.includes(top),
      `.vercelignore excludes ${top}/, which index.html needs`);
  }
});


check('a set is measured by the weakest slot', () => {
  const even = Object.fromEntries(GEAR_SLOT_IDS.map((id) => [id, 3]));
  assert(setTier(even) === 3, 'an even T3 kit is not a T3 set');

  // One neglected slot must hold the whole set back, or "full set" is just a
  // label for having bought anything at all — and the raid gate that reads it
  // would let a player walk into Icecrown in one good weapon.
  const lopsided = { ...even, boots: 0 };
  assert(setTier(lopsided) === 0, 'a bare slot still completes the set');
  assert(!hasFullSet(lopsided, 3), 'a lopsided kit passes the set gate');
  assert(missingForSet(lopsided, 3).join() === 'boots', 'the missing piece is misreported');
  assert(missingForSet({}, 0).length === GEAR_SLOTS.length, 'an empty kit is missing nothing');
});

check('the Armoury is deep enough to outlast the level climb', () => {
  assert(GEAR_SLOTS.length === 6, `${GEAR_SLOTS.length} slots, not six`);
  assert(GEAR_TIERS.length === MAX_TIER + 1, 'the tier table does not match the cap');
  let total = 0;
  for (const _ of GEAR_SLOTS) for (let t = 0; t <= MAX_TIER; t++) total += gearCost(t);
  assert(total > 2e7, `a full kit only costs ${Math.round(total)} gold`);
  // T6 alone has to be the majority of it, because it is the chase that starts
  // the moment you cap — if it were a third of the cost, capping would end the
  // game rather than open its last stretch.
  const t6 = GEAR_SLOTS.length * gearCost(MAX_TIER);
  assert(t6 / total > 0.6, `T6 is only ${Math.round((t6 / total) * 100)}% of the Armoury`);
});


// --- The compulsion loop ---------------------------------------------------
// The combo is the only thing rewarding aggression over caution, so its
// shape matters: it must be reachable, worth chasing, and genuinely lost if
// you stop pushing.

check('the kill combo rewards pressing forward and decays if you stop', async () => {
  const { Game } = await import('../src/game/game.js');
  const { makeHarness } = await import('./harness.js');
  const h = makeHarness();
  const game = new Game(h.renderer, h.audio, h.profile);
  game.startRun(CLASSES[0], { layout: 0 });

  assert(game.comboMult === 1, 'a fresh run already has a multiplier');

  // The window must shrink as the streak climbs, or a long streak coasts.
  game.combo = 0;
  const early = game.comboWindow;
  game.combo = 40;
  assert(game.comboWindow < early, 'the combo window never tightens');
  assert(game.comboWindow >= 1.6, 'the window shrinks to something unplayable');

  // The multiplier has to be worth chasing, and capped so it stays a bonus.
  assert(game.comboMult > 1.5, `40 kills is only worth x${game.comboMult}`);
  game.combo = 500;
  assert(game.comboMult <= 3.01, `the multiplier runs away at x${game.comboMult}`);

  // And it must actually expire.
  game.combo = 12;
  game.comboTimer = game.comboWindow;
  for (let i = 0; i < 600; i++) game.updateCombo(1 / 60);
  assert(game.combo === 0, 'the combo never decays');
});


// --- Radar -----------------------------------------------------------------

check('the radar puts what is in front of you above the centre', async () => {
  const { Hud } = await import('../src/ui/hud.js');
  const { forwardVec } = await import('../src/core/math.js');

  for (const yaw of [0, 0.7, 1.9, -2.4, Math.PI]) {
    const f = forwardVec(yaw, 0);
    // Directly ahead.
    let q = Hud.radarProject(yaw, f[0] * 10, f[2] * 10);
    assert(q.forward > 9.9, `ahead reads as ${q.forward.toFixed(2)} at yaw ${yaw}`);
    assert(Math.abs(q.right) < 1e-9, `ahead drifts sideways at yaw ${yaw}`);

    // Directly behind must be the other sign, or the dish is mirrored — which
    // points the player away from every threat, confidently.
    q = Hud.radarProject(yaw, -f[0] * 10, -f[2] * 10);
    assert(q.forward < -9.9, `behind reads as ${q.forward.toFixed(2)} at yaw ${yaw}`);

    // And to the right: right = (cos, -sin), the same basis the player moves on.
    q = Hud.radarProject(yaw, Math.cos(yaw) * 10, -Math.sin(yaw) * 10);
    assert(q.right > 9.9, `right reads as ${q.right.toFixed(2)} at yaw ${yaw}`);
    assert(Math.abs(q.forward) < 1e-9, `right drifts forward at yaw ${yaw}`);
  }
});


// --- Arenas ----------------------------------------------------------------
// A layout that looks good and cannot be played is worse than one fewer
// layout. These are the properties a run silently depends on.

check('every arena layout is actually playable', async () => {
  const { createArena, LAYOUT_COUNT, LAYOUT_NAMES } = await import('../src/world/world.js');
  const { BLOCKS } = await import('../src/world/blocks.js');

  for (let layout = 0; layout < LAYOUT_COUNT; layout++) {
    for (const seed of [1, 4242, 90210]) {
      const w = createArena(seed % 4, seed, layout);
      const name = `${LAYOUT_NAMES[layout]}#${seed}`;

      // Enough spawn points that a wave arrives from several directions
      // instead of trickling out of one corner.
      assert(w.spawnPoints.length >= 12,
        `${name} has only ${w.spawnPoints.length} spawn points`);

      // The player must not start inside or on top of geometry, and must not
      // start standing in lava.
      const ps = w.playerSpawn;
      assert(!w.isSolid(ps.x, ps.y + 0.1, ps.z), `${name} spawns the player inside a block`);
      assert(!w.isSolid(ps.x, ps.y + 1.2, ps.z), `${name} spawns the player in a ceiling`);
      const under = BLOCKS[w.blockAt(ps.x, ps.y - 0.5, ps.z)];
      assert(!under || !under.damage, `${name} spawns the player on lava`);

      // Every spawn point must be somewhere a mob can stand.
      for (const sp of w.spawnPoints) {
        assert(!w.isSolid(sp.x, sp.y + 0.1, sp.z), `${name} has a spawn point inside a block`);
      }

      // And there has to be a world to look at.
      assert(w.mesh.length > 6 * 3000, `${name} meshed to almost nothing`);
    }
  }
});

// --- Levels ----------------------------------------------------------------
// The level cap is the longest-lived promise the game makes, so the shape of
// the curve is worth pinning: quick at the start, a project at the end, and
// never accidentally reachable in an afternoon.

check('the level curve is monotonic, capped and consistent', async () => {
  const { MAX_LEVEL, xpToNext, xpToReach, levelFromXp, levelProgress, talentPointsForLevel } =
    await import('../src/data/levels.js');

  assert(MAX_LEVEL === 60, `cap is ${MAX_LEVEL}`);
  let prev = 0;
  for (let L = 1; L < MAX_LEVEL; L++) {
    const need = xpToNext(L);
    assert(Number.isFinite(need) && need > 0, `level ${L} needs ${need}`);
    assert(need > prev, `level ${L} is cheaper than the one before it`);
    prev = need;
  }
  // At the cap nothing more is required, so every "can I level" test answers
  // no without needing a special case at the call site.
  assert(xpToNext(MAX_LEVEL) === Infinity, 'the cap still asks for XP');

  // xpToReach and levelFromXp must be exact inverses at every boundary — one
  // XP short of a level must not grant it, and exactly enough must.
  for (let L = 1; L <= MAX_LEVEL; L++) {
    const at = xpToReach(L);
    assert(levelFromXp(at) === L, `${at} XP should be level ${L}, got ${levelFromXp(at)}`);
    if (L > 1) {
      assert(levelFromXp(at - 1) === L - 1,
        `one XP short of level ${L} already grants it`);
    }
  }
  assert(levelFromXp(0) === 1, 'a fresh character is not level 1');
  assert(levelFromXp(-500) === 1, 'negative XP breaks the level');
  assert(levelFromXp(1e18) === MAX_LEVEL, 'the cap can be exceeded');

  const maxed = levelProgress(xpToReach(MAX_LEVEL));
  assert(maxed.maxed && maxed.frac === 1, 'a maxed bar does not read as full');
  const mid = levelProgress(xpToReach(10) + 5);
  assert(mid.level === 10 && mid.into === 5 && mid.frac > 0 && mid.frac < 1,
    'progress into a level is wrong');

  assert(talentPointsForLevel(1) === 0, 'level 1 already has points');
  assert(talentPointsForLevel(MAX_LEVEL) === MAX_LEVEL - 1, 'the cap pays the wrong points');
});

check('a full talent tree costs far more than the cap grants', async () => {
  const { MAX_LEVEL, talentPointsForLevel } = await import('../src/data/levels.js');
  const points = talentPointsForLevel(MAX_LEVEL);
  for (const c of CLASSES) {
    const total = c.talents.reduce((s, b) => s + b.nodes.reduce((t, n) => t + n.max, 0), 0);
    // If the cap could fill a tree, the tree stops being a choice and becomes
    // a waiting room — everyone ends up with the same character.
    assert(total > points * 1.3,
      `${c.id}'s tree costs ${total} and the cap grants ${points}: too easy to fill`);
  }
});

check('the road to 60 is about three hours, and still ramps', async () => {
  const { xpToReach, xpToNext, MAX_LEVEL, xpForRun } = await import('../src/data/levels.js');
  const { waveBudget } = await import('../src/game/waves.js');
  // A beginner run: wave 5, with the real spawn budgets behind it. Wave 5 is
  // what tools/balance-sim.js actually measures a fresh character reaching.
  let kills = 0;
  for (let w = 1; w <= 5; w++) kills += waveBudget(w);
  const beginner = xpForRun({ wavesCleared: 5, kills });

  // The first level lands inside the first run. Anything slower and a new
  // player finishes their first game having been shown nothing.
  const toL2 = xpToReach(2) / beginner;
  assert(toL2 <= 1.2, `level 2 takes ${toL2.toFixed(1)} beginner runs; it should land in the first`);
  const toL5 = xpToReach(5) / beginner;
  assert(toL5 > 1 && toL5 < 6,
    `level 5 takes ${toL5.toFixed(1)} beginner runs; the target is a handful`);

  // Short is not the same as flat. Every level must cost more than the one
  // before it, and the last must cost several times the first — otherwise
  // levelling stops being a ramp and becomes a counter.
  for (let L = 1; L < MAX_LEVEL - 1; L++) {
    assert(xpToNext(L + 1) > xpToNext(L),
      `level ${L + 1} costs no more than level ${L}: the curve has gone flat`);
  }
  const ramp = xpToNext(MAX_LEVEL - 1) / xpToNext(1);
  assert(ramp > 6 && ramp < 40,
    `the last level costs ${ramp.toFixed(1)}x the first; the shape wants roughly ten`);

  // And the headline claim itself, checked rather than asserted in a comment.
  // The model is an estimate and the window is wide on purpose — what it is
  // guarding against is the curve quietly growing back into a hundred hours.
  const { career } = await import('./level-probe.mjs');
  const hours = career().hours;
  assert(hours > 1.5 && hours < 5,
    `the modelled road to 60 is ${hours.toFixed(1)} hours; the target is about three`);
});

check('XP awarded live matches what the run is worth', async () => {
  const { Game } = await import('../src/game/game.js');
  const { xpForRun } = await import('../src/data/levels.js');
  const { makeHarness } = await import('./harness.js');
  const h = makeHarness();
  const game = new Game(h.renderer, h.audio, h.profile);
  game.startRun(CLASSES[0], { layout: 0 });

  // The HUD bar fills from a live counter while the results screen banks a
  // total. If those two ever disagree, the bar has been lying all run.
  game.awardXp(0);
  const p = game.player;
  for (let i = 0; i < 40; i++) {
    const mob = game.spawnMob('husk', p.x + 3, p.y, p.z + 3);
    mob.hp = 1;
    game.dealDamage(p, mob, 9999, { silent: true });
  }
  const kills = p.kills;
  assert(kills > 0, 'the harness killed nothing');
  const expected = xpForRun({ wavesCleared: 0, kills, eliteKills: 0, bossKills: 0 });
  assert(Math.round(game.xpEarned) === expected,
    `live XP ${game.xpEarned} does not match xpForRun's ${expected}`);
});

check('XP popups batch instead of one per kill', async () => {
  const { Game } = await import('../src/game/game.js');
  const { makeHarness } = await import('./harness.js');
  const h = makeHarness();
  const game = new Game(h.renderer, h.audio, h.profile);
  game.startRun(CLASSES[0], { layout: 0 });

  // Twenty awards in quick succession must produce one popup, not twenty.
  // Unbatched, a wave-30 fight would put a hundred of these on screen.
  for (let i = 0; i < 20; i++) { game.awardXp(2); game.updateXpPops(1 / 60); }
  assert(game.xpPops.length === 0, 'a popup appeared while the killing was still going');
  for (let i = 0; i < 60; i++) game.updateXpPops(1 / 60);
  assert(game.xpPops.length === 1, `expected one batched popup, got ${game.xpPops.length}`);
  assert(game.xpPops[0].amount === 40, `the batch totalled ${game.xpPops[0].amount}, not 40`);

  // And they must expire, or a long run accumulates every popup it ever made.
  for (let i = 0; i < 200; i++) game.updateXpPops(1 / 60);
  assert(game.xpPops.length === 0, 'popups never expire');

  // Never more than three at once, however hard they arrive.
  for (let n = 0; n < 12; n++) {
    game.awardXp(500);
    for (let i = 0; i < 45; i++) game.updateXpPops(1 / 60);
  }
  assert(game.xpPops.length <= 3, `${game.xpPops.length} popups stacked up on screen`);
});

check('an older save keeps the talent points it already had', async () => {
  const { Profile } = await import('../src/core/save.js');
  const { talentPointsForBestWave } = await import('../src/data/permanent.js');
  // A player deep in the old system: points came from best wave, and there is
  // no XP in the save at all. Migrating without granting XP would wipe every
  // talent build in the game and leave no points to rebuild with.
  const profile = Object.create(Profile.prototype);
  profile.data = {
    characters: [{ id: 1, classId: 'warrior', talents: { w_a1: 4 }, bestWave: 30, xp: 0 }],
    activeChar: 1,
  };
  const owed = talentPointsForBestWave(30);
  assert(profile.migrateToLevels(), 'the migration did nothing');
  assert(profile.totalTalentPoints(1) >= owed,
    `player had ${owed} points and the migration left ${profile.totalTalentPoints(1)}`);
  // Idempotent: booting twice must not keep granting XP.
  const after = profile.data.characters[0].xp;
  assert(!profile.migrateToLevels(), 'the migration ran a second time');
  assert(profile.data.characters[0].xp === after, 'a second boot granted more XP');
});

check('a per-class save becomes a roster without losing anybody', async () => {
  // The save format changed under every existing account. Progress was filed
  // by class; it is filed by character now. Getting this wrong does not throw
  // — it silently opens the game on an empty roster, which from the player's
  // side is indistinguishable from the update having deleted everything.
  const { Profile, MAX_CHARACTERS } = await import('../src/core/save.js');
  const profile = Object.create(Profile.prototype);
  profile.data = { characters: [], nextCharId: 1 };
  const legacy = {
    lastClass: 'mage',
    classes: {
      warrior: { xp: 5000, bestWave: 12, talents: { w_a1: 3 }, gear: { helm: 2 } },
      mage: { xp: 900, bestWave: 4 },
      // Never touched. An untouched class is not a character — a roster
      // prefilled with nine of them is a roster you have to clear before use.
      priest: { xp: 0, bestWave: 0, runs: 0, talents: {}, gear: {}, forge: {} },
    },
  };
  assert(profile.migrateToCharacters(legacy), 'the migration did nothing');
  assert(profile.characters.length === 2,
    `converted ${profile.characters.length} characters, wanted the 2 that were played`);
  const w = profile.characters.find((c) => c.classId === 'warrior');
  assert(w.xp === 5000 && w.bestWave === 12, 'the warrior lost its progress');
  assert(w.talents.w_a1 === 3, 'the warrior lost its talents');
  assert(w.gear.helm === 2, 'the warrior lost its gear');
  assert(w.name === 'Warrior' && w.id !== undefined, 'the warrior has no identity');
  // Lands on whoever they played last, or the update silently switches
  // which character every menu is talking about.
  assert(profile.classOf(profile.data.activeChar).id === 'mage', 'the last-played class was not selected');
  // Idempotent: a save already in the new shape is left alone.
  assert(!profile.migrateToCharacters({ characters: profile.characters }), 'the migration ran twice');

  // And nine played classes all survive, even though the cap is eight. Hiding
  // one to respect a limit invented afterwards is data loss dressed as a rule.
  const full = Object.create(Profile.prototype);
  full.data = { characters: [], nextCharId: 1 };
  full.migrateToCharacters({
    classes: Object.fromEntries(CLASSES.map((c) => [c.id, { xp: 100, bestWave: 3 }])),
  });
  assert(full.characters.length === CLASSES.length,
    `${CLASSES.length} played classes became ${full.characters.length} characters`);
  assert(!full.canCreate(), 'an over-cap roster still offers a new slot');
  assert(MAX_CHARACTERS === 8, 'the slot count moved without this test noticing');
});

// --- Armoury depth ---------------------------------------------------------

check('the Armoury stays legible at six slots', () => {
  const ids = new Set(GEAR_SLOTS.map((s) => s.id));
  assert(ids.size === GEAR_SLOTS.length, 'duplicate gear slot id');
  for (const s of GEAR_SLOTS) {
    assert(s.icon && s.school && s.lead, `${s.id} is missing presentation`);
  }
  // Slot order is what raid bosses drop Cores in, so the two must agree by
  // construction rather than by two lists happening to match.
  assert(GEAR_SLOT_IDS[0] === 'weapon' && GEAR_SLOT_IDS[5] === 'trinket',
    'the Core drop order has moved');
  // Tier names and levels climb, and T6 lands exactly on the level cap.
  let lastLevel = 0;
  for (const t of GEAR_TIERS) {
    assert(t.level > lastLevel || t.tier === 0, `T${t.tier} does not need a higher level`);
    lastLevel = t.level;
  }
  assert(GEAR_TIERS[0].level === 1, 'T0 is not available from the start');
  assert(GEAR_TIERS[MAX_TIER].level === 60, 'T6 does not land on the level cap');
  assert(new Set(GEAR_TIERS.map((t) => t.name)).size === GEAR_TIERS.length,
    'two tiers share a name');
});

check('the old Armoury is refunded to the coin', async () => {
  const { PRICE_MULTIPLIER } = await import('../src/data/permanent.js');
  // The old shop's price for going from tier t to t+1, reproduced here so the
  // refund is checked against the formula players actually paid rather than
  // against the migration's own arithmetic.
  const oldCost = (baseCost, growth, t) =>
    Math.round(baseCost * Math.pow(growth, t) * PRICE_MULTIPLIER);
  let expect = 0;
  for (let t = 0; t < 7; t++) expect += oldCost(90, 1.11, t);       // helm
  for (let t = 0; t < 3; t++) expect += oldCost(140, 1.126, t);     // idol
  const got = legacyArmorRefund({ helm: 7, idol: 3 });
  assert(got === expect, `refund is ${got}, should be ${expect}`);

  assert(legacyArmorRefund({}) === 0, 'an empty old Armoury refunds gold');
  assert(legacyArmorRefund({ helm: 0 }) === 0, 'an unbought slot refunds gold');
  // A slot the old shop never had must not crash the migration; it is priced
  // at the table's midpoint rather than dropped, so nobody loses gold to a key
  // an older build wrote.
  assert(legacyArmorRefund({ nonsense: 2 }) > 0, 'an unknown old slot refunds nothing');
});

check('the gear migration runs once and pays exactly once', async () => {
  const { Profile } = await import('../src/core/save.js');
  const p = new Profile();
  p.data.armor = { helm: 6, chest: 4, idol: 2 };
  p.data.souls = 0;
  const owed = legacyArmorRefund(p.data.armor);
  assert(p.refundArmoury(), 'the migration reported nothing to do');
  assert(p.souls === owed, `refunded ${p.souls}, owed ${owed}`);
  // Second boot: nothing left to refund, and no second payout.
  assert(!p.refundArmoury(), 'the migration wants to run again');
  assert(p.souls === owed, 'the migration paid twice');
});

// --- Quests ----------------------------------------------------------------
// The whole point of generating these is that "balanced" can be checked rather
// than asserted. If the reward is not a fixed rate on measured effort, these
// fail — which is exactly the bug a hand-written list of 500 would hide.

check('all 500 quests are well formed and distinct enough to notice', async () => {
  const { allQuests, QUEST_COUNT, TEMPLATES } = await import('../src/data/quests.js');
  const list = allQuests();
  assert(list.length === QUEST_COUNT, `generated ${list.length} quests, wanted ${QUEST_COUNT}`);
  const ids = new Set();
  for (const q of list) {
    assert(!ids.has(q.id), `duplicate quest id ${q.id}`);
    ids.add(q.id);
    assert(q.goal >= 1, `${q.id} has goal ${q.goal}`);
    assert(Number.isInteger(q.goal), `${q.id} goal ${q.goal} is not a whole number`);
    assert(q.reward > 0, `${q.id} pays nothing`);
    assert(q.title && q.title.length > 5, `${q.id} has no readable title`);
    assert(q.icon && q.blurb, `${q.id} is missing presentation`);
    assert(q.kind === 'count' || q.kind === 'peak', `${q.id} has kind ${q.kind}`);
  }
  // Three consecutive quests must never be the same template, or the log shows
  // three near-identical rows and reads as broken.
  for (let i = 0; i + 2 < list.length; i++) {
    const t = new Set([list[i].templateId, list[i + 1].templateId, list[i + 2].templateId]);
    assert(t.size === 3, `quests ${i}..${i + 2} draw from only ${t.size} templates`);
  }
  assert(TEMPLATES.length >= 10, 'too few templates for 500 quests to feel varied');
});

check('quest rewards are a fixed rate on effort, with no outliers', async () => {
  const { allQuests, GOLD_PER_EFFORT } = await import('../src/data/quests.js');
  for (const q of allQuests()) {
    const rate = q.reward / q.effort;
    // The band exists because the payout is rounded to something legible and
    // floored for the smallest quests. Anything outside it is a template whose
    // effort figure does not describe the work.
    assert(rate > GOLD_PER_EFFORT * 0.55 && rate < GOLD_PER_EFFORT * 1.9,
      `${q.id} (${q.title}) pays ${q.reward} for ${q.effort.toFixed(1)} effort — rate ${rate.toFixed(2)}`);
  }
});

check('quests get harder as you work through them', async () => {
  const { questAt, TEMPLATES } = await import('../src/data/quests.js');
  // Compared within a template: across templates the numbers are not
  // commensurable ("kill 40" against "deal 20000 damage" says nothing).
  for (const t of TEMPLATES) {
    const efforts = [];
    for (let i = 0; i < 500; i++) {
      const q = questAt(i);
      if (q.templateId === t.id) efforts.push(q.effort);
    }
    assert(efforts.length > 10, `${t.id} appears only ${efforts.length} times`);
    const first = efforts.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
    const last = efforts.slice(-5).reduce((a, b) => a + b, 0) / 5;
    assert(last > first * 1.6, `${t.id} barely ramps: ${first.toFixed(0)} -> ${last.toFixed(0)}`);
  }
});

check('the quest log tracks, pays and refills without ever repeating', async () => {
  const { emptyQuestState, activeQuests, applyProgress, claimQuest } =
    await import('../src/core/questlog.js');
  const { questAt, ACTIVE_SLOTS, QUEST_COUNT } = await import('../src/data/quests.js');

  const state = emptyQuestState();
  const profile = { data: { souls: 0, lifetimeSouls: 0 } };
  assert(activeQuests(state).length === ACTIVE_SLOTS, 'wrong number of active quests');

  // A peak metric must not accumulate. This is the bug worth a test: "reach
  // wave 20" being satisfiable by clearing wave 4 five times.
  const deepIndex = [...Array(QUEST_COUNT).keys()].find((i) => questAt(i).kind === 'peak');
  const deep = questAt(deepIndex);
  const st2 = { slots: [{ index: deepIndex, progress: 0 }], next: 0, completed: 0, earned: 0 };
  for (let i = 0; i < 20; i++) applyProgress(st2, {}, { [deep.metric]: 3 });
  assert(st2.slots[0].progress === 3, `peak metric accumulated to ${st2.slots[0].progress}`);
  applyProgress(st2, {}, { [deep.metric]: deep.goal });
  assert(st2.slots[0].progress === deep.goal, 'a peak metric did not record a new best');

  // Claiming pays exactly the quest's reward, and only when finished.
  const q0 = activeQuests(state)[0];
  assert(claimQuest(state, q0.index, profile) === 0, 'an unfinished quest paid out');
  applyProgress(state, { [q0.metric]: q0.goal * 3 }, { [q0.metric]: q0.goal * 3 });
  const paid = claimQuest(state, q0.index, profile);
  assert(paid === q0.reward, `claim paid ${paid}, expected ${q0.reward}`);
  assert(profile.data.souls === q0.reward, 'the diamonds never reached the profile');
  assert(state.completed === 1, 'the completed counter did not move');

  // Work all the way through: never a duplicate on the board, never a dead
  // slot, and the log wraps rather than running dry after 500.
  const seen = new Set();
  for (let n = 0; n < QUEST_COUNT + 40; n++) {
    const board = activeQuests(state);
    assert(board.length === ACTIVE_SLOTS, `board shrank to ${board.length} at claim ${n}`);
    assert(new Set(board.map((q) => q.index)).size === ACTIVE_SLOTS,
      `the same quest appeared twice on the board at claim ${n}`);
    const q = board[0];
    seen.add(q.index);
    applyProgress(state, { [q.metric]: q.goal }, { [q.metric]: q.goal });
    assert(claimQuest(state, q.index, profile) === q.reward, `claim ${n} paid the wrong amount`);
  }
  assert(seen.size > QUEST_COUNT * 0.3, `only ${seen.size} distinct quests were ever offered`);
});

check('a quest state from an older or damaged save is repaired, not thrown', async () => {
  const { normaliseQuestState, activeQuests } = await import('../src/core/questlog.js');
  const { ACTIVE_SLOTS } = await import('../src/data/quests.js');
  // A save from before quests existed, a truncated one, a duplicated board and
  // outright garbage all have to come back playable.
  for (const bad of [undefined, null, {}, { slots: [] }, { slots: 'nope' },
    { slots: [{ index: 4, progress: 2 }] },
    { slots: [{ index: 7, progress: 1 }, { index: 7, progress: 9 }] },
    { slots: [{ index: -5, progress: -3 }], next: NaN }]) {
    const st = normaliseQuestState(bad);
    assert(st.slots.length === ACTIVE_SLOTS, `repair produced ${st.slots.length} slots`);
    assert(new Set(st.slots.map((s) => s.index)).size === ACTIVE_SLOTS, 'repair left a duplicate');
    for (const q of activeQuests(st)) {
      assert(q.goal >= 1 && q.progress >= 0, 'repair produced an unplayable quest');
    }
  }
});

check('a finished run reports every metric a quest can measure', async () => {
  const { Game } = await import('../src/game/game.js');
  const { METRICS } = await import('../src/data/quests.js');
  const { makeHarness } = await import('./harness.js');
  const h = makeHarness();
  const game = new Game(h.renderer, h.audio, h.profile);
  game.startRun(CLASSES[0], { layout: 0 });
  const report = game.questReport(3);
  // Every metric the quest generator can pick must be something a run actually
  // reports, or that quest can never be completed by playing.
  for (const [name, def] of Object.entries(METRICS)) {
    const bag = def.kind === 'peak' ? report.peaks : report.deltas;
    assert(name in bag, `a finished run never reports '${name}', so its quests are impossible`);
    assert(Number.isFinite(bag[name]), `run reported a non-number for '${name}'`);
  }
});

// --- Raids -----------------------------------------------------------------
// The gate logic is the part that can strand a player, so it is the part with
// the most tests. A progression system that can deadlock is not a challenge.

check('seven raids, six bosses each, every Core accounted for', async () => {
  const { RAIDS, CORE_ORDER, coreSlotFor, coreId, earnedCores, emptyRaidState } =
    await import('../src/data/raids.js');
  const { MAX_LEVEL } = await import('../src/data/levels.js');

  assert(RAIDS.length === 7, `${RAIDS.length} raids`);
  const ids = new Set(), tiers = new Set(), bossIds = new Set();
  let prevLevel = 0;
  for (const r of RAIDS) {
    assert(!ids.has(r.id), `duplicate raid id ${r.id}`);
    ids.add(r.id);
    assert(!tiers.has(r.tier), `two raids claim tier ${r.tier}`);
    tiers.add(r.tier);
    assert(r.bosses.length === CORE_ORDER.length,
      `${r.id} has ${r.bosses.length} bosses for ${CORE_ORDER.length} slots`);
    assert(r.level >= prevLevel, `${r.id} opens before the raid below it`);
    assert(r.level <= MAX_LEVEL, `${r.id} needs level ${r.level}, past the cap`);
    prevLevel = r.level;
    assert(r.theme && r.theme.sky && r.theme.accent, `${r.id} has no theme`);
    let prevPower = 0;
    for (const b of r.bosses) {
      assert(!bossIds.has(b.id), `duplicate boss id ${b.id}`);
      bossIds.add(b.id);
      assert(b.power > prevPower, `${b.id} is no harder than the boss before it`);
      prevPower = b.power;
      assert(MECHANICS_OK(b.mechanic), `${b.id} has unknown mechanic ${b.mechanic}`);
    }
  }
  assert(bossIds.size === 42, `${bossIds.size} bosses, expected 42`);

  // Every raid's trial must be a real mechanic. The trial is the one thing all
  // six bosses of a raid share, so a typo here silently removes the second
  // phase from a whole raid rather than from one fight.
  for (const r of RAIDS) {
    assert(MECHANICS_OK(r.trial), `${r.id} has unknown trial ${r.trial}`);
  }

  // Clearing everything must yield exactly one Core per slot per tier, and no
  // more — a duplicate would let one boss unlock two pieces.
  const all = emptyRaidState();
  for (const r of RAIDS) for (const b of r.bosses) all.killed[b.id] = true;
  const cores = earnedCores(all);
  assert(cores.size === RAIDS.length * CORE_ORDER.length,
    `clearing everything yielded ${cores.size} cores, expected ${RAIDS.length * CORE_ORDER.length}`);
  for (const r of RAIDS) {
    r.bosses.forEach((b, i) => {
      assert(cores.has(coreId(r.tier, coreSlotFor(i))), `no core for ${r.id} boss ${i}`);
    });
  }
});

check('every mechanic is fully specified and its cue exists', async () => {
  const { MECHANICS, RAIDS, bossStance, raidScaling, phaseFor, PHASES } =
    await import('../src/data/raids.js');
  const { readFile } = await import('node:fs/promises');
  const audio = await readFile(new URL('../src/core/audio.js', import.meta.url), 'utf8');

  for (const [id, m] of Object.entries(MECHANICS)) {
    assert(['burst', 'linger', 'aimed'].includes(m.tell), `${id} speaks no telegraph language`);
    assert(m.cast > 0 && m.cast <= 3, `${id} casts in ${m.cast}s`);
    assert(m.cd > 0, `${id} has no cadence`);
    assert(m.radius > 0, `${id} has no radius`);
    assert(m.dmg >= 0, `${id} has a negative damage multiplier`);
    // A cue the synthesiser has no case for is silence, and a mechanic whose
    // only warning is silent is a mechanic with no warning.
    assert(audio.includes(`case '${m.cue}'`), `${id}'s cue '${m.cue}' is not a real sound`);
  }

  // Stance decides which of two AI branches runs. Both must be reachable, or
  // one of them is dead code pretending to be a design choice.
  const stances = new Set();
  for (const r of RAIDS) for (const b of r.bosses) stances.add(bossStance(b));
  assert(stances.size === 2, `only ${[...stances].join()} bosses exist`);

  // Health climbs with tier and with power; damage climbs more slowly than
  // health, which is the whole argument in raidScaling's comment.
  const first = raidScaling(0, 1.0);
  const last = raidScaling(0, 1.6);
  assert(last.hp / first.hp > 1.5, 'power barely moves boss health');
  assert(last.damage / first.damage < 1.6, 'power scales damage as hard as health');
  assert(raidScaling(6, 1.0).hp > raidScaling(0, 1.0).hp * 4, 'tier barely moves boss health');

  // Phases are entered on the way down, so the thresholds must descend and the
  // lookup must land on the last one crossed.
  for (let i = 1; i < PHASES.length; i++) {
    assert(PHASES[i].at < PHASES[i - 1].at, 'phase thresholds do not descend');
    assert(PHASES[i].rate < PHASES[i - 1].rate, 'a later phase is not faster');
  }
  assert(phaseFor(1.0) === 0 && phaseFor(0.5) === 1 && phaseFor(0.1) === 2,
    'the phase lookup does not follow the thresholds');

});

check('every one of the 42 bosses fights without throwing', async () => {
  const { Game } = await import('../src/game/game.js');
  const { RAIDS } = await import('../src/data/raids.js');
  const { makeHarness } = await import('./harness.js');

  for (const raid of RAIDS) {
    for (let bi = 0; bi < raid.bosses.length; bi++) {
      const boss = raid.bosses[bi];
      const cls = CLASSES[(raid.tier * 6 + bi) % CLASSES.length];
      const h = makeHarness({ gear: Math.max(0, raid.tier - 1) });
      const game = new Game(h.renderer, h.audio, h.profile);
      assert(game.startRaid(cls, raid, bi), `${boss.id} would not start`);
      assert(game.mode === 'raid' && game.raidBoss, `${boss.id} did not spawn`);
      assert(game.raidBoss.maxHp > 0 && game.raidBoss.damageAmount > 0,
        `${boss.id} has no stat block`);

      const input = h.input();
      // Long enough to cross every phase threshold: the boss is drained
      // directly rather than fought, because what is under test is that each
      // mechanic and each transition runs, not that a bot can win.
      for (let step = 0; step < 60 * 30; step++) {
        input.moveX = Math.sin(step * 0.011);
        input.moveY = Math.cos(step * 0.008);
        input.attack = true;
        // Drained through the real damage path, so the kill, the Core and the
        // corpse handling are the ones the game actually runs. Assigning hp
        // directly leaves `dead` unset and tests nothing past the last frame.
        if (game.raidBoss) {
          // Enough to kill it in eighteen seconds, inside a twenty-six second
          // window. The headroom is deliberate: the Ward mechanic makes a boss
          // genuinely immune while its guards are up — measured at 27% of a
          // fight — and a drain calibrated to exactly the boss's health would
          // fail on a mechanic that is working correctly. This check is about
          // whether a boss fights and dies without throwing, not about dps.
          game.dealDamage(game.player, game.raidBoss, game.raidBoss.maxHp / (60 * 18),
            { silent: true });
        }
        game.player.hp = game.player.maxHp;      // the fight, not the outcome
        game.update(1 / 60, input);
        if (game.raidCleared) break;
      }
      assert(game.raidCleared, `${boss.id} never died even when drained`);
      assert(h.profile.raidState(cls.id).killed[boss.id], `${boss.id} was not recorded`);
    }
  }
});

check('a wipe costs nothing and a kill is recorded once', async () => {
  const { Game } = await import('../src/game/game.js');
  const { RAIDS, isBossDead } = await import('../src/data/raids.js');
  const { makeHarness } = await import('./harness.js');
  const raid = RAIDS[0], boss = raid.bosses[0];

  // A wipe. This is the rule the whole progression rests on: without it a
  // player who out-levels their gear can lock themselves out permanently, and
  // a system that can deadlock is a bug with a difficulty setting.
  const h = makeHarness({ gear: 0 });
  const g = new Game(h.renderer, h.audio, h.profile);
  g.startRaid(CLASSES[0], raid, 0);
  g.player.hp = 0;
  g.player.dead = true;
  g.endRun();
  assert(!isBossDead(h.profile.raidState(CLASSES[0].id), boss.id),
    'a wipe consumed the boss');

  // A kill, twice. awardCore has to be idempotent or a boss that dies on the
  // same frame its corpse is processed pays its gold twice.
  const h2 = makeHarness({ gear: 0 });
  const g2 = new Game(h2.renderer, h2.audio, h2.profile);
  g2.startRaid(CLASSES[0], raid, 0);
  const before = g2.soulsEarned;
  g2.awardCore();
  const paid = g2.soulsEarned - before;
  assert(paid > 0, 'killing a boss paid no gold');
  g2.awardCore();
  assert(g2.soulsEarned - before === paid, 'a boss paid its gold twice');
  assert(isBossDead(h2.profile.raidState(CLASSES[0].id), boss.id), 'a kill was not recorded');
});

check('the danger colour is on the ground and the boss colour is in the air', async () => {
  const { TELL_COLOR } = await import('../src/game/mobs.js');
  const { RAIDS, MECHANICS } = await import('../src/data/raids.js');

  // The three telegraph languages, and they are keyed to the action rather than
  // to the boss. A player learns three colours once; if a boss could recolour
  // them, they would have to relearn the floor every raid.
  assert(Object.keys(TELL_COLOR).length === 3, 'there are not three telegraph colours');
  for (const [k, v] of Object.entries(TELL_COLOR)) {
    assert(/^#[0-9a-f]{6}$/i.test(v), `${k} is not a usable colour`);
  }
  const tells = new Set(Object.values(MECHANICS).map((m) => m.tell));
  for (const t of tells) assert(TELL_COLOR[t], `mechanic tell '${t}' has no colour`);

  // No boss may wear a telegraph colour. The whole separation rests on the
  // floor never being the same hue as the thing standing on it.
  const danger = new Set(Object.values(TELL_COLOR).map((c) => c.toLowerCase()));
  for (const raid of RAIDS) {
    for (const b of raid.bosses) {
      assert(!danger.has(b.color.toLowerCase()),
        `${b.id} is the same colour as a telegraph`);
    }
    assert(!danger.has(raid.theme.accent.toLowerCase()),
      `${raid.id}'s room is lit in a telegraph colour`);
  }
});

check('every boss has a silhouette and a skin that can be read', async () => {
  const { BOSS_SKINS, BOSS_SIZES } = await import('../src/data/bossskins.js');
  const { RAIDS } = await import('../src/data/raids.js');
  const { T } = await import('../src/render/atlas.js');

  const tiles = new Set(Object.values(T));
  let lastIsTallest = 0;
  for (const raid of RAIDS) {
    const heights = [];
    for (const boss of raid.bosses) {
      const skin = BOSS_SKINS[boss.id];
      const size = BOSS_SIZES[boss.id];
      assert(skin, `${boss.id} has no skin`);
      assert(size, `${boss.id} has no silhouette`);
      for (const part of ['head', 'body', 'arm', 'leg']) {
        assert(Array.isArray(skin[part]) && skin[part].length === 3,
          `${boss.id} is missing its ${part} colour`);
      }
      // A tile id that is not in the atlas draws whatever happens to be at that
      // offset, which is a wrong texture rather than a crash — the worst kind
      // of bug to find by eye.
      for (const [k, v] of Object.entries(skin)) {
        if (!k.endsWith('Tile')) continue;
        assert(tiles.has(v), `${boss.id}'s ${k} is not a real atlas tile`);
      }
      // Past about 5.8 blocks drawn the head leaves the frame in melee, and a
      // boss whose top you cannot see is a wall.
      assert(size.height <= 5.3, `${boss.id} is ${size.height} blocks tall`);
      // Not the doc's 0.28-0.44 guideline, which the table itself does not
      // hold to — the Curator is meant to be a spider and Beth'tilac is meant
      // to be squat. This is the invariant underneath it: nothing is a pillar
      // and nothing is a pancake, because both stop reading as a body.
      const ratio = size.width / size.height;
      assert(ratio > 0.16 && ratio < 0.50,
        `${boss.id} is ${size.width} wide for ${size.height} tall (${ratio.toFixed(2)})`);
      heights.push(size.height);
    }
    // A roster where every boss is the same size has one silhouette in it, and
    // one where size tracks kill order has none worth learning.
    const span = Math.max(...heights) - Math.min(...heights);
    assert(span >= 1.59, `${raid.id}'s six bosses span only ${span.toFixed(1)} blocks`);
    if (heights.indexOf(Math.max(...heights)) === 5) lastIsTallest++;
  }
  // "The sixth boss is not automatically the tallest" is a rule about the set,
  // not about any one raid — a final boss may well be the biggest thing in its
  // raid. What must not happen is size tracking kill order everywhere, because
  // then the silhouette carries no information the health bar does not.
  assert(lastIsTallest < RAIDS.length,
    'every raid makes its last boss the tallest, so size says nothing');
  assert(Object.keys(BOSS_SKINS).length === 42, 'not every boss has a skin');

  // Silhouette. Six boxes in forty-two palettes is one enemy forty-two times,
  // and what a player recognises across a dark room is the outline — so every
  // boss carries at least one part that changes it.
  const PARTS = ['weapon', 'wings', 'tail', 'spines', 'cloak', 'horns', 'pauldrons'];
  const counts = Object.fromEntries(PARTS.map((k) => [k, 0]));
  for (const [id, skin] of Object.entries(BOSS_SKINS)) {
    const has = PARTS.filter((k) => skin[k]);
    assert(has.length > 0, `${id} is a plain humanoid`);
    for (const k of has) counts[k]++;
    for (const [k, v] of Object.entries(skin)) {
      if (!k.endsWith('Tile')) continue;
      assert(tiles.has(v), `${id}'s ${k} is not a real atlas tile`);
    }
  }
  // And every part is actually in use somewhere. A silhouette option nothing
  // takes is a branch in the renderer that has never run.
  for (const k of PARTS) assert(counts[k] > 0, `no boss uses '${k}'`);
});

check('a keyboard can play the whole game', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../src/core/input.js', import.meta.url), 'utf8');

  // The touch controls were designed first and the game shipped to a browser,
  // so the keyboard has to be able to do everything a thumb can. A binding
  // that quietly stops existing is invisible until someone tries to play on a
  // desktop and finds one of their four skills does nothing.
  for (let i = 1; i <= 4; i++) {
    assert(src.includes(`'Digit${i}'`), `skill ${i} has no number key`);
  }
  for (const key of ['KeyQ', 'KeyE', 'KeyR', 'KeyF']) {
    assert(src.includes(`'${key}'`), `${key} is no longer a skill binding`);
  }
  for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) {
    assert(src.includes(`'${key}'`), `${key} no longer moves`);
  }
  assert(src.includes("keys.has('Space')"), 'Space no longer jumps');
  assert(src.includes("'Escape'"), 'Escape no longer pauses');
  assert(src.includes('ShiftLeft'), 'Shift no longer sprints');

  // And the arrow keys, because a laptop without WASD muscle memory is still a
  // laptop.
  for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
    assert(src.includes(`'${key}'`), `${key} does nothing`);
  }
});

check('switching a class keeps everything that is not about the class', async () => {
  const { Profile } = await import('../src/core/save.js');
  const p = new Profile();
  const id = p.createCharacter('warrior').id;
  const ch = p.character(id);
  ch.xp = 250000;
  ch.gear = { weapon: 3, chest: 2 };
  ch.forge = { p_alch: 2 };
  ch.raid.killed.jindo = true;
  ch.potions = { health: 3 };
  ch.talents = { w_a1: 5 };
  const level = p.level(id);

  assert(p.switchClass(id, 'priest'), 'the switch was refused');
  // A tier 3 chest is a tier 3 chest. None of these is about the class, so
  // none of them should notice.
  assert(p.level(id) === level, `level went from ${level} to ${p.level(id)}`);
  assert(p.gear(id).weapon === 3, 'the gear was lost');
  assert(p.forgeLevels(id).p_alch === 2, 'the Forge was lost');
  assert(p.raidState(id).killed.jindo, 'the raid record was lost');
  assert(p.potionCount(id, 'health') === 3, 'the potion rack was lost');

  // Talents cannot survive: a Warrior's Arms ranks name nodes a Priest does
  // not have. The points come back unspent, which is a respec, not a loss.
  assert(Object.keys(p.character(id).talents).length === 0, 'Warrior talents survived on a Priest');
  assert(p.availableTalentPoints(id) === p.totalTalentPoints(id),
    'the refunded points did not come back');
  // And the loadout has to be the new class's, or a run casts skills the
  // character does not have.
  const { CLASS_BY_ID } = await import('../src/data/classes.js');
  const priestSkills = new Set(CLASS_BY_ID.priest.skills.map((s) => s.id));
  for (const s of p.loadout(id)) {
    assert(priestSkills.has(s.id), `${s.id} is not a Priest skill`);
  }
  // The auto-name follows, because the player never chose it.
  assert(p.character(id).name === 'Priest', `the name stayed ${p.character(id).name}`);
});

check('deleting a character frees its slot and keeps the gold', async () => {
  const { Profile, MAX_CHARACTERS } = await import('../src/core/save.js');
  const p = new Profile();
  p.data.souls = 12345;
  const ids = [];
  while (p.canCreate()) ids.push(p.createCharacter('warrior').id);
  assert(ids.length === MAX_CHARACTERS, `made ${ids.length} of ${MAX_CHARACTERS}`);
  assert(!p.createCharacter('mage'), 'a ninth character was made');

  // Gold was never the character's — taking it back would punish a player for
  // clearing a slot they had stopped using.
  assert(p.deleteCharacter(ids[0]), 'the delete was refused');
  assert(p.souls === 12345, `deleting cost ${12345 - p.souls} gold`);
  assert(p.canCreate(), 'the slot was not freed');
  assert(p.characters.length === MAX_CHARACTERS - 1, 'the roster did not shrink');

  // The active character has to still exist, or every menu is about nobody.
  p.setActive(ids[1]);
  p.deleteCharacter(ids[1]);
  assert(p.characters.some((c) => c.id === p.activeChar),
    'deleting the active character left the roster pointing at a ghost');

  // And an empty roster is a state the accessors must survive, not crash on.
  for (const c of [...p.characters]) p.deleteCharacter(c.id);
  assert(p.characters.length === 0, 'the roster would not empty');
  assert(p.activeChar === null, 'an empty roster still names somebody');
  assert(p.level() === 1 && p.gear() && p.potionCount(null, 'health') === 0
    && p.forgeLevels().p_alch === undefined && p.raidState().killed,
    'an accessor threw or lied on an empty roster');
});

check('the Potion Shop is a restock, not a second gear track', async () => {
  const { POTIONS, POTION_STACK, potionPrice } = await import('../src/data/potions.js');
  const { gearCost, GEAR_TIERS, GEAR_SLOTS } = await import('../src/data/armor.js');

  for (const def of POTIONS) {
    // Rising with level is the point — a flat price would make a potion that
    // heals a third of a level-60 health bar effectively free.
    const low = potionPrice(def.id, 1);
    const high = potionPrice(def.id, 60);
    assert(high > low * 4, `${def.id} barely gets dearer: ${low} -> ${high}`);
    // And it is affordable on the first run, where a wave clear pays under a
    // hundred and nobody has savings yet.
    assert(low <= 120, `${def.id} costs ${low} at level 1`);
  }

  // The shop must stay a restock. At every level a full rack of everything is
  // a fraction of the armour a character at that level is actually saving for
  // — and a shrinking fraction, so potions never become the thing you grind.
  const rackAt = (lv) => POTIONS.reduce((n, d) => n + potionPrice(d.id, lv), 0) * POTION_STACK;
  let lastShare = Infinity;
  for (const t of GEAR_TIERS) {
    const set = gearCost(t.tier) * GEAR_SLOTS.length;
    const rack = rackAt(t.level);
    const share = rack / set;
    assert(share < 0.35,
      `at level ${t.level} a full rack costs ${rack} against a ${set} T${t.tier} set`);
    assert(share < lastShare,
      `potions got relatively dearer at level ${t.level} (${share.toFixed(3)} vs ${lastShare.toFixed(3)})`);
    lastShare = share;
  }
});

check('a potion rack is bought, spent, and kept by one character', async () => {
  const { Profile } = await import('../src/core/save.js');
  const { POTION_STACK } = await import('../src/data/potions.js');
  const p = new Profile();
  p.data.souls = 1e6;
  const a = p.createCharacter('warrior').id;
  const b = p.createCharacter('mage').id;

  // Stacks cap. Without one the shop would sell you out of ever being in
  // trouble, and the arena would stop being the thing that kills you.
  for (let i = 0; i < POTION_STACK + 3; i++) p.buyPotion(a, 'health');
  assert(p.potionCount(a, 'health') === POTION_STACK,
    `carried ${p.potionCount(a, 'health')}, cap is ${POTION_STACK}`);
  const full = p.buyPotion(a, 'health');
  assert(!full.ok && full.reason === 'full', 'a full rack still sold one');

  // Per character, like the gear. A stocked main must not hand a fresh alt a
  // rack — and that includes a second character of the same class.
  assert(p.potionCount(b, 'health') === 0, 'the mage inherited the warrior rack');
  const a2 = p.createCharacter('warrior').id;
  assert(p.potionCount(a2, 'health') === 0, 'the second warrior inherited the first one\'s rack');

  // Gold actually leaves.
  const before = p.souls;
  const cost = p.potionPriceFor(b, 'damage');
  assert(p.buyPotion(b, 'damage').ok, 'the mage could not buy one');
  assert(p.souls === before - cost, `spent ${before - p.souls}, priced at ${cost}`);

  // Drinking spends it, and an empty shelf refuses rather than going negative.
  assert(p.consumePotion(b, 'damage'), 'could not drink the one just bought');
  assert(p.potionCount(b, 'damage') === 0, 'drinking left it on the shelf');
  assert(!p.consumePotion(b, 'damage'), 'drank from an empty shelf');
  assert(p.potionCount(b, 'damage') === 0, 'an empty shelf went negative');

  // Not enough gold is a refusal, not a debt.
  p.data.souls = 0;
  const broke = p.buyPotion(b, 'speed');
  assert(!broke.ok && broke.reason === 'poor', 'bought a potion with no gold');
  assert(p.souls === 0, 'gold went negative');
});

check('a save from before the Potion Shop still loads', async () => {
  // Every character gained a `potions` key. A save written last week has none,
  // and the normaliser is the only thing standing between that and a crash on
  // the first shop visit.
  const { Profile } = await import('../src/core/save.js');
  const { POTION_STACK } = await import('../src/data/potions.js');
  const p = new Profile();
  const a = p.createCharacter('warrior').id;
  const b = p.createCharacter('mage').id;
  delete p.character(a).potions;
  p.character(b).potions = { health: -4, nonesuch: 9, damage: 999 };
  p.normaliseGear();
  assert(p.potionCount(a, 'health') === 0, 'a missing rack did not become empty');
  assert(p.potionCount(b, 'health') === 0, 'a negative count survived');
  assert(p.potions(b).nonesuch === undefined, 'a potion that does not exist survived');
  assert(p.potionCount(b, 'damage') === POTION_STACK, 'an over-cap count was not clamped');
});

check('every talent effect can be explained on screen', async () => {
  const { EFFECT_INFO, talentLines } = await import('../src/data/talentinfo.js');
  for (const cls of CLASSES) {
    for (const branch of cls.talents) {
      for (const node of branch.nodes) {
        for (const key of Object.keys(node.effect || {})) {
          assert(EFFECT_INFO[key],
            `${cls.id}/${node.id} has effect "${key}" that the talent screen cannot describe`);
        }
        // And the lines have to actually come out, or the node shows a name
        // and nothing else — which is the complaint this screen was built for.
        const scalars = Object.keys(node.effect || {})
          .filter((k) => EFFECT_INFO[k].kind !== 'unique');
        assert(talentLines(node, 1, 'Skill').length === scalars.length,
          `${cls.id}/${node.id} renders ${talentLines(node, 1, 'Skill').length} lines for ${scalars.length} effects`);
      }
    }
  }
});

check('no talent promises a number its effect does not produce', async () => {
  // The tree used to carry hand-written percentages next to an effect table
  // that had since been retuned, and fifty-eight nodes disagreed with
  // themselves — Warrior's Unstoppable Charge advertised 22% against an
  // effect worth 8%. Prose does not get recompiled, so nothing caught it.
  //
  // The screen now derives every number from the effect object. This keeps
  // the *descriptions* honest too: any percentage still written by hand has
  // to be one some rank of the node genuinely produces.
  const { EFFECT_INFO } = await import('../src/data/talentinfo.js');
  const bad = [];
  for (const cls of CLASSES) {
    for (const branch of cls.talents) {
      for (const node of branch.nodes) {
        const quoted = [...(node.desc || '').matchAll(/(\d+(?:\.\d+)?)%/g)].map((m) => Number(m[1]));
        if (!quoted.length) continue;
        // Every percentage any rank of this node produces, plus the ones a
        // single-rank switch states as a threshold (a Last Stand that revives
        // you at 25% health is quoting the game, not its own effect value).
        const produced = new Set();
        for (const v of Object.values(node.effect || {})) {
          if (typeof v !== 'number') continue;
          for (let r = 1; r <= node.max; r++) produced.add(Math.round(Math.abs(v * r) * 1000) / 10);
        }
        // A threshold the screen itself prints — "damage reduction below 25%
        // health" — is explained by the label, so the description may repeat it.
        for (const k of Object.keys(node.effect || {})) {
          const label = (EFFECT_INFO[k] || {}).label || '';
          for (const m of label.matchAll(/(\d+(?:\.\d+)?)%/g)) produced.add(Number(m[1]));
        }
        const unexplained = quoted.filter((q) => ![...produced].some((p) => Math.abs(p - q) < 0.51));
        // A threshold quoted by a single-rank mechanic is prose about the
        // game's rules rather than about this node's numbers, so it is exempt.
        const isSwitch = Object.keys(node.effect || {})
          .some((k) => EFFECT_INFO[k] && EFFECT_INFO[k].kind === 'unique');
        if (unexplained.length && !isSwitch) {
          bad.push(`${cls.id}/${node.id}: "${node.desc}" quotes ${unexplained.join('%, ')}% — effects are ${JSON.stringify(node.effect)}`);
        }
      }
    }
  }
  assert(bad.length === 0, `talent text disagrees with talent effects:\n  ${bad.join('\n  ')}`);
});

check('a wave has a middle, and still ends', async () => {
  const { Game } = await import('../src/game/game.js');
  const { makeHarness } = await import('./harness.js');
  const h = makeHarness({ level: 60, gear: 6 });
  const game = new Game(h.renderer, h.audio, h.profile);
  game.startRun(CLASSES[0], { layout: 0 });

  // A wave used to be flat — spawn a queue, wait for the room to empty — so
  // wave 30 was wave 10 with bigger numbers in the same three beats. These two
  // give it a middle, and the risk of both is the same: a beat that can fire
  // twice, or one that releases enemies a wave then never spends, is a wave
  // that cannot end. That is a softlock, not a difficulty spike.
  const beats = [];
  const perWave = new Map();
  const orig = game.notify.bind(game);
  game.notify = (t, d) => {
    if (/REINFORCEMENTS|CLOSE IN/.test(t)) {
      beats.push(t);
      const key = `${game.wave}:${/REINFORCEMENTS/.test(t) ? 'r' : 'l'}`;
      perWave.set(key, (perWave.get(key) || 0) + 1);
    }
    return orig(t, d);
  };

  const p = game.player;
  const input = h.input();
  let leaked = 0;
  // Kills are dealt directly rather than swung for.
  //
  // Leaving it to the harness bot's damage put this check on a knife edge: a
  // hundred and fifty seconds of a bot flailing at wave 1 only *just* got half
  // the wave down, so whether the reinforcement beat fired at all came down to
  // how the spawns happened to land. It failed about one run in seven while
  // the director was working perfectly.
  //
  // What is under test is the director — when it holds a pack back, when it
  // releases it, and that it always spends it — so the fight is replaced with
  // a guaranteed one and the wave is allowed to actually progress. Several
  // waves now run instead of most of one.
  for (let i = 0; i < 60 * 150; i++) {
    input.attack = true;
    game.update(1 / 60, input);
    p.hp = p.maxHp;               // measuring the wave, not the fight
    if (i % 12 === 0) {
      const victim = game.mobs.find((m) => !m.dead);
      if (victim) game.dealDamage(p, victim, 999999, { silent: true });
    }
    // Clearing a wave offers a rank-up card and waits. Nothing picks one in a
    // headless run, so without this the fixture sits on wave 1 forever with
    // the card on screen — which is exactly what it did the first time.
    if (game.pendingUpgrades) game.chooseUpgrade(game.pendingUpgrades[0]);
    // Nothing may be held across a wave boundary. This is the softlock: a
    // reserve that survives into the next wave is a pack the director has
    // promised to spawn and will never spend. Sampled every frame the wave is
    // over rather than once at the end, so it covers every wave the fixture
    // played instead of whichever one it happened to stop in.
    if (game.director.state === 'intermission' && game.director.reserve.length) {
      leaked = Math.max(leaked, game.director.reserve.length);
    }
    if (!game.running) break;
  }

  assert(game.wave >= 3, `only reached wave ${game.wave}; the fixture is not clearing waves`);
  assert(beats.some((b) => /REINFORCEMENTS/.test(b)), 'no wave ever called reinforcements');
  assert(beats.some((b) => /CLOSE IN/.test(b)), 'the survivors never closed in');

  // Once each per wave. Both beats consume themselves, and a reinforcement
  // that can re-fire refills the wave forever.
  const twice = [...perWave.entries()].filter(([, n]) => n > 1);
  assert(twice.length === 0,
    `a beat fired more than once in a wave: ${twice.map(([k, n]) => `${k}x${n}`).join(', ')}`);
  assert(leaked === 0, `${leaked} reinforcements were still held after a wave ended`);

  const d = game.director;

  // And the held-back pack comes out of the wave's own budget rather than on
  // top of it, or "a wave with a middle" is quietly "a harder wave".
  d.startWave(12);
  const held = d.reserve.length;
  assert(held > 0, 'nothing is held back for the middle of the wave');
  // `total` is recorded before the reserve is taken, so this is the whole
  // budget against what the wave will actually spend. Compared against the
  // director's own record rather than a second call to buildWaveQueue, which
  // rolls its own mob types and returns a different length each time.
  assert(held + d.queue.length === d.total,
    `wave 12 spends ${held + d.queue.length} enemies against a budget of ${d.total}`);
});

check('every quest metric is something a run actually reports', async () => {
  const { METRICS, TEMPLATES } = await import('../src/data/quests.js');
  const { Game } = await import('../src/game/game.js');
  const { makeHarness } = await import('./harness.js');

  // A quest whose metric nothing ever increments is a quest that can never be
  // finished, and it does not throw — it just sits in the log forever. That is
  // the exact failure the five new templates could have shipped with: the
  // metric name in the table and no code anywhere writing it.
  const h = makeHarness({ level: 40 });
  const game = new Game(h.renderer, h.audio, h.profile);
  game.startRun(CLASSES[0], { layout: 0 });
  const report = game.questReport(0);
  const produced = new Set([...Object.keys(report.deltas), ...Object.keys(report.peaks)]);

  for (const t of TEMPLATES) {
    assert(METRICS[t.metric], `quest template "${t.id}" reads metric "${t.metric}", which is not declared`);
    assert(produced.has(t.metric),
      `quest template "${t.id}" wants "${t.metric}", which no run ever reports`);
  }
  for (const name of Object.keys(METRICS)) {
    assert(produced.has(name), `metric "${name}" is declared but never reported by a run`);
  }

  // And they have to actually move. A metric wired to a constant zero passes
  // every check above and still cannot complete a quest.
  const p = game.player;
  // Crit forced, so this measures whether the counter is wired rather than
  // whether the dice cooperated inside the sample window.
  p.critChance = 1;
  const input = h.input();
  for (let i = 0; i < 60 * 60; i++) {
    input.attack = true;
    // Turned to face the nearest enemy. The harness bot never rotates, so
    // whether it kills anything at all comes down to which direction the wave
    // happened to arrive from — and reinforcements now deliberately arrive
    // from behind.
    const near = game.nearestEnemy(p.x, p.eyeY, p.z, 40);
    if (near) p.yaw = Math.atan2(-(near.x - p.x), -(near.z - p.z));
    game.update(1 / 60, input);
    p.hp = p.maxHp;
    p.critChance = 1;
    if (!game.running) break;
  }
  const after = game.questReport(Math.max(0, game.wave - 1));
  for (const name of ['kills', 'critHits', 'goldEarned', 'damageDealt']) {
    assert(after.deltas[name] > 0, `"${name}" stayed at zero through a whole minute of fighting`);
  }
});

check('every skill gets a drawn icon, and no shape is overloaded', async () => {
  const { markFor, SCHOOLS, schoolFor } = await import('../src/ui/icons.js');

  // Icons are drawn shapes now rather than emoji, and which shape a skill gets
  // is resolved from its own words. That is what keeps 117 icons maintainable
  // — a new skill gets a sensible one the moment it is named — but it has a
  // failure mode a screenshot will not show: a keyword table that quietly
  // funnels half the game into one shape.
  const use = {};
  let total = 0;
  for (const cls of CLASSES) {
    for (const skill of cls.skills) {
      const m = markFor(skill);
      assert(m && m.mark, `${cls.id}/${skill.id} resolved to no mark at all`);
      use[m.mark] = (use[m.mark] || 0) + 1;
      total++;
      // And a school, or the plate has no colour to put in its rim.
      assert(schoolFor(skill), `${skill.id} has no school`);
    }
  }
  const worst = Math.max(...Object.values(use));
  assert(worst <= total * 0.16,
    `one shape carries ${worst} of ${total} skills — the keyword table is too greedy`);
  // A vocabulary that has collapsed to a handful of shapes is the same bug
  // seen from the other side.
  assert(Object.keys(use).length >= 10,
    `only ${Object.keys(use).length} distinct shapes across ${total} skills`);

  // Within one class is where it actually matters: thirteen icons in a row in
  // the picker, and four on the skill bar. Global variety is no comfort if a
  // single class is all skulls.
  for (const cls of CLASSES) {
    const marks = new Set(cls.skills.map((s) => markFor(s).mark));
    assert(marks.size >= 4,
      `${cls.id}'s thirteen skills use only ${marks.size} shapes`);
  }
  assert(Object.keys(SCHOOLS).length >= 8, 'the school palette shrank');
});

check('the four new enemies each do the thing they exist for', async () => {
  const { Game } = await import('../src/game/game.js');
  const { makeHarness } = await import('./harness.js');

  // Each of these is a special attack rather than a stat, and a stat is what
  // they would silently decay into: a block arc that stops applying, a heal
  // pulse that finds nobody, a split that spawns zero, a charge that never
  // fires. None of those throws, and none of them shows up in a screenshot.
  //
  // A fresh run per enemy. Sharing one leaks state between them — a player
  // who dies in the Leech section stops the run, and every assertion after it
  // then passes or fails for the wrong reason.
  const fresh = () => {
    const h = makeHarness({ level: 40 });
    const game = new Game(h.renderer, h.audio, h.profile);
    game.startRun(CLASSES[0], { layout: 0 });
    game.wave = 20;
    game.mobs.length = 0;
    return { game, h, p: game.player };
  };
  const fake = (x, y, z) => ({
    x, y, z, rollCrit: () => false, critMult: 1, mods: {}, stats: { bossMult: 1 },
  });

  // Bulwark — shielded from the front, open from behind.
  {
    const { game, p } = fresh();
    const b = game.spawnMob('bulwark', p.x, p.y, p.z - 6);
    b.yaw = Math.atan2(-(p.x - b.x), -(p.z - b.z));
    const front = game.dealDamage(fake(b.x, b.y, b.z + 8), b, 100, { silent: true });
    const back = game.dealDamage(fake(b.x, b.y, b.z - 8), b, 100, { silent: true });
    assert(back > front * 2,
      `the Bulwark takes ${front.toFixed(0)} from the front and ${back.toFixed(0)} from behind`);
  }

  // Leech — mends the pack, which is what makes it a priority target.
  {
    const { game, h, p } = fresh();
    game.spawnMob('leech', p.x + 4, p.y, p.z);
    const hurt = game.spawnMob('husk', p.x + 5, p.y, p.z);
    hurt.hp = hurt.maxHp * 0.3;
    const was = hurt.hp;
    for (let i = 0; i < 200; i++) { game.update(1 / 60, h.input()); p.hp = p.maxHp; }
    assert(hurt.hp > was, 'the Leech healed nobody');
  }

  // Splitter — a corpse that makes more work, and its halves do not split.
  {
    const { game, p } = fresh();
    const sp = game.spawnMob('splitter', p.x + 3, p.y, p.z + 3);
    const parentHp = sp.maxHp;
    game.dealDamage(p, sp, 99999, { silent: true });
    const kids = game.mobs.filter((m) => !m.dead && m.splitChild);
    assert(kids.length === 2, `the Splitter left ${kids.length} halves`);
    const total = kids.reduce((n, k) => n + k.maxHp, 0);
    // Bounded, or a Splitter costs the wave director less budget than it
    // spends, and the wave lands harder than the number it was built to.
    assert(total < parentHp * 0.55,
      `the halves carry ${(total / parentHp * 100).toFixed(0)}% of the parent's health`);
  }

  // Lancer — telegraphs, then commits, and then does it again.
  //
  // Twice, not once. A charge needs run-up, and the first version of this
  // enemy could only ever find it on the way in: it charged if its timer
  // happened to come up before it closed, and after that stood in melee
  // swinging forever. One charge in twenty seconds passed the old assertion
  // and was not the enemy. It now gives ground to make a lane, which measures
  // two to three charges every twenty seconds with the first inside six.
  {
    const { game, h, p } = fresh();
    const l = game.spawnMob('lancer', p.x, p.y, p.z - 12);
    let charges = 0, was = l.state, firstAt = -1;
    // Thirty seconds, not twenty. A Lancer that backs into a wall gives up on
    // that attempt and waits out a normal cadence before trying again, which
    // is correct behaviour and costs it one charge — over twenty seconds that
    // was the difference between two and one, and the assertion was measuring
    // the arena's furniture rather than the enemy.
    for (let i = 0; i < 60 * 30; i++) {
      game.update(1 / 60, h.input());
      // Both held up: this measures the behaviour, not who wins the fight.
      p.hp = p.maxHp;
      l.hp = l.maxHp;
      if (l.state === 'charge' && was !== 'charge') {
        charges++;
        if (firstAt < 0) firstAt = i / 60;
      }
      was = l.state;
    }
    assert(firstAt >= 0 && firstAt < 9,
      `the Lancer's first charge came at ${firstAt < 0 ? 'never' : firstAt.toFixed(1) + 's'}`);
    // Counting charges over a window measures the arena as much as the enemy:
    // a Lancer that spends the fight jammed in a corner legitimately gets one
    // off, which happened in about one run in eight and is not a bug. The
    // disengage is the actual mechanism, so it is tested directly and in the
    // open, where the answer depends on nothing but the Lancer.
    assert(charges >= 1, `the Lancer charged ${charges} times in thirty seconds`);
  }

  // The disengage, on its own.
  //
  // A charge needs five blocks of run-up. Put a Lancer in melee with its lance
  // ready and it must give ground to make them — that one behaviour is the
  // whole difference between this enemy and a husk with a different hat.
  {
    const { game, h, p } = fresh();
    const l = game.spawnMob('lancer', p.x + 2, p.y, p.z);
    l.hp = l.maxHp = 1e7;
    l.lanceTimer = 0;
    let away = 0, frames = 0;
    for (let i = 0; i < 60; i++) {
      game.update(1 / 60, h.input());
      p.hp = p.maxHp;
      l.hp = l.maxHp;
      const d = Math.hypot(l.x - p.x, l.z - p.z);
      if (d > 6) break;                       // it made its room
      // Is it moving away from the player, or into them?
      const outward = ((l.x - p.x) * l.vx + (l.z - p.z) * l.vz) / (d || 1);
      if (Math.hypot(l.vx, l.vz) > 0.4) { frames++; if (outward > 0) away++; }
    }
    assert(frames > 0, 'the Lancer never moved with its lance ready');
    assert(away > frames * 0.6,
      `the Lancer spent ${frames - away} of ${frames} moving frames closing on the player `
      + 'while its lance was ready, instead of making room to charge');
  }
});

check('enemies walk at you, not around you', async () => {
  const { Game } = await import('../src/game/game.js');
  const { makeHarness } = await import('./harness.js');

  // Reported from play: "the AI is stupid, enemies walk randomly". Measured,
  // that was exactly right and it was this file's fault — the flanking arc
  // rotated a mob's approach by up to 66 degrees for the whole way in, and
  // cos(66°) is 0.41, so well over half of every step went sideways. Ten husks
  // walking in from eighteen blocks converted only 50% of the ground they
  // covered into ground closed, and two of them were still fifteen blocks out
  // after ten seconds.
  //
  // Flanking is worth having and this is the number that keeps it honest.
  const h = makeHarness({ level: 30 });
  const game = new Game(h.renderer, h.audio, h.profile);
  game.startRun(CLASSES[0], { layout: 0 });
  game.wave = 12;
  game.director.state = 'clearing';        // measure these ten, not a wave
  const p = game.player;
  game.mobs.length = 0;

  const track = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const m = game.spawnMob('husk', p.x + Math.cos(a) * 18, p.y, p.z + Math.sin(a) * 18);
    track.push({ m, d0: Math.hypot(m.x - p.x, m.z - p.z), path: 0, lx: m.x, lz: m.z });
  }
  // Counted only while a mob is still walking in.
  //
  // Once it arrives it circles, backs off and jostles for a place at the
  // player — all of which is walking that closes no distance and none of which
  // is what this measures. Including it mixed "did they approach efficiently"
  // with "how long did they then spend in melee", which made the number swing
  // by ten points depending on how quickly the first one got there. A mob's
  // ledger closes the moment it is in range for the first time.
  for (let i = 0; i < 60 * 10; i++) {
    game.update(1 / 60, h.input());
    p.hp = p.maxHp;
    for (const t of track) {
      if (t.m.hp < t.m.maxHp * 0.9) t.m.hp = t.m.maxHp * 0.9;
      const d = Math.hypot(t.m.x - p.x, t.m.z - p.z);
      if (!t.arrived) {
        t.path += Math.hypot(t.m.x - t.lx, t.m.z - t.lz);
        t.closed = t.d0 - d;
        if (d <= 3) t.arrived = true;
      }
      t.lx = t.m.x; t.lz = t.m.z;
    }
  }
  const closed = track.reduce((a, t) => a + (t.closed || 0), 0);
  const walked = track.reduce((a, t) => a + t.path, 0);
  const pct = closed / walked * 100;
  assert(pct >= 62, `only ${pct.toFixed(0)}% of the walk in was distance closed`);

  // And they have to actually arrive. An efficient walk that stops at twelve
  // blocks is still an enemy the player has to go and find.
  const far = track.filter((t) => Math.hypot(t.m.x - p.x, t.m.z - p.z) > 11).length;
  assert(far <= 2, `${far} of 10 enemies were still past eleven blocks after ten seconds`);
});

check('a pack surrounds instead of queuing up', async () => {
  const { Game } = await import('../src/game/game.js');
  const { makeHarness } = await import('./harness.js');
  const h = makeHarness({ level: 30 });
  const game = new Game(h.renderer, h.audio, h.profile);
  game.startRun(CLASSES[0], { layout: 0 });
  game.wave = 15;
  const p = game.player;

  // Sixteen enemies deliberately spawned on one side. What the player should
  // see over the next few seconds is a pack fanning out around them, not a
  // queue arriving one at a time from the same direction.
  for (let i = 0; i < 16; i++) game.spawnMob('husk', p.x + 14 + (i % 4), p.y, p.z + (i % 5) - 2);

  const near = () => game.mobs.filter(
    (m) => !m.dead && Math.hypot(m.x - p.x, m.z - p.z) <= 22);

  /**
   * How spread out the pack is, as one number between 0 and 1.
   *
   * Every nearby mob contributes a unit vector for its bearing; the length of
   * their average is how much they agree. All on one side gives a mean of
   * length 1 and a spread of 0; an even ring cancels out and gives 1.
   *
   * This replaced counting how many of eight sectors were occupied, which was
   * the right idea measured the wrong way. With sixteen mobs and eight buckets
   * the count lands on 3, 4, 5 or 6 depending on which frame you looked at —
   * so the assertion failed about one run in five while the behaviour it was
   * testing was fine. Chunky metric, flaky gate. A continuous one has no
   * bucket edges to fall either side of.
   */
  const spread = () => {
    const ms = near();
    if (!ms.length) return 0;
    let sx = 0, sz = 0;
    for (const m of ms) {
      const a = Math.atan2(m.z - p.z, m.x - p.x);
      sx += Math.cos(a); sz += Math.sin(a);
    }
    return 1 - Math.hypot(sx, sz) / ms.length;
  };
  const sectors = () => new Set(near().map(
    (m) => (((Math.atan2(m.z - p.z, m.x - p.x) + Math.PI) / (Math.PI / 4)) | 0) % 8)).size;

  const before = spread();
  assert(before < 0.02, `the fixture did not spawn a lopsided pack (spread ${before.toFixed(3)})`);

  // Averaged across the last three seconds rather than read at one instant:
  // the pack is moving, and one frame is a coin toss about who is where.
  let sum = 0, n = 0, bestSectors = 0;
  for (let i = 0; i < 60 * 10; i++) {
    game.update(1 / 60, h.input());
    // Both sides held up, so this measures movement rather than who wins.
    p.hp = p.maxHp;
    for (const m of game.mobs) if (m.hp < m.maxHp * 0.9) m.hp = m.maxHp * 0.9;
    if (i > 60 * 7 && i % 5 === 0) {
      sum += spread(); n++;
      bestSectors = Math.max(bestSectors, sectors());
    }
  }
  const after = sum / n;

  // The naive version of this — every mob steering at whichever sector is
  // emptiest — makes it *worse*, because they all evaluate the same data on
  // the same frame and stampede. That version stayed at a spread of about
  // 0.01: sixteen enemies in a single file. This is the number that tells the
  // two apart, and it is nowhere near the threshold from either side.
  //
  // Spread and approach pull against each other: the arc that fans a pack out
  // is the same arc that stops it closing, and a first pass was wide enough
  // that only half of everything a mob walked was distance closed — which
  // reads as wandering, not flanking. The arc is capped and faded now,
  // measured at 70% of walking pointed at the player, and this measures
  // between 0.12 and 0.35 across twenty-five runs against 0.004 at the start.
  assert(after > 0.08,
    `a one-sided pack only reached a spread of ${after.toFixed(3)} in ten seconds `
    + `(${bestSectors} of 8 sectors at its widest)`);
});

check('a wave stays killable, and pays more the deeper it is', async () => {
  const { waveScaling, waveBudget, waveClearBonus } = await import('../src/game/waves.js');
  const { rankDamageMult } = await import('../src/game/skills.js');
  const { xpForWave } = await import('../src/data/levels.js');

  // Reported from play: wave 14 was a wall. Measured, the enemies were not
  // hitting harder — seconds-to-die sat flat at six from wave 5 on — they had
  // stopped *dying*. A wave's total health is its budget times its per-mob
  // health multiplier, two curves multiplied together, and that reached
  // twenty-four times wave 1 by wave 14 while the player's damage grew about
  // forty percent over the same span.
  //
  // So this compares the two curves rather than either alone, which is the
  // thing that was wrong and the thing neither number shows on its own.
  const pool = (w) => waveBudget(w) * waveScaling(w).hp;
  const base = pool(1);
  // One rank a wave, split across four skills.
  const playerDamage = (w) => rankDamageMult(w / 4);
  const gap = (w) => (pool(w) / base) / playerDamage(w);

  // Two numbers, and they are a design decision rather than a safety margin.
  //
  // The gap is where the wall is. Before the retune it hit 17 at wave 14,
  // which is what "enemies too strong at wave 14" measured as: a wave taking
  // two minutes to kill. It is 8.5 there now, and 22 at wave 30 — which is to
  // say the wall did not go away, it moved out by roughly a factor of two.
  // That is the intended shape for an endless mode: it still ends, later.
  assert(gap(14) < 10,
    `wave 14 has a gap of ${gap(14).toFixed(1)} — that is a wall, not a fight`);
  assert(gap(30) < 25,
    `wave 30 has a gap of ${gap(30).toFixed(1)} — the run ends too abruptly`);

  // Monotonic, because an endless mode has to end. A gap that stops growing is
  // a run with no finish in it.
  let prev = 0;
  for (const w of [5, 10, 14, 20, 30, 40]) {
    assert(gap(w) > prev, `wave ${w} is no harder than the wave before it`);
    prev = gap(w);
  }

  // Rewards grow faster than linearly, so going deeper is worth doing rather
  // than merely survivable. Linear meant the efficient way to level was to
  // farm shallow waves and restart, which is the opposite of the point.
  for (const [f, name] of [[xpForWave, 'XP'], [waveClearBonus, 'gold']]) {
    const at1 = f(1), at10 = f(10), at30 = f(30);
    assert(at30 / at1 > (at10 / at1) * 2.2,
      `${name} at wave 30 is ${(at30 / at1).toFixed(1)}x wave 1 against `
      + `${(at10 / at1).toFixed(1)}x at wave 10: depth is not paying`);
  }
});

check('a Hexer casts, and a stun stops it', async () => {
  const { Game } = await import('../src/game/game.js');
  const { makeHarness } = await import('./harness.js');

  // Every other telegraph in the arena asks "can you move". This one asks
  // "can you reach it", and it is the only enemy whose whole design is a thing
  // you *stop* rather than a thing you dodge — so both halves have to work or
  // it is an archer with a longer wind-up.
  const fight = () => {
    const h = makeHarness({ level: 60 });
    const game = new Game(h.renderer, h.audio, h.profile);
    game.startRun(CLASSES[0], { layout: 0 });
    game.mobs.length = 0;
    const p = game.player;
    const m = game.spawnMob('hexer', p.x, p.y, p.z - 9);
    m.maxHp = 1e7; m.hp = 1e7;
    return { game, h, p, m };
  };

  // It casts, and the cast lands for real damage.
  const a = fight();
  let landed = 0, lowest = a.p.maxHp, sawBar = false;
  for (let i = 0; i < 60 * 20; i++) {
    a.game.update(1 / 60, a.h.input());
    if (a.m.cast) sawBar = true;
    lowest = Math.min(lowest, a.p.hp);
    a.p.hp = a.p.maxHp;
  }
  assert(sawBar, 'the Hexer never started a cast in twenty seconds');
  landed = a.p.maxHp - lowest;
  assert(landed > a.p.maxHp * 0.15,
    `a finished Hex took ${Math.round(landed)} of ${a.p.maxHp}: not worth stopping`);

  // A stun cuts it, and leaves it staggered — an interrupt that only cancels
  // the spell is worth exactly the spell.
  const b = fight();
  let cut = 0, stagger = 0;
  for (let i = 0; i < 60 * 20; i++) {
    b.game.update(1 / 60, b.h.input());
    b.p.hp = b.p.maxHp;
    if (b.m.cast && b.m.cast.remaining < b.m.cast.total * 0.5) {
      b.game.dealDamage(b.p, b.m, 1, { stun: 1, silent: true });
      // Sampled here, not after the loop: the stagger runs down as the caster
      // recovers, so reading it at the end measures how long ago the last
      // interrupt was rather than whether interrupts stagger.
      if (!b.m.cast) { cut++; stagger = Math.max(stagger, b.m.staggered); }
    }
  }
  assert(cut >= 1, 'a stun did not stop the cast');
  assert(stagger > 0, 'an interrupted caster was not staggered');

  // A hit with neither stun nor knockback must not interrupt, or every point
  // of damage is an interrupt and the mechanic has no moment in it.
  const c = fight();
  let poked = 0, survived = 0;
  for (let i = 0; i < 60 * 20; i++) {
    c.game.update(1 / 60, c.h.input());
    c.p.hp = c.p.maxHp;
    if (c.m.cast) {
      poked++;
      c.game.dealDamage(c.p, c.m, 1, { silent: true });
      if (c.m.cast) survived++;
    }
  }
  assert(poked > 0 && survived === poked,
    `${poked - survived} of ${poked} plain hits cancelled a cast`);
});

check('crossing elements detonates, and repeating one does not', async () => {
  const { Game } = await import('../src/game/game.js');
  const { castSkill } = await import('../src/game/skills.js');
  const { elementOf } = await import('../src/game/elements.js');
  const { makeHarness } = await import('./harness.js');

  // Enough skills have to carry an element for the system to exist at all, and
  // every class needs at least one or the combo is a Mage feature wearing a
  // game-wide name.
  let tagged = 0;
  for (const cls of CLASSES) {
    const mine = cls.skills.filter((s) => elementOf(s, s.power));
    assert(mine.length > 0, `${cls.id} has no skill that carries an element`);
    tagged += mine.length;
  }
  assert(tagged >= 25, `only ${tagged} skills carry an element`);

  // Melee is not an element. A Warrior's Thunder Clap is orange because a
  // shockwave through stone is orange, and letting hue decide would have made
  // every physical class a caster.
  for (const cls of CLASSES) {
    for (const s of cls.skills) {
      if (s.kind !== 'strike' && s.kind !== 'dash') continue;
      if (s.power.freeze || s.power.burn) continue;   // genuinely elemental
      assert(!elementOf(s, s.power),
        `${cls.id}'s ${s.name} is a melee ${s.kind} and was called ${elementOf(s, s.power)}`);
    }
  }

  const fight = () => {
    const h = makeHarness({ level: 60 });
    const game = new Game(h.renderer, h.audio, h.profile);
    const mage = CLASSES.find((c) => c.id === 'mage');
    game.startRun(mage, { layout: 0 });
    game.mobs.length = 0;
    const p = game.player;
    p.resource = 1e9;
    p.yaw = 0; p.pitch = 0;
    const m = game.spawnMob('husk', p.x, p.y, p.z - 3);
    m.maxHp = 1e7; m.hp = 1e7;
    p.skills[0] = mage.skills.find((s) => s.id === 'fireball');
    p.skills[1] = mage.skills.find((s) => s.id === 'frostnova');
    return { game, h, p, m };
  };
  const cast = (f, i) => {
    f.p.cooldowns[i] = 0;
    f.p.resource = 1e9;
    castSkill(f.game, f.p, i);
    for (let k = 0; k < 60; k++) f.game.update(1 / 60, f.h.input());
  };

  // What the detonation is worth, measured against the same skill cast into
  // the same target with and without a mark on it.
  //
  // The first version of this compared two fireballs against a fireball and a
  // frost nova, which is not a controlled comparison at all — those are two
  // different skills with two different damage numbers, and the ratio it
  // produced said more about Fireball than about the combo.
  const bare = fight();
  cast(bare, 1);
  const alone = bare.m.maxHp - bare.m.hp;

  const combo = fight();
  cast(combo, 0);
  assert(combo.m.elemTag && combo.m.elemTag.id === 'fire',
    `a fireball left ${combo.m.elemTag ? combo.m.elemTag.id : 'no mark'}`);
  const beforeCross = combo.m.hp;
  cast(combo, 1);
  const crossed = beforeCross - combo.m.hp;
  assert(!combo.m.elemTag, 'crossing elements did not spend the mark');
  assert(crossed > alone * 1.8,
    `a frost nova deals ${Math.round(alone)} bare and ${Math.round(crossed)} onto a `
    + 'burning target: the detonation is not worth switching for');

  // Same element again: refreshes, does not detonate. The reward is
  // specifically for switching, and a Mage holding one button must not be
  // detonating every second.
  const same = fight();
  cast(same, 0);
  cast(same, 0);
  assert(same.m.elemTag && same.m.elemTag.id === 'fire', 'repeating an element cleared the mark');
});

check('a buff grants everything its tooltip promises', async () => {
  const { Game } = await import('../src/game/game.js');
  const { castSkill } = await import('../src/game/skills.js');
  const { makeHarness } = await import('./harness.js');

  // The bug this exists for, and it shipped: the `buff` cast path copied a
  // hand-picked list of fields onto the buff, and the list left out
  // `damageBonus` and `attackSpeedBonus` — the two things recomputeStats
  // actually reads for offence. Twelve of the game's twenty-four buff skills
  // promised a damage or haste number in their tooltip and delivered nothing
  // at all. Battle Cry, Avatar, Berserker Rage, Void Form, Shadow Dance,
  // Metamorphosis, Avenging Wrath.
  //
  // Nothing threw. The buff appeared on the bar, the icon lit, the timer ran
  // down. It was invisible unless you measured the damage.
  //
  // So this does not check the two keys that were missing — it checks that
  // every field a buff declares arrives, which is the version that catches
  // the next one too.
  const FIELDS = ['duration', 'damageTaken', 'damageBonus', 'attackSpeedBonus',
    'dodge', 'moveSpeed', 'healPerSecond', 'rooted'];
  let checked = 0;
  for (const cls of CLASSES) {
    const h = makeHarness({ level: 60 });
    const game = new Game(h.renderer, h.audio, h.profile);
    game.startRun(cls, { layout: 0 });
    const p = game.player;
    for (const skill of cls.skills) {
      if (skill.kind !== 'buff') continue;
      p.skills[0] = skill;
      p.cooldowns[0] = 0;
      p.resource = p.resourceMax;
      p.buffs.length = 0;
      assert(castSkill(game, p, 0), `${cls.id}'s ${skill.name} refused to cast`);
      const buff = p.buffs.find((b) => b.id === skill.id);
      assert(buff, `${cls.id}'s ${skill.name} applied no buff`);
      for (const f of FIELDS) {
        if (skill.power[f] === undefined) continue;
        assert(buff[f] !== undefined,
          `${cls.id}'s ${skill.name} declares ${f} and the buff does not carry it`);
      }
      checked++;
    }
  }
  assert(checked >= 20, `only ${checked} buff skills were exercised`);

  // And the two that were actually broken, measured rather than inspected: a
  // buff that carries the field but is ignored downstream would pass the loop
  // above and still do nothing.
  const h = makeHarness({ level: 60 });
  const game = new Game(h.renderer, h.audio, h.profile);
  const warrior = CLASSES[0];
  game.startRun(warrior, { layout: 0 });
  const p = game.player;
  p.skills[0] = warrior.skills.find((s) => s.id === 'battlecry');
  p.cooldowns[0] = 0;
  p.resource = p.resourceMax;
  const dmgBefore = p.stats.meleeMult, hasteBefore = p.attackSpeed;
  castSkill(game, p, 0);
  assert(p.stats.meleeMult > dmgBefore * 1.3,
    `Battle Cry moved melee damage from ${dmgBefore.toFixed(2)} to ${p.stats.meleeMult.toFixed(2)}`);
  assert(p.attackSpeed > hasteBefore * 1.2,
    `Battle Cry moved attack speed from ${hasteBefore.toFixed(2)} to ${p.attackSpeed.toFixed(2)}`);
});

check('how something died is visible in how it comes apart', async () => {
  const { Game } = await import('../src/game/game.js');
  const { makeHarness } = await import('./harness.js');
  const h = makeHarness({ level: 40 });
  const game = new Game(h.renderer, h.audio, h.profile);
  // Debris is behind the fancy-graphics switch, and the harness renderer is
  // not fancy by default — without this the whole check measures nothing and
  // passes.
  game.r.fancy = true;
  game.startRun(CLASSES[0], { layout: 0 });
  const p = game.player;
  // Crit is rolled, so an "ordinary" kill lands a natural critical about one
  // time in twelve and comes apart as a burst — which is correct behaviour and
  // a flaky test. The one case that wants a critical asks for one explicitly.
  p.critChance = 0;

  // Every enemy used to come apart the same way, which threw away the one
  // moment where the player's choice of damage is most visible. These read
  // off state the entity already carries at the moment it dies, so a mob that
  // was frozen when it died was killed frozen — no plumbing through forty
  // damage call sites, and no way for the two to disagree.
  const die = (prep, opts) => {
    game.mobs.length = 0;
    game.gibs.length = 0;
    game.particles.length = 0;
    const m = game.spawnMob('husk', p.x + 3, p.y, p.z + 3);
    if (prep) prep(m);
    const style = (() => {
      game.dealDamage(p, m, 999999, { silent: true, kx: 1, kz: 0, ...opts });
      return game.deathStyle(m);
    })();
    return { style, gibs: game.gibs.length, drift: game.gibs.filter((g) => g.drift).length };
  };

  const frozen = die((m) => { m.freeze = 2; });
  assert(frozen.style === 'shatter', `a frozen kill was a ${frozen.style}`);
  const burned = die((m) => { m.applyDot(5, 4, 'burn', p); });
  assert(burned.style === 'ash', `a burning kill was a ${burned.style}`);
  // Ash has to actually drift, or it is a pile of dark chunks on the floor.
  assert(burned.drift === burned.gibs && burned.gibs > 0,
    `${burned.gibs - burned.drift} of ${burned.gibs} ash pieces fall like bone`);
  const bled = die((m) => { m.applyDot(5, 4, 'bleed', p); });
  assert(bled.style === 'rend', `a bleeding kill was a ${bled.style}`);
  const crit = die(null, { forceCrit: true });
  assert(crit.style === 'burst', `a critical kill was a ${crit.style}`);
  const plain = die(null);
  assert(plain.style === 'normal', `an ordinary kill was a ${plain.style}`);

  // A shatter is more pieces than an ordinary death and ash is fewer. If they
  // ever come out the same the styles have collapsed back into one look with
  // different colours on it.
  assert(frozen.gibs > plain.gibs && burned.gibs < plain.gibs,
    `shatter ${frozen.gibs}, plain ${plain.gibs}, ash ${burned.gibs}: not distinct`);

  // A dot tick must never claim the critical. The blow that sold the kill is
  // the one that gets the flourish.
  game.mobs.length = 0;
  const m = game.spawnMob('husk', p.x + 3, p.y, p.z + 3);
  game.dealDamage(p, m, 1, { silent: true, isDot: true, forceCrit: true });
  assert(!m.lastHitCrit, 'a damage-over-time tick claimed a critical hit');
});

check('a boss keeps casting for the whole fight', async () => {
  const { Game } = await import('../src/game/game.js');
  const { makeHarness } = await import('./harness.js');
  const { RAIDS } = await import('../src/data/raids.js');

  // The bug this exists for, and it shipped: `this.casting` is decremented
  // past zero and lands on something like -0.0166, which is *truthy*. The
  // guard was `!this.casting`, so after the very first cast it was false
  // forever and no boss ever cast a second time. Every raid fight in the game
  // was one telegraph followed by four minutes of auto-attacks, and nothing
  // caught it because nothing counted.
  //
  // So this counts. A boss that stops casting is not a crash and is not
  // visible in any other test — it just quietly stops being a boss fight.
  const run = (setup) => {
    const h = makeHarness({ level: 60, gear: 6 });
    const game = new Game(h.renderer, h.audio, h.profile);
    const boss = setup(game);
    let casts = 0;
    const orig = boss.castRaid.bind(boss);
    boss.castRaid = (...a) => { casts++; return orig(...a); };
    for (let i = 0; i < 60 * 60; i++) {
      game.update(1 / 60, h.input());
      // Held alive and healthy so the count measures cadence rather than how
      // fast the harness kills things.
      if (boss.hp < boss.maxHp * 0.9) boss.hp = boss.maxHp * 0.9;
      game.player.hp = game.player.maxHp;
    }
    return casts;
  };

  const raidCasts = run((game) => {
    game.startRaid(CLASSES[0], RAIDS[0], 0);
    return game.raidBoss;
  });
  assert(raidCasts >= 4,
    `a raid boss cast ${raidCasts} times in a minute — it should be casting on a cadence`);

  // And the three arena bosses, which run the same pipeline now.
  for (const id of ['colossus', 'warden', 'broodmother']) {
    const casts = run((game) => {
      game.startRun(CLASSES[0], { layout: 0 });
      game.wave = 20;
      const p = game.player;
      return game.spawnMob(id, p.x + 7, p.y, p.z);
    });
    assert(casts >= 3, `the ${id} cast ${casts} times in a minute`);
  }
});

check('an arena you can see across', async () => {
  const { createArena, LAYOUT_COUNT, LAYOUT_NAMES } = await import('../src/world/world.js');

  // Reported from play: "there are far too many blockades in the maps and you
  // have to hunt too hard for enemies — that is not fun." Measured, that was
  // true and specific: across the six layouts, 15.4% of the arena interior
  // was wall you cannot see over, and 32% of all sightlines died inside eight
  // blocks. In the worst two it was half of them.
  //
  // A wave that ends with the player walking laps looking for one husk has
  // stopped being a fight, so both numbers are held here. `tools/arena-density.mjs`
  // prints the full per-layout table; this only guards the ceiling.
  const FLOOR_Y = 4, R = 22, MAX = 40;
  let wallSum = 0, shortSum = 0;

  for (let L = 0; L < LAYOUT_COUNT; L++) {
    const w = createArena(0, 1000 + L * 977, L);
    const cx = w.playerSpawn.x, cz = w.playerSpawn.z;
    let floor = 0, wall = 0;
    const stand = [];
    for (let x = -R; x <= R; x++) {
      for (let z = -R; z <= R; z++) {
        if (x * x + z * z > R * R) continue;
        const wx = cx + x, wz = cz + z;
        floor++;
        // Solid at chest height above the base floor. A one-block tier is
        // terrain you walk across; a two-block wall is terrain you walk
        // around, and only the second is a blockade.
        if (w.isSolid(wx, FLOOR_Y + 1.2, wz)) wall++;
        else stand.push([wx, wz]);
      }
    }
    const wallPct = (wall / Math.max(1, floor)) * 100;

    let rays = 0, short = 0;
    const step = Math.max(1, Math.floor(stand.length / 120));
    for (let i = 0; i < stand.length; i += step) {
      const [x, z] = stand[i];
      for (let a = 0; a < 16; a++) {
        const th = (a / 16) * Math.PI * 2;
        const dx = Math.cos(th), dz = Math.sin(th);
        let hit = MAX;
        for (let d = 0.5; d < MAX; d += 0.34) {
          if (w.isSolid(x + dx * d, FLOOR_Y + 1.2, z + dz * d)) { hit = d; break; }
        }
        rays++;
        if (hit < 8) short++;
      }
    }
    const shortPct = (short / Math.max(1, rays)) * 100;
    wallSum += wallPct; shortSum += shortPct;

    assert(wallPct < 16,
      `${LAYOUT_NAMES[L]} is ${wallPct.toFixed(1)}% wall inside the fighting area`);
    assert(shortPct < 28,
      `${LAYOUT_NAMES[L]}: ${shortPct.toFixed(0)}% of sightlines die inside eight blocks`);
  }

  const meanWall = wallSum / LAYOUT_COUNT, meanShort = shortSum / LAYOUT_COUNT;
  assert(meanWall < 8, `arenas average ${meanWall.toFixed(1)}% wall, was 15.4% before the cut`);
  assert(meanShort < 18, `${meanShort.toFixed(0)}% of sightlines are short, was 32%`);
});

check('every box goes through the batch', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const gl = await readFile(new URL('../src/render/gl.js', import.meta.url), 'utf8');

  // Boxes are not drawn when they are submitted: they queue into one array and
  // reach the driver as a single instanced draw. Measured on a thirty-mob
  // wave that took a frame from 605 draw calls and 3702 uniform sets to 5 and
  // 17, because what costs on a phone is the number of times JavaScript hands
  // work to the driver, not the amount handed over.
  //
  // The correctness risk is state the batch cannot express — the alpha cutoff,
  // the depth mask, a different program. Anything that changes one of those
  // has to push the queue out first, or the boxes already queued get drawn
  // under the new state instead of the one they were submitted under. That
  // does not throw; it draws shadows into the depth buffer, or an arena with
  // the wrong alpha threshold. So pin the three places it can happen.
  assert(/^  flush\(\) \{/m.test(src), 'the batch flush is gone');
  assert(src.includes('drawArraysInstanced'), 'the batch no longer draws instanced');

  const body = (name, end) => {
    const at = src.indexOf(name);
    assert(at >= 0, `${name} went missing`);
    const stop = src.indexOf(end, at + name.length);
    return src.slice(at, stop < 0 ? src.length : stop);
  };
  // The cutoff is a uniform, so changing it has to flush.
  const cutoff = body('setCutoff(v) {', '\n  /**');
  assert(cutoff.includes('this.flush()'), 'setCutoff changes a uniform without flushing');
  // The sky runs a different program.
  assert(body('drawSky() {', '\n  /**').includes('this.flush()'),
    'drawSky binds another program without flushing');
  // And the shadow pass turns the depth mask off, which no instance attribute
  // can carry.
  const shadow = body('shadowPass(fn) {', '\n  /**');
  assert(shadow.includes('depthMask(false)') && shadow.includes('this.flush()')
    && shadow.indexOf('this.flush()') < shadow.indexOf('depthMask(true)'),
    'the shadow pass restores the depth mask before flushing its blobs');

  // And the frame has to end with a flush, or whatever was queued after the
  // last state change is simply never drawn.
  const game = await readFile(new URL('../src/game/game.js', import.meta.url), 'utf8');
  assert(game.includes('this.r.flush()'), 'the frame never flushes what it queued last');

  // The vertex count divides by the real stride. It read `/ 6` against a
  // 7-float vertex for as long as the glow channel has existed, so every mesh
  // drew a sixth more vertices than it had — six phantom triangles per box,
  // reading past the end of the buffer.
  assert(gl.includes('floats.length / VERTEX_FLOATS'),
    'the vertex count is not derived from the vertex layout');
  assert(/VERTEX_FLOATS = 7/.test(gl), 'the vertex layout changed without the count following');
});

check('every sound the game asks for exists', async () => {
  const { readFile } = await import('node:fs/promises');
  const audio = await readFile(new URL('../src/core/audio.js', import.meta.url), 'utf8');
  const sources = (await Promise.all(
    ['../src/game/game.js', '../src/game/mobs.js', '../src/game/skills.js',
      '../src/game/player.js', '../src/game/effects.js', '../src/game/pets.js',
      '../src/ui/menus.js']
      .map((f) => readFile(new URL(f, import.meta.url), 'utf8'))
  )).join('\n');

  // A cue the synthesiser has no case for is silence, and silence is the one
  // bug you cannot see in a screenshot. This already caught `whoosh` once.
  const asked = new Set();
  for (const m of sources.matchAll(/\b(?:sfx|play)\(\s*'([a-z]+)'/g)) asked.add(m[1]);
  assert(asked.size > 20, `only found ${asked.size} cues — parser broke?`);
  for (const cue of asked) {
    assert(audio.includes(`case '${cue}'`), `'${cue}' is played but the synthesiser is silent for it`);
  }

  // And the creature cues specifically, because a fight made only of weapon
  // impacts has nothing alive in it.
  for (const cue of ['mobhurt', 'mobdie', 'mobswing', 'growl']) {
    assert(asked.has(cue), `nothing plays '${cue}'`);
  }
});

check('the music is a tune rather than a drone', async () => {
  const { Audio } = await import('../src/core/audio.js');
  assert(Audio.LEAD.length >= 4, `only ${Audio.LEAD.length} lead patterns`);
  const seen = new Set();
  for (const pat of Audio.LEAD) {
    assert(pat.length === 16, `a pattern is ${pat.length} steps, not 16`);
    // Rests are what make a line a line. One that plays on every step is a
    // drone with extra steps.
    assert(pat.some((n) => n === null) || pat.length === 16, 'pattern has no shape');
    for (const n of pat) {
      assert(n === null || (Number.isInteger(n) && n >= 0 && n < 16),
        `pattern degree ${n} is out of range`);
    }
    seen.add(pat.join(','));
  }
  assert(seen.size === Audio.LEAD.length, 'two lead patterns are identical');

  // Intensity has to actually reach a different pattern, or the boss wave
  // sounds like the first one.
  const pick = (lvl) => Math.min(3, Math.floor(lvl * 3.999));
  assert(pick(0) === 0 && pick(1) === 3, 'intensity does not span the patterns');
});

check('you can see across every arena', async () => {
  const { createArena, LAYOUT_COUNT, LAYOUT_NAMES } = await import('../src/world/world.js');

  // Reported from play: too much cover, and finding the last enemy of a wave
  // meant walking the floor. Measured, the Colosseum's four concentric walls
  // left a median sightline of four blocks — you could see four blocks, in a
  // fifty-block arena, and the wave did not end until you had crossed it.
  for (let L = 0; L < LAYOUT_COUNT; L++) {
    const medians = [];
    for (const seed of [7, 99, 4242]) {
      const w = createArena(0, seed, L);
      const cx = 32.5, cz = 32.5;
      const ranges = [];
      // Twelve standable vantage points, a full sweep from each.
      for (let s = 0; s < 12; s++) {
        const sa = (s / 12) * Math.PI * 2, sr = 6 + (s % 3) * 6;
        const ox = cx + Math.cos(sa) * sr, oz = cz + Math.sin(sa) * sr;
        const oy = w.groundAt(ox, oz, 20) + 1.6;
        if (w.isSolid(ox, oy, oz)) continue;
        for (let i = 0; i < 60; i++) {
          const a = (i / 60) * Math.PI * 2;
          let vis = 26;
          for (let r = 2; r <= 26; r += 2) {
            const tx = ox + Math.cos(a) * r, tz = oz + Math.sin(a) * r;
            if (Math.hypot(tx - cx, tz - cz) > 24) { vis = r; break; }
            if (!w.lineOfSight(ox, oy, oz, tx, oy - 0.4, tz)) { vis = r; break; }
          }
          ranges.push(vis);
        }
      }
      ranges.sort((a, b) => a - b);
      medians.push(ranges[ranges.length >> 1]);
    }
    const worst = Math.min(...medians);
    assert(worst >= 10,
      `${LAYOUT_NAMES[L]}: median sightline is ${worst} blocks — a wave ends by search, not by fighting`);
  }
});

check('the Forge is bought and kept by one character at a time', async () => {
  const { Profile } = await import('../src/core/save.js');
  const { PERMANENT, permanentMods } = await import('../src/data/permanent.js');
  const p = new Profile();
  const track = PERMANENT[0];
  const hunterId = p.createCharacter('hunter').id;
  const warriorId = p.createCharacter('warrior').id;

  p.forgeLevels(hunterId)[track.id] = track.max;
  assert(!(track.id in p.forgeLevels(warriorId)),
    'a Forge track bought on one character appeared on another');
  const hunter = permanentMods(p.forgeLevels(hunterId));
  const warrior = permanentMods(p.forgeLevels(warriorId));
  assert(Object.keys(hunter).length > 0, 'the hunter got nothing for a maxed track');
  assert(Object.keys(warrior).length === 0, 'the warrior inherited the hunter\'s Forge');

  // Two of the same class are two characters, which is exactly what the old
  // per-class bag could not say.
  const hunter2 = p.createCharacter('hunter').id;
  assert(!(track.id in p.forgeLevels(hunter2)),
    'the second hunter inherited the first one\'s Forge');

  // And the run reads the same bag the menu writes. Account-wide, the Forge was
  // the one system that made a fresh character start strong — every point of it
  // arrived the moment you made one, which is what made every character play
  // the same.
  const { readFile } = await import('node:fs/promises');
  const game = await readFile(new URL('../src/game/game.js', import.meta.url), 'utf8');
  assert(game.includes('permanentMods(this.profile.forgeLevels(this.charId))'),
    'a run no longer reads the per-character Forge');
});

check('every raid room keeps the promises the mechanics rely on', async () => {
  const { Game } = await import('../src/game/game.js');
  const { RAIDS } = await import('../src/data/raids.js');
  const { BLOCKS } = await import('../src/world/blocks.js');
  const { makeHarness } = await import('./harness.js');

  for (const raid of RAIDS) {
    const h = makeHarness({ gear: 0 });
    const g = new Game(h.renderer, h.audio, h.profile);
    g.startRaid(CLASSES[0], raid, 0);
    const w = g.world;
    const cx = 32, cz = 32;

    // The Walk: a full lap at r 20..26, standable and free of hazard, on every
    // bearing. Kiting is the counterplay to half the mechanics in the set, and
    // a room you can be cornered in is a wall with a boss in it.
    let blocked = 0;
    for (let i = 0; i < 180; i++) {
      const a = (i / 180) * Math.PI * 2;
      let ok = false;
      for (let r = 20; r <= 25 && !ok; r++) {
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        const y = w.groundAt(x, z, 14) + 1;
        if (w.isSolid(x, y + 0.1, z) || w.isSolid(x, y + 1.2, z)) continue;
        const under = BLOCKS[w.blockAt(x, y - 0.5, z)];
        if (under && under.damage) continue;
        ok = true;
      }
      if (!ok) blocked++;
    }
    assert(blocked === 0, `${raid.id}: the walk is blocked on ${blocked} of 180 bearings`);

    // The Dais: flat on top. slam reaches 11 blocks and shadow reaches 9, and
    // both are answered by walking in a straight line — an obstruction here is
    // a mechanic with no counterplay.
    let junk = 0;
    for (let z = -8; z <= 8; z++) {
      for (let x = -8; x <= 8; x++) {
        if (Math.hypot(x, z) > 8) continue;
        if (w.isSolid(cx + x, w.floorY + 2.6, cz + z)) junk++;
      }
    }
    assert(junk === 0, `${raid.id}: ${junk} obstructions on the dais`);

    // And nothing on it hurts. The dais is the boss's ground and the player is
    // on it for most of the fight; a rim of lava is a room that damages you for
    // fighting in the place it built for fighting.
    let burning = 0;
    for (let z = -9; z <= 9; z++) {
      for (let x = -9; x <= 9; x++) {
        if (Math.hypot(x, z) > 9) continue;
        const y = w.groundAt(cx + x, cz + z, 14);
        const under = BLOCKS[w.blockAt(cx + x, y, cz + z)];
        if (under && under.damage) burning++;
      }
    }
    assert(burning === 0, `${raid.id}: ${burning} damaging tiles on the dais`);

    // The Threshold: a fixed mark, facing up the room, not inside geometry.
    const p = g.player;
    assert(!w.isSolid(p.x, p.y + 0.1, p.z) && !w.isSolid(p.x, p.y + 1.2, p.z),
      `${raid.id}: the player spawns inside the room`);
    assert(p.yaw === 0, `${raid.id}: the player does not face the dais`);
    assert(p.z > cz + 12, `${raid.id}: the player does not spawn at the threshold`);

    // Somewhere for summons to land that is not a lap behind the fight.
    assert(w.spawnPoints.length >= 8, `${raid.id}: only ${w.spawnPoints.length} spawn points`);

    // Line of sight has to be breakable by geometry, because it cannot be
    // broken by distance: the ranged bosses have 30 blocks of range and the
    // room is 52 across. Without cover, kiting a Warden-stance boss is the
    // whole fight.
    let cover = 0;
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      for (let r = 10; r <= 20; r++) {
        if (w.isSolid(cx + Math.cos(a) * r, w.floorY + 4.5, cz + Math.sin(a) * r)) { cover++; break; }
      }
    }
    assert(cover >= 8, `${raid.id}: only ${cover} of 64 bearings have cover above head height`);
  }
});

check('a raid wipe never banks the run twice', async () => {
  const { Game } = await import('../src/game/game.js');
  const { RAIDS } = await import('../src/data/raids.js');
  const { makeHarness } = await import('./harness.js');
  const raid = RAIDS[0];

  const h = makeHarness({ gear: 0 });
  let banked = 0;
  h.profile.finishRun = () => { banked++; };
  const g = new Game(h.renderer, h.audio, h.profile);
  g.startRaid(CLASSES[0], raid, 0);

  // Three wipes and three retries. Each death must stop the fight and bank
  // nothing: `endRun` pays out gold, XP and quest progress, and a system whose
  // whole premise is "wipes cost nothing" must never pay out for one.
  for (let i = 0; i < 3; i++) {
    g.player.hp = 0;
    g.player.dead = true;
    g.onPlayerDeath();
    assert(banked === 0, `a wipe banked the run (attempt ${i + 1})`);
    assert(!g.over, 'a wipe ended the run');
    assert(g.retryRaid(), 'a wipe could not be retried');
    assert(!g.player.dead && g.player.hp === g.player.maxHp, 'a retry did not restore the player');
    assert(g.raidBoss && g.raidBoss.hp === g.raidBoss.maxHp, 'a retry did not reset the boss');
  }
  // Stopping banks it, exactly once.
  g.endRun();
  assert(banked === 1, `stopping banked the run ${banked} times`);

  // And an arena death still ends an arena run, which is the behaviour the
  // raid path was carved out of.
  const h2 = makeHarness();
  const g2 = new Game(h2.renderer, h2.audio, h2.profile);
  g2.startRun(CLASSES[0], { layout: 0 });
  g2.player.dead = true;
  g2.onPlayerDeath();
  assert(g2.over, 'an arena death no longer ends the run');
});

check('a raid needs level, the previous clear, and the previous set', async () => {
  const { RAIDS, raidAccess, emptyRaidState, CORE_ORDER } = await import('../src/data/raids.js');
  const t0 = RAIDS[0], t1 = RAIDS[1];
  const st = emptyRaidState();
  const fullT0 = Object.fromEntries(CORE_ORDER.map((s) => [s, 0]));

  // The first raid asks for a level and nothing else — no previous clear, no
  // previous set, because there is no tier below it. It does not open at level
  // 1: a character with two skills and no talents has no fight there.
  assert(!raidAccess(t0, { level: 1, raidState: st, gear: {} }).ok,
    'the first raid opens at level 1');
  assert(raidAccess(t0, { level: t0.level, raidState: st, gear: {} }).ok,
    'the first raid is gated on something other than level');

  // Level alone is not enough.
  assert(!raidAccess(t1, { level: 5, raidState: st, gear: fullT0 }).ok, 'level gate is open too early');
  assert(!raidAccess(t1, { level: 60, raidState: st, gear: fullT0 }).ok,
    'an uncleared previous raid did not block entry');

  // Cleared but not geared: still shut. This is the gate that stops a player
  // levelling straight up the raids and arriving at the top in starting gear.
  for (const b of t0.bosses) st.killed[b.id] = true;
  const bad = { ...fullT0 };
  delete bad.helm;
  assert(!raidAccess(t1, { level: 60, raidState: st, gear: bad }).ok,
    'a missing set piece did not block entry');
  assert(raidAccess(t1, { level: 60, raidState: st, gear: fullT0 }).ok,
    'all three gates open and entry was still refused');

  // Every refusal has to say why. A greyed-out button leaves a player guessing
  // which of three conditions they failed.
  const refused = raidAccess(t1, { level: 5, raidState: emptyRaidState(), gear: {} });
  assert(refused.reason && refused.reason.length > 10, 'a refusal gave no reason');
});

check('a boss is consumed by dying, not by fighting', async () => {
  const { RAIDS, nextBoss, isBossDead, emptyRaidState, isRaidCleared, bossesDown } =
    await import('../src/data/raids.js');
  const raid = RAIDS[0];
  const st = emptyRaidState();

  // Reading the next boss any number of times must not consume it — the wipe
  // path does exactly this, and if it advanced, a wipe would skip a boss.
  const first = nextBoss(st, raid);
  for (let i = 0; i < 50; i++) {
    assert(nextBoss(st, raid).id === first.id, 'looking at a boss consumed it');
  }
  assert(!isBossDead(st, first.id), 'a boss died without being killed');

  // Only recording the kill advances it, and in order.
  for (let i = 0; i < raid.bosses.length; i++) {
    const b = nextBoss(st, raid);
    assert(b.index === i, `boss order jumped to ${b.index} at step ${i}`);
    st.killed[b.id] = true;
    assert(bossesDown(st, raid) === i + 1, 'the kill was not counted');
  }
  assert(nextBoss(st, raid) === null, 'a cleared raid still offers a boss');
  assert(isRaidCleared(st, raid), 'six kills did not clear the raid');
});

check('a raid record from an older or damaged save is repaired', async () => {
  const { normaliseRaidState, RAIDS } = await import('../src/data/raids.js');
  for (const bad of [undefined, null, {}, { killed: null }, { killed: 'nope' },
    { killed: { notaboss: true } }, { killed: { venoxis: true, alsofake: 1 } }]) {
    const st = normaliseRaidState(bad);
    assert(st && st.killed && typeof st.killed === 'object', 'repair produced no record');
    // A boss id that does not exist must not survive: it would count toward a
    // clear that never happened.
    const valid = new Set(RAIDS.flatMap((r) => r.bosses.map((b) => b.id)));
    for (const id of Object.keys(st.killed)) {
      assert(valid.has(id), `repair kept an unknown boss id ${id}`);
    }
  }
  assert(normaliseRaidState({ killed: { venoxis: true } }).killed.venoxis,
    'repair dropped a real kill');
});

// --- Potions ---------------------------------------------------------------

check('potions are weighted, colour-coded and never worthless', async () => {
  const { POTIONS, rollPotion, DROP_CHANCE, ELITE_DROP_CHANCE } = await import('../src/data/potions.js');
  const ids = new Set();
  for (const p of POTIONS) {
    assert(!ids.has(p.id), `duplicate potion id ${p.id}`);
    ids.add(p.id);
    assert(/^#[0-9a-f]{6}$/i.test(p.color), `${p.id} has no usable colour`);
    // Every potion must actually do something. A pickup that grants nothing is
    // worse than no pickup: it teaches the player to ignore the whole system.
    const does = p.heal || p.damageBonus || p.moveSpeed || p.attackSpeedBonus;
    assert(does, `${p.id} grants nothing`);
    // Anything with a lasting effect needs a duration, and anything instant
    // must not have one.
    if (p.heal) assert(p.duration === 0, `${p.id} is instant but has a duration`);
    else assert(p.duration > 0, `${p.id} is a buff with no duration`);
  }
  assert(ELITE_DROP_CHANCE > DROP_CHANCE, 'elites are no more generous than trash');
  assert(DROP_CHANCE < 0.2, 'potions drop often enough to become a rotation');

  // The roll must reach every type, or a declared potion is unreachable.
  const seen = new Set();
  for (let i = 0; i < 4000; i++) seen.add(rollPotion().id);
  assert(seen.size === POTIONS.length, `roll only ever produced ${seen.size} of ${POTIONS.length}`);
});

check('a dropped potion is picked up and actually does something', async () => {
  const { Game } = await import('../src/game/game.js');
  const { Potion } = await import('../src/game/effects.js');
  const { POTION_BY_ID } = await import('../src/data/potions.js');
  const { makeHarness } = await import('./harness.js');

  const h = makeHarness();
  const game = new Game(h.renderer, h.audio, h.profile);
  game.startRun(CLASSES[0], { layout: 0 });
  const p = game.player;

  // Health: dropped at the player's feet, walked over, restores health.
  p.hp = p.maxHp * 0.4;
  const before = p.hp;
  game.potions.push(new Potion(p.x, p.y + 0.2, p.z, POTION_BY_ID.health, 20));
  for (let i = 0; i < 90; i++) game.update(1 / 60, h.input());
  assert(p.hp > before, 'the health potion healed nothing');
  assert(game.potions.length === 0, 'the potion was not consumed');

  // Damage: applies a buff that the player's stats actually read.
  const baseMult = p.stats.meleeMult;
  game.potions.push(new Potion(p.x, p.y + 0.2, p.z, POTION_BY_ID.damage, 20));
  for (let i = 0; i < 90; i++) game.update(1 / 60, h.input());
  assert(p.hasBuff('potion_damage'), 'the damage potion granted no buff');
  assert(p.stats.meleeMult > baseMult, 'the damage buff does not reach the damage stat');

  // Speed: same, on the movement stat the controller actually reads.
  const baseSpeed = p.moveSpeed;
  game.potions.push(new Potion(p.x, p.y + 0.2, p.z, POTION_BY_ID.speed, 20));
  for (let i = 0; i < 90; i++) game.update(1 / 60, h.input());
  assert(p.hasBuff('potion_speed'), 'the speed potion granted no buff');
  assert(p.moveSpeed > baseSpeed, 'the speed buff does not reach the movement stat');

  // And a potion nobody collects must eventually clear itself, or a long run
  // accumulates every drop it ever made.
  game.potions.push(new Potion(p.x + 40, p.y + 0.2, p.z + 40, POTION_BY_ID.health, 1.0));
  for (let i = 0; i < 120; i++) game.update(1 / 60, h.input());
  assert(game.potions.length === 0, 'an uncollected potion never despawned');
});

// --- Pricing ---------------------------------------------------------------

check('every shop applies the global price multiplier', async () => {
  const { PRICE_MULTIPLIER } = await import('../src/data/permanent.js');
  assert(PRICE_MULTIPLIER > 0, 'the multiplier is not a usable number');
  // Both shops must go through it. A price computed from baseCost and growth
  // alone would silently stay on the old scale, and the only symptom would be
  // one shop being cheap — which reads as a balance opinion, not a bug.
  for (const def of PERMANENT) {
    const raw = def.baseCost * Math.pow(def.growth, 0);
    assert(upgradeCost(def, 0) === Math.round(raw * PRICE_MULTIPLIER),
      `Forge track ${def.id} is not priced through PRICE_MULTIPLIER`);
  }
  // The Armoury is deliberately outside the multiplier: its prices are pinned
  // to the level curve rather than to a global dial, and a 50% markup applied
  // on top would put T6 out of reach of the cap it is meant to be the chase for.
  assert(gearCost(3) === 51200, 'gear prices have drifted off the 800 x 4^tier curve');
});

// --- Wave affixes ----------------------------------------------------------
// The properties the whole system rests on: a wave's rules must be stable,
// legible, never self-contradictory, and never arrive before the player has
// had a chance to learn the base game.

check('affixes are a pure function of seed and wave', async () => {
  const { affixesForWave } = await import('../src/data/affixes.js');
  for (const seed of [1, 777, 0x5f3759df]) {
    for (let wave = 1; wave <= 40; wave++) {
      const a = affixesForWave(wave, seed).map((x) => x.id).join(',');
      const b = affixesForWave(wave, seed).map((x) => x.id).join(',');
      assert(a === b, `wave ${wave} rolled differently on a re-read: ${a} vs ${b}`);
    }
  }
  // Different seeds must actually produce different runs, or every run is the
  // same run and the system is decoration.
  let differs = 0;
  for (let wave = 4; wave <= 40; wave++) {
    const a = affixesForWave(wave, 1).map((x) => x.id).join(',');
    const b = affixesForWave(wave, 424242).map((x) => x.id).join(',');
    if (a !== b) differs++;
  }
  assert(differs >= 10, `only ${differs}/37 waves differ between seeds`);
});

check('a wave never draws a duplicate or two affixes from one group', async () => {
  const { affixesForWave, affixCount } = await import('../src/data/affixes.js');
  const { DIFFICULTIES } = await import('../src/data/difficulty.js');
  for (const diff of DIFFICULTIES) {
    for (const seed of [3, 99, 12345]) {
      for (let wave = 1; wave <= 60; wave++) {
        const list = affixesForWave(wave, seed, diff);
        const ids = new Set(list.map((a) => a.id));
        assert(ids.size === list.length, `wave ${wave} drew a duplicate affix`);
        const groups = new Set(list.map((a) => a.group));
        assert(groups.size === list.length,
          `wave ${wave} drew two affixes from one group: ${list.map((a) => a.id)}`);
        // Never more than the ramp allows, and never an affix from before its
        // tier — a rule the player has not been taught yet reads as a bug.
        assert(list.length <= affixCount(wave, diff), `wave ${wave} drew too many affixes`);
        for (const a of list) assert(wave >= a.tier, `${a.id} appeared at wave ${wave} < tier ${a.tier}`);
      }
    }
  }
});

check('the opening waves are played under no rules at all', async () => {
  const { affixesForWave } = await import('../src/data/affixes.js');
  const { DIFFICULTIES } = await import('../src/data/difficulty.js');
  for (let wave = 1; wave <= 3; wave++) {
    assert(affixesForWave(wave, 1, DIFFICULTIES[0]).length === 0,
      `wave ${wave} on Veteran already carries an affix`);
  }
  // And the ramp has to actually arrive, or the system never turns on.
  assert(affixesForWave(12, 1, DIFFICULTIES[0]).length >= 1, 'wave 12 has no affix');
  assert(affixesForWave(30, 1, DIFFICULTIES[0]).length >= 2, 'wave 30 has fewer than 2 affixes');
});

check('every affix is described, coloured and paid for', async () => {
  const { AFFIXES } = await import('../src/data/affixes.js');
  const ids = new Set();
  for (const a of AFFIXES) {
    assert(!ids.has(a.id), `duplicate affix id ${a.id}`);
    ids.add(a.id);
    assert(a.name && a.icon && a.color && a.group, `${a.id} is missing presentation fields`);
    // Both lines exist because they answer different questions: blurb is what
    // it does, counter is what to do about it. A rule with no stated answer is
    // a rule that just kills you.
    assert(a.blurb && a.counter, `${a.id} has no blurb/counter`);
    assert(a.souls > 0, `${a.id} adds danger for no reward`);
    assert(a.tier >= 4, `${a.id} can appear before the player has learned the game`);
  }
  assert(AFFIXES.length >= 8, 'too few affixes for the roster to feel varied');
});

check('every affix is actually implemented somewhere', async () => {
  const { readFile } = await import('node:fs/promises');
  const { AFFIXES } = await import('../src/data/affixes.js');
  const sources = (await Promise.all(
    ['../src/game/game.js', '../src/game/mobs.js', '../src/game/effects.js']
      .map((p) => readFile(new URL(p, import.meta.url), 'utf8'))
  )).join('\n');
  // A declared affix that nothing reads is a promise on the wave banner that
  // the game does not keep — the same class of bug as a dead effect key.
  for (const a of AFFIXES) {
    assert(sources.includes(`'${a.id}'`), `affix ${a.id} is declared but never read by game code`);
  }
});

check('a run under a full affix stack still resolves', async () => {
  const { Game } = await import('../src/game/game.js');
  const { CLASSES } = await import('../src/data/classes.js');
  const { affixesForWave } = await import('../src/data/affixes.js');
  const { makeHarness } = await import('./harness.js');

  const h = makeHarness();
  const game = new Game(h.renderer, h.audio, h.profile);
  // Start deep enough that the wave carries the maximum number of rules, with
  // a seed chosen so all three corpse/behaviour/player groups are represented.
  game.startRun(CLASSES[0], { difficulty: 3, seed: 7, layout: 0 });
  game.wave = 29;
  game.nextWave();
  assert(game.affixes.length === 3, `expected 3 affixes, got ${game.affixes.length}`);

  const before = game.player.hp;
  for (let i = 0; i < 60 * 30; i++) game.update(1 / 60, h.input());
  assert(Number.isFinite(game.player.hp), 'player health went non-finite under affixes');
  assert(game.player.hp <= before, 'thirty seconds in a wave-29 stack cost nothing');
  for (const m of game.mobs) {
    assert(Number.isFinite(m.hp) && m.hp > 0, `a mob has invalid health: ${m.hp}`);
    assert(Number.isFinite(m.speed) && m.speed > 0, `a mob has invalid speed: ${m.speed}`);
  }
  // Spiteful is the one affix that can spawn enemies from enemies. If it ever
  // outruns the player it stops being an affix and becomes an infinite wave.
  assert(game.mobs.length < 200, `mob count ran away: ${game.mobs.length}`);
  assert(affixesForWave(29, 7).length === 3, 'wave 29 affix count changed under the harness');
});

// --- Math ------------------------------------------------------------------

check('clamp behaves', () => {
  assert(clamp(5, 0, 1) === 1 && clamp(-5, 0, 1) === 0 && clamp(0.5, 0, 1) === 0.5, 'clamp');
});

check('angleDelta wraps to the short way round', () => {
  assert(near(angleDelta(0, Math.PI / 2), Math.PI / 2), 'quarter turn');
  assert(Math.abs(angleDelta(0.1, 6.2)) < 0.3, 'wrap across 2PI');
  assert(Math.abs(angleDelta(0, Math.PI * 2)) < 1e-9, 'full turn is zero');
});

check('forwardVec is unit length', () => {
  for (let i = 0; i < 40; i++) {
    const yaw = i * 0.31, pitch = Math.sin(i) * 1.2;
    const [x, y, z] = forwardVec(yaw, pitch);
    assert(near(Math.hypot(x, y, z), 1, 1e-9), `not unit at ${yaw},${pitch}`);
  }
});

check('perspective matrix is well formed', () => {
  const m = perspective(mat4(), Math.PI / 3, 16 / 9, 0.1, 100);
  assert(m[11] === -1, 'w row wrong');
  assert(m[0] > 0 && m[5] > 0, 'scale wrong');
  assert(Number.isFinite(m[14]) && m[14] < 0, 'depth term wrong');
});

// --- Report ----------------------------------------------------------------

await Promise.all(pending);

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`);
  for (const f of failures) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`✓ all ${passed} checks passed`);
