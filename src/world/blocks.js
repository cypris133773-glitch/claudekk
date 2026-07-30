// Block definitions. `tiles` is [top, bottom, side] atlas tile ids.

import { T } from '../render/atlas.js';

export const AIR = 0;

export const BLOCKS = [
  { name: 'air', tiles: null, solid: false, opaque: false },
  { name: 'stone', tiles: [T.STONE, T.STONE, T.STONE], solid: true, opaque: true },
  { name: 'cobble', tiles: [T.COBBLE, T.COBBLE, T.COBBLE], solid: true, opaque: true },
  { name: 'grass', tiles: [T.GRASS_TOP, T.DIRT, T.GRASS_SIDE], solid: true, opaque: true },
  { name: 'dirt', tiles: [T.DIRT, T.DIRT, T.DIRT], solid: true, opaque: true },
  { name: 'plank', tiles: [T.PLANK, T.PLANK, T.PLANK], solid: true, opaque: true },
  { name: 'log', tiles: [T.LOG_TOP, T.LOG_TOP, T.LOG_SIDE], solid: true, opaque: true },
  { name: 'obsidian', tiles: [T.OBSIDIAN, T.OBSIDIAN, T.OBSIDIAN], solid: true, opaque: true },
  { name: 'lava', tiles: [T.LAVA, T.LAVA, T.LAVA], solid: false, opaque: true, emissive: 1, damage: 14 },
  { name: 'brick', tiles: [T.BRICK, T.BRICK, T.BRICK], solid: true, opaque: true },
  { name: 'sand', tiles: [T.SAND, T.SAND, T.SAND], solid: true, opaque: true },
  { name: 'leaves', tiles: [T.LEAVES, T.LEAVES, T.LEAVES], solid: true, opaque: false },
  { name: 'glow', tiles: [T.GLOW, T.GLOW, T.GLOW], solid: true, opaque: true, emissive: 1 },
  { name: 'metal', tiles: [T.METAL, T.METAL, T.METAL], solid: true, opaque: true },
  { name: 'mossy', tiles: [T.MOSSY, T.MOSSY, T.MOSSY], solid: true, opaque: true },
  { name: 'rune', tiles: [T.RUNE, T.RUNE, T.RUNE], solid: true, opaque: true, emissive: 0.85 },
  { name: 'crystal', tiles: [T.CRYSTAL, T.CRYSTAL, T.CRYSTAL], solid: true, opaque: false, emissive: 0.8 },
  { name: 'darkstone', tiles: [T.DARKSTONE, T.DARKSTONE, T.DARKSTONE], solid: true, opaque: true },
  { name: 'gold', tiles: [T.GOLD, T.GOLD, T.GOLD], solid: true, opaque: true },
  // Raid materials. Blocks are never tinted — a wall is exactly what its tile
  // looks like — so a room whose fiction is ice needs a block that is ice
  // rather than a brick wall in an icy light.
  { name: 'basalt', tiles: [T.BASALT, T.BASALT, T.BASALT], solid: true, opaque: true, emissive: 0.12 },
  { name: 'ice', tiles: [T.ICE, T.ICE, T.ICE], solid: true, opaque: true },
  { name: 'blackice', tiles: [T.BLACKICE, T.BLACKICE, T.BLACKICE], solid: true, opaque: true },
];

export const B = {};
BLOCKS.forEach((b, i) => { B[b.name.toUpperCase()] = i; });
