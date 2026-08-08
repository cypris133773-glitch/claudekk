// The battle engine.
//
// Drives itself one step at a time: `advance()` either hands control back for a
// player command or resolves an AI turn and returns a list of events for the
// renderer to animate. Nothing in here touches the DOM, which is what lets
// tools/test.js fight a thousand battles a second with no browser.

import { Timeline, RANK } from './ctb.js';
import { resolveHit, healAmount, overdriveGain, elementMod, DAMAGE_CAP } from './formulas.js';
import { ABILITIES } from '../data/abilities.js';
import { ITEMS, mixResult } from '../data/items.js';
import { CHARACTERS } from '../data/characters.js';
import { AEONS, aeonStats } from '../data/aeons.js';
import { ALL_FOES } from '../data/enemies.js';
import { charStats, learned, gainAp, addItem, takeItem } from './party.js';
import { rng as defaultRng } from '../core/rng.js';
import { BAD_STATUS } from '../data/status.js';

let uidSeq = 0;
const uid = (p) => `${p}#${++uidSeq}`;

export class Battle {
  /**
   * @param {object} state  the save-game
   * @param {{foes:string[], boss?:boolean, canFlee?:boolean, name?:string}} encounter
   */
  constructor(state, encounter, rng = defaultRng) {
    this.state = state;
    this.rng = rng;
    this.encounter = encounter;
    this.boss = !!encounter.boss;
    this.canFlee = encounter.canFlee !== false && !this.boss;
    this.units = [];
    this.timeline = new Timeline();
    this.log = [];
    this.over = null;          // 'victory' | 'defeat' | 'fled'
    this.turnCount = 0;
    this.aeon = null;          // active aeon unit
    this.spoils = { ap: 0, pls: 0, items: [] };
    this.build();
  }

  /* ── setup ─────────────────────────────────────────────────────────── */

  build() {
    for (const id of this.state.active) {
      if (!this.state.party.includes(id)) continue;
      this.units.push(this.makeChar(id));
    }
    // Anybody not in the front three is available to swap in.
    for (const id of this.state.party) {
      if (this.state.active.includes(id)) continue;
      const u = this.makeChar(id);
      u.benched = true;
      this.units.push(u);
    }
    (this.encounter.foes || []).forEach((fid, i) => this.units.push(this.makeFoe(fid, i)));

    for (const u of this.units) {
      if (u.benched) continue;
      this.timeline.add(u.uid, u.stats.agi, { mods: u.status, rank: this.encounter.preemptive && u.side === 'party' ? 0.2 : 1.6 });
    }
  }

  makeChar(id) {
    const c = this.state.chars[id];
    const def = CHARACTERS[id];
    const s = charStats(this.state, id);
    return {
      uid: uid(id), id, side: 'party', kind: 'party', name: def.name,
      stats: s, hp: c.ko ? 0 : c.hp, mp: c.mp, maxHp: s.maxHp, maxMp: s.maxMp,
      ko: !!c.ko, status: {}, overdrive: c.overdrive || 0,
      abilities: learned(this.state, id),
      counters: def.counters, palette: def.palette, build: def.build,
      od: def.overdrive, apEarned: 0,
    };
  }

  makeFoe(fid, i) {
    const f = ALL_FOES[fid];
    if (!f) throw new Error('unknown foe ' + fid);
    this.state.seen[fid] = (this.state.seen[fid] || 0) + 1;
    const s = {
      hp: f.hp, mp: f.mp, str: f.str, def: f.def, mag: f.mag, mdef: f.mdef,
      agi: f.agi, acc: f.acc, eva: f.eva, luck: f.luck,
    };
    return {
      uid: uid(fid), id: fid, side: 'foe', kind: f.kind, name: f.name,
      suffix: '', stats: s, hp: f.hp, mp: f.mp, maxHp: f.hp, maxMp: f.mp,
      ko: false, status: {}, overdrive: 0, def: f,
      armored: !!f.armored, flying: !!f.flying, physImmune: !!f.physImmune,
      weak: f.weak, resist: f.resist, immune: f.immune, absorb: f.absorb,
      slot: i, boss: !!f.boss,
    };
  }

