# Credits & asset provenance

Keep this file accurate. Steam asks you to confirm you hold the rights to
everything in the build, and this is the record you check that against.

## Code

All game code in this repository is original. No third-party libraries,
frameworks, or engines are used at runtime.

## Art

All textures are generated procedurally at runtime by `src/render/atlas.js`.
No image files ship with the game.

| Asset | Source | Licence |
| --- | --- | --- |
| Block & entity textures | Generated in code | Original work |
| App icon (`assets/icon.svg`) | Hand-authored SVG | Original work |

## Audio

All sound effects and music are synthesised at runtime by `src/core/audio.js`.
No audio files ship with the game.

| Asset | Source | Licence |
| --- | --- | --- |
| All SFX | Generated in code (WebAudio) | Original work |
| Music | Generated in code (WebAudio) | Original work |

## Fonts

System font stack only (`Segoe UI`, `system-ui`, `-apple-system`). No font
files are distributed.

## If you add anything

Add a row above with the exact source URL and licence, and keep a copy of the
licence text or purchase receipt. Anything you cannot document, do not ship.
