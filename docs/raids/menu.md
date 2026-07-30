# Raid menus

Four new screens, one new banner, and one new button variant. Everything else
is the vocabulary already on the page.

| Screen | `Menus.show()` name | Built by | Reached from |
| --- | --- | --- | --- |
| Raid select | `raids` | `buildRaids()` | title → RAID |
| Boss list | `raid` | `buildRaid()` | a row on raid select |
| Continue? | `continue` | `buildRaidGate('kill')` | a boss dying, in-run |
| Wipe | `wipe` | `buildRaidGate('wipe')` | the player dying, in-run |

The Core drop is not a screen. It is one more line on the notification queue
the boss-slain banner already uses, and section 6 explains why that is the
whole of it.

Two things this document keeps coming back to, because they decide almost every
call in it:

* **A locked row is a row with more to say, not less.** Greying a control out
  communicates that something is off and almost never communicates what
  ([Smashing Magazine][sm], [UX Tigers][uxt]). `raidAccess()` already returns
  the sentence; the job here is to put it somewhere a player reads without
  hunting for a tooltip, which on a phone does not exist at all.
* **The between-fights button is the most-pressed control in the game.** About
  two thirds of taps on a phone land in the bottom third of the screen, and
  reaching the top third costs both accuracy and about a second per tap
  ([thumb-zone summary][tz]). So that one window is bottom-anchored on touch
  and its buttons are full width. Nothing else in the game needs that, and
  nothing else gets it.

---

## 0. What is new, in full

**New CSS selectors: eight.** `.raid-list`, `.raid-row`, `.raid-list .next`,
`.raid-go`, `.raid-need`, `.gate-actions`, `.big-btn.wide`, `.screen.raid-gate`
— plus three small breakpoint blocks and one change to an existing rule
(`.main-menu.grid`, forced by the tenth title button). Section 8 has all of it
with declarations.

**New icons: none drawn.** Raid rows use `iconElement()` with a glyph from a
presentation-only map in `menus.js` — the same arrangement `TALENT_GLYPHS`
already has — and a `school` synthesised from the raid's own
`theme.fog` / `theme.accent`, so a raid's icon is lit in the colour its arena
is lit in and `raids.js` gains no presentation fields. Boss rows use the Core's
gear-slot icon straight from `GEAR_SLOTS`, with `SCHOOLS[slot.school]`, exactly
as the Armoury does.

```js
// Presentation only, so it lives here and not in raids.js — the same reason
// TALENT_GLYPHS does. One glyph per raid; the field colour comes from the
// raid's own theme, so the icon is lit the way the arena is.
const RAID_GLYPHS = {
  zulgurub: '🐍', moltencore: '🌋', karazhan: '🕯', ulduar: '⚙',
  blacktemple: '👁', firelands: '🔥', icecrown: '❄',
};
const raidSchool = (raid) => ({
  base: raid.theme.fog, edge: raid.theme.accent, glow: raid.theme.accent,
});

// "Chestplate Core" and "Signet Core" are the slot names run through a shop
// voice they were never written for. Short labels here, used by the row chip,
// the banner and the Armoury's unlock note alike, so the same Core is called
// the same thing in all three places.
const CORE_LABEL = {
  weapon: 'Weapon', chest: 'Chest', helm: 'Helm',
  boots: 'Boots', ring: 'Signet', trinket: 'Trinket',
};
const coreName = (tier, slot) => `T${tier} ${CORE_LABEL[slot]} Core`;
```

**New state on `Menus`:** `this.raidId`, set when a raid row is tapped and read
by `buildRaid()`. Same pattern as `talentBranch`.

**New callbacks on `ctx`:** `startRaid(cls, raid)` and `continueRaid()` /
`leaveRaid()`, alongside the existing `startRun` / `resumeRun` / `quitRun`.

---

## 1. The RAID button

### Where

Second. Directly after PLAY, before THE FORGE.

```
PLAY            RAID
THE FORGE       ARMOURY
TALENTS         QUESTS
RECORDS         SETTINGS
HOW TO PLAY     DIAGNOSTICS
```

The nine buttons are already three groups that were never labelled: two things
you *do* (PLAY), four things you *spend on* (Forge, Armoury, Talents, Quests),
three things you *read* (Records, Settings, How to play, Diagnostics). RAID is
the second thing you do, so it joins the first group rather than being appended
to the end where it would read as an afterthought below Diagnostics. On any
width that gives two or more columns it lands beside PLAY in the top row, which
is where a mode belongs.

It is a plain `.menu-btn`, not `.primary`. PLAY stays the primary because the
arena funds the raids — a boss pays half what its piece costs and the other
half comes from the arena, which is the whole shape of the economy. A gold
RAID button next to a gold PLAY button would say the two are interchangeable.

**It never disables.** `raidAccess()` cannot refuse Zul'Gurub to a level-1
character: there is no previous raid to clear and no previous set to buy. A
"nothing unlocked" state does not exist, so the first-state copy is an
invitation rather than a lock, and there is no greyed-out RAID button to
explain.

### The hint line

```js
/**
 * The RAID button's hint. The number leads and the raid's name follows,
 * because on a narrow phone the hint is clipped to one line and the half worth
 * keeping is the half that changes. "Icecrown Citadel · 5 of 6" truncates to
 * the name of a place; "5 of 6 · Icecrown Cit…" truncates to the answer.
 */
raidHint(classId) {
  const st = this.profile.raidState(classId);
  const gear = this.profile.gear(classId);
  const raid = RAIDS.find((r) => !isRaidCleared(st, r));
  if (!raid) return 'All 42 bosses down';

  const access = raidAccess(raid, { level: this.profile.level(classId), raidState: st, gear });
  if (!access.ok) {
    // The first *uncleared* raid always has a cleared predecessor, so only two
    // of raidAccess()'s three gates can be the one that is shut here.
    const prev = RAID_BY_TIER[raid.tier - 1];
    const short = prev
      ? CORE_ORDER.filter((s) => ownedTier(gear, s) < prev.tier).length
      : 0;
    return short
      ? `${short} piece${short > 1 ? 's' : ''} short · ${raid.name}`
      : `Level ${raid.level} · ${raid.name}`;
  }
  const down = bossesDown(st, raid);
  return down ? `${down} of 6 · ${raid.name}` : `${raid.name} is open`;
}
```

Exact strings, in the order a player meets them:

| State | Hint |
| --- | --- |
| Nothing cleared on this class | `Zul'Gurub is open` |
| A raid part-cleared | `3 of 6 · Molten Core` |
| Blocked on level | `Level 51 · Firelands` |
| Blocked on the previous set | `2 pieces short · Firelands` |
| All forty-two down | `All 42 bosses down` |

