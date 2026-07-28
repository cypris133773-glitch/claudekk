// Skill execution. Every class skill routes through castSkill() and is
// resolved by its `kind`, so new skills are pure data in src/data/classes.js.

import { forwardVec, clamp, rand } from '../core/math.js';
import { Fiend, Totem } from './pets.js';
import { TEAM } from './entity.js';

/** Scale a skill's numbers by the player's current modifiers. */
function power(player, skill) {
  const p = { ...skill.power };
  const m = player.mods;
  const dmgMult = skill.kind === 'strike' || skill.kind === 'dash'
    ? player.stats.meleeMult
    : player.stats.spellMult;
  if (p.damage) p.damage *= dmgMult;
  if (p.chainDamage) p.chainDamage *= dmgMult;
  if (p.radius) p.radius *= 1 + (m.aoeRadius || 0);
  if (p.dot) p.dot = { ...p.dot, dps: p.dot.dps * (1 + (m.dotDamage || 0)) * dmgMult, duration: p.dot.duration + (m.dotDuration || 0) };
  // Ground zones tick like a damage-over-time effect, so they scale with the
  // same talents rather than being the one skill kind talents cannot touch.
  if (p.dps) {
    p.dps *= (1 + (m.dotDamage || 0)) * dmgMult;
    p.duration += m.dotDuration || 0;
  }
  if (p.damagePerSecond) p.damagePerSecond *= dmgMult;
  if (p.burn) p.burn *= (1 + (m.burnDamage || 0)) * dmgMult;
  if (p.healPerSecond) p.healPerSecond *= player.stats.healMult;
  if (p.instant) p.instant *= player.stats.healMult;
  if (p.absorb) p.absorb = (p.absorb + (m.absorb || 0)) * player.stats.healMult;
  if (p.duration && (m.totemDuration || 0) && (p.totem)) p.duration += m.totemDuration;
  if (p.jumps) p.jumps += m.jumps || 0;
  if (p.maxPets) p.maxPets += m.maxPets || 0;
  if (p.executeThreshold) p.executeThreshold += m.executeThreshold || 0;
  if (p.hp && (m.petPower || 0)) p.hp *= 1 + m.petPower;
  if (p.damage && p.hp && (m.petPower || 0)) p.damage *= 1 + m.petPower;
  return p;
}

export function skillCooldown(player, skill) {
  let cd = skill.cooldown * (1 - clamp(player.mods.cooldownReduction || 0, 0, 0.6));
  if (skill.id === 'ambush' && player.mods.ambushCdr) cd = Math.max(1, cd - player.mods.ambushCdr);
  return cd;
}

export function skillCost(player, skill) {
  return Math.max(0, skill.cost * (1 - (player.mods.costReduction || 0)));
}

