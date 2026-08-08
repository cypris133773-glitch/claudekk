// Elemental tags, and what happens when you cross them.
//
// The problem this solves: four skills on four cooldowns is four independent
// buttons. Nothing a Mage does makes the next thing a Mage does better, so the
// rotation is "press whatever is off cooldown" and the order never matters.
// That is true of all nine classes, and it is the single biggest reason the
// combat is shallower than the number of skills suggests.
//
// So: damage leaves a mark. Fire leaves BURNING, frost leaves CHILLED, storm
// leaves SHOCKED. Hitting something that already carries one with a *different*
// element consumes the mark and detonates it. Same element refreshes and does
// nothing special — the reward is specifically for switching.
//
// WHY IT IS SMALL
//
// Three tags and one reaction, not nine tags and a matrix. A combo system a
// player cannot hold in their head is a combo system they play by accident,
// and the whole value here is the moment where you *choose* the second skill
// because of the first. One sentence — "hit it with something else" — is the
// entire rule.
//
// It also crosses players. In a 2v2 your Mage tagging a target and your Shaman
// detonating it is the same code path, and it is the first thing in this game
// that makes two players better together than the same two players apart.

import { hexToRgb } from './effects.js';

/** How long a mark lingers before it fades on its own. */
export const TAG_DURATION = 5;

/**
 * The three marks.
 *
 * `blast` is the fraction of the tagging hit's damage the detonation deals,
 * so a big skill leaves a big mark and a rank-one cantrip leaves a small one.
 * Nothing here is a flat number: a fixed detonation would be the whole damage
 * of a run's first wave and a rounding error by wave thirty.
 */
export const ELEMENTS = {
  fire: {
    id: 'fire', name: 'Burning', color: '#ff7a2c', blast: 1.15, radius: 4.2,
    verb: 'IGNITE',
  },
  frost: {
    id: 'frost', name: 'Chilled', color: '#8fe3ff', blast: 0.85, radius: 5.0,
    verb: 'SHATTER',
    // Frost's detonation freezes what it catches rather than hitting hardest.
    freeze: 1.1,
  },
  storm: {
    id: 'storm', name: 'Shocked', color: '#9fefff', blast: 0.95, radius: 6.2,
    verb: 'DISCHARGE',
    // Storm arcs: it hits a wider ring for less, which is what makes it the
    // one you want against a pack rather than against one thing.
    stun: 0.5,
  },
};

/**
 * The element a skill carries, worked out from what the skill already is.
 *
 * Deliberately derived rather than authored on all 117 skills. A skill that
 * freezes is frost; one that burns is fire; one that chains is storm. Those
 * are already the properties that make the skill what it is, so an element
 * field would be a second copy of the same fact — and the copy is the one that
 * would be wrong after the next rebalance.
 *
 * A skill that is none of those has no element and neither tags nor detonates,
 * which is correct: a Warrior's Execute is not an elemental attack and should
 * not pretend to be one.
 */
export function elementOf(skill, power) {
  if (!skill) return null;
  const p = power || skill.power || {};
  if (p.freeze || p.chill) return 'frost';
  if (p.burn) return 'fire';
  if (skill.kind === 'chain' || p.jumps) return 'storm';
  // A weapon in your hands is not an element.
  //
  // Melee kinds are excluded outright rather than falling through to the
  // colour test below: a Warrior's Thunder Clap is orange because a shockwave
  // through stone is orange, not because it is a fire spell, and letting hue
  // decide would have turned every physical class into a caster. The
  // mechanical tests above still apply to them — a melee skill that genuinely
  // freezes is genuinely frost.
  if (skill.kind === 'strike' || skill.kind === 'dash' || skill.kind === 'buff'
    || skill.kind === 'heal' || skill.kind === 'summon') return null;

  // Colour, last and only for spells.
  //
  // A skill's colour was chosen to say what the skill is, which makes it a
  // real signal — just a weaker one than a mechanic, so it is asked last and
  // only for the kinds that are spells by construction. Hue rather than a
  // pattern match on the hex digits: "#8fe3ff" and "#7ef0ff" are both plainly
  // cold and share almost no characters.
  const hue = hueOf(p.color);
  if (hue === null) return null;
  if (hue < 45 || hue >= 330) return 'fire';       // red through orange
  if (hue >= 170 && hue < 210) return 'frost';     // cyan
  if (hue >= 210 && hue < 265) return 'storm';     // blue through violet-blue
  return null;
}

/** Hue in degrees for a #rrggbb string, or null for anything unparseable. */
function hueOf(hex) {
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  // Near-white and near-grey have no hue worth trusting. A holy skill is white
  // because it is holy, and calling it fire because its red channel is highest
  // by two percent would be worse than calling it nothing.
  if (d < 0.12) return null;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/**
 * Put a mark on a target, or detonate the one it already has.
 *
 * Returns the element that detonated, or null. The caller does the damage —
 * this owns the rule, not the numbers, so a detonation goes through the same
 * `explode` every other blast in the game goes through and inherits every
 * modifier, floater and sound along with it.
 */
export function tagOrDetonate(game, source, target, element, hitDamage) {
  if (!element || !target || target.dead) return null;
  const now = game.time;
  const cur = target.elemTag;
  // Same element refreshes. The reward is for switching, and a Mage holding
  // one button should not be detonating every second.
  if (cur && cur.id !== element && cur.until > now) {
    target.elemTag = null;
    return cur.id;
  }
  target.elemTag = { id: element, until: now + TAG_DURATION, damage: hitDamage };
  return null;
}

/** The mark a target is currently carrying, or null if it has none or it faded. */
export function tagOn(target, now) {
  const t = target && target.elemTag;
  return t && t.until > now ? t : null;
}

/** Colour of a mark, as the renderer wants it. */
export function tagColor(id) {
  return hexToRgb((ELEMENTS[id] || ELEMENTS.fire).color);
}