The hint speaks for `this.selectedClass` without naming it, exactly as the
ARMOURY hint already does (`rating` is read off `gear(this.selectedClass)`).
Naming the class on every hint would put the same word on three buttons; the
raid screens name it in their subtitle, one tap later. That is the progressive
disclosure the rest of these menus already run on — say the one thing that
decides whether to tap, defer the rest to the screen behind it ([NN/g's
original 1995 pattern][pd]).

### What a tenth button costs

Ten `.menu-btn` rows in one column do not fit a 390×844 phone: the screen
measures about 926px and `fitScreen()` would shrink it to 0.91. So the title
grid takes two fixed columns below 430px instead of relying on
`minmax(190px, 1fr)`, which cannot fit two tracks in the 358px a 390px phone
actually has.

```css
/* Ten rows in one column overruns a 390px phone by eighty pixels. Two fixed
   columns rather than auto-fit: at 358px of content, minmax(190px) resolves to
   one track and the grid silently becomes a list. */
@media (max-width: 430px) {
  .main-menu.grid { grid-template-columns: repeat(2, 1fr); }
  /* Uniform row heights are the price of a two-column grid: one three-line
     hint inflates the whole row. Every hint on this screen is short enough to
     survive the clip except the Diagnostics one, whose full text is the first
     thing on the screen it opens. */
  .menu-hint { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
}
```

This is the reason raid hints are written number-first and capped at 26
characters. At 320px each column is about 140px wide and a hint gets roughly 22
characters before the ellipsis.

Above 430px nothing changes: `minmax(190px, 1fr)` still gives three columns
inside the `min(760px, 100%)` menu, and ten buttons become four rows instead of
three.

**Reflow.** 360×640: two columns, five rows, ~600px total, no scaling.
390×844: two columns, five rows, ~561px, no scaling — the screen gets *shorter*
than the nine-button single-column version it replaces. 1440×900: three
columns, four rows, ~73px taller than today, far inside the viewport.

---

## 2. Raid select — `buildRaids()`

```
┌ ‹ Back ─────────────────────────────────── 🪙 2,500,000 ┐
│ [Warrior][Mage][Warlock][Shaman][Priest][Rogue]…        │   .class-picker
├─────────────────────────────────────────────────────────┤
│ Raids                                                   │   .panel
│ Paladin · 8 of 42 bosses down                           │
│                                                         │
│ ▌🐍  Zul'Gurub          6/6   T0            ✓           │   .raid-list
│ ▌     Every Core taken. T0 gear is buyable.             │
│ ▌     ●●●●●●                                            │
│                                                         │
│ ▌🌋  Molten Core        2/6   T1            ›     ←next │
│ ▌     Next · Gehennas                                   │
│ ▌     ●●○○○○                                            │
│                                                         │
│ ▌🕯  Karazhan           0/6   T2            🔒          │
│ ▌     Clear Molten Core first — 2 of 6 down.            │
│ ▌     ○○○○○○                                            │
│                                                         │
│ ▌⚙  Ulduar             0/6   T3            🔒          │
│ ▌     Requires level 31 — you are 24.                   │
│ ▌     ○○○○○○                                            │
│                                    ‹  1 / 2  ›          │
│                              ▶ MOLTEN CORE              │
└─────────────────────────────────────────────────────────┘
```

### DOM

```js
buildRaids() {
  const wrap = el('div', 'screen');
  const cls = CLASSES.find((c) => c.id === this.selectedClass) || CLASSES[0];
  // Progress is per class, so — like the Forge, the Armoury and the talent
  // tree — the screen leads with whose progress you are reading.
  const picker = el('div', 'class-picker'); /* nine .pill buttons, as elsewhere */
  wrap.appendChild(this.backBar('title'));
  wrap.appendChild(picker);

  const st = this.profile.raidState(cls.id);
  const level = this.profile.level(cls.id);
  const gear = this.profile.gear(cls.id);
  const total = RAIDS.reduce((n, r) => n + bossesDown(st, r), 0);
  const p = this.panel('Raids', `${cls.name} · ${total} of 42 bosses down`);

  const list = el('div', 'raid-list');
  // Open on the page holding the raid you are actually running, not page one.
  // With four rows a page, the current raid is on page two from Ulduar on, and
  // a list that always starts at the top makes the player pace it every time.
  const perPage = byHeight(3, 4, 7);
  const current = RAIDS.findIndex((r) => !isRaidCleared(st, r));
  if (this.pages.raids === undefined && current >= 0) {
    this.pages.raids = Math.floor(current / perPage);
  }
  p.appendChild(this.paged('raids', RAIDS, perPage, list, (raid) => {
    const down = bossesDown(st, raid);
    const cleared = down === raid.bosses.length;
    const access = raidAccess(raid, { level, raidState: st, gear });
    const next = !cleared && access.ok && raid === RAIDS[current];

    const row = el('button', 'forge-card raid-row' + (next ? ' next' : ''));
    row.style.setProperty('--quality', tierColor(raid.tier));

    const icon = el('div', 'forge-icon');
    // Lit only when you can walk in. Readiness is already a property of the
    // art here — a raid you cannot enter is drawn flat, the same way a skill
    // short of resource is, and that costs no words.
    icon.appendChild(iconElement(RAID_GLYPHS[raid.id], 34,
      { school: raidSchool(raid), ready: access.ok }));
    row.appendChild(icon);

    const body = el('div', 'forge-body');
    body.innerHTML = `
      <div class="forge-name">${raid.name}
        <span class="dim">${down}/${raid.bosses.length}</span>
        <span class="quality-tag">T${raid.tier}</span></div>`;
    if (cleared) {
      body.appendChild(el('div', 'forge-desc',
        `Every Core taken. T${raid.tier} gear is buyable.`));
    } else if (!access.ok) {
      // Not a tooltip and not a grey box. The sentence raidAccess() already
      // wrote, at full contrast, in the colour this game uses everywhere else
      // for the thing that is stopping you.
      body.appendChild(el('div', 'raid-need', access.reason));
    } else if (down) {
      body.appendChild(el('div', 'forge-desc', `Next · ${nextBoss(st, raid).name}`));
    } else {
      body.appendChild(el('div', 'forge-desc', raid.blurb));
    }
    body.innerHTML += `<div class="forge-pips">${raid.bosses
      .map((b) => `<i class="${isBossDead(st, b.id) ? 'on' : ''}"></i>`).join('')}</div>`;
    row.appendChild(body);

    row.appendChild(el('div', 'raid-go', cleared ? '✓' : (access.ok ? '›' : '🔒')));
    this.click(row, () => { this.raidId = raid.id; this.show('raid'); });
    return row;
  }));

  // One tap from the title to the fight for a player who already knows where
  // they are. Absent once everything is down, because a button that goes
  // nowhere is worse than no button.
  const go = RAIDS[current];
  if (go) {
    const actions = el('div', 'actions');
    actions.appendChild(this.click(el('button', 'big-btn', `▶ ${go.name.toUpperCase()}`),
      () => { this.raidId = go.id; this.show('raid'); }));
    p.appendChild(actions);
  } else {
    p.appendChild(el('p', 'footnote',
      `Every raid cleared on ${cls.name}. Progress is per class — another one starts at Zul'Gurub.`));
  }
  wrap.appendChild(p);
  return wrap;
}
```

### Why the whole row is the button

The Armoury puts a `.buy-btn` on the right of every `.forge-card` and that is
correct there, because the row's purpose is a purchase. Here the row's purpose
is to be *read*, and a `.buy-btn` costs 84px of a body column that is only
about 200px wide on a 320px phone — the width the reason sentence needs more
than a second affordance does. So the row itself is a `<button>` (following
`.rank-card` and `.skill-slot`, which are both buttons that reset `color`,
`font` and `text-align`), the tap target is the full 88px row, and the right
edge carries one glyph instead of a control.

**A locked row is not dimmed.** `.forge-card.locked` exists and is right for the
Armoury, where a level-gated slot is a slot you will buy in ten levels and
nothing about it needs reading today. A locked raid is the opposite: it is the
screen's most information-dense row, because it is the only one that says what
to do next. Full contrast, tier stripe intact, sentence in the open, `🔒` at
the edge. Only the icon goes flat, and only because `drawIcon()`'s `ready:false`
already means exactly that everywhere else in the game.

**Tapping a locked row works.** It opens the boss list, which is worth reading
before you can enter — six bosses and six Cores is what you are working toward
— and whose primary button, on a locked raid, goes to the screen that unlocks
it. That is section 3's best trick and it only exists because a locked row is
tappable. Precedent: the loadout screen already answers when a locked skill is
tapped, "which is the whole point of showing it".

### Every string

| Element | Copy |
| --- | --- |
| Panel head | `Raids` |
| Panel sub | `Paladin · 8 of 42 bosses down` |
| Cleared body | `Every Core taken. T1 gear is buyable.` |
| Open, in progress | `Next · Gehennas` |
| Open, untouched | the raid's own `blurb`, verbatim |
| Locked | `access.reason`, verbatim from `raidAccess()` |
| Right glyph | `✓` / `›` / `🔒` |
| Primary | `▶ MOLTEN CORE` |
| All cleared | `Every raid cleared on Paladin. Progress is per class — another one starts at Zul'Gurub.` |

