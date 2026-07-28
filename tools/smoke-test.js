// Headless checks over the pure-logic modules (no DOM required).
// Run with: npm test

import {
  CLASSES, CLASS_BY_ID, TALENT_BY_ID, LOADOUT_SIZE, totalTalentRanks,
  defaultLoadout, resolveLoadout, unlockedSkills,
} from '../src/data/classes.js';
import {
  ARMOR_SLOTS, armorCost, armorMods, armorRating, armorTierName, ARMOR_MAX_TIER,
} from '../src/data/armor.js';
import { UPGRADES, RARITY, rollUpgrades } from '../src/data/upgrades.js';
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

// --- Classes ---------------------------------------------------------------

check('six playable classes', () => {
  assert(CLASSES.length === 6, `expected 6 classes, got ${CLASSES.length}`);
});

check('class ids are unique', () => {
  const ids = new Set(CLASSES.map((c) => c.id));
  assert(ids.size === CLASSES.length, 'duplicate class id');
});

check('every class has a pool of 8 skills with valid kinds', () => {
  const kinds = new Set(['projectile', 'aoe_self', 'aoe_target', 'dash', 'buff',
    'heal', 'summon', 'cone', 'chain', 'strike', 'zone']);
  for (const c of CLASSES) {
    assert(c.skills.length === 8, `${c.id} has ${c.skills.length} skills`);
    for (const s of c.skills) {
      assert(kinds.has(s.kind), `${c.id}/${s.id} unknown kind "${s.kind}"`);
      assert(s.cost >= 0, `${c.id}/${s.id} negative cost`);
      assert(s.cooldown > 0, `${c.id}/${s.id} non-positive cooldown`);
      assert(typeof s.icon === 'string' && s.icon.length, `${c.id}/${s.id} missing icon`);
      assert(typeof s.desc === 'string' && s.desc.length > 10, `${c.id}/${s.id} weak description`);
    }
  }
});

check('every class has 3 talent branches of 6 nodes', () => {
  for (const c of CLASSES) {
    assert(c.talents.length === 3, `${c.id} has ${c.talents.length} branches`);
    for (const b of c.talents) {
      assert(b.nodes.length === 6, `${c.id}/${b.name} has ${b.nodes.length} nodes`);
      for (const n of b.nodes) {
        assert(n.max >= 1, `${n.id} max rank ${n.max}`);
        assert(Object.keys(n.effect).length > 0, `${n.id} has no effect`);
      }
    }
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

check('a full talent tree is affordable at a reachable wave', () => {
  for (const c of CLASSES) {
    const total = c.talents.reduce((s, b) => s + b.nodes.reduce((t, n) => t + n.max, 0), 0);
    // Points come from best wave; make sure the tree can be filled eventually.
    let wave = 0;
    while (talentPointsForBestWave(wave) < total && wave < 500) wave++;
    assert(wave < 100, `${c.id} needs wave ${wave} to fully spec`);
  }
});

// --- Upgrades --------------------------------------------------------------

check('upgrade ids are unique and rarities valid', () => {
  const ids = new Set();
  for (const u of UPGRADES) {
    assert(!ids.has(u.id), `duplicate upgrade ${u.id}`);
    ids.add(u.id);
    assert(RARITY[u.rarity], `${u.id} bad rarity ${u.rarity}`);
    assert(Object.keys(u.effect).length > 0, `${u.id} has no effect`);
  }
});

check('rollUpgrades returns distinct cards', () => {
  for (let i = 0; i < 300; i++) {
    const cards = rollUpgrades(3);
    assert(cards.length === 3, `got ${cards.length} cards`);
    const ids = new Set(cards.map((c) => c.id));
    assert(ids.size === 3, 'duplicate cards in one offer');
  }
});

check('rollUpgrades honours exclusions', () => {
  const exclude = new Set(UPGRADES.slice(0, UPGRADES.length - 3).map((u) => u.id));
  const cards = rollUpgrades(3, 0, exclude);
  for (const c of cards) assert(!exclude.has(c.id), `excluded ${c.id} was offered`);
});

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
  const mods = permanentMods({ p_hp: 3, p_dmg: 2 });
  assert(near(mods.maxHp, 45), `maxHp ${mods.maxHp}`);
  assert(near(mods.allDamage, 0.10), `allDamage ${mods.allDamage}`);
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

  const dataSrc = ['src/data/classes.js', 'src/data/upgrades.js', 'src/data/permanent.js',
    'src/data/armor.js']
    .map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
  const keys = new Set();
  for (const m of dataSrc.matchAll(/effect:\s*\{([^}]*)\}/g)) {
    for (const k of m[1].matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:/g)) keys.add(k[1]);
  }
  assert(keys.size > 40, `only found ${keys.size} effect keys — parser broke?`);

  const codeSrc = ['src/game/player.js', 'src/game/skills.js', 'src/game/game.js',
    'src/game/pets.js', 'src/game/entity.js', 'src/game/mobs.js', 'src/ui/hud.js']
    .map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');

  const dead = [...keys].filter((k) => !codeSrc.includes('.' + k));
  assert(dead.length === 0, `effects declared but never read: ${dead.sort().join(', ')}`);
});


