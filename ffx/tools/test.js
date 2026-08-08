// Logic checks, no browser. `npm test`
//
// Everything under src/game, src/data and src/core is pure enough to import in
// node, which is the whole reason the battle engine returns event lists instead
// of touching the DOM.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Timeline, RANK, tickCost } from '../src/game/ctb.js';
import { physical, magical, elementMod, resolveHit, DAMAGE_CAP, hitChance } from '../src/game/formulas.js';
import { Battle, rollEncounter } from '../src/game/battle.js';
import { newGame, charStats, learned, moveTo, activate, canActivate, addItem, recruit, gainAp } from '../src/game/party.js';
import { GRID, PETALS, PETAL_ORDER, NODE_TYPES, startNode } from '../src/data/grid.js';
import { ABILITIES } from '../src/data/abilities.js';
import { ITEMS, mixResult } from '../src/data/items.js';
import { ENEMIES, BOSSES, ALL_FOES } from '../src/data/enemies.js';
import { CHARACTERS, PARTY_ORDER } from '../src/data/characters.js';
import { AEONS, AEON_ORDER, aeonStats } from '../src/data/aeons.js';
import { CHAPTERS, ENDING, SPEAKERS } from '../src/data/story.js';
import { STATUS } from '../src/data/status.js';
import { makeRng } from '../src/core/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0;
const fails = [];
function check(name, fn) {
  try {
    const r = fn();
    if (r === false) throw new Error('returned false');
    pass++;
  } catch (err) {
    fails.push(`${name}: ${err.message}`);
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion failed'); };

/* ── CTB ──────────────────────────────────────────────────────────────── */

check('faster combatants get more turns', () => {
  const tl = new Timeline();
  tl.add('fast', 40, { ctb: 0 });
  tl.add('slow', 8, { ctb: 0 });
  const counts = { fast: 0, slow: 0 };
  for (let i = 0; i < 60; i++) {
    const id = tl.next();
    counts[id]++;
    tl.spend(id, RANK.normal);
  }
  assert(counts.fast > counts.slow * 1.5, `fast ${counts.fast} slow ${counts.slow}`);
});

check('a heavier action costs a place in the queue', () => {
  assert(tickCost(RANK.heavy, 20) > tickCost(RANK.normal, 20));
  assert(tickCost(RANK.quick, 20) < tickCost(RANK.normal, 20));
});

check('haste actually moves the counter', () => {
  const tl = new Timeline();
  const s = tl.add('a', 20, { ctb: 100 });
  tl.setAgility('a', 20, { haste: true });
  assert(s.ctb < 100, 'haste should shorten the remaining wait');
});

check('the preview reforecasts when a slow ability is hovered', () => {
  const tl = new Timeline();
  tl.add('me', 20, { ctb: 0 });
  tl.add('them', 20, { ctb: 1 });
  const normal = tl.peek(6);
  const slow = tl.peek(6, { id: 'me', rank: RANK.heavy });
  assert(JSON.stringify(normal) !== JSON.stringify(slow), 'preview did not change');
});

check('swap inherits the outgoing slot', () => {
  const tl = new Timeline();
  tl.add('out', 20, { ctb: 42 });
  tl.replace('out', 'in', 30);
  assert(!tl.has('out') && tl.has('in'));
  assert(tl.get('in').ctb === 42, 'counter should carry over');
});

/* ── formulas ─────────────────────────────────────────────────────────── */

check('strength matters superlinearly', () => {
  const t = { def: 20, status: {}, maxHp: 1000 };
  const low = physical({ str: 15, status: {} }, t);
  const high = physical({ str: 30, status: {} }, t);
  assert(high > low * 4, `${low} → ${high}`);
});

check('defence reduces but never nullifies', () => {
  const a = { str: 40, status: {} };
  const soft = physical(a, { def: 0, status: {} });
  const hard = physical(a, { def: 500, status: {} });
  assert(hard < soft * 0.2 && hard > 0);
});

check('armour is a wall until it is pierced', () => {
  const rng = makeRng(7);
  const atk = { str: 30, acc: 40, luck: 10, status: {} };
  const tgt = { def: 40, mdef: 20, eva: 0, luck: 10, status: {}, armored: true, maxHp: 9999 };
  const blunt = resolveHit(atk, tgt, { kind: 'attack', power: 1, noVariance: true }, rng);
  const pierce = resolveHit(atk, tgt, { kind: 'attack', power: 1, pierce: true, noVariance: true, noCrit: true }, rng);
  assert(pierce.damage > blunt.damage * 2, `${blunt.damage} vs ${pierce.damage}`);
});

check('elements: weak doubles, resist halves, absorb inverts', () => {
  assert(elementMod({ weak: ['fire'] }, 'fire') === 2);
  assert(elementMod({ resist: ['fire'] }, 'fire') === 0.5);
  assert(elementMod({ absorb: ['fire'] }, 'fire') === -1);
  assert(elementMod({ immune: ['fire'] }, 'fire') === 0);
  assert(elementMod({}, null) === 1);
});

check('damage is capped at 99999', () => {
  const out = resolveHit({ str: 400, acc: 99, luck: 0, status: {} },
    { def: 0, eva: 0, luck: 0, status: {}, maxHp: 1e9 },
    { kind: 'attack', power: 20 }, makeRng(1));
  assert(out.damage === DAMAGE_CAP, String(out.damage));
});

check('accuracy versus evasion is the agile enemy tax', () => {
  const slowGuy = hitChance({ acc: 12, status: {} }, { eva: 26, status: {} });
  const fastGuy = hitChance({ acc: 30, status: {} }, { eva: 26, status: {} });
  assert(slowGuy < 0.3 && fastGuy > 0.6, `${slowGuy} / ${fastGuy}`);
});

check('magic reads magic defence, not defence', () => {
  const a = { mag: 30, status: {} };
  assert(magical(a, { mdef: 0, status: {} }) > magical(a, { mdef: 400, status: {} }) * 3);
});

/* ── data integrity ───────────────────────────────────────────────────── */

check('every ability referenced by a character exists', () => {
  for (const c of Object.values(CHARACTERS)) {
    for (const a of c.starting) assert(ABILITIES[a], `${c.id} → ${a}`);
  }
});

check('every ability on the grid exists', () => {
  for (const [who, spec] of Object.entries(PETALS)) {
    for (const a of spec.abilities) assert(ABILITIES[a], `${who} → ${a}`);
    for (const m of spec.mix) assert(NODE_TYPES[m], `${who} → node type ${m}`);
  }
});

check('every enemy in an encounter table exists', () => {
  for (const ch of CHAPTERS) {
    for (const id of ch.encounters?.table || []) assert(ENEMIES[id], `${ch.id} → ${id}`);
  }
});

check('every boss referenced by a chapter exists', () => {
  for (const ch of CHAPTERS) {
    for (const ev of ch.events) {
      if (ev.type === 'battle') assert(BOSSES[ev.boss], `${ch.id} → ${ev.boss}`);
    }
  }
});

check('every enemy ability exists and every foe has stats', () => {
  for (const [id, f] of Object.entries(ALL_FOES)) {
    assert(typeof f.hp === 'number' && f.hp > 0, `${id} hp`);
    assert(f.sprite?.shape, `${id} sprite`);
    for (const o of f.ai || []) assert(ABILITIES[o.a], `${id} → ${o.a}`);
  }
});

check('every shop and chest references a real item', () => {
  for (const ch of CHAPTERS) {
    for (const ev of ch.events) {
      for (const id of ev.stock || []) assert(ITEMS[id], `${ch.id} shop → ${id}`);
      for (const [id] of ev.loot || []) assert(ITEMS[id], `${ch.id} chest → ${id}`);
      for (const [id] of ev.reward || []) assert(ITEMS[id], `${ch.id} reward → ${id}`);
      for (const who of ev.join || []) assert(CHARACTERS[who], `${ch.id} join → ${who}`);
      if (ev.aeon) assert(AEONS[ev.aeon], `${ch.id} aeon → ${ev.aeon}`);
    }
  }
});

check('every speaker in the script has a name entry', () => {
  const all = [...CHAPTERS.flatMap((c) => c.events.flatMap((e) => [...(e.lines || []), ...(e.pre || []), ...(e.post || [])])), ...ENDING.lines];
  assert(all.length > 250, `script is only ${all.length} lines`);
  for (const l of all) assert(SPEAKERS[l.who], `unknown speaker ${l.who}`);
});

check('every aeon ability exists and aeons scale with the pilgrimage', () => {
  for (const id of AEON_ORDER) {
    const a = AEONS[id];
    assert(a, id);
    for (const ab of a.abilities || []) assert(ABILITIES[ab], `${id} → ${ab}`);
    assert(aeonStats(a, 9).hp > a.base.hp, `${id} should scale`);
  }
});

check('every status used by an ability is defined', () => {
  for (const [id, ab] of Object.entries(ABILITIES)) {
    for (const i of ab.inflict || []) assert(STATUS[i.status] || i.status === 'provoked', `${id} → ${i.status}`);
    for (const b of ab.bless || []) assert(STATUS[b.status], `${id} → ${b.status}`);
  }
});

check('all seven characters are recruited across the chapters', () => {
  const joined = new Set(CHAPTERS.flatMap((c) => [...(c.party || []), ...c.events.flatMap((e) => e.join || [])]));
  for (const id of PARTY_ORDER) assert(joined.has(id), `${id} never joins`);
});

check('all seven airdrops are obtainable', () => {
  const got = new Set(CHAPTERS.flatMap((c) => c.events.map((e) => e.aeon).filter(Boolean)));
  for (const id of AEON_ORDER) assert(got.has(id), `${id} is unobtainable`);
});

check('chapter events are inside the chapter and in order', () => {
  for (const ch of CHAPTERS) {
    let last = -1;
    for (const ev of ch.events) {
      assert(ev.x >= 0 && ev.x <= ch.length, `${ch.id}: event at ${ev.x} outside 0..${ch.length}`);
      assert(ev.x >= last, `${ch.id}: events out of order at ${ev.x}`);
      last = ev.x;
    }
    assert(ch.region.layers.length > 0, `${ch.id} has no parallax layers`);
  }
});

/* ── grid ─────────────────────────────────────────────────────────────── */

check('every petal is fully reachable from its start node', () => {
  for (const who of PETAL_ORDER) {
    const start = startNode(who);
    assert(GRID.has(start), `${who} has no start node`);
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      const n = GRID.get(queue.shift());
      for (const l of n.links) {
        if (seen.has(l)) continue;
        const node = GRID.get(l);
        if (node.type === 'lock' && !node.open) continue; // locks need a key
        seen.add(l);
        queue.push(l);
      }
    }
    const own = [...GRID.values()].filter((n) => n.petal === who && n.type !== 'lock');
    for (const n of own) assert(seen.has(n.id), `${who}: ${n.id} unreachable`);
  }
});

check('the grid teaches every ability its petal promises', () => {
  for (const [who, spec] of Object.entries(PETALS)) {
    const taught = new Set([...GRID.values()].filter((n) => n.petal === who && n.ability).map((n) => n.ability));
    for (const a of spec.abilities) assert(taught.has(a), `${who} never teaches ${a}`);
  }
});

check('walking then activating a node raises the stat', () => {
  const s = newGame();
  const id = 'dipus';
  s.chars[id].sLv = 12;
  addItem(s, 'gasSphere', 12);
  addItem(s, 'copiumSphere', 12);
  addItem(s, 'mevSphere', 12);
  addItem(s, 'alphaSphere', 12);
  const before = charStats(s, id);
  let moved = 0;
  for (let i = 0; i < 8; i++) {
    const here = GRID.get(s.chars[id].node);
    const next = here.links.find((l) => {
      const n = GRID.get(l);
      return n && n.type !== 'lock' && !s.chars[id].nodes.includes(l);
    });
    if (!next) break;
    if (!moveTo(s, id, next).ok) break;
    moved++;
    canActivate(s, id, next).ok && activate(s, id, next);
  }
  assert(moved >= 5, `only moved ${moved}`);
  const after = charStats(s, id);
  const grew = ['hp', 'str', 'agi', 'acc', 'eva', 'def'].some((k) => after[k] > before[k]);
  const learnedMore = learned(s, id).length >= CHARACTERS[id].starting.length;
  assert(grew || learnedMore, 'grid walk changed nothing');
});

check('AP converts into stake levels', () => {
  const s = newGame();
  const got = gainAp(s, 'dipus', 5000);
  assert(got > 3, `only ${got} levels from 5000 AP`);
});

/* ── battles ──────────────────────────────────────────────────────────── */

function fight(state, encounter, rng, { maxTurns = 400 } = {}) {
  const b = new Battle(state, encounter, rng);
  let guard = 0;
  while (!b.over && guard++ < maxTurns) {
    const res = b.advance();
    if (res.kind === 'end') break;
    if (res.kind === 'await') {
      const unit = res.unit;
      // A dumb but legal player: heal when hurt, otherwise attack.
      const hurt = b.front().find((u) => !u.ko && u.hp < u.maxHp * 0.4);
      if (hurt && unit.abilities.includes('cure') && unit.mp >= 4) {
        b.command({ type: 'ability', ability: 'cure', targets: [hurt.uid] });
      } else if (unit.overdrive >= 100) {
        b.command({ type: 'overdrive', name: 'test', power: 3, hits: 2 });
      } else {
        const target = b.foes()[0];
        b.command({ type: 'ability', ability: 'attack', targets: target ? [target.uid] : [] });
      }
    }
  }
  return b;
}

check('a random encounter resolves without hanging', () => {
  const rng = makeRng(11);
  const s = newGame();
  recruit(s, 'wojak');
  recruit(s, 'yield');
  const enc = rollEncounter(CHAPTERS[1], rng);
  const b = fight(s, enc, rng);
  assert(b.over, 'battle never ended');
});

check('a hundred battles across the game all terminate', () => {
  let victories = 0;
  for (let i = 0; i < 100; i++) {
    const rng = makeRng(1000 + i);
    const s = newGame();
    for (const id of PARTY_ORDER) recruit(s, id);
    for (const id of PARTY_ORDER) { s.chars[id].sLv = 20; }
    const ch = CHAPTERS[1 + (i % (CHAPTERS.length - 2))];
    const enc = rollEncounter(ch, rng) || { foes: ['bagbeast'] };
    const b = fight(s, enc, rng, { maxTurns: 600 });
    assert(b.over, `battle ${i} in ${ch.id} did not end`);
    if (b.over === 'victory') victories++;
  }
  assert(victories > 0, 'the player never won once, which is a balance problem');
});

check('victory pays AP, PLS and something for the bag', () => {
  const rng = makeRng(3);
  const s = newGame();
  const before = s.pls;
  const b = fight(s, { foes: ['bagbeast'] }, rng);
  if (b.over === 'victory') {
    assert(b.spoils.ap > 0 && b.spoils.pls > 0);
    assert(s.pls > before);
  }
});

check('a boss cannot be fled and does not die instantly', () => {
  const rng = makeRng(5);
  const s = newGame();
  const b = new Battle(s, { foes: ['ammes'], boss: true, canFlee: false }, rng);
  assert(b.canFlee === false);
  const foe = b.foes()[0];
  assert(foe.maxHp > 500 && foe.boss);
});

check('the wrong character cannot reach a flyer, the right one can', () => {
  const rng = makeRng(9);
  const s = newGame();
  recruit(s, 'audit');
  recruit(s, 'wojak');
  s.active = ['audit', 'wojak'];
  const b = new Battle(s, { foes: ['shillwasp'] }, rng);
  const flyer = b.foes()[0];
  const audit = b.front().find((u) => u.id === 'audit');
  const wojak = b.front().find((u) => u.id === 'wojak');
  let auditHits = 0, wojakHits = 0;
  for (let i = 0; i < 60; i++) {
    flyer.hp = flyer.maxHp;
    if (!b.strike(audit, flyer, ABILITIES.attack).some((e) => e.type === 'miss')) auditHits++;
    flyer.hp = flyer.maxHp;
    if (!b.strike(wojak, flyer, ABILITIES.ballThrow).some((e) => e.type === 'miss')) wojakHits++;
  }
  assert(wojakHits > auditHits * 2, `audit ${auditHits} wojak ${wojakHits}`);
});

check('countering the right enemy type hits noticeably harder', () => {
  const rng = makeRng(21);
  const s = newGame();
  recruit(s, 'rugku');
  const b = new Battle(s, { foes: ['botswarm'] }, rng);
  const machina = b.foes()[0];
  const rugku = b.units.find((u) => u.id === 'rugku');
  const dipus = b.units.find((u) => u.id === 'dipus');
  rugku.stats = { ...dipus.stats };  // same numbers, different specialism
  let rug = 0, dip = 0;
  for (let i = 0; i < 80; i++) {
    machina.hp = machina.maxHp;
    for (const e of b.strike(rugku, machina, ABILITIES.grenade)) if (e.type === 'damage') rug += e.amount;
    machina.hp = machina.maxHp;
    for (const e of b.strike(dipus, machina, ABILITIES.grenade)) if (e.type === 'damage') dip += e.amount;
  }
  assert(rug > dip * 1.2, `rugku ${rug} vs dipus ${dip}`);
});

check('healing an undead thing hurts it', () => {
  const rng = makeRng(31);
  const s = newGame();
  recruit(s, 'yield');
  const b = new Battle(s, { foes: ['chartghost'] }, rng);
  const ghost = b.foes()[0];
  const y = b.units.find((u) => u.id === 'yield');
  const before = ghost.hp;
  b.applyAction(y, ghost, ABILITIES.cura);
  assert(ghost.hp < before, 'undead took a heal like a gift');
});

check('a physical-immune enemy shrugs off steel and not spells', () => {
  const rng = makeRng(41);
  const s = newGame();
  recruit(s, 'luna');
  const b = new Battle(s, { foes: ['stableflan'] }, rng);
  const flan = b.foes()[0];
  const luna = b.units.find((u) => u.id === 'luna');
  luna.stats.mag = 60;
  flan.hp = flan.maxHp;
  b.strike(luna, flan, ABILITIES.attack);
  const afterSteel = flan.maxHp - flan.hp;
  flan.hp = flan.maxHp;
  b.strike(luna, flan, ABILITIES.thunder);
  const afterSpell = flan.maxHp - flan.hp;
  assert(afterSteel <= 1 && afterSpell > 50, `${afterSteel} / ${afterSpell}`);
});

check('a summon replaces the party and dismissing gives it back', () => {
  const rng = makeRng(51);
  const s = newGame();
  recruit(s, 'yield');
  s.aeons.push('vaporwyrm');
  const b = new Battle(s, { foes: ['bagbeast'] }, rng);
  const y = b.units.find((u) => u.id === 'yield');
  b.actor = y;
  b.summon(y, 'vaporwyrm');
  assert(b.aeon && b.front().length === 1 && b.front()[0].isAeon, 'aeon did not take over');
  b.dismissAeon('dismissed');
  assert(!b.aeon && b.front().some((u) => u.id === 'yield'), 'party did not come back');
});

check('stealing yields an item and then dries up', () => {
  const rng = makeRng(61);
  const s = newGame();
  recruit(s, 'rugku');
  const b = new Battle(s, { foes: ['vaultmimic'] }, rng);
  const r = b.units.find((u) => u.id === 'rugku');
  const target = b.foes()[0];
  let got = 0;
  for (let i = 0; i < 6; i++) {
    for (const e of b.doSteal(r, target)) if (e.type === 'steal') got++;
  }
  assert(got >= 1 && got <= 3, `stole ${got} times — should taper off`);
});

check('Front-Run actually pushes an enemy down the queue', () => {
  const rng = makeRng(71);
  const s = newGame();
  const b = new Battle(s, { foes: ['bagbeast', 'bagbeast'] }, rng);
  const foe = b.foes()[0];
  const before = b.timeline.get(foe.uid).ctb;
  b.applyAction(b.front()[0], foe, ABILITIES.frontRun);
  assert(b.timeline.get(foe.uid).ctb > before, 'delay did nothing');
});

check('Yobimbo charges what you pay him', () => {
  const rng = makeRng(81);
  const s = newGame();
  s.pls = 100000;
  const b = new Battle(s, { foes: ['bagbeast'] }, rng);
  const before = s.pls;
  b.payYobimbo(b.front()[0], 60000);
  assert(s.pls === before - 60000, 'he did not take the money');
});

check('mixing two items produces a real recipe', () => {
  const r = mixResult(ITEMS.grenade, ITEMS.bombcore);
  assert(r.name === 'Trinitron', r.name);
  const junk = mixResult(ITEMS.tshare, ITEMS.tshare);
  assert(junk.name === 'Sludge', junk.name);
});

/* ── deployment guards ────────────────────────────────────────────────── */

const VERCEL_KEYS = new Set([
  '$schema', 'buildCommand', 'cleanUrls', 'framework', 'headers', 'outputDirectory',
  'redirects', 'rewrites', 'trailingSlash', 'installCommand', 'devCommand', 'regions', 'public',
]);

check('vercel.json parses and uses only keys Vercel knows', () => {
  const raw = fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8');
  const cfg = JSON.parse(raw);
  for (const k of Object.keys(cfg)) assert(VERCEL_KEYS.has(k), `unknown key "${k}" would fail the deploy`);
  assert(cfg.outputDirectory === '.', 'the game is served from the project root');
  assert(cfg.framework === null, 'there is no framework to detect');
});

check('index.html loads only files that exist', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const m of html.matchAll(/(?:href|src)="(?!https?:)([^"#]+)"/g)) {
    assert(fs.existsSync(path.join(ROOT, m[1])), `missing ${m[1]}`);
  }
});

check('every module import resolves on disk', () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  const files = walk(path.join(ROOT, 'src')).filter((f) => f.endsWith('.js'));
  assert(files.length > 20, `only ${files.length} modules`);
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/from\s+'(\.[^']+)'/g)) {
      const target = path.resolve(path.dirname(f), m[1]);
      assert(fs.existsSync(target), `${path.relative(ROOT, f)} → ${m[1]}`);
    }
  }
});

check('the stylesheet covers both orientations and safe areas', () => {
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  assert(css.includes('body.portrait'), 'no portrait layout');
  assert(css.includes('env(safe-area-inset'), 'no safe-area handling');
  assert(css.includes('prefers-reduced-motion'), 'no reduced-motion fallback');
});

/* ── report ───────────────────────────────────────────────────────────── */

console.log(`\n  FINAL SACRIFICE X — ${pass} checks passed, ${fails.length} failed\n`);
for (const f of fails) console.log('  ✗ ' + f);
if (fails.length) process.exit(1);
console.log('  the spiral holds.\n');
