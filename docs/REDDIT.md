# Reddit post

Copy from below. Every number in it was pulled from the source, not estimated.

---

## Title options

- I made a browser WoW-style arena brawler with Claude — 9 classes, talent trees, 7 raids, no downloads. Looking for feedback.
- CRAFT ARENA: a free voxel arena RPG that runs in your browser on phone or PC. Built with Claude, updated constantly, would love your feedback.
- Built an endless voxel arena brawler in the browser using Claude — zero dependencies, zero art assets, everything generated in code

---

## Body

Hello — I've made a game called **CRAFT ARENA**, built with Claude, and I'd
really like some honest feedback on it.

**Play it here: https://claudekk-six.vercel.app**

No download, no install, no account, no launcher. It's a link. It works on a
phone and on a PC, and it saves your progress in your own browser.

### What it is

An endless voxel arena brawler with a Warcraft-shaped RPG bolted to it. You
pick a class, drop into an arena, and fight waves that never stop. Every fifth
wave is a boss. You die eventually — everybody does — and you take your gold
back to the menus to get stronger for the next run.

It's the loop of a wave shooter with the progression of an MMO.

### What's actually in it

**Nine classes**, each with thirteen skills that unlock as you level: Warrior,
Mage, Warlock, Shaman, Priest, Rogue, Demonslayer, Paladin and Hunter. You
equip four at a time, so a class is a pool you build from rather than a fixed
kit. Each one also has an **ultimate** that charges in combat.

**Talent trees.** Four branches per class, 396 nodes across the game, spent one
point per level, WoW Classic style. You can't fill a tree — 59 points doesn't
come close — so you commit to a build. Every node tells you exactly what it
does and what the next rank gives you.

**Levels 1 to 60, in about three hours.** Deliberately short. Thirteen skills
unlock across those levels and a curve that took a hundred hours would mean
most people never met half of their own class. The long game is gear, not
levels.

**Seven tiers of gear** with set bonuses, including four-piece bonuses that
empower one named skill — so a set pushes you toward a build instead of just
adding stats.

**Seven raids, forty-two bosses**, from Zul'Gurub up to Icecrown. Each boss
drops a Core, and Cores are what let you buy the next gear tier — so raids are
the ladder, not a side activity. Bosses have real mechanics: telegraphed slams,
adds, wards you have to break, phases.

**Seventeen enemy types** that fight as a pack rather than queueing up: leapers,
bombers, casters you can interrupt, archers, healers you have to prioritise,
blinkers, shield-carriers.

**Ten wave affixes** that change how a wave has to be played — corpses that
explode, corpses that bleed, wounds that fester until you disengage, lightning
that lashes the arena. Announced before the wave, so they're a decision and not
a surprise.

**Elemental detonations** — fire, frost and storm marks that other skills set
off, so your four skills combo into each other instead of being four separate
buttons.

**500 quests**, six arena layouts, a Forge with sixteen permanent upgrades,
potions, a potion shop, multiple character slots, a full character sheet.

### The technical bit, if you care

There are **zero dependencies**. No engine, no framework, no libraries. It's a
hand-written WebGL2 renderer, about 27,000 lines.

There are also **zero binary assets**. Not one image file, not one audio file.
Every texture is generated in code at load, every sound is synthesised. The
entire game — world, renderer, art, audio, all of it — is a single ~1 MB HTML
file that makes **no external requests at all**. Nothing is fetched, nothing is
tracked, nothing phones home.

No ads. Nothing for sale. There's no paid content and there isn't going to be
any.

### What I want from you

Genuinely, feedback. Especially:

- **Does it feel good to play?** Combat feel is the thing I can't judge myself.
- **Where do you get stuck or bored?** I've already rebalanced twice off exactly
  this kind of report — someone told me they were dying at wave 12 at level 51,
  I measured it, and it turned out gear was granting almost no survivability at
  all across the entire game. That got fixed because somebody complained.
- **Does anything read as unclear?** Menus, tooltips, what a talent does.
- **How does it run on your phone?** Device and browser would help a lot.
- **Is any class obviously better or worse than the others?**

Bug reports are very welcome. There's a "Something is broken" screen in Options
that shows the diagnostics — a screenshot of that is the most useful thing you
can send me.

### It's being updated constantly

This is a live project and I'm working on it more or less every day. Dungeons
are next — three rooms, pull-based trash, a boss at the end. After that, named
rare spawns that interrupt a wave, arena hazards, more raid mechanics and more
enemy variety.

Everything that's shipped so far came out of the same loop: someone plays it,
tells me what's wrong, I measure it and fix it. So if something annoys you,
saying so genuinely changes the game.

Thanks for reading, and I hope you enjoy it.

**https://claudekk-six.vercel.app**

---

## Notes before posting

- Check each subreddit's self-promotion rules. `r/WebGames`, `r/incremental_games`,
  `r/playmygame`, `r/IndieGaming` and `r/roguelikes` all have different ones,
  and several require a flair or a comment explaining your involvement.
- A short gif or a couple of screenshots will roughly double engagement. The
  boss telegraphs and the talent tree are the two most screenshot-worthy things
  in the game.
- Reply to the first ten comments. It matters more than the post does.