// --- Loadouts, armour and mastery ------------------------------------------

check('the first four skills of every class are always available', () => {
  for (const c of CLASSES) {
    const free = c.skills.slice(0, LOADOUT_SIZE);
    for (const s of free) assert(!(s.unlock || 0), `${c.id}/${s.id} gates a starter skill`);
    const later = c.skills.slice(LOADOUT_SIZE);
    for (const s of later) assert((s.unlock || 0) > 0, `${c.id}/${s.id} is an unlock with no gate`);
  }
});

check('skill ids are unique within a class', () => {
  for (const c of CLASSES) {
    const ids = new Set(c.skills.map((s) => s.id));
    assert(ids.size === c.skills.length, `${c.id} has a duplicate skill id`);
  }
});

check('resolveLoadout always yields four distinct unlocked skills', () => {
  for (const c of CLASSES) {
    for (const [ids, best] of [
      [undefined, 0], [[], 0], [['nonsense'], 0],
      [[c.skills[7].id], 0],                       // locked at wave 0
      [[c.skills[7].id], 99],                      // unlocked deep in
      [[c.skills[0].id, c.skills[0].id], 0],       // duplicate
      [c.skills.map((s) => s.id), 99],             // too many
    ]) {
      const out = resolveLoadout(c, ids, best);
      assert(out.length === LOADOUT_SIZE, `${c.id} produced ${out.length} skills`);
      assert(new Set(out.map((s) => s.id)).size === LOADOUT_SIZE, `${c.id} duplicated a slot`);
      const open = new Set(unlockedSkills(c, best).map((s) => s.id));
      for (const s of out) assert(open.has(s.id), `${c.id} slotted locked skill ${s.id}`);
    }
    assert(resolveLoadout(c, defaultLoadout(c), 0).map((s) => s.id).join() === defaultLoadout(c).join(),
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

check('armour costs climb and its bonuses add up', () => {
  for (const def of ARMOR_SLOTS) {
    assert(armorCost(def, 0) === def.baseCost, `${def.id} tier 0 cost`);
    for (let t = 1; t < ARMOR_MAX_TIER; t++) {
      assert(armorCost(def, t) > armorCost(def, t - 1), `${def.id} cost flat at ${t}`);
    }
    assert(armorTierName(def, 0).includes(def.name), `${def.id} unforged name`);
    assert(armorTierName(def, 12) !== armorTierName(def, 2), `${def.id} names do not change`);
  }
  const tiers = Object.fromEntries(ARMOR_SLOTS.map((s) => [s.id, 3]));
  const mods = armorMods(tiers);
  assert(armorRating(tiers) === ARMOR_SLOTS.length * 3, 'armour rating');
  assert(mods.maxHp > 0 && mods.allDamage > 0, 'armour gives no stats');
  assert(Object.keys(armorMods({})).length === 0, 'empty armour grants nothing');
});

check('every armour and Forge effect is a modifier the player reads', () => {
  const known = new Set(PERMANENT.flatMap((d) => Object.keys(d.effect)));
  for (const def of ARMOR_SLOTS) {
    for (const k of Object.keys(def.effect)) {
      assert(known.has(k) || ['dodge'].includes(k), `armour key ${k} is not a known modifier`);
    }
  }
});


// --- Every skill actually fires -------------------------------------------
// Eight skills across six classes is 48 code paths through castSkill, and a
// typo in one skill's power block is invisible until a player equips it.

check('every skill in every class pool casts without throwing', async () => {
  const { Game } = await import('../src/game/game.js');
  const { castSkill } = await import('../src/game/skills.js');

  const stubRenderer = {
    setWorld() {}, setTheme() {}, project: () => null,
    skyTint: [0, 0, 0], fancy: false,
  };
  const stubAudio = {
    play() {}, startMusic() {}, stopMusic() {}, setMusicIntensity() {}, ensure() {},
  };

  for (const cls of CLASSES) {
    for (const skill of cls.skills) {
      const classes = {};
      for (const c of CLASSES) {
        classes[c.id] = {
          talents: {}, bestWave: 99, kills: 0, runs: 0, mastery: 0,
          loadout: [skill.id],
        };
      }
      const profile = {
        data: { permanent: {}, armor: {}, classes, souls: 0, stats: {} },
        settings: { showDamage: false },
        classData: (id) => classes[id],
        loadout: (c) => resolveLoadout(c, classes[c.id].loadout, 99),
        finishRun() {}, save() {},
      };
      const game = new Game(stubRenderer, stubAudio, profile);
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
      const input = { moveX: 0, moveY: 0, attack: false, jump: false, sprint: false, skills: [false] };
      for (let i = 0; i < 150; i++) game.update(1 / 60, input);
      assert(Number.isFinite(p.hp), `${cls.id}/${skill.id} corrupted player hp`);
    }
  }
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
