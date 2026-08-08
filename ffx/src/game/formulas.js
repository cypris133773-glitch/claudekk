// Damage maths. Shaped after FFX's: a cubic on the attacking stat so that the
// last few points of Strength matter enormously, a defence term that flattens
// out rather than ever reaching zero, and a 99999 cap you can actually reach.

import { clamp } from '../core/rng.js';

export const DAMAGE_CAP = 99999;

export const ELEMENTS = ['fire', 'ice', 'thunder', 'water', 'holy', 'gravity'];

// Calibrated to the defence values that actually occur: a party member ends
// the game around 40, an armoured monster sits at 100-120, and the things that
// laugh at steel are at 200. A divisor of 520 made all of those identical.
export function defenceMod(def) {
  return clamp((260 - def) / 260, 0.12, 1.4);
}

// The party's damage is cubic in the attacking stat, so the last few Strength
// nodes are worth walking for and the numbers get gratifyingly enormous.
// Monsters use a quadratic instead: their stats climb across thirteen chapters
// and a cubic on those numbers would delete the party in one swing. Same knobs,
// different curve, and it is the difference between a boss and a cutscene.
const partyCurve = (stat) => Math.pow(Math.max(1, stat), 3) / 32 + 32;
const foeCurve = (stat) => Math.pow(Math.max(1, stat), 2) / 6 + 40;

/** Physical: strength cubed, defence flattened, armour piercing matters. */
export function physical(atk, target, opts = {}) {
  const power = opts.power ?? 1;
  let str = atk.str;
  if (atk.status?.powerBreak) str *= 0.7;
  if (atk.status?.berserk) str *= 1.2;
  let def = target.def;
  if (target.status?.armorBreak) def *= 0.5;
  if (target.status?.protect) def += 70;

  let dmg = (atk.foe ? foeCurve(str) : partyCurve(str)) * power * defenceMod(def);
  // Armour is the "you brought the wrong character" tax. Piercing weapons and
  // Armour Break both switch it off.
  if (target.armored && !opts.pierce && !target.status?.armorBreak) dmg *= 0.28;
  return dmg;
}

/** Magic: same curve on Magic, read against Magic Defence. */
export function magical(atk, target, opts = {}) {
  const power = opts.power ?? 1;
  let mag = atk.mag;
  if (atk.status?.magicBreak) mag *= 0.7;
  let mdef = target.mdef;
  if (target.status?.mentalBreak) mdef *= 0.5;
  if (target.status?.shell) mdef += 70;
  const base = atk.foe ? foeCurve(mag) : partyCurve(mag) * 0.5;
  return base * power * defenceMod(mdef);
}

/** Elemental multiplier including absorb (negative = healing). */
export function elementMod(target, element) {
  if (!element || element === 'none') return 1;
  if (target.absorb?.includes(element)) return -1;
  if (target.immune?.includes(element)) return 0;
  if (target.resist?.includes(element)) return 0.5;
  if (target.weak?.includes(element)) return 2;
  return 1;
}

export function hitChance(atk, target, opts = {}) {
  if (opts.alwaysHits) return 1;
  if (target.status?.sleep || target.status?.petrify) return 1;
  let acc = atk.acc ?? 20;
  if (atk.status?.blind) acc *= 0.45;
  if (atk.status?.aim) acc += 20;
  const eva = target.eva ?? 0;
  // Slow characters should feel wrong against an agile enemy, not useless:
  // Audit lands roughly a quarter of his swings on a Liquidity Flea, and the
  // Accuracy nodes on his petal are how you fix that.
  return clamp(0.72 + (acc - eva) * 0.035, 0.06, 1);
}

export function critChance(atk, target, opts = {}) {
  const luck = (atk.luck ?? 5) - (target.luck ?? 5);
  return clamp(0.04 + luck * 0.012 + (opts.critBonus ?? 0), 0.01, 0.95);
}

/**
 * Full resolution of one hit.
 * @returns {{damage:number, hit:boolean, crit:boolean, mult:number, absorbed:boolean}}
 */
export function resolveHit(atk, target, action, rand) {
  const roll = (n) => (rand ? rand() : Math.random()) < n;
  const magicish = action.kind === 'magic';
  const out = { damage: 0, hit: true, crit: false, mult: 1, absorbed: false };

  if (!magicish && !roll(hitChance(atk, target, action))) {
    out.hit = false;
    return out;
  }

  let dmg = magicish ? magical(atk, target, action) : physical(atk, target, action);

  if (action.fixed) dmg = action.fixed;
  if (action.percentHp) dmg = target.maxHp * action.percentHp;

  if (!magicish && !action.noCrit && roll(critChance(atk, target, action))) {
    out.crit = true;
    dmg *= 2;
  }

  const em = elementMod(target, action.element);
  if (em === 0) {
    out.mult = 0;
    out.damage = 0;
    return out;
  }
  dmg *= Math.abs(em);
  if (em < 0) out.absorbed = true;
  out.mult = em;

  if (!magicish && target.status?.protect) dmg *= 0.85;
  if (magicish && target.status?.shell) dmg *= 0.85;
  if (target.status?.defending) dmg *= 0.5;

  // ±7% jitter so repeated hits do not print identical numbers.
  const jitter = 0.93 + (rand ? rand() : Math.random()) * 0.14;
  dmg *= action.noVariance ? 1 : jitter;

  out.damage = clamp(Math.floor(dmg), 1, DAMAGE_CAP);
  return out;
}

export function healAmount(atk, action) {
  if (action.fixedHeal) return action.fixedHeal;
  const power = action.power ?? 1;
  return Math.floor(
    clamp((Math.pow(Math.max(1, atk.mag), 2.6) / 24 + 40) * power, 1, DAMAGE_CAP),
  );
}

/** Overdrive fills mainly from punishment taken — the classic "Stoic" mode. */
export function overdriveGain(unit, damageTaken) {
  return clamp((damageTaken / Math.max(1, unit.maxHp)) * 165 + 2.5, 0, 100);
}
