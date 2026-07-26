# Assets

The game ships with **no binary art or audio**. Every texture is generated in
code (`src/render/atlas.js`) and every sound is synthesised at runtime
(`src/core/audio.js`). That keeps the build tiny, the licensing clean, and the
game commercially shippable as-is.

Two optional drop-in hooks exist if you want to replace generated content with
your own.

## `enemy-head.png` — custom enemy face

Drop a square PNG here named `enemy-head.png` and it replaces the face on the
front of every non-boss enemy's head cube.

- Any square size works; it is nearest-neighbour downsampled to **16×16** so it
  keeps the blocky look. Authoring at 16×16 directly gives the cleanest result.
- Transparency is supported.
- The file is loaded at startup. If it is absent, the built-in procedural faces
  are used — the game does not error.

**Use only artwork you own or are licensed to use.** Do not use a photograph of
a real person — especially not a minor — as an enemy face in a game you intend
to distribute or sell. Likeness rights are separate from copyright and apply
even to photos you took yourself, and app stores including Steam will reject
builds that use a real person's likeness without a signed release.

## `sounds/` — custom sound pack

See [`sounds/README.md`](sounds/README.md).