  makeAeon(aid) {
    const a = AEONS[aid];
    const s = aeonStats(a, this.state.chapter + 1);
    return {
      uid: uid(aid), id: aid, side: 'party', kind: 'aeon', name: a.name,
      stats: s, hp: this.state.aeonHp[aid] ?? s.hp, mp: s.mp, maxHp: s.hp, maxMp: s.mp,
      ko: false, status: {}, overdrive: this.state.aeonOd[aid] ?? 0,
      abilities: a.abilities, palette: a.palette, build: a.build,
      weak: a.weak, resist: a.resist, absorb: a.absorb, aeonDef: a, isAeon: true,
    };
  }

  /* ── queries ───────────────────────────────────────────────────────── */

  byUid(uid) { return this.units.find((u) => u.uid === uid); }
  foes() { return this.units.filter((u) => u.side === 'foe' && !u.ko); }
  allFoes() { return this.units.filter((u) => u.side === 'foe'); }
  front() {
    if (this.aeon) return [this.aeon];
    return this.units.filter((u) => u.side === 'party' && !u.benched && u.kind === 'party');
  }
  bench() { return this.units.filter((u) => u.side === 'party' && u.benched && !u.ko); }
  alliesOf(u) { return u.side === 'foe' ? this.foes() : this.front().filter((x) => !x.ko); }
  enemiesOf(u) { return u.side === 'foe' ? this.front().filter((x) => !x.ko) : this.foes(); }

  order(preview = null) {
    return this.timeline.peek(14, preview).map((id) => this.byUid(id)).filter(Boolean);
  }

  /* ── the main loop ─────────────────────────────────────────────────── */

  /**
   * @returns {{kind:'await',unit:object,events:object[]}
   *          |{kind:'events',events:object[]}
   *          |{kind:'end',outcome:string,events:object[]}}
   */
  advance() {
    if (this.over) return { kind: 'end', outcome: this.over, events: [] };
    const end = this.checkEnd();
    if (end) return end;

    const nextId = this.timeline.next();
    if (!nextId) return this.finish('defeat', []);
    const unit = this.byUid(nextId);
    if (!unit || unit.ko) {
      this.timeline.remove(nextId);
      return this.advance();
    }
    this.turnCount++;
    this.actor = unit;

    const events = this.startOfTurn(unit);
    if (unit.ko) {
      const e2 = this.checkEnd();
      if (e2) return { ...e2, events: [...events, ...e2.events] };
      return { kind: 'events', events };
    }
    const e3 = this.checkEnd();
    if (e3) return { ...e3, events: [...events, ...e3.events] };

    if (unit.side === 'party' && !unit.status.confuse && !unit.status.berserk && !unit.status.sleep) {
      return { kind: 'await', unit, events };
    }
    return { kind: 'events', events: [...events, ...this.autoAct(unit)] };
  }

  startOfTurn(unit) {
    const ev = [];
    const st = unit.status;
    if (st.sleep) {
      ev.push({ type: 'text', text: `${unit.name} is coping.` });
    }
    if (st.poison) {
      const dmg = Math.max(1, Math.floor(unit.maxHp * 0.06));
      ev.push(...this.damage(unit, dmg, { element: null, tag: 'poison' }));
    }
    if (st.regen && !unit.ko) {
      const heal = Math.max(1, Math.floor(unit.maxHp * 0.08));
      unit.hp = Math.min(unit.maxHp, unit.hp + heal);
      ev.push({ type: 'heal', target: unit.uid, amount: heal });
    }
    if (st.doom != null) {
      if (st.doom <= 1) {
        ev.push({ type: 'text', text: `${unit.name} is unstaked.` });
        ev.push(...this.kill(unit));
      }
    }
    // Tick durations on the unit's own turn.
    for (const key of Object.keys(st)) {
      if (key === 'defending') continue;
      if (typeof st[key] === 'number') {
        st[key] -= 1;
        if (st[key] <= 0) {
          delete st[key];
          if (key === 'haste' || key === 'slow') this.refreshSpeed(unit);
          ev.push({ type: 'statusEnd', target: unit.uid, status: key });
        }
      }
    }
    delete st.defending;
    return ev;
  }

  refreshSpeed(unit) {
    this.timeline.setAgility(unit.uid, unit.stats.agi, unit.status);
  }

  checkEnd() {
    if (this.over) return { kind: 'end', outcome: this.over, events: [] };
    if (!this.foes().length) return this.finish('victory', []);
    // FFX's rule: the three who are actually standing there are the party. A
    // full bench does not save you — swapping someone in before the last one
    // drops is the skill being tested.
    if (!this.front().some((u) => !u.ko)) return this.finish('defeat', []);
    return null;
  }

