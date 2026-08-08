// All DOM menus: title, class select, skill loadout, talent trees, the Forge
// and the Armoury (permanent upgrades), settings, pause, in-run upgrade cards
// and the results screen.
//
// Nothing here scrolls. Every screen is built to fit the viewport: long lists
// are paged, dense ones are tabbed, and fitScreen() is the safety net that
// scales a screen down rather than letting it run off the bottom.

import { CLASSES, CLASS_BY_ID, LOADOUT_SIZE, unlockOrder, unlockLevelOf, defaultLoadout } from '../data/classes.js';
import {
  PERMANENT, upgradeCost, masteryProgress,
  permanentMods, masteryMods, masteryRank,
} from '../data/permanent.js';
import {
  GEAR_SLOTS, GEAR_SLOT_IDS, GEAR_TIERS, MAX_TIER, canBuy, ownedTier, gearRating, setTier,
  maxTierForLevel, tierLevel, tierColor, gearName, slotDesc, slotSummary,
  GEAR_BY_ID, gearCost, gearMods, mergeMods, activeSet, setScale,
  tierSkillBonus, tierSkillDesc, SKILL_SET_THRESHOLD, SET_BONUSES, SET_THRESHOLDS,
} from '../data/armor.js';
import {
  RAIDS, RAID_BY_ID, RAID_BY_TIER, MECHANICS, CORE_ORDER, coreSlotFor, bossGold,
  raidAccess, nextBoss, isBossDead, isRaidCleared, bossesDown,
} from '../data/raids.js';

import { skillCost, skillCooldown } from '../game/skills.js';
import { buildMods } from '../game/player.js';
import { storage, MAX_CHARACTERS } from '../core/save.js';
import { DIFFICULTIES } from '../data/difficulty.js';
import { skillIconElement, iconElement, schoolFor, SCHOOLS } from './icons.js';
import { QUEST_COUNT } from '../data/quests.js';
import { talentLines, talentNextGain, setBonusLine } from '../data/talentinfo.js';
import { POTIONS, POTION_STACK } from '../data/potions.js';

// Presentation only, so it lives here and not in raids.js — the same reason
// TALENT_GLYPHS does. One glyph per raid; the field colour comes from the
// raid's own theme, so the icon is lit the way its arena is.
const RAID_GLYPHS = {
  zulgurub: '🐍', moltencore: '🌋', karazhan: '🕯', ulduar: '⚙',
  blacktemple: '👁', firelands: '🔥', icecrown: '❄',
};
const raidSchool = (raid) => ({
  base: raid.theme.fog, edge: raid.theme.accent, glow: raid.theme.accent,
});

// "Chestplate Core" and "Signet Core" are slot names run through a shop voice
// they were never written for. Short labels here, used by the row chip, the
// banner and the ledger alike, so the same Core is called the same thing
// everywhere it appears.
const CORE_LABEL = {
  weapon: 'Weapon', chest: 'Chest', helm: 'Helm',
  boots: 'Boots', ring: 'Signet', trinket: 'Trinket',
};
const coreName = (tier, slot) => `T${tier} ${CORE_LABEL[slot]} Core`;

// Where each of a branch's six talent nodes sits, as [column, row] on a 3-wide
// grid, and which earlier node gates it. The empty cells and the long arrows
// that span them are the point: being able to read a tree's shape tells you
// what a deep node costs before you tap it, which a flat list of cards never
// did.
// Eleven nodes on a four-wide grid, five rows deep. Three columns would need
// seven rows for the same count and a seven-row tree does not fit a phone —
// and a tree that has to be scrolled has lost the thing it exists for, which
// is that you can see how deep a node is before you tap it.
const TALENT_LAYOUT = [
  [1, 0], [2, 0],
  [0, 1], [1, 1], [3, 1],
  [1, 2], [2, 2],
  [0, 3], [2, 3],
  [1, 4], [2, 4],
];
// Which node gates which. Every arrow is vertical by construction — the source
// is always in the same column and an earlier row, so the line can be drawn
// upward out of the target's own cell and cannot fall out of alignment.
const TALENT_ARROWS = { 3: 0, 5: 3, 6: 1, 8: 6, 9: 5, 10: 8 };
// One glyph per tier, so the six cells of a branch are distinguishable at a
// glance even before you know what they do.
const TALENT_GLYPHS = ['⚔', '🛡', '✦', '⚡', '☘', '★', '◈', '☄', '⌾', '⚑', '✹'];

const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};

const fmtTime = (s) => {
  const m = Math.floor(s / 60);
  return `${m}m ${Math.floor(s % 60)}s`;
};

/**
 * Rows per page for the current viewport height. A landscape phone has barely
 * 375px to work with once the browser chrome is out, which is one or two rows
 * of anything — the buckets are deliberately pessimistic.
 */
function byHeight(small, medium, large) {
  const h = window.innerHeight || 800;
  if (h < 470) return Math.max(1, small - 1);
  if (h < 620) return small;
  if (h < 900) return medium;
  return large;
}

