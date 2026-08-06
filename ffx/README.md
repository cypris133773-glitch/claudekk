# FINAL SACRIFICE X

A turn-based JRPG in the shape of a very famous tenth entry in a very famous
series, rebuilt as a satire of a blockchain cult, its maester, and the loop
nobody involved wants to end.

Runs in the browser on **phones and desktop**. No engine, no framework, no build
step, no binary assets — hand-written ES modules, canvas 2D, and every sprite,
backdrop and note of music generated in code.

**18+.** It swears. It is fiction and parody throughout: the maester is a
character in a video game about a fake religion on a fake chain, and any
resemblance to a real self-described performance marketer with a very large
wristwatch is the entire joke. Nothing here is financial advice, and if you take
financial advice from a JRPG parody you are precisely who the game is about.

```bash
npm start     # http://localhost:8081
npm test      # 45 logic and integrity checks, no browser needed
npm run sim   # headless balance pass over every encounter and boss
```

---

## The premise

The world is **the Spiral**. Every few years a whale the size of a city comes up
out of the water and eats a port, and every few years a summoner walks out of a
village, collects seven airdrops from seven temples, reaches the ruined city of
Zanarcade, and performs the **Final Sacrifice** — which kills the Whale, buys
everyone a few good years called the Calm, and then, quietly, builds the next
Whale out of whoever she spent doing it.

Everybody knows the Calm is temporary. Nobody has ever asked what happens to the
guardian. The Church of the Ticker takes a cut of the pilgrimage, the maester
takes a cut of the Church, and the loop has run for a thousand years because the
loop is the product.

You play the guy who bought the top of a dream.

## The seven

Each one exists to beat something the others can't, which is why swapping in
mid-fight is free and why AP only goes to whoever actually took a turn.

| | Counters | What they're for |
| --- | --- | --- |
| **Dipus** | agile | Tempo. Haste, Cheer, and shoving enemies backwards down the turn order. |
| **Yield** | undead | White magic and every summon. Healing an exit-scammed thing hurts it. |
| **Audit** | armoured | Slow, enormous, pierces armour, and has been dead about the tokenomics since 2018. |
| **Wojak** | flying | The only one who can touch something in the air. Everyone else swings; he throws. |
| **Luna** | shelled | Black magic. Things immune to steel are not immune to an argument. |
| **Copi** | — | Ronso generalist who learns enemy moves by copying whatever is working. |
| **Rugku** | machina | Steals, mixes, and reads the contract, which is the local definition of heresy. |

Bring the wrong character and a Shill Wasp is unhittable. Bring the right one and
they hit 50% harder.

## The systems

**Conditional turn order (CTB).** The next fourteen turns are printed down the
side of the screen, computed from Agility and from the *action* each combatant is
about to take. Rest your finger on a slow spell and the queue re-forecasts before
you commit — that preview is the whole game. Swapping is free and the incoming
character inherits the outgoing one's slot.

**The Stake Grid.** Seven petals of ~90 nodes around a locked centre, one per
character. Moving one node costs a Stake Level; switching a node on costs the
matching sphere. Walk far enough round your own petal and you arrive at somebody
else's, which is the late game and also the joke: everyone ends up in the same
position eventually. The layout is generated from a fixed seed, so a save file
only stores which nodes are lit.

**Airdrops** (summons) replace the entire party, take the summoner's place in the
queue, and have their own gauge. Seven of them, including **Yobimbo**, who does
not fight for you — he fights for the number you just sent him, per swing, and he
can tell when you are lowballing.

**Overdrives**, one input each: a timing window for Dipus and Audit, three reels
for Wojak, a mash bar for Luna and Copi, a menu for Yield's Grand Summon, and two
items in a blender for Rugku.

**Status, breaks and elements** all matter: Contract Break opens armour,
Conviction Break opens magic defence, and the Tokenomorph revises its own
weakness every time you find it.

**Thirteen chapters**, four temple puzzles, a penalty shootout, a lightning-dodge,
shops, chests, save spheres, a bestiary, three save slots and two endings' worth
of an ending.

## Controls

|  | Desktop | Phone |
| --- | --- | --- |
| Walk | ← → or A / D | the two big buttons, or tap where you want to go |
| Menu | Esc | ☰ |
| Advance dialogue | Space / Enter | tap anywhere |
| Battle | click | tap — commands are thumb-height along the bottom |
| Target | click the enemy | tap the enemy, or the target chips |
| Stake Grid | drag, scroll to zoom | drag, pinch to zoom |

Portrait and landscape both have their own layout, safe-area insets are honoured,
and `prefers-reduced-motion` turns the animation off.

## Hosting

A static site with no build step, so any static host serves it as-is. Opening
`index.html` off disk will **not** work — ES modules need `http://`, so use
`npm start` locally.

| Route | What it needs |
| --- | --- |
| **Vercel** | Import the repository and set **Root Directory** to `ffx/`. That one setting cannot live in a file. Everything else is in `vercel.json`: `framework: null` and `outputDirectory: "."`, because the game is served straight from this folder. Note that `vercel.json` is schema-validated on every deploy and rejects any key it does not know — including a `"//"` comment, which is legal JSON and a failed build here. `npm test` guards it. |
| **Netlify / Cloudflare Pages / S3** | Publish directory `.`, no build command. |

## Layout

```
index.html            the shell: one canvas, one DOM layer, one effects layer
styles.css            one dark theme, two layouts, thumb-sized targets
src/core/             rng, save slots, generated audio, DOM helpers
src/data/             characters, abilities, enemies, aeons, items, grid, script
src/game/             ctb, formulas, battle engine, party state  ← all node-testable
src/render/           procedural sprites and parallax regions
src/ui/               title, field, battle, grid, menu, shop, puzzle, minigames
tools/                dev server, 45 checks, balance simulation
```

Nothing under `src/game`, `src/data` or `src/core` touches the DOM: the battle
engine returns lists of events for the renderer to animate, which is what lets
`npm test` fight a hundred battles a second with no browser and `npm run sim`
print a difficulty curve.

## On the satire

The Church of the Ticker sells sacrifice as a savings product. Its maester is
sincere, articulate, extremely good at his job, and completely open about what
the job is — which is the point, because the funniest and bleakest thing about
the real genre of person he is drawn from is that they mostly tell you.

Everything in here is invented. The jokes are aimed at a business model, not at
any individual's private life, and the game does not assert anything as fact
about a real person.