  finish(outcome, events) {
    this.over = outcome;
    if (outcome === 'victory') this.awardSpoils();
    this.writeBack();
    return { kind: 'end', outcome, events };
  }

  awardSpoils() {
    const s = this.state;
    let ap = 0, pls = 0;
    for (const f of this.allFoes()) {
      ap += f.def.ap;
      pls += f.def.pls;
      for (const d of f.def.drop || []) {
        if (this.rng() < d.chance) { addItem(s, d.item, 1); this.spoils.items.push(d.item); }
      }
      // A sphere or two per fight keeps the grid moving.
      if (this.rng() < 0.5) {
        const pick = this.rng.pick(['gasSphere', 'copiumSphere', 'mevSphere', 'alphaSphere']);
        addItem(s, pick, 1);
        this.spoils.items.push(pick);
      }
    }
    this.spoils.ap = ap;
    this.spoils.pls = pls;
    this.spoils.levels = {};
    s.pls += pls;
    s.stats.battles++;
    for (const u of this.units) {
      if (u.side !== 'party' || u.kind !== 'party') continue;
      // FFX's rule: you only learn from fights you were actually in.
      const share = u.apEarned > 0 ? ap : Math.round(ap * 0.35);
      const gained = gainAp(s, u.id, share);
      if (gained) this.spoils.levels[u.id] = gained;
    }
  }

  writeBack() {
    const s = this.state;
    for (const u of this.units) {
      if (u.side !== 'party' || u.kind !== 'party') continue;
      const c = s.chars[u.id];
      c.hp = Math.max(u.ko ? 0 : 1, Math.round(u.hp));
      c.mp = Math.round(u.mp);
      c.ko = u.ko;
      c.overdrive = u.overdrive;
    }
    if (this.aeon) {
      s.aeonHp[this.aeon.id] = Math.max(0, Math.round(this.aeon.hp));
      s.aeonOd[this.aeon.id] = this.aeon.overdrive;
    }
  }

  /* ── commands from the player ──────────────────────────────────────── */

  /**
   * @param {{type:string, ability?:string, item?:string, targets?:string[],
   *          aeon?:string, power?:number, hits?:number, moveId?:string,
   *          amount?:number, itemB?:string}} cmd
   */
  command(cmd) {
    const unit = this.actor;
    if (!unit || this.over) return [];
    let events = [];
    let rank = RANK.normal;

    switch (cmd.type) {
      case 'ability': {
        const ab = ABILITIES[cmd.ability];
        events = this.useAbility(unit, ab, cmd.targets);
        rank = ab.rank;
        break;
      }
      case 'item': {
        events = this.useItem(unit, cmd.item, cmd.targets);
        rank = RANK.normal;
        break;
      }
      case 'swap': {
        events = this.swap(unit, cmd.to);
        return events; // swap does not consume the turn slot; the newcomer acts
      }
      case 'summon': {
        events = this.summon(unit, cmd.aeon);
        return events;
      }
      case 'dismiss': {
        events = this.dismissAeon('dismissed');
        return events;
      }
      case 'overdrive': {
        events = this.overdrive(unit, cmd);
        rank = RANK.heavy;
        break;
      }
      case 'mix': {
        events = this.mix(unit, cmd.item, cmd.itemB, cmd.targets);
        rank = RANK.skill;
        break;
      }
      case 'pay': {
        events = this.payYobimbo(unit, cmd.amount);
        rank = RANK.heavy;
        break;
      }
      case 'flee': {
        events = this.tryFlee(unit);
        rank = RANK.quick;
        break;
      }
      default:
        events = [{ type: 'text', text: '…' }];
    }

    unit.apEarned = (unit.apEarned || 0) + 1;
    this.timeline.spend(unit.uid, rank);
    return events;
  }

  /* ── actions ───────────────────────────────────────────────────────── */

