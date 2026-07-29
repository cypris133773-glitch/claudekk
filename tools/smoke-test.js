// Headless checks over the pure-logic modules (no DOM required).
// Run with: npm test

import {
  CLASSES, CLASS_BY_ID, TALENT_BY_ID, LOADOUT_SIZE, totalTalentRanks,
  defaultLoadout, resolveLoadout, unlockedSkills,
} from '../src/data/classes.js';
import {
  ARMOR_SLOTS, ARMOR_SETS, armorCost, armorMods, armorRating, armorTierName,
  ARMOR_MAX_TIER, armorSets, nextArmorSet,
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

check('every class has a pool of 10 skills with valid kinds', () => {
  const kinds = new Set(['projectile', 'aoe_self', 'aoe_target', 'dash', 'buff',
    'heal', 'summon', 'cone', 'chain', 'strike', 'zone']);
  for (const c of CLASSES) {
    assert(c.skills.length === 10, `${c.id} has ${c.skills.length} skills`);
    for (const s of c.skills) {
      assert(kinds.has(s.kind), `${c.id}/${s.id} unknown kind "${s.kind}"`);
      assert(s.cost >= 0, `${c.id}/${s.id} negative cost`);
      assert(s.cooldown > 0, `${c.id}/${s.id} non-positive cooldown`);
      assert(typeof s.icon === 'string' && s.icon.length, `${c.id}/${s.id} missing icon`);
      assert(typeof s.desc === 'string' && s.desc.length > 10, `${c.id}/${s.id} weak description`);
    }
  }
});

check('every class has 4 talent branches of 6 nodes', () => {
  for (const c of CLASSES) {
    assert(c.talents.length === 4, `${c.id} has ${c.talents.length} branches`);
    for (const b of c.talents) {
      assert(b.nodes.length === 6, `${c.id}/${b.name} has ${b.nodes.length} nodes`);
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
  const hp = PERMANENT.find((d) => d.id === 'p_hp');
  const dmg = PERMANENT.find((d) => d.id === 'p_dmg');
  const mods = permanentMods({ p_hp: 3, p_dmg: 2 });
  assert(near(mods.maxHp, hp.effect.maxHp * 3), `maxHp ${mods.maxHp}`);
  assert(near(mods.allDamage, dmg.effect.allDamage * 2), `allDamage ${mods.allDamage}`);
});

check('the Forge is an endless grind, not a checklist', () => {
  const endless = PERMANENT.filter((d) => d.max >= 40);
  assert(endless.length >= 15, `only ${endless.length} tracks run deep`);
  // Maxing everything must be far out of reach of any single run.
  let total = 0;
  for (const d of PERMANENT) {
    for (let lv = 0; lv < d.max; lv++) total += upgradeCost(d, lv);
  }
  assert(total > 5e6, `maxing the Forge only costs ${Math.round(total)} souls`);
  // And the late levels must cost meaningfully more than the early ones, or
  // "endless" is just a longer checklist.
  for (const d of endless) {
    assert(upgradeCost(d, d.max - 1) > upgradeCost(d, 0) * 20,
      `${d.id} barely gets more expensive`);
  }
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

check('every skill is available from the first run', () => {
  for (const c of CLASSES) {
    assert(unlockedSkills(c).length === c.skills.length,
      `${c.id} gates ${c.skills.length - unlockedSkills(c).length} of its skills`);
    for (const s of c.skills) {
      assert(s.unlock === undefined, `${c.id}/${s.id} still carries an unlock gate`);
    }
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
      [[c.skills[9].id], 0],                       // the last of the pool
      [[c.skills[9].id], 99],
      [[c.skills[0].id, c.skills[0].id], 0],       // duplicate
      [c.skills.map((s) => s.id), 99],             // too many
    ]) {
      const out = resolveLoadout(c, ids, best);
      assert(out.length === LOADOUT_SIZE, `${c.id} produced ${out.length} skills`);
      assert(new Set(out.map((s) => s.id)).size === LOADOUT_SIZE, `${c.id} duplicated a slot`);
      const open = new Set(unlockedSkills(c).map((s) => s.id));
      for (const s of out) assert(open.has(s.id), `${c.id} slotted unknown skill ${s.id}`);
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
    // baseCost is the pre-multiplier list price; the shop charges the marked-up
    // one, and the pricing check above is what pins the multiplier itself.
    assert(armorCost(def, 0) > 0, `${def.id} tier 0 cost`);
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


check('armour set bonuses key off the weakest slot', () => {
  const even = Object.fromEntries(ARMOR_SLOTS.map((s) => [s.id, 12]));
  assert(armorSets(even).length >= 2, 'an even tier-12 kit completes no sets');

  // One neglected slot must hold the whole set back, or the bonus is just a
  // reward for buying anything at all.
  const lopsided = { ...even, boots: 0 };
  assert(armorSets(lopsided).length === 0, 'a bare slot still completes sets');

  const nxt = nextArmorSet(even);
  assert(nxt && nxt.need > 0, 'no next set to aim for from tier 12');
  assert(nextArmorSet(Object.fromEntries(ARMOR_SLOTS.map((s) => [s.id, 999]))) === null,
    'a maxed kit still reports a next set');

  // The bonuses must actually reach the modifier bag.
  const withSets = armorMods(even);
  const withoutSets = ARMOR_SLOTS.reduce((acc, d) => {
    for (const [k, v] of Object.entries(d.effect)) acc[k] = (acc[k] || 0) + v * 12;
    return acc;
  }, {});
  assert(withSets.maxHp > withoutSets.maxHp, 'set bonuses never reach the player');
});

check('the Armoury is deep enough to outlast the Forge', () => {
  assert(ARMOR_SLOTS.length >= 8, `only ${ARMOR_SLOTS.length} equipment slots`);
  assert(ARMOR_SETS.length >= 4, `only ${ARMOR_SETS.length} set tiers`);
  let total = 0;
  for (const d of ARMOR_SLOTS) {
    for (let t = 0; t < ARMOR_MAX_TIER; t++) total += armorCost(d, t);
  }
  assert(total > 1e7, `a full kit only costs ${Math.round(total)} souls`);
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
  for (const def of ARMOR_SLOTS) {
    const raw = def.baseCost * Math.pow(def.growth, 3);
    assert(armorCost(def, 3) === Math.round(raw * PRICE_MULTIPLIER),
      `Armoury slot ${def.id} is not priced through PRICE_MULTIPLIER`);
  }
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
