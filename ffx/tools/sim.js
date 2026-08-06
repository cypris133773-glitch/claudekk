// Headless balance pass. `npm run sim`
//
// Fights every chapter's encounter table and every boss with a party grown to
// roughly where a player would be at that point, and prints win rates and turn
// counts. A boss at 100% with four turns is not a boss; one at 0% is a wall.

import { Battle, rollEncounter } from '../src/game/battle.js';
import { newGame, recruit, gainAp, charStats } from '../src/game/party.js';
import { GRID } from '../src/data/grid.js';
import { CHAPTERS } from '../src/data/story.js';
import { PARTY_ORDER } from '../src/data/characters.js';
import { ABILITIES } from '../src/data/abilities.js';
import { makeRng } from '../src/core/rng.js';

const RUNS = Number(process.argv[2]) || 60;

/** A player who has walked their grid about as far as the chapter allows. */
function grownParty(chapterIndex, rng) {
  const s = newGame();
  for (const id of PARTY_ORDER.slice(0, Math.min(7, 3 + Math.floor(chapterIndex / 2)))) recruit(s, id);
  s.chapter = chapterIndex;
  const budget = 8 + chapterIndex * 6;
  for (const id of s.party) {
    const c = s.chars[id];
    gainAp(s, id, 400 * budget);
    for (let i = 0; i < budget; i++) {
      const here = GRID.get(c.node);
      const next = here.links.find((l) => {
        const n = GRID.get(l);
        return n && n.type !== 'lock' && !c.nodes.includes(l);
      });
      if (!next) break;
      c.node = next;
      c.nodes.push(next);
    }
    const st = charStats(s, id);
    c.hp = st.maxHp;
    c.mp = st.maxMp;
  }
  s.aeons = ['vaporwyrm', 'gasfrit'].slice(0, Math.max(0, Math.min(2, chapterIndex - 1)));
  // A player arrives at a boss with a bag, so the model should too.
  s.inv.hopium = 20;
  s.inv.megacope = chapterIndex >= 5 ? 12 : 0;
  s.inv.downround = 8;
  return s;
}

/** A competent-but-not-brilliant player: swaps for the counter, heals, spends overdrives. */
function autoplay(b, rng) {
  let guard = 0;
  while (!b.over && guard++ < 900) {
    const res = b.advance();
    if (res.kind === 'end') break;
    if (res.kind !== 'await') continue;
    const unit = res.unit;
    const foes = b.foes();
    const target = foes[0];
    if (!target) continue;

    const hurt = b.front().find((u) => !u.ko && u.hp < u.maxHp * 0.45);
    const wounded = b.front().filter((u) => !u.ko && u.hp < u.maxHp * 0.55).length;
    const down = b.front().find((u) => u.ko);
    if (down && (b.state.inv.downround || 0) > 0) {
      b.command({ type: 'item', item: 'downround', targets: [down.uid] });
      continue;
    }
    if (wounded >= 2 && (b.state.inv.megacope || 0) > 0) {
      b.command({ type: 'item', item: 'megacope' });
      continue;
    }
    const bench = b.bench();
    const counter = bench.find((u) => u.counters && u.counters === target.kind);

    if (counter && !b.aeon && rng() < 0.5) { b.command({ type: 'swap', to: counter.uid }); continue; }
    if (unit.overdrive >= 100) { b.command({ type: 'overdrive', name: 'sim', power: 3, hits: 3, all: false }); continue; }
    if (hurt && unit.abilities?.includes('cura') && unit.mp >= 10) {
      b.command({ type: 'ability', ability: 'cura', targets: [hurt.uid] });
      continue;
    }
    if (hurt && unit.abilities?.includes('cure') && unit.mp >= 4) {
      b.command({ type: 'ability', ability: 'cure', targets: [hurt.uid] });
      continue;
    }
    if (hurt && (b.state.inv.hopium || 0) > 0) {
      b.command({ type: 'item', item: 'hopium', targets: [hurt.uid] });
      continue;
    }
    // Use the best affordable damaging ability the character actually knows.
    const best = (unit.abilities || [])
      .map((id) => ABILITIES[id])
      .filter((a) => a && a.power > 0.8 && a.mp <= unit.mp && !a.special)
      .sort((a, b2) => (b2.power || 0) - (a.power || 0))[0];
    b.command({ type: 'ability', ability: best?.id || 'attack', targets: [target.uid] });
  }
  return b;
}

function trial(chapterIndex, encounterFactory, seedBase) {
  let wins = 0, turns = 0, wipes = 0;
  for (let i = 0; i < RUNS; i++) {
    const rng = makeRng(seedBase + i * 7919);
    const s = grownParty(chapterIndex, rng);
    const enc = encounterFactory(rng);
    if (!enc) return null;
    const b = autoplay(new Battle(s, enc, rng), rng);
    if (b.over === 'victory') wins++;
    else if (b.over === 'defeat') wipes++;
    turns += b.turnCount;
  }
  return { win: (wins / RUNS) * 100, turns: turns / RUNS, wipes: (wipes / RUNS) * 100 };
}

const pad = (s, n) => String(s).padEnd(n);
const num = (v, n = 5) => String(Math.round(v)).padStart(n);

console.log(`\n  FINAL SACRIFICE X — balance, ${RUNS} runs each\n`);
console.log(`  ${pad('chapter', 26)}${pad('fight', 22)}  win%  turns  wipe%`);
console.log('  ' + '─'.repeat(76));

CHAPTERS.forEach((ch, i) => {
  if (ch.encounters) {
    const r = trial(i, (rng) => rollEncounter(ch, rng), 100 + i * 31);
    if (r) console.log(`  ${pad(ch.id, 26)}${pad('random encounters', 22)}${num(r.win)}%${num(r.turns)} ${num(r.wipes, 5)}%`);
  }
  for (const ev of ch.events) {
    if (ev.type !== 'battle') continue;
    const r = trial(i, () => ({ foes: [ev.boss], boss: true, canFlee: false }), 900 + i * 13);
    console.log(`  ${pad('', 26)}${pad('BOSS ' + ev.boss, 22)}${num(r.win)}%${num(r.turns)} ${num(r.wipes, 5)}%`);
  }
});
console.log('');
