// The forty-two raid bosses, as they look.
//
// Separate from raids.js because it is presentation and that file is rules —
// the same split menus.js already makes with its glyph maps. A boss entry there
// carries one colour, which is what the HUD and the menus use; this is what the
// renderer uses.
//
// Three things govern every choice here, all of them properties of the engine
// rather than of taste:
//
//   * The tint is a *multiply*. A tile is a ceiling, never a floor, so a body
//     is only ever as bright as its tile's base — which is why hides sit on a
//     deliberately pale SCALE and robes on a near-white CLOTH.
//   * The head colour tints the head cube and the face slab together. A face
//     baked bright on a light field goes dark the moment the head does, which
//     is why the dark rosters use FACE_SLOT, whose features are white on black
//     and therefore come out at exactly the head colour.
//   * Emissive is per entity, not per part. "A glowing core" has to be a tile.
//
// Within a raid the six read as siblings and still tell apart at fighting
// distance on a phone; across raids no two rosters share a material *and* a
// face.

import { T } from '../render/atlas.js';

const hex = (h) => [
  parseInt(h.slice(1, 3), 16) / 255,
  parseInt(h.slice(3, 5), 16) / 255,
  parseInt(h.slice(5, 7), 16) / 255,
];

export const BOSS_SKINS = {
venoxis: {          // High Priest Venoxis — plum robes, first mask
  head: hex('#e6dfc2'), headTile: T.BONE, faceTile: T.FACE_MASK,
  body: hex('#32203c'), bodyTile: T.CLOTH,
  arm:  hex('#4a3358'), armTile: T.CLOTH,
  leg:  hex('#241a2e'), legTile: T.CLOTH,
  horns: hex('#ded7ba'), hornTile: T.BONE,
  emissive: 0.10,
},
mandokir: {         // Bloodlord Mandokir — crimson hide, bone shoulders
  head: hex('#d8cfae'), headTile: T.BONE, faceTile: T.FACE_MASK,
  body: hex('#8e3020'), bodyTile: T.SCALE,
  arm:  hex('#7a2a1c'), armTile: T.SCALE,
  leg:  hex('#4e2018'), legTile: T.SCALE,
  horns: hex('#cfc6a4'), hornTile: T.BONE,
  pauldrons: hex('#c4bb98'), pauldronTile: T.BONE,
  emissive: 0.12,
},
arlokk: {           // High Priestess Arlokk — black hide, violet trim, small
  head: hex('#3a2c40'), headTile: T.SCALE, faceTile: T.FACE_CRAWLER,
  body: hex('#2e2434'), bodyTile: T.SCALE,
  arm:  hex('#4a3552'), armTile: T.SCALE,
  leg:  hex('#241c2a'), legTile: T.SCALE,
  horns: hex('#b8a8c8'), hornTile: T.BONE,
  emissive: 0.14,
},
jindo: {            // Jin'do the Hexxer — cold mask, headdress
  head: hex('#cfd6d0'), headTile: T.BONE, faceTile: T.FACE_MASK,
  body: hex('#243440'), bodyTile: T.CLOTH,
  arm:  hex('#356072'), armTile: T.CLOTH,
  leg:  hex('#1c2830'), legTile: T.CLOTH,
  hat:  hex('#3a6a84'), hatTile: T.CLOTH,
  horns: hex('#a8c4cf'), hornTile: T.BONE,
  emissive: 0.16,
},
gahzranka: {        // Gahz'ranka — the beast; no mask, no ritual
  head: hex('#5a7e98'), headTile: T.SCALE, faceTile: T.FACE_BOSS,
  body: hex('#476a84'), bodyTile: T.SCALE,
  arm:  hex('#3e5e76'), armTile: T.SCALE,
  leg:  hex('#2c4456'), legTile: T.SCALE,
  horns: hex('#cfd2c0'), hornTile: T.BONE,
  emissive: 0.10,
},
hakkar: {           // Hakkar the Soulflayer — crowned, the sixth
  head: hex('#e0d6b4'), headTile: T.BONE, faceTile: T.FACE_MASK,
  body: hex('#8a2418'), bodyTile: T.SCALE,
  arm:  hex('#a03020'), armTile: T.SCALE,
  leg:  hex('#521810'), legTile: T.SCALE,
  hat:  hex('#d8cda6'), hatTile: T.BONE,
  horns: hex('#efe6c8'), hornTile: T.BONE,
  pauldrons: hex('#cfc4a0'), pauldronTile: T.BONE,
  emissive: 0.24,
},
lucifron: {         // Lucifron — the plain one, the reference
  head: hex('#ff9a5c'), headTile: T.BASALT, faceTile: T.FACE_SLOT,
  body: hex('#cfb4a4'), bodyTile: T.BASALT,
  arm:  hex('#c0a294'), armTile: T.BASALT,
  leg:  hex('#8f7a6e'), legTile: T.BASALT,
  emissive: 0.22,
},
magmadar: {         // Magmadar — low, wide, hottest crust
  head: hex('#ff7a3c'), headTile: T.BASALT, faceTile: T.FACE_SLOT,
  body: hex('#e0b49a'), bodyTile: T.BASALT,
  arm:  hex('#d8a88c'), armTile: T.BASALT,
  leg:  hex('#a08070'), legTile: T.BASALT,
  emissive: 0.26,
},
gehennas: {         // Gehennas — ashed over, the dullest and smallest
  head: hex('#c8a894'), headTile: T.BASALT, faceTile: T.FACE_SLOT,
  body: hex('#b8b0aa'), bodyTile: T.BASALT,
  arm:  hex('#a89e98'), armTile: T.BASALT,
  leg:  hex('#8a827e'), legTile: T.BASALT,
  emissive: 0.20,
},
garr: {             // Garr — obsidian body, crystal crown
  head: hex('#b0a0c0'), headTile: T.OBSIDIAN, faceTile: T.FACE_SLOT,
  body: hex('#a494b4'), bodyTile: T.OBSIDIAN,
  arm:  hex('#9c8caa'), armTile: T.OBSIDIAN,
  leg:  hex('#786a88'), legTile: T.OBSIDIAN,
  hat:  hex('#ffb46a'), hatTile: T.CRYSTAL,
  emissive: 0.24,
},
geddon: {           // Baron Geddon — the bright one; brightest crust in the raid
  head: hex('#ffd24a'), headTile: T.BASALT, faceTile: T.FACE_SLOT,
  body: hex('#ffd0a0'), bodyTile: T.BASALT,
  arm:  hex('#ffc490'), armTile: T.BASALT,
  leg:  hex('#c8a078'), legTile: T.BASALT,
  emissive: 0.38,
},
ragnaros1: {        // Ragnaros — at the height cap; nothing added, nothing needed
  head: hex('#ff5a28'), headTile: T.BASALT, faceTile: T.FACE_SLOT,
  body: hex('#ffc0a0'), bodyTile: T.BASALT,
  arm:  hex('#ffb090'), armTile: T.BASALT,
  leg:  hex('#c08a70'), legTile: T.BASALT,
  emissive: 0.34,
},
attumen: {          // Attumen the Huntsman — the most solid of them
  head: hex('#b4bccc'), headTile: T.SPECTRAL, faceTile: T.FACE_HOLLOW,
  body: hex('#96a2b4'), bodyTile: T.SPECTRAL,
  arm:  hex('#a2aec0'), armTile: T.SPECTRAL,
  leg:  hex('#7e8a9c'), legTile: T.SPECTRAL,
  hat:  hex('#8f98a8'), hatTile: T.METAL,
  pauldrons: hex('#7f8898'), pauldronTile: T.METAL,
  alpha: 0.88, emissive: 0.12,
},
moroes: {           // Moroes — thinnest model in the game
  head: hex('#c0b0cc'), headTile: T.SPECTRAL, faceTile: T.FACE_HOLLOW,
  body: hex('#a894b8'), bodyTile: T.SPECTRAL,
  arm:  hex('#b8a6c8'), armTile: T.SPECTRAL,
  leg:  hex('#6e5a7e'), legTile: T.SPECTRAL,
  hat:  hex('#6e5a7e'), hatTile: T.CLOTH,
  alpha: 0.70, emissive: 0.16,
},
maiden: {           // Maiden of Virtue — ivory, gilt halo, stands still
  head: hex('#cfc4a8'), headTile: T.SPECTRAL, faceTile: T.FACE_HOLLOW,
  body: hex('#b8ad94'), bodyTile: T.SPECTRAL,
  arm:  hex('#c4b89e'), armTile: T.SPECTRAL,
  leg:  hex('#9a9078'), legTile: T.SPECTRAL,
  hat:  hex('#e8c86a'), hatTile: T.GOLD,
  alpha: 0.85, emissive: 0.18,
},
bigbadwolf: {       // The Big Bad Wolf — the only Karazhan boss with horns
  head: hex('#a8794a'), headTile: T.SCALE, faceTile: T.FACE_CRAWLER,
  body: hex('#96683e'), bodyTile: T.SCALE,
  arm:  hex('#a8794a'), armTile: T.SCALE,
  leg:  hex('#6e4a2c'), legTile: T.SCALE,
  hat:  hex('#4e3620'), hatTile: T.CLOTH,
  horns: hex('#6e4e30'), hornTile: T.SCALE,     // ears, not horns
  alpha: 0.90, emissive: 0.08,
},
curator: {          // The Curator — a machine, and it shows
  head: hex('#a8dcf0'), headTile: T.CRYSTAL, faceTile: T.FACE_VISOR,
  body: hex('#9fb0c0'), bodyTile: T.RUNEPLATE,
  arm:  hex('#8fa0b0'), armTile: T.RUNEPLATE,
  leg:  hex('#7a8c9c'), legTile: T.RUNEPLATE,
  hat:  hex('#d8b46a'), hatTile: T.GOLD,
  alpha: 0.78, emissive: 0.24,
},
malchezaar: {       // Prince Malchezaar — tallest, darkest, crowned
  head: hex('#a086c0'), headTile: T.SPECTRAL, faceTile: T.FACE_SLOT,
  body: hex('#8a6ea8'), bodyTile: T.SPECTRAL,
  arm:  hex('#9478b4'), armTile: T.SPECTRAL,
  leg:  hex('#5e4a78'), legTile: T.SPECTRAL,
  hat:  hex('#3a2c4e'), hatTile: T.CLOTH,
  horns: hex('#d8c8e8'), hornTile: T.BONE,
  pauldrons: hex('#4a3a60'), pauldronTile: T.CLOTH,
  alpha: 0.82, emissive: 0.20,
},
leviathan: {        // Flame Leviathan — a vehicle with arms
  head: hex('#ff8a3c'), headTile: T.RUNEPLATE, faceTile: T.FACE_VISOR,
  body: hex('#4e4a44'), bodyTile: T.RUNEPLATE,
  arm:  hex('#5a544c'), armTile: T.RUNEPLATE,
  leg:  hex('#3a3630'), legTile: T.RUNEPLATE,
  pauldrons: hex('#6e5a3a'), pauldronTile: T.RUNEPLATE,
  emissive: 0.18,
},
razorscale: {       // Razorscale — plate over scale, bronze
  head: hex('#c9a06a'), headTile: T.RUNEPLATE, faceTile: T.FACE_VISOR,
  body: hex('#52483a'), bodyTile: T.RUNEPLATE,
  arm:  hex('#a8834a'), armTile: T.SCALE,
  leg:  hex('#6e5638'), legTile: T.SCALE,
  pauldrons: hex('#8a6a3a'), pauldronTile: T.RUNEPLATE,
  horns: hex('#c4b088'), hornTile: T.BONE,
  emissive: 0.16,
},
ignis: {            // Ignis the Furnace Master — a furnace wearing plate
  head: hex('#ff6a3c'), headTile: T.BASALT, faceTile: T.FACE_SLOT,
  body: hex('#d8b09a'), bodyTile: T.BASALT,
  arm:  hex('#5e5a54'), armTile: T.RUNEPLATE,
  leg:  hex('#4a4640'), legTile: T.RUNEPLATE,
  pauldrons: hex('#7a6a4a'), pauldronTile: T.RUNEPLATE,
  emissive: 0.30,
},
kologarn: {         // Kologarn — stone, not machine; widest hitbox in the game
  head: hex('#5a5654'), headTile: T.STONE, faceTile: T.FACE_BOSS,
  body: hex('#4a4644'), bodyTile: T.STONE,
  arm:  hex('#544e4a'), armTile: T.STONE,
  leg:  hex('#3a3634'), legTile: T.STONE,
  pauldrons: hex('#605a56'), pauldronTile: T.STONE,
  emissive: 0.10,
},
thorim: {           // Thorim — the small fast one; the raid's only cool trim
  head: hex('#9fd0ff'), headTile: T.RUNEPLATE, faceTile: T.FACE_VISOR,
  body: hex('#40485a'), bodyTile: T.RUNEPLATE,
  arm:  hex('#4a5468'), armTile: T.RUNEPLATE,
  leg:  hex('#323a4a'), legTile: T.RUNEPLATE,
  hat:  hex('#c9a860'), hatTile: T.GOLD,
  pauldrons: hex('#7a8494'), pauldronTile: T.METAL,
  emissive: 0.22,
},
yogg: {             // Yogg-Saron — no plate, no pauldrons, no right angles
  head: hex('#9dffb4'), headTile: T.SPECTRAL, faceTile: T.FACE_SLOT,
  body: hex('#7ad89a'), bodyTile: T.SPECTRAL,
  arm:  hex('#8ae0a8'), armTile: T.SPECTRAL,
  leg:  hex('#5aa878'), legTile: T.SPECTRAL,
  alpha: 0.90, emissive: 0.26,
},
najentus: {         // High Warlord Naj'entus — cold blue, spined
  head: hex('#4aa3ff'), headTile: T.SCALE, faceTile: T.FACE_SLOT,
  body: hex('#1e2430'), bodyTile: T.SCALE,
  arm:  hex('#252c3a'), armTile: T.SCALE,
  leg:  hex('#161b24'), legTile: T.SCALE,
  horns: hex('#6fb8ff'), hornTile: T.BONE,
  pauldrons: hex('#262e3c'), pauldronTile: T.METAL,
  emissive: 0.16,
},
supremus: {         // Supremus — the big one, second in
  head: hex('#ff6a3c'), headTile: T.BASALT, faceTile: T.FACE_SLOT,
  body: hex('#b09080'), bodyTile: T.BASALT,
  arm:  hex('#a88878'), armTile: T.BASALT,
  leg:  hex('#806860'), legTile: T.BASALT,
  pauldrons: hex('#a08878'), pauldronTile: T.BASALT,
  emissive: 0.28,
},
akama: {            // Shade of Akama — small, hooded, faded
  head: hex('#a35cff'), headTile: T.SPECTRAL, faceTile: T.FACE_SLOT,
  body: hex('#2e2440'), bodyTile: T.SPECTRAL,
  arm:  hex('#3a2e50'), armTile: T.SPECTRAL,
  leg:  hex('#221a30'), legTile: T.SPECTRAL,
  hat:  hex('#1e1828'), hatTile: T.CLOTH,
  alpha: 0.78, emissive: 0.18,
},
teron: {            // Teron Gorefiend — robed, reads as floating
  head: hex('#8a5cff'), headTile: T.CLOTH, faceTile: T.FACE_SLOT,
  body: hex('#241c30'), bodyTile: T.CLOTH,
  arm:  hex('#2e2440'), armTile: T.CLOTH,
  leg:  hex('#1a1424'), legTile: T.CLOTH,
  hat:  hex('#1a1424'), hatTile: T.CLOTH,
  horns: hex('#6a4a9a'), hornTile: T.BONE,
  alpha: 0.86, emissive: 0.20,
},
bloodboil: {        // Gurtogg Bloodboil — swollen, the widest here
  head: hex('#ff4a3c'), headTile: T.SCALE, faceTile: T.FACE_SLOT,
  body: hex('#4a3028'), bodyTile: T.SCALE,
  arm:  hex('#573a30'), armTile: T.SCALE,
  leg:  hex('#33221c'), legTile: T.SCALE,
  pauldrons: hex('#3a2420'), pauldronTile: T.SCALE,
  emissive: 0.14,
},
illidan: {          // Illidan Stormrage — fel, and the darkest body in the game
  head: hex('#9dff7a'), headTile: T.CLOTH, faceTile: T.FACE_SLOT,
  body: hex('#1a1c18'), bodyTile: T.CLOTH,
  arm:  hex('#212420'), armTile: T.CLOTH,
  leg:  hex('#121410'), legTile: T.CLOTH,
  horns: hex('#7ade5a'), hornTile: T.BONE,
  pauldrons: hex('#262a24'), pauldronTile: T.METAL,
  emissive: 0.18,
},
bethtilac: {        // Beth'tilac — low and splayed; scale 1.10
  head: hex('#ded2bc'), headTile: T.BONE, faceTile: T.FACE_CRAWLER,
  body: hex('#e8dcc8'), bodyTile: T.SCALE,
  arm:  hex('#4a3e36'), armTile: T.SCALE,
  leg:  hex('#2e2622'), legTile: T.SCALE,
  scale: 1.10, emissive: 0.08,
},
rhyolith: {         // Lord Rhyolith — a walking outcrop
  head: hex('#ff8a4a'), headTile: T.BASALT, faceTile: T.FACE_SLOT,
  body: hex('#cfc4b0'), bodyTile: T.BONE,
  arm:  hex('#b09080'), armTile: T.BASALT,
  leg:  hex('#a08070'), legTile: T.BASALT,
  emissive: 0.14,
},
alysrazor: {        // Alysrazor — the lean one, gilded
  head: hex('#ffd24a'), headTile: T.BONE, faceTile: T.FACE_SLOT,
  body: hex('#d8cfb4'), bodyTile: T.BONE,
  arm:  hex('#c8bfa4'), armTile: T.BONE,
  leg:  hex('#4a4038'), legTile: T.BASALT,
  horns: hex('#f0e8d0'), hornTile: T.BONE,
  pauldrons: hex('#e8c86a'), pauldronTile: T.GOLD,
  emissive: 0.12,
},
shannox: {          // Shannox — bone armour, masked
  head: hex('#d8c8a8'), headTile: T.BONE, faceTile: T.FACE_MASK,
  body: hex('#c8bca4'), bodyTile: T.BONE,
  arm:  hex('#bfb298'), armTile: T.BONE,
  leg:  hex('#3a3028'), legTile: T.BASALT,
  horns: hex('#efe6cc'), hornTile: T.BONE,
  pauldrons: hex('#ded2b8'), pauldronTile: T.BONE,
  emissive: 0.10,
},
baleroc: {          // Baleroc — a column with a lit face
  head: hex('#ff5a3c'), headTile: T.BASALT, faceTile: T.FACE_SLOT,
  body: hex('#d0c4ac'), bodyTile: T.BONE,
  arm:  hex('#423830'), armTile: T.BASALT,
  leg:  hex('#302822'), legTile: T.BASALT,
  emissive: 0.16,
},
ragnaros2: {        // Ragnaros, Firelord — the exception, and the reveal
  head: hex('#ff3c14'), headTile: T.BASALT, faceTile: T.FACE_SLOT,
  body: hex('#ffc4a0'), bodyTile: T.BASALT,
  arm:  hex('#ffb494'), armTile: T.BASALT,
  leg:  hex('#d8a088'), legTile: T.BASALT,
  emissive: 0.38,
},
marrowgar: {        // Lord Marrowgar — bone lattice, ice spikes
  head: hex('#9aa4ae'), headTile: T.BONE, faceTile: T.FACE_HOLLOW,
  body: hex('#7e8894'), bodyTile: T.BONE,
  arm:  hex('#8a94a0'), armTile: T.BONE,
  leg:  hex('#5e6672'), legTile: T.BONE,
  horns: hex('#cfeaff'), hornTile: T.ICE,
  pauldrons: hex('#b4d8ee'), pauldronTile: T.ICE,
  emissive: 0.16,
},
deathwhisper: {     // Lady Deathwhisper — robed, smallest, translucent
  head: hex('#c8b4e0'), headTile: T.CLOTH, faceTile: T.FACE_HOLLOW,
  body: hex('#5a4a72'), bodyTile: T.CLOTH,
  arm:  hex('#6a5a84'), armTile: T.CLOTH,
  leg:  hex('#3a2e4e'), legTile: T.CLOTH,
  hat:  hex('#3a2e4e'), hatTile: T.CLOTH,
  horns: hex('#dcecff'), hornTile: T.ICE,
  alpha: 0.85, emissive: 0.22,
},
saurfang: {         // Deathbringer Saurfang — plate soldier, red trim
  head: hex('#d4564a'), headTile: T.RUNEPLATE, faceTile: T.FACE_SLOT,
  body: hex('#8a94a4'), bodyTile: T.RUNEPLATE,
  arm:  hex('#7e8898'), armTile: T.RUNEPLATE,
  leg:  hex('#5e6674'), legTile: T.RUNEPLATE,
  hat:  hex('#6e2420'), hatTile: T.CLOTH,
  pauldrons: hex('#b4d8ee'), pauldronTile: T.ICE,
  emissive: 0.14,
},
festergut: {        // Festergut — bloated, sickly, the widest here
  head: hex('#9aae84'), headTile: T.SCALE, faceTile: T.FACE_SLOT,
  body: hex('#b4c0a0'), bodyTile: T.SCALE,
  arm:  hex('#a4b090'), armTile: T.SCALE,
  leg:  hex('#6e7a5e'), legTile: T.SCALE,
  pauldrons: hex('#cfe4ee'), pauldronTile: T.ICE,
  emissive: 0.12,
},
sindragosa: {       // Sindragosa — dark ice under white rime; scale 1.06
  head: hex('#9fd8ff'), headTile: T.BLACKICE, faceTile: T.FACE_HOLLOW,
  body: hex('#cfe8ff'), bodyTile: T.BLACKICE,
  arm:  hex('#bcdcff'), armTile: T.BLACKICE,
  leg:  hex('#8fb4d8'), legTile: T.BLACKICE,
  horns: hex('#e8f6ff'), hornTile: T.ICE,
  pauldrons: hex('#d8ecff'), pauldronTile: T.ICE,
  alpha: 0.88, scale: 1.06, emissive: 0.24,
},
lichking: {         // The Lich King — crowned, upright, the last one; scale 1.04
  head: hex('#cfe0f0'), headTile: T.RUNEPLATE, faceTile: T.FACE_SLOT,
  body: hex('#7e8ea8'), bodyTile: T.RUNEPLATE,
  arm:  hex('#8a9ab4'), armTile: T.RUNEPLATE,
  leg:  hex('#5a6880'), legTile: T.RUNEPLATE,
  hat:  hex('#dcf0ff'), hatTile: T.ICE,
  horns: hex('#cfe8ff'), hornTile: T.ICE,
  pauldrons: hex('#6e7e96'), pauldronTile: T.RUNEPLATE,
  scale: 1.04, emissive: 0.30,
},
};