export class Menus {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx;              // { profile, audio, startRun, resumeRun, quitRun, game }
    this.screen = null;
    // Which character every screen is talking about. A character id, not a
    // class id: progress is filed under the character now, and two Warriors
    // are two different answers to "show me my gear".
    this.selectedChar = ctx.profile.activeChar;
    this.talentChar = this.selectedChar;
    this.talentBranch = 0;
    this.pages = {};             // screen name -> current page index
    // Re-fit on rotation and on the address bar sliding away.
    window.addEventListener('resize', () => {
      if (this.screen) this.fitScreen();
    });
  }

  get profile() { return this.ctx.profile; }

  click(node, fn) {
    node.addEventListener('click', (e) => {
      e.preventDefault();
      this.ctx.audio.ensure();
      this.ctx.audio.play('ui');
      fn(e);
    });
    return node;
  }

  show(name) {
    if (name !== this.screen) this.pages = {};
    this.screen = name;
    this.root.innerHTML = '';
    this.root.classList.toggle('hidden', name === null);
    if (name === null) return;
    const builder = {
      title: () => this.buildTitle(),
      classes: () => this.buildClassSelect(),
      roster: () => this.buildRoster(),
      loadout: () => this.buildLoadout(),
      talents: () => this.buildTalents(),
      quests: () => this.buildQuests(),
      forge: () => this.buildForge(),
      armoury: () => this.buildArmoury(),
      potions: () => this.buildPotionShop(),
      raids: () => this.buildRaids(),
      raid: () => this.buildRaid(),
      raidkill: () => this.buildRaidGate('kill'),
      raidwipe: () => this.buildRaidGate('wipe'),
      sheet: () => this.buildSheet(),
      options: () => this.buildOptions(),
      settings: () => this.buildSettings(),
      stats: () => this.buildStats(),
      pause: () => this.buildPause(),
      upgrade: () => this.buildUpgradeCards(),
      results: () => this.buildResults(),
      howto: () => this.buildHowTo(),
      diag: () => this.buildDiagnostics(),
    }[name];
    if (builder) this.root.appendChild(builder());
    this.fitScreen();
  }

  /** Rebuild the current screen in place. show() keeps page and tab state
   *  when the name is unchanged, so a buy or a tab tap redraws without
   *  jumping back to page one. */
  refresh() { this.show(this.screen); }

  /**
   * Last line of defence against a screen that does not fit. Content is
   * designed to fit on its own; this catches the combinations that still
   * overflow — a very short landscape phone, a huge system font — by scaling
   * the whole screen instead of introducing a scrollbar. Two passes, because
   * widening the element to compensate for the scale reflows the text.
   */
  fitScreen() {
    const screen = this.root.firstElementChild;
    if (!screen) return;
    screen.style.transform = '';
    const style = getComputedStyle(this.root);
    const avail = this.root.clientHeight
      - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    if (avail <= 0) return;
    const need = screen.scrollHeight;
    if (need <= avail + 1) return;
    // Scale about the top centre and leave the element's own width alone.
    // Widening it to reclaim the side margins looks tidier but pushes the box
    // past the container, and a transform cannot pull it back — the result is
    // a horizontally scrolling menu with its buttons off the right edge.
    const k = Math.max(0.5, avail / need);
    screen.style.transformOrigin = 'top center';
    screen.style.transform = `scale(${k})`;
  }

  panel(titleText, subtitle) {
    const p = el('div', 'panel');
    const head = el('div', 'panel-head');
    head.appendChild(el('h1', null, titleText));
    if (subtitle) head.appendChild(el('p', 'sub', subtitle));
    p.appendChild(head);
    return p;
  }

  /**
   * A class's level and how far into it, as one bar with the raw numbers under
   * it. The numbers matter: a bar on its own tells a player they are "somewhere
   * along", and at level 40 the difference between somewhere along and eleven
   * more runs is the entire decision about what to play tonight.
   */
  levelBarHtml(charId) {
    const p = this.profile.levelProgress(charId);
    const label = p.maxed
      ? `MAX · ${p.total.toLocaleString()} XP`
      : `${p.into.toLocaleString()} / ${p.need.toLocaleString()} XP`;
    return `<div class="lvl-row${p.maxed ? ' maxed' : ''}">
        <span class="lvl-num">Lv ${p.level}</span>
        <span class="lvl-bar"><i style="width:${(p.frac * 100).toFixed(1)}%"></i></span>
      </div>
      <div class="lvl-xp">${label}</div>`;
  }

  soulsBadge() {
    // Icon and number only. Spelling the currency out here pushed the back bar
    // onto two lines on a 320px phone, which cost more than the word was worth
    // — every price in the game already carries the same 🪙.
    return el('div', 'souls-badge', `<span>🪙</span> ${this.profile.souls.toLocaleString()}`);
  }

  /**
   * Render one page of a long list, with a compact pager underneath. Paging
   * is what lets a 17-entry Forge fit a phone without a scrollbar.
   */
  paged(key, items, perPage, container, render) {
    const pages = Math.max(1, Math.ceil(items.length / perPage));
    const page = Math.min(this.pages[key] || 0, pages - 1);
    this.pages[key] = page;
    for (const item of items.slice(page * perPage, page * perPage + perPage)) {
      container.appendChild(render(item));
    }
    if (pages <= 1) return container;
    const bar = el('div', 'pager');
    const prev = el('button', 'tiny-btn', '‹');
    const next = el('button', 'tiny-btn', '›');
    prev.disabled = page === 0;
    next.disabled = page >= pages - 1;
    this.click(prev, () => { this.pages[key] = page - 1; this.refresh(); });
    this.click(next, () => { this.pages[key] = page + 1; this.refresh(); });
    bar.appendChild(prev);
    bar.appendChild(el('span', 'pager-label', `${page + 1} / ${pages}`));
    bar.appendChild(next);
    const wrap = el('div', 'paged');
    wrap.appendChild(container);
    wrap.appendChild(bar);
    return wrap;
  }

  // -------------------------------------------------------------------------
  // Title
  // -------------------------------------------------------------------------

  buildTitle() {
    const wrap = el('div', 'screen title-screen');
    const logo = el('div', 'logo');
    // The extruded copy behind the letters is a ::before that reads its text
    // from this attribute — the gradient fill is clipped to the glyphs and so
    // cannot cast a shadow itself.
    const title = el('h1', 'game-title', 'CRAFT ARENA');
    title.setAttribute('data-text', 'CRAFT ARENA');
    logo.appendChild(title);
    logo.appendChild(el('p', 'game-sub', 'Endless Voxel Arena'));
    wrap.appendChild(logo);
    wrap.appendChild(this.soulsBadge());

    // Who you are playing, above the menu. Every screen below this point is
    // about one character, and with two Warriors on the roster the class name
    // alone no longer answers "which one" — so the bar names the character and
    // is itself the way to change it.
    const active = this.profile.character();
    if (active) {
      const acls = this.profile.classOf(active.id);
      const bar = el('button', 'char-bar');
      bar.style.setProperty('--accent', acls.color);
      // Drop the class name when the character is still called after it:
      // "Warrior / Warrior · level 1" prints one word twice.
      const sub = active.name === acls.name
        ? `${acls.role} \u00b7 level ${this.profile.level(active.id)}`
        : `${acls.name} \u00b7 level ${this.profile.level(active.id)}`;
      bar.innerHTML = `<span class="char-bar-name">${active.name}</span>
        <span class="char-bar-sub">${sub}</span>
        <span class="char-bar-go">Switch \u203a</span>`;
      wrap.appendChild(this.click(bar, () => this.show('roster')));
    }

    const menu = el('div', 'main-menu grid');
    const best = this.profile.data.stats.bestWave;
    const rating = gearRating(this.profile.gear(this.charId()));
    // With nobody on the roster every tile below is about a character that
    // does not exist. PLAY still works — it lands on creation — so the honest
    // thing is to say so rather than draw eight buttons that cannot do
    // anything yet.
    const empty = !this.profile.characters.length;
    // A claimable reward sitting unnoticed behind a menu is a reward that
    // never happened, so the count is on the button itself.
    const quests = this.profile.activeQuests();
    const ready = quests.filter((q) => q.done).length;
    const questDone = this.profile.questState.completed;
    // Five doors, not twelve.
    //
    // Twelve top-level buttons is not a menu, it is a list, and three of them
    // — THE FORGE, ARMOURY, TALENTS — all mean "make my character stronger"
    // with nothing on the screen saying so. A player who does not already know
    // this game cannot tell them apart, and a child cannot tell what any of
    // them are. Everything is still one tap further in; it is the *choosing*
    // that got smaller.
    //
    // The hints are written to be understood by someone who has never played
    // a game like this, which is a harder constraint than it sounds: no
    // jargon, no nouns invented by this game, and each one says what you get
    // rather than what the screen is called.
    const level = this.charId() !== null ? this.profile.level(this.charId()) : 1;
    const spendable = this.charId() === null ? 0
      : this.profile.availableTalentPoints(this.charId());
    const items = [
      // Always PLAY, even with nobody on the roster — it is the one button a
      // new player has to find, and a label that changes depending on state
      // they have not learned yet is a label they have to read. With no
      // character it lands on creation, which is the same journey.
      { label: 'PLAY',
        hint: empty ? 'Pick a hero to begin' : (best ? `Best: wave ${best}` : 'Fight monsters that keep coming'),
        primary: true,
        go: () => { this.creatingChar = empty; this.show('classes'); } },
      // Second, beside PLAY, because it is the other thing you *do*. Not
      // primary: the arena funds the raids — a boss pays half what its piece
      // costs — and two gold buttons would say the two are interchangeable.
      //
      // Hidden entirely below level 6. The first raid gates at 8, so before
      // that this is a door that only ever says no.
      { label: 'BOSS FIGHTS', hint: this.raidHint(this.charId()),
        hide: level < 6, go: () => this.show('raids') },
      { label: 'GET STRONGER',
        hint: spendable ? `${spendable} points to spend` : 'Spend your gold and your points',
        go: () => this.show('sheet') },
      { label: 'JOBS',
        hint: ready ? `${ready} ready to claim` : 'Small goals that pay you gold',
        go: () => this.show('quests') },
      { label: 'MY HEROES',
        hint: `${this.profile.characters.length} of ${MAX_CHARACTERS} slots used`,
        hide: level < 3 && this.profile.characters.length < 2,
        go: () => this.show('roster') },
      { label: 'OPTIONS', hint: 'Sound, controls, and help', go: () => this.show('options') },
    ];

    for (const it of items) {
      // With nobody on the roster every door but PLAY and OPTIONS is about a
      // character that does not exist. `hide` is the same idea one level down:
      // a door that can only say no is worse than no door.
      if (it.hide) continue;
      if (empty && !it.primary && it.label !== 'OPTIONS') continue;
      const b = el('button', 'menu-btn' + (it.primary ? ' primary' : ''));
      b.appendChild(el('span', 'menu-label', it.label));
      b.appendChild(el('span', 'menu-hint', it.hint));
      menu.appendChild(this.click(b, it.go));
    }
    wrap.appendChild(menu);
    wrap.appendChild(el('p', 'footnote',
      'Original voxel art & audio, generated in code. Not affiliated with any other game.'
      + `<br><span class="build">build ${this.ctx.build || 'dev'}</span>`));
    return wrap;
  }

  backBar(to = 'title', extra = null) {
    const bar = el('div', 'back-bar');
    bar.appendChild(this.click(el('button', 'ghost-btn', '‹ Back'), () => this.show(to)));
    if (extra) bar.appendChild(extra);
    bar.appendChild(this.soulsBadge());
    return bar;
  }

  /** The endless per-character progress bar, shown wherever one is chosen. */
  masteryBar(charId) {
    const m = masteryProgress((this.profile.character(charId) || {}).mastery || 0);
    const pct = Math.round((m.into / m.need) * 100);
    const box = el('div', 'mastery');
    box.innerHTML = `
      <div class="mastery-top">
        <span>Mastery ${m.rank}</span>
        <span class="dim">+${(m.rank * 1.2).toFixed(1)}% damage · +${m.rank * 4} health</span>
      </div>
      <div class="mastery-bar"><i style="width:${pct}%"></i></div>`;
    return box;
  }

  // -------------------------------------------------------------------------
  // GET STRONGER — the character sheet, which is also the hub
  // -------------------------------------------------------------------------

  /**
   * What your character actually is, and which screen made it that way.
   *
   * Four systems — gear, points, training, level — all flatten into one bag of
   * numbers, and until now a player could inspect every *input* on its own
   * screen and never see the *output* anywhere. That is also why the Forge,
   * the Armoury and the Talents were indistinguishable from the title screen:
   * three shouty nouns that all mean "make my character stronger".
   *
   * So they are not three doors any more. They are rows on the sheet that says
   * what each is currently worth, which explains what they are by construction
   * and is the screen that sells the next purchase — "+8% health" means
   * something next to the health number it is adding to.
   */
  buildSheet() {
    const wrap = el('div', 'screen');
    wrap.appendChild(this.backBar('title'));
    const charId = this.charId();
    if (charId === null) {
      const p = this.panel('Get stronger', 'Make a hero first.');
      wrap.appendChild(p);
      return wrap;
    }
    const cls = this.profile.classOf(charId);
    const ch = this.profile.character(charId);
    wrap.appendChild(this.charPicker());

    // Drop the class name when the character is still called after it —
    // "Warrior / Warrior · level 60" prints one word twice.
    const p = this.panel(ch.name, ch.name === cls.name
      ? `${cls.role} · level ${this.profile.level(charId)}`
      : `${cls.name} · level ${this.profile.level(charId)}`);

    // The six numbers, built the same way a run builds them, so what is shown
    // is what will be played rather than a second implementation that drifts.
    const perm = permanentMods(this.profile.forgeLevels(charId));
    mergeMods(perm, gearMods(cls.id, this.profile.gear(charId)));
    for (const [k, v] of Object.entries(masteryMods(masteryRank(ch.mastery || 0)))) {
      perm[k] = (perm[k] || 0) + v;
    }
    const mods = buildMods(cls, ch.talents, perm);
    const b = cls.base;
    const stats = [
      ['Health', Math.round((b.hp + (mods.maxHp || 0)) * (1 + (mods.maxHpPct || 0)))],
      ['Damage', Math.round(b.attackDamage * (1 + (mods.attackDamage || 0))
        * (1 + (mods.meleeDamage || 0) + (mods.allDamage || 0)))],
      ['Crit', `${Math.round((b.critChance + (mods.critChance || 0)) * 100)}%`],
      ['Attack speed', `${(b.attackSpeed * (1 + (mods.attackSpeed || 0))).toFixed(2)}/s`],
      ['Armour', `${Math.round((b.armor + (mods.armor || 0)) * 100)}%`],
      ['Speed', (b.speed * (1 + (mods.moveSpeed || 0))).toFixed(1)],
    ];
    const grid = el('div', 'sheet-stats');
    for (const [name, value] of stats) {
      const cell = el('div', 'sheet-stat');
      cell.appendChild(el('b', null, String(value)));
      cell.appendChild(el('span', null, name));
      grid.appendChild(cell);
    }
    p.appendChild(grid);

    // The rows. Each one says what it is in words a child can read, and what
    // it is worth right now — which is the answer to "what is the difference
    // between these three screens".
    const gear = this.profile.gear(charId);
    const owned = GEAR_SLOT_IDS.filter((id) => ownedTier(gear, id) >= 0).length;
    const forge = this.profile.forgeLevels(charId);
    const forgeLv = PERMANENT.reduce((n, d) => n + (forge[d.id] || 0), 0);
    const pts = this.profile.availableTalentPoints(charId);
    const potions = POTIONS.reduce((n, d) => n + this.profile.potionCount(charId, d.id), 0);
    const rows = [
      { icon: '🛡', name: 'GEAR', what: 'Things your hero wears. Buy them with gold.',
        worth: `${owned} of ${GEAR_SLOT_IDS.length} slots filled`, go: 'armoury' },
      { icon: '✦', name: 'POINTS', what: 'One every level. Spend them to improve your skills.',
        worth: pts ? `${pts} to spend` : 'all spent', hot: pts > 0, go: 'talents' },
      { icon: '⚒', name: 'TRAINING', what: 'Small boosts you keep forever.',
        worth: `${forgeLv} bought`, go: 'forge' },
      { icon: '⚔', name: 'SKILLS', what: 'You know many. Pick the four you take in.',
        worth: `${this.profile.loadout(charId).length} equipped`, go: 'loadout' },
      { icon: '🧪', name: 'POTIONS', what: 'Drinks you carry in. Use one when you are in trouble.',
        worth: potions ? `${potions} carried` : 'none carried', go: 'potions' },
    ];
    const list = el('div', 'sheet-rows');
    for (const r of rows) {
      const row = el('button', 'sheet-row' + (r.hot ? ' hot' : ''));
      row.innerHTML = `<span class="sheet-row-icon">${r.icon}</span>
        <span class="sheet-row-body">
          <span class="sheet-row-name">${r.name}</span>
          <span class="sheet-row-what">${r.what}</span>
        </span>
        <span class="sheet-row-worth">${r.worth}</span>`;
      this.click(row, () => this.show(r.go));
      list.appendChild(row);
    }
    p.appendChild(list);
    p.appendChild(this.masteryBar(charId));
    wrap.appendChild(p);
    return wrap;
  }

  // -------------------------------------------------------------------------
  // OPTIONS — everything that is not about a character
  // -------------------------------------------------------------------------

  buildOptions() {
    const wrap = el('div', 'screen');
    wrap.appendChild(this.backBar('title'));
    const p = this.panel('Options', 'Sound, controls, and help');
    const menu = el('div', 'main-menu');
    const items = [
      { label: 'HOW TO PLAY', hint: 'What the buttons do', go: 'howto' },
      { label: 'SETTINGS', hint: 'Sound, controls and how it looks', go: 'settings' },
      { label: 'RECORDS', hint: 'Everything you have ever done', go: 'stats' },
      { label: 'SOMETHING IS BROKEN', hint: 'Screenshot this and send it', go: 'diag' },
    ];
    for (const it of items) {
      const b = el('button', 'menu-btn');
      b.appendChild(el('span', 'menu-label', it.label));
      b.appendChild(el('span', 'menu-hint', it.hint));
      menu.appendChild(this.click(b, () => this.show(it.go)));
    }
    p.appendChild(menu);
    wrap.appendChild(p);
    return wrap;
  }

  // -------------------------------------------------------------------------
  // The roster — eight character slots
  // -------------------------------------------------------------------------

  /**
   * Which character the menus are talking about, repaired on every read.
   *
   * `selectedChar` is a plain id held across screen rebuilds, and a character
   * can be deleted from underneath it. Rather than hunt every place that could
   * go stale, resolve it here: an id that no longer names anybody falls back
   * to the active character, and the roster is the only screen that has to
   * cope with there being nobody at all.
   */
  charId(preferred) {
    const want = preferred !== undefined ? preferred : this.selectedChar;
    const ch = this.profile.character(want);
    return ch ? ch.id : null;
  }

  /**
   * The row of character pills that heads the Forge, Armoury, Talents and
   * Potion Shop. It replaced a row of *class* pills, and does the same job for
   * the same reason: without it there is no way to tell whose gear you are
   * looking at — only now two of them can be Warriors, so the name has to
   * carry the level too.
   */
  charPicker(onPick, current) {
    const picker = el('div', 'class-picker');
    const active = current !== undefined ? current : this.charId();
    for (const ch of this.profile.characters) {
      const cls = this.profile.classOf(ch.id);
      const b = el('button', 'pill' + (ch.id === active ? ' active' : ''));
      b.appendChild(el('span', null, ch.name));
      b.appendChild(el('span', 'pill-lv', String(this.profile.level(ch.id))));
      b.style.setProperty('--accent', cls.color);
      this.click(b, () => {
        if (onPick) onPick(ch.id);
        else this.selectedChar = ch.id;
        this.refresh();
      });
      picker.appendChild(b);
    }
    return picker;
  }

  /**
   * The roster: every character, plus the empty slots.
   *
   * Empty slots are drawn rather than hidden. A grid that grows as you fill it
   * never tells you how much room is left, and "how many more can I make" is
   * the question a slot screen exists to answer.
   */
  buildRoster() {
    const wrap = el('div', 'screen');
    wrap.appendChild(this.backBar('title'));
    const chars = this.profile.characters;
    const p = this.panel('Your characters',
      `${chars.length} of ${MAX_CHARACTERS} slots used · gold is shared, everything else is theirs`);

    // Characters and empty slots are one paged list. Eight cards is taller
    // than a 568px phone even in two columns, and the roster is the last
    // screen that should need scrolling — it is how you get to everything
    // else. `null` stands for an empty slot.
    const slots = [...chars];
    while (slots.length < MAX_CHARACTERS) slots.push(null);
    const grid = el('div', 'roster-grid');
    p.appendChild(this.paged('roster', slots, byHeight(4, 6, 8), grid, (ch) => {
      if (!ch) {
        const slot = el('button', 'roster-card empty');
        slot.appendChild(el('div', 'roster-plus', '+'));
        slot.appendChild(el('div', 'roster-class', 'New character'));
        return this.click(slot, () => { this.creatingChar = true; this.show('classes'); });
      }
      const cls = this.profile.classOf(ch.id);
      const active = ch.id === this.profile.activeChar;
      const card = el('div', 'roster-card' + (active ? ' active' : ''));
      card.style.setProperty('--accent', cls.color);
      // The class line drops the class name when the character is still
      // called after it — "Warrior / Warrior · Melee Bruiser" is one word of
      // information printed twice.
      const named = ch.name === cls.name;
      const pts = this.profile.availableTalentPoints(ch.id);
      card.innerHTML = `
        <div class="roster-name">${ch.name}</div>
        <div class="roster-class">${named ? cls.role : `${cls.name} · ${cls.role}`}</div>
        <div class="roster-meta">
          <span>Lv ${this.profile.level(ch.id)}</span>
          <span>wave ${ch.bestWave || 0}</span>
          ${pts ? `<span class="roster-pts">${pts} pts</span>` : ''}
        </div>`;
      const row = el('div', 'roster-actions');
      const play = el('button', 'buy-btn', active ? 'PLAYING' : 'SELECT');
      this.click(play, () => {
        this.profile.setActive(ch.id);
        this.selectedChar = ch.id;
        this.talentChar = ch.id;
        this.ctx.audio.play('buy');
        this.show('classes');
      });
      row.appendChild(play);
      // Deleting is two taps, and the second one is on a button that says what
      // it will destroy. A roster is the one screen where a mis-tap is not
      // recoverable, so the confirmation names the character and its level.
      const del = el('button', 'tiny-btn danger',
        this.pendingDelete === ch.id ? `Delete Lv ${this.profile.level(ch.id)}?` : '🗑');
      if (this.pendingDelete === ch.id) del.classList.add('confirm');
      this.click(del, () => {
        if (this.pendingDelete === ch.id) {
          this.profile.deleteCharacter(ch.id);
          this.pendingDelete = null;
          this.selectedChar = this.profile.activeChar;
          this.ctx.audio.play('deny');
        } else {
          this.pendingDelete = ch.id;
        }
        this.refresh();
      });
      row.appendChild(del);
      card.appendChild(row);
      return card;
    }));
    wrap.appendChild(p);
    return wrap;
  }

  // -------------------------------------------------------------------------
  // Class select — makes a character, or shows the one you have
  // -------------------------------------------------------------------------

  buildClassSelect() {
    // Two screens in one, because they are the same screen at different times.
    // With no character — a fresh account, or an empty slot tapped on the
    // roster — this is character creation and the class cards are the choice.
    // With one, it is the pre-run screen and the cards switch which class the
    // character plays.
    const creating = this.creatingChar || !this.profile.characters.length;
    // Switching an existing character's class is a third state, and a rare
    // one. It borrows the same card grid rather than living beside it: nine
    // cards *plus* the kit, the mastery bar, the difficulty row and the play
    // button is more than a 320px phone has, and the version of this screen
    // you see every time you press PLAY should be about playing.
    const changing = !creating && this.changingClass;
    const wrap = el('div', 'screen');
    wrap.appendChild(this.backBar(creating && this.profile.characters.length ? 'roster' : 'title'));
    const charId = creating ? null : this.charId();
    const p = this.panel(
      creating ? 'Choose your class'
        : changing ? `${this.profile.character(charId).name} — change class`
          : this.profile.character(charId).name,
      creating
        ? 'It decides your skills and your talent trees — and you can change it later'
        : changing
          ? 'Keeps your level, gear, Forge and raid record. Talent points come back unspent.'
          : `${this.profile.classOf(charId).name} · level ${this.profile.level(charId)}`);

    const currentClass = creating ? null : this.profile.classOf(charId).id;
    if (creating || changing) {
    const grid = el('div', 'class-grid');
    for (const cls of CLASSES) {
      const card = el('div', 'class-card' + (cls.id === currentClass ? ' selected' : ''));
      card.style.setProperty('--accent', cls.color);
      const kit = defaultLoadout(cls, 60).slice(0, 4)
        .map((s) => `<span title="${s.name}">${s.icon}</span>`).join('');
      card.innerHTML = `
        <div class="class-name">${cls.name}</div>
        <div class="class-role">${cls.role}</div>
        <div class="class-skills">${kit}</div>
        <div class="class-tagline">${cls.tagline}</div>
        <div class="class-diff">${'★'.repeat(cls.difficulty)}${'☆'.repeat(3 - cls.difficulty)}</div>`;
      this.click(card, () => {
        if (creating) {
          const made = this.profile.createCharacter(cls.id);
          if (!made) { this.ctx.audio.play('deny'); return; }
          this.creatingChar = false;
          this.selectedChar = made.id;
          this.talentChar = made.id;
          this.profile.setActive(made.id);
          this.ctx.audio.play('buy');
        } else {
          // Switching keeps the level, the gear, the Forge and the raid
          // record — none of those is about the class — and refunds the
          // talents, because the trees are different shapes.
          if (cls.id !== currentClass) this.profile.switchClass(charId, cls.id);
          this.changingClass = false;
          this.ctx.audio.play('buy');
        }
        this.refresh();
      });
      grid.appendChild(card);
    }
    p.appendChild(grid);
    }

    if (creating) {
      wrap.appendChild(p);
      return wrap;
    }
    if (changing) {
      const back = el('div', 'actions');
      back.appendChild(this.click(el('button', 'ghost-btn', 'Keep my class'), () => {
        this.changingClass = false;
        this.refresh();
      }));
      p.appendChild(back);
      wrap.appendChild(p);
      return wrap;
    }

    const cls = this.profile.classOf(charId);
    const detail = el('div', 'class-detail');
    detail.innerHTML = `<h3 style="color:${cls.color}">${cls.name} — ${cls.tagline}</h3>`;
    // The equipped kit as four icons. The six-number stat table this replaced
    // was the densest block of text on the screen and told a player less than
    // seeing which four skills they are taking in.
    const strip = el('div', 'kit-icons');
    for (const sk of this.profile.loadout(charId)) {
      const slot = el('div', 'kit-icon');
      slot.appendChild(skillIconElement(sk, 34));
      slot.title = `${sk.name} — ${sk.desc}`;
      strip.appendChild(slot);
    }
    const edit = this.click(el('button', 'kit-edit', '✎'), () => this.show('loadout'));
    edit.title = 'Change skills';
    strip.appendChild(edit);
    detail.appendChild(strip);
    detail.appendChild(this.masteryBar(charId));
    p.appendChild(detail);

    // Difficulty, as three buttons rather than a slider buried in Settings:
    // it is the single biggest choice a player makes before a run, and it
    // decides the soul rate as well as the danger.
    const diffRow = el('div', 'diff-row');
    const current = this.profile.settings.difficulty || 2;
    for (const d of DIFFICULTIES) {
      const b = el('button', 'diff-btn' + (d.id === current ? ' on' : ''));
      b.style.setProperty('--accent', d.accent);
      b.appendChild(iconElement(d.icon, 26, { ready: d.id === current }));
      b.appendChild(el('span', 'diff-name', d.name));
      b.appendChild(el('span', 'diff-souls', `\u00d7${d.souls} \ud83e\ude99`));
      b.title = d.blurb;
      this.click(b, () => {
        this.profile.settings.difficulty = d.id;
        this.profile.save();
        this.refresh();
      });
      diffRow.appendChild(b);
    }
    p.appendChild(diffRow);

    const actions = el('div', 'actions');
    actions.appendChild(this.click(el('button', 'ghost-btn', 'Skills'), () => this.show('loadout')));
    actions.appendChild(this.click(el('button', 'ghost-btn', 'Talents'), () => {
      this.talentChar = charId;
      this.show('talents');
    }));
    actions.appendChild(this.click(el('button', 'ghost-btn', 'Class'), () => {
      this.changingClass = true;
      this.refresh();
    }));
    actions.appendChild(this.click(el('button', 'big-btn', 'ENTER THE ARENA'), () => {
      this.profile.setActive(charId);
      this.ctx.startRun(charId);
    }));
    p.appendChild(actions);
    wrap.appendChild(p);
    return wrap;
  }

  // -------------------------------------------------------------------------
  // Skill loadout — pick four of the class's eight
  // -------------------------------------------------------------------------

  buildLoadout() {
    const charId = this.charId();
    const cls = this.profile.classOf(charId);
    const equipped = this.profile.loadout(charId).map((s) => s.id);

    const wrap = el('div', 'screen');
    wrap.appendChild(this.backBar('classes'));
    const p = this.panel(`${cls.name}`, `Pick ${LOADOUT_SIZE} of ${cls.skills.length}`);

    // Ten icon buttons. The description belongs on one detail line under the
    // grid, not repeated ten times: a wall of prose is what made this
    // unreadable on a phone.
    // Mastery points already spent, per skill. Picking four skills and
    // speccing the tree are the same decision, so the screen where you pick
    // has to say which skills you have already invested in — otherwise the
    // points are found by accident, or paid for twice.
    const cd = this.profile.character(charId);
    const invested = {};
    for (const branch of cls.talents) {
      for (const node of branch.nodes) {
        if (!node.skill) continue;
        const rank = cd.talents[node.id] || 0;
        if (rank) invested[node.skill] = (invested[node.skill] || 0) + rank;
      }
    }

    const grid = el('div', 'skill-picker');
    const detail = el('div', 'skill-detail');
    const describe = (sk) => {
      const pts = invested[sk.id] || 0;
      const need = unlockLevelOf(cls, sk.id);
      const locked = need > this.profile.level(charId);
      detail.innerHTML = `<b>${sk.name}</b><span>${sk.desc}</span>`
        + (locked
          ? `<i class="locked-note">🔒 Unlocks at level ${need} — you are level ${this.profile.level(charId)}</i>`
          : `<i>${sk.cost} ${cls.resource.name} · ${sk.cooldown}s`
            + `${pts ? ` · ${pts} Mastery point${pts > 1 ? 's' : ''} invested` : ''}</i>`);
    };

    // Every skill in the pool is shown, including the ones not learned yet.
    // Hiding them would make a class look like it has two abilities; showing
    // them greyed with the level they arrive at turns the same screen into the
    // reason to keep levelling.
    const level = this.profile.level(charId);
    for (const sk of unlockOrder(cls)) {
      const need = unlockLevelOf(cls, sk.id);
      const locked = need > level;
      const on = !locked && equipped.includes(sk.id);
      const btn = el('button', 'skill-slot' + (on ? ' on' : '') + (locked ? ' locked' : ''));
      btn.appendChild(skillIconElement(sk, 46, { ready: !locked }));
      btn.appendChild(el('span', 'slot-name', sk.name));
      if (locked) btn.appendChild(el('span', 'slot-lock', `Lv ${need}`));
      else if (invested[sk.id]) btn.appendChild(el('span', 'slot-mastery', String(invested[sk.id])));
      btn.title = locked
        ? `${sk.name} — unlocks at level ${need}`
        : `${sk.name} — ${sk.desc}`;
      btn.addEventListener('pointerenter', () => describe(sk));
      this.click(btn, () => {
        describe(sk);
        // A locked skill still answers when tapped — that is the whole point of
        // showing it — but it cannot be slotted.
        if (locked) { this.ctx.audio.play('deny'); return; }
        const next = equipped.includes(sk.id)
          ? equipped.filter((id) => id !== sk.id)
          // Replacing the oldest slot keeps a swap to one tap; dropping a
          // skill first and then picking one would be two.
          : [...equipped.slice(equipped.length >= LOADOUT_SIZE ? 1 : 0), sk.id];
        if (!next.length) { this.ctx.audio.play('deny'); return; }
        this.profile.setLoadout(charId, next);
        this.refresh();
      });
      grid.appendChild(btn);
    }
    describe(this.profile.loadout(charId)[0]);
    p.appendChild(grid);
    p.appendChild(detail);

    const actions = el('div', 'actions');
    actions.appendChild(this.click(el('button', 'ghost-btn', 'Reset'), () => {
      this.profile.setLoadout(charId, []);
      this.refresh();
    }));
    actions.appendChild(this.click(el('button', 'big-btn', '▶ Play'),
      () => this.ctx.startRun(cls)));
    p.appendChild(actions);
    wrap.appendChild(p);
    return wrap;
  }

  // -------------------------------------------------------------------------
  // Talents
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Quests
  // -------------------------------------------------------------------------

  /**
   * Three quests, each a row with its own progress bar. Three rather than a
   * list of five hundred because a wall of quests is not content, it is a
   * scrollbar — and this game has none anywhere.
   */
  buildQuests() {
    const wrap = el('div', 'screen');
    wrap.appendChild(this.backBar('sheet'));

    const st = this.profile.questState;
    const quests = this.profile.activeQuests();
    const ready = quests.filter((q) => q.done).length;
    const p = this.panel('Quests',
      `${st.completed} of ${QUEST_COUNT} complete · ${st.earned.toLocaleString()} gold earned`);

    const list = el('div', 'quest-list');
    for (const q of quests) {
      const row = el('div', 'quest-row' + (q.done ? ' done' : ''));
      row.appendChild(el('div', 'quest-icon', q.icon));

      const body = el('div', 'quest-body');
      const head = el('div', 'quest-head');
      head.appendChild(el('b', null, q.title));
      head.appendChild(el('span', 'quest-reward', `🪙 ${q.reward.toLocaleString()}`));
      body.appendChild(head);
      body.appendChild(el('p', 'quest-blurb', q.blurb));

      const bar = el('div', 'quest-bar');
      const fill = el('i');
      fill.style.width = `${Math.min(100, q.progress / q.goal * 100).toFixed(1)}%`;
      bar.appendChild(fill);
      body.appendChild(bar);
      // Numbers under the bar, not inside it: inside, they are unreadable at
      // the two ends of the fill, which is exactly where they matter.
      body.appendChild(el('span', 'quest-count',
        `${Math.floor(q.progress).toLocaleString()} / ${q.goal.toLocaleString()} ${q.unit}`));
      row.appendChild(body);

      const actions = el('div', 'quest-actions');
      if (q.done) {
        const claim = el('button', 'buy-btn', 'CLAIM');
        actions.appendChild(this.click(claim, () => {
          if (this.profile.claimQuest(q.index)) {
            this.ctx.audio.play('questdone');
            this.refresh();
          }
        }));
      } else {
        // Without a way out, a log deadlocks in practice: "reach wave 62"
        // sitting in a slot while your best is 20 blocks a third of the board
        // for as long as it takes to get there.
        const cost = this.profile.rerollCost(q);
        const skip = el('button', 'ghost-btn small', `Skip · 🪙${cost.toLocaleString()}`);
        skip.disabled = this.profile.souls < cost;
        actions.appendChild(this.click(skip, () => {
          if (this.profile.rerollQuest(q.index)) {
            this.ctx.audio.play('buy');
            this.refresh();
          } else {
            this.ctx.audio.play('deny');
          }
        }));
      }
      row.appendChild(actions);
      list.appendChild(row);
    }
    p.appendChild(list);

    p.appendChild(el('p', 'footnote', ready
      ? `${ready} quest${ready > 1 ? 's' : ''} ready to claim.`
      : 'Progress is banked when a run ends. Finish the run to bank it.'));

    const actions = el('div', 'actions');
    actions.appendChild(this.click(el('button', 'big-btn', '▶ Play'),
      () => this.show('classes')));
    p.appendChild(actions);
    wrap.appendChild(p);
    return wrap;
  }

  buildTalents() {
    const wrap = el('div', 'screen talents-screen');
    // The picker gets its own row rather than riding inside the back bar.
    // With a full roster it wraps, and a wrapped pill lands underneath the
    // fixed corner control — which looks placed but cannot be tapped.
    const picker = this.charPicker((id) => { this.talentChar = id; this.talentBranch = 0; },
      this.talentChar);
    wrap.appendChild(this.backBar('sheet'));
    wrap.appendChild(picker);

    const charId = this.charId(this.talentChar);
    const cls = this.profile.classOf(charId);
    const cd = this.profile.character(charId);
    const avail = this.profile.availableTalentPoints(charId);
    // Points come from levels, not from waves, and have for a while. The line
    // above this said so and the code below it still called the retired
    // wave-based function, so the header read things like "29 of 19 points" —
    // two numbers from two different systems, printed as if one contained the
    // other.
    const total = this.profile.totalTalentPoints(charId);
    const spentAll = total - avail;

    const p = this.panel(`${cls.name} Talents`,
      avail > 0
        ? `${avail} point${avail === 1 ? '' : 's'} to spend · ${spentAll} of ${total} used`
        : `All ${total} points spent · one more each level`);
    p.appendChild(this.masteryBar(charId));

    // Branch tabs. Three full columns do not fit a phone, and a tab is a
    // better fit for the trees anyway: you commit to a branch, not a row.
    const tabs = el('div', 'branch-tabs');
    cls.talents.forEach((branch, i) => {
      const spent = branch.nodes.reduce((s, n) => s + (cd.talents[n.id] || 0), 0);
      const b = el('button', 'pill' + (i === this.talentBranch ? ' active' : ''),
        `${branch.name} <b>${spent}</b>`);
      b.style.setProperty('--accent', branch.color);
      this.click(b, () => { this.talentBranch = i; this.refresh(); });
      tabs.appendChild(b);
    });
    p.appendChild(tabs);

    const branch = cls.talents[Math.min(this.talentBranch, cls.talents.length - 1)];
    const spent = branch.nodes.reduce((s, n) => s + (cd.talents[n.id] || 0), 0);
    const cols = el('div', 'talent-tree');
    cols.style.setProperty('--accent', branch.color);

    // Which four skills this class will take in. A Mastery node is worth
    // nothing unless its skill is one of them, and a player cannot be expected
    // to hold the loadout in their head while reading the tree.
    const equipped = new Set(this.profile.loadout(charId).map((s) => s.id));

    // A Classic-style tree: a fixed grid of icon cells with arrows running from
    // a node to the one it gates. The old screen was a list of six description
    // cards, which said the same things but read as a settings page — the
    // shape of a talent tree *is* the information, because seeing that a node
    // is three tiers deep is what tells you what it costs to get there.
    //
    // Cells are placed by TALENT_LAYOUT rather than flowed, so the empty
    // squares and the long arrows that span them survive on every screen size.
    const selectedId = this.talentNode && branch.nodes.some((n) => n.id === this.talentNode)
      ? this.talentNode
      : branch.nodes[0].id;

    for (let i = 0; i < branch.nodes.length; i++) {
      const node = branch.nodes[i];
      const [col, row] = TALENT_LAYOUT[i];
      const rank = cd.talents[node.id] || 0;
      const required = i * 2;
      const locked = spent < required;
      const target = node.skill ? cls.skills.find((s) => s.id === node.skill) : null;
      const inKit = target ? equipped.has(target.id) : true;

      const cell = el('div', 'tt-cell');
      cell.style.gridColumn = String(col + 1);
      cell.style.gridRow = String(row + 1);

      // The arrow into this node, drawn upward out of its own cell so it never
      // needs a grid track of its own and cannot fall out of alignment with
      // the icons it connects.
      const from = TALENT_ARROWS[i];
      if (from !== undefined) {
        const span = row - TALENT_LAYOUT[from][1];
        const arrow = el('div', 'tt-arrow' + ((cd.talents[branch.nodes[from].id] || 0) >= branch.nodes[from].max ? ' lit' : ''));
        arrow.style.setProperty('--span', String(span));
        cell.appendChild(arrow);
      }

      const btn = el('button', 'tt-node'
        + (rank >= node.max ? ' maxed' : rank ? ' has-rank' : '')
        + (locked ? ' locked' : '')
        + (node.id === selectedId ? ' selected' : '')
        + (target && !inKit ? ' unequipped' : ''));
      // A Mastery node borrows its skill's icon, so the tree and the skill bar
      // speak the same language. Everything else gets a glyph in its branch's
      // school colour.
      btn.appendChild(target
        ? skillIconElement(target, 40, { ready: true })
        : iconElement(TALENT_GLYPHS[i], 40, { ready: true, school: SCHOOLS[branch.school] || SCHOOLS.physical }));
      btn.appendChild(el('span', 'tt-pip', `${rank}/${node.max}`));
      btn.title = `${node.name} — ${node.desc}`;
      // One tap selects and reads; the detail strip below carries the spend
      // buttons. A phone has no hover, and forty-pixel plus/minus buttons on
      // every cell would double the height of the tree.
      this.click(btn, () => { this.talentNode = node.id; this.refresh(); });
      cell.appendChild(btn);
      cols.appendChild(cell);
    }
    // Tree and detail live in one wrapper so a short landscape screen can put
    // them side by side instead of stacking them into a column taller than the
    // viewport.
    const layout = el('div', 'tt-layout');
    layout.appendChild(cols);

    // The selected node, spelled out, with the only two spend buttons on the
    // screen.
    const sel = branch.nodes.find((n) => n.id === selectedId);
    const selIndex = branch.nodes.indexOf(sel);
    const selRank = cd.talents[sel.id] || 0;
    const selRequired = selIndex * 2;
    const selLocked = spent < selRequired;
    const selTarget = sel.skill ? cls.skills.find((x) => x.id === sel.skill) : null;

    const detail = el('div', 'tt-detail');
    const dhead = el('div', 'tt-detail-head');
    dhead.appendChild(el('b', null, sel.name));
    dhead.appendChild(el('span', 'tt-detail-rank', `${selRank} / ${sel.max}`));
    detail.appendChild(dhead);
    // What it does, always — locked or not.
    //
    // This is the whole complaint about the talent screen, and it was exactly
    // backwards: a locked node printed its unlock requirement *instead of* its
    // description, and the numbers below were skipped entirely. So the talents
    // you could read were the ones you had already bought, and the ones you
    // were saving eighteen points for were blank boxes.
    //
    // A locked talent is the one that most needs explaining. It is the thing
    // being decided about.
    detail.appendChild(el('p', 'tt-detail-desc', sel.desc));

    // The numbers, derived from the same effect table the game reads, so the
    // tooltip cannot drift away from what the talent does. What the points
    // already spent are worth, and what one more would add — which is the only
    // question being asked at the moment this is read.
    const lines = talentLines(sel, selRank, selTarget && selTarget.name);
    if (lines.length) {
      const table = el('div', 'tt-effects');
      for (const line of lines) {
        const row = el('div', 'tt-effect');
        row.appendChild(el('span', 'tt-effect-label', line.label));
        if (line.value) row.appendChild(el('span', 'tt-effect-value', line.value));
        table.appendChild(row);
      }
      table.firstChild.classList.add('tt-effect-first');
      // A locked node has no ranks, so "at rank 0" would be a lie dressed as a
      // number. It shows what one point buys, which is what it is for.
      detail.appendChild(el('div', 'tt-effects-head',
        selLocked || !selRank ? 'Per rank' : `At rank ${selRank}`));
      detail.appendChild(table);
    }
    if (!selLocked) {
      const gain = selRank > 0 && talentNextGain(sel, selRank, selTarget && selTarget.name);
      if (gain) detail.appendChild(el('p', 'tt-next', `Next rank → ${gain}`));
      else if (selRank >= sel.max) detail.appendChild(el('p', 'tt-next maxed', 'Maxed out.'));
    }

    // The lock, said last rather than first: it is the price, and a price only
    // means something once you know what it buys.
    //
    // How far off you are, not the threshold. "Needs 18 points" and "7 more
    // points" are different amounts of information and only one of them is
    // about the character on screen — and on one line, because two lines here
    // pushed the panel off a 320px phone.
    if (selLocked) {
      const short = selRequired - spent;
      detail.appendChild(el('p', 'tt-locked-note',
        `Locked · ${short} more point${short === 1 ? '' : 's'} in ${branch.name}`));
    }

    if (selTarget && !selLocked) {
      const tag = el('div', 'talent-skill' + (equipped.has(selTarget.id) ? '' : ' off'));
      tag.appendChild(skillIconElement(selTarget, 20));
      tag.appendChild(el('span', null, equipped.has(selTarget.id)
        ? selTarget.name
        : `${selTarget.name} — not equipped`));
      detail.appendChild(tag);
    }
    const btns = el('div', 'tt-btns');
    const minus = el('button', 'tiny-btn', '−');
    const plus = el('button', 'tiny-btn', '+');
    minus.disabled = selRank <= 0;
    plus.disabled = selLocked || selRank >= sel.max || avail <= 0;
    this.click(minus, () => {
      if ((cd.talents[sel.id] || 0) <= 0) return;
      cd.talents[sel.id]--;
      if (!cd.talents[sel.id]) delete cd.talents[sel.id];
      this.profile.save();
      this.refresh();
    });
    this.click(plus, () => {
      if (this.profile.availableTalentPoints(charId) <= 0) { this.ctx.audio.play('deny'); return; }
      cd.talents[sel.id] = (cd.talents[sel.id] || 0) + 1;
      this.profile.save();
      this.ctx.audio.play('buy');
      this.refresh();
    });
    btns.appendChild(minus);
    btns.appendChild(plus);
    detail.appendChild(btns);
    layout.appendChild(detail);
    p.appendChild(layout);

    const actions = el('div', 'actions');
    actions.appendChild(this.click(el('button', 'ghost-btn', 'Reset points'), () => {
      this.profile.respec(charId);
      this.refresh();
    }));
    actions.appendChild(this.click(el('button', 'big-btn', 'Play as ' + this.profile.character(charId).name), () => {
      this.selectedChar = charId;
      this.profile.setActive(charId);
      this.ctx.startRun(charId);
    }));
    p.appendChild(actions);
    wrap.appendChild(p);
    return wrap;
  }

  // -------------------------------------------------------------------------
  // The Forge — permanent upgrades
  // -------------------------------------------------------------------------

  buildForge() {
    const wrap = el('div', 'screen');
    const charId = this.charId();
    const cls = this.profile.classOf(charId);
    wrap.appendChild(this.backBar('sheet'));
    wrap.appendChild(this.charPicker());

    const forge = this.profile.forgeLevels(charId);
    const spent = PERMANENT.reduce((n, d) => n + (forge[d.id] || 0), 0);
    const total = PERMANENT.reduce((n, d) => n + d.max, 0);
    const p = this.panel(`${cls.name} — The Forge`,
      `${spent} of ${total} levels · bought with gold, kept by this class alone`);

    const grid = el('div', 'forge-grid');
    p.appendChild(this.paged('forge', PERMANENT, byHeight(3, 4, 10), grid, (def) => {
      const level = forge[def.id] || 0;
      const maxed = level >= def.max;
      const cost = upgradeCost(def, level);
      const afford = this.profile.souls >= cost;
      const card = el('div', 'forge-card' + (maxed ? ' maxed' : '') + (!afford && !maxed ? ' poor' : ''));
      card.innerHTML = `
        <div class="forge-icon">${def.icon}</div>
        <div class="forge-body">
          <div class="forge-name">${def.name} <span class="dim">${level}/${def.max}</span></div>
          <div class="forge-desc">${def.desc}</div>
          <div class="forge-pips">${Array.from({ length: def.max }, (_, i) =>
            `<i class="${i < level ? 'on' : ''}"></i>`).join('')}</div>
        </div>`;
      const buy = el('button', 'buy-btn', maxed ? 'MAX' : `🪙 ${cost}`);
      buy.disabled = maxed || !afford;
      this.click(buy, () => {
        const lv = forge[def.id] || 0;
        if (lv >= def.max) return;
        const c = upgradeCost(def, lv);
        if (this.profile.souls < c) { this.ctx.audio.play('deny'); return; }
        this.profile.souls -= c;
        forge[def.id] = lv + 1;
        this.profile.save();
        this.ctx.audio.play('buy');
        this.refresh();
      });
      card.appendChild(buy);
      return card;
    }));
    wrap.appendChild(p);
    return wrap;
  }

  // -------------------------------------------------------------------------
  // The Potion Shop
  // -------------------------------------------------------------------------

  /**
   * Buy the same three potions the arena drops, for gold, and carry them in.
   *
   * Four of the nine classes have no heal of their own, and the drip of
   * dropped potions is the whole of their sustain — which makes surviving a
   * bad wave partly a question of what the floor happened to give you. A
   * stocked belt is the answer to that: it does not make you stronger, it
   * makes the answer available at the moment you need it rather than wherever
   * it happened to fall.
   *
   * Per class, like the gear and the Forge, and for the same reason. The price
   * follows the class's level so it stays a real cost at 60 rather than the
   * rounding error a flat price would become.
   */
  /** The POTION SHOP tile's hint: what this class is carrying right now. */
  potionHint(classId) {
    const cls = classId || (CLASSES[0] && CLASSES[0].id);
    const n = POTIONS.reduce((s, d) => s + this.profile.potionCount(cls, d.id), 0);
    if (!n) return 'Stock up before a run';
    return `Carrying ${n} of ${POTIONS.length * POTION_STACK}`;
  }

  buildPotionShop() {
    const wrap = el('div', 'screen');
    const charId = this.charId();
    const cls = this.profile.classOf(charId);
    wrap.appendChild(this.backBar('sheet'));
    wrap.appendChild(this.charPicker());

    const level = this.profile.level(charId);
    const carried = POTIONS.reduce((n, d) => n + this.profile.potionCount(charId, d.id), 0);
    const p = this.panel(`${cls.name} — Potion Shop`,
      `Level ${level} prices · carrying ${carried} of ${POTIONS.length * POTION_STACK}`);

    const grid = el('div', 'potion-grid');
    for (const def of POTIONS) {
      const held = this.profile.potionCount(charId, def.id);
      const cost = this.profile.potionPriceFor(charId, def.id);
      const full = held >= POTION_STACK;
      const afford = this.profile.souls >= cost;

      const card = el('div', 'potion-card' + (full ? ' full' : '') + (!afford && !full ? ' poor' : ''));
      card.style.setProperty('--vial', def.color);
      card.style.setProperty('--vial-glow', def.glow);

      // The same round glass the belt draws, so the thing you buy and the
      // thing you tap mid-fight are recognisably one object.
      const vial = el('div', 'potion-vial');
      vial.appendChild(el('i', 'potion-shine'));
      card.appendChild(vial);

      const body = el('div', 'potion-body');
      body.appendChild(el('div', 'potion-name', def.name));
      body.appendChild(el('div', 'potion-desc', def.blurb));
      const pips = el('div', 'potion-pips');
      for (let i = 0; i < POTION_STACK; i++) pips.appendChild(el('i', i < held ? 'on' : null));
      body.appendChild(pips);
      body.appendChild(el('div', 'potion-held', `${held} / ${POTION_STACK} carried`));
      card.appendChild(body);

      const buy = el('button', 'buy-btn', full ? 'FULL' : `🪙 ${cost}`);
      buy.disabled = full || !afford;
      this.click(buy, () => {
        const res = this.profile.buyPotion(charId, def.id);
        this.ctx.audio.play(res.ok ? 'buy' : 'deny');
        this.refresh();
      });
      card.appendChild(buy);
      grid.appendChild(card);
    }
    p.appendChild(grid);
    p.appendChild(el('p', 'shop-note',
      'Drink with the round icons in the top-left corner, or the 5, 6 and 7 keys. '
      + 'What you drink is gone — the rack is not refilled between runs.'));
    wrap.appendChild(p);
    return wrap;
  }

  // -------------------------------------------------------------------------
  // Raids
  // -------------------------------------------------------------------------

  /**
   * The RAID button's hint. The number leads and the raid's name follows: on a
   * narrow phone the hint is clipped to one line, and the half worth keeping is
   * the half that changes. "Craftcrown Citadel · 5 of 6" truncates to the name of
   * a place; "5 of 6 · Craftcrown Ci…" truncates to the answer.
   */
  raidHint(classId) {
    const st = this.profile.raidState(classId);
    const gear = this.profile.gear(classId);
    const raid = RAIDS.find((r) => !isRaidCleared(st, r));
    if (!raid) return 'All 42 bosses down';

    const access = raidAccess(raid, {
      level: this.profile.level(classId), raidState: st, gear,
    });
    if (!access.ok) {
      // The first *uncleared* raid always has a cleared predecessor, so only
      // two of raidAccess's three gates can be the one that is shut here.
      const prev = RAID_BY_TIER[raid.tier - 1];
      const short = prev
        ? CORE_ORDER.filter((sl) => ownedTier(gear, sl) < prev.tier).length
        : 0;
      return short
        ? `${short} piece${short > 1 ? 's' : ''} short · ${raid.name}`
        : `Level ${raid.level} · ${raid.name}`;
    }
    const down = bossesDown(st, raid);
    return down ? `${down} of 6 · ${raid.name}` : `${raid.name} is open`;
  }

  buildRaids() {
    const wrap = el('div', 'screen');
    const charId = this.charId();
    const cls = this.profile.classOf(charId);
    // Progress is per class, so — like the Forge, the Armoury and the talent
    // tree — the screen leads with whose progress you are reading.
    wrap.appendChild(this.backBar('title'));
    wrap.appendChild(this.charPicker());

    const st = this.profile.raidState(charId);
    const level = this.profile.level(charId);
    const gear = this.profile.gear(charId);
    const total = RAIDS.reduce((n, r) => n + bossesDown(st, r), 0);
    const p = this.panel('Raids', `${cls.name} · ${total} of 42 bosses down`);

    const list = el('div', 'raid-list');
    // Open on the page holding the raid you are actually running, not page
    // one. From the fourth raid on, a list that always starts at the top makes
    // the player page past cleared content every single time.
    const perPage = byHeight(3, 4, 7);
    const current = RAIDS.findIndex((r) => !isRaidCleared(st, r));
    if (this.pages.raids === undefined && current >= 0) {
      this.pages.raids = Math.floor(current / perPage);
    }
    p.appendChild(this.paged('raids', RAIDS, perPage, list, (raid) => {
      const down = bossesDown(st, raid);
      const cleared = down === raid.bosses.length;
      const access = raidAccess(raid, { level, raidState: st, gear });
      const isNext = !cleared && access.ok && raid === RAIDS[current];

      const row = el('button', 'forge-card raid-row' + (isNext ? ' next' : ''));
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
        // Not a tooltip and not a grey box. The sentence raidAccess already
        // wrote, at full contrast, in the colour this game uses everywhere
        // else for the thing that is stopping you.
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

    // One tap from the title to the fight, for a player who already knows
    // where they are. Only when there is a fight: a blue primary button
    // labelled with a raid you cannot enter is a lie the rows underneath it
    // have already contradicted, and it is worse than no button. Once
    // everything is down there is nothing to point at either.
    const go = RAIDS[current];
    const canGo = go && raidAccess(go, { level, raidState: st, gear }).ok;
    if (go && canGo) {
      const actions = el('div', 'actions');
      actions.appendChild(this.click(el('button', 'big-btn', `▶ ${go.name.toUpperCase()}`),
        () => { this.raidId = go.id; this.show('raid'); }));
      p.appendChild(actions);
    } else {
      p.appendChild(el('p', 'footnote', go
        ? `${go.name} is the next one open to ${cls.name}. Tap it to see what it drops.`
        : `Every raid cleared on ${cls.name}. Progress is per class — another one starts over.`));
    }
    wrap.appendChild(p);
    return wrap;
  }

  buildRaid() {
    const raid = RAID_BY_ID[this.raidId] || RAIDS[0];
    const charId = this.charId();
    const cls = this.profile.classOf(charId);
    const st = this.profile.raidState(charId);
    const gear = this.profile.gear(charId);
    const level = this.profile.level(charId);
    const access = raidAccess(raid, { level, raidState: st, gear });
    const next = nextBoss(st, raid);
    const down = bossesDown(st, raid);
    const pay = bossGold(raid, 0, gearCost(raid.tier));

    const wrap = el('div', 'screen');
    wrap.appendChild(this.backBar('raids'));
    // No class picker here. It is one screen deep from the one that has it,
    // and switching class mid-list would be a different raid as well as a
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
      ? 'Six bosses, each pays half a piece. A full clear funds half the set it unlocks; the rest comes from the arena.'
      : `${raid.name} is cleared on ${cls.name}. Every T${raid.tier} Core is yours.`));

    const actions = el('div', 'actions');
    if (!access.ok) {
      // A locked screen whose primary button goes to the place that unlocks
      // it. "Requires level 51" and then nothing to press is a dead end; the
      // level gate sends you to the arena and the set gate to the Armoury,
      // which are the two things that actually move the number.
      actions.appendChild(el('span', 'raid-need', access.reason));
      const byLevel = /level/i.test(access.reason);
      actions.appendChild(this.click(el('button', 'big-btn', byLevel ? '▶ ARENA' : '🛡 ARMOURY'),
        () => this.show(byLevel ? 'classes' : 'armoury')));
    } else if (next) {
      actions.appendChild(this.click(
        el('button', 'big-btn', `▶ FIGHT ${next.name.toUpperCase()}`),
        () => this.ctx.startRaid(cls, raid)));
    } else {
      actions.appendChild(this.click(el('button', 'big-btn', '🛡 ARMOURY'),
        () => this.show('armoury')));
    }
    p.appendChild(actions);
    wrap.appendChild(p);
    return wrap;
  }

  /**
   * One window, two outcomes. A kill and a wipe are the same decision in the
   * same place with the same geometry — the thumb lands where it landed last
   * time whichever way the fight went, and the game does not need two layouts
   * to say two things.
   */
  buildRaidGate(outcome) {
    const g = this.ctx.game;
    const raid = g.raid;
    const cls = g.cls;
    // The running character, not the selected one. This screen only exists
    // mid-raid, and the roster pill could have moved on since it started.
    const charId = g.charId;
    const st = this.profile.raidState(charId);
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
    // phone to reach; the gap is there so an overshoot lands on nothing rather
    // than on the other button. Neither is destructive — the Core and the gold
    // were written to the save the instant the boss died, before this window
    // was built, so "stop here" is literally true.
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

  gateRows(outcome, raid, boss, next, st) {
    const pay = bossGold(raid, 0, gearCost(raid.tier));
    const slot = GEAR_BY_ID[coreSlotFor(raid.bosses.indexOf(boss))];
    if (outcome === 'kill') {
      const rows = [
        { icon: slot.icon, label: coreName(raid.tier, slot.id), need: 'unlocked' },
        { icon: '🪙', label: 'Gold', need: `+${pay.toLocaleString()}` },
      ];
      rows.push(next
        ? {
          icon: GEAR_BY_ID[coreSlotFor(next.index)].icon,
          label: `Next · ${next.name}`, need: MECHANICS[next.mechanic].name,
        }
        : { icon: '🛡', label: `T${raid.tier} gear`, need: 'buyable now' });
      return rows;
    }
    return [
      { icon: '🛡', label: 'Your Cores', need: `${bossesDown(st, raid)} of 6 kept` },
      { icon: '↻', label: boss.name, need: 'back to full' },
      { icon: '🪙', label: 'This attempt cost', need: 'nothing' },
    ];
  }

  // -------------------------------------------------------------------------
  // The Armoury — six slots, seven tiers, per class
  // -------------------------------------------------------------------------

  /**
   * The set you are wearing, and the two rungs above it.
   *
   * The Armoury never showed this at all. Six slots each said what they grant,
   * and the bonuses for wearing two, four and six pieces of the same tier —
   * the reason to complete a set rather than to buy whatever is cheapest —
   * existed only in the code. A player could complete a full Frostwrought set
   * and never once be told what it did.
   *
   * Every threshold is listed whether or not it is met, because the ones you
   * have not reached are the argument for the next purchase. The numbers are
   * the real ones, scaled by the tier, so "+10% melee damage" on a Battleworn
   * set and "+40%" on a Frostwrought one are visibly the same bonus grown up.
   */
  setPanel(cls, gear, charId) {
    const box = el('div', 'set-panel');
    const set = activeSet(gear);
    if (!set) {
      box.appendChild(el('div', 'set-panel-head', 'Set bonuses'));
      box.appendChild(el('p', 'note',
        'Wear two pieces of the same tier to start earning them. '
        + 'Four unlocks a bonus that empowers one of your skills, and six is the whole set.'));
      return box;
    }

    const table = SET_BONUSES[cls.id] || SET_BONUSES.warrior;
    const k = setScale(set.tier);
    const head = el('div', 'set-panel-head');
    head.appendChild(el('b', null, `${GEAR_TIERS[set.tier].name} set`));
    head.appendChild(el('span', 'set-panel-count', `${set.pieces} of 6 pieces`));
    box.appendChild(head);

    const equipped = new Set(this.profile.loadout(charId).map((s) => s.id || s));
    for (const th of SET_THRESHOLDS) {
      const on = set.pieces >= th;
      const row = el('div', 'set-row' + (on ? ' on' : ''));
      row.appendChild(el('span', 'set-row-n', `${th}`));
      const body = el('span', 'set-row-body');
      // Generated from the effect at this tier, not the table's hand-written
      // sentence. The table is written at T0 and every tier multiplies it, so
      // printing the sentence verbatim would tell a player in a full T6 set
      // the numbers from the set they wore at level 1.
      body.appendChild(el('span', null, setBonusLine(table[th].effect, k) || table[th].desc));
      // The four-piece carries the skill half as well.
      if (th === SKILL_SET_THRESHOLD) {
        const sb = tierSkillBonus(cls.id, set.tier);
        const skill = sb && cls.skills.find((s) => s.id === sb.skill);
        if (skill) {
          const line = el('span', 'set-row-skill'
            + (equipped.has(skill.id) ? '' : ' off'));
          line.textContent = tierSkillDesc(cls.id, set.tier, skill.name)
            + (equipped.has(skill.id) ? '' : `  — ${skill.name} is not equipped`);
          body.appendChild(line);
        }
      }
      row.appendChild(body);
      box.appendChild(row);
    }
    return box;
  }

  buildArmoury() {
    const wrap = el('div', 'screen');
    const charId = this.charId();
    const cls = this.profile.classOf(charId);
    // Gear is per class, so — like the Forge and the talent tree — the screen
    // leads with whose kit you are looking at. Shared gold, separate gear.
    wrap.appendChild(this.backBar('sheet'));
    wrap.appendChild(this.charPicker());

    const gear = this.profile.gear(charId);
    const level = this.profile.level(charId);
    const cores = this.profile.cores(charId);
    const rating = gearRating(gear);
    const set = setTier(gear);
    const cap = maxTierForLevel(level);
    const sub = set >= 0
      ? `Level ${level} · full T${set} set · ${rating} of 42 pieces`
      : `Level ${level} · ${rating} of 42 pieces`;
    const p = this.panel(`${cls.name} — Armoury`, sub);

    // What the level currently allows, and what the next level-gate is. Without
    // this the player sees "T3 unlocks at level 31" on six separate rows and
    // has to work out the pattern for themselves.
    const bar = el('div', 'set-bar');
    bar.appendChild(el('span', 'set-chip on',
      cap >= MAX_TIER ? '✓ every tier unlocked' : `Buyable up to T${cap}`));
    if (cap < MAX_TIER) {
      const nxt = GEAR_TIERS[cap + 1];
      bar.appendChild(el('span', 'set-chip',
        `T${nxt.tier} ${nxt.name} at level ${nxt.level} — ${nxt.raid}`));
    }
    p.appendChild(bar);
    p.appendChild(this.setPanel(cls, gear, charId));

    const grid = el('div', 'forge-grid');
    p.appendChild(this.paged('armoury', GEAR_SLOTS, byHeight(3, 4, 6), grid, (def) => {
      const tier = ownedTier(gear, def.id);
      const verdict = canBuy(cls.id, def.id, gear, level, this.profile.souls, cores);
      // Which boss drops the piece you cannot buy yet. "Needs the T2 Helm Core"
      // is only half an answer; the other half is where to go and get it.
      const from = verdict.needsCore ? RAID_BY_TIER[verdict.next] : null;
      const dropper = from ? from.bosses[GEAR_SLOT_IDS.indexOf(def.id)] : null;
      const colour = tierColor(Math.max(0, tier));
      const card = el('div', 'forge-card'
        + (verdict.maxed ? ' maxed' : '')
        + (verdict.poor ? ' poor' : '')
        + (verdict.locked ? ' locked' : ''));
      // The tier's colour is the whole read on this screen: six rows, and the
      // one that is still grey is the one to buy next.
      card.style.setProperty('--quality', tier < 0 ? '#5a6172' : colour);
      const icon = el('div', 'forge-icon');
      icon.appendChild(iconElement(def.icon, 34, { school: SCHOOLS[def.school] }));
      card.appendChild(icon);
      const body = el('div', 'forge-body');
      body.innerHTML = `
        <div class="forge-name">${gearName(def.id, tier)}
          ${tier >= 0 ? `<span class="quality-tag">T${tier}</span>` : ''}</div>
        <div class="forge-desc">${tier >= 0
          ? slotSummary(cls.id, def.id, gear)
          : slotDesc(cls.id, def.id)}</div>
        ${dropper ? `<div class="raid-need">Drops from ${dropper.name} — ${from.name}</div>` : ''}
        <div class="forge-pips">${GEAR_TIERS.map((t) =>
          `<i class="${t.tier <= tier ? 'on' : ''}"></i>`).join('')}</div>`;
      card.appendChild(body);
      const buy = el('button', 'buy-btn', verdict.maxed
        ? 'MAX'
        : (verdict.locked ? `Lv ${tierLevel(verdict.next)}`
          : (verdict.needsCore ? '🔒 Core' : `🪙 ${verdict.cost.toLocaleString()}`)));
      buy.disabled = !verdict.ok;
      // The reason a disabled button is disabled belongs on the button, not in
      // the player's head.
      if (!verdict.ok && !verdict.maxed) buy.title = verdict.reason;
      this.click(buy, () => {
        const done = this.profile.buyGear(charId, def.id);
        if (!done.ok) { this.ctx.audio.play('deny'); return; }
        this.ctx.audio.play('buy');
        this.refresh();
      });
      card.appendChild(buy);
      return card;
    }));
    wrap.appendChild(p);
    return wrap;
  }

  // -------------------------------------------------------------------------
  // Stats / settings / how-to
  // -------------------------------------------------------------------------

  buildStats() {
    const wrap = el('div', 'screen');
    wrap.appendChild(this.backBar('options'));
    const s = this.profile.data.stats;
    const p = this.panel('Records');
    const grid = el('div', 'stat-grid');
    const rows = [
      ['Best wave', s.bestWave],
      ['Total runs', s.runs],
      ['Total kills', s.kills.toLocaleString()],
      ['Gold earned', this.profile.data.lifetimeSouls.toLocaleString()],
      ['Time played', fmtTime(s.timePlayed)],
    ];
    for (const [k, v] of rows) {
      const d = el('div', 'stat-cell');
      d.innerHTML = `<b>${v}</b><span>${k}</span>`;
      grid.appendChild(d);
    }
    p.appendChild(grid);

    // Paged rather than a single column: a full roster is more rows than a
    // 568px-tall phone has room for, and this screen has no scrollbar.
    const table = el('div', 'class-stats');
    this.paged('stats:classes', this.profile.characters, byHeight(4, 6, 9), table, (cd) => {
      const c = this.profile.classOf(cd.id);
      const row = el('div', 'cs-row');
      row.innerHTML = `
        <span class="cs-name" style="color:${c.color}">${cd.name}</span>
        <span>Lv ${this.profile.level(cd.id)}</span>
        <span>wave ${cd.bestWave}</span>
        <span>${cd.kills} kills</span>
        <span>mastery ${this.profile.masteryRank(cd.id)}</span>
        <span>${this.profile.availableTalentPoints(cd.id)} pts</span>`;
      return row;
    });
    p.appendChild(table);

    const danger = el('div', 'actions');
    danger.appendChild(this.click(el('button', 'ghost-btn danger', 'Erase all progress'), () => {
      if (confirm('Erase every unlock, talent and soul? This cannot be undone.')) {
        this.profile.reset();
        this.show('title');
      }
    }));
    p.appendChild(danger);
    wrap.appendChild(p);
    return wrap;
  }

  buildSettings() {
    const wrap = el('div', 'screen');
    wrap.appendChild(this.backBar(this.ctx.game.running ? 'pause' : 'title'));
    const st = this.profile.settings;
    const p = this.panel('Settings');
    const list = el('div', 'settings-list');

    const slider = (label, key, min, max, step, fmt) => {
      const row = el('div', 'setting');
      row.innerHTML = `<label>${label}<b>${fmt(st[key])}</b></label>`;
      const input = el('input');
      input.type = 'range';
      input.min = min; input.max = max; input.step = step; input.value = st[key];
      input.addEventListener('input', () => {
        st[key] = parseFloat(input.value);
        row.querySelector('b').textContent = fmt(st[key]);
        this.ctx.onSettingsChanged();
      });
      input.addEventListener('change', () => this.profile.save());
      row.appendChild(input);
      return row;
    };

    const toggle = (label, key, hint) => {
      const row = el('div', 'setting toggle');
      const btn = el('button', 'switch' + (st[key] ? ' on' : ''), st[key] ? 'ON' : 'OFF');
      row.innerHTML = `<label>${label}${hint ? `<span class="hint">${hint}</span>` : ''}</label>`;
      this.click(btn, () => {
        st[key] = !st[key];
        this.profile.save();
        this.ctx.onSettingsChanged();
        this.refresh();
      });
      row.appendChild(btn);
      return row;
    };

    const rows = [
      () => slider('Mouse sensitivity', 'sensitivity', 0.2, 3, 0.05, (v) => v.toFixed(2) + 'x'),
      () => slider('Touch sensitivity', 'touchSensitivity', 0.2, 3, 0.05, (v) => v.toFixed(2) + 'x'),
      () => slider('Field of view', 'fov', 60, 100, 1, (v) => Math.round(v) + '°'),
      () => slider('Render scale', 'renderScale', 0.5, 1, 0.05, (v) => Math.round(v * 100) + '%'),
      () => slider('Sound volume', 'sfxVolume', 0, 1, 0.05, (v) => Math.round(v * 100) + '%'),
      () => slider('Music volume', 'musicVolume', 0, 1, 0.05, (v) => Math.round(v * 100) + '%'),
      () => toggle('Invert look Y', 'invertY'),
      () => toggle('Damage numbers', 'showDamage'),
      () => toggle('Left-handed layout', 'leftHanded', 'Swaps the stick and the buttons'),
      () => toggle('Hold to attack', 'autoAttack', 'Keep swinging while you hold the view'),
      () => toggle('Aim assist', 'aimAssist', 'Eases your aim onto what it is already near'),
      () => toggle('Fancy graphics', 'fancyGraphics', 'Sky, shadows and debris; turn off for frame rate'),
      () => toggle('Fullscreen on play', 'fullscreenOnPlay', 'Go fullscreen when a run starts'),
      () => this.fullscreenRow(),
    ].filter(Boolean);

    p.appendChild(this.paged('settings', rows, byHeight(4, 7, 13), list, (make) => make()));
    wrap.appendChild(p);
    return wrap;
  }

  /**
   * A full-width fullscreen control. The 44px corner button is easy to miss
   * and impossible to find at all once a run is under way, and inside a frame
   * that refuses fullscreen the honest answer is a link to a real tab.
   */
  fullscreenRow() {
    const fs = this.ctx.fullscreen || {};
    const row = el('div', 'setting toggle');
    if (fs.usable) {
      const on = fs.isOn();
      row.innerHTML = `<label>Fullscreen<span class="hint">${on ? 'Currently fullscreen' : 'Fill the whole screen'}</span></label>`;
      const btn = el('button', 'switch' + (on ? ' on' : ''), on ? 'ON' : 'OFF');
      this.click(btn, () => { fs.toggle(); setTimeout(() => this.refresh(), 120); });
      row.appendChild(btn);
    } else {
      row.innerHTML = `<label>Fullscreen<span class="hint">This embed will not allow it — open the game in its own tab</span></label>`;
      const link = el('a', 'ghost-btn', 'Open ⇱');
      link.href = location.href;
      link.target = '_blank';
      link.rel = 'noopener';
      row.appendChild(link);
    }
    return row;
  }

  buildHowTo() {
    const wrap = el('div', 'screen');
    wrap.appendChild(this.backBar('options'));
    const p = this.panel('How to play');
    const cols = [
      `<h3>Phone</h3><ul>
        <li><b>Left half</b> — drag to move; the stick appears under your thumb</li>
        <li><b>Right half</b> — drag to look, tap to swing</li>
        <li><b>Touch the view</b> to attack — tap to swing, hold to keep swinging</li>
        <li><b>⤒</b> jump · push the stick to the rim to sprint</li>
        <li><b>Bottom centre</b> — your four skills, with cooldown rings</li>
      </ul>`,
      `<h3>Keyboard & mouse</h3><ul>
        <li><b>WASD</b> move · <b>Space</b> jump · <b>Shift</b> sprint</li>
        <li><b>Mouse</b> look · <b>Left click</b> attack</li>
        <li><b>1 2 3 4</b> (or Q E R F) — skills</li>
        <li><b>Esc</b> — pause</li>
      </ul>`,
      `<h3>Controller</h3><ul>
        <li><b>Left stick</b> move · <b>Right stick</b> look</li>
        <li><b>A</b> jump · <b>X</b> or <b>RT</b> attack · <b>L3/LT</b> sprint</li>
        <li><b>LB RB Y B</b> — skills 1–4</li>
        <li>Plug in and press anything; it takes over automatically.</li>
      </ul>`,
      `<h3>The loop</h3><ul>
        <li>Waves never stop. Every 5th wave is a boss.</li>
        <li>Clear a wave, pick <b>one of three upgrades</b> for this run.</li>
        <li>Dying banks <b>Gold</b> — spend them in the <b>Forge</b>, <b>Armoury</b> and on quest skips.</li>
        <li>Deeper waves grant <b>talent points</b> and <b>mastery</b> for that class.</li>
        <li>Each class has <b>eight skills</b>; four are equipped at a time.</li>
      </ul>`,
    ];
    const box = el('div', 'howto');
    p.appendChild(this.paged('howto', cols, byHeight(1, 2, 4), box,
      (html) => el('div', 'howto-col', html)));
    wrap.appendChild(p);
    return wrap;
  }

  /**
   * Everything needed to diagnose "it doesn't work" from a single screenshot,
   * plus a live touch pad. If the dot does not follow a finger, the device is
   * not delivering pointer moves and nothing else matters.
   */
  buildDiagnostics() {
    const wrap = el('div', 'screen');
    wrap.appendChild(this.backBar('options'));
    const p = this.panel('Diagnostics',
      'Drag inside the box below, then screenshot this whole screen and send it.');

    const pad = el('div', 'diag-pad', '<span class="diag-dot"></span><em>drag here</em>');
    const dot = pad.querySelector('.diag-dot');
    const counts = { down: 0, move: 0, up: 0, cancel: 0 };
    let last = '—';
    const onPad = (kind) => (e) => {
      e.preventDefault();
      counts[kind]++;
      const r = pad.getBoundingClientRect();
      const x = (e.clientX ?? 0) - r.left;
      const y = (e.clientY ?? 0) - r.top;
      last = `${e.pointerType || 'n/a'} ${Math.round(x)},${Math.round(y)}`;
      dot.style.transform = `translate(${x}px, ${y}px)`;
      refresh();
    };
    pad.addEventListener('pointerdown', onPad('down'), { passive: false });
    pad.addEventListener('pointermove', onPad('move'), { passive: false });
    pad.addEventListener('pointerup', onPad('up'), { passive: false });
    pad.addEventListener('pointercancel', onPad('cancel'), { passive: false });
    p.appendChild(pad);

    const out = el('div', 'diag-table');
    p.appendChild(out);

    const gl = this.ctx.game.r.gl;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const view = document.getElementById('view');

    const refresh = () => {
      const rows = [
        ['Pointer events', `down ${counts.down} · move ${counts.move} · up ${counts.up} · cancel ${counts.cancel}`],
        ['Last pointer', last],
        ['Touch device', ('ontouchstart' in window) + ' / maxTouchPoints ' + navigator.maxTouchPoints],
        ['Window', `${window.innerWidth} x ${window.innerHeight}`],
        ['Canvas CSS', `${view.clientWidth} x ${view.clientHeight}`],
        ['Canvas buffer', `${view.width} x ${view.height}`],
        ['Device pixel ratio', String(window.devicePixelRatio)],
        ['In iframe', String(window.self !== window.top)],
        ['Fullscreen allowed', String(document.fullscreenEnabled)],
        ['WebGL renderer', dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'hidden'],
        ['Game running', String(this.ctx.game.running)],
        ['Build', this.ctx.build || 'dev'],
        ['Storage', storage.available() ? 'available' : 'BLOCKED (progress will not save)'],
        ['Last error', window.__craftarenaError || 'none'],
      ];
      const perPage = byHeight(5, 8, 16);
      const pageCount = Math.max(1, Math.ceil(rows.length / perPage));
      const page = Math.min(this.pages.diagRows || 0, pageCount - 1);
      out.innerHTML = rows
        .slice(page * perPage, page * perPage + perPage)
        .map(([k, v]) => `<div class="diag-row"><span>${k}</span><b>${v}</b></div>`)
        .join('')
        + (pageCount > 1 ? `<div class="diag-row dim"><span>page</span><b>${page + 1} / ${pageCount}</b></div>` : '');
      nextBtn.classList.toggle('hidden', pageCount <= 1);
      this.pages.diagRows = page;
      this.diagPages = pageCount;
    };
    const nextBtn = this.click(el('button', 'ghost-btn wide', 'More readings ›'), () => {
      this.pages.diagRows = ((this.pages.diagRows || 0) + 1) % (this.diagPages || 1);
      refresh();
    });
    p.appendChild(nextBtn);
    refresh();
    this.diagTimer = setInterval(() => {
      if (this.screen !== 'diag') { clearInterval(this.diagTimer); return; }
      refresh();
    }, 500);

    wrap.appendChild(p);
    return wrap;
  }

  // -------------------------------------------------------------------------
  // In-run overlays
  // -------------------------------------------------------------------------

  buildPause() {
    const wrap = el('div', 'screen overlay');
    const p = this.panel('Paused', `Wave ${this.ctx.game.wave} · ${Math.round(this.ctx.game.soulsEarned)} gold this run`);
    const menu = el('div', 'main-menu');
    menu.appendChild(this.click(el('button', 'menu-btn primary', '<span class="menu-label">RESUME</span>'),
      () => this.ctx.resumeRun()));
    menu.appendChild(this.click(el('button', 'menu-btn', '<span class="menu-label">SETTINGS</span>'),
      () => this.show('settings')));
    menu.appendChild(this.click(el('button', 'menu-btn', '<span class="menu-label">ABANDON RUN</span><span class="menu-hint">Bank your gold and return to the menu</span>'),
      () => this.ctx.quitRun()));
    p.appendChild(menu);

    const g = this.ctx.game;
    if (g.player) {
      // Your four skills, and what they do. Mid-run is exactly when a player
      // wants to check what a skill they picked three waves ago actually does,
      // and until now the only place that text existed was the loadout screen,
      // which you cannot reach without abandoning the run.
      const list = el('div', 'run-build');
      const chips = el('div', 'kit-icons');
      const detail = el('div', 'kit-detail');
      const describe = (sk, i) => {
        const rank = g.player.rankOf(i);
        detail.innerHTML = `<b>${sk.name}</b>`
          + `<span class="kit-rank">rank ${rank}</span>`
          + `<p>${sk.desc}</p>`
          + `<i>${Math.round(skillCost(g.player, sk))} ${g.cls.resource.name}`
          + ` · ${skillCooldown(g.player, sk, rank).toFixed(1)}s</i>`;
        for (const el2 of chips.children) el2.classList.remove('on');
        chips.children[i].classList.add('on');
      };
      g.player.skills.forEach((sk, i) => {
        const slot = el('button', 'kit-icon rank');
        slot.appendChild(skillIconElement(sk, 34));
        slot.appendChild(el('span', 'rank-pip', String(g.player.rankOf(i))));
        slot.title = `${sk.name} — rank ${g.player.rankOf(i)}`;
        this.click(slot, () => describe(sk, i));
        chips.appendChild(slot);
      });
      list.appendChild(chips);
      list.appendChild(detail);
      p.appendChild(list);
      if (g.player.skills.length) describe(g.player.skills[0], 0);
    }

    // The HUD chips say which rules are running; this is the one place with
    // room to say what to do about them. Pausing to check is the intended use.
    if (g.affixes && g.affixes.length) {
      const box = el('div', 'affix-list');
      for (const a of g.affixes) {
        const row = el('div', 'affix-row');
        row.style.borderLeftColor = a.color;
        row.appendChild(el('span', 'affix-icon', a.icon));
        const text = el('div', 'affix-text');
        text.appendChild(el('b', null, a.name));
        text.appendChild(el('span', null, a.blurb));
        text.appendChild(el('em', null, a.counter));
        row.appendChild(text);
        box.appendChild(row);
      }
      p.appendChild(box);
    }
    wrap.appendChild(p);
    return wrap;
  }

  buildUpgradeCards() {
    const g = this.ctx.game;
    const wrap = el('div', 'screen overlay');
    const p = this.panel(`Wave ${g.wave} cleared`, 'Rank up a skill');
    const row = el('div', 'rank-row');
    for (const up of g.pendingUpgrades) {
      const card = el('button', 'rank-card');
      card.appendChild(skillIconElement(up.skill, 54));
      const body = el('div', 'rank-body');
      body.innerHTML = `<div class="rank-name">${up.skill.name}</div>`
        + `<div class="rank-step">rank ${up.rank} → <b>${up.rank + 1}</b></div>`
        + `<div class="rank-gain">+22% power · −4% cooldown</div>`;
      card.appendChild(body);
      this.click(card, () => {
        g.chooseUpgrade(up);
        this.ctx.resumeRun();
      });
      row.appendChild(card);
    }
    p.appendChild(row);
    wrap.appendChild(p);
    return wrap;
  }

  buildResults() {
    const g = this.ctx.game;
    const res = g.result;
    const wrap = el('div', 'screen overlay');
    const p = this.panel(`Wave ${res.reachedWave}`,
      `${g.cls.name} · ${res.kills} kills · ${fmtTime(res.duration)}`);

    const grid = el('div', 'stat-grid');
    const cd = this.profile.character(g.charId);
    const rows = [
      ['Gold', '🪙 ' + res.souls],
      ['Experience', '+' + (res.xp || 0).toLocaleString()],
      ['Best streak', g.comboBest || 0],
      ['Class best', 'wave ' + cd.bestWave],
    ];
    for (const [k, v] of rows) {
      const d = el('div', 'stat-cell');
      d.innerHTML = `<b>${v}</b><span>${k}</span>`;
      grid.appendChild(d);
    }
    p.appendChild(grid);

    // Where the class stands *now*, not where it stood before — the XP is
    // already banked by the time this screen is built, and "where am I" is the
    // question a player actually has at the end of a run.
    const lvl = el('div', 'results-level');
    const ups = res.levelUps || [];
    if (ups.length) {
      lvl.appendChild(el('div', 'level-up', ups.length === 1
        ? `⬆ LEVEL ${ups[0]}`
        : `⬆ LEVEL ${ups[ups.length - 1]} · ${ups.length} levels gained`));
    }
    lvl.innerHTML += this.levelBarHtml(g.charId);
    p.appendChild(lvl);

    // What you are closest to. A results screen that only reports the past
    // gives no reason to press Play again; naming the nearest three things
    // and how far off they are gives three.
    const goals = this.nextGoals(g);
    if (goals.length) {
      const box = el('div', 'goals');
      for (const goal of goals) {
        const row = el('div', 'goal');
        row.innerHTML = `<span class="goal-icon">${goal.icon}</span>`
          + `<span class="goal-text">${goal.label}</span>`
          + `<span class="goal-need">${goal.need}</span>`;
        box.appendChild(row);
      }
      p.appendChild(box);
    }

    const actions = el('div', 'actions');
    actions.appendChild(this.click(el('button', 'ghost-btn', '⚒'), () => this.show('forge')));
    actions.appendChild(this.click(el('button', 'ghost-btn', '🛡'), () => this.show('armoury')));
    actions.appendChild(this.click(el('button', 'ghost-btn', '✦'), () => {
      this.talentChar = g.charId;
      this.show('talents');
    }));
    actions.appendChild(this.click(el('button', 'big-btn', '▶ RUN IT BACK'), () => {
      this.ctx.startRun(g.cls);
    }));
    p.appendChild(actions);
    p.appendChild(this.click(el('button', 'ghost-btn wide', 'Main menu'), () => this.show('title')));
    wrap.appendChild(p);
    return wrap;
  }

  /** The three nearest things the player is working toward. */
  nextGoals(g) {
    const out = [];
    const souls = this.profile.souls;
    const cd = this.profile.character(g.charId);

    // The cheapest Forge track they cannot yet afford — or can.
    let bestForge = null;
    for (const def of PERMANENT) {
      const lv = this.profile.forgeLevels(this.charId())[def.id] || 0;
      if (lv >= def.max) continue;
      const cost = upgradeCost(def, lv);
      if (!bestForge || cost < bestForge.cost) bestForge = { def, cost, lv };
    }
    if (bestForge) {
      out.push({
        icon: bestForge.def.icon,
        label: `${bestForge.def.name} ${bestForge.lv + 1}`,
        need: souls >= bestForge.cost
          ? 'ready'
          : `${(bestForge.cost - souls).toLocaleString()} more`,
      });
    }

    // The cheapest gear upgrade this class can actually buy right now. Cheapest
    // rather than best, because the answer has to be something they can act on
    // when they close this screen.
    const gear = this.profile.gear(g.charId);
    const level = this.profile.level(g.charId);
    let bestGear = null;
    for (const slot of GEAR_SLOTS) {
      const v = canBuy(g.cls.id, slot.id, gear, level, souls, this.profile.cores(g.charId));
      if (v.maxed || v.locked || v.needsCore) continue;
      if (!bestGear || v.cost < bestGear.v.cost) bestGear = { slot, v };
    }
    if (bestGear) {
      out.push({
        icon: bestGear.slot.icon,
        label: gearName(bestGear.slot.id, bestGear.v.next),
        need: bestGear.v.ok
          ? 'ready'
          : `${(bestGear.v.cost - souls).toLocaleString()} more`,
      });
    }

    // The next mastery rank for this class.
    const m = this.profile.masteryProgress(g.charId);
    out.push({
      icon: '★',
      label: `${g.cls.name} mastery ${m.rank + 1}`,
      need: `${Math.max(0, m.need - m.into).toLocaleString()} to go`,
    });

    // A talent point waiting to be spent beats anything you have to earn.
    const free = this.profile.availableTalentPoints(g.charId);
    if (free > 0) {
      out.unshift({ icon: '✦', label: 'Unspent talent points', need: String(free) });
    }
    return out.slice(0, 3);
  }
}

export { skillCost };
