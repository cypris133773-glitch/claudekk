// Playable classes. Each has its own resource, base stats, a pool of eight
// skills (four of which are equipped at a time) and a three-branch talent tree.
//
// Skill `kind` values are interpreted by src/game/skills.js:
//   projectile | aoe_self | aoe_target | dash | buff | heal | summon | cone |
//   chain | strike | zone
//
// `unlock` is the best wave the class must have reached before the skill can
// be slotted. The first four of every pool are always available, so a fresh
// account still has a complete kit.

export const RESOURCE = {
  MANA: { key: 'mana', name: 'Mana', color: '#4aa3ff', max: 100, regen: 7, startFull: true },
  RAGE: { key: 'rage', name: 'Rage', color: '#ff5a3c', max: 100, regen: -3, startFull: false, onHitGain: 9, onTakeGain: 6 },
  ENERGY: { key: 'energy', name: 'Energy', color: '#ffd24a', max: 100, regen: 18, startFull: true },
  SOUL: { key: 'soul', name: 'Soul Shards', color: '#a35cff', max: 100, regen: 5, startFull: true, onKillGain: 12 },
};

/** How many skills are equipped at once — four buttons, four keys. */
export const LOADOUT_SIZE = 4;

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
        id: 'charge', name: 'Charge', kind: 'dash', cost: 15, cooldown: 7, icon: '⚡', unlock: 0,
        desc: 'Rush forward, knocking aside and damaging everything in your path.',
        power: { distance: 11, speed: 34, damage: 30, knockback: 12, radius: 1.8 },
      },
      {
        id: 'whirlwind', name: 'Whirlwind', kind: 'aoe_self', cost: 25, cooldown: 5, icon: '🌀', unlock: 0,
        desc: 'Spin, striking all nearby enemies. Hits again after a short delay.',
        power: { radius: 4.2, damage: 34, ticks: 2, tickDelay: 0.28, knockback: 5 },
      },
      {
        id: 'shieldwall', name: 'Shield Wall', kind: 'buff', cost: 20, cooldown: 18, icon: '🛡', unlock: 0,
        desc: 'Brace for 6s: take 55% less damage and become immune to knockback.',
        power: { duration: 6, damageTaken: 0.45, rooted: false },
      },
      {
        id: 'execute', name: 'Execute', kind: 'strike', cost: 35, cooldown: 9, icon: '🗡', unlock: 0,
        desc: 'A brutal blow that deals triple damage to enemies below 35% health.',
        power: { damage: 70, range: 4.0, executeThreshold: 0.35, executeMult: 3, arc: 0.9 },
      },
      {
        id: 'thunderclap', name: 'Thunder Clap', kind: 'aoe_self', cost: 22, cooldown: 8, icon: '💥', unlock: 3,
        desc: 'Slam the ground: wide damage that slows everything caught in it.',
        power: { radius: 7.5, damage: 30, slow: 0.45, slowDuration: 4, knockback: 3, color: '#ffd08a' },
      },
      {
        id: 'rend', name: 'Rend', kind: 'strike', cost: 18, cooldown: 6, icon: '🩸', unlock: 6,
        desc: 'Open a deep wound that bleeds for heavy damage over 8s.',
        power: { damage: 30, range: 3.8, arc: 1.0, dot: { dps: 16, duration: 8 } },
      },
      {
        id: 'heroicleap', name: 'Heroic Leap', kind: 'dash', cost: 24, cooldown: 12, icon: '🦅', unlock: 10,
        desc: 'Hurl yourself forward and crash down, flattening the landing zone.',
        power: { distance: 15, speed: 30, damage: 55, knockback: 10, radius: 3.4 },
      },
      {
        id: 'battlecry', name: 'Battle Cry', kind: 'buff', cost: 30, cooldown: 26, icon: '📣', unlock: 15,
        desc: 'Roar for 10s: +35% damage and +25% attack speed.',
        power: { duration: 10, damageBonus: 0.35, attackSpeedBonus: 0.25 },
      },
    ],
    talents: [
      {
        name: 'Arms', color: '#e0714f', nodes: [
          { id: 'w_a1', name: 'Heavy Blade', desc: '+6% melee damage per rank.', max: 8, effect: { meleeDamage: 0.06 } },
          { id: 'w_a2', name: 'Deep Wounds', desc: 'Crits apply a bleed for 30% weapon damage over 3s.', max: 4, effect: { bleedPct: 0.30 } },
          { id: 'w_a3', name: 'Sharpen', desc: '+3% crit chance per rank.', max: 6, effect: { critChance: 0.03 } },
          { id: 'w_a4', name: 'Overpower', desc: 'Execute threshold +8% per rank.', max: 4, effect: { executeThreshold: 0.08 } },
          { id: 'w_a5', name: 'Cleave', desc: 'Area effects reach 8% further per rank.', max: 5, effect: { aoeRadius: 0.08 } },
          { id: 'w_a6', name: 'Bladestorm', desc: '+15% damage and +15% attack speed.', max: 1, effect: { allDamage: 0.15, attackSpeed: 0.15 } },
        ],
      },
      {
        name: 'Fury', color: '#ff9d5c', nodes: [
          { id: 'w_f1', name: 'Frenzy', desc: '+5% attack speed per rank.', max: 8, effect: { attackSpeed: 0.05 } },
          { id: 'w_f2', name: 'Blood Craze', desc: 'Heal 3% of damage dealt per rank.', max: 5, effect: { lifesteal: 0.03 } },
          { id: 'w_f3', name: 'Unbridled', desc: '+15 max Rage and +2 Rage per hit, per rank.', max: 4, effect: { resourceMax: 15, onHitGain: 2 } },
          { id: 'w_f4', name: 'Rampage', desc: 'Each kill grants +6% move speed for 4s, stacking 5x.', max: 1, effect: { rampage: 1 } },
          { id: 'w_f5', name: 'Butchery', desc: 'Restore 8 health per kill, per rank.', max: 5, effect: { killHeal: 8 } },
          { id: 'w_f6', name: 'Undying Rage', desc: 'Take 10% less damage and gain 6% lifesteal.', max: 1, effect: { damageReduction: 0.10, lifesteal: 0.06 } },
        ],
      },
      {
        name: 'Protection', color: '#8fb3ff', nodes: [
          { id: 'w_p1', name: 'Toughness', desc: '+22 max health per rank.', max: 8, effect: { maxHp: 22 } },
          { id: 'w_p2', name: 'Plate Skin', desc: '+3% armor per rank.', max: 6, effect: { armor: 0.03 } },
          { id: 'w_p3', name: 'Second Wind', desc: 'Regenerate 1 hp/s per rank out of combat.', max: 4, effect: { regen: 1 } },
          { id: 'w_p4', name: 'Last Stand', desc: 'Survive a lethal hit once per wave at 25% hp.', max: 1, effect: { cheatDeath: 1 } },
          { id: 'w_p5', name: 'Spiked Armor', desc: 'Reflect 10% of damage taken per rank.', max: 5, effect: { thorns: 0.10 } },
          { id: 'w_p6', name: 'Giant Slayer', desc: '+25% damage to bosses, -8% damage taken.', max: 1, effect: { bossDamage: 0.25, damageReduction: 0.08 } },
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
        id: 'fireball', name: 'Fireball', kind: 'projectile', cost: 18, cooldown: 1.6, icon: '🔥', unlock: 0,
        desc: 'Hurl a fireball that explodes on impact.',
        power: { damage: 46, speed: 26, radius: 3.4, gravity: 2, color: '#ff8a3c', size: 0.42, burn: 12 },
      },
      {
        id: 'frostnova', name: 'Frost Nova', kind: 'aoe_self', cost: 22, cooldown: 9, icon: '❄', unlock: 0,
        desc: 'Freeze nearby enemies solid for 2.5s and chill them afterwards.',
        power: { radius: 6, damage: 18, freeze: 2.5, slow: 0.45, slowDuration: 3, color: '#8fe3ff' },
      },
      {
        id: 'blink', name: 'Blink', kind: 'dash', cost: 14, cooldown: 6, icon: '✦', unlock: 0,
        desc: 'Teleport 9 blocks forward, passing through enemies.',
        power: { distance: 9, speed: 90, damage: 0, phase: true, invuln: 0.35 },
      },
      {
        id: 'meteor', name: 'Meteor', kind: 'aoe_target', cost: 40, cooldown: 14, icon: '☄', unlock: 0,
        desc: 'Call a meteor onto your target area for massive damage.',
        power: { damage: 120, radius: 6.5, delay: 1.0, range: 28, burn: 20, color: '#ff6a2c' },
      },
      {
        id: 'arcaneorb', name: 'Arcane Orb', kind: 'chain', cost: 24, cooldown: 5, icon: '🔮', unlock: 3,
        desc: 'An orb that bounces between four targets, fading as it goes.',
        power: { damage: 44, jumps: 4, range: 24, jumpRange: 9, falloff: 0.85, color: '#c98fff' },
      },
      {
        id: 'flamestrike', name: 'Flamestrike', kind: 'aoe_target', cost: 28, cooldown: 8, icon: '🌋', unlock: 6,
        desc: 'A pillar of flame at the targeted spot that sets everything alight.',
        power: { damage: 66, radius: 5.0, delay: 0.7, range: 26, burn: 26, color: '#ff9a4c' },
      },
      {
        id: 'blizzard', name: 'Blizzard', kind: 'zone', cost: 34, cooldown: 13, icon: '🌨', unlock: 10,
        desc: 'A freezing storm that grinds down and slows anything inside it for 7s.',
        power: { radius: 6.5, dps: 30, duration: 7, slow: 0.45, range: 26, delay: 0.5, color: '#8fe3ff' },
      },
      {
        id: 'timewarp', name: 'Time Warp', kind: 'buff', cost: 32, cooldown: 30, icon: '⏳', unlock: 15,
        desc: 'Bend time for 8s: +40% move and +40% attack speed.',
        power: { duration: 8, moveSpeed: 0.40, attackSpeedBonus: 0.40 },
      },
    ],
    talents: [
      {
        name: 'Fire', color: '#ff8a3c', nodes: [
          { id: 'm_f1', name: 'Ignite', desc: 'Burn effects deal 16% more damage per rank.', max: 6, effect: { burnDamage: 0.16 } },
          { id: 'm_f2', name: 'Combustion', desc: '+4% crit chance per rank.', max: 5, effect: { critChance: 0.04 } },
          { id: 'm_f3', name: 'Pyroclasm', desc: 'Explosion radius +8% per rank.', max: 5, effect: { aoeRadius: 0.08 } },
          { id: 'm_f4', name: 'Living Bomb', desc: 'Enemies killed by fire explode for 40 damage.', max: 1, effect: { corpseExplode: 40 } },
          { id: 'm_f5', name: 'Conflagrate', desc: '+8% spell damage per rank.', max: 6, effect: { spellDamage: 0.08 } },
          { id: 'm_f6', name: 'Firelord', desc: '+25% damage to bosses and +20% crit damage.', max: 1, effect: { bossDamage: 0.25, critMult: 0.20 } },
        ],
      },
      {
        name: 'Frost', color: '#8fe3ff', nodes: [
          { id: 'm_i1', name: 'Permafrost', desc: 'Slows last 0.5s longer per rank.', max: 5, effect: { slowDuration: 0.5 } },
          { id: 'm_i2', name: 'Ice Barrier', desc: 'Gain a 30 point absorb shield per rank on Blink.', max: 4, effect: { blinkShield: 30 } },
          { id: 'm_i3', name: 'Shatter', desc: '+25% damage to frozen targets per rank.', max: 5, effect: { frozenDamage: 0.25 } },
          { id: 'm_i4', name: 'Cold Snap', desc: 'Frost Nova also resets Blink.', max: 1, effect: { coldSnap: 1 } },
          { id: 'm_i5', name: 'Frozen Core', desc: '+16 max health and +2% armor per rank.', max: 6, effect: { maxHp: 16, armor: 0.02 } },
          { id: 'm_i6', name: 'Absolute Zero', desc: 'Take 12% less damage and reflect 15% of it.', max: 1, effect: { damageReduction: 0.12, thorns: 0.15 } },
        ],
      },
      {
        name: 'Arcane', color: '#c98fff', nodes: [
          { id: 'm_a1', name: 'Clarity', desc: '+3 mana regen per rank.', max: 6, effect: { resourceRegen: 3 } },
          { id: 'm_a2', name: 'Arcane Mind', desc: '+15 max mana per rank.', max: 6, effect: { resourceMax: 15 } },
          { id: 'm_a3', name: 'Focus', desc: '-5% skill cooldowns per rank.', max: 6, effect: { cooldownReduction: 0.05 } },
          { id: 'm_a4', name: 'Missile Barrage', desc: 'Basic attack fires 2 extra bolts.', max: 1, effect: { extraProjectiles: 2 } },
          { id: 'm_a5', name: 'Frugality', desc: 'Skills cost 5% less per rank.', max: 5, effect: { costReduction: 0.05 } },
          { id: 'm_a6', name: 'Time Anomaly', desc: 'Kills restore 10 mana and speed you up.', max: 1, effect: { onKillGain: 10, moveSpeed: 0.08 } },
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
        id: 'corruption', name: 'Corruption', kind: 'projectile', cost: 14, cooldown: 1.2, icon: '☠', unlock: 0,
        desc: 'Infect a target with rot: heavy damage over 6s that spreads on death.',
        power: { damage: 10, speed: 30, radius: 1.2, dot: { dps: 16, duration: 6 }, spread: 1, color: '#8f4dff', size: 0.3 },
      },
      {
        id: 'drainlife', name: 'Drain Life', kind: 'cone', cost: 20, cooldown: 6, icon: '🩸', unlock: 0,
        desc: 'Siphon life from everything in front of you, healing for 60% of it.',
        power: { damage: 52, range: 11, angle: 0.5, lifesteal: 0.6, color: '#c0392b' },
      },
      {
        id: 'summonimp', name: 'Summon Fiend', kind: 'summon', cost: 30, cooldown: 20, icon: '👹', unlock: 0,
        desc: 'Summon a fiend that fights for you for 25s. Stacks up to 3.',
        power: { duration: 25, hp: 70, damage: 18, maxPets: 3, speed: 6.0 },
      },
      {
        id: 'shadowfury', name: 'Shadowfury', kind: 'aoe_target', cost: 34, cooldown: 13, icon: '🌑', unlock: 0,
        desc: 'Erupt shadow at a location, stunning and detonating all rot effects.',
        power: { damage: 60, radius: 6, delay: 0.5, range: 22, stun: 2, detonate: 1, color: '#6a2fb5' },
      },
      {
        id: 'chaosbolt', name: 'Chaos Bolt', kind: 'projectile', cost: 26, cooldown: 4, icon: '💜', unlock: 3,
        desc: 'A slow bolt of raw chaos that detonates for very heavy damage.',
        power: { damage: 86, speed: 24, radius: 2.6, color: '#b06cff', size: 0.44 },
      },
      {
        id: 'howl', name: 'Howl of Terror', kind: 'aoe_self', cost: 22, cooldown: 12, icon: '😱', unlock: 6,
        desc: 'A scream that roots everything around you for 2.5s.',
        power: { radius: 8.5, damage: 24, root: 2.5, color: '#6a2fb5' },
      },
      {
        id: 'rainoffire', name: 'Rain of Fire', kind: 'zone', cost: 34, cooldown: 12, icon: '🔥', unlock: 10,
        desc: 'Fel fire pours onto the targeted ground for 7s.',
        power: { radius: 6.0, dps: 34, duration: 7, range: 24, delay: 0.5, color: '#ff6a2c' },
      },
      {
        id: 'soulharvest', name: 'Soul Harvest', kind: 'heal', cost: 28, cooldown: 22, icon: '💀', unlock: 15,
        desc: 'Devour stolen souls: heal 45 instantly and 9 hp/s for 8s.',
        power: { instant: 45, healPerSecond: 9, duration: 8 },
      },
    ],
    talents: [
      {
        name: 'Affliction', color: '#8f4dff', nodes: [
          { id: 'k_a1', name: 'Virulence', desc: 'Damage-over-time effects tick 10% harder per rank.', max: 8, effect: { dotDamage: 0.10 } },
          { id: 'k_a2', name: 'Contagion', desc: 'Rot spreads to 1 extra enemy per rank on death.', max: 3, effect: { spread: 1 } },
          { id: 'k_a3', name: 'Siphon', desc: 'DoTs heal you for 5% of their damage per rank.', max: 4, effect: { dotLifesteal: 0.05 } },
          { id: 'k_a4', name: 'Unstable Rot', desc: 'Rot lasts 3s longer and cannot be cleansed.', max: 1, effect: { dotDuration: 3 } },
          { id: 'k_a5', name: 'Pandemic', desc: 'Rot lasts 0.8s longer per rank.', max: 6, effect: { dotDuration: 0.8 } },
          { id: 'k_a6', name: 'Soul Rot', desc: '+25% boss damage; kills restore 10 health.', max: 1, effect: { bossDamage: 0.25, killHeal: 10 } },
        ],
      },
      {
        name: 'Demonology', color: '#ff6bb5', nodes: [
          { id: 'k_d1', name: 'Fel Bond', desc: 'Fiends gain +16% health and damage per rank.', max: 8, effect: { petPower: 0.16 } },
          { id: 'k_d2', name: 'Master Summoner', desc: '+1 max Fiend per rank.', max: 3, effect: { maxPets: 1 } },
          { id: 'k_d3', name: 'Soul Link', desc: 'Redirect 8% of damage taken to your fiends per rank.', max: 4, effect: { soulLink: 0.08 } },
          { id: 'k_d4', name: 'Demonic Rebirth', desc: 'Fiends resummon free when they die (30s).', max: 1, effect: { petRebirth: 1 } },
          { id: 'k_d5', name: 'Demon Skin', desc: '+18 max health and +2% armor per rank.', max: 6, effect: { maxHp: 18, armor: 0.02 } },
          { id: 'k_d6', name: 'Metamorphosis', desc: '+18% damage and 10% lifesteal.', max: 1, effect: { allDamage: 0.18, lifesteal: 0.10 } },
        ],
      },
      {
        name: 'Destruction', color: '#ff8a3c', nodes: [
          { id: 'k_s1', name: 'Ruin', desc: '+10% crit damage per rank.', max: 6, effect: { critMult: 0.10 } },
          { id: 'k_s2', name: 'Backdraft', desc: '-6% cooldowns per rank.', max: 5, effect: { cooldownReduction: 0.06 } },
          { id: 'k_s3', name: 'Harvester', desc: 'Kills restore +6 Soul Shards per rank.', max: 4, effect: { onKillGain: 6 } },
          { id: 'k_s4', name: 'Cataclysm', desc: 'Shadowfury radius +50% and it always crits.', max: 1, effect: { cataclysm: 1 } },
          { id: 'k_s5', name: 'Devastation', desc: '+7% spell damage per rank.', max: 8, effect: { spellDamage: 0.07 } },
          { id: 'k_s6', name: 'Soulfire', desc: 'Fire and shadow burn 40% hotter; area +15%.', max: 1, effect: { burnDamage: 0.40, aoeRadius: 0.15 } },
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
        id: 'chainlightning', name: 'Chain Lightning', kind: 'chain', cost: 22, cooldown: 3.5, icon: '⚡', unlock: 0,
        desc: 'Lightning arcs to 4 nearby enemies, losing 20% damage per jump.',
        power: { damage: 48, jumps: 4, range: 22, jumpRange: 9, falloff: 0.8, color: '#7ef0ff' },
      },
      {
        id: 'earthshock', name: 'Earth Shock', kind: 'aoe_self', cost: 20, cooldown: 7, icon: '🪨', unlock: 0,
        desc: 'Shockwave that damages and roots enemies around you for 2s.',
        power: { radius: 6.5, damage: 40, root: 2, knockback: 3, color: '#c9a06a' },
      },
      {
        id: 'healingtotem', name: 'Healing Totem', kind: 'summon', cost: 26, cooldown: 16, icon: '🌿', unlock: 0,
        desc: 'Plant a totem that heals you for 9 hp/s within 8 blocks for 14s.',
        power: { duration: 14, totem: 'heal', healPerSecond: 9, radius: 8, hp: 40 },
      },
      {
        id: 'stormstrike', name: 'Stormstrike', kind: 'strike', cost: 18, cooldown: 5, icon: '🌩', unlock: 0,
        desc: 'Charged melee blow that also zaps two extra targets.',
        power: { damage: 58, range: 4.2, arc: 1.1, chain: 2, chainDamage: 28, color: '#7ef0ff' },
      },
      {
        id: 'lavaburst', name: 'Lava Burst', kind: 'projectile', cost: 24, cooldown: 5, icon: '🌋', unlock: 3,
        desc: 'A molten bolt that erupts on impact and sets the target burning.',
        power: { damage: 70, speed: 30, radius: 3.0, burn: 18, color: '#ff7a3c', size: 0.38 },
      },
      {
        id: 'searingtotem', name: 'Searing Totem', kind: 'summon', cost: 24, cooldown: 18, icon: '🗿', unlock: 6,
        desc: 'A totem that scorches everything within 10 blocks for 16s.',
        power: { duration: 16, totem: 'fire', damagePerSecond: 24, radius: 10, hp: 45 },
      },
      {
        id: 'thunderstorm', name: 'Thunderstorm', kind: 'aoe_self', cost: 30, cooldown: 11, icon: '⛈', unlock: 10,
        desc: 'Call down a storm that blasts everything around you away.',
        power: { radius: 9, damage: 56, knockback: 10, color: '#7ef0ff' },
      },
      {
        id: 'ghostwolf', name: 'Spirit Wolf', kind: 'buff', cost: 20, cooldown: 20, icon: '🐺', unlock: 15,
        desc: 'Take spirit form for 8s: +50% move speed and 25% dodge.',
        power: { duration: 8, moveSpeed: 0.5, dodge: 0.25 },
      },
    ],
    talents: [
      {
        name: 'Elemental', color: '#7ef0ff', nodes: [
          { id: 's_e1', name: 'Concussion', desc: '+7% spell damage per rank.', max: 7, effect: { spellDamage: 0.07 } },
          { id: 's_e2', name: 'Elemental Focus', desc: '+4% crit chance per rank.', max: 5, effect: { critChance: 0.04 } },
          { id: 's_e3', name: 'Storm Reach', desc: 'Chain Lightning gains +1 jump per rank.', max: 4, effect: { jumps: 1 } },
          { id: 's_e4', name: 'Overload', desc: 'Chain Lightning has a 30% chance to fire twice.', max: 1, effect: { overload: 0.3 } },
          { id: 's_e5', name: 'Elemental Reach', desc: 'Area effects reach 8% further per rank.', max: 5, effect: { aoeRadius: 0.08 } },
          { id: 's_e6', name: 'Ascendance', desc: '+20% crit damage and -10% cooldowns.', max: 1, effect: { critMult: 0.20, cooldownReduction: 0.10 } },
        ],
      },
      {
        name: 'Enhancement', color: '#ffd98a', nodes: [
          { id: 's_h1', name: 'Flurry', desc: '+6% attack speed per rank.', max: 7, effect: { attackSpeed: 0.06 } },
          { id: 's_h2', name: 'Windfury', desc: '15% chance per rank for melee to strike twice.', max: 3, effect: { doubleStrike: 0.15 } },
          { id: 's_h3', name: 'Ghost Wolf', desc: '+5% move speed per rank.', max: 5, effect: { moveSpeed: 0.05 } },
          { id: 's_h4', name: 'Maelstrom', desc: 'Melee hits reduce Chain Lightning cooldown by 0.5s.', max: 1, effect: { maelstrom: 0.5 } },
          { id: 's_h5', name: 'Lava Lash', desc: '+7% melee damage per rank.', max: 6, effect: { meleeDamage: 0.07 } },
          { id: 's_h6', name: 'Feral Spirit', desc: 'Kills heal 9 health and grant 8% lifesteal.', max: 1, effect: { killHeal: 9, lifesteal: 0.08 } },
        ],
      },
      {
        name: 'Restoration', color: '#9dffe0', nodes: [
          { id: 's_r1', name: 'Totemic Mastery', desc: 'Totems last 3s longer per rank.', max: 4, effect: { totemDuration: 3 } },
          { id: 's_r2', name: 'Tidal Waves', desc: '+18% healing done per rank.', max: 5, effect: { healing: 0.18 } },
          { id: 's_r3', name: 'Ancestral Fortitude', desc: '+18 max health per rank.', max: 7, effect: { maxHp: 18 } },
          { id: 's_r4', name: 'Reincarnation', desc: 'Revive once per run at 40% health.', max: 1, effect: { cheatDeathRun: 0.4 } },
          { id: 's_r5', name: 'Stoneskin', desc: '+2% armor and 6% thorns per rank.', max: 6, effect: { armor: 0.02, thorns: 0.06 } },
          { id: 's_r6', name: 'Earth Shield', desc: '-12% damage taken and +2 hp/s out of combat.', max: 1, effect: { damageReduction: 0.12, regen: 2 } },
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
        id: 'smite', name: 'Smite', kind: 'projectile', cost: 16, cooldown: 1.4, icon: '✨', unlock: 0,
        desc: 'A bolt of holy light. Heals you for 20% of the damage it deals.',
        power: { damage: 44, speed: 34, radius: 1.6, lifesteal: 0.2, color: '#ffe9a8', size: 0.32 },
      },
      {
        id: 'shield', name: 'Power Word: Shield', kind: 'buff', cost: 22, cooldown: 10, icon: '🔰', unlock: 0,
        desc: 'Absorb the next 90 damage for 12s. Refresh before it breaks.',
        power: { duration: 12, absorb: 90 },
      },
      {
        id: 'renew', name: 'Renew', kind: 'heal', cost: 20, cooldown: 8, icon: '💚', unlock: 0,
        desc: 'Heal 25 instantly and 6 hp/s for 8s.',
        power: { instant: 25, healPerSecond: 6, duration: 8 },
      },
      {
        id: 'holynova', name: 'Holy Nova', kind: 'aoe_self', cost: 34, cooldown: 8, icon: '☀', unlock: 0,
        desc: 'Detonate light around you: heavy damage and it heals you per enemy hit.',
        power: { radius: 8, damage: 55, healPerHit: 4, knockback: 4, color: '#fff1c0' },
      },
      {
        id: 'mindblast', name: 'Mind Blast', kind: 'projectile', cost: 24, cooldown: 4, icon: '🧠', unlock: 3,
        desc: 'A lance of shadow that tears through a single mind.',
        power: { damage: 72, speed: 42, radius: 1.8, color: '#9a7fd8', size: 0.34 },
      },
      {
        id: 'divinestar', name: 'Divine Star', kind: 'chain', cost: 26, cooldown: 6, icon: '⭐', unlock: 6,
        desc: 'A star of light that leaps between five enemies and heals you for each.',
        power: { damage: 46, jumps: 5, range: 20, jumpRange: 9, falloff: 0.9, lifesteal: 0.15, color: '#ffe9a8' },
      },
      {
        id: 'mindsear', name: 'Mind Sear', kind: 'cone', cost: 24, cooldown: 7, icon: '👁', unlock: 10,
        desc: 'Sear every mind in a wide arc, healing for a quarter of the damage.',
        power: { damage: 58, range: 13, angle: 0.6, lifesteal: 0.25, color: '#9a7fd8' },
      },
      {
        id: 'voidform', name: 'Void Form', kind: 'buff', cost: 30, cooldown: 28, icon: '🌑', unlock: 15,
        desc: 'Enter the void for 10s: +40% damage, but you take 15% more.',
        power: { duration: 10, damageBonus: 0.40, damageTaken: 1.15 },
      },
    ],
    talents: [
      {
        name: 'Holy', color: '#ffe9a8', nodes: [
          { id: 'p_h1', name: 'Divine Fury', desc: '+7% holy damage per rank.', max: 8, effect: { spellDamage: 0.07 } },
          { id: 'p_h2', name: 'Blessed Recovery', desc: '+18% healing done per rank.', max: 5, effect: { healing: 0.18 } },
          { id: 'p_h3', name: 'Surge of Light', desc: 'Crits reduce Holy Nova cooldown by 0.6s per rank.', max: 4, effect: { critCdr: 0.6 } },
          { id: 'p_h4', name: 'Guardian Spirit', desc: 'Below 25% health, gain 40% damage reduction.', max: 1, effect: { guardianSpirit: 0.4 } },
          { id: 'p_h5', name: 'Holy Concentration', desc: '+3 mana regen per rank.', max: 6, effect: { resourceRegen: 3 } },
          { id: 'p_h6', name: 'Apotheosis', desc: '-12% cooldowns and skills cost 15% less.', max: 1, effect: { cooldownReduction: 0.12, costReduction: 0.15 } },
        ],
      },
      {
        name: 'Discipline', color: '#bcd4ff', nodes: [
          { id: 'p_d1', name: 'Mental Strength', desc: '+18 max mana per rank.', max: 6, effect: { resourceMax: 18 } },
          { id: 'p_d2', name: 'Reinforce', desc: 'Shield absorbs +25 more per rank.', max: 5, effect: { absorb: 25 } },
          { id: 'p_d3', name: 'Rapture', desc: 'When a shield breaks, restore 15 mana per rank.', max: 4, effect: { rapture: 15 } },
          { id: 'p_d4', name: 'Atonement', desc: 'Healing yourself also damages nearby enemies for 50%.', max: 1, effect: { atonement: 0.5 } },
          { id: 'p_d5', name: 'Inner Fortitude', desc: '+16 max health and +2% armor per rank.', max: 6, effect: { maxHp: 16, armor: 0.02 } },
          { id: 'p_d6', name: 'Evangelism', desc: '-14% damage taken and 12% thorns.', max: 1, effect: { damageReduction: 0.14, thorns: 0.12 } },
        ],
      },
      {
        name: 'Shadow', color: '#9a7fd8', nodes: [
          { id: 'p_s1', name: 'Shadow Weaving', desc: 'Smite applies a rot for 8 dps per rank (4s).', max: 4, effect: { smiteDot: 8 } },
          { id: 'p_s2', name: 'Spirit Tap', desc: 'Kills restore 8 mana per rank.', max: 4, effect: { onKillGain: 8 } },
          { id: 'p_s3', name: 'Shadowform', desc: '+7% damage, -5% healing per rank.', max: 5, effect: { spellDamage: 0.07, healing: -0.05 } },
          { id: 'p_s4', name: 'Dispersion', desc: 'Taking lethal damage instead grants 2s of immunity (60s).', max: 1, effect: { dispersion: 1 } },
          { id: 'p_s5', name: 'Twisted Faith', desc: '+9% crit damage per rank.', max: 8, effect: { critMult: 0.09 } },
          { id: 'p_s6', name: 'Shadow Fiend', desc: '+25% boss damage; kills heal 8 health.', max: 1, effect: { bossDamage: 0.25, killHeal: 8 } },
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
        id: 'ambush', name: 'Ambush', kind: 'dash', cost: 25, cooldown: 5, icon: '💨', unlock: 0,
        desc: 'Blink behind the nearest enemy and strike for 250% damage.',
        power: { distance: 12, speed: 70, damage: 55, behindTarget: true, invuln: 0.2, phase: true },
      },
      {
        id: 'fanofknives', name: 'Fan of Knives', kind: 'aoe_self', cost: 30, cooldown: 4, icon: '🔪', unlock: 0,
        desc: 'Throw blades in all directions, applying poison.',
        power: { radius: 7, damage: 30, dot: { dps: 9, duration: 5 }, color: '#8ce06a' },
      },
      {
        id: 'evasion', name: 'Evasion', kind: 'buff', cost: 20, cooldown: 16, icon: '🌫', unlock: 0,
        desc: 'For 5s, dodge 60% of attacks and move 30% faster.',
        power: { duration: 5, dodge: 0.6, moveSpeed: 0.3 },
      },
      {
        id: 'eviscerate', name: 'Eviscerate', kind: 'strike', cost: 35, cooldown: 6, icon: '🗡', unlock: 0,
        desc: 'A finisher that consumes all poison stacks for burst damage.',
        power: { damage: 62, range: 3.6, arc: 0.8, consumeDot: 3.0 },
      },
      {
        id: 'shuriken', name: 'Shuriken Toss', kind: 'projectile', cost: 16, cooldown: 2, icon: '🌟', unlock: 3,
        desc: 'A thrown blade for when the target will not come to you.',
        power: { damage: 42, speed: 48, radius: 1.4, dot: { dps: 8, duration: 4 }, color: '#d6ffb8', size: 0.22 },
      },
      {
        id: 'crimsontempest', name: 'Crimson Tempest', kind: 'aoe_self', cost: 32, cooldown: 9, icon: '🩸', unlock: 6,
        desc: 'Carve everything around you and leave it bleeding for 8s.',
        power: { radius: 6.5, damage: 44, dot: { dps: 12, duration: 8 }, color: '#e0473c' },
      },
      {
        id: 'smokebomb', name: 'Smoke Bomb', kind: 'zone', cost: 26, cooldown: 14, icon: '💣', unlock: 10,
        desc: 'Choking poison smoke that slows and chokes anything inside for 6s.',
        power: { radius: 5.5, dps: 26, duration: 6, slow: 0.5, range: 16, delay: 0.3, color: '#8ce06a' },
      },
      {
        id: 'shadowdance', name: 'Shadow Dance', kind: 'buff', cost: 28, cooldown: 24, icon: '🌘', unlock: 15,
        desc: 'For 6s you strike 55% faster and move 20% quicker.',
        power: { duration: 6, attackSpeedBonus: 0.55, moveSpeed: 0.20 },
      },
    ],
    talents: [
      {
        name: 'Assassination', color: '#8ce06a', nodes: [
          { id: 'r_a1', name: 'Lethality', desc: '+8% crit damage per rank.', max: 7, effect: { critMult: 0.08 } },
          { id: 'r_a2', name: 'Deadly Poison', desc: 'Poison ticks 12% harder per rank.', max: 6, effect: { dotDamage: 0.12 } },
          { id: 'r_a3', name: 'Vile Toxins', desc: 'Poison lasts 1s longer per rank.', max: 4, effect: { dotDuration: 1 } },
          { id: 'r_a4', name: 'Cold Blood', desc: 'Every 5th attack is a guaranteed critical strike.', max: 1, effect: { coldBlood: 5 } },
          { id: 'r_a5', name: 'Venomous Wounds', desc: 'DoTs heal you for 5% of their damage per rank.', max: 4, effect: { dotLifesteal: 0.05 } },
          { id: 'r_a6', name: 'Master Assassin', desc: '+25% boss damage and +12% crit chance.', max: 1, effect: { bossDamage: 0.25, critChance: 0.12 } },
        ],
      },
      {
        name: 'Combat', color: '#ffd24a', nodes: [
          { id: 'r_c1', name: 'Precision', desc: '+4% crit chance per rank.', max: 6, effect: { critChance: 0.04 } },
          { id: 'r_c2', name: 'Blade Flurry', desc: '+7% attack speed per rank.', max: 7, effect: { attackSpeed: 0.07 } },
          { id: 'r_c3', name: 'Adrenaline', desc: '+5 energy regen per rank.', max: 5, effect: { resourceRegen: 5 } },
          { id: 'r_c4', name: 'Killing Spree', desc: 'Kills refund 20 energy and 1s of all cooldowns.', max: 1, effect: { killSpree: 1 } },
          { id: 'r_c5', name: 'Savage Blades', desc: '+6% melee damage per rank.', max: 7, effect: { meleeDamage: 0.06 } },
          { id: 'r_c6', name: 'Blade Rush', desc: '-12% cooldowns and 8% lifesteal.', max: 1, effect: { cooldownReduction: 0.12, lifesteal: 0.08 } },
        ],
      },
      {
        name: 'Subtlety', color: '#9fd8ff', nodes: [
          { id: 'r_s1', name: 'Fleet Footed', desc: '+6% move speed per rank.', max: 5, effect: { moveSpeed: 0.06 } },
          { id: 'r_s2', name: 'Elusive', desc: '+4% dodge chance per rank.', max: 5, effect: { dodge: 0.04 } },
          { id: 'r_s3', name: 'Shadowstep', desc: 'Ambush cooldown -0.7s per rank.', max: 4, effect: { ambushCdr: 0.7 } },
          { id: 'r_s4', name: 'Vanish', desc: 'Dropping below 30% health instantly resets Ambush.', max: 1, effect: { vanish: 1 } },
          { id: 'r_s5', name: 'Nightstalker', desc: '+14 max health and 6% thorns per rank.', max: 6, effect: { maxHp: 14, thorns: 0.06 } },
          { id: 'r_s6', name: 'Symbols of Death', desc: '+18% damage; kills restore 8 health.', max: 1, effect: { allDamage: 0.18, killHeal: 8 } },
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

/** Skills a class can slot right now, given how far it has pushed. */
export function unlockedSkills(cls, bestWave = 0) {
  return cls.skills.filter((s) => (s.unlock || 0) <= bestWave);
}

/** The four skills every class starts with. */
export function defaultLoadout(cls) {
  return cls.skills.slice(0, LOADOUT_SIZE).map((s) => s.id);
}

/**
 * Turn a stored list of skill ids into the four skill objects the run uses.
 * Anything unknown, locked or duplicated is replaced from the default kit, so
 * a save written by an older build can never produce an empty skill slot.
 */
export function resolveLoadout(cls, ids, bestWave = 0) {
  const allowed = new Set(unlockedSkills(cls, bestWave).map((s) => s.id));
  const byId = Object.fromEntries(cls.skills.map((s) => [s.id, s]));
  const out = [];
  const used = new Set();
  for (const id of ids || []) {
    if (out.length >= LOADOUT_SIZE) break;
    if (!allowed.has(id) || used.has(id)) continue;
    used.add(id);
    out.push(byId[id]);
  }
  for (const s of cls.skills) {
    if (out.length >= LOADOUT_SIZE) break;
    if (used.has(s.id)) continue;
    used.add(s.id);
    out.push(s);
  }
  return out;
}