  useAbility(unit, ab, targetUids) {
    const ev = [];
    if (!ab) return ev;
    if (ab.kind === 'magic' && unit.status.silence) {
      return [{ type: 'text', text: `${unit.name} is muted.` }];
    }
    if (ab.kind === 'magic' && this.foes().some((f) => f.def?.negator)) {
      return [{ type: 'text', text: 'Magic is unavailable on this network.' }];
    }
    if (ab.mp > unit.mp) return [{ type: 'text', text: 'Not enough MP.' }];
    unit.mp -= ab.mp;
    ev.push({ type: 'cast', source: unit.uid, ability: ab.id, name: ab.name, kind: ab.kind, element: ab.element });

    const targets = this.resolveTargets(unit, ab, targetUids);

    if (ab.special === 'steal') ev.push(...this.doSteal(unit, targets[0]));
    if (ab.special === 'bribe') return [...ev, ...this.doBribe(unit, targets[0])];
    if (ab.special === 'lancet') ev.push(...this.doLancet(unit, targets[0]));

    for (const t of targets) {
      if (!t || (t.ko && !ab.revive)) continue;
      ev.push(...this.applyAction(unit, t, ab));
    }
    return ev;
  }

  resolveTargets(unit, ab, uids) {
    if (uids?.length) return uids.map((u) => this.byUid(u)).filter(Boolean);
    switch (ab.target) {
      case 'enemies': return this.enemiesOf(unit);
      case 'allies': return this.alliesOf(unit);
      case 'self': return [unit];
      case 'ally': return [this.alliesOf(unit)[0]];
      case 'none': return [];
      default: return [this.enemiesOf(unit)[0]].filter(Boolean);
    }
  }

  /** Everything a single action does to a single target. */
  applyAction(unit, target, ab) {
    const ev = [];
    const isOffensive = target.side !== unit.side;

    if (ab.dispel && isOffensive) {
      let stripped = 0;
      for (const k of Object.keys(target.status)) {
        if (!BAD_STATUS.includes(k)) { delete target.status[k]; stripped++; }
      }
      this.refreshSpeed(target);
      ev.push({ type: 'text', text: stripped ? `${target.name} loses its buffs.` : 'Nothing to dispel.' });
    }

    if (ab.cleanse) {
      for (const k of BAD_STATUS) delete target.status[k];
      this.refreshSpeed(target);
      ev.push({ type: 'status', target: target.uid, status: 'cleansed', cleared: true });
    }

    if (ab.revive) {
      if (target.ko) {
        target.ko = false;
        target.hp = Math.max(1, Math.floor(target.maxHp * ab.revive));
        this.timeline.add(target.uid, target.stats.agi, { mods: target.status, rank: 2 });
        ev.push({ type: 'revive', target: target.uid, amount: target.hp });
      }
      return ev;
    }

    if (ab.kind === 'heal' || ab.heal) {
      if (target.def?.undead || target.undead) {
        const dmg = Math.floor(healAmount(unit.stats, ab) * 0.9);
        ev.push(...this.damage(target, dmg, { element: 'holy', tag: 'undead-heal' }));
        return ev;
      }
      const amount = ab.fixedHeal ?? healAmount(unit.stats, ab);
      const before = target.hp;
      target.hp = Math.min(target.maxHp, target.hp + amount);
      ev.push({ type: 'heal', target: target.uid, amount: Math.round(target.hp - before) });
    }

    if (ab.bless) {
      for (const b of ab.bless) {
        if (b.stack && b.status === 'cheer') {
          target.cheer = Math.min(5, (target.cheer || 0) + 1);
          target.stats = { ...target.stats };
          target.stats.str = Math.round(target.stats.str * 1.06);
          target.stats.def = Math.round(target.stats.def * 1.06);
        }
        target.status[b.status] = b.turns;
        if (b.status === 'haste' || b.status === 'slow') this.refreshSpeed(target);
        ev.push({ type: 'status', target: target.uid, status: b.status });
      }
    }

    if (ab.power || ab.percentHp || ab.fixed) {
      const hits = ab.hits || 1;
      for (let i = 0; i < hits; i++) {
        if (target.ko) break;
        ev.push(...this.strike(unit, target, ab, hits > 1));
      }
    }

    if (ab.inflict && !target.ko) {
      for (const inf of ab.inflict) {
        if (target.boss && ['doom', 'sleep', 'confuse'].includes(inf.status) && this.rng() < 0.75) continue;
        if (this.rng() < inf.chance) {
          target.status[inf.status] = inf.turns;
          if (inf.status === 'slow' || inf.status === 'haste') this.refreshSpeed(target);
          ev.push({ type: 'status', target: target.uid, status: inf.status });
        } else {
          ev.push({ type: 'text', text: `${target.name} shrugs it off.` });
        }
      }
    }

    if (ab.delay && !target.ko) {
      this.timeline.spend(target.uid, ab.delay);
      ev.push({ type: 'delay', target: target.uid, amount: ab.delay });
    }

    return ev;
  }

