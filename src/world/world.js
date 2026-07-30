// The arena: voxel storage, procedural generation, meshing and collision.

import { BLOCKS, AIR, B } from './blocks.js';
import { tileUV } from '../render/atlas.js';
import { clamp, hash2 } from '../core/math.js';

export const SX = 64, SY = 28, SZ = 64;

// Face order: +X, -X, +Y(top), -Y(bottom), +Z, -Z
const FACES = [
  { dir: [1, 0, 0], tile: 2, shade: 0.78, corners: [[1, 1, 1], [1, 0, 1], [1, 0, 0], [1, 1, 0]] },
  { dir: [-1, 0, 0], tile: 2, shade: 0.78, corners: [[0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1]] },
  { dir: [0, 1, 0], tile: 0, shade: 1.00, corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { dir: [0, -1, 0], tile: 1, shade: 0.52, corners: [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]] },
  { dir: [0, 0, 1], tile: 2, shade: 0.88, corners: [[0, 1, 1], [0, 0, 1], [1, 0, 1], [1, 1, 1]] },
  { dir: [0, 0, -1], tile: 2, shade: 0.66, corners: [[1, 1, 0], [1, 0, 0], [0, 0, 0], [0, 1, 0]] },
];

// UV per corner index for each face quad (matches the corner winding above).
const FACE_UV = [[0, 0], [0, 1], [1, 1], [1, 0]];

export class World {
  constructor() {
    this.data = new Uint8Array(SX * SY * SZ);
    this.mesh = null;         // Float32Array, built by buildMesh()
    this.spawnPoints = [];
    this.playerSpawn = { x: SX / 2, y: 6, z: SZ / 2 };
  }

  idx(x, y, z) { return (y * SZ + z) * SX + x; }

  inBounds(x, y, z) {
    return x >= 0 && y >= 0 && z >= 0 && x < SX && y < SY && z < SZ;
  }

  /**
   * Blocks outside the array are not air. Anything below the world is bedrock
   * and anything beyond the horizontal edges is solid, which seals the arena:
   * without this a blink or a hard knockback can put an entity outside the
   * map, where it stands on the implied bedrock and walks away forever.
   * Above the world stays open so the sky renders.
   */
  get(x, y, z) {
    if (y < 0) return B.STONE;
    // Sealed at every height, including above the world — leaving a gap here
    // makes the barrier a walkable plateau that a blink can land on.
    if (x < 0 || z < 0 || x >= SX || z >= SZ) return B.STONE;
    if (y >= SY) return AIR;
    return this.data[this.idx(x, y, z)];
  }

  set(x, y, z, v) {
    if (this.inBounds(x, y, z)) this.data[this.idx(x, y, z)] = v;
  }

  isSolid(x, y, z) {
    const id = this.get(x | 0, y | 0, z | 0);
    return BLOCKS[id] ? BLOCKS[id].solid : false;
  }

  /** Block a point is inside — used for lava damage checks. */
  blockAt(x, y, z) {
    return this.get(Math.floor(x), Math.floor(y), Math.floor(z));
  }

