// What a talent actually does, in numbers, at the rank you have and the rank
// you would buy next.
//
// The tree used to show a hand-written sentence per node and nothing else.
// That is fine right up until the sentence and the effect table disagree —
// and they did. Warrior's Unstoppable Charge promised "22% harder" against an
// effect of `skillDamage: 0.08`; four other Mastery nodes were off by a
// similar margin. Nobody wrote those numbers down wrong on purpose. They were
// written once, the effects were tuned afterwards, and prose does not get
// recompiled.
//
// So the prose stops carrying the numbers. Each node's `desc` is flavour —
// which skill it touches and roughly how — and everything quantitative on the
// screen is derived from the same `effect` object the game reads at runtime.
// A rebalance now moves the tooltip with it, because there is only one number.

/**
 * How to render each effect key.
 *
 *   label   what it is called on screen
 *   kind    'pct'   a fraction shown as a percentage
 *           'flat'  a whole number
 *           'sec'   seconds
 *           'hps'   health per second
 *           'unique' a mechanic with no meaningful scale — described, not counted
 *   down    true when a *larger* value is a *reduction* (cost, cooldown), so
 *           the sign shown matches what the player experiences
 *   skill   true when the effect applies only to the node's named skill
 *
 * Every key any talent declares must appear here. A smoke check enforces it,
 * because a missing entry is a talent that silently explains nothing.
 */
