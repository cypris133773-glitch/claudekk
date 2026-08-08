// One ultimate per class: the thing a fight builds toward.
//
// The game had no crescendo. Four skills on cooldowns of five to forty
// seconds, and a wave that got bigger — but nothing that arrived, nothing
// that was *earned* by the fight rather than by a timer. A cooldown is a
// clock; a charge is a reward, and the difference is whether pushing harder
// pays for itself.
//
// HOW IT CHARGES
//
// Tuned against the floor rather than against the bot. The balance harness's
// player is a poor one — it mostly walks and swings — so measuring the rate
// against it would set the meter for someone who does not exist. The rates are
// set so a competent player fills it in roughly half a minute of real fighting,
// and MIN_CHARGE_SECONDS below is what guarantees nobody does it faster.
//
// From damage dealt and damage taken, both. Dealt alone would mean the
// strongest build gets it most often, which is backwards — the ultimate is
// most wanted by the character who is losing. Taken alone would reward
// standing in fire. Both, weighted so a fight you are winning and a fight you
// are losing arrive at roughly the same place, and neither one alone gets
// there quickly.
//
// WHAT THEY ARE
//
// Every one is a bigger version of something the class already does, using a
// skill kind the game already casts. That is deliberate on two levels: it
// costs no new cast code, and — more importantly — an ultimate should be the
// class's own fantasy turned all the way up, not a borrowed one. A Warrior's
// is a longer, wider, heavier Bladestorm. A Mage's is a Meteor that takes the
// whole room. Nobody has to learn a new verb at the moment they most want to
// press the button.
//
// They cost no resource and have no cooldown. The charge is the cooldown, and
// asking for Rage as well would mean the Warrior's ultimate is unavailable at
// exactly the moment a fight has gone badly enough to fill it.

/** Charge from one point of damage dealt, as a fraction of your own health. */
export const CHARGE_PER_DAMAGE_DEALT = 0.115;
/** Charge from one point of damage taken, as a fraction of your own health. */
export const CHARGE_PER_DAMAGE_TAKEN = 1.55;
/**
 * A hard floor on how fast the meter can fill, in seconds.
 *
 * Without it a single large critical into a packed wave fills the whole bar,
 * which turns the ultimate from a thing a fight builds toward into a thing a
 * lucky hit hands you. The rates above decide the ordinary case; this decides
 * the best one, and the best case is the one that breaks a system like this.
 */
export const MIN_CHARGE_SECONDS = 26;

export const ULTIMATES = {
  warrior: {
    id: 'ult_titanwake', name: "Titan's Wake", kind: 'aoe_self', icon: '🌪',
    cost: 0, cooldown: 0,
    desc: 'Become the centre of the fight: six shattering revolutions that '
      + 'throw everything in the room away from you.',
    power: {
      radius: 9.5, damage: 90, ticks: 6, tickDelay: 0.24, knockback: 11,
      healPerHit: 10, color: '#ff8a4a',
    },
  },
  mage: {
    id: 'ult_cataclysm', name: 'Cataclysm', kind: 'aoe_target', icon: '☄',
    cost: 0, cooldown: 0,
    desc: 'Call down a sky-splitting impact that leaves the ground burning.',
    power: {
      damage: 460, radius: 12, delay: 1.1, range: 30, burn: 60,
      stun: 1.4, color: '#ff5a2c',
    },
  },
  warlock: {
    id: 'ult_unmaking', name: 'The Unmaking', kind: 'aoe_self', icon: '💀',
    cost: 0, cooldown: 0,
    desc: 'Tear open the void around you. Everything caught in it rots from '
      + 'the inside for the next eight seconds.',
    power: {
      radius: 11, damage: 150, ticks: 3, tickDelay: 0.5, knockback: 4,
      dot: { dps: 40, duration: 8 }, healPerHit: 14, color: '#a35cff',
    },
  },
  shaman: {
    id: 'ult_stormunbound', name: 'Storm Unbound', kind: 'chain', icon: '⚡',
    cost: 0, cooldown: 0,
    desc: 'A bolt that will not stop: it crosses the whole room and loses '
      + 'almost nothing on the way.',
    power: {
      damage: 220, jumps: 14, range: 28, jumpRange: 14, falloff: 0.95,
      color: '#9fefff', selfHeal: 0.04,
    },
  },
  priest: {
    id: 'ult_radiance', name: 'Radiance', kind: 'aoe_self', icon: '☀',
    cost: 0, cooldown: 0,
    desc: 'Burn away everything unholy in the room and knit yourself back '
      + 'together with what is left.',
    power: {
      radius: 13, damage: 220, ticks: 2, tickDelay: 0.35, knockback: 7,
      healPerHit: 34, color: '#fff4cf',
    },
  },
  rogue: {
    id: 'ult_thousandcuts', name: 'A Thousand Cuts', kind: 'aoe_self', icon: '🗡',
    cost: 0, cooldown: 0,
    desc: 'Twelve strikes in three seconds, and nothing gets to answer any '
      + 'of them.',
    power: {
      radius: 6.4, damage: 62, ticks: 12, tickDelay: 0.22,
      dot: { dps: 22, duration: 6 }, color: '#e8ffb8',
    },
  },
  demonslayer: {
    id: 'ult_annihilator', name: 'The Annihilator', kind: 'buff', icon: '😈',
    cost: 0, cooldown: 0,
    desc: 'Fourteen seconds as the thing you hunt: everything you touch dies '
      + 'and everything it does back heals you.',
    power: {
      duration: 14, damageBonus: 1.10, attackSpeedBonus: 0.55,
      moveSpeed: 0.35, damageTaken: 0.55, rooted: false,
    },
  },
  paladin: {
    id: 'ult_reckoning', name: 'Reckoning', kind: 'aoe_self', icon: '🔨',
    cost: 0, cooldown: 0,
    desc: 'Bring judgement down four times, and take back a life for every '
      + 'one you end.',
    power: {
      radius: 8.5, damage: 130, ticks: 4, tickDelay: 0.42, knockback: 8,
      healPerHit: 26, color: '#ffe9a8',
    },
  },
  hunter: {
    id: 'ult_darkeningsky', name: 'The Darkening Sky', kind: 'zone', icon: '🏹',
    cost: 0, cooldown: 0,
    desc: 'Blot out the light over a wide stretch of ground and keep it that '
      + 'way for ten seconds.',
    power: {
      radius: 12, dps: 150, duration: 10, range: 26, delay: 0.4,
      slow: 0.4, color: '#d8ffb0',
    },
  },
};

/** The ultimate a class fights with, or null for a class that has none yet. */
export function ultimateFor(classId) {
  return ULTIMATES[classId] || null;
}
