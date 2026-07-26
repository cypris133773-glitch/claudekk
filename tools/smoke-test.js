// Headless checks over the pure-logic modules (no DOM required).
// Run with: npm test

import { CLASSES, CLASS_BY_ID, TALENT_BY_ID } from '../src/data/classes.js';
import { UPGRADES, RARITY, rollUpgrades } from '../src/data/upgrades.js';
import { PERMANENT, upgradeCost, permanentMods, talentPointsForBestWave } from '../src/data/permanent.js';
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

check('every class has 4 skills with valid kinds', () => {
  const kinds = new Set(['projectile', 'aoe_self', 'aoe_target', 'dash', 'buff',
    'heal', 'summon', 'cone', 'chain', 'strike']);
  for (const c of CLASSES) {
    assert(c.skills.length === 4, `${c.id} has ${c.skills.length} skills`);
    for (const s of c.skills) {
      assert(kinds.has(s.kind), `${c.id}/${s.id} unknown kind "${s.kind}"`);
      assert(s.cost >= 0, `${c.id}/${s.id} negative cost`);
      assert(s.cooldown > 0, `${c.id}/${s.id} non-positive cooldown`);
      assert(typeof s.icon === 'string' && s.icon.length, `${c.id}/${s.id} missing icon`);
      assert(typeof s.desc === 'string' && s.desc.length > 10, `${c.id}/${s.id} weak description`);
    }
  }
});

check('every class has 3 talent branches of 4 nodes', () => {
  for (const c of CLASSES) {
    assert(c.talents.length === 3, `${c.id} has ${c.talents.length} branches`);
    for (const b of c.talents) {
      assert(b.nodes.length === 4, `${c.id}/${b.name} has ${b.nodes.length} nodes`);
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

  const dataSrc = ['src/data/classes.js', 'src/data/upgrades.js', 'src/data/permanent.js']
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
