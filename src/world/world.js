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
  generate(theme = 0, seed = 1, layout = 0) {
    this.data.fill(AIR);
    this.spawnPoints.length = 0;

    const themes = [
      { floor: B.STONE, accent: B.MOSSY, wall: B.COBBLE, trim: B.DARKSTONE, deco: B.GRASS },
      { floor: B.SAND, accent: B.SAND, wall: B.BRICK, trim: B.DARKSTONE, deco: B.SAND },
      { floor: B.DARKSTONE, accent: B.OBSIDIAN, wall: B.OBSIDIAN, trim: B.METAL, deco: B.DARKSTONE },
      { floor: B.PLANK, accent: B.LOG, wall: B.PLANK, trim: B.LOG, deco: B.LEAVES },
    ];
    const P = themes[theme % themes.length];

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
    ];
    this.layout = layout % builders.length;
    builders[this.layout](ctx);

    // Mob spawn ring around the outside of the arena floor
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r = R - 4;
      const px = cx + Math.cos(a) * r;
      const pz = cz + Math.sin(a) * r;
      if (!inArena(Math.round(px), Math.round(pz))) continue;
      if (this.blockAt(px, FLOOR_Y - 1, pz) === B.LAVA) continue;
      this.spawnPoints.push({ x: px, y: FLOOR_Y, z: pz });
    }

    this.playerSpawn = { x: cx + 0.5, y: FLOOR_Y + 3, z: cz + 0.5 };
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

export const LAYOUT_COUNT = 3;
export const LAYOUT_NAMES = ['Fortress', 'Crucible', 'Spires'];

export function createArena(theme, seed, layout = 0) {
  return new World().generate(theme, clamp(seed, 1, 99999), layout);
}