/**
 * Silhouette per boss. Three rules made this table, and all three are about
 * what can be read rather than what is impressive:
 *
 *   * Height is capped at 5.3. Drawn height is 1.094x this, and past about 5.8
 *     drawn the head leaves the frame at melee range — a boss you cannot see
 *     the top of is a wall.
 *   * A raid's six span at least 1.6 blocks of height, and the sixth is not
 *     automatically the tallest. A roster where size tracks kill order has one
 *     silhouette in it.
 *   * The drawn shoulder span is 0.572x height whatever the hitbox is, so every
 *     model overhangs its own collision. That is deliberate: you can walk past
 *     a swinging arm without being body-blocked by it.
 */
export const BOSS_SIZES = {
  // Ulduar's table came out spanning 1.2 blocks, under the 1.6 the rest of the
  // set holds to — six machines of nearly one build, in the one raid where
  // telling six machines apart is hardest. Thorim is "smallest, fastest" in its
  // own row, so it takes the reduction: 3.8 -> 3.4 puts the span at 1.6 with
  // the roster's own description rather than against it.
  venoxis: { height: 3.4, width: 0.80 },   // High Priest Venoxis
  mandokir: { height: 4.0, width: 1.15 },   // Bloodlord Mandokir
  arlokk: { height: 3.0, width: 0.75 },   // High Priestess Arlokk
  jindo: { height: 3.6, width: 0.85 },   // Jin'do the Hexxer
  gahzranka: { height: 5.0, width: 1.75 },   // Gahz'ranka
  hakkar: { height: 4.6, width: 1.30 },   // Hakkar the Soulflayer
  lucifron: { height: 3.4, width: 1.10 },   // Lucifron
  magmadar: { height: 4.4, width: 1.65 },   // Magmadar
  gehennas: { height: 3.2, width: 0.90 },   // Gehennas
  garr: { height: 3.8, width: 1.30 },   // Garr
  geddon: { height: 4.0, width: 1.15 },   // Baron Geddon
  ragnaros1: { height: 5.2, width: 1.60 },   // Ragnaros
  attumen: { height: 4.2, width: 1.05 },   // Attumen the Huntsman
  moroes: { height: 3.2, width: 0.65 },   // Moroes
  maiden: { height: 4.0, width: 0.90 },   // Maiden of Virtue
  bigbadwolf: { height: 3.6, width: 1.20 },   // The Big Bad Wolf
  curator: { height: 4.6, width: 0.85 },   // The Curator
  malchezaar: { height: 4.8, width: 1.15 },   // Prince Malchezaar
  leviathan: { height: 4.4, width: 1.70 },   // Flame Leviathan
  razorscale: { height: 4.0, width: 1.35 },   // Razorscale
  ignis: { height: 4.2, width: 1.50 },   // Ignis the Furnace Master
  kologarn: { height: 5.0, width: 1.80 },   // Kologarn
  thorim: { height: 3.4, width: 1.10 },   // Thorim
  yogg: { height: 4.8, width: 1.55 },   // Yogg-Saron
  najentus: { height: 4.2, width: 1.20 },   // High Warlord Naj'entus
  supremus: { height: 5.0, width: 1.70 },   // Supremus
  akama: { height: 3.4, width: 0.75 },   // Shade of Akama
  teron: { height: 3.8, width: 0.90 },   // Teron Gorefiend
  bloodboil: { height: 4.4, width: 1.60 },   // Gurtogg Bloodboil
  illidan: { height: 4.6, width: 1.10 },   // Illidan Stormrage
  bethtilac: { height: 3.6, width: 1.55 },   // Beth'tilac
  rhyolith: { height: 5.0, width: 1.80 },   // Lord Rhyolith
  alysrazor: { height: 4.2, width: 1.00 },   // Alysrazor
  shannox: { height: 4.0, width: 1.35 },   // Shannox
  baleroc: { height: 4.4, width: 1.40 },   // Baleroc
  ragnaros2: { height: 5.2, width: 1.65 },   // Ragnaros, Firelord
  marrowgar: { height: 4.4, width: 1.50 },   // Lord Marrowgar
  deathwhisper: { height: 3.4, width: 0.80 },   // Lady Deathwhisper
  saurfang: { height: 4.0, width: 1.25 },   // Deathbringer Saurfang
  festergut: { height: 4.2, width: 1.70 },   // Festergut
  sindragosa: { height: 5.0, width: 1.45 },   // Sindragosa
  lichking: { height: 4.6, width: 1.20 },   // The Lich King
};

/** What a boss looks like, or a sane fallback for one that has no entry. */
export function bossSkin(id) { return BOSS_SKINS[id] || null; }
export function bossSize(id) { return BOSS_SIZES[id] || null; }