  /** One damaging hit, with all the "wrong character" rules applied. */
  strike(unit, target, ab, multi = false) {
    const ev = [];
    const physical = ab.kind !== 'magic';

    if (physical && target.flying && !ab.ranged && !ab.alwaysHits && unit.side === 'party') {
      if (this.rng() > 0.14) {
        ev.push({ type: 'miss', target: target.uid, reason: 'flying' });
        return ev;
      }
    }
    if (physical && target.physImmune && !ab.pierce) {
      ev.push({ type: 'damage', target: target.uid, amount: 1, immune: true });
      target.hp = Math.max(0, target.hp - 1);
      return ev;
    }

    const atk = {
      ...unit.stats, status: unit.status, luck: unit.stats.luck,
      foe: unit.side === 'foe', // monsters swing on the gentler curve
    };
    const tgt = {
      ...target.stats, status: target.status, maxHp: target.maxHp,
      armored: target.armored, weak: target.weak, resist: target.resist,
      immune: target.immune, absorb: target.absorb, luck: target.stats.luck,
    };
    const res = resolveHit(atk, tgt, ab, this.rng);

    if (!res.hit) {
      ev.push({ type: 'miss', target: target.uid });
      return ev;
    }

    let dmg = res.damage;
    // The roster bonus: the right character for the job hits 50% harder.
    let effective = false;
    if (unit.counters && unit.counters === target.kind) { dmg = Math.floor(dmg * 1.5); effective = true; }
    if (target.def?.fixedDamage && unit.side === 'foe') dmg = target.def.fixedDamage;
    if (unit.def?.fixedDamage) dmg = unit.def.fixedDamage;
    dmg = Math.min(DAMAGE_CAP, dmg);

    if (res.absorbed) {
      target.hp = Math.min(target.maxHp, target.hp + dmg);
      ev.push({ type: 'heal', target: target.uid, amount: dmg, absorbed: true });
      return ev;
    }
    if (res.mult === 0) {
      ev.push({ type: 'damage', target: target.uid, amount: 0, immune: true });
      return ev;
    }

    if (ab.percentHp) dmg = Math.min(dmg, Math.max(0, target.hp - 1)); // Demi never kills

    ev.push(...this.damage(target, dmg, {
      crit: res.crit, weak: res.mult > 1, resisted: res.mult < 1, effective,
      element: ab.element, multi, source: unit.uid,
    }));

    if (ab.drain === 'hp' || ab.drain === 'both') {
      const gain = Math.floor(dmg * 0.75);
      unit.hp = Math.min(unit.maxHp, unit.hp + gain);
      ev.push({ type: 'heal', target: unit.uid, amount: gain, drained: true });
    }
    if (ab.drain === 'mp' || ab.drain === 'both') {
      const gain = Math.max(1, Math.floor(Math.min(target.mp, ab.drain === 'mp' ? dmg * 0.2 : 12)));
      target.mp = Math.max(0, target.mp - gain);
      unit.mp = Math.min(unit.maxMp, unit.mp + gain);
      ev.push({ type: 'mp', target: unit.uid, amount: gain });
    }

    // Boss reactions.
    if (target.def?.morph && !target.ko && ab.element) {
      target.absorb = [ab.element];
      target.weak = [{ fire: 'ice', ice: 'fire', thunder: 'water', water: 'thunder', holy: 'holy' }[ab.element] || 'holy'];
      ev.push({ type: 'text', text: `${target.name} revises its tokenomics. It now absorbs ${ab.element}.` });
    }
    if (target.def?.counters && !target.ko && ab.kind !== 'magic' && unit.side === 'party' && this.rng() < 0.7) {
      ev.push({ type: 'text', text: `${target.name} counters — "have you considered your cost basis?"` });
      ev.push(...this.damage(unit, Math.floor(target.stats.str * 9), { counter: true }));
    }
    if (target.status.sleep) delete target.status.sleep;

    return ev;
  }

  damage(target, amount, meta = {}) {
    const ev = [];
    amount = Math.max(0, Math.round(amount));
    target.hp = Math.max(0, target.hp - amount);
    ev.push({ type: 'damage', target: target.uid, amount, ...meta });
    if (target.side === 'party') {
      target.overdrive = Math.min(100, target.overdrive + overdriveGain(target, amount));
    }
    if (target.hp <= 0) ev.push(...this.kill(target));
    return ev;
  }

