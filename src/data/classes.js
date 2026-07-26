// Playable classes. Each has its own resource, base stats, weapon feel,
// four active skills and a three-branch talent tree.
//
// Skill `kind` values are interpreted by src/game/skills.js:
//   projectile | aoe_self | aoe_target | dash | buff | heal | summon | cone | chain | strike

export const RESOURCE = {
  MANA: { key: 'mana', name: 'Mana', color: '#4aa3ff', max: 100, regen: 7, startFull: true },
  RAGE: { key: 'rage', name: 'Rage', color: '#ff5a3c', max: 100, regen: -3, startFull: false, onHitGain: 9, onTakeGain: 6 },
  ENERGY: { key: 'energy', name: 'Energy', color: '#ffd24a', max: 100, regen: 18, startFull: true },
  SOUL: { key: 'soul', name: 'Soul Shards', color: '#a35cff', max: 100, regen: 5, startFull: true, onKillGain: 12 },
};

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
    ],
    talents: [
      {
        name: 'Arms', color: '#e0714f', nodes: [
          { id: 'w_a1', name: 'Heavy Blade', desc: '+8% melee damage per rank.', max: 5, effect: { meleeDamage: 0.08 } },
          { id: 'w_a2', name: 'Deep Wounds', desc: 'Crits apply a bleed for 30% weapon damage over 3s.', max: 3, effect: { bleedPct: 0.30 } },
          { id: 'w_a3', name: 'Sharpen', desc: '+4% crit chance per rank.', max: 5, effect: { critChance: 0.04 } },
          { id: 'w_a4', name: 'Overpower', desc: 'Execute threshold +8% per rank.', max: 3, effect: { executeThreshold: 0.08 } },
        ],
      },
      {
        name: 'Fury', color: '#ff9d5c', nodes: [
          { id: 'w_f1', name: 'Frenzy', desc: '+7% attack speed per rank.', max: 5, effect: { attackSpeed: 0.07 } },
          { id: 'w_f2', name: 'Blood Craze', desc: 'Heal 3% of damage dealt per rank.', max: 3, effect: { lifesteal: 0.03 } },
          { id: 'w_f3', name: 'Unbridled', desc: '+15 max Rage and +2 Rage per hit, per rank.', max: 3, effect: { resourceMax: 15, onHitGain: 2 } },
          { id: 'w_f4', name: 'Rampage', desc: 'Each kill grants +6% move speed for 4s, stacking 5x.', max: 1, effect: { rampage: 1 } },
        ],
      },
      {
        name: 'Protection', color: '#8fb3ff', nodes: [
          { id: 'w_p1', name: 'Toughness', desc: '+22 max health per rank.', max: 5, effect: { maxHp: 22 } },
          { id: 'w_p2', name: 'Plate Skin', desc: '+4% armor per rank.', max: 5, effect: { armor: 0.04 } },
          { id: 'w_p3', name: 'Second Wind', desc: 'Regenerate 1 hp/s per rank out of combat.', max: 3, effect: { regen: 1 } },
          { id: 'w_p4', name: 'Last Stand', desc: 'Survive a lethal hit once per wave at 25% hp.', max: 1, effect: { cheatDeath: 1 } },
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
    ],
    talents: [
      {
        name: 'Fire', color: '#ff8a3c', nodes: [
          { id: 'm_f1', name: 'Ignite', desc: 'Burn effects deal 20% more damage per rank.', max: 5, effect: { burnDamage: 0.20 } },
          { id: 'm_f2', name: 'Combustion', desc: '+6% crit chance with fire per rank.', max: 3, effect: { critChance: 0.06 } },
          { id: 'm_f3', name: 'Pyroclasm', desc: 'Explosion radius +10% per rank.', max: 3, effect: { aoeRadius: 0.10 } },
          { id: 'm_f4', name: 'Living Bomb', desc: 'Enemies killed by fire explode for 40 damage.', max: 1, effect: { corpseExplode: 40 } },
        ],
      },
      {
        name: 'Frost', color: '#8fe3ff', nodes: [
          { id: 'm_i1', name: 'Permafrost', desc: 'Slows last 0.5s longer per rank.', max: 3, effect: { slowDuration: 0.5 } },
          { id: 'm_i2', name: 'Ice Barrier', desc: 'Gain a 30 point absorb shield per rank on Blink.', max: 3, effect: { blinkShield: 30 } },
          { id: 'm_i3', name: 'Shatter', desc: '+25% damage to frozen targets per rank.', max: 3, effect: { frozenDamage: 0.25 } },
          { id: 'm_i4', name: 'Cold Snap', desc: 'Frost Nova also resets Blink.', max: 1, effect: { coldSnap: 1 } },
        ],
      },
      {
        name: 'Arcane', color: '#c98fff', nodes: [
          { id: 'm_a1', name: 'Clarity', desc: '+3 mana regen per rank.', max: 5, effect: { resourceRegen: 3 } },
          { id: 'm_a2', name: 'Arcane Mind', desc: '+15 max mana per rank.', max: 5, effect: { resourceMax: 15 } },
          { id: 'm_a3', name: 'Focus', desc: '-6% skill cooldowns per rank.', max: 5, effect: { cooldownReduction: 0.06 } },
          { id: 'm_a4', name: 'Missile Barrage', desc: 'Basic attack fires 2 extra bolts.', max: 1, effect: { extraProjectiles: 2 } },
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
    ],
    talents: [
      {
        name: 'Affliction', color: '#8f4dff', nodes: [
          { id: 'k_a1', name: 'Virulence', desc: 'Damage-over-time effects tick 12% harder per rank.', max: 5, effect: { dotDamage: 0.12 } },
          { id: 'k_a2', name: 'Contagion', desc: 'Rot spreads to 1 extra enemy per rank on death.', max: 3, effect: { spread: 1 } },
          { id: 'k_a3', name: 'Siphon', desc: 'DoTs heal you for 6% of their damage per rank.', max: 3, effect: { dotLifesteal: 0.06 } },
          { id: 'k_a4', name: 'Unstable Rot', desc: 'Rot lasts 3s longer and cannot be cleansed.', max: 1, effect: { dotDuration: 3 } },
        ],
      },
      {
        name: 'Demonology', color: '#ff6bb5', nodes: [
          { id: 'k_d1', name: 'Fel Bond', desc: 'Fiends gain +20% health and damage per rank.', max: 5, effect: { petPower: 0.20 } },
          { id: 'k_d2', name: 'Master Summoner', desc: '+1 max Fiend per rank.', max: 2, effect: { maxPets: 1 } },
          { id: 'k_d3', name: 'Soul Link', desc: 'Redirect 8% of damage taken to your fiends per rank.', max: 3, effect: { soulLink: 0.08 } },
          { id: 'k_d4', name: 'Demonic Rebirth', desc: 'Fiends resummon free when they die (30s).', max: 1, effect: { petRebirth: 1 } },
        ],
      },
      {
        name: 'Destruction', color: '#ff8a3c', nodes: [
          { id: 'k_s1', name: 'Ruin', desc: '+12% crit damage per rank.', max: 5, effect: { critMult: 0.12 } },
          { id: 'k_s2', name: 'Backdraft', desc: '-7% cooldowns per rank.', max: 4, effect: { cooldownReduction: 0.07 } },
          { id: 'k_s3', name: 'Harvester', desc: 'Kills restore +6 Soul Shards per rank.', max: 3, effect: { onKillGain: 6 } },
          { id: 'k_s4', name: 'Cataclysm', desc: 'Shadowfury radius +50% and it always crits.', max: 1, effect: { cataclysm: 1 } },
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
    ],
    talents: [
      {
        name: 'Elemental', color: '#7ef0ff', nodes: [
          { id: 's_e1', name: 'Concussion', desc: '+9% spell damage per rank.', max: 5, effect: { spellDamage: 0.09 } },
          { id: 's_e2', name: 'Elemental Focus', desc: '+5% crit chance per rank.', max: 4, effect: { critChance: 0.05 } },
          { id: 's_e3', name: 'Storm Reach', desc: 'Chain Lightning gains +1 jump per rank.', max: 3, effect: { jumps: 1 } },
          { id: 's_e4', name: 'Overload', desc: 'Chain Lightning has a 30% chance to fire twice.', max: 1, effect: { overload: 0.3 } },
        ],
      },
      {
        name: 'Enhancement', color: '#ffd98a', nodes: [
          { id: 's_h1', name: 'Flurry', desc: '+8% attack speed per rank.', max: 5, effect: { attackSpeed: 0.08 } },
          { id: 's_h2', name: 'Windfury', desc: '15% chance per rank for melee to strike twice.', max: 3, effect: { doubleStrike: 0.15 } },
          { id: 's_h3', name: 'Ghost Wolf', desc: '+6% move speed per rank.', max: 4, effect: { moveSpeed: 0.06 } },
          { id: 's_h4', name: 'Maelstrom', desc: 'Melee hits reduce Chain Lightning cooldown by 0.5s.', max: 1, effect: { maelstrom: 0.5 } },
        ],
      },
      {
        name: 'Restoration', color: '#9dffe0', nodes: [
          { id: 's_r1', name: 'Totemic Mastery', desc: 'Totems last 3s longer per rank.', max: 3, effect: { totemDuration: 3 } },
          { id: 's_r2', name: 'Tidal Waves', desc: '+20% healing done per rank.', max: 4, effect: { healing: 0.20 } },
          { id: 's_r3', name: 'Ancestral Fortitude', desc: '+18 max health per rank.', max: 5, effect: { maxHp: 18 } },
          { id: 's_r4', name: 'Reincarnation', desc: 'Revive once per run at 40% health.', max: 1, effect: { cheatDeathRun: 0.4 } },
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
    ],
    talents: [
      {
        name: 'Holy', color: '#ffe9a8', nodes: [
          { id: 'p_h1', name: 'Divine Fury', desc: '+9% holy damage per rank.', max: 5, effect: { spellDamage: 0.09 } },
          { id: 'p_h2', name: 'Blessed Recovery', desc: '+20% healing done per rank.', max: 4, effect: { healing: 0.20 } },
          { id: 'p_h3', name: 'Surge of Light', desc: 'Crits reduce Holy Nova cooldown by 0.6s per rank.', max: 3, effect: { critCdr: 0.6 } },
          { id: 'p_h4', name: 'Guardian Spirit', desc: 'Below 25% health, gain 40% damage reduction.', max: 1, effect: { guardianSpirit: 0.4 } },
        ],
      },
      {
        name: 'Discipline', color: '#bcd4ff', nodes: [
          { id: 'p_d1', name: 'Mental Strength', desc: '+18 max mana per rank.', max: 5, effect: { resourceMax: 18 } },
          { id: 'p_d2', name: 'Reinforce', desc: 'Shield absorbs +25 more per rank.', max: 4, effect: { absorb: 25 } },
          { id: 'p_d3', name: 'Rapture', desc: 'When a shield breaks, restore 15 mana per rank.', max: 3, effect: { rapture: 15 } },
          { id: 'p_d4', name: 'Atonement', desc: 'Healing yourself also damages nearby enemies for 50%.', max: 1, effect: { atonement: 0.5 } },
        ],
      },
      {
        name: 'Shadow', color: '#9a7fd8', nodes: [
          { id: 'p_s1', name: 'Shadow Weaving', desc: 'Smite applies a rot for 8 dps per rank (4s).', max: 3, effect: { smiteDot: 8 } },
          { id: 'p_s2', name: 'Spirit Tap', desc: 'Kills restore 8 mana per rank.', max: 3, effect: { onKillGain: 8 } },
          { id: 'p_s3', name: 'Shadowform', desc: '+8% damage, -6% healing per rank.', max: 4, effect: { spellDamage: 0.08, healing: -0.06 } },
          { id: 'p_s4', name: 'Dispersion', desc: 'Taking lethal damage instead grants 2s of immunity (60s).', max: 1, effect: { dispersion: 1 } },
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
    ],
    talents: [
      {
        name: 'Assassination', color: '#8ce06a', nodes: [
          { id: 'r_a1', name: 'Lethality', desc: '+10% crit damage per rank.', max: 5, effect: { critMult: 0.10 } },
          { id: 'r_a2', name: 'Deadly Poison', desc: 'Poison ticks 15% harder per rank.', max: 4, effect: { dotDamage: 0.15 } },
          { id: 'r_a3', name: 'Vile Toxins', desc: 'Poison lasts 1s longer per rank.', max: 3, effect: { dotDuration: 1 } },
          { id: 'r_a4', name: 'Cold Blood', desc: 'Every 5th attack is a guaranteed critical strike.', max: 1, effect: { coldBlood: 5 } },
        ],
      },
      {
        name: 'Combat', color: '#ffd24a', nodes: [
          { id: 'r_c1', name: 'Precision', desc: '+5% crit chance per rank.', max: 5, effect: { critChance: 0.05 } },
          { id: 'r_c2', name: 'Blade Flurry', desc: '+9% attack speed per rank.', max: 5, effect: { attackSpeed: 0.09 } },
          { id: 'r_c3', name: 'Adrenaline', desc: '+5 energy regen per rank.', max: 4, effect: { resourceRegen: 5 } },
          { id: 'r_c4', name: 'Killing Spree', desc: 'Kills refund 20 energy and 1s of all cooldowns.', max: 1, effect: { killSpree: 1 } },
        ],
      },
      {
        name: 'Subtlety', color: '#9fd8ff', nodes: [
          { id: 'r_s1', name: 'Fleet Footed', desc: '+7% move speed per rank.', max: 4, effect: { moveSpeed: 0.07 } },
          { id: 'r_s2', name: 'Elusive', desc: '+5% dodge chance per rank.', max: 4, effect: { dodge: 0.05 } },
          { id: 'r_s3', name: 'Shadowstep', desc: 'Ambush cooldown -0.7s per rank.', max: 3, effect: { ambushCdr: 0.7 } },
          { id: 'r_s4', name: 'Vanish', desc: 'Dropping below 30% health instantly resets Ambush.', max: 1, effect: { vanish: 1 } },
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
