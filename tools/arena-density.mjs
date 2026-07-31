// How much of each arena is blocked, and how far you can see across it.
//
// "Too many blockades, and you have to hunt too hard for enemies" is a
// complaint about two measurable things: the share of the floor you cannot
// walk on, and the distance a sightline survives before a wall eats it. Both
// are printed here per layout so a change to the generator can be judged
// rather than eyeballed.
//
//   node tools/arena-density.mjs
//   node tools/arena-density.mjs --seeds 8

import { createArena, LAYOUT_COUNT, LAYOUT_NAMES, SX, SZ } from '../src/world/world.js';

// The base arena floor, from the generator.
const FLOOR_Y = 4;

const SEEDS = Number((process.argv.find((a) => a.startsWith('--seeds=')) || '').split('=')[1])
  || (process.argv.includes('--seeds') ? Number(process.argv[process.argv.indexOf('--seeds') + 1]) : 4);

/**
 * Walk a ray at eye height and report how far it gets. Sampled at a third of
 * a block, which is finer than any wall the generator builds.
 */
function rayLength(w, x0, z0, dx, dz, y, max) {
  for (let d = 0.5; d < max; d += 0.34) {
    if (w.isSolid(x0 + dx * d, y, z0 + dz * d)) return d;
  }
  return max;
}

function measure(layout, seed) {
  const w = createArena(0, seed, layout);
  const cx = w.playerSpawn ? w.playerSpawn.x : SX / 2;
  const cz = w.playerSpawn ? w.playerSpawn.z : SZ / 2;

  // The interior, not the whole arena. The boundary wall sits at radius 26
  // and is not going anywhere, so including it puts a constant in the number
  // that no amount of obstacle removal can move.
  const R = 22;
  let floor = 0, blocked = 0;
  const eye = [];
  for (let x = -R; x <= R; x += 1) {
    for (let z = -R; z <= R; z += 1) {
      if (x * x + z * z > R * R) continue;
      const wx = cx + x, wz = cz + z;
      const g = w.groundAt(wx, wz, 40);
      if (g === null || g === undefined) continue;
      floor++;
      // A blockade is something you cannot see over or step onto: solid at
      // chest height above the *base* floor. A one-block tier is terrain you
      // walk across and does not count; a two-block wall is terrain you walk
      // around and does. That distinction is the whole complaint — raised
      // ground is fine, walls are not.
      if (w.isSolid(wx, FLOOR_Y + 1.2, wz)) blocked++;
      else eye.push([wx, wz, Math.max(g, FLOOR_Y) + 1.2]);
    }
  }

  // Sightlines from a sample of standable tiles, 16 directions each.
  const MAX = 40;
  const lens = [];
  const step = Math.max(1, Math.floor(eye.length / 220));
  for (let i = 0; i < eye.length; i += step) {
    const [x, z, y] = eye[i];
    for (let a = 0; a < 16; a++) {
      const th = (a / 16) * Math.PI * 2;
      lens.push(rayLength(w, x, z, Math.cos(th), Math.sin(th), y, MAX));
    }
  }
  lens.sort((a, b) => a - b);
  const pct = (p) => lens[Math.min(lens.length - 1, Math.floor(lens.length * p))];
  return {
    blockedPct: (blocked / Math.max(1, floor)) * 100,
    p10: pct(0.10), median: pct(0.5), p90: pct(0.9),
    // The share of sightlines that die inside eight blocks, which is roughly
    // where a fight stops being about the room and starts being about the wall
    // you are standing next to.
    shortPct: (lens.filter((v) => v < 8).length / Math.max(1, lens.length)) * 100,
  };
}

const rows = [];
for (let L = 0; L < LAYOUT_COUNT; L++) {
  const runs = [];
  for (let s = 0; s < SEEDS; s++) runs.push(measure(L, 1000 + s * 977));
  const avg = (k) => runs.reduce((a, r) => a + r[k], 0) / runs.length;
  rows.push({
    name: LAYOUT_NAMES[L],
    blocked: avg('blockedPct'),
    p10: avg('p10'), median: avg('median'), p90: avg('p90'),
    short: avg('shortPct'),
  });
}

console.log(`arena density over ${SEEDS} seeds, 22-block interior (wall is at 26)\n`);
console.log('layout          wall%   sightline p10 / median / p90    <8 blocks');
for (const r of rows) {
  console.log(
    `${r.name.padEnd(12)}  ${r.blocked.toFixed(1).padStart(6)}%   `
    + `${r.p10.toFixed(1).padStart(5)} / ${r.median.toFixed(1).padStart(6)} / ${r.p90.toFixed(1).padStart(5)}`
    + `        ${r.short.toFixed(0).padStart(3)}%`);
}
const mean = (k) => rows.reduce((a, r) => a + r[k], 0) / rows.length;
console.log(`\nmean wall ${mean('blocked').toFixed(1)}%  ·  mean median sightline `
  + `${mean('median').toFixed(1)}  ·  mean short ${mean('short').toFixed(0)}%`);