  fill(x0, y0, z0, x1, y1, z1, id) {
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) this.set(x, y, z, id);
  }

  // -------------------------------------------------------------------------
  // Generation helpers
  // -------------------------------------------------------------------------

  /**
   * A climbable staircase descending away from (x, z) along one axis.
   * Every step must occupy exactly one column on the axis of travel: a wider
   * footprint bleeds the tallest step over its neighbours and produces a
   * plateau ending in a sheer face that nothing can climb. `dx`/`dz` must be
   * axis-aligned for the same reason.
   */
  staircase(x, z, dx, dz, height, halfWidth, mat) {
    for (let i = 0; i < height; i++) {
      const h = height - i;
      const sx = x + dx * i, sz = z + dz * i;
      for (let w = -halfWidth; w <= halfWidth; w++) {
        const wx = sx + (dx === 0 ? w : 0);
        const wz = sz + (dz === 0 ? w : 0);
        this.fill(wx, this.floorY, wz, wx, this.floorY + h - 1, wz, mat);
      }
    }
  }

  /** Raised circular platform with staircases up each cardinal side. */
  plateau(px, pz, radius, height, mat, trim, stairDirs = [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let z = -radius; z <= radius; z++) {
      for (let x = -radius; x <= radius; x++) {
        if (Math.hypot(x, z) > radius) continue;
        this.fill(px + x, this.floorY, pz + z, px + x, this.floorY + height - 1, pz + z, mat);
      }
    }
    if (trim !== undefined) {
      for (let z = -radius; z <= radius; z++) {
        for (let x = -radius; x <= radius; x++) {
          const d = Math.hypot(x, z);
          if (d <= radius && d > radius - 1) {
            this.set(px + x, this.floorY + height - 1, pz + z, trim);
          }
        }
      }
    }
    if (height > 1) {
      for (const [dx, dz] of stairDirs) {
        this.staircase(px + dx * (radius + 1), pz + dz * (radius + 1), dx, dz, height - 1, 1, mat);
      }
    }
  }

  /** Disc of lava set into the floor. */
  lavaDisc(px, pz, radius, inArena) {
    for (let z = -radius; z <= radius; z++) {
      for (let x = -radius; x <= radius; x++) {
        if (Math.hypot(x, z) > radius) continue;
        if (inArena && !inArena(px + x, pz + z)) continue;
        this.set(px + x, this.floorY - 1, pz + z, B.LAVA);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Generation
  // -------------------------------------------------------------------------

  /**
   * Build an arena. `theme` picks the palette and `layout` the floor plan, so
   * runs vary in both look and tactics. Every layout shares the same shell:
   * floor, perimeter wall, and a ring of mob spawn points.
   */
  generate(theme = 0, seed = 1, layout = 0, opts = {}) {
    this.data.fill(AIR);
    this.spawnPoints.length = 0;

    const themes = [
      { floor: B.STONE, accent: B.MOSSY, wall: B.COBBLE, trim: B.DARKSTONE, deco: B.GRASS },
      { floor: B.SAND, accent: B.SAND, wall: B.BRICK, trim: B.DARKSTONE, deco: B.SAND },
      { floor: B.DARKSTONE, accent: B.OBSIDIAN, wall: B.OBSIDIAN, trim: B.METAL, deco: B.DARKSTONE },
      { floor: B.PLANK, accent: B.LOG, wall: B.PLANK, trim: B.LOG, deco: B.LEAVES },
    ];
    // Raid rooms build from their own materials. The shell, the wall, the
    // spawn ring and the standable-ground filter below are all shared with the
    // arenas — only the palette and the interior differ, which is the whole
    // reason a raid room is affordable at all.
    const raid = opts.raid || null;
    const P = raid ? RAID_PALETTES[raid.tier % RAID_PALETTES.length]
      : themes[theme % themes.length];

    const FLOOR_Y = 4;
    const R = 26;               // arena radius (square-ish with cut corners)
    const cx = SX / 2, cz = SZ / 2;

    const inArena = (x, z) => {
      const dx = Math.abs(x - cx + 0.5), dz = Math.abs(z - cz + 0.5);
      return dx <= R && dz <= R && dx + dz <= R * 1.55;
    };

    // Bedrock + floor
    for (let z = 0; z < SZ; z++) {
      for (let x = 0; x < SX; x++) {
        if (!inArena(x, z)) continue;
        this.fill(x, 0, z, x, FLOOR_Y - 1, z, B.STONE);
        const n = hash2(x, z, seed);
        this.set(x, FLOOR_Y - 1, z, n > 0.86 ? P.accent : P.floor);
      }
    }

    // Perimeter wall with battlements
    const WALL_H = 9;
    for (let z = 0; z < SZ; z++) {
      for (let x = 0; x < SX; x++) {
        if (inArena(x, z)) continue;
        // Only build the shell adjacent to the arena, not the whole outside.
        let border = false;
        for (let d = 1; d <= 3 && !border; d++) {
          if (inArena(x + d, z) || inArena(x - d, z) || inArena(x, z + d) || inArena(x, z - d)) border = true;
        }
        if (!border) continue;
        this.fill(x, 0, z, x, FLOOR_Y + WALL_H - 1, z, P.wall);
        const crenel = ((x + z) % 3 === 0);
        this.set(x, FLOOR_Y + WALL_H, z, crenel ? P.trim : AIR);
        if (hash2(x, z, seed + 9) > 0.93) this.set(x, FLOOR_Y + WALL_H - 1, z, B.GLOW);
      }
    }

    this.floorY = FLOOR_Y;
    const ctx = { P, FLOOR_Y, cx, cz, R, seed, inArena };
    const builders = [
      (c) => this.layoutFortress(c),
      (c) => this.layoutCrucible(c),
      (c) => this.layoutSpires(c),
      (c) => this.layoutColosseum(c),
      (c) => this.layoutLabyrinth(c),
      (c) => this.layoutCauseway(c),
    ];
    if (raid) {
      this.layout = 0;
      this.layoutRaid(ctx, raid);
    } else {
      this.layout = layout % builders.length;
      builders[this.layout](ctx);
    }

    // Mob spawn ring around the outside of the arena floor
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r = R - 4;
      const px = cx + Math.cos(a) * r;
      const pz = cz + Math.sin(a) * r;
      if (!inArena(Math.round(px), Math.round(pz))) continue;
      if (this.blockAt(px, FLOOR_Y - 1, pz) === B.LAVA) continue;
      // The ring is laid down after the layout has built its towers and
      // walls, so a point can land inside one. Stand on whatever is actually
      // there, and drop the point entirely if there is no room to stand.
      const y = this.groundAt(px, pz, FLOOR_Y + 8) + 1;
      if (this.isSolid(px, y + 0.1, pz) || this.isSolid(px, y + 1.2, pz)) continue;
      this.spawnPoints.push({ x: px, y, z: pz });
    }

    // Every layout pushes its own spawn points, and several sit exactly where
    // that layout then puts a beacon block on a tower top. Rather than trust
    // six builders to each get it right, snap them all to standable ground
    // here and drop the ones with no room — a mob spawned inside geometry is
    // stuck from its first frame.
    this.spawnPoints = this.spawnPoints.filter((sp) => {
      const y = this.groundAt(sp.x, sp.z, sp.y + 4) + 1;
      if (this.isSolid(sp.x, y + 0.1, sp.z) || this.isSolid(sp.x, y + 1.2, sp.z)) return false;
      const under = BLOCKS[this.blockAt(sp.x, y - 0.5, sp.z)];
      if (under && under.damage) return false;            // never spawn into lava
      sp.y = y;
      return true;
    });

    // A raid starts you at the Threshold: due south on the Walk, twenty blocks
    // out, facing straight up the room at the dais. The boss is at the far end
    // and its head fills the upper third of the frame — the reveal is the first
    // thing the room does, and it only works from a fixed mark.
    this.playerSpawn = raid
      ? { x: cx + 0.5, y: FLOOR_Y + 3, z: cz + 20.5, yaw: 0 }
      : { x: cx + 0.5, y: FLOOR_Y + 3, z: cz + 0.5 };
    // The middle is raised or molten in some layouts; drop the spawn onto
    // whatever is actually there so the player never starts inside geometry.
    this.playerSpawn.y = this.groundAt(this.playerSpawn.x, this.playerSpawn.z, SY - 1) + 1;
    this.buildMesh();
    return this;
  }

  // -------------------------------------------------------------------------
  // Layouts
  //
  // Each builds the interior of the arena shell. They deliberately play
  // differently: Fortress is close-quarters with cover, Crucible forces you
  // across chokepoints, Spires is open and favours ranged fights.
  // -------------------------------------------------------------------------

  /**
   * The raid room. One skeleton, seven materials.
   *
   * Every mechanic's escape arithmetic was measured against this shape, so the
   * three bands are a contract rather than a style:
   *
   *   The Dais   r <= 9, raised 2, terraced, and flat on top. The boss's
   *              ground. `slam` reaches 11 and `shadow` reaches 9, so nothing
   *              stands here that could block a straight line out.
   *   The Mid    r 10..19. Cover, perches, hazard — the band that carries the
   *              raid's identity, and the only one that differs.
   *   The Walk   r 20..26, floor level, four blocks wide, unbroken, no hazard.
   *              Kiting must always have a full lap. A room you can be
   *              cornered in is not a fight, it is a wall with a boss in it.
   *
   * Four gaps due N/E/S/W through anything ring-shaped, so the Walk and the
   * Dais are never more than a quarter-lap apart, and the player spawns on the
   * south one looking straight up the room.
   */
  layoutRaid({ P, FLOOR_Y, cx, cz, seed }, raid) {
    const at = (x, z) => Math.hypot(x, z);

    // --- The Dais: two terraces, flat top, a rim you can read from the Walk.
    for (let z = -10; z <= 10; z++) {
      for (let x = -10; x <= 10; x++) {
        const d = at(x, z);
        if (d > 9.5) continue;
        const h = d <= 7.5 ? 2 : 1;
        this.fill(cx + x, FLOOR_Y, cz + z, cx + x, FLOOR_Y + h - 1, cz + z, P.accent);
        // The rim is the one emissive line on the floor, and it is what tells
        // you where the boss's ground starts from anywhere on the Walk.
        if (d > 8.4) this.set(cx + x, FLOOR_Y + h - 1, cz + z, P.trim);
      }
    }

    // --- The Mid: whatever this raid is. The one band that differs, and the
    // only place a room gets to be a place rather than a shape.
    RAID_INTERIORS[raid.tier % RAID_INTERIORS.length](this, { P, FLOOR_Y, cx, cz, seed });

    // --- Two perches, diagonally opposite, tops at +4. Terraced from one side
    // so a boss can climb them: an unreachable perch is a place to stand and
    // win from, which is the one thing a raid room must not have.
    for (const sign of [-1, 1]) {
      const px = Math.round(cx + sign * 11);
      const pz = Math.round(cz + sign * 11);
      for (let z = -3; z <= 3; z++) {
        for (let x = -3; x <= 3; x++) {
          const step = Math.max(Math.abs(x), Math.abs(z));
          const h = 4 - Math.max(0, step - 1);
          if (h <= 0) continue;
          this.fill(px + x, FLOOR_Y, pz + z, px + x, FLOOR_Y + h - 1, pz + z, P.wall);
        }
      }
    }

    // --- Hazard, in the Mid only. Never on the Dais, never on the Walk, and
    // never in a cardinal gate: a hazard that blocks the lap breaks the one
    // promise the Walk makes.
    if (P.hazard) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.4;
        const hx = Math.round(cx + Math.cos(a) * 17);
        const hz = Math.round(cz + Math.sin(a) * 17);
        for (let z = -2; z <= 2; z++) {
          for (let x = -2; x <= 2; x++) {
            if (at(x, z) > 2.4) continue;
            const d = at(hx + x - cx, hz + z - cz);
            if (d < 11 || d > 19) continue;
            this.set(hx + x, FLOOR_Y - 1, hz + z, P.hazard);
          }
        }
      }
    }

    // --- Light, and only where the discipline allows it: the dais rim, the
    // perch tops, and above head height. Loose emissive blocks on the floor
    // compete with the telegraphs, and the telegraphs have to win.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const lx = Math.round(cx + Math.cos(a) * 9);
      const lz = Math.round(cz + Math.sin(a) * 9);
      this.set(lx, FLOOR_Y + 2, lz, P.deco);
    }

    // --- Spawn ring for adds, on the Mid rather than the arena's r=22 default,
    // so a summon lands in the fight instead of a lap behind it.
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.26;
      this.spawnPoints.push({
        x: cx + Math.cos(a) * 13,
        y: FLOOR_Y,
        z: cz + Math.sin(a) * 13,
      });
    }
  }

  /** Central dais, four corner towers, cover pillars and lava spokes. */
  layoutFortress({ P, FLOOR_Y, cx, cz, seed, inArena }) {
    const daisR = 7;
    for (let z = -daisR; z <= daisR; z++) {
      for (let x = -daisR; x <= daisR; x++) {
        const d = Math.hypot(x, z);
        if (d > daisR) continue;
        const h = d > daisR - 1.6 ? 1 : 2;
        this.fill(cx + x, FLOOR_Y, cz + z, cx + x, FLOOR_Y + h - 1, cz + z, P.trim);
        if (d > daisR - 1.2 && d <= daisR) this.set(cx + x, FLOOR_Y + h - 1, cz + z, B.RUNE);
      }
    }
    this.set(cx, FLOOR_Y + 2, cz, B.CRYSTAL);

    for (const [ox, oz] of [[-16, -16], [16, -16], [-16, 16], [16, 16]]) {
      const tx = Math.round(cx + ox), tz = Math.round(cz + oz);
      const h = 6;
      this.fill(tx - 3, FLOOR_Y, tz - 3, tx + 3, FLOOR_Y + h - 1, tz + 3, P.wall);
      this.fill(tx - 2, FLOOR_Y + h, tz - 2, tx + 2, FLOOR_Y + h, tz + 2, P.trim);
      this.set(tx, FLOOR_Y + h + 1, tz, B.GLOW);
      const dir = Math.sign(-ox) || 1;
      this.staircase(tx + dir * 4, tz, dir, 0, h, 1, P.wall);
      this.spawnPoints.push({ x: tx + 0.5, y: FLOOR_Y + h + 1, z: tz + 0.5 });
    }

    for (let i = 0; i < 26; i++) {
      const a = hash2(i, 3, seed) * Math.PI * 2;
      const r = 10 + hash2(i, 7, seed) * 15;
      const px = Math.round(cx + Math.cos(a) * r);
      const pz = Math.round(cz + Math.sin(a) * r);
      if (!inArena(px, pz)) continue;
      const h = 2 + Math.floor(hash2(i, 11, seed) * 4);
      const mat = hash2(i, 13, seed) > 0.6 ? P.accent : P.wall;
      this.fill(px, FLOOR_Y, pz, px, FLOOR_Y + h - 1, pz, mat);
      if (hash2(i, 17, seed) > 0.75) this.set(px, FLOOR_Y + h, pz, B.GLOW);
    }

    // Lava spokes you have to path around.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      for (let t = 12; t < 24; t++) {
        const px = Math.round(cx + Math.cos(a) * t);
        const pz = Math.round(cz + Math.sin(a) * t);
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!inArena(px + dx, pz + dz)) continue;
            this.set(px + dx, FLOOR_Y - 1, pz + dz, B.LAVA);
          }
        }
      }
    }
  }

  /**
   * A molten moat around a raised centre, crossed by four bridges, ringed by
   * an elevated outer walkway. Fighting happens at the chokepoints.
   */
  layoutCrucible({ P, FLOOR_Y, cx, cz, seed, inArena }) {
    const moatR = 8;
    this.lavaDisc(cx, cz, moatR, inArena);

    // Central island, reachable only by the bridges.
    this.plateau(cx, cz, 5, 2, P.trim, B.RUNE, []);
    this.set(cx, FLOOR_Y + 2, cz, B.CRYSTAL);

    // Four bridges at floor level across the moat.
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let t = 4; t <= moatR + 1; t++) {
        // Wide enough to fight on: a narrow bridge made this layout markedly
        // harder than the others, which reads as bad luck rather than design.
        for (let w = -2; w <= 2; w++) {
          const bx = Math.round(cx + dx * t + (dx === 0 ? w : 0));
          const bz = Math.round(cz + dz * t + (dz === 0 ? w : 0));
          this.set(bx, FLOOR_Y - 1, bz, P.floor);
          this.set(bx, FLOOR_Y, bz, AIR);
        }
      }
      // A short ramp up onto the island so the bridge actually connects.
      this.staircase(Math.round(cx + dx * 6), Math.round(cz + dz * 6), dx, dz, 1, 1, P.trim);
    }

    // Raised outer walkway with stairs at the diagonals.
    const ringInner = 17, ringOuter = 21;
    for (let z = -ringOuter; z <= ringOuter; z++) {
      for (let x = -ringOuter; x <= ringOuter; x++) {
        const d = Math.hypot(x, z);
        if (d < ringInner || d > ringOuter) continue;
        if (!inArena(cx + x, cz + z)) continue;
        this.fill(cx + x, FLOOR_Y, cz + z, cx + x, FLOOR_Y + 2, cz + z, P.wall);
        if (d > ringOuter - 1) this.set(cx + x, FLOOR_Y + 2, cz + z, P.trim);
      }
    }
    // Cut four gaps in the ring and stair up into each.
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let t = ringInner - 1; t <= ringOuter + 1; t++) {
        for (let w = -2; w <= 2; w++) {
          const gx = Math.round(cx + dx * t + (dx === 0 ? w : 0));
          const gz = Math.round(cz + dz * t + (dz === 0 ? w : 0));
          this.fill(gx, FLOOR_Y, gz, gx, FLOOR_Y + 3, gz, AIR);
        }
      }
    }
    for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const sx = Math.round(cx + dx * 12), sz = Math.round(cz + dz * 12);
      this.staircase(sx, sz, dx, 0, 3, 1, P.wall);
      this.spawnPoints.push({ x: sx + 0.5, y: FLOOR_Y + 3, z: sz + 0.5 });
    }

    for (let i = 0; i < 14; i++) {
      const a = hash2(i, 5, seed) * Math.PI * 2;
      const r = 13 + hash2(i, 9, seed) * 3;
      const px = Math.round(cx + Math.cos(a) * r);
      const pz = Math.round(cz + Math.sin(a) * r);
      if (!inArena(px, pz) || this.blockAt(px, FLOOR_Y - 1, pz) === B.LAVA) continue;
      const h = 2 + Math.floor(hash2(i, 15, seed) * 3);
      this.fill(px, FLOOR_Y, pz, px, FLOOR_Y + h - 1, pz, P.accent);
      if (hash2(i, 21, seed) > 0.7) this.set(px, FLOOR_Y + h, pz, B.GLOW);
    }
  }

  /**
   * Open ground broken up by tall spires and a few elevated platforms.
   * Long sightlines, high ground worth taking, little cover at floor level.
   */
  layoutSpires({ P, FLOOR_Y, cx, cz, seed, inArena }) {
    // Elevated platforms at varied heights, each with its own stairs.
    const pads = [
      [-13, -9, 5, 4], [12, -12, 4, 5], [-11, 13, 4, 3], [14, 11, 5, 4], [0, 0, 6, 3],
    ];
    for (const [ox, oz, radius, height] of pads) {
      const px = Math.round(cx + ox), pz = Math.round(cz + oz);
      this.plateau(px, pz, radius, height, P.wall, P.trim, [[1, 0], [-1, 0]]);
      this.set(px, FLOOR_Y + height, pz, B.GLOW);
      this.spawnPoints.push({ x: px + 0.5, y: FLOOR_Y + height, z: pz + 0.5 });
    }
    this.set(cx, FLOOR_Y + 3, cz, B.CRYSTAL);

    // Tall thin spires — cover from ranged fire, and something to break line
    // of sight while you reposition.
    for (let i = 0; i < 22; i++) {
      const a = hash2(i, 31, seed) * Math.PI * 2;
      const r = 7 + hash2(i, 37, seed) * 17;
      const px = Math.round(cx + Math.cos(a) * r);
      const pz = Math.round(cz + Math.sin(a) * r);
      if (!inArena(px, pz)) continue;
      if (this.isSolid(px, FLOOR_Y, pz)) continue;      // do not grow out of a platform
      const h = 4 + Math.floor(hash2(i, 41, seed) * 6);
      const w = hash2(i, 43, seed) > 0.6 ? 1 : 0;
      this.fill(px, FLOOR_Y, pz, px + w, FLOOR_Y + h - 1, pz + w, P.accent);
      this.set(px, FLOOR_Y + h, pz, hash2(i, 47, seed) > 0.5 ? B.CRYSTAL : P.trim);
    }

    // A few scattered lava pools rather than channels.
    for (let i = 0; i < 5; i++) {
      const a = hash2(i, 53, seed) * Math.PI * 2;
      const r = 9 + hash2(i, 59, seed) * 12;
      const px = Math.round(cx + Math.cos(a) * r);
      const pz = Math.round(cz + Math.sin(a) * r);
      this.lavaDisc(px, pz, 2 + Math.floor(hash2(i, 61, seed) * 2), inArena);
    }
  }

  /**
   * Colosseum: a sunken sand pit ringed by tiered seating. Nothing to hide
   * behind and nowhere to back off to — the only cover is distance, so it is
   * the arena that punishes standing still and rewards kiting in circles.
   */
  layoutColosseum({ P, FLOOR_Y, cx, cz, R, seed, inArena }) {
    // Tiered banks stepping down toward the middle, like seating rows.
    for (let tier = 0; tier < 4; tier++) {
      const inner = R - 6 - tier * 4;
      const h = 4 - tier;
      if (inner < 6) break;
      for (let x = cx - R; x <= cx + R; x++) {
        for (let z = cz - R; z <= cz + R; z++) {
          if (!inArena(x, z)) continue;
          const d = Math.hypot(x - cx, z - cz);
          if (d < inner || d > inner + 2.2) continue;
          this.fill(x, FLOOR_Y, z, x, FLOOR_Y + h - 1, z, tier % 2 ? P.wall : P.accent);
          if (hash2(x, z, seed + tier) > 0.9) this.set(x, FLOOR_Y + h, z, B.GLOW);
        }
      }
    }
    // Four gates cut through every tier, so the pit is reachable and the
    // spawn ring outside is not walled off from the fight.
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let t = 6; t < R; t++) {
        for (let w = -2; w <= 2; w++) {
          const x = Math.round(cx + dx * t + (dz ? w : 0));
          const z = Math.round(cz + dz * t + (dx ? w : 0));
          if (!inArena(x, z)) continue;
          this.fill(x, FLOOR_Y, z, x, FLOOR_Y + 4, z, B.AIR);
        }
      }
    }
    // Landmarks to orient by, offset from the middle — an obelisk *on* the
    // centre is exactly where the player spawns, and the run would start on
    // top of a one-block pillar.
    for (const [ox, oz] of [[-5, -5], [5, 5]]) {
      const px = cx + ox, pz = cz + oz;
      this.fill(px, FLOOR_Y, pz, px, FLOOR_Y + 5, pz, P.trim);
      this.set(px, FLOOR_Y + 6, pz, B.CRYSTAL);
    }
  }

  /**
   * Labyrinth: chest-high walls in a loose grid. Line of sight breaks
   * constantly, so ranged enemies have to reposition and melee can be lost
   * track of — the arena where the radar earns its place.
   */
  layoutLabyrinth({ P, FLOOR_Y, cx, cz, R, seed, inArena }) {
    const CELL = 7;
    for (let gx = -3; gx <= 3; gx++) {
      for (let gz = -3; gz <= 3; gz++) {
        const bx = cx + gx * CELL;
        const bz = cz + gz * CELL;
        // Each cell drops one or two of its four walls, so the grid is a maze
        // rather than a set of sealed boxes.
        const roll = hash2(gx, gz, seed);
        if (roll > 0.82) continue;                       // open plaza
        const len = 5;
        const walls = [
          [1, 0], [0, 1],
        ];
        for (let w = 0; w < walls.length; w++) {
          if (hash2(gx * 7 + w, gz * 13, seed + 5) > 0.62) continue;
          const [dx, dz] = walls[w];
          for (let i = 0; i < len; i++) {
            const x = Math.round(bx + dx * i);
            const z = Math.round(bz + dz * i);
            if (!inArena(x, z)) continue;
            if (Math.hypot(x - cx, z - cz) < 5) continue;   // keep the middle clear
            this.fill(x, FLOOR_Y, z, x, FLOOR_Y + 1, z, P.wall);
            if (hash2(x, z, seed + 11) > 0.88) this.set(x, FLOOR_Y + 2, z, B.GLOW);
          }
        }
      }
    }
    // Raised centre so there is one place with sightlines over the whole maze,
    // worth fighting to hold.
    this.plateau(cx, cz, 5, 3, P.accent, P.trim, [[1, 0], [-1, 0], [0, 1], [0, -1]]);
    this.set(cx, FLOOR_Y + 3, cz, B.CRYSTAL);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      this.lavaDisc(Math.round(cx + Math.cos(a) * 15), Math.round(cz + Math.sin(a) * 15), 2, inArena);
    }
  }

  /**
   * Causeway: raised walkways over a lava field. Falling is a real threat, so
   * knockback matters far more here than anywhere else — both yours and
   * theirs.
   */
  layoutCauseway({ P, FLOOR_Y, cx, cz, R, seed, inArena }) {
    // Flood the floor, then lay the paths back over it.
    // Flood the interior only. The spawn ring lives at R-4, and flooding that
    // far out left four usable spawn points out of twenty-four — every wave
    // then trickled in from the same corner.
    for (let x = cx - R; x <= cx + R; x++) {
      for (let z = cz - R; z <= cz + R; z++) {
        if (!inArena(x, z)) continue;
        if (Math.hypot(x - cx, z - cz) > R - 7) continue;
        this.set(x, FLOOR_Y - 1, z, B.LAVA);
      }
    }
    const bridge = (x0, z0, x1, z1, halfWidth) => {
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
      for (let i = 0; i <= steps; i++) {
        const t = steps ? i / steps : 0;
        const x = Math.round(x0 + (x1 - x0) * t);
        const z = Math.round(z0 + (z1 - z0) * t);
        for (let ox = -halfWidth; ox <= halfWidth; ox++) {
          for (let oz = -halfWidth; oz <= halfWidth; oz++) {
            if (!inArena(x + ox, z + oz)) continue;
            this.set(x + ox, FLOOR_Y - 1, z + oz, P.floor);
            this.set(x + ox, FLOOR_Y, z + oz, B.AIR);
          }
        }
      }
    };
    // A hub with spokes out to the spawn ring, plus a linking ring so you are
    // never forced through the middle.
    const hub = 6;
    for (let x = cx - hub; x <= cx + hub; x++) {
      for (let z = cz - hub; z <= cz + hub; z++) {
        if (Math.hypot(x - cx, z - cz) > hub) continue;
        this.set(x, FLOOR_Y - 1, z, P.floor);
      }
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + hash2(i, 3, seed) * 0.3;
      bridge(cx, cz, Math.round(cx + Math.cos(a) * (R - 3)), Math.round(cz + Math.sin(a) * (R - 3)), 1);
    }
    for (let i = 0; i < 40; i++) {
      const a0 = (i / 40) * Math.PI * 2;
      const a1 = ((i + 1) / 40) * Math.PI * 2;
      const rr = R - 11;
      bridge(Math.round(cx + Math.cos(a0) * rr), Math.round(cz + Math.sin(a0) * rr),
        Math.round(cx + Math.cos(a1) * rr), Math.round(cz + Math.sin(a1) * rr), 1);
    }
    // Pillars on the hub for cover, and a beacon to navigate by.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.78;
      const px = Math.round(cx + Math.cos(a) * 4), pz = Math.round(cz + Math.sin(a) * 4);
      this.fill(px, FLOOR_Y, pz, px, FLOOR_Y + 3, pz, P.accent);
    }
    this.set(cx, FLOOR_Y, cz, B.GLOW);
  }

  // -------------------------------------------------------------------------
  // Meshing
  // -------------------------------------------------------------------------

  opaqueAt(x, y, z) {
    const bl = BLOCKS[this.get(x, y, z)];
    return bl && bl.opaque ? 1 : 0;
  }

  /**
   * Ambient occlusion for one face corner (classic 3-neighbour rule).
   * `co` is the corner's 0/1 offset triple; the two axes where `dir` is zero
   * are the face's tangent axes.
   */
  ao(x, y, z, dir, co) {
    const nx = x + dir[0], ny = y + dir[1], nz = z + dir[2];
    const tangents = [];
    for (let a = 0; a < 3; a++) {
      if (dir[a] !== 0) continue;
      const s = co[a] ? 1 : -1;
      tangents.push([a === 0 ? s : 0, a === 1 ? s : 0, a === 2 ? s : 0]);
    }
    const [t1, t2] = tangents;
    const side1 = this.opaqueAt(nx + t1[0], ny + t1[1], nz + t1[2]);
    const side2 = this.opaqueAt(nx + t2[0], ny + t2[1], nz + t2[2]);
    if (side1 && side2) return 0.55;
    const corner = this.opaqueAt(nx + t1[0] + t2[0], ny + t1[1] + t2[1], nz + t1[2] + t2[2]);
    return 1 - (side1 + side2 + corner) * 0.15;
  }

  buildMesh() {
    const out = [];
    for (let y = 0; y < SY; y++) {
      for (let z = 0; z < SZ; z++) {
        for (let x = 0; x < SX; x++) {
          const id = this.data[this.idx(x, y, z)];
          if (id === AIR) continue;
          const block = BLOCKS[id];
          if (!block.tiles) continue;
          for (let f = 0; f < 6; f++) {
            const F = FACES[f];
            const nx = x + F.dir[0], ny = y + F.dir[1], nz = z + F.dir[2];
            const nId = this.get(nx, ny, nz);
            const nBlock = BLOCKS[nId];
            if (nBlock && nBlock.opaque) continue;  // hidden behind a solid neighbour
            if (nId === id) continue;               // merge same-block faces (e.g. lava surface)

            const tile = block.tiles[F.tile];
            const [u0, v0, du, dv] = tileUV(tile);
            const emissive = block.emissive || 0;

            const verts = [];
            for (let c = 0; c < 4; c++) {
              const co = F.corners[c];
              const light = emissive
                ? Math.max(F.shade, emissive)
                : F.shade * this.ao(x, y, z, F.dir, co);
              const [uu, vv] = FACE_UV[c];
              verts.push([
                x + co[0], y + co[1], z + co[2],
                u0 + uu * du, v0 + vv * dv,
                light,
              ]);
            }
            // Two triangles: 0,1,2 and 0,2,3
            for (const i of [0, 1, 2, 0, 2, 3]) out.push(...verts[i]);
          }
        }
      }
    }
    this.mesh = new Float32Array(out);
    return this.mesh;
  }

  // -------------------------------------------------------------------------
  // Collision & queries
  // -------------------------------------------------------------------------

  /**
   * Move an AABB through the world, resolving one axis at a time.
   * `ent` needs x,y,z (feet centre), vx,vy,vz, width, height.
   */
  moveAABB(ent, dt) {
    const hw = ent.width / 2;
    const step = (axis, delta) => {
      if (delta === 0) return false;
      if (axis === 0) ent.x += delta; else if (axis === 1) ent.y += delta; else ent.z += delta;
      const minX = Math.floor(ent.x - hw), maxX = Math.floor(ent.x + hw);
      const minY = Math.floor(ent.y), maxY = Math.floor(ent.y + ent.height);
      const minZ = Math.floor(ent.z - hw), maxZ = Math.floor(ent.z + hw);
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          for (let x = minX; x <= maxX; x++) {
            if (!this.isSolid(x, y, z)) continue;
            // Overlap test against this voxel.
            if (ent.x + hw <= x || ent.x - hw >= x + 1) continue;
            if (ent.y + ent.height <= y || ent.y >= y + 1) continue;
            if (ent.z + hw <= z || ent.z - hw >= z + 1) continue;
            if (axis === 0) ent.x = delta > 0 ? x - hw - 1e-4 : x + 1 + hw + 1e-4;
            else if (axis === 1) ent.y = delta > 0 ? y - ent.height - 1e-4 : y + 1 + 1e-4;
            else ent.z = delta > 0 ? z - hw - 1e-4 : z + 1 + hw + 1e-4;
            return true;
          }
        }
      }
      return false;
    };

    // Sub-step so fast movers cannot tunnel through walls.
    const speed = Math.hypot(ent.vx, ent.vy, ent.vz) * dt;
    const steps = Math.max(1, Math.min(8, Math.ceil(speed / 0.4)));
    const sdt = dt / steps;
    ent.onGround = false;
    ent.hitWallX = false;
    ent.hitWallZ = false;
    for (let i = 0; i < steps; i++) {
      if (step(1, ent.vy * sdt)) {
        if (ent.vy < 0) ent.onGround = true;
        ent.vy = 0;
      }
      if (step(0, ent.vx * sdt)) ent.hitWallX = true;
      if (step(2, ent.vz * sdt)) ent.hitWallZ = true;
    }
    // Safety net. The sealed edges should make this unreachable, but a single
    // escaped entity softlocks a wave, so recover rather than trust it.
    const escaped = ent.y < -8 || ent.y > SY + 4
      || ent.x < 1 || ent.z < 1 || ent.x > SX - 1 || ent.z > SZ - 1;
    if (escaped) {
      ent.x = this.playerSpawn.x;
      ent.z = this.playerSpawn.z;
      ent.y = this.groundAt(ent.x, ent.z, SY - 1);
      ent.vx = ent.vy = ent.vz = 0;
      ent.outOfBounds = true;
    }
  }

  /** Ray march against solid blocks. Returns hit distance or `max` if clear. */
  raycast(ox, oy, oz, dx, dy, dz, max) {
    const stepLen = 0.15;
    const n = Math.ceil(max / stepLen);
    for (let i = 1; i <= n; i++) {
      const t = i * stepLen;
      if (this.isSolid(ox + dx * t, oy + dy * t, oz + dz * t)) return t - stepLen;
    }
    return max;
  }

  /** True if there is clear line of sight between two points. */
  lineOfSight(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.001) return true;
    return this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len) >= len - 0.01;
  }

  /** Drop a point to the first solid surface below it. */
  groundAt(x, z, fromY = SY - 1) {
    for (let y = Math.min(SY - 1, Math.floor(fromY)); y >= 0; y--) {
      if (this.isSolid(x, y, z)) return y + 1;
    }
    return 0;
  }

  /** Pick a spawn point far enough from the player. */
  pickSpawn(px, pz, minDist = 12) {
    const pts = this.spawnPoints;
    if (!pts.length) return { ...this.playerSpawn };
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < 8; i++) {
      const p = pts[(Math.random() * pts.length) | 0];
      const d = Math.hypot(p.x - px, p.z - pz);
      const score = d < minDist ? d - 1000 : -d;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return { x: best.x, y: this.groundAt(best.x, best.z, best.y + 4), z: best.z };
  }
}