`raidAccess()`'s three sentences, unedited, are what a locked row shows:

* `Requires level 51 — you are 45.`
* `Clear Molten Core first — 2 of 6 down.`
* `Buy the full T4 set first — 3 pieces short.`

They are already written in the right voice and already carry both halves of
the answer — the requirement and where the player stands against it. Rewriting
them in the menu would put the same sentence in two files.

### Reflow

**360×640** — `@media (max-height: 640px)` and `(max-width: 380px)` both apply:
panel padding 10/12, card padding 8/10, icon 34, pills 5px/8px. `byHeight`
returns 4 rows a page. The blurb line is hidden below 430px (see section 8), so
an untouched raid shows name, pips and glyph only, and a locked one keeps its
reason. Rows ≈ 77px, total ≈ 600px against 624 available. No scaling.

**390×844** — 4 rows a page at ~88px, class picker over three lines, pager,
one `.big-btn`. Total ≈ 689px against 812. No scaling. Blurbs still hidden
(390 < 430), which is deliberate: the blurb is flavour and the body column is
190px.

**1440×900** — `byHeight` returns 7, so the pager disappears and the whole
ladder is on screen at once, which is the point of a ladder. One column, not
three: `.forge-grid`'s auto-fill would give three columns of a sequence, and
three columns of a sequence reads as three sequences. Rows ~78px, total ≈ 804px
against 868. Blurbs visible.

**844×390 and 667×375** — 3 rows a page. `(max-height: 470px)` hides
`.panel-head .sub`, so the "8 of 42" line goes; the class picker directly above
still says whose, and the per-row `2/6` counts survive. 320×568: 3 rows a page.

---

## 3. Boss list — `buildRaid()`

```
┌ ‹ Back ─────────────────────────────────── 🪙 2,500,000 ┐
├─────────────────────────────────────────────────────────┤
│ Molten Core                                             │
│ Paladin · 2 of 6 down · T1 Cores                        │
│                                                         │
│ ▌[⚔]  Lucifron                              ✓           │
│ ▌     Affliction — lingering rot in a wide area.        │
│ ▌     [⚔ T1 Weapon Core]  [🪙 1,600 paid]               │
│                                                         │
│ ▌[🦺]  Magmadar                             ✓           │
│ ▌     Breath — a wide cone in front. Get behind it.     │
│ ▌     [🦺 T1 Chest Core]  [🪙 1,600 paid]               │
│                                                         │
│ ▌[⛑]  Gehennas                        [NEXT]     ←gold │
│ ▌     Summons — calls help. Clear it or be surrounded.  │
│ ▌     [⛑ T1 Helm Core]  [🪙 1,600]                      │
│                                                         │
│ ▌[🥾]  Garr                                             │
│ ▌     Detonate — marks the ground, then it goes off.    │
│ ▌     [🥾 T1 Boots Core]  [🪙 1,600]                    │
│                                    ‹  1 / 2  ›          │
│ Six bosses, each pays half a piece. A full clear funds  │
│ half the set it unlocks; the rest comes from the arena. │
│                            ▶ FIGHT GEHENNAS             │
└─────────────────────────────────────────────────────────┘
```

### DOM