  kill(target) {
    const ev = [];
    if (target.status.autolife) {
      delete target.status.autolife;
      target.hp = target.maxHp;
      ev.push({ type: 'revive', target: target.uid, amount: target.hp, insurance: true });
      return ev;
    }
    target.ko = true;
    target.hp = 0;
    target.status = {};
    this.timeline.remove(target.uid);
    ev.push({ type: 'ko', target: target.uid });
    if (target.side === 'foe') this.state.stats.kills++;
    if (target === this.aeon) ev.push(...this.dismissAeon('defeated'));
    return ev;
  }

  /* ── special commands ──────────────────────────────────────────────── */

  swap(unit, toUid) {
    const incoming = this.byUid(toUid);
    if (!incoming || incoming.ko) return [{ type: 'text', text: 'Not available.' }];
    incoming.benched = false;
    unit.benched = true;
    this.timeline.replace(unit.uid, incoming.uid, incoming.stats.agi, incoming.status);
    this.actor = incoming;
    return [{ type: 'swap', out: unit.uid, in: incoming.uid, text: `${incoming.name} steps in.` }];
  }

  summon(unit, aeonId) {
    if (!this.state.aeons.includes(aeonId)) return [{ type: 'text', text: 'Not yours yet.' }];
    const aeon = this.makeAeon(aeonId);
    if (aeon.hp <= 0) aeon.hp = aeon.maxHp;
    this.units.push(aeon);
    for (const u of this.front()) this.timeline.remove(u.uid);
    this.timeline.remove(unit.uid);
    this.aeon = aeon;
    this.timeline.add(aeon.uid, aeon.stats.agi, { mods: aeon.status, rank: 0.4 });
    this.actor = aeon;
    return [{ type: 'summon', aeon: aeon.uid, name: aeon.name, text: `${aeon.name} descends.` }];
  }

  dismissAeon(why) {
    if (!this.aeon) return [];
    const gone = this.aeon;
    this.state.aeonHp[gone.id] = Math.max(0, Math.round(gone.hp));
    this.state.aeonOd[gone.id] = gone.overdrive;
    this.timeline.remove(gone.uid);
    this.units = this.units.filter((u) => u !== gone);
    this.aeon = null;
    for (const u of this.front()) {
      if (!u.ko && !this.timeline.has(u.uid)) {
        this.timeline.add(u.uid, u.stats.agi, { mods: u.status, rank: 1.4 });
      }
    }
    return [{ type: 'unsummon', name: gone.name, why, text: `${gone.name} ${why === 'defeated' ? 'is dismissed in disgrace' : 'returns'}.` }];
  }

  overdrive(unit, cmd) {
    unit.overdrive = 0;
    this.state.stats.overdrives++;
    const ev = [{ type: 'overdrive', source: unit.uid, name: cmd.name || 'Overdrive' }];
    const targets = cmd.targets?.length
      ? cmd.targets.map((u) => this.byUid(u)).filter(Boolean)
      : (cmd.all ? this.foes() : [this.foes()[0]].filter(Boolean));

    if (cmd.kind === 'heal') {
      for (const t of this.front()) {
        if (t.ko) continue;
        const before = t.hp;
        t.hp = Math.min(t.maxHp, t.hp + (cmd.heal || 9999));
        ev.push({ type: 'heal', target: t.uid, amount: Math.round(t.hp - before) });
      }
      return ev;
    }

    const hits = cmd.hits || 1;
    for (let i = 0; i < hits; i++) {
      for (const t of targets) {
        if (!t || t.ko) continue;
        ev.push(...this.strike(unit, t, {
          kind: cmd.magic ? 'magic' : 'attack', power: cmd.power || 2,
          pierce: true, element: cmd.element || null, alwaysHits: true, noVariance: false,
        }, hits > 1));
      }
    }
    return ev;
  }

  /** Yobimbo. Pay him. He can tell. */
  payYobimbo(unit, amount) {
    const aeon = AEONS.yobimbo;
    const pay = Math.max(0, Math.min(amount, this.state.pls));
    this.state.pls -= pay;
    const ratio = pay / Math.max(1000, this.state.pls + pay);
    let tier = aeon.tiers[0];
    for (const t of aeon.tiers) if (ratio >= t.min) tier = t;
    const ev = [{ type: 'text', text: `Paid ${pay.toLocaleString()} PLS. ${tier.desc}` }];
    if (tier.instant) {
      for (const f of this.foes()) {
        if (f.boss && this.rng() > 0.25) {
          ev.push({ type: 'text', text: `${f.name} is too big an account to delete.` });
          continue;
        }
        ev.push(...this.damage(f, DAMAGE_CAP, { crit: true }));
      }
      return ev;
    }
    const targets = tier.all ? this.foes() : [this.foes()[0]].filter(Boolean);
    for (const t of targets) {
      ev.push(...this.strike(unit, t, { kind: 'attack', power: tier.power, pierce: true, alwaysHits: true }));
    }
    return ev;
  }

