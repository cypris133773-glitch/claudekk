// Procedurally generated 256x256 texture atlas (16x16 tiles of 16x16 px).
// Everything is drawn in code so the game ships with zero binary art assets —
// no third-party textures, nothing to license.

import { hash2, clamp } from '../core/math.js';

export const TILE = 16;        // pixels per tile
export const TILES = 16;       // tiles per row
export const ATLAS_PX = TILE * TILES;

/** Tile ids, laid out row-major in the atlas. */
export const T = {
  BLANK: 0,
  STONE: 1,
  COBBLE: 2,
  GRASS_TOP: 3,
  GRASS_SIDE: 4,
  DIRT: 5,
  PLANK: 6,
  LOG_SIDE: 7,
  LOG_TOP: 8,
  OBSIDIAN: 9,
  LAVA: 10,
  BRICK: 11,
  SAND: 12,
  LEAVES: 13,
  GLOW: 14,
  METAL: 15,
  MOSSY: 16,
  RUNE: 17,
  CRYSTAL: 18,
  BONE: 19,
  CLOTH: 20,
  SKIN: 21,
  DARKSTONE: 22,
  GOLD: 23,
  // Enemy face tiles — the front face of each mob's head cube.
  FACE_HUSK: 24,
  FACE_SKELE: 25,
  FACE_BOMBER: 26,
  FACE_CRAWLER: 27,
  FACE_BOSS: 28,
  FACE_FIEND: 29,
  FACE_PLAYER: 30,
  /** Reserved slot. Replaced at runtime by assets/enemy-head.png when present. */
  CUSTOM_HEAD: 31,
  /** Soft radial falloff, used as the blob shadow under every entity. */
  SHADOW: 32,

  /** Cracked, cooling rock. A charred body as much as a floor. */
  BASALT: 40,
  /** Faceted, unnoisy ice. Noise reads as rock; facets read as ice. */
  ICE: 41,
  /** Dark ice, so what the player casts sits on top of it rather than in it. */
  BLACKICE: 42,

  // --- Raid materials and faces -------------------------------------------
  //
  // Four of the seven are faces, and that is the right split: the head is a
  // quarter of the model's height and the only part with a dedicated front
  // slab, so a face tile buys more identity per tile than any material does.
  /** Beast hide: overlapping scallops, so a hide reads as a hide, not noise. */
  SCALE: 33,
  /** Plate with a channel cut into it. Machinery that is still running. */
  RUNEPLATE: 34,
  /** Perforated ghost: holes punched below the alpha cutoff. */
  SPECTRAL: 35,
  /** Two lit slots on near-black. The lit-face family. */
  FACE_SLOT: 36,
  /** A carved ritual mask: heavy brow, narrow slits, banded jaw. */
  FACE_MASK: 37,
  /** One machined slit and two rivets. It is not a face, and that is the point. */
  FACE_VISOR: 38,
  /** Empty sockets and a hanging jaw. The undead face. */
  FACE_HOLLOW: 39,
};

function px(data, x, y, r, g, b, a = 255) {
  const i = (y * ATLAS_PX + x) * 4;
  data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
}

/** Paint one tile with a callback returning [r,g,b,a] for local pixel coords. */
function paint(data, tileId, fn) {
  const tx = (tileId % TILES) * TILE;
  const ty = Math.floor(tileId / TILES) * TILE;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const c = fn(x, y);
      px(data, tx + x, ty + y, c[0], c[1], c[2], c[3] === undefined ? 255 : c[3]);
    }
  }
}

const shade = (base, amt) => [
  clamp(base[0] + amt, 0, 255) | 0,
  clamp(base[1] + amt, 0, 255) | 0,
  clamp(base[2] + amt, 0, 255) | 0,
];

/** Speckled noise fill — the workhorse look for most blocks. */
function noisy(base, spread, seed) {
  return (x, y) => shade(base, (hash2(x, y, seed) - 0.5) * spread);
}