```js
buildRaid() {
  const raid = RAID_BY_ID[this.raidId] || RAIDS[0];
  const cls = CLASSES.find((c) => c.id === this.selectedClass) || CLASSES[0];
  const st = this.profile.raidState(cls.id);
  const gear = this.profile.gear(cls.id);
  const level = this.profile.level(cls.id);
  const access = raidAccess(raid, { level, raidState: st, gear });
  const next = nextBoss(st, raid);
  const down = bossesDown(st, raid);
  const pay = bossGold(raid, 0, gearCost(raid.tier));

  const wrap = el('div', 'screen');
  wrap.appendChild(this.backBar('raids'));
  // No class picker here. It is one screen deep from the one that has it, and
  // switching class mid-raid-list would be a different raid as well as a
  // different progress bar. The subtitle carries the answer instead.
  const p = this.panel(raid.name,
    `${cls.name} · ${down} of ${raid.bosses.length} down · T${raid.tier} Cores`);

  const list = el('div', 'raid-list');
  const perPage = byHeight(3, 4, 6);
  if (this.pages[`raid:${raid.id}`] === undefined && next) {
    this.pages[`raid:${raid.id}`] = Math.floor(next.index / perPage);
  }
  p.appendChild(this.paged(`raid:${raid.id}`, raid.bosses, perPage, list, (boss) => {
    const i = raid.bosses.indexOf(boss);
    const slot = GEAR_BY_ID[coreSlotFor(i)];
    const dead = isBossDead(st, boss.id);
    const isNext = next && next.id === boss.id;
    const m = MECHANICS[boss.mechanic];

    const row = el('div', 'forge-card' + (isNext ? ' next' : ''));
    row.style.setProperty('--quality', tierColor(raid.tier));

    // The Core's own slot icon, drawn lit once you hold that Core. What the
    // boss drops is the first thing the eye reaches and it needs no words.
    const icon = el('div', 'forge-icon');
    icon.appendChild(iconElement(slot.icon, 34,
      { school: SCHOOLS[slot.school], ready: dead }));
    row.appendChild(icon);

    const body = el('div', 'forge-body');
    body.innerHTML = `
      <div class="forge-name">${dead ? '✓ ' : ''}${boss.name}
        ${isNext ? '<span class="set-chip on">NEXT</span>' : ''}</div>
      <div class="forge-desc"><b>${m.name}</b> — ${m.blurb}</div>
      <div class="set-bar">
        <span class="set-chip${isNext ? ' on' : ''}">${slot.icon} ${coreName(raid.tier, slot.id)}</span>
        <span class="set-chip">🪙 ${pay.toLocaleString()}${dead ? ' paid' : ''}</span>
      </div>`;
    row.appendChild(body);
    return row;
  }));

  p.appendChild(el('p', 'footnote', next
    ? `Six bosses, each pays half a piece. A full clear funds half the set it unlocks; the rest comes from the arena.`
    : `Molten Core is cleared on ${cls.name}. Every T${raid.tier} Core is yours.`));

  const actions = el('div', 'actions');
  if (!access.ok) {
    // A locked screen whose primary button goes to the place that unlocks it.
    // "Requires level 51" and then nothing to press is a dead end; the level
    // gate sends you to the arena and the set gate to the Armoury, which are
    // the two things that actually move the number.
    actions.appendChild(el('span', 'raid-need', access.reason));
    const level = /level/i.test(access.reason);
    actions.appendChild(this.click(el('button', 'big-btn',
      level ? '▶ ARENA' : '🛡 ARMOURY'),
      () => this.show(level ? 'classes' : 'armoury')));
  } else if (next) {
    actions.appendChild(this.click(el('button', 'big-btn', `▶ FIGHT ${next.name.toUpperCase()}`),
      () => this.ctx.startRaid(cls, raid)));
  } else {
    actions.appendChild(this.click(el('button', 'big-btn', '🛡 ARMOURY'),
      () => this.show('armoury')));
  }
  p.appendChild(actions);
  wrap.appendChild(p);
  return wrap;
}
```

### Decisions

**Rows carry no buttons at all.** One fight is available, so there is one
button, and it goes in `.actions` at the bottom of the panel where
`ENTER THE ARENA`, `RUN IT BACK` and `Play as Paladin` already live. Six
`FIGHT` buttons of which five are disabled would be five disabled buttons
explaining nothing; a `NEXT` chip on the one live row and one big button that
names it says the same thing with a sixth of the controls. It also puts the
button in the bottom third on a phone without any special-casing.

**Order never changes.** Dead bosses stay in place. The list is a ladder and its
positions are learned — the first boss is always the weapon, the last is always
the trinket, "so a player learns it once". Sorting the dead ones to the top
would break the one thing `CORE_ORDER` exists to guarantee.

**Dead bosses are not dimmed.** The Core icon lights up instead. `drawIcon()`'s
`ready` flag already carries state as a property of the art, the row keeps full
contrast, and the "paid" suffix on the gold chip is the only wording that
changes. A dimmed row would hide what you own from you.

**Progress is per class, and the screen says so twice** — once in the subtitle
(`Paladin · 2 of 6 down`), once in the cleared footnote
(`Molten Core is cleared on Paladin`). Once is not enough on a game where
another class's copy of this screen is two taps away and looks identical.

**The gold chip repeats.** `bossGold()` ignores its index, so all six bosses of
a raid pay the same. That reads as repetition on the screen and it is: no boss
is worth skipping to, which is itself the information. If `bossGold()` ever
starts weighting by index, this screen needs no change.

### Every string

| Element | Copy |
| --- | --- |
| Panel head | the raid's `name` |
| Panel sub | `Paladin · 2 of 6 down · T1 Cores` |
| Mechanic line | `<b>Breath</b> — A wide cone in front. Get behind it.` (from `MECHANICS`) |
| Core chip | `🦺 T1 Chest Core` |
| Gold chip | `🪙 1,600` / `🪙 1,600 paid` |
| Next tag | `NEXT` |
| Footnote, open | `Six bosses, each pays half a piece. A full clear funds half the set it unlocks; the rest comes from the arena.` |
| Footnote, cleared | `Molten Core is cleared on Paladin. Every T1 Core is yours.` |
| Primary, open | `▶ FIGHT GEHENNAS` |
| Primary, level-gated | `▶ ARENA` under the reason |
| Primary, set-gated | `🛡 ARMOURY` under the reason |
| Primary, cleared | `🛡 ARMOURY` |

`▶ FIGHT HIGH WARLORD NAJ'ENTUS` is the longest label this generates: 30
characters, about 250px at `.big-btn`'s 16px, which fits a 320px phone's
264px panel on two lines. `.actions button { flex: 1 }` below 620px already
makes it full width, so it wraps rather than clipping. That is the widest case
and it is what the fit test should be primed with (section 9).

### Reflow

**360×640** — 4 rows a page at ~76px. Mechanic lines stay at every width; they
are the reason to read the screen. Total ≈ 590px against 624. No scaling.

**390×844** — 4 rows a page at ~86px, opening on the page holding the next
boss. Total ≈ 700px against 812.

**1440×900** — all six bosses, no pager, single column. Total ≈ 760px against
868.

