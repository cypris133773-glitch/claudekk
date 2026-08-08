// Conditional Turn-Based order — the engine that made FFX's combat readable.
//
// Every combatant carries a counter. The lowest counter acts; the amount added
// back afterwards depends on the *action* they chose, not just on their speed,
// so a slow spell genuinely costs you a place in the queue. The queue is
// published ahead of time (peek) and re-published while the player is still
// hovering an ability, which is the whole point: you are meant to plan against
// the printed future.
//
// Pure data in, pure data out — tools/test.js exercises this without a browser.

export const RANK = {
  swap: 0, // free: the incoming member inherits the outgoing member's turn
  quick: 1.5, // steal, flee, item-ish speed
  normal: 2, // attack, most items
  skill: 2.4, // most abilities
  spell: 3, // black/white magic
  heavy: 4, // overdrives, big summons, boss specials
};

const BASE = 300;
const FLOOR = 6;

export function speedOf(agi, mods = {}) {
  let s = 10 + Math.max(0, agi);
  if (mods.haste) s *= 1.5;
  if (mods.slow) s *= 0.5;
  return Math.max(4, s);
}

export function tickCost(rank, agi, mods) {
  return Math.max(FLOOR, Math.round((rank * BASE) / speedOf(agi, mods)));
}

export class Timeline {
  constructor() {
    /** @type {{id:string, agi:number, mods:object, ctb:number, order:number}[]} */
    this.slots = [];
    this._order = 0;
    this.time = 0;
  }

  add(id, agi, { mods = {}, ctb = null, rank = 1.6 } = {}) {
    const slot = {
      id,
      agi,
      mods,
      ctb: ctb == null ? tickCost(rank, agi, mods) : ctb,
      order: this._order++,
    };
    this.slots.push(slot);
    return slot;
  }

  remove(id) {
    this.slots = this.slots.filter((s) => s.id !== id);
  }

  has(id) {
    return this.slots.some((s) => s.id === id);
  }

  get(id) {
    return this.slots.find((s) => s.id === id);
  }

  /** Replace one combatant with another, inheriting the counter (party swap). */
  replace(oldId, newId, agi, mods = {}) {
    const slot = this.get(oldId);
    if (!slot) return this.add(newId, agi, { mods });
    slot.id = newId;
    slot.agi = agi;
    slot.mods = mods;
    return slot;
  }

  setAgility(id, agi, mods) {
    const slot = this.get(id);
    if (!slot) return;
    // Re-scale the remaining wait so Haste feels immediate rather than
    // taking effect only after the next turn.
    const before = speedOf(slot.agi, slot.mods);
    slot.agi = agi;
    if (mods) slot.mods = mods;
    const after = speedOf(slot.agi, slot.mods);
    slot.ctb = Math.max(0, Math.round((slot.ctb * before) / after));
  }

  /** Advance to whoever is next, returning their id. */
  next() {
    if (!this.slots.length) return null;
    const lead = this._sorted()[0];
    const dt = lead.ctb;
    if (dt > 0) {
      for (const s of this.slots) s.ctb -= dt;
      this.time += dt;
    }
    return lead.id;
  }

  /** Charge the actor for the action they just took. */
  spend(id, rank = RANK.normal) {
    const slot = this.get(id);
    if (!slot) return;
    slot.ctb += tickCost(rank, slot.agi, slot.mods);
  }

  _sorted() {
    return this.slots
      .slice()
      .sort((a, b) => a.ctb - b.ctb || a.order - b.order);
  }

  /**
   * The printed future. `preview` lets the UI answer "what happens if I cast
   * this?" while the cursor is still on the ability.
   * @param {number} count how many upcoming turns to return
   * @param {{id:string, rank:number}|null} preview
   */
  peek(count = 12, preview = null) {
    const sim = this.slots.map((s) => ({ ...s }));
    const out = [];
    let first = true;
    let guard = 0;
    while (out.length < count && sim.length && guard++ < 500) {
      sim.sort((a, b) => a.ctb - b.ctb || a.order - b.order);
      const lead = sim[0];
      const dt = lead.ctb;
      if (dt > 0) for (const s of sim) s.ctb -= dt;
      out.push(lead.id);
      let rank = RANK.normal;
      if (first && preview && preview.id === lead.id) rank = preview.rank;
      first = false;
      lead.ctb += tickCost(rank, lead.agi, lead.mods);
    }
    return out;
  }
}