/** Returns true if the skill was cast. */
export function castSkill(game, player, index) {
  const skill = player.skills[index];
  if (!skill) return false;
  if (player.cooldowns[index] > 0) return false;
  const cost = skillCost(player, skill);
  if (player.resource < cost) { game.notify('Not enough ' + player.cls.resource.name); return false; }
  if (player.disabled) return false;

  const p = power(player, skill);
  const dir = forwardVec(player.yaw, player.pitch);
  const ex = player.x, ey = player.eyeY, ez = player.z;

  switch (skill.kind) {
    case 'projectile': {
      let dot = p.dot;
      // Shadow Weaving: Smite carries a shadow rot.
      if (skill.id === 'smite' && player.mods.smiteDot) {
        dot = {
          dps: player.mods.smiteDot * (1 + (player.mods.dotDamage || 0)),
          duration: 4 + (player.mods.dotDuration || 0),
          type: 'shadow',
        };
      }
      game.fireProjectile({
        owner: player, team: TEAM.PLAYER,
        x: ex, y: ey - 0.2, z: ez, dir,
        speed: p.speed, damage: p.damage, radius: p.radius, size: p.size,
        color: p.color, gravity: p.gravity || 0, dot, burn: p.burn,
        lifesteal: p.lifesteal, skillId: skill.id,
      });
      game.sfx('cast');
      break;
    }

    case 'aoe_self': {
      const ticks = p.ticks || 1;
      for (let t = 0; t < ticks; t++) {
        const delay = t * (p.tickDelay || 0);
        game.delay(delay, () => {
          if (player.dead) return;
          game.shockwave(player.x, player.y, player.z, p.radius, p.color || player.cls.color);
          const hits = game.enemiesInRadius(player.x, player.centerY, player.z, p.radius);
          // Per-enemy self-healing has to be capped: a late wave puts 25 mobs
          // in one nova, which out-heals everything the arena can do back and
          // turns the fight into a stalemate the player cannot lose.
          let healHits = 0;
          for (const m of hits) {
            const dx = m.x - player.x, dz = m.z - player.z;
            const d = Math.hypot(dx, dz) || 1;
            game.dealDamage(player, m, p.damage, {
              knockback: p.knockback || 0, kx: dx / d, kz: dz / d, skillId: skill.id,
            });
            if (p.freeze) m.freeze = Math.max(m.freeze, p.freeze);
            if (p.root) m.root = Math.max(m.root, p.root);
            if (p.slow) m.applySlow(p.slow, (p.slowDuration || 2) + (player.mods.slowDuration || 0));
            if (p.dot) m.applyDot(p.dot.dps, p.dot.duration, 'poison', player);
            if (p.healPerHit && healHits < 8) {
              healHits++;
              player.heal(p.healPerHit * player.stats.healMult);
            }
          }
          if (skill.id === 'frostnova' && player.mods.coldSnap) {
            const blinkIdx = player.skills.findIndex((s) => s.id === 'blink');
            if (blinkIdx >= 0) player.cooldowns[blinkIdx] = 0;
          }
        });
      }
      game.sfx('nova');
      break;
    }

    // A lingering ground effect: Blizzard, Rain of Fire, Smoke Bomb. Unlike
    // aoe_target this deals no burst — it denies an area for several seconds,
    // which is what makes the horde route around you instead of through you.
    case 'zone': {
      const zrange = p.range || 22;
      const zhit = game.world.raycast(ex, ey, ez, dir[0], dir[1], dir[2], zrange);
      const zx = ex + dir[0] * zhit;
      const zz = ez + dir[2] * zhit;
      const zy = game.world.groundAt(zx, zz, ey + 2);
      game.telegraph(zx, zy, zz, p.radius, p.delay || 0.4, () => {
        game.spawnZone(zx, zy, zz, {
          radius: p.radius, dps: p.dps, duration: p.duration,
          team: TEAM.PLAYER, source: player, color: p.color, slow: p.slow || 0,
        });
      }, p.color);
      game.sfx('cast');
      break;
    }

    case 'aoe_target': {
      const range = p.range || 24;
      const hitDist = game.world.raycast(ex, ey, ez, dir[0], dir[1], dir[2], range);
      let tx = ex + dir[0] * hitDist;
      let tz = ez + dir[2] * hitDist;
      let ty = game.world.groundAt(tx, tz, ey + 2);
      const radius = p.radius * (player.mods.cataclysm && skill.id === 'shadowfury' ? 1.5 : 1);
      game.telegraph(tx, ty, tz, radius, p.delay, () => {
        game.explode(tx, ty + 0.4, tz, radius, p.damage, {
          team: TEAM.PLAYER, source: player, color: p.color, burn: p.burn,
          stun: p.stun, detonate: p.detonate, skillId: skill.id,
          forceCrit: !!(player.mods.cataclysm && skill.id === 'shadowfury'),
        });
      }, p.color);
      game.sfx('cast');
      break;
    }

    case 'dash': {
      let dx = dir[0], dz = dir[2];
      if (p.behindTarget) {
        const t = game.aimTarget(player, 18) || game.nearestEnemy(player.x, player.y, player.z, 18);
        if (t) {
          const away = Math.hypot(t.x - player.x, t.z - player.z) || 1;
          const bx = t.x + (t.x - player.x) / away * 1.5;
          const bz = t.z + (t.z - player.z) / away * 1.5;
          player.x = bx;
          player.z = bz;
          player.y = game.world.groundAt(bx, bz, t.y + 3);
          player.yaw = Math.atan2(-(t.x - player.x), -(t.z - player.z));
          game.burst(player.x, player.centerY, player.z, 14, player.cls.color);
          game.dealDamage(player, t, p.damage, { knockback: 2, skillId: skill.id, forceCrit: true });
          player.invuln = Math.max(player.invuln, p.invuln || 0);
          game.sfx('blink');
          break;
        }
      }
      const len = Math.hypot(dx, dz) || 1;
      dx /= len; dz /= len;
      if (p.phase) {
        // Teleport: step until we hit geometry.
        const d = game.world.raycast(player.x, player.centerY, player.z, dx, 0, dz, p.distance);
        const nx = player.x + dx * d, nz = player.z + dz * d;
        game.burst(player.x, player.centerY, player.z, 12, player.cls.color);
        player.x = nx; player.z = nz;
        player.y = game.world.groundAt(nx, nz, player.y + 2.5);
        game.burst(player.x, player.centerY, player.z, 12, player.cls.color);
        player.invuln = Math.max(player.invuln, p.invuln || 0);
        if (player.mods.blinkShield) player.absorb += player.mods.blinkShield;
        game.sfx('blink');
      } else {
        player.dashTimer = p.distance / p.speed;
        player.dashVX = dx * p.speed;
        player.dashVZ = dz * p.speed;
        player.dashDamage = p.damage;
        player.dashRadius = p.radius || 1.8;
        player.dashKnockback = p.knockback || 0;
        player.dashHits = new Set();
        player.dashSkillId = skill.id;
        game.sfx('charge');
      }
      break;
    }

    case 'buff': {
      player.addBuff(skill.id, {
        duration: p.duration,
        damageTaken: p.damageTaken,
        dodge: p.dodge,
        moveSpeed: p.moveSpeed,
        rooted: p.rooted,
        icon: skill.icon,
        name: skill.name,
        color: player.cls.accent,
      });
      if (p.absorb) player.absorb = Math.max(player.absorb, p.absorb);
      if (p.rooted === false) player.knockResist = 1;
      game.sfx('buff');
      break;
    }

    case 'heal': {
      if (p.instant) game.healEntity(player, player, p.instant);
      if (p.healPerSecond) {
        player.addBuff(skill.id, {
          duration: p.duration, healPerSecond: p.healPerSecond,
          icon: skill.icon, name: skill.name, color: '#7dff9d',
        });
      }
      game.sfx('heal');
      break;
    }

    case 'summon': {
      if (p.totem) {
        // Only one totem of a given kind at a time.
        for (const x of game.pets) if (x.isTotem && x.kind === p.totem) x.dead = true;
        const gx = player.x + dir[0] * 2, gz = player.z + dir[2] * 2;
        const gy = game.world.groundAt(gx, gz, player.y + 2);
        game.pets.push(new Totem(gx, gy, gz, { ...p, owner: player }));
      } else {
        const maxPets = p.maxPets || 1;
        const live = game.pets.filter((x) => x.isPet && !x.dead);
        if (live.length >= maxPets) live[0].dead = true;
        const sx = player.x + rand(2, -2), sz = player.z + rand(2, -2);
        const sy = game.world.groundAt(sx, sz, player.y + 2);
        game.pets.push(new Fiend(sx, sy, sz, { ...p, owner: player }));
      }
      game.sfx('summon');
      break;
    }

    case 'cone': {
      const hits = game.enemiesInCone(player, p.range, p.angle);
      let total = 0;
      for (const m of hits) {
        total += game.dealDamage(player, m, p.damage, { skillId: skill.id });
        game.beam(ex, ey - 0.3, ez, m.x, m.centerY, m.z, p.color);
      }
      if (p.lifesteal && total > 0) game.healEntity(player, player, total * p.lifesteal);
      game.sfx('drain');
      break;
    }

    case 'chain': {
      const fire = () => {
        let current = game.aimTarget(player, p.range) || game.nearestEnemy(ex, ey, ez, p.range);
        if (!current) { game.notify('No target'); return false; }
        const hit = new Set();
        let dmg = p.damage;
        let total = 0;
        let fromX = ex, fromY = ey - 0.2, fromZ = ez;
        for (let j = 0; j < p.jumps && current; j++) {
          hit.add(current);
          game.beam(fromX, fromY, fromZ, current.x, current.centerY, current.z, p.color);
          total += game.dealDamage(player, current, dmg, { skillId: skill.id });
          fromX = current.x; fromY = current.centerY; fromZ = current.z;
          dmg *= p.falloff;
          current = game.nearestEnemy(fromX, fromY, fromZ, p.jumpRange, hit);
        }
        if (p.lifesteal && total > 0) game.healEntity(player, player, total * p.lifesteal);
        return true;
      };
      if (!fire()) return false;
      if (player.mods.overload && Math.random() < player.mods.overload) {
        game.delay(0.18, () => fire());
      }
      game.sfx('zap');
      break;
    }

    case 'strike': {
      const hits = game.enemiesInCone(player, p.range, p.arc || 0.8);
      player.swing = 1;
      if (!hits.length) game.sfx('whiff');
      for (const m of hits) {
        let dmg = p.damage;
        if (p.executeThreshold && m.hp / m.maxHp <= p.executeThreshold) dmg *= p.executeMult || 2;
        if (p.consumeDot) {
          const stored = m.totalDotDamageRemaining();
          dmg += stored * p.consumeDot;
          m.dots.length = 0;
        }
        const dx = m.x - player.x, dz = m.z - player.z;
        const d = Math.hypot(dx, dz) || 1;
        game.dealDamage(player, m, dmg, { knockback: 4, kx: dx / d, kz: dz / d, skillId: skill.id });
        if (p.dot && !m.dead) m.applyDot(p.dot.dps, p.dot.duration, 'bleed', player);
        if (p.chain) {
          let from = m;
          const hitSet = new Set(hits);
          for (let j = 0; j < p.chain; j++) {
            const next = game.nearestEnemy(from.x, from.centerY, from.z, 9, hitSet);
            if (!next) break;
            hitSet.add(next);
            game.beam(from.x, from.centerY, from.z, next.x, next.centerY, next.z, p.color);
            game.dealDamage(player, next, p.chainDamage, { skillId: skill.id });
            from = next;
          }
        }
      }
      game.sfx('swing');
      break;
    }

    default:
      return false;
  }

  player.resource -= cost;
  player.cooldowns[index] = skillCooldown(player, skill);
  player.lastCast = skill.id;
  return true;
}