**844×390, 667×375** — `byHeight` gives 2 rows a page (`h < 470` returns
`small - 1`). Three pages, opening on the next boss's page. The subtitle is
hidden by the 470px breakpoint; the class is then only on the raid-select
screen behind, which is a real loss and the reason `.raid-gate` overrides that
breakpoint but this screen does not — this screen you arrived at deliberately
and can back out of in one tap; the gate appears without being asked for.

---

## 4. Continue? — `buildRaidGate('kill')`

The most-pressed control in a raid, and the only screen in the game designed
around where a thumb rests.

```
                                                        ← top of viewport
        (empty: the panel is pushed to the bottom on touch)

┌─────────────────────────────────────────────────────────┐
│ Magmadar down                                           │
│ Molten Core · 2 of 6 · Paladin                          │
│                                                         │
│ 🦺  T1 Chest Core                          unlocked     │   .goals
│ 🪙  Gold                                     +1,600     │
│ ⛑  Next · Gehennas                         Summons     │
│                                                         │
│ Continue restores your health, your Mana and every      │
│ cooldown.                                               │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │       Stop here · keep everything                   │ │   .ghost-btn.wide
│ └─────────────────────────────────────────────────────┘ │
│                        (14px)                           │
│ ┌─────────────────────────────────────────────────────┐ │
│ │                   CONTINUE ▶                        │ │   .big-btn.wide
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                                                        ← bottom of viewport
```

### DOM

```js
/**
 * One window, two outcomes. A kill and a wipe are the same decision in the
 * same place with the same geometry — the thumb lands where it landed last
 * time whichever way the fight went, and the game does not need two layouts to
 * say two things.
 */
buildRaidGate(outcome) {
  const g = this.ctx.game;
  const raid = g.raid, cls = g.cls;
  const st = this.profile.raidState(cls.id);
  const down = bossesDown(st, raid);
  const boss = g.lastBoss;               // the one just fought, dead or not
  const next = nextBoss(st, raid);
  const kill = outcome === 'kill';
  const done = kill && !next;

  const wrap = el('div', 'screen overlay raid-gate');
  const p = done
    ? this.panel(`${raid.name} cleared`, `${cls.name} · 6 of 6 · T${raid.tier}`)
    : this.panel(kill ? `${boss.name} down` : `${boss.name} still stands`,
        `${raid.name} · ${down} of ${raid.bosses.length} · ${cls.name}`);

  // The ledger. Same component as the results screen's "what you are closest
  // to" rows — icon, fact, number — because it answers the same question in
  // the same shape, and a fourth list component would be a fourth list
  // component.
  const box = el('div', 'goals');
  for (const row of this.gateRows(outcome, raid, boss, next, st)) {
    const r = el('div', 'goal');
    r.innerHTML = `<span class="goal-icon">${row.icon}</span>`
      + `<span class="goal-text">${row.label}</span>`
      + `<span class="goal-need">${row.need}</span>`;
    box.appendChild(r);
  }
  p.appendChild(box);
  p.appendChild(el('p', 'footnote', kill
    ? (done
      ? `Every T${raid.tier} Core is yours. The gold is not — buy the set in the Armoury.`
      : `Continue restores your health, your ${cls.resource.name} and every cooldown.`)
    : 'A boss is only spent when it dies. Take it again as many times as you need.'));

  // Two buttons, stacked, full width, with a real gap. The one pressed nine
  // times out of ten is the lower one, because that is the easiest place on a
  // phone to hit; the 14px gap is there so an overshoot lands on nothing
  // rather than on the other button.
  const acts = el('div', 'gate-actions');
  acts.appendChild(this.click(el('button', 'ghost-btn wide', 'Stop here · keep everything'),
    () => this.ctx.leaveRaid()));
  acts.appendChild(this.click(el('button', 'big-btn wide',
    done ? '🛡 ARMOURY' : (kill ? 'CONTINUE ▶' : 'TRY AGAIN ▶')),
    () => (done ? this.ctx.leaveRaid('armoury') : this.ctx.continueRaid())));
  p.appendChild(acts);
  wrap.appendChild(p);
  return wrap;
}
```

### Why the head is not the word "Continue?"

A question as a headline makes the player parse a question before they can
answer it. `Magmadar down` is a fact, and the verb is on the button — the
window is read top to bottom and finishes on the thing to press. It also
survives being reused: the same panel with `Magmadar still stands` at the top
would make no sense under a heading that says "Continue?".

### Why the primary is at the bottom

Bottom-most is the easiest reach on a phone and this is the button that gets
pressed five times a raid, forty-two times a full clear. Putting the secondary
above it inverts the desktop convention on purpose, and the 14px gap plus two
completely different button treatments — a filled blue slab against a hairline
ghost — is what stops the inversion from costing anything. Neither button is
destructive: "No" keeps every Core, every coin and every boss already down, so
a mis-tap costs one screen, not a raid.

### Why "keep everything" is literally true

The Core and the gold are written to the save the instant the boss dies, before
this window is built. The window is a question about the *next* fight only. If
the player force-quits the tab while it is open they lose nothing, which is what
makes the secondary button honest and what makes it safe to put a large blue
button next to it.

### The three ledger rows

```js
gateRows(outcome, raid, boss, next, st) {
  const pay = bossGold(raid, 0, gearCost(raid.tier));
  const slot = GEAR_BY_ID[coreSlotFor(raid.bosses.indexOf(boss))];
  if (outcome === 'kill') {
    const rows = [
      { icon: slot.icon, label: coreName(raid.tier, slot.id), need: 'unlocked' },
      { icon: '🪙', label: 'Gold', need: `+${pay.toLocaleString()}` },
    ];
    rows.push(next
      ? { icon: GEAR_BY_ID[coreSlotFor(next.index)].icon,
          label: `Next · ${next.name}`, need: MECHANICS[next.mechanic].name }
      : { icon: '🛡', label: `T${raid.tier} gear`, need: 'buyable now' });
    return rows;
  }
  return [
    { icon: '🛡', label: 'Your Cores', need: `${bossesDown(st, raid)} of 6 kept` },
    { icon: '↻', label: boss.name, need: 'back to full' },
    { icon: '🪙', label: 'This attempt cost', need: 'nothing' },
  ];
}
```

### Every string