  doSteal(unit, target) {
    if (!target) return [];
    const pool = target.def?.steal || [];
    const odds = 0.72 - (target.stealCount || 0) * 0.22;
    target.stealCount = (target.stealCount || 0) + 1;
    if (!pool.length || this.rng() > odds) {
      return [{ type: 'text', text: `Nothing left to take from ${target.name}.` }];
    }
    const got = this.rng.pick(pool);
    addItem(this.state, got, 1);
    this.state.stats.steals++;
    this.spoils.items.push(got);
    return [{ type: 'steal', target: target.uid, item: got, text: `Stole ${ITEMS[got].name}.` }];
  }

  doBribe(unit, target) {
    if (!target) return [];
    const cost = Math.floor(target.maxHp * 2.4);
    if (this.state.pls < cost) {
      return [{ type: 'text', text: `${target.name} wants ${cost.toLocaleString()} PLS. You have ${this.state.pls.toLocaleString()}.` }];
    }
    this.state.pls -= cost;
    const pool = target.def?.steal?.length ? target.def.steal : ['hopium'];
    const got = this.rng.pick(pool);
    addItem(this.state, got, 2);
    const ev = [{ type: 'text', text: `${target.name} takes ${cost.toLocaleString()} PLS and two ${ITEMS[got].name}s and leaves. Business is business.` }];
    ev.push(...this.kill(target));
    return ev;
  }

  doLancet(unit, target) {
    if (!target?.def) return [];
    const teach = { flying: 'seedCannon', armored: 'stoneBreath', shelled: 'aquaBreath', machina: 'seedCannon', undead: 'novaRage', agile: 'seedCannon', beast: 'aquaBreath' }[target.kind];
    const c = this.state.chars.copi;
    if (teach && c && !c.learned.includes(teach) && this.rng() < 0.5) {
      c.learned.push(teach);
      if (!unit.abilities.includes(teach)) unit.abilities.push(teach);
      return [{ type: 'learn', ability: teach, text: `Copi copies the trade: ${ABILITIES[teach].name}.` }];
    }
    return [];
  }

  useItem(unit, itemId, targetUids) {
    const it = ITEMS[itemId];
    if (!it || !takeItem(this.state, itemId, 1)) return [{ type: 'text', text: 'None left.' }];
    const ev = [{ type: 'cast', source: unit.uid, name: it.name, kind: 'item' }];
    const ab = {
      kind: it.kind === 'attack' ? 'attack' : it.kind === 'buff' ? 'support' : 'heal',
      power: it.power, element: it.element, pierce: it.pierce, alwaysHits: it.alwaysHits,
      fixedHeal: it.heal, bless: it.bless, target: it.target, revive: it.revive,
      cleanse: it.cures === 'all', hits: 1,
    };
    const targets = this.resolveTargets(unit, { ...ab, target: it.target }, targetUids);
    for (const t of targets) {
      if (!t) continue;
      if (it.healMp) {
        const gain = Math.min(t.maxMp - t.mp, it.healMp);
        t.mp += gain;
        ev.push({ type: 'mp', target: t.uid, amount: gain });
      }
      if (it.cures && it.cures !== 'all') for (const c of it.cures) delete t.status[c];
      if (t.ko && !it.revive) continue;
      ev.push(...this.applyAction(unit, t, ab));
    }
    return ev;
  }