export const EFFECT_INFO = {
  // --- damage -------------------------------------------------------------
  allDamage: { label: 'All damage', kind: 'pct' },
  meleeDamage: { label: 'Melee damage', kind: 'pct' },
  spellDamage: { label: 'Spell damage', kind: 'pct' },
  bossDamage: { label: 'Damage to bosses', kind: 'pct' },
  dotDamage: { label: 'Damage over time', kind: 'pct' },
  burnDamage: { label: 'Burn damage', kind: 'pct' },
  bleedPct: { label: 'Bleed damage', kind: 'pct' },
  frozenDamage: { label: 'Damage to frozen targets', kind: 'pct' },
  dotDuration: { label: 'Damage-over-time duration', kind: 'sec' },
  slowDuration: { label: 'Slow duration', kind: 'sec' },
  applySlow: { label: 'Slow applied', kind: 'pct' },

  // --- attacking ----------------------------------------------------------
  attackSpeed: { label: 'Attack speed', kind: 'pct' },
  critChance: { label: 'Crit chance', kind: 'pct' },
  critMult: { label: 'Crit damage', kind: 'pct' },
  executeThreshold: { label: 'Execute threshold', kind: 'pct' },
  aoeRadius: { label: 'Area radius', kind: 'pct' },
  extraProjectiles: { label: 'Extra projectiles', kind: 'flat' },

  // --- surviving ----------------------------------------------------------
  maxHp: { label: 'Max health', kind: 'flat' },
  maxHpPct: { label: 'Max health', kind: 'pct' },
  armor: { label: 'Armor', kind: 'pct' },
  damageReduction: { label: 'Damage taken', kind: 'pct', down: true },
  dodge: { label: 'Dodge chance', kind: 'pct' },
  thorns: { label: 'Damage reflected', kind: 'pct' },
  absorb: { label: 'Shield absorb', kind: 'flat' },
  regen: { label: 'Out-of-combat regen', kind: 'hps' },
  lifesteal: { label: 'Lifesteal', kind: 'pct' },
  dotLifesteal: { label: 'Lifesteal from damage over time', kind: 'pct' },
  killHeal: { label: 'Healed per kill', kind: 'flat' },
  healing: { label: 'Healing done', kind: 'pct' },

  // --- resources and cooldowns -------------------------------------------
  resourceMax: { label: 'Max resource', kind: 'flat' },
  resourceRegen: { label: 'Resource regen', kind: 'hps' },
  onHitGain: { label: 'Resource per hit', kind: 'flat' },
  onKillGain: { label: 'Resource per kill', kind: 'flat' },
  costReduction: { label: 'Skill cost', kind: 'pct', down: true },
  cooldownReduction: { label: 'Cooldowns', kind: 'pct', down: true },
  moveSpeed: { label: 'Move speed', kind: 'pct' },

  // --- pets ---------------------------------------------------------------
  petPower: { label: 'Pet damage and health', kind: 'pct' },
  maxPets: { label: 'Extra pet', kind: 'flat' },

  // --- scoped to the node's named skill -----------------------------------
  skillDamage: { label: 'damage', kind: 'pct', skill: true },
  skillRadius: { label: 'radius and range', kind: 'pct', skill: true },
  skillDuration: { label: 'duration', kind: 'sec', skill: true },
  skillCost: { label: 'cost', kind: 'pct', skill: true, down: true },
  skillCooldown: { label: 'cooldown', kind: 'pct', skill: true, down: true },

  totemDuration: { label: 'Totem duration', kind: 'sec' },

  // --- signature mechanics, but still on a dial ---------------------------
  critCdr: { label: 'Cooldowns cut per crit', kind: 'sec', down: true },
  ambushCdr: { label: 'Ambush cooldown', kind: 'sec', down: true },
  maelstrom: { label: 'Chain Lightning cooldown per melee hit', kind: 'sec', down: true },
  blinkShield: { label: 'Shield gained on Blink', kind: 'flat' },
  rapture: { label: 'Resource when a shield breaks', kind: 'flat' },
  corpseExplode: { label: 'Corpse explosion damage', kind: 'flat' },
  smiteDot: { label: 'Smite rot damage', kind: 'hps' },
  soulLink: { label: 'Damage redirected to your fiends', kind: 'pct' },
  atonement: { label: 'Healing dealt as damage', kind: 'pct' },
  guardianSpirit: { label: 'Damage reduction below 25% health', kind: 'pct' },
  cheatDeathRun: { label: 'Revived at', kind: 'pct' },
  doubleStrike: { label: 'Chance to strike twice', kind: 'pct' },
  overload: { label: 'Chance to fire twice', kind: 'pct' },
  jumps: { label: 'Extra chain jumps', kind: 'flat' },
  pierce: { label: 'Extra targets pierced', kind: 'flat' },
  spread: { label: 'Extra enemies infected', kind: 'flat' },

  // --- set-only mechanics -------------------------------------------------
  //
  // These appear on set bonuses rather than on talents, and they are here for
  // the same reason everything else is: the Armoury prints the numbers from
  // this table, so a set bonus retuned in armor.js moves its own description
  // with it. They used to live only in hand-written sentences beside the
  // effect, which is exactly the arrangement that let five talent tooltips
  // drift away from what their talents did.
  //
  // `cond` is the condition the bonus is paid on. It is not a number and does
  // not scale, so it is printed as written rather than computed.
  bloodsurge: { label: 'Melee damage', kind: 'pct', cond: 'scaling with the Rage you hold' },
  bleedBurst: { label: 'Bleed detonation', kind: 'pct', cond: 'when a bleeding enemy dies' },
  spellEcho: { label: 'Chance a damaging skill casts itself again', kind: 'pct' },
  dotBurst: { label: 'Rot detonation', kind: 'pct', cond: 'when it runs its full course' },
  wardedDamage: { label: 'Spell damage', kind: 'pct', cond: 'while a shield of yours holds' },
  exposeWeakness: { label: 'Damage', kind: 'pct', cond: 'to a poisoned target' },
  momentumDamage: { label: 'Damage', kind: 'pct', cond: 'for 4s after a dash' },
  zeal: { label: 'Melee damage per hit taken', kind: 'pct', cond: 'stacking 5 times' },
  sharpshooter: { label: 'Damage', kind: 'pct', cond: 'beyond 12 blocks' },

  // --- mechanics with no dial at all --------------------------------------
  // Single-rank switches: they happen or they do not. There is no number to
  // show, and the node's own sentence already says what happens — so these
  // contribute no row rather than a row that restates the line above it.
  startRank: { kind: 'unique' },
  cheatDeath: { kind: 'unique' },
  rampage: { kind: 'unique' },
  killSpree: { kind: 'unique' },
  vanish: { kind: 'unique' },
  coldSnap: { kind: 'unique' },
  coldBlood: { kind: 'unique' },
  cataclysm: { kind: 'unique' },
  petRebirth: { kind: 'unique' },
  dispersion: { kind: 'unique' },
};