| Element | Kill | Last boss | Wipe |
| --- | --- | --- | --- |
| Head | `Magmadar down` | `Molten Core cleared` | `Magmadar still stands` |
| Sub | `Molten Core · 2 of 6 · Paladin` | `Paladin · 6 of 6 · T1` | `Molten Core · 2 of 6 · Paladin` |
| Row 1 | `🦺 T1 Chest Core — unlocked` | `🪬 T1 Trinket Core — unlocked` | `🛡 Your Cores — 2 of 6 kept` |
| Row 2 | `🪙 Gold — +1,600` | `🪙 Gold — +1,600` | `↻ Magmadar — back to full` |
| Row 3 | `⛑ Next · Gehennas — Summons` | `🛡 T1 gear — buyable now` | `🪙 This attempt cost — nothing` |
| Footnote | `Continue restores your health, your Mana and every cooldown.` | `Every T1 Core is yours. The gold is not — buy the set in the Armoury.` | `A boss is only spent when it dies. Take it again as many times as you need.` |
| Primary | `CONTINUE ▶` | `🛡 ARMOURY` | `TRY AGAIN ▶` |
| Secondary | `Stop here · keep everything` | `Back to the menu` | `Stop here · keep everything` |

`cls.resource.name` is read live, so a Warlock's footnote says Soul Shards and a
Warrior's says Rage. The window promises a specific thing and names it.

### Reflow

**360×640 / 390×844** — bottom-anchored, `.gate-actions` full width. Panel
≈ 342px; the empty space above it is the design, not slack. `.big-btn.wide` is
54px tall and `.ghost-btn.wide` 44px, both at or above the 44px floor this
project already applies to `#fullscreen-btn`.

**1440×900** — `(pointer: coarse) and (max-width: 900px)` does not match, so
`.screen.overlay`'s existing centring stands and the panel sits in the middle
like the pause and upgrade overlays. Buttons stay full width, which on a
1120px-max panel is a very wide button, and that is correct: it is still the
most-pressed control on the screen.

**844×390, 667×375** — the `(max-height: 470px)` block restores
`.panel-head .sub` (see section 8) and tightens `.gate-actions` to 10px gaps and
`.big-btn.wide` to 13px padding. Panel ≈ 262px against 375. This is the one
screen that overrides the subtitle-hiding breakpoint, because the subtitle is
the only line that says which raid, how far in, and whose — and this screen
arrives without being asked for.

---

## 5. Wipe / retry

Same window. `buildRaidGate('wipe')`, registered as `wipe` so the fit test can
open it directly.

Everything structural is identical to section 4: same panel, same three `.goal`
rows, same `.gate-actions`, same bottom anchor, same button in the same place.
That is the design. A game that reaches for a different layout when you lose
has told you that losing is a different category of event; here it is the same
event with a different first line.

What changes, exactly:

* **Head** — `Magmadar still stands`. About the boss, not about the player.
  Not "You died", not "Defeat", not "Wipe". The subject of the sentence is the
  thing that is still there to kill.
* **Ledger** — three rows, all of them about what survived:
  `🛡 Your Cores — 2 of 6 kept`, `↻ Magmadar — back to full`,
  `🪙 This attempt cost — nothing`. The third is the load-bearing one and it
  ends on the word *nothing*.
* **Footnote** — `A boss is only spent when it dies. Take it again as many
  times as you need.` Lifted almost verbatim from the rule at the top of
  `raids.js`, because that rule is the reassurance and it was already written.
* **Primary** — `TRY AGAIN ▶`, same slab, same blue, same position as
  `CONTINUE ▶`.

What deliberately does not change: no red, no skull, no death sound sting, no
run summary, no stat grid. The results screen is a run's obituary and has
`Wave 7`, kills, duration and XP on it; a wipe has none of those to report and
borrowing that screen would import its finality.

**A wipe does not end the run.** `TRY AGAIN` restarts the same boss with health,
resource and cooldowns restored — the same restoration `CONTINUE` performs, and
the reason both buttons can sit in the same place is that they do the same
mechanical thing. Only `Stop here` returns to the menu.

**Reflow** is section 4's, unchanged. That is the point of it being the same
window.

---

## 6. The Core announcement

Not a screen and not DOM. `game.notify()`, which is what the boss-slain banner
already is.

```js
// In Game.onKill, immediately after the existing boss line:
this.notify('BOSS SLAIN  +' + Math.round(souls) + ' 🪙', 2.6);
if (this.raid) {
  const slot = GEAR_BY_ID[coreSlotFor(this.bossIndex)];
  this.notify(`${slot.icon}  T${this.raid.tier} ${CORE_LABEL[slot.id].toUpperCase()} CORE`, 3.2);
  this.audio.play('rankup');
}
```

Rendered by `Hud.drawNotifications()`: centred at 26% of viewport height, 20px,
white with a hard shadow, stacked 34px apart, alpha ramping over the last 0.5s
of life. Exactly the register of `BOSS SLAIN`, `NEW RECORD` and the affix lines,
because it is the same queue and the same draw call.

**Exact copy:** `🦺  T1 CHEST CORE`. Two spaces after the icon, matching the
affix banner's `${a.icon}  ${a.name}` spacing. Capitals, matching `BOSS SLAIN`.
The word "unlocked" is cut: the icon and the capitals already read as an award,
and at 20px with no wrapping in `drawNotifications()`, `T6 TRINKET CORE
UNLOCKED` is about 300px and would run to the edges of a 320px phone. The
longest string this produces is `🪬  T6 TRINKET CORE` at roughly 200px. Any
future slot label longer than `Trinket` has to be measured, because that drawer
does not wrap and will not tell you it overflowed.

**How long it holds:** 3.2s, against the boss line's 2.6s. Pushed second so it
draws on the lower line, and outliving the kill line by 0.6s means it finishes
alone on screen — the last thing standing is the thing worth reading.

**How it gets out of the way:** three ways, none of them requiring the player
to do anything.

1. Its own timer expires and it fades over its last 0.5s.
2. `notify()` caps the queue at four and shifts the oldest out, so anything the
   fight says next displaces it.
3. It is drawn on `#hud`, which is `pointer-events: none`, at 26% height —
   above the skill bar, below the wave banner, clear of the health and resource
   bars. It cannot swallow a tap and it cannot cover the player's own health,
   which is the rule `drawImpactFlash()` already follows.

**And it is not the only place the Core is stated.** The Continue window opens
about a second later with `🦺 T1 Chest Core — unlocked` as a permanent row, and
the boss list shows the Core lit from then on. A banner that has to be caught to
matter is a banner that will be missed; this one is a flourish over information
that is safely written down twice more.

---

## 7. Button language

Five button classes exist. Raids use four of them and add one modifier.