  mix(unit, aId, bId, targetUids) {
    const a = ITEMS[aId], b = ITEMS[bId];
    if (!takeItem(this.state, aId, 1)) return [{ type: 'text', text: 'None left.' }];
    if (!takeItem(this.state, bId, 1)) { addItem(this.state, aId, 1); return [{ type: 'text', text: 'None left.' }]; }
    const r = mixResult(a, b);
    const ev = [{ type: 'mix', source: unit.uid, name: r.name, text: `${a.name} + ${b.name} → ${r.name}!` }];
    const ab = {
      kind: r.kind === 'attack' ? 'attack' : 'heal', power: r.power, pierce: r.pierce,
      alwaysHits: true, fixedHeal: r.heal, bless: r.bless, cleanse: r.cures === 'all',
      target: r.target, hits: 1,
    };
    let targets = r.target === 'enemies' ? this.foes()
      : r.target === 'allies' ? this.front()
        : targetUids?.map((u) => this.byUid(u)).filter(Boolean) || [this.foes()[0]].filter(Boolean);
    for (const t of targets) {
      if (!t) continue;
      if (r.reviveAll && t.ko) {
        t.ko = false;
        t.hp = t.maxHp;
        this.timeline.add(t.uid, t.stats.agi, { mods: t.status, rank: 2 });
        ev.push({ type: 'revive', target: t.uid, amount: t.hp });
        continue;
      }
      if (r.healMp) {
        const gain = Math.min(t.maxMp - t.mp, r.healMp);
        t.mp += gain;
        ev.push({ type: 'mp', target: t.uid, amount: gain });
      }
      if (t.ko) continue;
      ev.push(...this.applyAction(unit, t, ab));
    }
    return ev;
  }

  tryFlee(unit) {
    if (!this.canFlee) return [{ type: 'text', text: 'There is no selling this one.' }];
    const speed = unit.stats.agi;
    const foeSpeed = Math.max(...this.foes().map((f) => f.stats.agi), 1);
    if (this.rng() < 0.45 + (speed - foeSpeed) * 0.03) {
      this.finish('fled', []);
      return [{ type: 'text', text: 'Sold at a loss. Escaped.' }];
    }
    return [{ type: 'text', text: 'Could not get out. No bids.' }];
  }

  /* ── enemy brains ──────────────────────────────────────────────────── */

  autoAct(unit) {
    if (unit.status.sleep) return [{ type: 'text', text: `${unit.name} sleeps.` }];

    if (unit.side === 'party') {
      // Confused or berserk allies swing on their own.
      const pool = unit.status.confuse ? [...this.foes(), ...this.front()] : this.foes();
      const target = this.rng.pick(pool.filter((t) => !t.ko));
      const ev = this.applyAction(unit, target || this.foes()[0], ABILITIES.attack);
      this.timeline.spend(unit.uid, RANK.normal);
      return ev;
    }

    const def = unit.def;
    const hpFrac = unit.hp / unit.maxHp;
    const options = (def.ai || []).filter((o) => {
      if (!o.when) return true;
      if (o.when.hpBelow != null && hpFrac > o.when.hpBelow) return false;
      if (o.when.hpAbove != null && hpFrac < o.when.hpAbove) return false;
      return true;
    });
    const total = options.reduce((s, o) => s + o.w, 0) || 1;
    let roll = this.rng() * total;
    let choice = options[0] || { a: 'enemyStrike' };
    for (const o of options) {
      roll -= o.w;
      if (roll <= 0) { choice = o; break; }
    }
    const ab = ABILITIES[choice.a] || ABILITIES.enemyStrike;

    let targets;
    if (ab.kind === 'heal' || ab.kind === 'support') {
      targets = ab.target === 'allies' ? this.foes() : [this.rng.pick(this.foes())];
    } else if (ab.target === 'enemies') {
      targets = this.front().filter((u) => !u.ko);
    } else {
      const live = this.front().filter((u) => !u.ko);
      // Provoked pulls aggro; otherwise the squishiest is the most likely pick.
      const provoked = live.find((u) => u.status.provoked);
      targets = [provoked || this.rng.pick(live)].filter(Boolean);
    }

    const ev = [{ type: 'cast', source: unit.uid, name: ab.name, kind: ab.kind, element: ab.element }];
    if (ab.mp && unit.mp >= ab.mp) unit.mp -= ab.mp;
    for (const t of targets) {
      if (!t) continue;
      ev.push(...this.applyAction(unit, t, ab));
    }
    this.timeline.spend(unit.uid, ab.rank);
    return ev;
  }
}

/** Build a random encounter for a chapter's table. */
export function rollEncounter(chapter, rng = defaultRng) {
  const enc = chapter.encounters;
  if (!enc) return null;
  const n = 1 + rng.int(enc.max || 2);
  const foes = [];
  for (let i = 0; i < n; i++) foes.push(rng.pick(enc.table));
  return { foes, canFlee: true };
}