function buildAtlasPixels() {
  const data = new Uint8ClampedArray(ATLAS_PX * ATLAS_PX * 4);

  paint(data, T.BLANK, () => [255, 255, 255]);
  paint(data, T.STONE, noisy([128, 128, 132], 34, 1));
  paint(data, T.DARKSTONE, noisy([62, 62, 70], 26, 21));
  paint(data, T.DIRT, noisy([120, 85, 58], 36, 2));
  paint(data, T.SAND, noisy([214, 203, 154], 26, 3));
  paint(data, T.PLANK, (x, y) => {
    const row = Math.floor(y / 4);
    const base = [160 + row * 4, 120 + row * 3, 74];
    const seam = y % 4 === 0 ? -34 : 0;
    return shade(base, seam + (hash2(x, y, 4) - 0.5) * 22);
  });
  paint(data, T.COBBLE, (x, y) => {
    const cx = Math.floor(x / 4), cy = Math.floor(y / 4);
    const n = hash2(cx, cy, 5);
    const edge = x % 4 === 0 || y % 4 === 0 ? -40 : 0;
    return shade([120, 120, 124], edge + (n - 0.5) * 60 + (hash2(x, y, 6) - 0.5) * 16);
  });
  paint(data, T.MOSSY, (x, y) => {
    const cx = Math.floor(x / 4), cy = Math.floor(y / 4);
    const n = hash2(cx, cy, 5);
    const edge = x % 4 === 0 || y % 4 === 0 ? -40 : 0;
    const moss = hash2(x, y, 31) > 0.55;
    const base = moss ? [86, 118, 62] : [120, 120, 124];
    return shade(base, edge + (n - 0.5) * 50);
  });
  paint(data, T.GRASS_TOP, noisy([94, 152, 74], 40, 7));
  paint(data, T.GRASS_SIDE, (x, y) => {
    const lip = 3 + Math.floor(hash2(x, 0, 8) * 3);
    if (y < lip) return shade([94, 152, 74], (hash2(x, y, 7) - 0.5) * 40);
    return shade([120, 85, 58], (hash2(x, y, 2) - 0.5) * 36);
  });
  paint(data, T.LOG_SIDE, (x, y) => {
    const bark = Math.sin(x * 1.7) * 10;
    return shade([104, 76, 48], bark + (hash2(x, y, 9) - 0.5) * 26);
  });
  paint(data, T.LOG_TOP, (x, y) => {
    const d = Math.hypot(x - 7.5, y - 7.5);
    const ring = Math.sin(d * 2.2) * 16;
    return shade([154, 124, 82], ring + (hash2(x, y, 10) - 0.5) * 14);
  });
  paint(data, T.OBSIDIAN, (x, y) => {
    const n = hash2(x, y, 11);
    const glint = n > 0.92 ? 80 : 0;
    return shade([52, 42, 78], glint + (n - 0.5) * 26);
  });
  paint(data, T.LAVA, (x, y) => {
    const n = hash2(Math.floor(x / 2), Math.floor(y / 2), 12);
    const hot = n > 0.7;
    return shade(hot ? [255, 190, 60] : [214, 84, 22], (hash2(x, y, 13) - 0.5) * 40);
  });
  paint(data, T.BRICK, (x, y) => {
    const row = Math.floor(y / 4);
    const off = (row % 2) * 4;
    const seam = y % 4 === 0 || (x + off) % 8 === 0;
    return seam ? [176, 172, 166] : shade([150, 66, 54], (hash2(x, y, 14) - 0.5) * 26);
  });
  paint(data, T.LEAVES, (x, y) => {
    const n = hash2(x, y, 15);
    if (n > 0.86) return [0, 0, 0, 0];
    return shade([56, 118, 52], (n - 0.5) * 60);
  });
  paint(data, T.GLOW, (x, y) => {
    const n = hash2(Math.floor(x / 2), Math.floor(y / 2), 16);
    return shade([236, 214, 128], (n - 0.5) * 60);
  });
  paint(data, T.METAL, (x, y) => {
    const plate = x === 0 || y === 0 || x === 15 || y === 15 ? -28 : 0;
    const rivet = (x % 7 === 3 && y % 7 === 3) ? 40 : 0;
    return shade([148, 152, 160], plate + rivet + (hash2(x, y, 17) - 0.5) * 18);
  });
  paint(data, T.GOLD, (x, y) => {
    const n = hash2(x, y, 18);
    return shade([214, 176, 62], (n - 0.5) * 40 + Math.sin(y * 0.8) * 10);
  });
  paint(data, T.RUNE, (x, y) => {
    const cx = x - 7.5, cy = y - 7.5;
    const d = Math.hypot(cx, cy);
    const ring = d > 4.2 && d < 6.2;
    const cross = Math.abs(cx) < 1 || Math.abs(cy) < 1;
    if (ring || (cross && d < 6.4)) return [120, 210, 255];
    return shade([40, 44, 64], (hash2(x, y, 19) - 0.5) * 20);
  });
  paint(data, T.CRYSTAL, (x, y) => {
    const n = hash2(Math.floor(x / 3), Math.floor(y / 3), 20);
    return shade([120, 170, 235], (n - 0.5) * 70);
  });
  paint(data, T.BONE, noisy([224, 220, 200], 26, 22));
  paint(data, T.CLOTH, (x, y) => {
    const weave = ((x + y) % 4 === 0) ? -16 : 0;
    return shade([255, 255, 255], weave + (hash2(x, y, 23) - 0.5) * 16);
  });
  paint(data, T.SKIN, noisy([255, 255, 255], 20, 24));

  // --- Faces -------------------------------------------------------------
  // Drawn white-ish so the per-mob tint colour comes through; features are
  // baked dark so they survive tinting.
  const rect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

  paint(data, T.FACE_HUSK, (x, y) => {
    if (rect(x, y, 3, 6, 5, 8) || rect(x, y, 10, 6, 12, 8)) return [18, 24, 18];
    if (rect(x, y, 5, 11, 10, 12)) return [30, 20, 20];
    return shade([255, 255, 255], (hash2(x, y, 40) - 0.5) * 26);
  });

  paint(data, T.FACE_SKELE, (x, y) => {
    if (rect(x, y, 3, 5, 5, 8) || rect(x, y, 10, 5, 12, 8)) return [12, 12, 16];
    if (rect(x, y, 5, 11, 10, 11) && x % 2 === 0) return [40, 40, 46];
    if (rect(x, y, 5, 11, 10, 12)) return [200, 196, 180];
    return shade([250, 248, 236], (hash2(x, y, 41) - 0.5) * 22);
  });

  paint(data, T.FACE_BOMBER, (x, y) => {
    if (rect(x, y, 3, 4, 5, 7) || rect(x, y, 10, 4, 12, 7)) return [14, 14, 14];
    if (rect(x, y, 5, 8, 10, 13) && !rect(x, y, 6, 8, 9, 10)) return [14, 14, 14];
    return shade([255, 255, 255], (hash2(x, y, 42) - 0.5) * 30);
  });

  paint(data, T.FACE_CRAWLER, (x, y) => {
    const eyes = [[3, 6], [6, 5], [9, 5], [12, 6], [5, 9], [10, 9]];
    for (const [ex, ey] of eyes) if (rect(x, y, ex, ey, ex + 1, ey + 1)) return [220, 40, 40];
    if (rect(x, y, 6, 12, 9, 13)) return [30, 16, 16];
    return shade([255, 255, 255], (hash2(x, y, 43) - 0.5) * 34);
  });

  // Cracks with a cooling halo rather than a hard edge: the ring one pixel
  // outside a crack takes a dimmer, darker orange, which is what stops the
  // network reading as painted-on lines.
  paint(data, T.BASALT, (x, y) => {
    const crack = hash2(x >> 2, y >> 2, 56) > 0.62;
    if (crack) return [200, 70, 20];
    const near = hash2((x + 1) >> 2, y >> 2, 56) > 0.62
      || hash2((x - 1) >> 2, y >> 2, 56) > 0.62
      || hash2(x >> 2, (y + 1) >> 2, 56) > 0.62
      || hash2(x >> 2, (y - 1) >> 2, 56) > 0.62;
    if (near) return [90, 26, 10];
    return shade([30, 22, 20], (hash2(x, y, 57) - 0.5) * 16);
  });

  // No noise, deliberately. Every other stone in the atlas is noisy and noise
  // is what reads as rock; flat fields between facet bands are what read as
  // ice, and the contrast between the two is what tells them apart at distance.
  paint(data, T.ICE, (x, y) => {
    const band = (((x + y) >> 2) & 1) ? 14 : -14;
    const chip = x > 11 && x < 14 && y > 2 && y < 5;
    return shade([168, 206, 228], band + (chip ? 34 : 0));
  });

  paint(data, T.BLACKICE, (x, y) => {
    const band = (((x + y) >> 2) & 1) ? 7 : -7;
    return shade([26, 34, 46], band + (Math.abs(x - y) < 2 ? 26 : 0));
  });

  // --- Raid materials -------------------------------------------------------

  // Deliberately pale: everything using this tints downward, and a dark base
  // would leave no headroom. Two shapes on a noisy field — the arc between
  // scales, which is what makes it read as a hide at thirty blocks, and the
  // per-scale gradient, which is what stops it reading as a grid at three.
  paint(data, T.SCALE, (x, y) => {
    const row = Math.floor(y / 4);
    const ox = (row & 1) * 2;
    const sx = (x + ox) % 4, sy = y % 4;
    const d = Math.hypot(sx - 1.5, sy - 3.0);
    return shade([176, 168, 148],
      (d > 2.4 ? -46 : 0) + (1.5 - sy) * 6 + (hash2(x, y, 48) - 0.5) * 14);
  });

  // The channel colour is a fixed cold grey rather than a shade of the base, so
  // a plate tinted bronze keeps a cool groove and a plate tinted steel-blue
  // does not. One tile, two materials, out of one hardcoded triple.
  paint(data, T.RUNEPLATE, (x, y) => {
    const border = x < 1 || y < 1 || x > 14 || y > 14;
    const groove = (Math.abs(x - 8) < 1 && y > 2 && y < 13)
      || (Math.abs(y - 8) < 1 && x > 2 && x < 13);
    const r = Math.hypot(x - 8, y - 8);
    if (groove || (r < 2.2 && r > 1.2)) return [96, 118, 140];
    return shade([150, 154, 162],
      (border ? -34 : 0) + (((x + y) & 7) === 0 ? 12 : 0) + (hash2(x, y, 49) - 0.5) * 16);
  });

  // The holes are denser at the top because this goes on bodies and limbs, and
  // the top of a limb is the shoulder: a figure that dissolves upward reads as
  // rising, one that dissolves downward reads as broken. They are literal a=0,
  // so they discard rather than blend and cost nothing in draw order.
  paint(data, T.SPECTRAL, (x, y) => {
    const n = hash2(x >> 1, (y + Math.floor(x / 5)) >> 1, 50);
    if (n < 0.30 && y < 11) return [0, 0, 0, 0];
    const wisp = Math.sin(x * 0.9 + y * 0.35) * 12;
    return shade([236, 238, 244], wisp + (y > 12 ? -30 : 0) + (hash2(x, y, 51) - 0.5) * 18);
  });

  // --- Raid faces -----------------------------------------------------------
  //
  // The head colour tints the head cube and this slab together, and the tint is
  // a multiply. Every face already in the atlas bakes its features bright on a
  // near-white field, which works until the head is dark — then the features
  // get multiplied down with everything else. FACE_SLOT inverts it: the field
  // is near-black and the features are white, so they come out at exactly the
  // head colour however dark the head is. It is the only tile here that works
  // that way and it is what lets a roster of near-black bosses tell apart.
  paint(data, T.FACE_SLOT, (x, y) => {
    if (rect(x, y, 3, 6, 5, 8) || rect(x, y, 10, 6, 12, 8)) return [255, 255, 255];
    // Not decoration: without the bridge the two slots read as two separate
    // lights at distance, and two lights is what a pair of floor hazards is.
    if (rect(x, y, 6, 7, 9, 7)) return [90, 90, 96];
    return shade([26, 24, 30], (hash2(x, y, 52) - 0.5) * 12);
  });

  // The teeth repeat every three pixels, not two: a 2px band aliases into a
  // grey smear past ten blocks, and a mask whose teeth turn to mush is a pale
  // square.
  paint(data, T.FACE_MASK, (x, y) => {
    if (rect(x, y, 2, 3, 13, 4)) return [40, 30, 24];
    if (rect(x, y, 3, 6, 6, 7) || rect(x, y, 9, 6, 12, 7)) return [16, 12, 14];
    if (rect(x, y, 4, 10, 11, 13)) return (x % 3 === 0) ? [30, 22, 20] : [246, 242, 228];
    if (rect(x, y, 6, 8, 9, 9)) return [70, 52, 40];
    return shade([250, 246, 232], (hash2(x, y, 53) - 0.5) * 22);
  });

  // A machine. The slit is white for the same reason FACE_SLOT's eyes are: it
  // comes out at the head colour, so a hall of them is told apart by the colour
  // of one horizontal line.
  paint(data, T.FACE_VISOR, (x, y) => {
    if (rect(x, y, 2, 7, 13, 8)) return [255, 255, 255];
    if (rect(x, y, 1, 2, 14, 3)) return [40, 44, 50];
    if ((x === 3 || x === 12) && y === 12) return [190, 196, 206];
    return shade([54, 58, 66], (hash2(x, y, 54) - 0.5) * 14);
  });

  // Deeper, squarer sockets than FACE_SKELE, and the jaw is a hole rather than
  // a tooth row — the two must not collide, because a raid that summons
  // Bonecasters puts them on screen together.
  paint(data, T.FACE_HOLLOW, (x, y) => {
    if (rect(x, y, 3, 5, 6, 8) || rect(x, y, 9, 5, 12, 8)) return [10, 12, 16];
    if (rect(x, y, 5, 11, 10, 11) && x % 2 === 0) return [200, 198, 186];
    if (rect(x, y, 5, 11, 10, 14)) return [14, 14, 18];
    return shade([244, 242, 232], (hash2(x, y, 55) - 0.5) * 20);
  });

  paint(data, T.FACE_BOSS, (x, y) => {
    if (rect(x, y, 2, 5, 6, 7) || rect(x, y, 9, 5, 13, 7)) return [255, 120, 40];
    if (rect(x, y, 3, 10, 12, 13)) return ((x + y) % 2 === 0) ? [235, 230, 215] : [26, 20, 20];
    return shade([255, 255, 255], (hash2(x, y, 44) - 0.5) * 24);
  });

  paint(data, T.FACE_FIEND, (x, y) => {
    if (rect(x, y, 3, 6, 5, 7) || rect(x, y, 10, 6, 12, 7)) return [255, 220, 120];
    if (rect(x, y, 5, 10, 10, 11)) return [30, 12, 30];
    return shade([255, 255, 255], (hash2(x, y, 45) - 0.5) * 26);
  });

  paint(data, T.FACE_PLAYER, (x, y) => {
    if (rect(x, y, 3, 6, 5, 8) || rect(x, y, 10, 6, 12, 8)) return [40, 60, 110];
    if (rect(x, y, 6, 11, 9, 12)) return [120, 70, 60];
    return shade([255, 255, 255], (hash2(x, y, 46) - 0.5) * 18);
  });

  // Custom head slot: neutral until a texture is supplied at runtime.
  paint(data, T.CUSTOM_HEAD, noisy([255, 255, 255], 18, 47));

  // Blob shadow: white with a radial alpha ramp, so a single tinted quad
  // reads as a soft contact shadow. Squared falloff keeps the centre dark
  // and the edge from banding on a 16px tile.
  paint(data, T.SHADOW, (x, y) => {
    const dx = (x + 0.5) / TILE - 0.5;
    const dy = (y + 0.5) / TILE - 0.5;
    const d = Math.min(1, Math.hypot(dx, dy) * 2);
    const a = Math.round(255 * Math.pow(1 - d, 1.6));
    return [255, 255, 255, a];
  });

  return data;
}