| Action | Class | Why this one |
| --- | --- | --- |
| RAID, on the title | `.menu-btn` | it is a title-menu row, like the nine beside it |
| Class pills, raid select | `.pill` / `.pill.active` | identical to the Forge, Armoury and talent tree pickers, which is what makes "this screen is per class" a learned signal rather than a caption |
| A raid row | `.forge-card.raid-row` | the row is the target; see section 2 |
| `▶ MOLTEN CORE`, raid select | `.big-btn` in `.actions` | one screen, one primary, bottom right — `ENTER THE ARENA`, `RUN IT BACK`, `Play as Paladin` |
| `▶ FIGHT GEHENNAS`, boss list | `.big-btn` in `.actions` | same |
| `▶ ARENA` / `🛡 ARMOURY` on a locked or cleared raid | `.big-btn` in `.actions` | a locked screen still has exactly one thing worth doing, so it still has exactly one primary |
| `CONTINUE ▶` / `TRY AGAIN ▶` | **`.big-btn.wide`** | new; the only full-width primary in the game, for the only screen designed around thumb reach |
| `Stop here · keep everything` | `.ghost-btn wide` | already the "leave this screen" button on results (`Main menu`) and diagnostics |
| `‹ Back` | `.ghost-btn` via `backBar()` | unchanged |
| Pager `‹` `›` | `.tiny-btn` via `paged()` | unchanged |

**`.buy-btn` is not used anywhere in raids.** It means "spend gold" — it is the
Forge's and the Armoury's button and it carries the coin. Nothing in a raid is
bought. Entering a raid with a purple purchase button would say the Cores cost
money, which is precisely the misreading the design is trying to avoid: a Core
is permission, and the gold is separate.

**One new variant, and it is a modifier on a button that exists:**

```css
/* .ghost-btn already has a .wide, meaning "this is the whole width of the panel
   and there is nothing to sit beside it". The gate needs the same idea for the
   primary, and a modifier on .big-btn keeps it one button rather than two. */
.big-btn.wide { width: 100%; padding: 18px 20px; font-size: 17px; }
```

54px tall against `.big-btn`'s 46px, and above the 44px floor the project
already applies to `#fullscreen-btn` — the same argument, one screen later:
at 38px it was a miss more often than a hit.

---

## 8. The CSS, in full

Appended to `styles.css` after the Armoury block, so `.forge-card`'s
`border-left: 3px solid var(--quality)` at line 1743 is already in effect.

```css
/* --------------------------------------------------------------------- */
/* Raids                                                                  */
/* --------------------------------------------------------------------- */

/* A ladder, not a grid. .forge-grid flows cards into as many columns as fit,
   which is right for six independent gear slots and wrong for seven raids that
   must be run in order — three columns of a sequence read as three sequences.
   The rows themselves are .forge-card, so everything the Armoury already
   solved about a row with an icon, a body and a tier stripe is inherited. */
.raid-list { display: flex; flex-direction: column; gap: 8px; }

/* Drop and pay, as chips. The Armoury's set bar without its standalone
   margins, which are sized for sitting under a panel head rather than inside
   a card. */
.raid-list .set-bar { margin: 4px 0 0; gap: 5px; }
.raid-list .set-chip { font-size: 10px; padding: 3px 7px; }

/* A raid row is the whole tap target. A .buy-btn on the right takes 84px off a
   body column that is only ~200px wide on a 320px phone, and the sentence
   saying why a raid is shut needs those pixels more than a second affordance
   does. Same button reset as .rank-card and .skill-slot. */
.raid-row {
  width: 100%;
  text-align: left;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

/* The one row on the screen worth acting on. A ring rather than a border,
   because the left edge is the tier stripe and it has a job. */
.raid-list .next {
  background: linear-gradient(180deg, rgba(255, 210, 74, 0.12), var(--panel-2));
  box-shadow:
    inset 0 0 0 1.5px rgba(255, 210, 74, 0.5),
    0 6px 18px rgba(255, 190, 60, 0.14);
}

/* Right-hand affordance: one glyph instead of a control. › open, 🔒 shut,
   ✓ done. */
.raid-go {
  flex: 0 0 auto;
  width: 20px;
  text-align: center;
  font-size: 15px;
  color: var(--dim);
}
.raid-list .next .raid-go { color: var(--gold); }

/* Why a raid is shut, at full contrast, in the colour this game already uses
   for the thing that is stopping you — the same salmon as .ghost-btn.danger,
   .talent-skill.off and .skill-detail i.locked-note. Dimming the row would say
   "off" and would not say why, which is the failure mode of every greyed-out
   control ever shipped. */
.raid-need {
  margin: 2px 0 6px;
  font-size: 11.5px;
  line-height: 1.4;
  font-weight: 700;
  color: #ff9a7a;
}

/* The between-fights window: two stacked full-width buttons with a real gap
   between them, so an overshoot lands on nothing rather than on the other
   button. */
.gate-actions {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 16px;
}
.big-btn.wide { width: 100%; padding: 18px 20px; font-size: 17px; }

/* Bottom-anchored on a touch screen. Two thirds of taps on a phone land in the
   bottom third, and this is the most-pressed control in a raid; a mouse does
   not care where the panel sits, so a pointer:fine screen keeps the centred
   overlay every other in-run screen uses. */
@media (pointer: coarse) and (max-width: 900px) {
  .screen.overlay.raid-gate { justify-content: flex-end; }
}

/* On a narrow phone the raid's flavour line is six lines of prose in a 170px
   column. It is the only thing on the row that is decoration — the reason a
   raid is shut is a separate element and stays, and the boss list's mechanic
   line is not touched at any width. */
@media (max-width: 430px) {
  .raid-row .forge-desc { display: none; }
}

@media (max-height: 640px) {
  .raid-list { gap: 6px; }
  .raid-need { margin: 1px 0 4px; font-size: 11px; }
  .gate-actions { gap: 12px; margin-top: 12px; }
}

@media (max-height: 470px) {
  /* The gate's subtitle is the only line that says which raid, how far in and
     whose, and this is the one screen a player did not ask to be shown. It is
     not the decoration this breakpoint exists to drop. */
  .raid-gate .panel-head .sub { display: block; font-size: 11px; margin: 2px 0 6px; }
  .gate-actions { gap: 10px; margin-top: 10px; }
  .big-btn.wide { padding: 13px 16px; font-size: 15px; }
}

/* Ten title buttons in one column overrun a 390px phone by eighty pixels. Two
   fixed columns rather than auto-fit: at 358px of content minmax(190px, 1fr)
   resolves to a single track and the grid silently becomes a list. */
@media (max-width: 430px) {
  .main-menu.grid { grid-template-columns: repeat(2, 1fr); }
  /* Uniform row heights are what a two-column grid costs: one three-line hint
     inflates the whole row. Every hint here survives the clip except the
     Diagnostics one, whose full text is the first thing on the screen it
     opens. */
  .menu-hint { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
}
```

