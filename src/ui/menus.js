// All DOM menus: title, class select, skill loadout, talent trees, the Forge
// and the Armoury (permanent upgrades), settings, pause, in-run upgrade cards
// and the results screen.
//
// Nothing here scrolls. Every screen is built to fit the viewport: long lists
// are paged, dense ones are tabbed, and fitScreen() is the safety net that
// scales a screen down rather than letting it run off the bottom.

import { CLASSES, LOADOUT_SIZE, unlockedSkills } from '../data/classes.js';
import {
  PERMANENT, upgradeCost, talentPointsForBestWave, masteryProgress,
} from '../data/permanent.js';
import { ARMOR_SLOTS, armorCost, armorTierName, ARMOR_MAX_TIER, armorRating } from '../data/armor.js';
import { RARITY } from '../data/upgrades.js';
import { skillCost } from '../game/skills.js';
import { storage } from '../core/save.js';

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
    this.selectedClass = ctx.profile.data.lastClass || CLASSES[0].id;
    this.talentClass = this.selectedClass;
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
      loadout: () => this.buildLoadout(),
      talents: () => this.buildTalents(),
      forge: () => this.buildForge(),
      armoury: () => this.buildArmoury(),
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

  soulsBadge() {
    return el('div', 'souls-badge', `<span>💠</span> ${this.profile.souls.toLocaleString()} Souls`);
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
    logo.appendChild(el('h1', 'game-title', 'BLOCKFRAY'));
    logo.appendChild(el('p', 'game-sub', 'Endless Voxel Arena'));
    wrap.appendChild(logo);
    wrap.appendChild(this.soulsBadge());

    const menu = el('div', 'main-menu grid');
    const best = this.profile.data.stats.bestWave;
    const rating = armorRating(this.profile.armor);
    const items = [
      { label: 'PLAY', hint: best ? `Best: wave ${best}` : 'Start your first run', primary: true, go: () => this.show('classes') },
      { label: 'THE FORGE', hint: 'Permanent upgrades', go: () => this.show('forge') },
      { label: 'ARMOURY', hint: rating ? `Armour rating ${rating}` : 'Buy and upgrade gear', go: () => this.show('armoury') },
      { label: 'TALENTS', hint: 'Spend talent points', go: () => this.show('talents') },
      { label: 'RECORDS', hint: 'Career statistics', go: () => this.show('stats') },
      { label: 'SETTINGS', hint: 'Controls & display', go: () => this.show('settings') },
      { label: 'HOW TO PLAY', hint: 'Controls reference', go: () => this.show('howto') },
      { label: 'DIAGNOSTICS', hint: 'If something is broken, screenshot this', go: () => this.show('diag') },
    ];
    for (const it of items) {
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

  /** The endless per-class progress bar, shown wherever a class is chosen. */
  masteryBar(classId) {
    const m = masteryProgress(this.profile.classData(classId).mastery || 0);
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
  // Class select
  // -------------------------------------------------------------------------

  buildClassSelect() {
    const wrap = el('div', 'screen');
    wrap.appendChild(this.backBar('title'));
    const p = this.panel('Choose your class');
    const grid = el('div', 'class-grid');

    for (const cls of CLASSES) {
      const cd = this.profile.classData(cls.id);
      const card = el('div', 'class-card' + (cls.id === this.selectedClass ? ' selected' : ''));
      card.style.setProperty('--accent', cls.color);
      card.innerHTML = `
        <div class="class-name">${cls.name}</div>
        <div class="class-role">${cls.role}</div>
        <div class="class-skills">
          ${this.profile.loadout(cls).map((s) => `<span title="${s.name}">${s.icon}</span>`).join('')}
        </div>
        <div class="class-meta">
          <span>wave ${cd.bestWave}</span>
          <span>${this.profile.availableTalentPoints(cls.id)} pts</span>
        </div>
        <div class="class-diff">${'★'.repeat(cls.difficulty)}${'☆'.repeat(3 - cls.difficulty)}</div>`;
      this.click(card, () => {
        this.selectedClass = cls.id;
        this.talentClass = cls.id;
        this.show('classes');
      });
      grid.appendChild(card);
    }
    p.appendChild(grid);

    const cls = CLASSES.find((c) => c.id === this.selectedClass);
    const detail = el('div', 'class-detail');
    detail.innerHTML = `<h3 style="color:${cls.color}">${cls.name} — ${cls.tagline}</h3>`;
    const stats = el('div', 'stat-row');
    stats.innerHTML = `
      <div><b>${cls.base.hp}</b><span>Health</span></div>
      <div><b>${Math.round(cls.base.armor * 100)}%</b><span>Armor</span></div>
      <div><b>${cls.base.attackDamage}</b><span>Attack</span></div>
      <div><b>${cls.base.attackSpeed.toFixed(2)}/s</b><span>Speed</span></div>
      <div><b>${Math.round(cls.base.critChance * 100)}%</b><span>Crit</span></div>
      <div><b>${cls.base.attackRange < 6 ? 'Melee' : 'Ranged'}</b><span>Range</span></div>`;
    detail.appendChild(stats);
    detail.appendChild(this.masteryBar(cls.id));

    // Equipped kit, as a compact strip — the full pool lives on the loadout
    // screen so this one never grows past a phone.
    const strip = el('div', 'kit-strip');
    for (const s of this.profile.loadout(cls)) {
      strip.appendChild(el('span', 'kit-chip', `${s.icon} ${s.name}`));
    }
    detail.appendChild(strip);
    p.appendChild(detail);

    const actions = el('div', 'actions');
    actions.appendChild(this.click(el('button', 'ghost-btn', 'Skills'), () => this.show('loadout')));
    actions.appendChild(this.click(el('button', 'ghost-btn', 'Talents'), () => {
      this.talentClass = this.selectedClass;
      this.show('talents');
    }));
    actions.appendChild(this.click(el('button', 'big-btn', 'ENTER THE ARENA'), () => {
      this.ctx.startRun(cls);
    }));
    p.appendChild(actions);
    wrap.appendChild(p);
    return wrap;
  }

  // -------------------------------------------------------------------------
  // Skill loadout — pick four of the class's eight
  // -------------------------------------------------------------------------

  buildLoadout() {
    const cls = CLASSES.find((c) => c.id === this.selectedClass);
    const cd = this.profile.classData(cls.id);
    const equipped = this.profile.loadout(cls).map((s) => s.id);
    const open = unlockedSkills(cls, cd.bestWave).length;

    const wrap = el('div', 'screen');
    wrap.appendChild(this.backBar('classes'));
    const p = this.panel(`${cls.name} skills`,
      `Equip ${LOADOUT_SIZE} of ${cls.skills.length}. ${open} unlocked — reach deeper waves with this class for the rest.`);

    const grid = el('div', 'skill-grid');
    const makeCard = (s) => {
      const on = equipped.includes(s.id);
      const locked = (s.unlock || 0) > cd.bestWave;
      const card = el('div', 'skill-card' + (on ? ' on' : '') + (locked ? ' locked' : ''));
      card.style.setProperty('--accent', cls.accent);
      card.innerHTML = `
        <div class="sc-icon">${locked ? '🔒' : s.icon}</div>
        <div class="sc-body">
          <div class="sc-name">${s.name}${on ? ' <em>equipped</em>' : ''}</div>
          <div class="sc-desc">${s.desc}</div>
          <div class="sc-nums">${locked
            ? `Unlocks at wave ${s.unlock} with ${cls.name}`
            : `${s.cost} ${cls.resource.name} · ${s.cooldown}s cooldown`}</div>
        </div>`;
      if (!locked) {
        this.click(card, () => {
          const next = equipped.includes(s.id)
            ? equipped.filter((id) => id !== s.id)
            // Replacing the oldest slot keeps the swap to one tap; dropping a
            // skill first and then picking one would be two.
            : [...equipped.slice(equipped.length >= LOADOUT_SIZE ? 1 : 0), s.id];
          if (!next.length) { this.ctx.audio.play('deny'); return; }
          this.profile.setLoadout(cls, next);
          this.refresh();
        });
      }
      return card;
    };
    p.appendChild(this.paged('loadout', cls.skills, byHeight(3, 5, 8), grid, makeCard));

    const actions = el('div', 'actions');
    actions.appendChild(this.click(el('button', 'ghost-btn', 'Reset to default'), () => {
      this.profile.setLoadout(cls, []);
      this.refresh();
    }));
    actions.appendChild(this.click(el('button', 'big-btn', 'Play as ' + cls.name),
      () => this.ctx.startRun(cls)));
    p.appendChild(actions);
    wrap.appendChild(p);
    return wrap;
  }

  // -------------------------------------------------------------------------
  // Talents
  // -------------------------------------------------------------------------

  buildTalents() {
    const wrap = el('div', 'screen');
    const picker = el('div', 'class-picker');
    for (const c of CLASSES) {
      const b = el('button', 'pill' + (c.id === this.talentClass ? ' active' : ''), c.name);
      b.style.setProperty('--accent', c.color);
      this.click(b, () => { this.talentClass = c.id; this.talentBranch = 0; this.show('talents'); });
      picker.appendChild(b);
    }
    wrap.appendChild(this.backBar('title', picker));

    const cls = CLASSES.find((c) => c.id === this.talentClass);
    const cd = this.profile.classData(cls.id);
    const avail = this.profile.availableTalentPoints(cls.id);
    const total = talentPointsForBestWave(cd.bestWave);

    const p = this.panel(`${cls.name} Talents`,
      `${avail} of ${total} points available · deeper waves keep paying out`);
    p.appendChild(this.masteryBar(cls.id));

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
    const cols = el('div', 'talent-grid');
    cols.style.setProperty('--accent', branch.color);

    const makeNode = (node) => {
      const tier = branch.nodes.indexOf(node);
      const rank = cd.talents[node.id] || 0;
      const required = tier * 2;
      const locked = spent < required;
      const row = el('div', 'talent-node'
        + (rank ? ' has-rank' : '')
        + (rank >= node.max ? ' maxed' : '')
        + (locked ? ' locked' : ''));
      row.innerHTML = `
        <div class="talent-head">
          <span class="talent-name">${node.name}</span>
          <span class="talent-rank">${rank}/${node.max}</span>
        </div>
        <div class="talent-desc">${locked
          ? `Requires ${required} points in ${branch.name}`
          : node.desc}</div>`;
      const btns = el('div', 'talent-btns');
      const minus = el('button', 'tiny-btn', '−');
      const plus = el('button', 'tiny-btn', '+');
      minus.disabled = rank <= 0;
      plus.disabled = locked || rank >= node.max || avail <= 0;
      this.click(minus, () => {
        if ((cd.talents[node.id] || 0) <= 0) return;
        cd.talents[node.id]--;
        if (!cd.talents[node.id]) delete cd.talents[node.id];
        this.profile.save();
        this.refresh();
      });
      this.click(plus, () => {
        if (this.profile.availableTalentPoints(cls.id) <= 0) { this.ctx.audio.play('deny'); return; }
        cd.talents[node.id] = (cd.talents[node.id] || 0) + 1;
        this.profile.save();
        this.ctx.audio.play('buy');
        this.refresh();
      });
      btns.appendChild(minus);
      btns.appendChild(plus);
      row.appendChild(btns);
      return row;
    };
    p.appendChild(this.paged(`talents:${cls.id}:${this.talentBranch}`,
      branch.nodes, byHeight(2, 3, 6), cols, makeNode));

    const actions = el('div', 'actions');
    actions.appendChild(this.click(el('button', 'ghost-btn', 'Reset points'), () => {
      this.profile.respec(cls.id);
      this.refresh();
    }));
    actions.appendChild(this.click(el('button', 'big-btn', 'Play as ' + cls.name), () => {
      this.selectedClass = cls.id;
      this.ctx.startRun(cls);
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
    wrap.appendChild(this.backBar('title'));
    const p = this.panel('The Forge',
      'Permanent upgrades bought with Souls. They apply to every class, forever.');

    const grid = el('div', 'forge-grid');
    p.appendChild(this.paged('forge', PERMANENT, byHeight(3, 5, 12), grid, (def) => {
      const level = this.profile.data.permanent[def.id] || 0;
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
      const buy = el('button', 'buy-btn', maxed ? 'MAX' : `💠 ${cost}`);
      buy.disabled = maxed || !afford;
      this.click(buy, () => {
        const lv = this.profile.data.permanent[def.id] || 0;
        if (lv >= def.max) return;
        const c = upgradeCost(def, lv);
        if (this.profile.souls < c) { this.ctx.audio.play('deny'); return; }
        this.profile.souls -= c;
        this.profile.data.permanent[def.id] = lv + 1;
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
  // The Armoury — five gear slots with no ceiling
  // -------------------------------------------------------------------------

  buildArmoury() {
    const wrap = el('div', 'screen');
    wrap.appendChild(this.backBar('title'));
    const rating = armorRating(this.profile.armor);
    const p = this.panel('Armoury',
      `Armour rating ${rating}. Every tier costs more and gives more — there is no cap.`);

    const grid = el('div', 'forge-grid');
    p.appendChild(this.paged('armoury', ARMOR_SLOTS, byHeight(3, 4, 5), grid, (def) => {
      const tier = this.profile.armor[def.id] || 0;
      const maxed = tier >= ARMOR_MAX_TIER;
      const cost = armorCost(def, tier);
      const afford = this.profile.souls >= cost;
      const card = el('div', 'forge-card' + (!afford && !maxed ? ' poor' : ''));
      card.innerHTML = `
        <div class="forge-icon">${def.icon}</div>
        <div class="forge-body">
          <div class="forge-name">${armorTierName(def, tier)} <span class="dim">T${tier}</span></div>
          <div class="forge-desc">${def.desc}</div>
          <div class="forge-desc dim">Equipped: ${this.armorSummary(def, tier)}</div>
        </div>`;
      const buy = el('button', 'buy-btn', maxed ? 'MAX' : `💠 ${cost}`);
      buy.disabled = maxed || !afford;
      this.click(buy, () => {
        const t = this.profile.armor[def.id] || 0;
        if (t >= ARMOR_MAX_TIER) return;
        const c = armorCost(def, t);
        if (this.profile.souls < c) { this.ctx.audio.play('deny'); return; }
        this.profile.souls -= c;
        this.profile.armor[def.id] = t + 1;
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

  /** "+45 health, +9% armor" for the tiers already bought in one slot. */
  armorSummary(def, tier) {
    if (!tier) return 'nothing yet';
    const label = {
      maxHp: (v) => `+${Math.round(v)} health`,
      armor: (v) => `+${(v * 100).toFixed(1)}% armor`,
      moveSpeed: (v) => `+${(v * 100).toFixed(1)}% speed`,
      dodge: (v) => `+${(v * 100).toFixed(1)}% dodge`,
      critChance: (v) => `+${(v * 100).toFixed(1)}% crit`,
      allDamage: (v) => `+${(v * 100).toFixed(1)}% damage`,
      resourceMax: (v) => `+${Math.round(v)} resource`,
    };
    return Object.entries(def.effect)
      .map(([k, v]) => (label[k] ? label[k](v * tier) : `${k} ${v * tier}`))
      .join(', ');
  }

  // -------------------------------------------------------------------------
  // Stats / settings / how-to
  // -------------------------------------------------------------------------

  buildStats() {
    const wrap = el('div', 'screen');
    wrap.appendChild(this.backBar('title'));
    const s = this.profile.data.stats;
    const p = this.panel('Records');
    const grid = el('div', 'stat-grid');
    const rows = [
      ['Best wave', s.bestWave],
      ['Total runs', s.runs],
      ['Total kills', s.kills.toLocaleString()],
      ['Souls earned', this.profile.data.lifetimeSouls.toLocaleString()],
      ['Time played', fmtTime(s.timePlayed)],
    ];
    for (const [k, v] of rows) {
      const d = el('div', 'stat-cell');
      d.innerHTML = `<b>${v}</b><span>${k}</span>`;
      grid.appendChild(d);
    }
    p.appendChild(grid);

    const table = el('div', 'class-stats');
    for (const c of CLASSES) {
      const cd = this.profile.classData(c.id);
      const row = el('div', 'cs-row');
      row.innerHTML = `
        <span class="cs-name" style="color:${c.color}">${c.name}</span>
        <span>wave ${cd.bestWave}</span>
        <span>${cd.kills} kills</span>
        <span>mastery ${this.profile.masteryRank(c.id)}</span>
        <span>${this.profile.availableTalentPoints(c.id)} pts</span>`;
      table.appendChild(row);
    }
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
      () => toggle('Hold to attack', 'autoAttack', 'Keep swinging while the button is held'),
      () => toggle('Tap to attack', 'tapAttack', 'A quick tap on the look side swings'),
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
    wrap.appendChild(this.backBar('title'));
    const p = this.panel('How to play');
    const cols = [
      `<h3>Phone</h3><ul>
        <li><b>Left half</b> — drag to move; the stick appears under your thumb</li>
        <li><b>Right half</b> — drag to look, tap to swing</li>
        <li><b>⚔</b> attack · <b>⤒</b> jump · <b>»</b> sprint</li>
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
        <li>Dying banks <b>Souls</b> — spend them in the <b>Forge</b> and <b>Armoury</b>.</li>
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
    wrap.appendChild(this.backBar('title'));
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
        ['Last error', window.__blockfrayError || 'none'],
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
    const p = this.panel('Paused', `Wave ${this.ctx.game.wave} · ${Math.round(this.ctx.game.soulsEarned)} souls this run`);
    const menu = el('div', 'main-menu');
    menu.appendChild(this.click(el('button', 'menu-btn primary', '<span class="menu-label">RESUME</span>'),
      () => this.ctx.resumeRun()));
    menu.appendChild(this.click(el('button', 'menu-btn', '<span class="menu-label">SETTINGS</span>'),
      () => this.show('settings')));
    menu.appendChild(this.click(el('button', 'menu-btn', '<span class="menu-label">ABANDON RUN</span><span class="menu-hint">Bank your souls and return to the menu</span>'),
      () => this.ctx.quitRun()));
    p.appendChild(menu);

    const g = this.ctx.game;
    if (g.runUpgrades.length) {
      const list = el('div', 'run-build');
      list.appendChild(el('h3', null, 'Run upgrades'));
      const chips = el('div', 'chips');
      for (const u of g.runUpgrades) {
        chips.appendChild(el('span', 'chip',
          `${u.icon} ${u.name}${u.stacks > 1 ? ` ×${u.stacks}` : ''}`));
      }
      list.appendChild(chips);
      p.appendChild(list);
    }
    wrap.appendChild(p);
    return wrap;
  }

  buildUpgradeCards() {
    const g = this.ctx.game;
    const wrap = el('div', 'screen overlay');
    const p = this.panel(`Wave ${g.wave} cleared`, 'Choose one upgrade for the rest of this run.');
    const row = el('div', 'card-row');
    for (const up of g.pendingUpgrades) {
      const rar = RARITY[up.rarity];
      const card = el('div', 'upgrade-card');
      card.style.setProperty('--accent', rar.color);
      const owned = g.runUpgrades.find((u) => u.id === up.id);
      card.innerHTML = `
        <div class="up-rarity" style="color:${rar.color}">${rar.label}</div>
        <div class="up-icon">${up.icon}</div>
        <div class="up-name">${up.name}</div>
        <div class="up-desc">${up.desc}</div>
        ${owned ? `<div class="up-owned">Owned ×${owned.stacks}</div>` : ''}`;
      this.click(card, () => {
        g.chooseUpgrade(up);
        this.ctx.resumeRun();
      });
      row.appendChild(card);
    }
    p.appendChild(row);

    const actions = el('div', 'actions');
    const reroll = el('button', 'ghost-btn', `Reroll (${g.rerollsLeft})`);
    reroll.disabled = g.rerollsLeft <= 0;
    this.click(reroll, () => { if (g.rerollUpgrades()) this.show('upgrade'); });
    actions.appendChild(reroll);
    p.appendChild(actions);
    wrap.appendChild(p);
    return wrap;
  }

  buildResults() {
    const g = this.ctx.game;
    const res = g.result;
    const wrap = el('div', 'screen overlay');
    const p = this.panel('You fell on wave ' + res.reachedWave,
      `${g.cls.name} · ${res.kills} kills · ${fmtTime(res.duration)}`);

    const grid = el('div', 'stat-grid');
    const cd = this.profile.classData(g.cls.id);
    const rows = [
      ['Waves cleared', res.wave],
      ['Kills', res.kills],
      ['Souls banked', '💠 ' + res.souls],
      ['Talent points free', this.profile.availableTalentPoints(g.cls.id)],
      ['Mastery', this.profile.masteryRank(g.cls.id)],
      ['Class best', 'wave ' + cd.bestWave],
    ];
    for (const [k, v] of rows) {
      const d = el('div', 'stat-cell');
      d.innerHTML = `<b>${v}</b><span>${k}</span>`;
      grid.appendChild(d);
    }
    p.appendChild(grid);
    p.appendChild(this.masteryBar(g.cls.id));

    const actions = el('div', 'actions');
    actions.appendChild(this.click(el('button', 'ghost-btn', 'Forge'), () => this.show('forge')));
    actions.appendChild(this.click(el('button', 'ghost-btn', 'Armoury'), () => this.show('armoury')));
    actions.appendChild(this.click(el('button', 'ghost-btn', 'Talents'), () => {
      this.talentClass = g.cls.id;
      this.show('talents');
    }));
    actions.appendChild(this.click(el('button', 'big-btn', 'RUN IT BACK'), () => {
      this.ctx.startRun(g.cls);
    }));
    p.appendChild(actions);
    p.appendChild(this.click(el('button', 'ghost-btn wide', 'Main menu'), () => this.show('title')));
    wrap.appendChild(p);
    return wrap;
  }
}

export { skillCost };
