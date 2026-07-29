// Playable classes. Each has its own resource, base stats, a pool of eight
// skills (four of which are equipped at a time) and a three-branch talent tree.
//
// Skill `kind` values are interpreted by src/game/skills.js:
//   projectile | aoe_self | aoe_target | dash | buff | heal | summon | cone |
//   chain | strike | zone
//
// Every skill is available from the first run. Gating them behind wave
// milestones made the picker mostly padlocks for a new player, and the choice
// of four out of ten is the interesting decision — not the wait.

export const RESOURCE = {
  MANA: { key: 'mana', name: 'Mana', color: '#4aa3ff', max: 100, regen: 7, startFull: true },
  RAGE: { key: 'rage', name: 'Rage', color: '#ff5a3c', max: 100, regen: -3, startFull: false, onHitGain: 9, onTakeGain: 6 },
  ENERGY: { key: 'energy', name: 'Energy', color: '#ffd24a', max: 100, regen: 18, startFull: true },
  SOUL: { key: 'soul', name: 'Soul Shards', color: '#a35cff', max: 100, regen: 5, startFull: true, onKillGain: 12 },
  // Hatred neither regenerates on its own nor starts full: it is built by
  // fighting and spent immediately, which is what makes the Demonslayer a
  // class you play forwards.
  HATRED: { key: 'hatred', name: 'Hatred', color: '#ff3ca0', max: 100, regen: 0, startFull: false, onHitGain: 7, onKillGain: 14 },
  // Faith trickles rather than pours, and is topped up by both dealing and
  // taking hits. A Paladin who disengages runs dry, which is the point: the
  // armour exists to let you hold ground, not to let you walk away from it.
  FAITH: { key: 'faith', name: 'Faith', color: '#ffe9a8', max: 110, regen: 3, startFull: true, onHitGain: 5, onTakeGain: 8 },
  // Focus is the most generous pool in the game because the Hunter's limit is
  // never the resource — it is whether there is still room to back into.
  FOCUS: { key: 'focus', name: 'Focus', color: '#8ce06a', max: 100, regen: 22, startFull: true },
};

/** How many skills are equipped at once — four buttons, four keys. */
export const LOADOUT_SIZE = 4;

/**
 * The level each skill in a class's unlock order becomes available.
 *
 * Two at level 1, then one at a time, spread across the whole climb to 60. The
 * point is that a class is not finished at level 1: eleven of its thirteen
 * skills are things you are still working toward, and each one arriving is a
 * reason the next twenty levels matter. The last few are deliberately late —
 * a capstone that arrives at level 30 is a capstone for the second half of
 * nobody's career.
 */
export const SKILL_UNLOCK_LEVELS = [1, 1, 4, 8, 12, 17, 22, 28, 34, 41, 48, 54, 60];

/**
 * What each class opens with.
 *
 * Anything that can heal starts with one attack and one heal, so its opening
 * two slots are the shape the class is actually about. Everything else starts
 * with two attacks — usually one at range and one up close, because a class
 * whose only two options are both melee cannot deal with the first ranged
 * enemy it meets.
 */
const STARTERS = {
  warrior: ['charge', 'whirlwind'],
  mage: ['fireball', 'frostbolt'],
  warlock: ['corruption', 'darkpact'],
  shaman: ['chainlightning', 'ancestral'],
  priest: ['smite', 'renew'],
  rogue: ['shuriken', 'backstab'],
  demonslayer: ['shear', 'glaivethrow'],
  paladin: ['crusaderstrike', 'wordofglory'],
  hunter: ['arcaneshot', 'mendpet'],
};

/**
 * A class's skills in the order they unlock: its two starters, then the rest
 * in the order they are declared. Computed once per class rather than on every
 * menu redraw.
 */
const UNLOCK_ORDER = new Map();
export function unlockOrder(cls) {
  let order = UNLOCK_ORDER.get(cls.id);
  if (order) return order;
  const starters = STARTERS[cls.id] || [];
  const byId = new Map(cls.skills.map((s) => [s.id, s]));
  order = [];
  for (const id of starters) {
    const s = byId.get(id);
    if (s && !order.includes(s)) order.push(s);
  }
  for (const s of cls.skills) if (!order.includes(s)) order.push(s);
  UNLOCK_ORDER.set(cls.id, order);
  return order;
}

/** The level at which a class's `n`-th skill unlocks. */
export function unlockLevelForSlot(n) {
  return SKILL_UNLOCK_LEVELS[Math.min(n, SKILL_UNLOCK_LEVELS.length - 1)] || 1;
}

/** The level a specific skill unlocks at, or 1 if it is not in the order. */
export function unlockLevelOf(cls, skillId) {
  const i = unlockOrder(cls).findIndex((s) => s.id === skillId);
  return i < 0 ? 1 : unlockLevelForSlot(i);
}