/** `0.184` -> `18%`. Rounded, because a tooltip is read, not audited. */
function pct(v) {
  const n = v * 100;
  return `${n >= 10 || Number.isInteger(n) ? Math.round(n) : n.toFixed(1)}%`;
}

function amount(info, total) {
  switch (info.kind) {
    case 'pct': return pct(Math.abs(total));
    case 'sec': return `${Math.round(total * 10) / 10}s`;
    case 'hps': return `${Math.round(total * 10) / 10} hp/s`;
    default: return String(Math.round(total * 10) / 10);
  }
}

/**
 * One readable line per effect a node carries, at a given rank.
 *
 * Returns `[{ label, value }]`, already signed and already naming the skill
 * for skill-scoped effects. Rank 0 returns what the first point would buy,
 * which is the number a player deciding whether to spend actually wants.
 */
export function talentLines(node, rank, skillName) {
  const at = Math.max(1, rank);           // rank 0 is quoted at its first point
  const out = [];
  for (const [key, per] of Object.entries(node.effect || {})) {
    const info = EFFECT_INFO[key];
    if (!info) continue;
    if (info.kind === 'unique') continue;
    const total = per * at;
    // A reduction reads as a minus even though the effect value is positive,
    // and `healing: -0.05` reads as a minus because it genuinely is one.
    const negative = info.down || total < 0;
    const label = info.skill ? `${skillName || 'This skill'} ${info.label}` : info.label;
    out.push({ label, value: `${negative ? '−' : '+'}${amount(info, total)}` });
  }
  return out;
}

/**
 * A set bonus as one sentence, at the tier it is being worn at.
 *
 * Generated rather than written beside the effect, and that is the whole
 * point: set bonuses are now multiplied by the tier, so a hand-written "+10%
 * melee damage" would tell a player in a full Frostwrought set the number from
 * the Battleworn set they wore at level 1. There is one number and it is the
 * one the game reads.
 *
 * `scale` multiplies everything except counts — an extra demon is an extra
 * demon at every tier.
 */
const COUNTS = new Set(['jumps', 'pierce', 'maxPets', 'extraProjectiles']);

export function setBonusLine(effect, scale = 1) {
  const parts = [];
  for (const [key, per] of Object.entries(effect || {})) {
    const info = EFFECT_INFO[key];
    if (!info || info.kind === 'unique') continue;
    const total = COUNTS.has(key) ? per : per * scale;
    const negative = info.down || total < 0;
    const sign = negative ? '−' : '+';
    const label = info.label.charAt(0).toLowerCase() + info.label.slice(1);
    parts.push(`${sign}${amount(info, total)} ${label}${info.cond ? ` ${info.cond}` : ''}`);
  }
  if (!parts.length) return '';
  const s = parts.join(', ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * What the next point buys, as a short phrase — the one number that decides
 * whether to spend it. Null when the node is maxed.
 */
export function talentNextGain(node, rank, skillName) {
  if (rank >= node.max) return null;
  const now = talentLines(node, rank, skillName);
  const next = talentLines(node, rank + 1, skillName);
  if (rank === 0) return next.map((l) => `${l.label} ${l.value}`.trim()).join(', ');
  const changed = next.filter((l, i) => !now[i] || now[i].value !== l.value);
  if (!changed.length) return null;
  return changed.map((l) => `${l.label} ${l.value}`.trim()).join(', ');
}