/**
 * One palette per raid tier. Materials only — the sky, the sun, the bounce
 * light and the fog belong to the renderer's theme, and between them they carry
 * more of a room's mood than its blocks do.
 */
const RAID_PALETTES = [
  // Zul'Craftub: green-black stone under water, gold decoration. The green is
  // reserved for poison, so decoration cannot be green anywhere in this room.
  { floor: B.MOSSY, accent: B.DARKSTONE, wall: B.COBBLE, trim: B.GOLD, deco: B.LEAVES, hazard: null },
  // Molten Core: grey stone, and the light comes from the lake underneath it.
  { floor: B.STONE, accent: B.COBBLE, wall: B.DARKSTONE, trim: B.METAL, deco: B.OBSIDIAN, hazard: null },
  // Karacraft: a broken ballroom. Wood and dark stone, lit by candles.
  { floor: B.PLANK, accent: B.DARKSTONE, wall: B.BRICK, trim: B.LOG, deco: B.GLOW, hazard: null },
  // Craftuar: the machine hall, and the only right-angled room in the set.
  { floor: B.METAL, accent: B.DARKSTONE, wall: B.METAL, trim: B.RUNE, deco: B.CRYSTAL, hazard: null },
  // Black Temple: black stone and one green fire. The darkest room in the game.
  { floor: B.DARKSTONE, accent: B.OBSIDIAN, wall: B.OBSIDIAN, trim: B.RUNE, deco: B.GLOW, hazard: null },
  // Firelands: black rock under a burning sky, standing in the fire itself.
  // `trim` is the dais rim and it is walked on, so it can never be a hazard
  // however well it would suit the room. `hazard` is null because this room's
  // interior lays its own cracks and two hazard passes tile the floor.
  { floor: B.BASALT, accent: B.OBSIDIAN, wall: B.BASALT, trim: B.OBSIDIAN, deco: B.GLOW, hazard: null },
  // Craftcrown: dark ice underfoot, pale ice overhead. The only room whose walls
  // are brighter than its floor, which is what makes it read as built rather
  // than carved — and the dark floor is what keeps everything the player casts
  // sitting on top of it rather than in it.
  { floor: B.BLACKICE, accent: B.ICE, wall: B.ICE, trim: B.ICE, deco: B.CRYSTAL, hazard: null },
];