Icon canvases need no rule. `.skill-slot canvas, .kit-icon canvas, .forge-icon
canvas, .diff-btn canvas { display: block; position: static; }` already covers
`.forge-icon`, and every icon on both raid screens is inside one — which is also
what puts them inside the fit test's `brokenIcons` check for free.

---

## 9. Passing `tools/menu-fit-test.mjs`

### Register the screens

```js
const SCREENS = [
  'title', 'classes', 'loadout', 'talents', 'forge', 'armoury',
  'raids', 'raid',
  'stats', 'settings', 'howto', 'diag',
  'pause', 'upgrade', 'results', 'continue', 'wipe',
];
```

### Prime the worst case, not the middle one

`primeRun()` already refuses to measure the souls badge at zero, because "a
seven-figure balance is the widest the souls badge ever gets, and width is the
whole question". The same argument applies four more times here, so the raid
priming picks the widest string in every slot:

```js
// The widest of everything, because the middle case proves nothing.
//   longest raid name        Icecrown Citadel
//   longest boss name        High Warlord Naj'entus  (→ the widest .big-btn label)
//   longest lock reason      Buy the full T5 set first — 6 pieces short.
//   longest Core chip        🪬 T6 Trinket Core
//   most rows on a page      seven raids, six bosses
B.menus.selectedClass = cls.id;
B.menus.raidId = 'blacktemple';
const st = B.profile.raidState(cls.id);
st.killed.najentus = true;               // one Core taken, so both row states draw
B.game.raid = B.RAID_BY_ID.blacktemple;
B.game.lastBoss = B.RAID_BY_ID.blacktemple.bosses[0];
B.game.bossIndex = 0;
// And a raid that is shut on the set gate, which is the longest reason string:
// level 41 with no T4 gear bought reaches Black Temple locked, not level-locked.
B.profile.data.classes[cls.id].xp = xpForLevel(41);
```

The Menus and the raid helpers have to be reachable from `window.CRAFTARENA`
for this — `RAID_BY_ID` and `menus` already would be, following how `CLASSES`
and `AFFIXES` are exposed.

### What each check sees

* **`overflowY` / `overflowX`** — both raid lists are paged through the existing
  `paged()` with `byHeight()` buckets, which is the mechanism that already
  fits a 17-entry Forge onto a 560px phone. Nothing new scrolls.
* **`offscreen`** — button centres. Raid select has back + 9 pills + 7 rows
  (paged to at most 7) + up to 2 pager + 1 primary. The boss list has back +
  up to 2 pager + 1 primary. Both gates have exactly 2. Every one of them is
  inside a `.panel` inside a `.screen`, so if the panel fits they fit.
* **`scale`** — estimated worst case is the title screen at 320×568, which
  the two-column change takes from a projected 0.83 down to 1.00, and raid
  select at 360×640 at ~0.96. Nothing approaches the 0.8 floor.
* **`brokenIcons`** — every raid and boss icon is a 34px canvas inside
  `.forge-icon`, which the existing `position: static` rule covers and which the
  test's selector already walks.
* **`covered`** — `backBar()` is reused unchanged on both list screens, so the
  souls badge keeps its `margin-right: 52px` under
  `body.show-fullscreen-btn`. The gates have no back bar and no souls badge:
  they are overlays over a live run, like `pause`.

### The one thing that needs watching

`.screen.overlay.raid-gate { justify-content: flex-end }` fires on
`(pointer: coarse)`, and the fit test sets `hasTouch: true` on every context
including the 1440×900 one. That is harmless — a bottom-anchored panel still
fits and its buttons are still on screen — but the desktop result will show the
panel low rather than centred, which is not what a mouse user sees. The
`(max-width: 900px)` half of the query is what keeps the two apart, and it is
there for that reason rather than as a second guess at the same thing.

---

## 10. Copy index

Every string the raid menus produce, in one place, for whoever has to translate
or shorten them.

**Title**

```
RAID
Zul'Gurub is open
3 of 6 · Molten Core
Level 51 · Firelands
2 pieces short · Firelands
All 42 bosses down
```

**Raid select**

```
Raids
Paladin · 8 of 42 bosses down
Every Core taken. T1 gear is buyable.
Next · Gehennas
Requires level 51 — you are 45.                     (raidAccess)
Clear Molten Core first — 2 of 6 down.              (raidAccess)
Buy the full T4 set first — 3 pieces short.         (raidAccess)
▶ MOLTEN CORE
Every raid cleared on Paladin. Progress is per class — another one starts at Zul'Gurub.
```

**Boss list**

```
Molten Core
Paladin · 2 of 6 down · T1 Cores
Breath — A wide cone in front. Get behind it.       (MECHANICS)
🦺 T1 Chest Core
🪙 1,600
🪙 1,600 paid
NEXT
Six bosses, each pays half a piece. A full clear funds half the set it unlocks; the rest comes from the arena.
Molten Core is cleared on Paladin. Every T1 Core is yours.
▶ FIGHT GEHENNAS
▶ ARENA
🛡 ARMOURY
```

**Continue**

```
Magmadar down
Molten Core · 2 of 6 · Paladin
🦺  T1 Chest Core        unlocked
🪙  Gold                 +1,600
⛑  Next · Gehennas      Summons
Continue restores your health, your Mana and every cooldown.
CONTINUE ▶
Stop here · keep everything
```

**Raid cleared**

```
Molten Core cleared
Paladin · 6 of 6 · T1
🪬  T1 Trinket Core      unlocked
🪙  Gold                 +1,600
🛡  T1 gear              buyable now
Every T1 Core is yours. The gold is not — buy the set in the Armoury.
🛡 ARMOURY
Back to the menu
```

**Wipe**

```
Magmadar still stands
Molten Core · 2 of 6 · Paladin
🛡  Your Cores           2 of 6 kept
↻  Magmadar             back to full
🪙  This attempt cost    nothing
A boss is only spent when it dies. Take it again as many times as you need.
TRY AGAIN ▶
Stop here · keep everything
```

**In-run banner**

```
BOSS SLAIN  +1600 🪙        2.6s   (existing)
🦺  T1 CHEST CORE           3.2s   (new)
```

---

[sm]: https://www.smashingmagazine.com/2021/08/frustrating-design-patterns-disabled-buttons/
[uxt]: https://www.uxtigers.com/post/inactive-buttons
[tz]: https://parachutedesign.ca/blog/thumb-zone-ux/
[pd]: https://www.nngroup.com/articles/progressive-disclosure/