/** UV rect for a tile: [u0, v0, du, dv] in atlas space. */
export function tileUV(id) {
  const s = 1 / TILES;
  const tx = (id % TILES) * s;
  const ty = Math.floor(id / TILES) * s;
  // Inset by a texel edge to stop bleeding between neighbouring tiles.
  const pad = 0.25 / ATLAS_PX;
  return [tx + pad, ty + pad, s - pad * 2, s - pad * 2];
}

/**
 * Replace a single atlas tile with an image at runtime. Returns false if the
 * host would not let it happen.
 * Used by the optional custom enemy head (see assets/README.md): drop a
 * square PNG at assets/enemy-head.png and it becomes the mob face tile.
 * The image is nearest-downsampled to 16x16 so it stays in the blocky style.
 */
export function patchTile(gl, tex, tileId, image) {
  try {
    const c = document.createElement('canvas');
    c.width = TILE; c.height = TILE;
    const ctx = c.getContext('2d');
    if (!ctx) return false;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0, TILE, TILE);
    const tx = (tileId % TILES) * TILE;
    const ty = Math.floor(tileId / TILES) * TILE;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // An image from another origin taints the canvas, and uploading a tainted
    // canvas throws SecurityError. Every URL is "another origin" to a
    // sandboxed frame, which has no origin of its own. The generated tile
    // underneath is a perfectly good face, so this is only ever a downgrade.
    gl.texSubImage2D(gl.TEXTURE_2D, 0, tx, ty, gl.RGBA, gl.UNSIGNED_BYTE, c);
    return true;
  } catch {
    return false;
  }
}

/** Try to load an optional user-supplied texture; resolves false if absent. */
export function tryLoadCustomHead(gl, tex, url = 'assets/enemy-head.png') {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(patchTile(gl, tex, T.CUSTOM_HEAD, img));
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

/** Upload the generated atlas as a GL texture with nearest filtering. */
export function createAtlasTexture(gl) {
  const pixels = buildAtlasPixels();
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, ATLAS_PX, ATLAS_PX, 0, gl.RGBA,
    gl.UNSIGNED_BYTE, new Uint8Array(pixels.buffer));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}