export const CLASSES = [
  // -------------------------------------------------------------------------
  {
    id: 'warrior',
    name: 'Warrior',
    role: 'Melee Bruiser',
    tagline: 'Wade in, hit hard, refuse to die.',
    color: '#c8563c',
    accent: '#ffb27a',
    resource: RESOURCE.RAGE,
    base: { hp: 150, armor: 0.26, speed: 5.2, attackDamage: 26, attackSpeed: 1.55, attackRange: 3.4, critChance: 0.08, critMult: 1.9 },
    weapon: { type: 'sword', tile: 'METAL', color: '#d8dbe2', length: 1.1 },
    difficulty: 1,
    skills: [
      {
        id: 'charge', name: 'Charge', kind: 'dash', cost: 15, cooldown: 7, icon: '⚡',
        desc: 'Rush forward, knocking aside and damaging everything in your path.',
        power: { distance: 11, speed: 34, damage: 30, knockback: 12, radius: 1.8 },
      },
      {
        id: 'whirlwind', name: 'Whirlwind', kind: 'aoe_self', cost: 25, cooldown: 5, icon: '🌀',
        desc: 'Spin, striking all nearby enemies. Hits again after a short delay.',
        power: { radius: 4.2, damage: 34, ticks: 2, tickDelay: 0.28, knockback: 5 },
      },
      {
        id: 'shieldwall', name: 'Shield Wall', kind: 'buff', cost: 20, cooldown: 18, icon: '🛡',
        desc: 'Brace for 6s: take 55% less damage and become immune to knockback.',
        power: { duration: 6, damageTaken: 0.45, rooted: false },
      },
      {
        id: 'execute', name: 'Execute', kind: 'strike', cost: 35, cooldown: 9, icon: '🗡',
        desc: 'A brutal blow that deals triple damage to enemies below 35% health.',
        power: { damage: 70, range: 4.0, executeThreshold: 0.35, executeMult: 3, arc: 0.9 },
      },
      {
        id: 'thunderclap', name: 'Thunder Clap', kind: 'aoe_self', cost: 22, cooldown: 8, icon: '💥',
        desc: 'Slam the ground: wide damage that slows everything caught in it.',
        power: { radius: 7.5, damage: 30, slow: 0.45, slowDuration: 4, knockback: 3, color: '#ffd08a' },
      },
      {
        id: 'rend', name: 'Rend', kind: 'strike', cost: 18, cooldown: 6, icon: '🩸',
        desc: 'Open a deep wound that bleeds for heavy damage over 8s.',
        power: { damage: 30, range: 3.8, arc: 1.0, dot: { dps: 16, duration: 8 } },
      },
      {
        id: 'heroicleap', name: 'Heroic Leap', kind: 'dash', cost: 24, cooldown: 12, icon: '🦅',
        desc: 'Hurl yourself forward and crash down, flattening the landing zone.',
        power: { distance: 15, speed: 30, damage: 55, knockback: 10, radius: 3.4 },
      },
      {
        id: 'battlecry', name: 'Battle Cry', kind: 'buff', cost: 30, cooldown: 26, icon: '📣',
        desc: 'Roar for 10s: +35% damage and +25% attack speed.',
        power: { duration: 10, damageBonus: 0.35, attackSpeedBonus: 0.25 },
      },
      {
        id: 'bladestorm', name: 'Bladestorm', kind: 'aoe_self', cost: 34, cooldown: 16, icon: '🌪',
        desc: 'Become a whirling storm of steel, striking everything around you four times.',
        power: { radius: 5.4, damage: 40, ticks: 4, tickDelay: 0.30, knockback: 3 },
      },
      {
        id: 'avatar', name: 'Avatar', kind: 'buff', cost: 36, cooldown: 40, icon: '🗿',
        desc: 'Become a titan for 12s: +50% damage and 30% less damage taken.',
        power: { duration: 12, damageBonus: 0.50, damageTaken: 0.70, rooted: false },
      },
      {
        id: 'shockwave', name: 'Shockwave', kind: 'cone', cost: 26, cooldown: 10, icon: '〰',
        desc: 'A cone of splitting earth that staggers everything it crosses.',
        power: { damage: 58, range: 12, arc: 0.75, stun: 0.9, color: '#e0714f' },
      },
      {
        id: 'berserk', name: 'Berserker Rage', kind: 'buff', cost: 22, cooldown: 20, icon: '😤',
        desc: 'For 8s you take 20% more damage but deal 55% more.',
        power: { duration: 8, damageBonus: 0.55, damageTaken: 1.20 },
      },
      {
        id: 'earthsplitter', name: 'Earthsplitter', kind: 'aoe_target', cost: 34, cooldown: 12, icon: '⛰',
        desc: 'Bring the ground up under a target area.',
        power: { damage: 78, radius: 5.2, range: 16, delay: 0.5, knockback: 9, color: '#c9a06a' },
      },
    ],
    talents: [
      {
        name: 'Arms', school: 'physical', color: '#e0714f', nodes: [
          { id: 'w_a1', name: 'Heavy Blade', desc: '+6% melee damage per rank.', max: 8, effect: { meleeDamage: 0.06 } },
          { id: 'w_a2', name: 'Deep Wounds', desc: 'Crits apply a bleed for 30% weapon damage over 3s.', max: 4, effect: { bleedPct: 0.30 } },
          { id: 'w_a3', name: 'Sharpen', desc: '+3% crit chance per rank.', max: 6, effect: { critChance: 0.03 } },
          { id: 'w_a4', name: 'Overpower', desc: 'Execute threshold +8% per rank.', max: 4, effect: { executeThreshold: 0.08 } },
          { id: 'w_a5', name: 'Cleave', desc: 'Area effects reach 8% further per rank.', max: 5, effect: { aoeRadius: 0.08 } },
          { id: 'w_a6', name: 'Bladestorm', desc: '+15% damage and +15% attack speed.', max: 1, effect: { allDamage: 0.15, attackSpeed: 0.15 } },
        ],
      },
      {
        name: 'Fury', school: 'physical', color: '#ff9d5c', nodes: [
          { id: 'w_f1', name: 'Frenzy', desc: '+5% attack speed per rank.', max: 8, effect: { attackSpeed: 0.05 } },
          { id: 'w_f2', name: 'Blood Craze', desc: 'Heal 3% of damage dealt per rank.', max: 5, effect: { lifesteal: 0.03 } },
          { id: 'w_f3', name: 'Unbridled', desc: '+15 max Rage and +2 Rage per hit, per rank.', max: 4, effect: { resourceMax: 15, onHitGain: 2 } },
          { id: 'w_f4', name: 'Rampage', desc: 'Each kill grants +6% move speed for 4s, stacking 5x.', max: 1, effect: { rampage: 1 } },
          { id: 'w_f5', name: 'Butchery', desc: 'Restore 8 health per kill, per rank.', max: 5, effect: { killHeal: 8 } },
          { id: 'w_f6', name: 'Undying Rage', desc: 'Take 10% less damage and gain 6% lifesteal.', max: 1, effect: { damageReduction: 0.10, lifesteal: 0.06 } },
        ],
      },
      {
        name: 'Protection', school: 'frost', color: '#8fb3ff', nodes: [
          { id: 'w_p1', name: 'Toughness', desc: '+22 max health per rank.', max: 8, effect: { maxHp: 22 } },
          { id: 'w_p2', name: 'Plate Skin', desc: '+3% armor per rank.', max: 6, effect: { armor: 0.03 } },
          { id: 'w_p3', name: 'Second Wind', desc: 'Regenerate 1 hp/s per rank out of combat.', max: 4, effect: { regen: 1 } },
          { id: 'w_p4', name: 'Last Stand', desc: 'Survive a lethal hit once per wave at 25% hp.', max: 1, effect: { cheatDeath: 1 } },
          { id: 'w_p5', name: 'Spiked Armor', desc: 'Reflect 10% of damage taken per rank.', max: 5, effect: { thorns: 0.10 } },
          { id: 'w_p6', name: 'Giant Slayer', desc: '+25% damage to bosses, -8% damage taken.', max: 1, effect: { bossDamage: 0.25, damageReduction: 0.08 } },
        ],
      },
      // Mastery. Every node here names one skill and does nothing at all unless
      // that skill is one of your four. It is the branch that makes the loadout
      // and the tree one decision instead of two: the generic branches make
      // your character better, this one makes a *build*.
      {
        name: 'Mastery', school: 'holy', color: '#ffd24a', nodes: [
          { id: 'w_m1', name: 'Unstoppable Charge', skill: 'charge', desc: 'Charge hits 22% harder and reaches 12% further, per rank.', max: 4, effect: { skillDamage: 0.08, skillRadius: 0.12 } },
          { id: 'w_m2', name: 'Endless Whirl', skill: 'whirlwind', desc: 'Whirlwind costs 12% less and its cooldown drops 8%, per rank.', max: 5, effect: { skillCost: 0.12, skillCooldown: 0.08 } },
          { id: 'w_m3', name: 'Bloodletting', skill: 'rend', desc: 'Rend bleeds 25% harder and 1s longer, per rank.', max: 5, effect: { skillDamage: 0.09, skillDuration: 1 } },
          { id: 'w_m4', name: 'Headsman', skill: 'execute', desc: 'Execute hits 20% harder and costs 10% less, per rank.', max: 4, effect: { skillDamage: 0.07, skillCost: 0.10 } },
          { id: 'w_m5', name: 'Iron Resolve', skill: 'shieldwall', desc: 'Shield Wall lasts 1.5s longer and its cooldown drops 9%, per rank.', max: 4, effect: { skillDuration: 1.5, skillCooldown: 0.09 } },
          { id: 'w_m6', name: 'Thunderlord', skill: 'thunderclap', desc: 'Thunder Clap starts at rank 3, reaches 25% wider and hits 30% harder.', max: 1, effect: { startRank: 3, skillRadius: 0.25, skillDamage: 0.10 } },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: 'mage',
    name: 'Mage',
    role: 'Ranged Burst',
    tagline: 'Delete the pack before it reaches you.',
    color: '#4aa3ff',
    accent: '#a8e0ff',
    resource: RESOURCE.MANA,
    base: { hp: 92, armor: 0.06, speed: 5.0, attackDamage: 20, attackSpeed: 1.9, attackRange: 40, critChance: 0.10, critMult: 2.1 },
    weapon: { type: 'staff', tile: 'CRYSTAL', color: '#9fd8ff', length: 1.35, projectile: { speed: 34, color: '#6ec8ff', size: 0.28, gravity: 0 } },
    difficulty: 2,
    skills: [
      {
        id: 'fireball', name: 'Fireball', kind: 'projectile', cost: 18, cooldown: 1.6, icon: '🔥',
        desc: 'Hurl a fireball that explodes on impact.',
        power: { damage: 46, speed: 26, radius: 3.4, gravity: 2, color: '#ff8a3c', size: 0.42, burn: 12 },
      },
      {
        id: 'frostnova', name: 'Frost Nova', kind: 'aoe_self', cost: 22, cooldown: 9, icon: '❄',
        desc: 'Freeze nearby enemies solid for 2.5s and chill them afterwards.',
        power: { radius: 6, damage: 18, freeze: 2.5, slow: 0.45, slowDuration: 3, color: '#8fe3ff' },
      },
      {
        id: 'blink', name: 'Blink', kind: 'dash', cost: 14, cooldown: 6, icon: '✦',
        desc: 'Teleport 9 blocks forward, passing through enemies.',
        power: { distance: 9, speed: 90, damage: 0, phase: true, invuln: 0.35 },
      },
      {
        id: 'meteor', name: 'Meteor', kind: 'aoe_target', cost: 40, cooldown: 14, icon: '☄',
        desc: 'Call a meteor onto your target area for massive damage.',
        power: { damage: 120, radius: 6.5, delay: 1.0, range: 28, burn: 20, color: '#ff6a2c' },
      },
      {
        id: 'arcaneorb', name: 'Arcane Orb', kind: 'chain', cost: 24, cooldown: 5, icon: '🔮',
        desc: 'An orb that bounces between four targets, fading as it goes.',
        power: { damage: 44, jumps: 4, range: 24, jumpRange: 9, falloff: 0.85, color: '#c98fff' },
      },
      {
        id: 'flamestrike', name: 'Flamestrike', kind: 'aoe_target', cost: 28, cooldown: 8, icon: '🌋',
        desc: 'A pillar of flame at the targeted spot that sets everything alight.',
        power: { damage: 66, radius: 5.0, delay: 0.7, range: 26, burn: 26, color: '#ff9a4c' },
      },
      {
        id: 'blizzard', name: 'Blizzard', kind: 'zone', cost: 34, cooldown: 13, icon: '🌨',
        desc: 'A freezing storm that grinds down and slows anything inside it for 7s.',
        power: { radius: 6.5, dps: 30, duration: 7, slow: 0.45, range: 26, delay: 0.5, color: '#8fe3ff' },
      },
      {
        id: 'timewarp', name: 'Time Warp', kind: 'buff', cost: 32, cooldown: 30, icon: '⏳',
        desc: 'Bend time for 8s: +40% move and +40% attack speed.',
        power: { duration: 8, moveSpeed: 0.40, attackSpeedBonus: 0.40 },
      },
      {
        id: 'pyroblast', name: 'Pyroblast', kind: 'projectile', cost: 42, cooldown: 9, icon: '☄',
        desc: 'A slow, enormous ball of fire. Everything it touches keeps burning.',
        power: { damage: 135, speed: 22, radius: 4.6, gravity: 1.5, burn: 34, color: '#ff6a2c', size: 0.56 },
      },
      {
        id: 'iceblock', name: 'Ice Block', kind: 'buff', cost: 20, cooldown: 34, icon: '🧊',
        desc: 'Encase yourself for 4s, taking 90% less damage.',
        power: { duration: 4, damageTaken: 0.10, rooted: false },
      },
      {
        id: 'frostbolt', name: 'Frostbolt', kind: 'projectile', cost: 16, cooldown: 2, icon: '❄',
        desc: 'A shard of ice that slows whatever it hits.',
        power: { damage: 46, speed: 46, radius: 1.4, slow: 0.35, slowDuration: 3, color: '#8fe3ff', size: 0.24 },
      },
      {
        id: 'manashield', name: 'Mana Shield', kind: 'buff', cost: 24, cooldown: 20, icon: '🔵',
        desc: 'Absorb 140 damage for 10s.',
        power: { duration: 10, absorb: 140 },
      },
      {
        id: 'arcaneblast', name: 'Arcane Blast', kind: 'aoe_self', cost: 30, cooldown: 7, icon: '💠',
        desc: 'A ring of raw arcane force that throws everything back.',
        power: { radius: 6.4, damage: 54, knockback: 10, color: '#c98fff' },
      },
    ],
    talents: [
      {
        name: 'Fire', school: 'fire', color: '#ff8a3c', nodes: [
          { id: 'm_f1', name: 'Ignite', desc: 'Burn effects deal 16% more damage per rank.', max: 6, effect: { burnDamage: 0.16 } },
          { id: 'm_f2', name: 'Combustion', desc: '+4% crit chance per rank.', max: 5, effect: { critChance: 0.04 } },
          { id: 'm_f3', name: 'Pyroclasm', desc: 'Explosion radius +8% per rank.', max: 5, effect: { aoeRadius: 0.08 } },
          { id: 'm_f4', name: 'Living Bomb', desc: 'Enemies killed by fire explode for 40 damage.', max: 1, effect: { corpseExplode: 40 } },
          { id: 'm_f5', name: 'Conflagrate', desc: '+8% spell damage per rank.', max: 6, effect: { spellDamage: 0.08 } },
          { id: 'm_f6', name: 'Firelord', desc: '+25% damage to bosses and +20% crit damage.', max: 1, effect: { bossDamage: 0.25, critMult: 0.20 } },
        ],
      },
      {
        name: 'Frost', school: 'frost', color: '#8fe3ff', nodes: [
          { id: 'm_i1', name: 'Permafrost', desc: 'Slows last 0.5s longer per rank.', max: 5, effect: { slowDuration: 0.5 } },
          { id: 'm_i2', name: 'Ice Barrier', desc: 'Gain a 30 point absorb shield per rank on Blink.', max: 4, effect: { blinkShield: 30 } },
          { id: 'm_i3', name: 'Shatter', desc: '+25% damage to frozen targets per rank.', max: 5, effect: { frozenDamage: 0.25 } },
          { id: 'm_i4', name: 'Cold Snap', desc: 'Frost Nova also resets Blink.', max: 1, effect: { coldSnap: 1 } },
          { id: 'm_i5', name: 'Frozen Core', desc: '+16 max health and +2% armor per rank.', max: 6, effect: { maxHp: 16, armor: 0.02 } },
          { id: 'm_i6', name: 'Absolute Zero', desc: 'Take 12% less damage and reflect 15% of it.', max: 1, effect: { damageReduction: 0.12, thorns: 0.15 } },
        ],
      },
      {
        name: 'Arcane', school: 'arcane', color: '#c98fff', nodes: [
          { id: 'm_a1', name: 'Clarity', desc: '+3 mana regen per rank.', max: 6, effect: { resourceRegen: 3 } },
          { id: 'm_a2', name: 'Arcane Mind', desc: '+15 max mana per rank.', max: 6, effect: { resourceMax: 15 } },
          { id: 'm_a3', name: 'Focus', desc: '-5% skill cooldowns per rank.', max: 6, effect: { cooldownReduction: 0.05 } },
          { id: 'm_a4', name: 'Missile Barrage', desc: 'Basic attack fires 2 extra bolts.', max: 1, effect: { extraProjectiles: 2 } },
          { id: 'm_a5', name: 'Frugality', desc: 'Skills cost 5% less per rank.', max: 5, effect: { costReduction: 0.05 } },
          { id: 'm_a6', name: 'Time Anomaly', desc: 'Kills restore 10 mana and speed you up.', max: 1, effect: { onKillGain: 10, moveSpeed: 0.08 } },
        ],
      },
      // Mastery. Every node here names one skill and does nothing at all unless
      // that skill is one of your four. It is the branch that makes the loadout
      // and the tree one decision instead of two: the generic branches make
      // your character better, this one makes a *build*.
      {
        name: 'Mastery', school: 'holy', color: '#ffd24a', nodes: [
          { id: 'm_m1', name: 'Improved Fireball', skill: 'fireball', desc: 'Fireball hits 18% harder and costs 10% less, per rank.', max: 6, effect: { skillDamage: 0.06, skillCost: 0.10 } },
          { id: 'm_m2', name: 'Deep Freeze', skill: 'frostnova', desc: 'Frost Nova reaches 14% wider and its cooldown drops 8%, per rank.', max: 5, effect: { skillRadius: 0.14, skillCooldown: 0.08 } },
          { id: 'm_m3', name: 'Cataclysm', skill: 'meteor', desc: 'Meteor hits 30% harder and lands 12% wider, per rank.', max: 5, effect: { skillDamage: 0.10, skillRadius: 0.12 } },
          { id: 'm_m4', name: 'Perpetual Blizzard', skill: 'blizzard', desc: 'Blizzard lasts 1.2s longer and ticks 22% harder, per rank.', max: 4, effect: { skillDuration: 1.2, skillDamage: 0.08 } },
          { id: 'm_m5', name: 'Slipstream', skill: 'blink', desc: 'Blink\'s cooldown drops 12% and it costs 15% less, per rank.', max: 4, effect: { skillCooldown: 0.12, skillCost: 0.15 } },
          { id: 'm_m6', name: 'Sun King', skill: 'pyroblast', desc: 'Pyroblast starts at rank 3 and hits 40% harder.', max: 1, effect: { startRank: 3, skillDamage: 0.14 } },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: 'warlock',
    name: 'Warlock',
    role: 'Damage over Time / Pets',
    tagline: 'Rot the horde and let your demon finish it.',
    color: '#a35cff',
    accent: '#d9b3ff',
    resource: RESOURCE.SOUL,
    base: { hp: 108, armor: 0.10, speed: 4.9, attackDamage: 17, attackSpeed: 1.7, attackRange: 36, critChance: 0.08, critMult: 1.9 },
    weapon: { type: 'staff', tile: 'OBSIDIAN', color: '#b98cff', length: 1.3, projectile: { speed: 28, color: '#b06cff', size: 0.3, gravity: 0 } },
    difficulty: 2,
    skills: [
      {
        id: 'corruption', name: 'Corruption', kind: 'projectile', cost: 14, cooldown: 1.2, icon: '☠',
        desc: 'Infect a target with rot: heavy damage over 6s that spreads on death.',
        power: { damage: 10, speed: 30, radius: 1.2, dot: { dps: 16, duration: 6 }, spread: 1, color: '#8f4dff', size: 0.3 },
      },
      {
        id: 'drainlife', name: 'Drain Life', kind: 'cone', cost: 20, cooldown: 6, icon: '🩸',
        desc: 'Siphon life from everything in front of you, healing for 60% of it.',
        power: { damage: 52, range: 11, angle: 0.5, lifesteal: 0.6, color: '#c0392b' },
      },
      {
        id: 'summonimp', name: 'Summon Fiend', kind: 'summon', cost: 30, cooldown: 20, icon: '👹',
        desc: 'Summon a fiend that fights for you for 25s. Stacks up to 3.',
        power: { duration: 25, hp: 70, damage: 18, maxPets: 3, speed: 6.0 },
      },
      {
        id: 'shadowfury', name: 'Shadowfury', kind: 'aoe_target', cost: 34, cooldown: 13, icon: '🌑',
        desc: 'Erupt shadow at a location, stunning and detonating all rot effects.',
        power: { damage: 60, radius: 6, delay: 0.5, range: 22, stun: 2, detonate: 1, color: '#6a2fb5' },
      },
      {
        id: 'chaosbolt', name: 'Chaos Bolt', kind: 'projectile', cost: 26, cooldown: 4, icon: '💜',
        desc: 'A slow bolt of raw chaos that detonates for very heavy damage.',
        power: { damage: 86, speed: 24, radius: 2.6, color: '#b06cff', size: 0.44 },
      },
      {
        id: 'howl', name: 'Howl of Terror', kind: 'aoe_self', cost: 22, cooldown: 12, icon: '😱',
        desc: 'A scream that roots everything around you for 2.5s.',
        power: { radius: 8.5, damage: 24, root: 2.5, color: '#6a2fb5' },
      },
      {
        id: 'rainoffire', name: 'Rain of Fire', kind: 'zone', cost: 34, cooldown: 12, icon: '🔥',
        desc: 'Fel fire pours onto the targeted ground for 7s.',
        power: { radius: 6.0, dps: 34, duration: 7, range: 24, delay: 0.5, color: '#ff6a2c' },
      },
      {
        id: 'soulharvest', name: 'Soul Harvest', kind: 'heal', cost: 28, cooldown: 22, icon: '💀',
        desc: 'Devour stolen souls: heal 45 instantly and 9 hp/s for 8s.',
        power: { instant: 45, healPerSecond: 9, duration: 8 },
      },
      {
        id: 'unstable', name: 'Unstable Affliction', kind: 'projectile', cost: 30, cooldown: 6, icon: '🧪',
        desc: 'A curse that eats a target alive for 10s and spreads when it dies.',
        power: { damage: 20, speed: 32, radius: 1.6, dot: { dps: 30, duration: 10 }, spread: 1, color: '#8f4dff', size: 0.32 },
      },
      {
        id: 'demongate', name: 'Demonic Gateway', kind: 'dash', cost: 18, cooldown: 14, icon: '🌀',
        desc: 'Step through the void, appearing 12 blocks away and briefly untouchable.',
        power: { distance: 12, speed: 90, damage: 0, phase: true, invuln: 0.6 },
      },
      {
        id: 'felflame', name: 'Fel Flame', kind: 'projectile', cost: 16, cooldown: 2.5, icon: '🟢',
        desc: 'A bolt of fel fire that burns on contact.',
        power: { damage: 40, speed: 42, radius: 1.6, burn: 12, color: '#9dff7a', size: 0.24 },
      },
      {
        id: 'darkpact', name: 'Dark Pact', kind: 'heal', cost: 26, cooldown: 18, icon: '🖤',
        desc: 'Tear health from the void: a large instant mend.',
        power: { instant: 70, healPerSecond: 0, duration: 0 },
      },
      {
        id: 'doomguard', name: 'Doomguard', kind: 'summon', cost: 36, cooldown: 30, icon: '👿',
        desc: 'Call a greater fiend that fights until it falls.',
        power: { hp: 320, damage: 38, duration: 40, maxPets: 1, speed: 6.2, color: '#a35cff' },
      },
    ],
    talents: [
      {
        name: 'Affliction', school: 'shadow', color: '#8f4dff', nodes: [
          { id: 'k_a1', name: 'Virulence', desc: 'Damage-over-time effects tick 10% harder per rank.', max: 8, effect: { dotDamage: 0.10 } },
          { id: 'k_a2', name: 'Contagion', desc: 'Rot spreads to 1 extra enemy per rank on death.', max: 3, effect: { spread: 1 } },
          { id: 'k_a3', name: 'Siphon', desc: 'DoTs heal you for 5% of their damage per rank.', max: 4, effect: { dotLifesteal: 0.05 } },
          { id: 'k_a4', name: 'Unstable Rot', desc: 'Rot lasts 3s longer and cannot be cleansed.', max: 1, effect: { dotDuration: 3 } },
          { id: 'k_a5', name: 'Pandemic', desc: 'Rot lasts 0.8s longer per rank.', max: 6, effect: { dotDuration: 0.8 } },
          { id: 'k_a6', name: 'Soul Rot', desc: '+25% boss damage; kills restore 10 health.', max: 1, effect: { bossDamage: 0.25, killHeal: 10 } },
        ],
      },
      {
        name: 'Demonology', school: 'shadow', color: '#ff6bb5', nodes: [
          { id: 'k_d1', name: 'Fel Bond', desc: 'Fiends gain +16% health and damage per rank.', max: 8, effect: { petPower: 0.16 } },
          { id: 'k_d2', name: 'Master Summoner', desc: '+1 max Fiend per rank.', max: 3, effect: { maxPets: 1 } },
          { id: 'k_d3', name: 'Soul Link', desc: 'Redirect 8% of damage taken to your fiends per rank.', max: 4, effect: { soulLink: 0.08 } },
          { id: 'k_d4', name: 'Demonic Rebirth', desc: 'Fiends resummon free when they die (30s).', max: 1, effect: { petRebirth: 1 } },
          { id: 'k_d5', name: 'Demon Skin', desc: '+18 max health and +2% armor per rank.', max: 6, effect: { maxHp: 18, armor: 0.02 } },
          { id: 'k_d6', name: 'Metamorphosis', desc: '+18% damage and 10% lifesteal.', max: 1, effect: { allDamage: 0.18, lifesteal: 0.10 } },
        ],
      },
      {
        name: 'Destruction', school: 'fire', color: '#ff8a3c', nodes: [
          { id: 'k_s1', name: 'Ruin', desc: '+10% crit damage per rank.', max: 6, effect: { critMult: 0.10 } },
          { id: 'k_s2', name: 'Backdraft', desc: '-6% cooldowns per rank.', max: 5, effect: { cooldownReduction: 0.06 } },
          { id: 'k_s3', name: 'Harvester', desc: 'Kills restore +6 Soul Shards per rank.', max: 4, effect: { onKillGain: 6 } },
          { id: 'k_s4', name: 'Cataclysm', desc: 'Shadowfury radius +50% and it always crits.', max: 1, effect: { cataclysm: 1 } },
          { id: 'k_s5', name: 'Devastation', desc: '+7% spell damage per rank.', max: 8, effect: { spellDamage: 0.07 } },
          { id: 'k_s6', name: 'Soulfire', desc: 'Fire and shadow burn 40% hotter; area +15%.', max: 1, effect: { burnDamage: 0.40, aoeRadius: 0.15 } },
        ],
      },
      // Mastery. Every node here names one skill and does nothing at all unless
      // that skill is one of your four. It is the branch that makes the loadout
      // and the tree one decision instead of two: the generic branches make
      // your character better, this one makes a *build*.
      {
        name: 'Mastery', school: 'holy', color: '#ffd24a', nodes: [
          { id: 'k_m1', name: 'Festering Corruption', skill: 'corruption', desc: 'Corruption ticks 26% harder and lasts 1s longer, per rank.', max: 6, effect: { skillDamage: 0.09, skillDuration: 1 } },
          { id: 'k_m2', name: 'Endless Drain', skill: 'drainlife', desc: 'Drain Life costs 12% less and its cooldown drops 9%, per rank.', max: 5, effect: { skillCost: 0.12, skillCooldown: 0.09 } },
          { id: 'k_m3', name: 'Greater Fiend', skill: 'summonimp', desc: 'Your Fiend is 25% stronger and arrives 10% sooner, per rank.', max: 5, effect: { skillDamage: 0.09, skillCooldown: 0.10 } },
          { id: 'k_m4', name: 'Cataclysmic Rain', skill: 'rainoffire', desc: 'Rain of Fire covers 15% more ground and burns 24% harder, per rank.', max: 4, effect: { skillRadius: 0.15, skillDamage: 0.08 } },
          { id: 'k_m5', name: 'Unstable Mind', skill: 'unstable', desc: 'Unstable Affliction hits 28% harder and costs 10% less, per rank.', max: 4, effect: { skillDamage: 0.10, skillCost: 0.10 } },
          { id: 'k_m6', name: 'Lord of Chaos', skill: 'chaosbolt', desc: 'Chaos Bolt starts at rank 3 and hits 35% harder.', max: 1, effect: { startRank: 3, skillDamage: 0.12 } },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: 'shaman',
    name: 'Shaman',
    role: 'Elemental / Totems',
    tagline: 'Chain lightning through the pack, drop a totem, keep moving.',
    color: '#2fd4a8',
    accent: '#9dffe0',
    resource: RESOURCE.MANA,
    base: { hp: 118, armor: 0.14, speed: 5.1, attackDamage: 22, attackSpeed: 1.6, attackRange: 26, critChance: 0.09, critMult: 2.0 },
    weapon: { type: 'axe', tile: 'GOLD', color: '#ffd98a', length: 1.15, projectile: { speed: 40, color: '#7ef0ff', size: 0.26, gravity: 0 } },
    difficulty: 2,
    skills: [
      {
        id: 'chainlightning', name: 'Chain Lightning', kind: 'chain', cost: 22, cooldown: 3.5, icon: '⚡',
        desc: 'Lightning arcs to 4 nearby enemies, losing 20% damage per jump.',
        power: { damage: 48, jumps: 4, range: 22, jumpRange: 9, falloff: 0.8, color: '#7ef0ff' },
      },
      {
        id: 'earthshock', name: 'Earth Shock', kind: 'aoe_self', cost: 20, cooldown: 7, icon: '🪨',
        desc: 'Shockwave that damages and roots enemies around you for 2s.',
        power: { radius: 6.5, damage: 40, root: 2, knockback: 3, color: '#c9a06a' },
      },
      {
        id: 'healingtotem', name: 'Healing Totem', kind: 'summon', cost: 26, cooldown: 16, icon: '🌿',
        desc: 'Plant a totem that heals you for 9 hp/s within 8 blocks for 14s.',
        power: { duration: 14, totem: 'heal', healPerSecond: 9, radius: 8, hp: 40 },
      },
      {
        id: 'stormstrike', name: 'Stormstrike', kind: 'strike', cost: 18, cooldown: 5, icon: '🌩',
        desc: 'Charged melee blow that also zaps two extra targets.',
        power: { damage: 58, range: 4.2, arc: 1.1, chain: 2, chainDamage: 28, color: '#7ef0ff' },
      },
      {
        id: 'lavaburst', name: 'Lava Burst', kind: 'projectile', cost: 24, cooldown: 5, icon: '🌋',
        desc: 'A molten bolt that erupts on impact and sets the target burning.',
        power: { damage: 70, speed: 30, radius: 3.0, burn: 18, color: '#ff7a3c', size: 0.38 },
      },
      {
        id: 'searingtotem', name: 'Searing Totem', kind: 'summon', cost: 24, cooldown: 18, icon: '🗿',
        desc: 'A totem that scorches everything within 10 blocks for 16s.',
        power: { duration: 16, totem: 'fire', damagePerSecond: 24, radius: 10, hp: 45 },
      },
      {
        id: 'thunderstorm', name: 'Thunderstorm', kind: 'aoe_self', cost: 30, cooldown: 11, icon: '⛈',
        desc: 'Call down a storm that blasts everything around you away.',
        power: { radius: 9, damage: 56, knockback: 10, color: '#7ef0ff' },
      },
      {
        id: 'ghostwolf', name: 'Spirit Wolf', kind: 'buff', cost: 20, cooldown: 20, icon: '🐺',
        desc: 'Take spirit form for 8s: +50% move speed and 25% dodge.',
        power: { duration: 8, moveSpeed: 0.5, dodge: 0.25 },
      },
      {
        id: 'elementalblast', name: 'Elemental Blast', kind: 'projectile', cost: 34, cooldown: 8, icon: '💠',
        desc: 'All four elements at once, detonating on impact.',
        power: { damage: 110, speed: 34, radius: 4.0, burn: 20, color: '#7ef0ff', size: 0.44 },
      },
      {
        id: 'spiritlink', name: 'Spirit Link', kind: 'heal', cost: 30, cooldown: 24, icon: '🔗',
        desc: 'Bind your spirit to the earth: heal 60 instantly and 12 hp/s for 8s.',
        power: { instant: 60, healPerSecond: 12, duration: 8 },
      },
      {
        id: 'frostshock', name: 'Frost Shock', kind: 'projectile', cost: 18, cooldown: 4, icon: '🧊',
        desc: 'A bolt of ice that roots what it hits.',
        power: { damage: 44, speed: 44, radius: 1.4, freeze: 1.6, color: '#8fe3ff', size: 0.24 },
      },
      {
        id: 'ancestral', name: 'Ancestral Spirit', kind: 'heal', cost: 28, cooldown: 20, icon: '🌀',
        desc: 'A surge of ancestral healing over 6s.',
        power: { instant: 30, healPerSecond: 14, duration: 6 },
      },
      {
        id: 'earthquake', name: 'Earthquake', kind: 'zone', cost: 34, cooldown: 14, icon: '🌋',
        desc: 'The ground itself turns against them for 8s.',
        power: { radius: 7.0, dps: 32, duration: 8, range: 18, delay: 0.4, slow: 0.3, color: '#c9a06a' },
      },
    ],
    talents: [
      {
        name: 'Elemental', school: 'storm', color: '#7ef0ff', nodes: [
          { id: 's_e1', name: 'Concussion', desc: '+7% spell damage per rank.', max: 7, effect: { spellDamage: 0.07 } },
          { id: 's_e2', name: 'Elemental Focus', desc: '+4% crit chance per rank.', max: 5, effect: { critChance: 0.04 } },
          { id: 's_e3', name: 'Storm Reach', desc: 'Chain Lightning gains +1 jump per rank.', max: 4, effect: { jumps: 1 } },
          { id: 's_e4', name: 'Overload', desc: 'Chain Lightning has a 30% chance to fire twice.', max: 1, effect: { overload: 0.3 } },
          { id: 's_e5', name: 'Elemental Reach', desc: 'Area effects reach 8% further per rank.', max: 5, effect: { aoeRadius: 0.08 } },
          { id: 's_e6', name: 'Ascendance', desc: '+20% crit damage and -10% cooldowns.', max: 1, effect: { critMult: 0.20, cooldownReduction: 0.10 } },
        ],
      },
      {
        name: 'Enhancement', school: 'physical', color: '#ffd98a', nodes: [
          { id: 's_h1', name: 'Flurry', desc: '+6% attack speed per rank.', max: 7, effect: { attackSpeed: 0.06 } },
          { id: 's_h2', name: 'Windfury', desc: '15% chance per rank for melee to strike twice.', max: 3, effect: { doubleStrike: 0.15 } },
          { id: 's_h3', name: 'Ghost Wolf', desc: '+5% move speed per rank.', max: 5, effect: { moveSpeed: 0.05 } },
          { id: 's_h4', name: 'Maelstrom', desc: 'Melee hits reduce Chain Lightning cooldown by 0.5s.', max: 1, effect: { maelstrom: 0.5 } },
          { id: 's_h5', name: 'Lava Lash', desc: '+7% melee damage per rank.', max: 6, effect: { meleeDamage: 0.07 } },
          { id: 's_h6', name: 'Feral Spirit', desc: 'Kills heal 9 health and grant 8% lifesteal.', max: 1, effect: { killHeal: 9, lifesteal: 0.08 } },
        ],
      },
      {
        name: 'Restoration', school: 'nature', color: '#9dffe0', nodes: [
          { id: 's_r1', name: 'Totemic Mastery', desc: 'Totems last 3s longer per rank.', max: 4, effect: { totemDuration: 3 } },
          { id: 's_r2', name: 'Tidal Waves', desc: '+18% healing done per rank.', max: 5, effect: { healing: 0.18 } },
          { id: 's_r3', name: 'Ancestral Fortitude', desc: '+18 max health per rank.', max: 7, effect: { maxHp: 18 } },
          { id: 's_r4', name: 'Reincarnation', desc: 'Revive once per run at 40% health.', max: 1, effect: { cheatDeathRun: 0.4 } },
          { id: 's_r5', name: 'Stoneskin', desc: '+2% armor and 6% thorns per rank.', max: 6, effect: { armor: 0.02, thorns: 0.06 } },
          { id: 's_r6', name: 'Earth Shield', desc: '-12% damage taken and +2 hp/s out of combat.', max: 1, effect: { damageReduction: 0.12, regen: 2 } },
        ],
      },
      // Mastery. Every node here names one skill and does nothing at all unless
      // that skill is one of your four. It is the branch that makes the loadout
      // and the tree one decision instead of two: the generic branches make
      // your character better, this one makes a *build*.
      {
        name: 'Mastery', school: 'holy', color: '#ffd24a', nodes: [
          { id: 's_m1', name: 'Forked Lightning', skill: 'chainlightning', desc: 'Chain Lightning hits 20% harder and costs 10% less, per rank.', max: 6, effect: { skillDamage: 0.07, skillCost: 0.10 } },
          { id: 's_m2', name: 'Molten Core', skill: 'lavaburst', desc: 'Lava Burst hits 24% harder and its cooldown drops 8%, per rank.', max: 5, effect: { skillDamage: 0.08, skillCooldown: 0.08 } },
          { id: 's_m3', name: 'Enduring Totem', skill: 'searingtotem', desc: 'Your Searing Totem lasts 2s longer and hits 22% harder, per rank.', max: 5, effect: { skillDuration: 2, skillDamage: 0.08 } },
          { id: 's_m4', name: 'Wellspring', skill: 'healingtotem', desc: 'Your Healing Totem lasts 2s longer and mends 20% more, per rank.', max: 4, effect: { skillDuration: 2, skillDamage: 0.07 } },
          { id: 's_m5', name: 'Rolling Thunder', skill: 'thunderstorm', desc: 'Thunderstorm reaches 15% wider and its cooldown drops 9%, per rank.', max: 4, effect: { skillRadius: 0.15, skillCooldown: 0.09 } },
          { id: 's_m6', name: 'Elemental Fury', skill: 'elementalblast', desc: 'Elemental Blast starts at rank 3 and hits 35% harder.', max: 1, effect: { startRank: 3, skillDamage: 0.12 } },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: 'priest',
    name: 'Priest',
    role: 'Holy / Shadow Hybrid',
    tagline: 'Shield yourself, then punish everything in a wide holy blast.',
    color: '#f4e6c8',
    accent: '#fff6de',
    resource: RESOURCE.MANA,
    base: { hp: 100, armor: 0.09, speed: 5.0, attackDamage: 19, attackSpeed: 1.75, attackRange: 32, critChance: 0.09, critMult: 2.0 },
    weapon: { type: 'staff', tile: 'GLOW', color: '#ffe9b0', length: 1.35, projectile: { speed: 32, color: '#ffe9a8', size: 0.28, gravity: 0 } },
    difficulty: 2,
    skills: [
      {
        id: 'smite', name: 'Smite', kind: 'projectile', cost: 16, cooldown: 1.4, icon: '✨',
        desc: 'A bolt of holy light. Heals you for 20% of the damage it deals.',
        power: { damage: 44, speed: 34, radius: 1.6, lifesteal: 0.2, color: '#ffe9a8', size: 0.32 },
      },
      {
        id: 'shield', name: 'Power Word: Shield', kind: 'buff', cost: 22, cooldown: 10, icon: '🔰',
        desc: 'Absorb the next 90 damage for 12s. Refresh before it breaks.',
        power: { duration: 12, absorb: 90 },
      },
      {
        id: 'renew', name: 'Renew', kind: 'heal', cost: 20, cooldown: 8, icon: '💚',
        desc: 'Heal 25 instantly and 6 hp/s for 8s.',
        power: { instant: 25, healPerSecond: 6, duration: 8 },
      },
      {
        id: 'holynova', name: 'Holy Nova', kind: 'aoe_self', cost: 34, cooldown: 8, icon: '☀',
        desc: 'Detonate light around you: heavy damage and it heals you per enemy hit.',
        power: { radius: 8, damage: 55, healPerHit: 4, knockback: 4, color: '#fff1c0' },
      },
      {
        id: 'mindblast', name: 'Mind Blast', kind: 'projectile', cost: 24, cooldown: 4, icon: '🧠',
        desc: 'A lance of shadow that tears through a single mind.',
        power: { damage: 72, speed: 42, radius: 1.8, color: '#9a7fd8', size: 0.34 },
      },
      {
        id: 'divinestar', name: 'Divine Star', kind: 'chain', cost: 26, cooldown: 6, icon: '⭐',
        desc: 'A star of light that leaps between five enemies and heals you for each.',
        power: { damage: 46, jumps: 5, range: 20, jumpRange: 9, falloff: 0.9, lifesteal: 0.15, color: '#ffe9a8' },
      },
      {
        id: 'mindsear', name: 'Mind Sear', kind: 'cone', cost: 24, cooldown: 7, icon: '👁',
        desc: 'Sear every mind in a wide arc, healing for a quarter of the damage.',
        power: { damage: 58, range: 13, angle: 0.6, lifesteal: 0.25, color: '#9a7fd8' },
      },
      {
        id: 'voidform', name: 'Void Form', kind: 'buff', cost: 30, cooldown: 28, icon: '🌑',
        desc: 'Enter the void for 10s: +40% damage, but you take 15% more.',
        power: { duration: 10, damageBonus: 0.40, damageTaken: 1.15 },
      },
      {
        id: 'holyword', name: 'Holy Word: Sanctify', kind: 'heal', cost: 34, cooldown: 20, icon: '🕊',
        desc: 'A word of power: heal 70 instantly and 14 hp/s for 8s.',
        power: { instant: 70, healPerSecond: 14, duration: 8 },
      },
      {
        id: 'psychicscream', name: 'Psychic Scream', kind: 'aoe_self', cost: 26, cooldown: 15, icon: '😱',
        desc: 'A scream that breaks the minds around you, rooting them for 3s.',
        power: { radius: 9, damage: 30, root: 3, color: '#9a7fd8' },
      },
      {
        id: 'shadowword', name: 'Shadow Word: Pain', kind: 'projectile', cost: 16, cooldown: 3, icon: '🕳',
        desc: 'A word that rots for heavy damage over 10s.',
        power: { damage: 24, speed: 46, radius: 1.2, dot: { dps: 19, duration: 10 }, color: '#a35cff', size: 0.22 },
      },
      {
        id: 'pwfortitude', name: 'Fortitude', kind: 'buff', cost: 24, cooldown: 26, icon: '📗',
        desc: 'For 14s you take 25% less damage and regenerate.',
        power: { duration: 14, damageTaken: 0.75, regen: 5 },
      },
      {
        id: 'lightwell', name: 'Lightwell', kind: 'zone', cost: 30, cooldown: 16, icon: '⛲',
        desc: 'A font of light that mends you while you stand in it.',
        power: { radius: 4.6, dps: -26, duration: 10, range: 12, delay: 0.2, heals: true, color: '#ffe9a8' },
      },
    ],
    talents: [
      {
        name: 'Holy', school: 'holy', color: '#ffe9a8', nodes: [
          { id: 'p_h1', name: 'Divine Fury', desc: '+7% holy damage per rank.', max: 8, effect: { spellDamage: 0.07 } },
          { id: 'p_h2', name: 'Blessed Recovery', desc: '+18% healing done per rank.', max: 5, effect: { healing: 0.18 } },
          { id: 'p_h3', name: 'Surge of Light', desc: 'Crits reduce Holy Nova cooldown by 0.6s per rank.', max: 4, effect: { critCdr: 0.6 } },
          { id: 'p_h4', name: 'Guardian Spirit', desc: 'Below 25% health, gain 40% damage reduction.', max: 1, effect: { guardianSpirit: 0.4 } },
          { id: 'p_h5', name: 'Holy Concentration', desc: '+3 mana regen per rank.', max: 6, effect: { resourceRegen: 3 } },
          { id: 'p_h6', name: 'Apotheosis', desc: '-12% cooldowns and skills cost 15% less.', max: 1, effect: { cooldownReduction: 0.12, costReduction: 0.15 } },
        ],
      },
      {
        name: 'Discipline', school: 'arcane', color: '#bcd4ff', nodes: [
          { id: 'p_d1', name: 'Mental Strength', desc: '+18 max mana per rank.', max: 6, effect: { resourceMax: 18 } },
          { id: 'p_d2', name: 'Reinforce', desc: 'Shield absorbs +25 more per rank.', max: 5, effect: { absorb: 25 } },
          { id: 'p_d3', name: 'Rapture', desc: 'When a shield breaks, restore 15 mana per rank.', max: 4, effect: { rapture: 15 } },
          { id: 'p_d4', name: 'Atonement', desc: 'Healing yourself also damages nearby enemies for 50%.', max: 1, effect: { atonement: 0.5 } },
          { id: 'p_d5', name: 'Inner Fortitude', desc: '+16 max health and +2% armor per rank.', max: 6, effect: { maxHp: 16, armor: 0.02 } },
          { id: 'p_d6', name: 'Evangelism', desc: '-14% damage taken and 12% thorns.', max: 1, effect: { damageReduction: 0.14, thorns: 0.12 } },
        ],
      },
      {
        name: 'Shadow', school: 'shadow', color: '#9a7fd8', nodes: [
          { id: 'p_s1', name: 'Shadow Weaving', desc: 'Smite applies a rot for 8 dps per rank (4s).', max: 4, effect: { smiteDot: 8 } },
          { id: 'p_s2', name: 'Spirit Tap', desc: 'Kills restore 8 mana per rank.', max: 4, effect: { onKillGain: 8 } },
          { id: 'p_s3', name: 'Shadowform', desc: '+7% damage, -5% healing per rank.', max: 5, effect: { spellDamage: 0.07, healing: -0.05 } },
          { id: 'p_s4', name: 'Dispersion', desc: 'Taking lethal damage instead grants 2s of immunity (60s).', max: 1, effect: { dispersion: 1 } },
          { id: 'p_s5', name: 'Twisted Faith', desc: '+9% crit damage per rank.', max: 8, effect: { critMult: 0.09 } },
          { id: 'p_s6', name: 'Shadow Fiend', desc: '+25% boss damage; kills heal 8 health.', max: 1, effect: { bossDamage: 0.25, killHeal: 8 } },
        ],
      },
      // Mastery. Every node here names one skill and does nothing at all unless
      // that skill is one of your four. It is the branch that makes the loadout
      // and the tree one decision instead of two: the generic branches make
      // your character better, this one makes a *build*.
      {
        name: 'Mastery', school: 'holy', color: '#ffd24a', nodes: [
          { id: 'p_m1', name: 'Focused Will', skill: 'smite', desc: 'Smite hits 18% harder and costs 12% less, per rank.', max: 6, effect: { skillDamage: 0.06, skillCost: 0.12 } },
          { id: 'p_m2', name: 'Greater Shield', skill: 'shield', desc: 'Power Word: Shield absorbs 24% more and its cooldown drops 8%, per rank.', max: 5, effect: { skillDamage: 0.08, skillCooldown: 0.08 } },
          { id: 'p_m3', name: 'Renewed Hope', skill: 'renew', desc: 'Renew mends 22% more and lasts 1.5s longer, per rank.', max: 5, effect: { skillDamage: 0.08, skillDuration: 1.5 } },
          { id: 'p_m4', name: 'Divine Radiance', skill: 'holynova', desc: 'Holy Nova reaches 15% wider and hits 22% harder, per rank.', max: 4, effect: { skillRadius: 0.15, skillDamage: 0.08 } },
          { id: 'p_m5', name: 'Twisted Thoughts', skill: 'mindblast', desc: 'Mind Blast hits 26% harder and its cooldown drops 10%, per rank.', max: 4, effect: { skillDamage: 0.09, skillCooldown: 0.10 } },
          { id: 'p_m6', name: 'Voice of the Void', skill: 'mindsear', desc: 'Mind Sear starts at rank 3 and hits 35% harder.', max: 1, effect: { startRank: 3, skillDamage: 0.12 } },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: 'rogue',
    name: 'Rogue',
    role: 'Burst Melee / Mobility',
    tagline: 'In, kill, out. Repeat before anything lands a hit.',
    color: '#8ce06a',
    accent: '#d6ffb8',
    resource: RESOURCE.ENERGY,
    base: { hp: 96, armor: 0.12, speed: 6.0, attackDamage: 20, attackSpeed: 2.6, attackRange: 3.0, critChance: 0.18, critMult: 2.4 },
    weapon: { type: 'dagger', tile: 'METAL', color: '#cfe8ff', length: 0.75 },
    difficulty: 3,
    skills: [
      {
        id: 'ambush', name: 'Ambush', kind: 'dash', cost: 25, cooldown: 5, icon: '💨',
        desc: 'Blink behind the nearest enemy and strike for 250% damage.',
        power: { distance: 12, speed: 70, damage: 55, behindTarget: true, invuln: 0.2, phase: true },
      },
      {
        id: 'fanofknives', name: 'Fan of Knives', kind: 'aoe_self', cost: 30, cooldown: 4, icon: '🔪',
        desc: 'Throw blades in all directions, applying poison.',
        power: { radius: 7, damage: 30, dot: { dps: 9, duration: 5 }, color: '#8ce06a' },
      },
      {
        id: 'evasion', name: 'Evasion', kind: 'buff', cost: 20, cooldown: 16, icon: '🌫',
        desc: 'For 5s, dodge 60% of attacks and move 30% faster.',
        power: { duration: 5, dodge: 0.6, moveSpeed: 0.3 },
      },
      {
        id: 'eviscerate', name: 'Eviscerate', kind: 'strike', cost: 35, cooldown: 6, icon: '🗡',
        desc: 'A finisher that consumes all poison stacks for burst damage.',
        power: { damage: 62, range: 3.6, arc: 0.8, consumeDot: 3.0 },
      },
      {
        id: 'shuriken', name: 'Shuriken Toss', kind: 'projectile', cost: 16, cooldown: 2, icon: '🌟',
        desc: 'A thrown blade for when the target will not come to you.',
        power: { damage: 42, speed: 48, radius: 1.4, dot: { dps: 8, duration: 4 }, color: '#d6ffb8', size: 0.22 },
      },
      {
        id: 'crimsontempest', name: 'Crimson Tempest', kind: 'aoe_self', cost: 32, cooldown: 9, icon: '🩸',
        desc: 'Carve everything around you and leave it bleeding for 8s.',
        power: { radius: 6.5, damage: 44, dot: { dps: 12, duration: 8 }, color: '#e0473c' },
      },
      {
        id: 'smokebomb', name: 'Smoke Bomb', kind: 'zone', cost: 26, cooldown: 14, icon: '💣',
        desc: 'Choking poison smoke that slows and chokes anything inside for 6s.',
        power: { radius: 5.5, dps: 26, duration: 6, slow: 0.5, range: 16, delay: 0.3, color: '#8ce06a' },
      },
      {
        id: 'shadowdance', name: 'Shadow Dance', kind: 'buff', cost: 28, cooldown: 24, icon: '🌘',
        desc: 'For 6s you strike 55% faster and move 20% quicker.',
        power: { duration: 6, attackSpeedBonus: 0.55, moveSpeed: 0.20 },
      },
      {
        id: 'bladeflurry', name: 'Blade Flurry', kind: 'aoe_self', cost: 30, cooldown: 12, icon: '🌀',
        desc: 'Strike everything within reach five times in as many heartbeats.',
        power: { radius: 4.8, damage: 26, ticks: 5, tickDelay: 0.16, color: '#d6ffb8' },
      },
      {
        id: 'cloak', name: 'Cloak of Shadows', kind: 'buff', cost: 22, cooldown: 30, icon: '🕶',
        desc: 'Wrap yourself in shadow for 6s: 85% dodge and 25% more speed.',
        power: { duration: 6, dodge: 0.85, moveSpeed: 0.25 },
      },
      {
        id: 'backstab', name: 'Backstab', kind: 'strike', cost: 18, cooldown: 3, icon: '🔪',
        desc: 'A quick blade that crits far more often than it should.',
        power: { damage: 48, range: 3.2, arc: 0.7, forceCrit: true },
      },
      {
        id: 'adrenaline', name: 'Adrenaline Rush', kind: 'buff', cost: 26, cooldown: 26, icon: '💉',
        desc: 'For 10s your energy returns twice as fast.',
        power: { duration: 10, resourceRegen: 22, attackSpeedBonus: 0.30 },
      },
      {
        id: 'poisonbomb', name: 'Poison Bomb', kind: 'aoe_target', cost: 28, cooldown: 10, icon: '☣',
        desc: 'A flask that shatters into a cloud of venom.',
        power: { damage: 44, radius: 5.0, range: 16, delay: 0.4, burn: 16, color: '#8ce06a' },
      },
    ],
    talents: [
      {
        name: 'Assassination', school: 'nature', color: '#8ce06a', nodes: [
          { id: 'r_a1', name: 'Lethality', desc: '+8% crit damage per rank.', max: 7, effect: { critMult: 0.08 } },
          { id: 'r_a2', name: 'Deadly Poison', desc: 'Poison ticks 12% harder per rank.', max: 6, effect: { dotDamage: 0.12 } },
          { id: 'r_a3', name: 'Vile Toxins', desc: 'Poison lasts 1s longer per rank.', max: 4, effect: { dotDuration: 1 } },
          { id: 'r_a4', name: 'Cold Blood', desc: 'Every 5th attack is a guaranteed critical strike.', max: 1, effect: { coldBlood: 5 } },
          { id: 'r_a5', name: 'Venomous Wounds', desc: 'DoTs heal you for 5% of their damage per rank.', max: 4, effect: { dotLifesteal: 0.05 } },
          { id: 'r_a6', name: 'Master Assassin', desc: '+25% boss damage and +12% crit chance.', max: 1, effect: { bossDamage: 0.25, critChance: 0.12 } },
        ],
      },
      {
        name: 'Combat', school: 'physical', color: '#ffd24a', nodes: [
          { id: 'r_c1', name: 'Precision', desc: '+4% crit chance per rank.', max: 6, effect: { critChance: 0.04 } },
          { id: 'r_c2', name: 'Blade Flurry', desc: '+7% attack speed per rank.', max: 7, effect: { attackSpeed: 0.07 } },
          { id: 'r_c3', name: 'Adrenaline', desc: '+5 energy regen per rank.', max: 5, effect: { resourceRegen: 5 } },
          { id: 'r_c4', name: 'Killing Spree', desc: 'Kills refund 20 energy and 1s of all cooldowns.', max: 1, effect: { killSpree: 1 } },
          { id: 'r_c5', name: 'Savage Blades', desc: '+6% melee damage per rank.', max: 7, effect: { meleeDamage: 0.06 } },
          { id: 'r_c6', name: 'Blade Rush', desc: '-12% cooldowns and 8% lifesteal.', max: 1, effect: { cooldownReduction: 0.12, lifesteal: 0.08 } },
        ],
      },
      {
        name: 'Subtlety', school: 'shadow', color: '#9fd8ff', nodes: [
          { id: 'r_s1', name: 'Fleet Footed', desc: '+6% move speed per rank.', max: 5, effect: { moveSpeed: 0.06 } },
          { id: 'r_s2', name: 'Elusive', desc: '+4% dodge chance per rank.', max: 5, effect: { dodge: 0.04 } },
          { id: 'r_s3', name: 'Shadowstep', desc: 'Ambush cooldown -0.7s per rank.', max: 4, effect: { ambushCdr: 0.7 } },
          { id: 'r_s4', name: 'Vanish', desc: 'Dropping below 30% health instantly resets Ambush.', max: 1, effect: { vanish: 1 } },
          { id: 'r_s5', name: 'Nightstalker', desc: '+14 max health and 6% thorns per rank.', max: 6, effect: { maxHp: 14, thorns: 0.06 } },
          { id: 'r_s6', name: 'Symbols of Death', desc: '+18% damage; kills restore 8 health.', max: 1, effect: { allDamage: 0.18, killHeal: 8 } },
        ],
      },
      // Mastery. Every node here names one skill and does nothing at all unless
      // that skill is one of your four. It is the branch that makes the loadout
      // and the tree one decision instead of two: the generic branches make
      // your character better, this one makes a *build*.
      {
        name: 'Mastery', school: 'holy', color: '#ffd24a', nodes: [
          { id: 'r_m1', name: 'Perfected Ambush', skill: 'ambush', desc: 'Ambush hits 22% harder and costs 12% less, per rank.', max: 6, effect: { skillDamage: 0.08, skillCost: 0.12 } },
          { id: 'r_m2', name: 'Whirling Steel', skill: 'fanofknives', desc: 'Fan of Knives reaches 14% wider and hits 20% harder, per rank.', max: 5, effect: { skillRadius: 0.14, skillDamage: 0.07 } },
          { id: 'r_m3', name: 'Deeper Cuts', skill: 'eviscerate', desc: 'Eviscerate hits 26% harder and its cooldown drops 9%, per rank.', max: 5, effect: { skillDamage: 0.09, skillCooldown: 0.09 } },
          { id: 'r_m4', name: 'Lingering Smoke', skill: 'smokebomb', desc: 'Smoke Bomb lasts 1.5s longer and covers 12% more ground, per rank.', max: 4, effect: { skillDuration: 1.5, skillRadius: 0.12 } },
          { id: 'r_m5', name: 'Elusive', skill: 'evasion', desc: 'Evasion lasts 1.5s longer and its cooldown drops 10%, per rank.', max: 4, effect: { skillDuration: 1.5, skillCooldown: 0.10 } },
          { id: 'r_m6', name: 'Bloodbath', skill: 'crimsontempest', desc: 'Crimson Tempest starts at rank 3 and hits 35% harder.', max: 1, effect: { startRank: 3, skillDamage: 0.12 } },
        ],
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    id: 'demonslayer',
    name: 'Demonslayer',
    role: 'Fel Melee / Mobility',
    tagline: 'Burn hot, close fast, and take the demon with you.',
    color: '#7dff5a',
    accent: '#c9ff9a',
    resource: RESOURCE.HATRED,
    base: { hp: 112, armor: 0.15, speed: 5.7, attackDamage: 23, attackSpeed: 2.05, attackRange: 3.2, critChance: 0.14, critMult: 2.2 },
    weapon: { type: 'axe', tile: 'OBSIDIAN', color: '#9dff7a', length: 1.05, projectile: { speed: 38, color: '#7dff5a', size: 0.26, gravity: 0 } },
    difficulty: 3,
    skills: [
      {
        id: 'felrush', name: 'Fel Rush', kind: 'dash', cost: 12, cooldown: 5, icon: '💚',
        desc: 'Hurl yourself forward in a trail of fel fire, burning everything you pass.',
        power: { distance: 13, speed: 42, damage: 34, knockback: 6, radius: 2.0 },
      },
      {
        id: 'glaivethrow', name: 'Throw Glaive', kind: 'projectile', cost: 14, cooldown: 2.4, icon: '🌀',
        desc: 'A spinning glaive that detonates in fel fire and leaves the target burning.',
        power: { damage: 44, speed: 40, radius: 2.4, burn: 12, color: '#7dff5a', size: 0.3 },
      },
      {
        id: 'immolation', name: 'Immolation Aura', kind: 'aoe_self', cost: 20, cooldown: 7, icon: '🔥',
        desc: 'Erupt in fel flame three times over, scorching everything close by.',
        power: { radius: 5.6, damage: 26, ticks: 3, tickDelay: 0.34, dot: { dps: 8, duration: 4 }, color: '#9dff7a' },
      },
      {
        id: 'soulcleave', name: 'Soul Cleave', kind: 'cone', cost: 26, cooldown: 5, icon: '🗡',
        desc: 'A wide sweep that devours the souls it cuts, healing you for 35% of the damage.',
        power: { damage: 62, range: 6.5, angle: 0.7, lifesteal: 0.35, color: '#7dff5a' },
      },
      {
        id: 'sigilofflame', name: 'Sigil of Flame', kind: 'zone', cost: 24, cooldown: 10, icon: '🕯',
        desc: 'Brand the ground ahead; anything standing on it burns for 7s.',
        power: { radius: 5.5, dps: 30, duration: 7, range: 18, delay: 0.6, color: '#9dff7a' },
      },
      {
        id: 'eyebeam', name: 'Eye Beam', kind: 'cone', cost: 34, cooldown: 12, icon: '👁',
        desc: 'A narrow beam of fel energy that scours everything in a long line.',
        power: { damage: 96, range: 17, angle: 0.32, color: '#7dff5a' },
      },
      {
        id: 'chaosnova', name: 'Chaos Nova', kind: 'aoe_self', cost: 30, cooldown: 13, icon: '💥',
        desc: 'Detonate chaos around you, rooting everything caught in it for 2.2s.',
        power: { radius: 7.5, damage: 46, root: 2.2, knockback: 4, color: '#c9ff9a' },
      },
      {
        id: 'metamorphosis', name: 'Metamorphosis', kind: 'buff', cost: 30, cooldown: 30, icon: '😈',
        desc: 'Take demon form for 10s: +40% damage, +25% speed, and 20% less damage taken.',
        power: { duration: 10, damageBonus: 0.40, moveSpeed: 0.25, damageTaken: 0.80 },
      },
      {
        id: 'feldevastation', name: 'Fel Devastation', kind: 'cone', cost: 36, cooldown: 14, icon: '☢',
        desc: 'Unleash a torrent of fel energy, healing you for a third of the ruin it causes.',
        power: { damage: 104, range: 12, angle: 0.5, lifesteal: 0.33, color: '#7dff5a' },
      },
      {
        id: 'darkness', name: 'Darkness', kind: 'buff', cost: 28, cooldown: 32, icon: '🌑',
        desc: 'Shroud yourself for 8s: 60% dodge and 20% less damage taken.',
        power: { duration: 8, dodge: 0.60, damageTaken: 0.80 },
      },
      {
        id: 'shear', name: 'Shear', kind: 'strike', cost: 14, cooldown: 2.5, icon: '🗡',
        desc: 'A fast cut that feeds on Hatred and returns it.',
        power: { damage: 42, range: 3.4, arc: 0.8, lifesteal: 0.15 },
      },
      {
        id: 'blur', name: 'Blur', kind: 'buff', cost: 22, cooldown: 20, icon: '🌫',
        desc: 'For 8s you dodge 35% of everything and move faster.',
        power: { duration: 8, dodge: 0.35, moveSpeed: 0.22 },
      },
      {
        id: 'annihilation', name: 'Annihilation', kind: 'aoe_self', cost: 34, cooldown: 11, icon: '💢',
        desc: 'Detonate the fel around you in a wide, brutal ring.',
        power: { radius: 6.8, damage: 66, knockback: 8, lifesteal: 0.2, color: '#9dff7a' },
      },
    ],
    talents: [
      {
        name: 'Havoc', school: 'fire', color: '#7dff5a', nodes: [
          { id: 'd_h1', name: 'Demonic Presence', desc: '+6% melee damage per rank.', max: 8, effect: { meleeDamage: 0.06 } },
          { id: 'd_h2', name: 'Critical Chaos', desc: '+4% crit chance per rank.', max: 6, effect: { critChance: 0.04 } },
          { id: 'd_h3', name: 'Unbound Chaos', desc: '+9% crit damage per rank.', max: 7, effect: { critMult: 0.09 } },
          { id: 'd_h4', name: 'Momentum', desc: '+6% move speed per rank.', max: 5, effect: { moveSpeed: 0.06 } },
          { id: 'd_h5', name: 'Demon Blades', desc: '+6% attack speed per rank.', max: 7, effect: { attackSpeed: 0.06 } },
          { id: 'd_h6', name: 'Chaotic Transformation', desc: '+18% damage and -10% cooldowns.', max: 1, effect: { allDamage: 0.18, cooldownReduction: 0.10 } },
        ],
      },
      {
        name: 'Vengeance', school: 'shadow', color: '#ff5a3c', nodes: [
          { id: 'd_v1', name: 'Charred Flesh', desc: '+18 max health per rank.', max: 8, effect: { maxHp: 18 } },
          { id: 'd_v2', name: 'Fiery Brand', desc: '+3% armor per rank.', max: 6, effect: { armor: 0.03 } },
          { id: 'd_v3', name: 'Demon Hide', desc: 'Take 3% less damage per rank.', max: 5, effect: { damageReduction: 0.03 } },
          { id: 'd_v4', name: 'Feed the Demon', desc: 'Restore 8 health per kill, per rank.', max: 5, effect: { killHeal: 8 } },
          { id: 'd_v5', name: 'Burning Alive', desc: 'Reflect 8% of damage taken per rank.', max: 5, effect: { thorns: 0.08 } },
          { id: 'd_v6', name: 'Last Resort', desc: 'Survive a lethal hit once per wave, and take 10% less damage.', max: 1, effect: { cheatDeath: 1, damageReduction: 0.10 } },
        ],
      },
      {
        name: 'Felblood', school: 'nature', color: '#a35cff', nodes: [
          { id: 'd_f1', name: 'Thirst', desc: 'Heal 3% of damage dealt per rank.', max: 6, effect: { lifesteal: 0.03 } },
          { id: 'd_f2', name: 'Blind Fury', desc: '+12 max Hatred and +2 Hatred per hit, per rank.', max: 5, effect: { resourceMax: 12, onHitGain: 2 } },
          { id: 'd_f3', name: 'Burning Hatred', desc: 'Kills restore +6 Hatred per rank.', max: 4, effect: { onKillGain: 6 } },
          { id: 'd_f4', name: 'Cycle of Hatred', desc: '-5% cooldowns per rank.', max: 6, effect: { cooldownReduction: 0.05 } },
          { id: 'd_f5', name: 'Burning Wound', desc: 'Burn and fel damage ticks 15% harder per rank.', max: 6, effect: { burnDamage: 0.15, dotDamage: 0.10 } },
          { id: 'd_f6', name: 'Fel Devastation', desc: '+25% damage to bosses and 8% lifesteal.', max: 1, effect: { bossDamage: 0.25, lifesteal: 0.08 } },
        ],
      },
      // Mastery. Every node here names one skill and does nothing at all unless
      // that skill is one of your four. It is the branch that makes the loadout
      // and the tree one decision instead of two: the generic branches make
      // your character better, this one makes a *build*.
      {
        name: 'Mastery', school: 'holy', color: '#ffd24a', nodes: [
          { id: 'd_m1', name: 'Momentum', skill: 'felrush', desc: 'Fel Rush hits 22% harder and its cooldown drops 10%, per rank.', max: 6, effect: { skillDamage: 0.08, skillCooldown: 0.10 } },
          { id: 'd_m2', name: 'Burning Aura', skill: 'immolation', desc: 'Immolation Aura reaches 15% wider and burns 22% harder, per rank.', max: 5, effect: { skillRadius: 0.15, skillDamage: 0.08 } },
          { id: 'd_m3', name: 'Voracious Cleave', skill: 'soulcleave', desc: 'Soul Cleave hits 24% harder and costs 12% less, per rank.', max: 5, effect: { skillDamage: 0.08, skillCost: 0.12 } },
          { id: 'd_m4', name: 'Burning Sigil', skill: 'sigilofflame', desc: 'Sigil of Flame lasts 1.5s longer and burns 22% harder, per rank.', max: 4, effect: { skillDuration: 1.5, skillDamage: 0.08 } },
          { id: 'd_m5', name: 'Blind Fury', skill: 'eyebeam', desc: 'Eye Beam hits 26% harder and its cooldown drops 9%, per rank.', max: 4, effect: { skillDamage: 0.09, skillCooldown: 0.09 } },
          { id: 'd_m6', name: 'Demon Within', skill: 'metamorphosis', desc: 'Metamorphosis starts at rank 3 and lasts 4s longer.', max: 1, effect: { startRank: 3, skillDuration: 4 } },
        ],
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    id: 'paladin',
    name: 'Paladin',
    role: 'Armoured Zealot',
    tagline: 'Hold the line, and make holding it hurt.',
    color: '#e8c56a',
    accent: '#fff2c4',
    resource: RESOURCE.FAITH,
    // The tankiest class in the game, and the slowest. Faith is spent from a
    // pool that only refills by taking and landing hits, so a Paladin who backs
    // off stops working — the armour is there to let you stay in, not to let
    // you leave.
    base: { hp: 175, armor: 0.32, speed: 4.7, attackDamage: 24, attackSpeed: 1.35, attackRange: 3.5, critChance: 0.07, critMult: 1.8 },
    weapon: { type: 'hammer', tile: 'GOLD', color: '#ffe6a8', length: 1.2 },
    difficulty: 1,
    skills: [
      {
        id: 'crusaderstrike', name: 'Crusader Strike', kind: 'strike', cost: 12, cooldown: 3, icon: '⚒',
        desc: 'A hammer blow that returns Faith and heals you for part of it.',
        power: { damage: 40, range: 3.6, arc: 0.9, lifesteal: 0.25 },
      },
      {
        id: 'consecration', name: 'Consecration', kind: 'zone', cost: 22, cooldown: 9, icon: '🕯',
        desc: 'Bless the ground beneath you: it burns the unholy for 8s.',
        power: { radius: 6.0, dps: 30, duration: 8, range: 0, delay: 0.15, color: '#ffe9a8' },
      },
      {
        id: 'divineshield', name: 'Divine Shield', kind: 'buff', cost: 26, cooldown: 30, icon: '🛡',
        desc: 'For 5s you take 80% less damage and cannot be knocked back.',
        power: { duration: 5, damageTaken: 0.20, rooted: false },
      },
      {
        id: 'judgement', name: 'Judgement', kind: 'projectile', cost: 18, cooldown: 5, icon: '⚖',
        desc: 'Hurl a verdict of light that detonates on the first thing it meets.',
        power: { damage: 52, speed: 44, radius: 2.6, color: '#ffe9a8', size: 0.3 },
      },
      {
        id: 'hammerofwrath', name: 'Hammer of Wrath', kind: 'aoe_target', cost: 28, cooldown: 8, icon: '🔨',
        desc: 'Call down a hammer of light that stuns everything it lands on.',
        power: { damage: 66, radius: 4.4, range: 18, delay: 0.55, stun: 1.4, knockback: 6, color: '#fff2c4' },
      },
      {
        id: 'layonhands', name: 'Lay on Hands', kind: 'heal', cost: 34, cooldown: 26, icon: '✋',
        desc: 'A full mend: restore a large share of your health at once.',
        power: { instant: 90, healPerSecond: 0, duration: 0 },
      },
      {
        id: 'avengershield', name: "Avenger's Shield", kind: 'chain', cost: 24, cooldown: 7, icon: '🛡',
        desc: 'Throw your shield: it bounces between enemies, stunning each.',
        power: { damage: 46, chainDamage: 34, jumps: 3, range: 16, stun: 0.8, color: '#ffe9a8' },
      },
      {
        id: 'blessing', name: 'Blessing of Might', kind: 'buff', cost: 26, cooldown: 24, icon: '📜',
        desc: 'For 12s you deal 30% more damage and take 15% less.',
        power: { duration: 12, damageBonus: 0.30, damageTaken: 0.85 },
      },
      {
        id: 'divinestorm', name: 'Divine Storm', kind: 'aoe_self', cost: 30, cooldown: 8, icon: '🌟',
        desc: 'Sweep everything around you with light and heal for the damage.',
        power: { radius: 5.6, damage: 48, ticks: 1, knockback: 4, lifesteal: 0.3, color: '#fff2c4' },
      },
      {
        id: 'avengingwrath', name: 'Avenging Wrath', kind: 'buff', cost: 36, cooldown: 40, icon: '👑',
        desc: 'For 12s: +45% damage, +25% attack speed and constant self-healing.',
        power: { duration: 12, damageBonus: 0.45, attackSpeedBonus: 0.25, regen: 6 },
      },
      {
        id: 'holystrike', name: 'Holy Strike', kind: 'strike', cost: 14, cooldown: 2.5, icon: '✝',
        desc: 'A swift blow of light that always returns Faith.',
        power: { damage: 40, range: 3.4, arc: 0.85, lifesteal: 0.15 },
      },
      {
        id: 'sacredshield', name: 'Sacred Shield', kind: 'buff', cost: 24, cooldown: 20, icon: '🔰',
        desc: 'Absorb 160 damage for 12s.',
        power: { duration: 12, absorb: 160 },
      },
      {
        id: 'wordofglory', name: 'Word of Glory', kind: 'heal', cost: 26, cooldown: 16, icon: '📖',
        desc: 'A word of light that mends you over 5s.',
        power: { instant: 40, healPerSecond: 12, duration: 5 },
      },
    ],
    talents: [
      {
        name: 'Retribution', school: 'holy', color: '#ffd98a', nodes: [
          { id: 'l_r1', name: 'Zeal', desc: '+6% melee damage per rank.', max: 8, effect: { meleeDamage: 0.06 } },
          { id: 'l_r2', name: 'Vengeance', desc: '+4% crit chance per rank.', max: 6, effect: { critChance: 0.04 } },
          { id: 'l_r3', name: 'Sanctified Wrath', desc: '+0.08 crit damage per rank.', max: 5, effect: { critMult: 0.08 } },
          { id: 'l_r4', name: 'Repentance', desc: 'Area effects reach 8% further per rank.', max: 5, effect: { aoeRadius: 0.08 } },
          { id: 'l_r5', name: 'Righteous Fury', desc: '+5% attack speed per rank.', max: 5, effect: { attackSpeed: 0.05 } },
          { id: 'l_r6', name: 'Final Verdict', desc: '+20% damage and +25% damage to bosses.', max: 1, effect: { allDamage: 0.20, bossDamage: 0.25 } },
        ],
      },
      {
        name: 'Protection', school: 'frost', color: '#8fb3ff', nodes: [
          { id: 'l_p1', name: 'Stoneforged', desc: '+26 max health per rank.', max: 8, effect: { maxHp: 26 } },
          { id: 'l_p2', name: 'Sanctuary', desc: '+3% armor per rank.', max: 6, effect: { armor: 0.03 } },
          { id: 'l_p3', name: 'Reckoning', desc: 'Reflect 12% of damage taken per rank.', max: 5, effect: { thorns: 0.12 } },
          { id: 'l_p4', name: 'Ardent Defender', desc: 'Survive a lethal hit once per wave at 30% hp.', max: 1, effect: { cheatDeath: 1 } },
          { id: 'l_p5', name: 'Guarded', desc: 'Take 3% less damage per rank.', max: 5, effect: { damageReduction: 0.03 } },
          { id: 'l_p6', name: 'Aegis', desc: '+120 absorb and -10% damage taken.', max: 1, effect: { absorb: 120, damageReduction: 0.10 } },
        ],
      },
      {
        name: 'Holy', school: 'holy', color: '#ffe9a8', nodes: [
          { id: 'l_h1', name: 'Illumination', desc: '+8% healing done per rank.', max: 6, effect: { healing: 0.08 } },
          { id: 'l_h2', name: 'Benediction', desc: 'Heal 3% of damage dealt per rank.', max: 6, effect: { lifesteal: 0.03 } },
          { id: 'l_h3', name: 'Devotion', desc: 'Regenerate 1.5 hp/s per rank out of combat.', max: 5, effect: { regen: 1.5 } },
          { id: 'l_h4', name: 'Conviction', desc: '+16 max Faith and +2 Faith per hit, per rank.', max: 5, effect: { resourceMax: 16, onHitGain: 2 } },
          { id: 'l_h5', name: 'Grace', desc: 'Cooldowns recover 4% faster per rank.', max: 6, effect: { cooldownReduction: 0.04 } },
          { id: 'l_h6', name: 'Beacon of Light', desc: 'Healing yourself also burns nearby enemies for 40% of it.', max: 1, effect: { atonement: 0.40 } },
        ],
      },
      // Mastery. Every node here names one skill and does nothing at all unless
      // that skill is one of your four. It is the branch that makes the loadout
      // and the tree one decision instead of two: the generic branches make
      // your character better, this one makes a *build*.
      {
        name: 'Mastery', school: 'holy', color: '#ffd24a', nodes: [
          { id: 'l_m1', name: 'Zealous Strike', skill: 'crusaderstrike', desc: 'Crusader Strike hits 20% harder and costs 12% less, per rank.', max: 6, effect: { skillDamage: 0.07, skillCost: 0.12 } },
          { id: 'l_m2', name: 'Hallowed Ground', skill: 'consecration', desc: 'Consecration lasts 1.5s longer and burns 22% harder, per rank.', max: 5, effect: { skillDuration: 1.5, skillDamage: 0.08 } },
          { id: 'l_m3', name: 'Unbreakable', skill: 'divineshield', desc: 'Divine Shield lasts 1s longer and its cooldown drops 10%, per rank.', max: 5, effect: { skillDuration: 1, skillCooldown: 0.10 } },
          { id: 'l_m4', name: 'Swift Verdict', skill: 'judgement', desc: 'Judgement hits 24% harder and its cooldown drops 9%, per rank.', max: 4, effect: { skillDamage: 0.08, skillCooldown: 0.09 } },
          { id: 'l_m5', name: 'Wrathful', skill: 'hammerofwrath', desc: 'Hammer of Wrath lands 14% wider and hits 24% harder, per rank.', max: 4, effect: { skillRadius: 0.14, skillDamage: 0.08 } },
          { id: 'l_m6', name: 'Eternal Flame', skill: 'divinestorm', desc: 'Divine Storm starts at rank 3 and hits 35% harder.', max: 1, effect: { startRank: 3, skillDamage: 0.12 } },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: 'hunter',
    name: 'Hunter',
    role: 'Ranged / Beast',
    tagline: 'Keep the distance. Let the pet close it.',
    color: '#7bbf5a',
    accent: '#cdf5a8',
    resource: RESOURCE.FOCUS,
    // The longest reach in the game and the thinnest margin: a Hunter caught in
    // melee is a Hunter losing. Focus regenerates fast, so the limit is not the
    // resource — it is whether you still have room to back into.
    base: { hp: 120, armor: 0.14, speed: 5.9, attackDamage: 22, attackSpeed: 1.95, attackRange: 22, critChance: 0.13, critMult: 2.0 },
    weapon: { type: 'bow', tile: 'LOG_SIDE', color: '#c9a06a', length: 1.15, projectile: { speed: 52, color: '#cdf5a8', size: 0.22, gravity: 0 } },
    difficulty: 2,
    skills: [
      {
        id: 'arcaneshot', name: 'Arcane Shot', kind: 'projectile', cost: 12, cooldown: 1.5, icon: '🏹',
        desc: 'A fast shot that costs almost nothing. The rotation filler.',
        power: { damage: 44, speed: 58, radius: 1.2, color: '#cdf5a8', size: 0.2 },
      },
      {
        id: 'multishot', name: 'Multi-Shot', kind: 'cone', cost: 24, cooldown: 6, icon: '🎯',
        desc: 'A fan of arrows that hits everything in a wide arc ahead of you.',
        power: { damage: 46, range: 16, arc: 1.1, color: '#cdf5a8' },
      },
      {
        id: 'summonbeast', name: 'Call Beast', kind: 'summon', cost: 28, cooldown: 22, icon: '🐺',
        desc: 'Your beast fights at your side and holds what closes on you.',
        power: { hp: 200, damage: 26, duration: 45, maxPets: 1, speed: 7.2, color: '#9dcf7a' },
      },
      {
        id: 'explosiveshot', name: 'Explosive Shot', kind: 'aoe_target', cost: 30, cooldown: 8, icon: '💥',
        desc: 'A shell that detonates where it lands and leaves the ground burning.',
        power: { damage: 62, radius: 4.6, range: 22, delay: 0.4, burn: 14, knockback: 5, color: '#ffb27a' },
      },
      {
        id: 'disengage', name: 'Disengage', kind: 'dash', cost: 14, cooldown: 7, icon: '🪶',
        desc: 'Leap backwards out of reach, hurting whatever you leave behind.',
        power: { distance: 13, speed: 36, damage: 26, knockback: 9, radius: 2.6, backwards: true },
      },
      {
        id: 'serpentsting', name: "Serpent's Sting", kind: 'projectile', cost: 18, cooldown: 4, icon: '🐍',
        desc: 'A venomed arrow that poisons for heavy damage over 10s.',
        power: { damage: 30, speed: 50, radius: 1.2, dot: { dps: 20, duration: 10 }, color: '#8ce06a', size: 0.2 },
      },
      {
        id: 'volley', name: 'Volley', kind: 'zone', cost: 32, cooldown: 12, icon: '🌧',
        desc: 'Rain arrows on a patch of ground for 7s.',
        power: { radius: 6.2, dps: 34, duration: 7, range: 22, delay: 0.35, color: '#cdf5a8' },
      },
      {
        id: 'aspect', name: 'Aspect of the Hawk', kind: 'buff', cost: 24, cooldown: 22, icon: '🦅',
        desc: 'For 12s you shoot 45% faster and move 18% quicker.',
        power: { duration: 12, attackSpeedBonus: 0.45, moveSpeed: 0.18 },
      },
      {
        id: 'freezingtrap', name: 'Freezing Trap', kind: 'aoe_target', cost: 22, cooldown: 14, icon: '🧊',
        desc: 'Set a trap that freezes everything caught in its radius.',
        power: { damage: 20, radius: 5.0, range: 16, delay: 0.5, freeze: 3.0, color: '#8fe3ff' },
      },
      {
        id: 'killshot', name: 'Kill Shot', kind: 'projectile', cost: 40, cooldown: 10, icon: '☠',
        desc: 'A single aimed shot. Triple damage against anything below 35% health.',
        power: { damage: 90, speed: 70, radius: 1.6, executeThreshold: 0.35, executeMult: 3, color: '#ff9a7a', size: 0.26 },
      },
      {
        id: 'steadyshot', name: 'Steady Shot', kind: 'projectile', cost: 10, cooldown: 1.8, icon: '🎯',
        desc: 'A patient shot that hits harder than it costs.',
        power: { damage: 50, speed: 60, radius: 1.2, color: '#cdf5a8', size: 0.2 },
      },
      {
        id: 'mendpet', name: 'Mend Pet', kind: 'heal', cost: 22, cooldown: 18, icon: '💚',
        desc: 'Patch yourself and your beast back together.',
        power: { instant: 45, healPerSecond: 10, duration: 5 },
      },
      {
        id: 'rapidfire', name: 'Rapid Fire', kind: 'buff', cost: 28, cooldown: 26, icon: '🏹',
        desc: 'For 10s you shoot 70% faster.',
        power: { duration: 10, attackSpeedBonus: 0.70 },
      },
    ],
    talents: [
      {
        name: 'Marksmanship', school: 'nature', color: '#cdf5a8', nodes: [
          { id: 'h_m1', name: 'Steady Aim', desc: '+7% spell damage per rank.', max: 8, effect: { spellDamage: 0.07 } },
          { id: 'h_m2', name: 'Lethal Shots', desc: '+4% crit chance per rank.', max: 6, effect: { critChance: 0.04 } },
          { id: 'h_m3', name: 'Mortal Shots', desc: '+0.09 crit damage per rank.', max: 5, effect: { critMult: 0.09 } },
          { id: 'h_m4', name: 'Efficiency', desc: 'Skills cost 5% less per rank.', max: 6, effect: { costReduction: 0.05 } },
          { id: 'h_m5', name: 'Trueshot', desc: 'Projectiles pierce one more target per rank.', max: 3, effect: { pierce: 1 } },
          { id: 'h_m6', name: 'Aimed Shot', desc: '+22% damage and +6% crit chance.', max: 1, effect: { allDamage: 0.22, critChance: 0.06 } },
        ],
      },
      {
        name: 'Beast Mastery', school: 'nature', color: '#9dcf7a', nodes: [
          { id: 'h_b1', name: 'Ferocity', desc: 'Your beasts are 12% stronger per rank.', max: 6, effect: { petPower: 0.12 } },
          { id: 'h_b2', name: 'Pack Leader', desc: '+1 beast at a time.', max: 2, effect: { maxPets: 1 } },
          { id: 'h_b3', name: 'Endurance Training', desc: 'Beasts last 4s longer per rank.', max: 5, effect: { totemDuration: 4 } },
          { id: 'h_b4', name: 'Bestial Wrath', desc: 'Beasts return 25% of their damage to you as health.', max: 1, effect: { soulLink: 0.25 } },
          { id: 'h_b5', name: 'Kindred Spirit', desc: 'Restore 7 health per kill, per rank.', max: 5, effect: { killHeal: 7 } },
          { id: 'h_b6', name: 'The Beast Within', desc: 'A slain beast claws its way back once per 30s.', max: 1, effect: { petRebirth: 1 } },
        ],
      },
      {
        name: 'Survival', school: 'frost', color: '#8fe3ff', nodes: [
          { id: 'h_s1', name: 'Toughened Hide', desc: '+18 max health per rank.', max: 8, effect: { maxHp: 18 } },
          { id: 'h_s2', name: 'Deterrence', desc: '+3% dodge per rank.', max: 6, effect: { dodge: 0.03 } },
          { id: 'h_s3', name: 'Wyvern Venom', desc: 'Damage over time deals 14% more per rank.', max: 6, effect: { dotDamage: 0.14 } },
          { id: 'h_s4', name: 'Survivalist', desc: 'Regenerate 1.5 hp/s per rank out of combat.', max: 5, effect: { regen: 1.5 } },
          { id: 'h_s5', name: 'Fleet Footed', desc: '+4% move speed per rank.', max: 5, effect: { moveSpeed: 0.04 } },
          { id: 'h_s6', name: 'Master of Beasts', desc: 'Survive a lethal hit once per wave, and +10% move speed.', max: 1, effect: { cheatDeath: 1, moveSpeed: 0.10 } },
        ],
      },
      // Mastery. Every node here names one skill and does nothing at all unless
      // that skill is one of your four.
      {
        name: 'Mastery', school: 'holy', color: '#ffd24a', nodes: [
          { id: 'h_y1', name: 'Improved Arcane Shot', skill: 'arcaneshot', desc: 'Arcane Shot hits 18% harder and costs 12% less, per rank.', max: 6, effect: { skillDamage: 0.06, skillCost: 0.12 } },
          { id: 'h_y2', name: 'Barrage', skill: 'multishot', desc: 'Multi-Shot hits 22% harder and its cooldown drops 9%, per rank.', max: 5, effect: { skillDamage: 0.08, skillCooldown: 0.09 } },
          { id: 'h_y3', name: 'Lingering Venom', skill: 'serpentsting', desc: "Serpent's Sting poisons 26% harder and 1s longer, per rank.", max: 5, effect: { skillDamage: 0.09, skillDuration: 1 } },
          { id: 'h_y4', name: 'Endless Volley', skill: 'volley', desc: 'Volley lasts 1.2s longer and covers 12% more ground, per rank.', max: 4, effect: { skillDuration: 1.2, skillRadius: 0.12 } },
          { id: 'h_y5', name: 'Bigger Bombs', skill: 'explosiveshot', desc: 'Explosive Shot lands 15% wider and hits 24% harder, per rank.', max: 4, effect: { skillRadius: 0.15, skillDamage: 0.08 } },
          { id: 'h_y6', name: 'Executioner', skill: 'killshot', desc: 'Kill Shot starts at rank 3 and hits 40% harder.', max: 1, effect: { startRank: 3, skillDamage: 0.14 } },
        ],
      },
    ],
  },
];

export const CLASS_BY_ID = Object.fromEntries(CLASSES.map((c) => [c.id, c]));

/** Flatten every talent node for lookup by id. */
export const TALENT_BY_ID = {};
for (const cls of CLASSES) {
  for (const branch of cls.talents) {
    for (const node of branch.nodes) {
      TALENT_BY_ID[node.id] = { ...node, classId: cls.id, branch: branch.name, color: branch.color };
    }
  }
}

/** Total talent ranks a class can hold — what "fully specced" costs. */
export function totalTalentRanks(cls) {
  return cls.talents.reduce((s, b) => s + b.nodes.reduce((n, x) => n + x.max, 0), 0);
}

export const SKILL_BY_ID = {};
for (const cls of CLASSES) for (const s of cls.skills) SKILL_BY_ID[s.id] = s;

/**
 * The skills a class has actually learned at a given level.
 *
 * Defaults to the cap so anything that does not know or care about levels —
 * the balance harness, a test fixture — still sees the whole pool.
 */
export function unlockedSkills(cls, level = 60) {
  const order = unlockOrder(cls);
  let n = 0;
  while (n < order.length && unlockLevelForSlot(n) <= level) n++;
  return order.slice(0, Math.max(1, n));
}

/** The skills a class starts a fresh run with at that level. */
export function defaultLoadout(cls, level = 60) {
  return unlockedSkills(cls, level).slice(0, LOADOUT_SIZE).map((s) => s.id);
}

/**
 * Turn a stored list of skill ids into the four skill objects the run uses.
 * Anything unknown or duplicated is replaced from the default kit, so a save
 * written by an older build can never produce an empty skill slot.
 */
export function resolveLoadout(cls, ids, level = 60) {
  // Only what has been learned. A stored loadout from a save where the class
  // was higher level — or from a build with a different unlock order — must
  // not smuggle a locked skill into the arena.
  const pool = unlockedSkills(cls, level);
  const allowed = new Set(pool.map((s) => s.id));
  const byId = Object.fromEntries(pool.map((s) => [s.id, s]));
  const out = [];
  const used = new Set();
  for (const id of ids || []) {
    if (out.length >= LOADOUT_SIZE) break;
    if (!allowed.has(id) || used.has(id)) continue;
    used.add(id);
    out.push(byId[id]);
  }
  // Fill any empty slots from what is left. Below level 4 there are only two
  // skills to fill four slots, and that is correct — the bar grows with you.
  for (const s of pool) {
    if (out.length >= LOADOUT_SIZE) break;
    if (used.has(s.id)) continue;
    used.add(s.id);
    out.push(s);
  }
  return out;
}
