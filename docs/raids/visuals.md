# Raid bosses: what they look like

Forty-two bosses, seven rooms, one humanoid model, zero binary assets. This
document fixes the visual identity of every raid roster, the exact skin block
each boss is built from, the tiles that have to be added to the atlas, and the
rules that keep a boss's attacks distinguishable from the player's own.

It is a spec, not a change. **No source file is modified by this document.**

Two documents constrain it and both win where they disagree:

- `docs/raids/rooms.md` fixes each raid's palette, floor luminance and accent.
  Four accents were re-picked because they collided with a colour the player
  casts. A boss is designed *against* its room, so the room's palette is an
  input here, never something to renegotiate.
- `docs/raids/mechanics.md` §2 fixes the telegraph vocabulary: three danger
  colours keyed to the action, three shapes, three durations. Boss effects
  speak that vocabulary. They do not get private colours.

---

## 0. What the model can actually do

Everything below is built from `drawHumanoid` in `src/game/entity.js` and
nothing else. It is a short vocabulary and it is worth being exact about it
before spending it, because most of the interesting choices here are forced by
these six facts.

**A skin is nine colours and a handful of tiles.**

```js
{ head, body, arm, leg,          // required: [r,g,b] floats, via hex()
  hat, horns, pauldrons,         // optional: presence adds the part
  headTile, bodyTile, armTile, legTile, hatTile, hornTile, pauldronTile,
  faceTile, faceUntinted,
  emissive, alpha, scale, trail, trailColor }
```

**Colour is a multiply, not a paint.** The fragment shader is
`rgb = tex.rgb * uTint.rgb` (`src/render/gl.js:51`). The tile decides the
*pattern* and the ceiling; the colour decides the hue and can only ever darken.
`T.BONE` is `[224,220,200]`, so a bone colour of `#e0dcc4` lands at almost
exactly the tile's own value; `T.SKIN` and `T.CLOTH` are near-white, which is
why every shipped mob's colour reads as-written on those two tiles and reads
much darker on `T.METAL` (`[148,152,160]`, a 0.58 multiplier). **Every hex in
§2 is the value after that multiply has been accounted for.** Where a boss uses
a dark tile the colour is pushed up to compensate.

That multiply is also the trick that makes a lit face possible. The head colour
tints the head cube *and* the face slab. So:

> **Put the brightness in the head colour and the darkness in the tile.**
> A near-black `headTile` with a near-white eye rectangle in the `faceTile`
> gives a dark head with eyes at exactly the head colour. That is the whole
> mechanism behind Black Temple's rosters, and it is why §4 adds `FACE_SLOT`.

**Emissive is per-entity, not per-part.** `common` carries one `emissive` into
every box of the model. There is no way to make only the chest glow. A "molten
core" is therefore a *tile* whose hot pixels are baked bright, plus a modest
whole-body emissive to carry it through fog. Emissive also lerps the light
toward white (`gl.js:62`) and cancels 60% of fog, so it flattens shading — over
about 0.4 a boss stops having a readable silhouette and becomes a bright
cut-out. **0.40 is the hard ceiling; the roster sits at 0.08–0.38.**

**Alpha is per-entity too**, and it applies to the whole model including horns
and pauldrons. Below about 0.55 a translucent boss stops occluding the floor
behind it and becomes hard to aim at, so **0.62 is the floor for alpha.**
Separately, tile alpha under 0.35 is *discarded* (`uCutoff`), so a tile with
holes punched in it (`T.LEAVES` does this) gives a dissolving body at full
opacity — a different and cheaper effect than `skin.alpha`, and the one
`SPECTRAL` in §4 uses.

**The drawn model is taller than `height`.** Legs, body and head are
`0.72 + 0.75 + 0.50 = 1.97` units, and `unit = height / 1.8 * scale`, so:

```
drawn height   = 1.094 × height × scale      (feet stay at e.y)
shoulder span  = (0.55 + 2 × 0.24) × unit = 0.572 × height × scale
```

A `height: 5.2` boss draws **5.7 blocks tall and 3.0 wide at the shoulders.**
Pauldrons add another `0.24 × unit` a side. The hitbox `width` is unrelated to
any of that and is always much narrower — `colossus` is 1.5 wide with a 2.4
block span — which is correct: you should be able to run past a giant's arm.

**The camera is at eye height on a 28-block room.** Past about 6 blocks drawn,
a boss's head leaves the frame at melee range and you fight a pair of legs.
**So: `1.094 × height × scale ≤ 5.8`, i.e. `height ≤ 5.3` at `scale 1`.** That
is the single hardest cap in this document and no boss is allowed to break it,
including the last boss of the last raid.

**Horns, pauldrons and the hat are the silhouette.** They are the only three
things that change the outline, they cost 8, 2 and 1 extra boxes, and at 390px
they are the entire difference between "a big enemy" and "*that* enemy". Colour
is the second read, always. The comment already in `entity.js` says it: horns
are "the cheapest way to make a humanoid box read as a monster", pauldrons are
what "makes a heavy enemy look heavy without changing its hitbox".

---

## 1. Seven identities

One rule per raid, applied to all six of its bosses, chosen so the family reads
against that room's floor and fog rather than in the abstract.