/**
 * The Mid band, one function per raid.
 *
 * Each may put anything it likes between r=10 and r=19. What it may not do is
 * touch the Dais, the Walk or the four cardinal gates — those are the contract
 * every mechanic's escape arithmetic was measured against, and the room check
 * in the smoke tests holds all three on all seven.
 *
 * A mass 6 blocks or taller breaks line of sight, and every room needs at least
 * four of them: the ranged bosses have 30 blocks of range, which is longer than
 * the room is wide, so distance can never break it and only geometry can.
 */
const RAID_INTERIORS = [
  // Zul'Craftub — eight fallen idols. Five stand and three lie where they fell,
  // and the toppled ones are the cover you actually use: a three-high mass a
  // boss walks around rather than over.
  (w, { P, FLOOR_Y, cx, cz }) => {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const ix = Math.round(cx + Math.cos(a) * 15);
      const iz = Math.round(cz + Math.sin(a) * 15);
      if (i % 3 === 2) {
        // Toppled: long, low, and lying across the bearing it fell along.
        const along = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a));
        const hx = along ? 3 : 1, hz = along ? 1 : 3;
        w.fill(ix - hx, FLOOR_Y, iz - hz, ix + hx, FLOOR_Y + 2, iz + hz, P.wall);
        w.set(ix, FLOOR_Y + 3, iz, P.trim);
      } else {
        w.fill(ix - 1, FLOOR_Y, iz - 1, ix + 1, FLOOR_Y + 6, iz + 1, P.wall);
        w.set(ix, FLOOR_Y + 7, iz, P.trim);
      }
    }
  },

  // Molten Core — a lake of fire outside the Walk, and eight rock columns.
  // The lava is beyond r=23, so you never have to cross it: you can only be
  // knocked into it. That is the entire hazard design of this room.
  (w, { P, FLOOR_Y, cx, cz }) => {
    for (let z = -30; z <= 30; z++) {
      for (let x = -30; x <= 30; x++) {
        if (Math.hypot(x, z) < 23.5) continue;
        if (w.blockAt(cx + x, FLOOR_Y - 1, cz + z) === AIR) continue;
        w.set(cx + x, FLOOR_Y - 1, cz + z, B.LAVA);
      }
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const px = Math.round(cx + Math.cos(a) * 16);
      const pz = Math.round(cz + Math.sin(a) * 16);
      w.fill(px - 1, FLOOR_Y, pz - 1, px + 1, FLOOR_Y + 5, pz + 1, P.wall);
      w.fill(px - 1, FLOOR_Y + 6, pz - 1, px + 1, FLOOR_Y + 6, pz + 1, P.trim);
    }
  },

  // Karacraft — a ballroom, and a hall is defined by its rhythm. Sixteen
  // columns on a ring with lintels between them, and a chequered floor so a
  // shockwave marching outward has something to march across.
  (w, { P, FLOOR_Y, cx, cz }) => {
    for (let z = -26; z <= 26; z++) {
      for (let x = -26; x <= 26; x++) {
        const d = Math.hypot(x, z);
        if (d < 10 || d > 26) continue;
        if (w.blockAt(cx + x, FLOOR_Y - 1, cz + z) === AIR) continue;
        // Both squares are dark. A true black-and-white chequer would be a
        // bright floor, and the floor may never compete with a telegraph.
        if ((((cx + x) >> 3) + ((cz + z) >> 3)) & 1) {
          w.set(cx + x, FLOOR_Y - 1, cz + z, P.accent);
        }
      }
    }
    let prev = null;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const px = Math.round(cx + Math.cos(a) * 17);
      const pz = Math.round(cz + Math.sin(a) * 17);
      w.fill(px, FLOOR_Y, pz, px + 1, FLOOR_Y + 13, pz + 1, P.accent);
      // A candle on each crown: sixteen lights at the top of the frame, well
      // above anything the player casts.
      w.set(px, FLOOR_Y + 14, pz, B.GLOW);
      // Lintels turn a forest of posts into architecture.
      if (prev) {
        const steps = 6;
        for (let t = 1; t < steps; t++) {
          const bx = Math.round(prev[0] + (px - prev[0]) * (t / steps));
          const bz = Math.round(prev[1] + (pz - prev[1]) * (t / steps));
          w.fill(bx, FLOOR_Y + 12, bz, bx + 1, FLOOR_Y + 13, bz + 1, P.accent);
        }
      }
      prev = [px, pz];
    }
  },

  // Craftuar — the machine hall, and the only right-angled room in the set.
  // Straight orange lines of molten metal on cold grey plate is the most
  // readable hazard in the game and it costs nothing new.
  (w, { P, FLOOR_Y, cx, cz }) => {
    for (const [ox, oz] of [[-13, -13], [13, -13], [-13, 13], [13, 13]]) {
      const mx = cx + ox, mz = cz + oz;
      w.fill(mx - 3, FLOOR_Y, mz - 3, mx + 3, FLOOR_Y + 7, mz + 3, P.wall);
      w.fill(mx - 2, FLOOR_Y + 8, mz - 2, mx + 2, FLOOR_Y + 8, mz + 2, P.accent);
      w.set(mx, FLOOR_Y + 9, mz, P.deco);
    }
    // A rectangle of trenches at r=17, broken by five-wide crossings on the
    // cardinals so the Walk and the Dais are never cut off from one another.
    for (let t = -17; t <= 17; t++) {
      if (Math.abs(t) <= 2) continue;
      for (const d of [-17, 17]) {
        for (const [x, z] of [[t, d], [d, t]]) {
          if (w.blockAt(cx + x, FLOOR_Y - 1, cz + z) === AIR) continue;
          w.set(cx + x, FLOOR_Y - 1, cz + z, B.LAVA);
        }
      }
    }
  },

  // Black Temple — an inverted ziggurat. The floor steps down toward the
  // middle, so you fight at the bottom of a bowl and the boss is below your
  // eyeline as you walk in. Every step is exactly one block, which makes this
  // the most boss-pathable room in the game by construction: no ramp, no
  // stair, no ledge anything can be stranded on.
  (w, { P, FLOOR_Y, cx, cz }) => {
    for (let z = -22; z <= 22; z++) {
      for (let x = -22; x <= 22; x++) {
        const d = Math.max(Math.abs(x), Math.abs(z));
        if (d < 10 || d > 20) continue;
        if (w.blockAt(cx + x, FLOOR_Y - 1, cz + z) === AIR) continue;
        const step = Math.min(4, Math.floor((20 - d) / 2.5));
        if (step <= 0) continue;
        for (let h = 0; h < step; h++) w.set(cx + x, FLOOR_Y + h, cz + z, AIR);
        w.set(cx + x, FLOOR_Y - 1, cz + z, (step & 1) ? P.accent : P.floor);
      }
    }
    // Four braziers on the diagonals: the room's one green fire, and its only
    // line-of-sight breakers, because a bowl has nothing else standing in it.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const px = Math.round(cx + Math.cos(a) * 14);
      const pz = Math.round(cz + Math.sin(a) * 14);
      w.fill(px - 1, FLOOR_Y, pz - 1, px + 1, FLOOR_Y + 5, pz + 1, P.wall);
      w.set(px, FLOOR_Y + 6, pz, P.deco);
    }
  },

  // Firelands — cracks in black rock. A one-wide crack is a hazard for the
  // player, whose hitbox is 0.6 across, and not for a boss 1.0 to 1.7 wide
  // that bridges it. That asymmetry is the room's mechanic: the outer lap is
  // the fast way round and it costs you.
  (w, { P, FLOOR_Y, cx, cz, seed }) => {
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + hash2(i, 3, seed);
      let r = 24;
      let drift = 0;
      while (r > 13) {
        drift += (hash2(i, r, seed) - 0.5) * 0.22;
        const x = Math.round(cx + Math.cos(a + drift) * r);
        const z = Math.round(cz + Math.sin(a + drift) * r);
        if (w.blockAt(x, FLOOR_Y - 1, z) !== AIR) w.set(x, FLOOR_Y - 1, z, B.LAVA);
        r -= 0.7;
      }
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.5;
      const px = Math.round(cx + Math.cos(a) * 15);
      const pz = Math.round(cz + Math.sin(a) * 15);
      w.fill(px - 1, FLOOR_Y, pz - 1, px + 1, FLOOR_Y + 6, pz + 1, P.wall);
      w.set(px, FLOOR_Y + 7, pz, P.trim);
    }
  },

  // Craftcrown — the frost castle. Eight buttresses stepping off the wall and
  // eight ribs springing from their tops, open between them so you see sky
  // through the vault. A closed dome would cost four times as much and would
  // shut the room in.
  (w, { P, FLOOR_Y, cx, cz }) => {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      for (let stage = 0; stage < 5; stage++) {
        const r = 23 - stage;
        const h = 5 + stage * 3;
        const px = Math.round(cx + Math.cos(a) * r);
        const pz = Math.round(cz + Math.sin(a) * r);
        w.fill(px, FLOOR_Y, pz, px + 1, FLOOR_Y + h, pz + 1, P.wall);
      }
      // The rib, springing inward from the buttress top toward the middle.
      for (let t = 0; t < 10; t++) {
        const r = 19 - t * 1.7;
        const y = FLOOR_Y + 15 + Math.round(t * 0.5);
        const px = Math.round(cx + Math.cos(a) * r);
        const pz = Math.round(cz + Math.sin(a) * r);
        w.fill(px, y, pz, px + 1, y, pz + 1, P.trim);
      }
    }
  },
];

export const LAYOUT_COUNT = 6;
export const LAYOUT_NAMES = [
  'Fortress', 'Crucible', 'Spires', 'Colosseum', 'Labyrinth', 'Causeway',
];

export function createArena(theme, seed, layout = 0, opts = {}) {
  return new World().generate(theme, clamp(seed, 1, 99999), layout, opts);
}