The value rule that generates most of these: **a boss's body luminance must
differ from its room's floor luminance by at least 1.8:1 in one direction or
the other.** Floors are locked at L 20–70 by `rooms.md` §3, so a room with a
light floor gets dark bosses and a room with a black floor gets pale ones. Where
that is impossible (Zul'Gurub, Icecrown) a high-value trim — bone, ice — carries
the contrast locally instead.

| Raid | Floor L | Body L | Colour family | Silhouette rule | The one feature |
| --- | --- | --- | --- | --- | --- |
| Zul'Gurub | 63 | 30–45 | bruised crimson, plum, wet hide, bone | lean and tall; narrow hitboxes | **Horns.** All six. |
| Molten Core | 63 | 22–38 | charcoal, ash, banked orange | squat, smooth, no appendages | **Emissive core** (`BASALT` seams) |
| Karazhan | 46–52 | 88–175 | ivory, ash-lavender, cold steel | narrow, tall, top-light | **Translucency** + a hat on every one |
| Ulduar | 65 | 30–48 | iron, bronze, one steel-cyan | rectangular; widest hitboxes in the game | **Plate** + pauldrons on all six |
| Black Temple | 25 | 16–30 | black-plum, one hot hue each | top-heavy wedge | **The lit face** — brightest pixel on the model |
| Firelands | 23 | 130–175 | ash-white body, charcoal limbs | mass low and wide | **Inverted value** — pale bosses on the darkest floor |
| Icecrown | 33 | 43–128 | pale steel-blue, bone, ice white | armoured, upright, crowned | **Rime** — `ICE` growths on plate |

### 1 · Zul'Gurub — horned, and the only green in the room is poison

The room is olive-green stone at L 63 with gold idols, and the hazard is acid
green. Two colours are therefore spent: green means "this hurts", gold means
"this is scenery". The roster takes what is left and takes the complement of the
floor: **bruised crimson and plum bodies at L 30–45, bone-white masks and horns
at L 215.** Against a green floor a red-brown boss is a 1.6:1 value pair but a
near-complementary hue pair, and the bone carries the local contrast where the
value does not: every mask and every horn is the brightest thing on the model by
a factor of five.

All six are horned. Nothing else in the game is horned until Black Temple, four
tiers later, so "horns" is genuinely a tier-0 signature rather than a decoration.
The horns are also the tell for how far into the raid you are: 3-segment stubs on
the first boss, and the sixth's read as a crown.

Silhouette: **lean.** Hitboxes 0.75–1.3 apart from the fifth, which is the beast
and breaks the rule on purpose.

### 2 · Molten Core — charred outside, lit from within

The room is grey rock lit orange *from below*, with a cold blue rune ring on the
Dais. So the boss must not be orange: a big orange mass in a room whose entire
lighting model is orange bounce disappears into it, and the lava is already the
saturated warm thing.

Instead the whole roster is **charcoal at L 22–38, drawn on `BASALT`** — the
tile `rooms.md` §5 already adds for the Firelands floor, base `[30,22,20]` with a
cracked network of `[200,70,20]` and a cooling halo. On a body-sized box it reads
as a crust with fire under it. Whole-body `emissive` 0.22–0.38 carries those
cracks through the room's tight 22/58 fog, and because emissive also skips fog by
60%, a Molten Core boss is legible from the Threshold at 20 blocks while the
floor around it has already gone red-brown.

No horns, no pauldrons, no hats on five of six. The silhouette is **smooth and
squat** — a mass, not a monster — because the tile is doing all the work and any
appendage would break the crust up into pieces. That absence is the family
resemblance.

### 3 · Karazhan — the household, still here

Violet-grey stone, gold candlelight overhead, no roof. It is the only room whose
floor is genuinely mid-value (L 46–52), and the only one where the light source
in the fiction is warm and above you. So Karazhan inverts everything: **pale
bosses, L 95–170, translucent at alpha 0.62–0.88.**

The `SPECTRAL` tile (§4) has holes punched below the alpha cutoff, so the bodies
are *perforated* as well as translucent — a ghost you can see the chequered floor
through in two ways at once. Combined with the room's ember hazard being dark and
low-contrast, the six bosses are unambiguously the brightest thing in the room
apart from what the player casts, which is the correct order.

Every one of them has a hat. It is the only raid where the hat slot is used
across the board, and on a translucent model that flat slab above the head is
the most solid-looking part — which is exactly the right eeriness for a room
full of the staff of a house.

Silhouette: **narrow and tall.** Hitboxes 0.6–1.1, heights 3.2–4.8: the tallest
mean of any raid and the thinnest. The exception is deliberate and noted in §2.

### 4 · Ulduar — plate, on a grid

`rooms.md` is unambiguous: Ulduar is the only right-angled room in the game and
that is its whole identity. The roster follows the architecture. **Every boss is
plated** — `RUNEPLATE` (§4) on head, body and arms — **and every boss has
pauldrons**, which are square slabs and the only part of the model that widens
the outline horizontally.

Bodies are iron at L 30–48 against a plate floor at L 65, and the trim is bronze
`#8a6a3a` rather than the room's amber lamps, so the boss never reads as one more
lit machine part. One boss carries steel-cyan and it is the trim only, never the
body: `#7ef0ff` is the Warden's projectile colour and lives at head height in
every fight in the game.

Silhouette: **rectangular.** Ulduar has the widest hitboxes in the document
(1.2–1.8) and the least height variance, because a room built on
`Math.max(abs(dx), abs(dz))` should be fought by things that look like they were
built the same way.

The sixth boss breaks the rule completely and is the only unplated thing in the
raid. That is the point of it, and it is described in §2.

### 5 · Black Temple — three colours, and the face is one of them

The room is near-black in every direction with exactly one fel-green fire in it.
`rooms.md` calls it the restraint room and the safest room in the game for
reading your own spells. The roster does not spend that.

**Bodies are matte black-plum at L 16–30** — darker than the room's own floor,
which is the one place in this document where the 1.8:1 value rule is inverted
deliberately: the boss reads as a *hole* in a dark room rather than a shape on
it, and everything you can see of it is trim. Each boss gets exactly **one hot
hue**, carried by the face, the horns and a pauldron edge and nothing else.

The `FACE_SLOT` tile (§4) is what makes this work: near-black with two white eye
rectangles, so the eyes come out at exactly the head colour and the head cube
comes out near-black. A Black Temple boss at 20 blocks is two coloured slots and
a silhouette. That is the most legible thing in this entire document and it costs
one tile.

Silhouette: **top-heavy wedge** — pauldrons on five of six, horns on four, narrow
legs. Heavy at the shoulder, light at the floor.

### 6 · Firelands — pale things on black rock

Molten Core is grey rock lit orange from below; Firelands is black rock under a
burning sky, floor L 23, the darkest walking surface in the game. Repeating the
Molten Core roster here would produce black bosses on a black floor.

So Firelands inverts: **ash-white bodies at L 130–175, charcoal limbs.** `T.BONE`
tinted toward ash carries it — flat, matte, no emissive at all on four of the
six. Against L 23 that is a 6:1 pair, the widest boss-to-floor contrast in the
set, and it also means a Firelands boss reads as a *silhouette* when it is
between you and the burning sky and as a *mass* when it is not. Same model, two
reads, depending only on where you stand. No other room does that.

The sixth boss is the exception: it is the darkest, hottest thing in the raid,
and it is the only one with emissive above 0.15. When five pale bosses have
trained you to expect pale, black-and-molten is a reveal for free.

Silhouette: **low and wide.** The mass sits at hip height; heights are the
second-lowest mean in the set and the widths the second-highest.

### 7 · Icecrown — rime on plate

Black ice underfoot at L 33, pale ice architecture above the eyeline, gold
braziers. The trap is obvious: a white boss in a white castle. The room already
solved it by putting everything pale above eye height, and the roster stays
consistent with that — **mid-value steel-blue plate at L 70–105, with `ICE`
growths as horns, pauldrons and crowns at L 200.**

So the value structure of a fight in Icecrown is: near-black floor, mid boss,
white spikes on top of the boss, white vaults far overhead. Three bands, and the
boss occupies the one nothing else is in. The one saturated cyan at floor level
stays what `rooms.md` made it — the hazard.

Rime is applied by *tile*, not by colour: `ICE` on the horn and pauldron slots
and nowhere else. It is the only raid where the appendages use a different
material from the body, and against six armoured bodies that is what makes it
read as growth rather than decoration.

Silhouette: **upright and crowned.** Every boss stands taller than it is wide,
five of six have something above the head, and the heights climb almost
monotonically through the raid — the only roster where they do, because it is the
last raid and the escalation is the point.

---

## 2. The forty-two skins

Written in the shape `drawHumanoid` consumes, using the `hex()` helper already
exported from `mobs.js`. Note that `Mob.draw()` currently renames `face` to
`faceTile` on its way through; these blocks use `faceTile` directly, which is
what the renderer path actually wants and what a raid boss table should store.

Before the rosters, the one rule that decides every hex below.

> **On a bright tile, write the colour you want. On a dark tile, write a bright
> colour.**

`rgb = tex.rgb * uTint.rgb`, so the tile is a ceiling. `CLOTH`, `SKIN`,
`SPECTRAL` and `BONE` are near-white (multipliers 1.00, 1.00, 0.93, 0.87) and
the hex reads as written. `RUNEPLATE` (0.60), `SCALE` (0.69), `STONE` (0.50),
`ICE` (0.80) darken it. `BASALT` (0.10 on its base, 0.78 on its cracks) and
`BLACKICE` (0.13) are almost black — a dark hex on either produces a black
rectangle, so Molten Core's charcoal bodies are written as *pale* colours and
come out dark, with the tile's hot cracks surviving at nearly full strength.
That inversion is the single most counter-intuitive thing in this document and
it is why the Molten Core roster below looks wrong until you multiply it out.

Every roster is followed by its effective body luminance after the multiply, so
the §1 value rule can be checked rather than trusted.

---

### Zul'Gurub — bone and bruise

Robes on `CLOTH`, hides on `SCALE`, every mask and horn on `BONE`. The masks are
the brightest thing on any of these models by a factor of five, and they are the
only part that does not change between the six — the ritual is what they have in
common.

```js
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
```

Effective body L: 30 · 35 · 26 · 33 · 43 · 33. Floor is 63, so every one of them
is a 1.5–2.4:1 dark-on-light pair, and the bone runs L 190–215 on top of that.
Gahz'ranka is the lightest and the largest, which is correct: the beast is the
one that reads as a mass rather than a silhouette.

---

### Molten Core — pale hexes, black bodies

Every body is `BASALT`. Read the hexes as multipliers, not as colours: `#d8c0b0`
on a tile whose base is `[30,22,20]` produces a body at L 19 whose crack network
is still `[170,52,16]`. Five of six have no horns, no pauldrons and no hat.

```js
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
```

Effective body L: 19 · 22 · 24 · 30 (obsidian is a lighter base) · 26 · 24.
Against a floor at 63 that is 2.1–3.3:1, the strongest dark-on-light set in the
document, and the hue separation between them is carried entirely by what the
crack colour becomes: orange, red-orange, grey-red, violet, yellow, red.

Garr is the only one on `OBSIDIAN` and the only one with a hat, because a
`bombs` boss needs to be identifiable the instant it appears in a pack — it is
the one whose position you have to track between detonations.

---

### Karazhan — perforated, hatted, pale

All six on `SPECTRAL` with `alpha` between 0.70 and 0.90, and all six wearing
something. The hat is the most solid-looking part of a translucent model, which
is the read this raid is built on.

```js
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
```

Effective body L: 161 · 158 · 174 · 88 (on `SCALE`, the dark one) · 106 · 120.
Floor is 46–52, so the pale four are 3.1–3.8:1 light-on-dark. The Wolf is the
deliberate hole in the pattern — the only opaque-reading, dark, horned, noisy
model in a raid of pale perforated ghosts, because it is the only one of the six
that was never a person.

---

### Ulduar — plate, on a grid

`RUNEPLATE` on head, body and arms; pauldrons on every one; `FACE_VISOR` on
four, so a machine's identity is the colour of one horizontal line. Trim is
bronze rather than the room's amber lamps.

```js
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
```

Effective body L: 44 · 43 · 26 · 35 · 41 · 180.

Yogg-Saron is the only boss in Ulduar with no pauldrons, no `RUNEPLATE` and no
visor, and it is 3.5× the luminance of the other five. That is the whole trick:
five machines train the eye for four fights, and the sixth is soft, pale,
translucent and wrong. It costs nothing — the same tile Karazhan already needs —
and it is the strongest single reveal in the set.

---

### Black Temple — one hot hue each, on the darkest bodies in the game

Every one is `FACE_SLOT` with the hot hue in the `head` colour, so the eyes come
out at exactly that hue and the head cube stays black. Nothing else on the model
carries it except the horns and one pauldron.

```js
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
```

Effective body L: 24 · 21 · 38 · 30 · 36 · 27. The room's floor is 25, so these
are the one roster in the document that does *not* clear 1.8:1 — by design. A
Black Temple boss is a hole in a dark room with two lit slots in it, and the
outline you see is the outline of what it occludes. It only works because
`rooms.md` made that room 80% near-black and gave it exactly one other colour.

---

### Firelands — pale on black

Ash bodies on `BONE`, charcoal limbs, almost no emissive. The inversion of
Molten Core, five tiers later, in the same element.

```js
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
```

Effective body L: 152 · 170 · 172 · 160 · 165 · 25. Floor is 23, so the first
five run 6.5–7.4:1 — the widest boss-to-floor contrast in the document — and the
sixth is 1.1:1 and carries itself entirely on emissive and crack colour. Five
pale bosses then one black one, in the raid whose sky is on fire.

---

### Icecrown — rime

`RUNEPLATE` bodies at mid value, `ICE` on horns, pauldrons and crowns, and
nothing else in `ICE`. The appendages are a different material from the body in
this raid and only in this raid, which is what makes them read as growth.

```js
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
```

Effective body L: 115 · 80 · 89 · 128 · 43 · 85. Floor is 33, so five of the six
are 2.4–3.9:1 light-on-dark. Sindragosa is 1.3:1 and is the exception the whole
raid is built around: a dark, translucent body carrying the brightest trim in the
game (ice at L 200+ across horns and both pauldrons), so what you track is the
rime and not the body. She is also the only boss whose *silhouette* is mostly
`ICE`, which is why the Lich King — who follows her — puts his ice in a crown
instead, on a solid mid-value body. Two frost bosses back to back had to differ
by construction, not by hue, because `mechanics.md` gives them the same
telegraph colour.

---

## 3. Silhouette and scale

Height and hitbox width per boss. *Drawn* and *Span* include `scale`. Three rules generated the table:

1. **`height ≤ 5.3`.** Drawn height is `1.094 × height`, and past ~5.8 blocks
   drawn the head leaves the frame at melee range.
2. **A raid's six span at least 1.6 blocks of height**, and the sixth boss is
   not automatically the tallest. A roster where size tracks kill order is a
   roster with one silhouette in it.
3. **Hitbox width is 0.28–0.36 × height for a lean boss and 0.36–0.44 × height
   for a heavy one.** The drawn shoulder span is `0.572 × height` regardless,
   so every boss's model overhangs its hitbox — deliberately, so you can walk
   past a swinging arm without being body-blocked.

`scale` is left at 1 everywhere except three bosses, noted below. It multiplies
the model without touching the hitbox or `height`, so it is the tool for "reads
bigger than it collides" and it is deliberately rationed: used everywhere it
would just be a second height field.

| # | Boss | Height | Drawn | Width | Span | Read |
| --- | --- | --- | --- | --- | --- | --- |
| **Zul'Gurub** | mean 3.9 | | | | | lean, one beast |
| 1 | High Priest Venoxis | 3.4 | 3.7 | 0.80 | 1.9 | tall, thin, robed |
| 2 | Bloodlord Mandokir | 4.0 | 4.4 | 1.15 | 2.3 | broad warrior |
| 3 | High Priestess Arlokk | 3.0 | 3.3 | 0.75 | 1.7 | small and fast |
| 4 | Jin'do the Hexxer | 3.6 | 3.9 | 0.85 | 2.1 | tall, hunched |
| 5 | Gahz'ranka | 5.0 | 5.5 | 1.75 | 2.9 | the beast; tallest and widest in T0 |
| 6 | Hakkar the Soulflayer | 4.6 | 5.0 | 1.30 | 2.6 | crowned, upright |
| **Molten Core** | mean 4.0 | | | | | squat, no appendages |
| 1 | Lucifron | 3.4 | 3.7 | 1.10 | 1.9 | compact |
| 2 | Magmadar | 4.4 | 4.8 | 1.65 | 2.5 | low and wide |
| 3 | Gehennas | 3.2 | 3.5 | 0.90 | 1.8 | smallest in the raid |
| 4 | Garr | 3.8 | 4.2 | 1.30 | 2.2 | crystalline crown |
| 5 | Baron Geddon | 4.0 | 4.4 | 1.15 | 2.3 | brightest, mid-size |
| 6 | Ragnaros | 5.2 | 5.7 | 1.60 | 3.0 | at the cap |
| **Karazhan** | mean 4.1 | | | | | narrow, tall |
| 1 | Attumen the Huntsman | 4.2 | 4.6 | 1.05 | 2.4 | armoured, most solid |
| 2 | Moroes | 3.2 | 3.5 | 0.65 | 1.8 | thinnest boss in the game |
| 3 | Maiden of Virtue | 4.0 | 4.4 | 0.90 | 2.3 | statue-still |
| 4 | The Big Bad Wolf | 3.6 | 3.9 | 1.20 | 2.1 | crouched, heaviest here |
| 5 | The Curator | 4.6 | 5.0 | 0.85 | 2.6 | tall, spindly, machine |
| 6 | Prince Malchezaar | 4.8 | 5.3 | 1.15 | 2.7 | tallest, crowned |
| **Ulduar** | mean 4.4 | | | | | rectangular |
| 1 | Flame Leviathan | 4.4 | 4.8 | 1.70 | 2.5 | a vehicle with arms |
| 2 | Razorscale | 4.0 | 4.4 | 1.35 | 2.3 | bronze, mid |
| 3 | Ignis the Furnace Master | 4.2 | 4.6 | 1.50 | 2.4 | furnace-bellied |
| 4 | Kologarn | 5.0 | 5.5 | 1.80 | 2.9 | widest hitbox in the game |
| 5 | Thorim | 3.8 | 4.2 | 1.20 | 2.2 | smallest, fastest |
| 6 | Yogg-Saron | 4.8 | 5.3 | 1.55 | 2.7 | soft mass among machines |
| **Black Temple** | mean 4.2 | | | | | top-heavy wedge |
| 1 | High Warlord Naj'entus | 4.2 | 4.6 | 1.20 | 2.4 | spined |
| 2 | Supremus | 5.0 | 5.5 | 1.70 | 2.9 | the big one, second in |
| 3 | Shade of Akama | 3.4 | 3.7 | 0.75 | 1.9 | small, hooded, faded |
| 4 | Teron Gorefiend | 3.8 | 4.2 | 0.90 | 2.2 | robed, floating read |
| 5 | Gurtogg Bloodboil | 4.4 | 4.8 | 1.60 | 2.5 | swollen |
| 6 | Illidan Stormrage | 4.6 | 5.0 | 1.10 | 2.6 | tall, narrow, horned |
| **Firelands** | mean 4.4 | | | | | low and wide |
| 1 | Beth'tilac | 3.6 | 4.3 | 1.55 | 2.3 | low, splayed, `scale 1.10` |
| 2 | Lord Rhyolith | 5.0 | 5.5 | 1.80 | 2.9 | a walking outcrop |
| 3 | Alysrazor | 4.2 | 4.6 | 1.00 | 2.4 | the lean one |
| 4 | Shannox | 4.0 | 4.4 | 1.35 | 2.3 | armoured hunter |
| 5 | Baleroc | 4.4 | 4.8 | 1.40 | 2.5 | column-like |
| 6 | Ragnaros, Firelord | 5.2 | 5.7 | 1.65 | 3.0 | at the cap, second time |
| **Icecrown** | mean 4.3 | | | | | upright, crowned |
| 1 | Lord Marrowgar | 4.4 | 4.8 | 1.50 | 2.5 | bone lattice |
| 2 | Lady Deathwhisper | 3.4 | 3.7 | 0.80 | 1.9 | robed, smallest |
| 3 | Deathbringer Saurfang | 4.0 | 4.4 | 1.25 | 2.3 | plate soldier |
| 4 | Festergut | 4.2 | 4.6 | 1.70 | 2.4 | bloated |
| 5 | Sindragosa | 5.0 | 5.8 | 1.45 | 3.0 | tall, `scale 1.06` |
| 6 | The Lich King | 4.6 | 5.2 | 1.20 | 2.7 | upright, crowned, `scale 1.04` |

The three `scale` uses: Beth'tilac at 1.10 to get a spread, low-slung read out of
a model whose proportions are fixed; Sindragosa at 1.06 and the Lich King at 1.04
so the final two bosses of the final raid are the two largest drawn models in the
game (5.8 and 5.2 blocks) without either exceeding the 5.3 height cap that the
melee camera imposes.

Two numbers worth stating plainly because they are load-bearing:

- **Nothing exceeds 5.8 blocks drawn.** The camera sits at `eyeY = y + 0.9 × 1.8
  = 1.62`. At the melee range of a `range: 4.0` boss, a 5.8-block model's head
  sits at roughly 55° above the horizon — right at the top of a 390px-wide
  portrait frame and still inside it. At 6.5 it is not.
- **Nothing is narrower than 0.65.** Below that the hitbox is thinner than the
  player's own 0.6 and projectiles start passing through a boss that visually
  fills the screen, which reads as a bug regardless of what the physics says.

---

## 4. New atlas tiles

Seven new tiles, ids **41–47**. `rooms.md` §5 already claims 33–40 (`BASALT`,
`ICE`, `BLACKICE`, `FELFIRE`, `FROSTED`, `VENOM`, `EMBER`, `WATER`), and four of
those eight do double duty here, which is why this list is seven and not fifteen.

**What is reused rather than added:**

| Need | Tile | Where it comes from |
| --- | --- | --- |
| molten rock, cracked crust | `BASALT` (33) | `rooms.md` — base `[30,22,20]`, hot crack network, cooling halo. Already exactly a charred body. |
| frost, clear ice | `ICE` (34) | `rooms.md` — faceted, unnoisy. Icecrown horns and pauldrons. |
| bone plate | `BONE` (19) | shipped. Tinted to ash for Firelands, left near-white for masks. |
| plain plate | `METAL` (15) | shipped. Rivets and a border; the undecorated armour. |
| gems, crystal growth | `CRYSTAL` (18) | shipped. Curator's head, Garr's crown. |
| gilding | `GOLD` (23) | shipped. |
| robes, hides | `CLOTH` (20) | shipped, near-white, so the colour reads as written. |

**What has to be added:**

| Id | Tile | Purpose |
| --- | --- | --- |
| 41 | `SCALE` | Beast hide. Zul'Gurub, two Firelands, one Ulduar, Sindragosa. |
| 42 | `RUNEPLATE` | Rune-etched metal. Every Ulduar boss, Icecrown armour, Karazhan's Curator. |
| 43 | `SPECTRAL` | Perforated ghost. All of Karazhan, two shades elsewhere. |
| 44 | `FACE_SLOT` | Two lit slots on black. The lit-face family. |
| 45 | `FACE_MASK` | Carved ritual mask. Zul'Gurub. |
| 46 | `FACE_VISOR` | A single machined slit. Ulduar. |
| 47 | `FACE_HOLLOW` | Sockets and a hanging jaw. Karazhan, Icecrown. |

Four of the seven are faces, and that is the right split: the head is 25% of the
model's height and the only part with a dedicated front face, so a face tile buys
more identity per tile than any material does. Seven raids share four faces plus
the two shipped ones (`FACE_BOSS`, `FACE_CRAWLER`) that still fit.

### 41 · `SCALE`

Overlapping scallops, so a hide reads as a hide rather than as noise. Base
`[176, 168, 148]` — deliberately pale, because everything using it tints
downward and a dark base would leave no headroom.

```
base [176,168,148]
row  = floor(y / 4)                       // four bands of scales
ox   = (row & 1) * 2                      // offset alternate rows by 2px
sx   = (x + ox) % 4, sy = y % 4
d    = hypot(sx - 1.5, sy - 3.0)          // scallop centre below the cell
edge = d > 2.4                            // the arc between scales
shade(base, (edge ? -46 : 0)
          + (1.5 - sy) * 6                // each scale lit at its top lip
          + (hash2(x, y, 48) - 0.5) * 14)
```

Two shapes on a noisy base: the arc and the per-scale gradient. The gradient is
what stops it reading as a grid at 3 blocks away; the arc is what makes it read
as scales at 30.

### 42 · `RUNEPLATE`

`T.METAL` is a plate with rivets, which is right for trash armour and too plain
for a raid whose fiction is "machinery still running". `RUNEPLATE` is the same
plate with a channel cut into it.

```
base [150, 154, 162]
border = x < 1 || y < 1 || x > 14 || y > 14        // -34, the plate edge
groove = (abs(x - 8) < 1 && y > 2 && y < 13)       // vertical channel
      || (abs(y - 8) < 1 && x > 2 && x < 13)       // horizontal channel
node   = hypot(x - 8, y - 8) < 2.2
      && hypot(x - 8, y - 8) > 1.2                 // a ring where they cross
if (groove || node) return [96, 118, 140]          // cold, unlit metal in the cut
shade(base, border - 34 : 0
          + ((x + y) & 7) === 0 ? 12 : 0           // faint brushed diagonal
          + (hash2(x, y, 49) - 0.5) * 16)
```

The channel colour is a *fixed* cold grey rather than a shade of the base, so
when the tile is tinted bronze or steel-blue the groove stays cool and the plate
does not — one tile, two materials, from one hardcoded triple. Icecrown tints it
`#8fa4b8` and the grooves read as shadow; Ulduar tints it `#8a6a3a` and they read
as tarnish.

### 43 · `SPECTRAL`

The tile that carries Karazhan. Vertical drift with holes punched below the
alpha cutoff, so a ghost is perforated at full opacity and *then* has
`skin.alpha` applied on top of that.

```
base [236, 238, 244]
n    = hash2(x >> 1, (y + floor(x / 5)) >> 1, 50)  // 2px cells, sheared
if (n < 0.30 && y < 11) return [0, 0, 0, 0]        // holes, denser toward the top
wisp = sin(x * 0.9 + y * 0.35) * 12                // vertical drift bands
hem  = y > 12 ? -30 : 0                            // the bottom edge darkens
shade(base, wisp + hem + (hash2(x, y, 51) - 0.5) * 18)
```

Three decisions worth stating. The holes are **denser at the top** (`y < 11`)
because the tile is used on bodies and limbs and the top of a limb is the
shoulder — a figure that dissolves upward reads as rising, and one that
dissolves downward reads as broken. The bottom two rows darken so a translucent
body still has an edge where it meets the leg. And the base is near-white so the
colour multiply does all the hue work, the same way `CLOTH` does.

Because the holes are literal `a = 0` and `uCutoff` is 0.35, they cost nothing
in blend order — those fragments discard rather than blend, so a Karazhan boss
is cheap despite being see-through twice over.

### 44 · `FACE_SLOT`

Near-black with two white rectangles. The white passes the head colour through
unattenuated; the black clamps the rest of the face to near-zero whatever the
colour is. Two lit slots on a dark head.

```
if (rect(x, y, 3, 6, 5, 8) || rect(x, y, 10, 6, 12, 8)) return [255, 255, 255];
if (rect(x, y, 6, 7, 9, 7)) return [90, 90, 96];    // a dim bridge between them
shade([26, 24, 30], (hash2(x, y, 52) - 0.5) * 12)
```

Follows the convention already in `atlas.js` — features baked so they survive
tinting — but inverted, because here the *feature* is what must survive and the
field is what must not. It is the only face tile in the atlas that works that
way and it is why Black Temple can have six bosses that are almost entirely
black and still tell apart at 25 blocks.

The dim bridge at `[90,90,96]` is not decoration: without it the two slots read
as two separate lights at distance rather than as a face, and two lights is what
a pair of floor hazards looks like.

### 45 · `FACE_MASK`

A carved mask: a heavy brow, narrow eye slits under it, and a banded jaw. Baked
dark on a near-white field so the head colour paints the mask and the slits stay
black.

```
if (rect(x, y, 2, 3, 13, 4)) return [40, 30, 24];         // brow bar
if (rect(x, y, 3, 6, 6, 7) || rect(x, y, 9, 6, 12, 7))
  return [16, 12, 14];                                     // eye slits
if (rect(x, y, 4, 10, 11, 13))
  return (x % 3 === 0) ? [30, 22, 20] : [246, 242, 228];   // banded teeth
if (rect(x, y, 6, 8, 9, 9)) return [70, 52, 40];          // nose block
shade([250, 246, 232], (hash2(x, y, 53) - 0.5) * 22)
```

The teeth band uses `x % 3` rather than `x % 2` — a 2px repeat aliases into a
grey smear the moment the head is more than ten blocks away, and a mask whose
teeth turn to mush is just a pale square. Three-pixel spacing survives.

### 46 · `FACE_VISOR`

One horizontal slit and two rivets. Nothing else. It is a machine and the whole
value of it is that it is not a face.

```
if (rect(x, y, 2, 7, 13, 8)) return [255, 255, 255];       // the slit: lit
if (rect(x, y, 1, 2, 14, 3)) return [40, 44, 50];          // brow plate
if ((x === 3 || x === 12) && y === 12) return [190, 196, 206]; // two rivets
shade([54, 58, 66], (hash2(x, y, 54) - 0.5) * 14)
```

The slit is white for the same reason `FACE_SLOT`'s eyes are: it comes out at
the head colour, so Ulduar's six machines are told apart by the colour of one
horizontal line. That is a strong enough read on its own that five of the six
need no other distinguishing colour above the neck.

### 47 · `FACE_HOLLOW`

Two empty sockets, no pupils, and a jaw hanging open. The undead face, shared by
Karazhan and Icecrown — the two rosters that are already told apart by material,
so sharing one face costs nothing.

```
if (rect(x, y, 3, 5, 6, 8) || rect(x, y, 9, 5, 12, 8)) return [10, 12, 16];
if (rect(x, y, 5, 11, 10, 14)) return [14, 14, 18];        // open jaw
if (rect(x, y, 5, 11, 10, 11) && x % 2 === 0) return [200, 198, 186];
shade([244, 242, 232], (hash2(x, y, 55) - 0.5) * 20)
```

Deeper and squarer sockets than `FACE_SKELE`, and the jaw is a hole rather than
a tooth row, so the two do not collide when a Bonecaster and a Karazhan boss are
on screen together — which they will be, because Karazhan spawns adds.

### Cost

Seven `paint` calls, 1,792 callbacks, on top of the 41 tiles the atlas will
already be generating. `buildAtlasPixels` runs once at load and walks 65,536
pixels regardless; this is not measurable. Atlas occupancy after this document
is **48 of 256 tiles**, so there is no pressure on the layout and no need to
reclaim anything.

---

## 5. Fight effects

`mechanics.md` §2 already fixed what a telegraph *means*: three colours keyed to
the action (`#ff7a3c` burst, `#8fe3ff` linger, `#b06cff` aimed), three shapes,
three durations. This section only fixes what it *looks like*, and it adds no
colours and no shapes of its own.

The rule that keeps flavour and safety separate, and the reason a boss can be
red while its attacks are violet:

> **The danger colour is on the ground. The boss's own colour is in the air.**

Every ground ring, every zone and every shockwave uses the mechanic's colour
class. Every mote, gib, projectile and trail uses the boss's `color` from
`raids.js`. The player reads the floor to survive and reads the air to know
what they are fighting, and neither read is ever contaminated by the other.

### 5.1 Per mechanic

Everything below is a call into `effects.js` as it stands unless marked
**[new]**.

**slam** — `Telegraph` at 4.5 / 8 / 11 in `#ff7a3c`, then `game.explode` in the
same amber, which already spawns a `Shockwave`. `Shockwave.draw` is doing the
work here and it is already good: three lagging rings of leaning blocks plus a
column of light at the origin for the first 55%. Add nothing to it. The only
per-raid layer is debris — 10 `Gib`s thrown from the impact ring at the boss's
`bodyTile` and `body` colour, so a Molten Core slam throws basalt and an
Icecrown slam throws ice.

**breath** — no ground telegraph exists for a cone and `mechanics.md` §1
deliberately did not add one. The wind-up is drawn instead: `game.burst(x,
eyeY, z, 6, boss.color)` every 0.2 s for the 1.4 s charge — **42 motes total**,
gathering at head height where the stream will come from — plus the amber
`impactFlash(0.18)` that every cast gets. Then 5 volleys × 6 `Projectile`s,
`speed: 22, size: 0.34, gravity: 0, life: 1.0` in the boss's colour. At 22
blocks/s a shot crosses the 18-block reach in 0.82 s, which is slow enough to
watch and thick enough to see edge-on — R3.

**adds** — three violet `Telegraph` rings, radius 1.6, 1.0 s, at the three spawn
points 3 blocks from the boss. On each spawn, `game.burst(x, y + 0.6, z, 14,
'#b06cff')` — the Broodmother's existing line, unchanged. The add itself is a
normal mob and looks like one; the violet is the only thing that says it is
about to appear.

**charge** — two violet `Telegraph`s, radius 2.5, one on the boss and one on the
player. Two rings with nothing between them read as a line and cost no new
drawing code, exactly as `mechanics.md` §4.4 says. During the 1.1 s travel, 2
`Particle`s per frame at the boss's feet, boss colour, `gravity: 0, life: 0.35,
size: 0.22` — a wake, which is the only thing that makes a fast-moving voxel
read as fast rather than as teleporting. On contact, a `Shockwave` at radius 2.5
in violet, duration 0.3.

**bombs** — one violet `Telegraph` under the player, radius 4.5, 1.5 s, then
`game.explode` in violet. The staggered second and third bombs are the same
thing 0.6 s apart. Nothing else: this is the mechanic whose whole value is that
the picture is simple and the boundary is honest, and any extra particle in the
middle of the ring makes it harder to see where the edge is.

**frost** — ice-blue `Telegraph`, 1.1 s, then `Zone({radius: 4.2, duration: 8,
color: '#8fe3ff', slow: 0.35})`. `Zone.draw`'s wobbling ring plus inner scatter
is already the right read for "the floor is gone here". On landing, 10
`Particle`s with `gravity: 20` and **[new]** a `tile` argument so they can be
drawn on `T.ICE` instead of `T.BLANK` — shards, not sparks. That is a single
optional constructor parameter and one line in `Particle.draw`; see §5.3.

**shadow** — violet `Telegraph`, radius 9, 2.2 s, centred on the player, then
`game.explode` in violet plus `applyDot`. While the dot is up: one `Particle` at
the player's feet every 0.25 s, violet, `gravity: -2` so it rises, `life: 0.8` —
**24 motes over the 6 s**. It is the only persistent visual the player wears,
and it has to be sparse: a dot indicator that fills the bottom of the frame is
the thing that hides the next telegraph.

**enrage** — no new visual. `checkEnrage` already fires `roar`, a banner, 0.5
shake and a 40-mote burst at `#ff5a3c`. Two additions, both one line: the boss's
aura ring brightens (`drawAuras` already reads `m.enraged`), and the boss's own
`emissive` steps up by 0.08, **clamped to the 0.40 ceiling from §0** — Geddon
and the Firelord are already at 0.38 and must not go past it. `enrageNova`'s
three rings are amber like every other burst.

### 5.2 The per-raid flavour layer

One row per raid, and it is entirely gibs and motes — nothing here touches a
telegraph.

| Raid | Gib tile | Gib colour | Mote colour | Reads as |
| --- | --- | --- | --- | --- |
| Zul'Gurub | `T.BONE` | boss `body` | boss `color` | splintered bone and hide |
| Molten Core | `T.BASALT` | boss `body` | `#ff8a3c` | cooling clinker |
| Karazhan | `T.SPECTRAL` | boss `body` | boss `color` | it comes apart rather than breaks |
| Ulduar | `T.RUNEPLATE` | boss `body` | `#ffa62b` | shed plate |
| Black Temple | `T.SCALE` | boss `body` | boss `color` | dark chunks, lit trim |
| Firelands | `T.BONE` | boss `body` | `#ffd24a` | ash and cinders |
| Icecrown | `T.ICE` | boss `pauldrons`, else `horns` | boss `color` | rime shatters off first |

Two of the seven throw the *trim* rather than the body: Icecrown's gibs are ice
because ice is what a player sees on that roster, and Karazhan's are `SPECTRAL`
so they are perforated even as debris. `Gib` already takes a `tile` argument
(`effects.js:147`) and already collides, bounces, settles and fades, so this
whole table is data.

### 5.3 What actually needs new code

Three things, and only one of them is a new class.

1. **The boundary ring in `Telegraph.draw`.** Already owed by `mechanics.md`
   §2.4 and already costed there at five lines. Every radius in that document
   and every telegraph in this one assumes it. Without it a raid telegraph is
   dishonest for a full second.
2. **A `tile` argument on `Particle`.** One optional constructor parameter,
   defaulting to `T.BLANK`, and one substitution in `draw`. It is what turns
   frost motes into shards and Firelands motes into cinders, and without it
   every particle in all forty-two fights is the same untextured cube.
3. **A `Core` class** — §6. Modelled on `Potion`, which already does fall,
   settle, bob, spin, halo and a rising column of motes.

Nothing else. No new telegraph shape, no cone, no beam, no vertical primitive,
no per-part emissive.

### 5.4 The draw-call budget, which is the real constraint

`Telegraph.draw` runs `segs = max(12, round(radius × 6))` and draws **two boxes
per segment, every frame, for the whole delay**. At the raid radii that is:

| Mechanic | Radius | Segs | Boxes/frame | Duration |
| --- | --- | --- | --- | --- |
| slam ring 3 | 11 | 66 | 132 | 0.5 s |
| shadow | 9 | 54 | 108 | 2.2 s |
| bombs | 4.5 | 27 | 54 | 1.5 s |
| charge (×2) | 2.5 | 15 | 60 | 0.9 s |

`Shockwave` is worse per frame but far shorter: at radius 11 it is
`max(14, 77) × 3 = 231` boxes for 0.35 s, plus the column.

Shadow is the problem — 108 draw calls a frame for 2.2 seconds, on a phone,
while a boss and up to seven adds are also drawing. **Cap the segment count at
56** (`segs = min(round(radius × 6), 56)`). At radius 9 that is a mote every
1.01 blocks instead of every 1.05 — the ring is a dotted ring either way, since
each block is only 0.28 wide — and at radius 11 it saves 20 boxes a frame for no
visible change. One `Math.min`.

The wider rule this implies, and it is worth stating because it is the one
budget a raid fight can actually blow:

> **No more than 250 effect boxes on screen at once.** One telegraph (≤112),
> one shockwave settling (≤231 for 0.35 s), one zone (≤44), and the motes.
> `mechanics.md` §2.6 already forbids two mechanics resolving within 0.8 s of
> each other, which is what makes this budget hold — the pacing rule and the
> draw-call rule are the same rule seen from two sides.

---

## 6. The Core drop

A boss dies and drops a Core. A Core is *permission* — it unlocks a tier's gear
slot for purchase, it is not the item — and there is exactly one per boss, which
makes it the single most important object in a raid and the one thing in this
document that has never been drawn before.

### What it looks like

**One colour for all forty-two: `#ffe9a8`, emissive 1.0.**

Not the raid's accent, not the boss's colour, not a danger colour. A Core looks
identical in Zul'Gurub at level 1 and in Icecrown at 60, so a player learns the
object once and never has to ask again what the glowing thing is. It is also the
only pale-gold emissive object in any of the seven rooms — `rooms.md` gives the
floor-level accent to gold in Zul'Gurub and bone-gold in Icecrown, but both of
those are *architecture*, static, and at the Dais rim, while this is at chest
height, in the middle, and moving.

The shape says which slot, in the fixed `CORE_ORDER` from `armor.js`:

| # | Slot | Shape | Boxes |
| --- | --- | --- | --- |
| 1 | weapon | one tall thin bar, 0.12 × 0.85 × 0.12, pitched 0.4 rad | 1 |
| 2 | chest | one wide slab, 0.52 × 0.34 × 0.18 | 1 |
| 3 | helm | a 0.36 cube under a 0.50 × 0.07 × 0.50 brim | 2 |
| 4 | boots | two 0.18 × 0.22 × 0.30 blocks, side by side | 2 |
| 5 | ring | eight 0.09 cubes on a circle of radius 0.24, spinning | 8 |
| 6 | trinket | three 0.26 cubes at 30° yaw offsets, counter-spinning | 3 |

All on `T.CRYSTAL` — the tile the `Potion` already uses for the same job, faceted
and unnoisy, so it reads as a made object rather than a rock. Around it, the same
three supporting elements `Potion.draw` uses and for the same reasons:

- a **ground halo**, `0.9 × 0.002 × 0.9` on `T.BLANK` at `alpha: 0.22`, so it
  reads on a dark floor;
- a **column of three rising motes**, 0.08 cubes, cycling upward over 0.9
  blocks, which is what actually catches the eye at range;
- a **bob and spin** — `sin(spin × 1.6) × 0.09` vertical, `spin` on yaw.

Plus one thing the potion does not have: a **cage** of four `T.GOLD` bars,
0.05 × 0.55 × 0.05, at the corners of a 0.42 square, counter-rotating on yaw.
Four bars, not eight — enough to say "contained", cheap enough not to hide the
shape inside. Total: **11–18 boxes per frame**, against the potion's 6.

### How it drops without stopping the fight

The boss is dead, but adds may not be, and the player may still be moving. The
sequence is 2 seconds long and never takes control:

```
t = 0.00   boss dies. Existing death path: 14 Gibs on the raid's gib tile
           (§5.2), a 40-mote burst in the boss's colour, screenShake 0.6,
           sfx('explode') then sfx('roar').
t = 0.35   the Core appears inside the collapsing gibs, at the boss's chest
           height, at scale 0.3.
t = 0.35   → 0.95  it rises 1.2 blocks and grows to full size, spinning up.
           The gibs are still falling underneath it — the Core comes out of
           the wreck rather than replacing it.
t = 0.95   it settles at head height and begins to bob. game.notify with
           the raid name and the slot, 2.6 s, using the existing banner.
t = 2.00   auto-collected, or earlier on touch, whichever comes first.
```

Four rules keep it out of the way:

1. **It is at head height, not on the floor.** Everything dangerous in this game
   is on the floor (R2). Putting the reward at eye level means it is never
   mistaken for a hazard and never hidden behind a corpse or a zone.
2. **It never expires.** `Potion` blinks out over its last four seconds because
   an arena floor fills up; a Core is one object per fight and a timer on it
   would add urgency to the one moment in a raid that should not have any. It
   is the only object in the game with `lifetime = Infinity`.
3. **It auto-collects.** No walking to it, no pickup radius to miss with a
   thumb. Touching it early just skips the wait. There is no version of this
   where a player finishes a boss and then loses the reward to a misread.
4. **The banner is `game.notify`,** the same one that already says
   "COLOSSUS ENRAGES". No modal, no camera lock, no pause. If three adds are
   still alive the player reads six words in the top third of the screen and
   keeps fighting, and the Armoury will still be there afterwards.

### Why it is not more than this

The temptation is a slow-motion moment, a dimmed room, a camera push. All three
require code the renderer does not have (there is no camera controller for
cutscenes, no time scale, no post-process), all three take control away on a
touchscreen where the player's thumb is already on the stick, and all three
would have to be skippable by the fifth time — which is the tenth minute of the
first raid. A glowing object that rises out of the wreck, says what it is, and
lets itself be taken is the whole ceremony the moment can afford, and it is the
version that is still good on the forty-second boss.

---

## 7. Readability rules

Seven rules. Every one of them exists because of the same problem: the player's
own skills fire at emissive 0.85–1.0 in saturated hues (`#ff8a3c`, `#8fe3ff`,
`#c98fff`, `#8ce06a`, `#ffd24a`), and there are six classes, so **there is no
hue left that a boss can own.** Distinctness has to come from somewhere other
than colour.

### R1 — The player owns brightness; the boss owns mass

Player effects: emissive 0.85–1.0, small, fast, short-lived.
**Boss bodies: emissive ≤ 0.40**, large, slow, matte, textured.

Note what this rule does *not* say. Boss telegraphs and zones go through the
same `Telegraph`, `Zone` and `Shockwave` classes the player's own skills use, at
the same emissive 0.7–1.0, and they should — a warning that is dimmer than a
spell is a warning nobody reads. The separation between the two is R2, R3 and
R4: plane, speed and colour class. Brightness separates the *boss* from its own
effects, not the boss from the player.

So the value ordering in any frame is: player effects and enemy telegraphs at
the top, both at 0.85–1.0; enemy bodies in the middle at ≤ 0.40; the room at the
bottom, matte and dark below the eyeline per `rooms.md` §3. Three bands, and a
boss never climbs out of its own.

### R2 — Enemy danger is flat on the floor; player damage is in the air

A boss telegraph is a disc or a band **lying on the ground**, always. A player
effect is a projectile, a swing trail, or a burst at chest height. The two
almost never occupy the same plane, so even when they are the same hue they are
separable by where you are looking.

The one exception is a boss projectile, and R3 covers it.

`rooms.md` already made the floor version of this rule for the rooms —
*"anything emissive and saturated lying flat on the floor is a hazard"* — and
this is the same rule extended to effects. Same lesson, transferring in both
directions: block hazard, boss telegraph, identical read.

### R3 — Enemy projectiles are slow and fat; player projectiles are fast and thin

Boss projectiles: `speed` 16–26, `size` 0.26–0.40.
Player projectiles: faster and smaller, already.

A 0.3-wide sphere crossing the arena in 1.5 seconds cannot be mistaken for a
skill shot even in the same colour, because you have time to watch it. This is
the existing convention — the Warden's `speed: 26, size: 0.3` against the
Bonecaster's `size: 0.22` — and every raid boss inherits it rather than
inventing a new one.

### R4 — Three danger colours, no fourth

Boss effects use the three colours `mechanics.md` §2 assigns to the action, and
nothing else. **A boss's own body colour never appears in its attacks**, and a
boss's attack colour never appears on another boss's attack meaning something
else. A player learns the vocabulary once, in Zul'Gurub, at level 1, and it is
still true in Icecrown at 60.

This is the rule most likely to be broken by good intentions: a frost boss
"wants" a blue nova, a fel boss "wants" a green one. It does not get one. The
mechanic decides the colour; the boss decides the shape and the tempo.

### R5 — Silhouette is the identity; colour is the second read

At 390px wide and 40 blocks away a boss is roughly 40 pixels tall and its
colours have been mixed 60% toward the fog colour. What survives is the outline:
horns, pauldrons, a hat, and how tall it is against the Dais rim.

So every roster in §1 is defined by an outline rule first and a palette second,
and every raid's six bosses differ in **height by at least 1.6 blocks across the
set** and in at least one silhouette part from their nearest sibling. If two
bosses in a raid can only be told apart by hue, one of them is wrong.

Test: desaturate a frame to greyscale and blur it to 40px. If you cannot name
the boss, the skin has failed.

### R6 — The body is matte; the trim is bright; the ratio is fixed

On every boss in this document the high-value material — bone, ice, crystal,
the lit face — covers **less than 20% of the model's projected area**. Horns,
pauldrons, a hat and a face slab together are under a fifth of a humanoid's
silhouette, which is exactly what makes them read as trim rather than as the
subject.

Invert it and the boss becomes a lantern: an 80%-bright boss competes with the
player's own effects (R1), loses its silhouette (R5), and stops registering hits
because `hurtFlash` mixes toward `[1.0, 0.55, 0.55]` and there is nowhere to mix
*to* from a body that is already near-white.

That last point is worth its own line. **A boss's body value must leave room for
the hit flash.** `gl.js:65` lerps toward a pale pink. On a body at L 30 that is
an unmistakable flash; on a body at L 200 it is a slight blush. Firelands' pale
roster is the closest this document comes to the edge, at L 130–175, and it is
why those six carry charcoal limbs — the limbs flash even when the torso barely
does.

### R7 — One emissive hue per room, and the boss is not it

`rooms.md` gives every room exactly one emissive hue at floor level, at the Dais
rim, the gate posts and the perch tops. The boss standing in the middle of it
must not share that hue, or the rim light and the boss merge into one bright
smear at range.

| Raid | Room's floor-level emissive | Boss family's hue |
| --- | --- | --- |
| Zul'Gurub | gold `#c9a227` | crimson / plum + bone white |
| Molten Core | cold blue `#9fd0ff` (Dais rim) | banked orange under charcoal |
| Karazhan | warm candle `#ffbf6a` | ivory / ash-lavender |
| Ulduar | amber `#ffa62b` | iron / bronze |
| Black Temple | fel `#a8ff5c` | black + one hot hue each |
| Firelands | lava `#ff8a3c` (Dais rim) | ash white |
| Icecrown | bone-gold `#e8d6a0` | steel blue + ice white |

Every row is a contrast pair, and in five of seven it is a temperature
inversion: warm room, cool boss, or the reverse. That is the same trick
`rooms.md` used for the Dais rim — *"the boss stands inside a cold ring in a hot
room"* — applied one layer up.

The one deliberate near-collision is Black Temple's sixth boss, whose hot hue is
fel green in a room whose hazard is fel green. It is allowed exactly once, at
the end of the raid, and only because that boss's green covers under 10% of the
model (face slots, horn tips, one pauldron edge) while its body is the darkest
in the game. If it were a green body it would be unshippable.

---

## Appendix: what this costs in code

Nothing structural. Listed so the estimate is honest.

1. **`atlas.js`** — seven new `T` ids and seven `paint` calls (§4).
2. **`mobs.js`** — 42 entries in `MOB_TYPES`, or better, a raid-boss table
   generated from `RAIDS` plus a per-boss skin map, since 42 hand-written mob
   defs would duplicate the power/health scaling that `raids.js` already
   computes.
3. **`entity.js`** — nothing. Every skin in §2 is expressible in the existing
   `drawHumanoid` vocabulary. That is a constraint this document accepted rather
   than a coincidence; where a design wanted a part the model does not have, the
   design changed.
4. **`effects.js`** — see §5 for the two primitives that do not exist yet, and
   the note on which bosses need them.
