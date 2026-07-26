// All DOM menus: title, class select, talent trees, the Forge (permanent
// upgrades), settings, pause, in-run upgrade cards and the results screen.

import { CLASSES } from '../data/classes.js';
import { PERMANENT, upgradeCost, talentPointsForBestWave } from '../data/permanent.js';
import { RARITY } from '../data/upgrades.js';
import { skillCost } from '../game/skills.js';

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

export class Menus {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx;              // { profile, audio, startRun, resumeRun, quitRun, game }
    this.screen = null;
    this.selectedClass = ctx.profile.data.lastClass || CLASSES[0].id;
    this.talentClass = this.selectedClass;
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
    this.screen = name;
    this.root.innerHTML = '';
    this.root.classList.toggle('hidden', name === null);
    if (name === null) return;
    const builder = {
      title: () => this.buildTitle(),
      classes: () => this.buildClassSelect(),
      talents: () => this.buildTalents(),
      forge: () => this.buildForge(),
      settings: () => this.buildSettings(),
      stats: () => this.buildStats(),
      pause: () => this.buildPause(),
      upgrade: () => this.buildUpgradeCards(),
      results: () => this.buildResults(),
      howto: () => this.buildHowTo(),
    }[name];
    if (builder) this.root.appendChild(builder());
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

    const menu = el('div', 'main-menu');
    const best = this.profile.data.stats.bestWave;
    const items = [
      { label: 'PLAY', hint: best ? `Best: wave ${best}` : 'Start your first run', primary: true, go: () => this.show('classes') },
      { label: 'THE FORGE', hint: 'Permanent upgrades', go: () => this.show('forge') },
      { label: 'TALENTS', hint: 'Spend talent points', go: () => this.show('talents') },
      { label: 'RECORDS', hint: 'Career statistics', go: () => this.show('stats') },
      { label: 'SETTINGS', hint: 'Controls & display', go: () => this.show('settings') },
      { label: 'HOW TO PLAY', hint: 'Controls reference', go: () => this.show('howto') },
    ];
    for (const it of items) {
      const b = el('button', 'menu-btn' + (it.primary ? ' primary' : ''));
      b.appendChild(el('span', 'menu-label', it.label));
      b.appendChild(el('span', 'menu-hint', it.hint));
      menu.appendChild(this.click(b, it.go));
    }
    wrap.appendChild(menu);
    wrap.appendChild(el('p', 'footnote',
      'Original voxel art & audio, generated in code. Not affiliated with any other game.'));
    return wrap;
  }

  backBar(to = 'title', extra = null) {
    const bar = el('div', 'back-bar');
    bar.appendChild(this.click(el('button', 'ghost-btn', '‹ Back'), () => this.show(to)));
    if (extra) bar.appendChild(extra);
    bar.appendChild(this.soulsBadge());
    return bar;
  }

  // -------------------------------------------------------------------------
  // Class select
  // -------------------------------------------------------------------------

  buildClassSelect() {
    const wrap = el('div', 'screen');
    wrap.appendChild(this.backBar('title'));
    const p = this.panel('Choose your class', 'Each class has its own resource, four skills and a talent tree.');
    const grid = el('div', 'class-grid');

    for (const cls of CLASSES) {
      const cd = this.profile.classData(cls.id);
      const card = el('div', 'class-card' + (cls.id === this.selectedClass ? ' selected' : ''));
      card.style.setProperty('--accent', cls.color);
      card.innerHTML = `
        <div class="class-top">
          <div class="class-name">${cls.name}</div>
          <div class="class-role">${cls.role}</div>
        </div>
        <div class="class-tag">${cls.tagline}</div>
        <div class="class-res" style="color:${cls.resource.color}">${cls.resource.name}</div>
        <div class="class-skills">
          ${cls.skills.map((s) => `<span title="${s.name}: ${s.desc}">${s.icon}</span>`).join('')}
        </div>
        <div class="class-meta">
          <span>Best wave ${cd.bestWave}</span>
          <span>${this.profile.availableTalentPoints(cls.id)} pts free</span>
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
    detail.innerHTML = `<h3 style="color:${cls.color}">${cls.name} — ${cls.role}</h3>`;
    const stats = el('div', 'stat-row');
    stats.innerHTML = `
      <div><b>${cls.base.hp}</b><span>Health</span></div>
      <div><b>${Math.round(cls.base.armor * 100)}%</b><span>Armor</span></div>
      <div><b>${cls.base.attackDamage}</b><span>Attack</span></div>
      <div><b>${cls.base.attackSpeed.toFixed(2)}/s</b><span>Speed</span></div>
      <div><b>${Math.round(cls.base.critChance * 100)}%</b><span>Crit</span></div>
      <div><b>${cls.base.attackRange < 6 ? 'Melee' : 'Ranged'}</b><span>Range</span></div>`;
    detail.appendChild(stats);

    const skills = el('div', 'skill-list');
    cls.skills.forEach((s, i) => {
      const row = el('div', 'skill-row');
      row.innerHTML = `
        <div class="skill-icon" style="border-color:${cls.accent}">${s.icon}</div>
        <div class="skill-text">
          <div class="skill-name">${s.name} <span class="key">${i + 1}</span></div>
          <div class="skill-desc">${s.desc}</div>
          <div class="skill-nums">${s.cost} ${cls.resource.name} · ${s.cooldown}s cooldown</div>
        </div>`;
      skills.appendChild(row);
    });
    detail.appendChild(skills);
    p.appendChild(detail);

    const actions = el('div', 'actions');
    const talentBtn = this.click(el('button', 'ghost-btn', 'Talents'), () => {
      this.talentClass = this.selectedClass;
      this.show('talents');
    });
    const playBtn = this.click(el('button', 'big-btn', 'ENTER THE ARENA'), () => {
      this.ctx.startRun(cls);
    });
    actions.appendChild(talentBtn);
    actions.appendChild(playBtn);
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
      this.click(b, () => { this.talentClass = c.id; this.show('talents'); });
      picker.appendChild(b);
    }
    wrap.appendChild(this.backBar('title', picker));

    const cls = CLASSES.find((c) => c.id === this.talentClass);
    const cd = this.profile.classData(cls.id);
    const avail = this.profile.availableTalentPoints(cls.id);
    const total = talentPointsForBestWave(cd.bestWave);

    const p = this.panel(`${cls.name} Talents`,
      `${avail} of ${total} points available · earn more by reaching deeper waves with this class`);

    const cols = el('div', 'talent-cols');
    for (const branch of cls.talents) {
      const col = el('div', 'talent-col');
      col.style.setProperty('--accent', branch.color);
      const spent = branch.nodes.reduce((s, n) => s + (cd.talents[n.id] || 0), 0);
      col.appendChild(el('div', 'talent-branch', `${branch.name}<span>${spent}</span>`));

      branch.nodes.forEach((node, tier) => {
        const rank = cd.talents[node.id] || 0;
        // Tiers unlock as points are invested in the branch.
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
          <div class="talent-desc">${node.desc}</div>
          ${locked ? `<div class="talent-lock">Requires ${required} points in ${branch.name}</div>` : ''}`;
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
          this.show('talents');
        });
        this.click(plus, () => {
          if (this.profile.availableTalentPoints(cls.id) <= 0) { this.ctx.audio.play('deny'); return; }
          cd.talents[node.id] = (cd.talents[node.id] || 0) + 1;
          this.profile.save();
          this.ctx.audio.play('buy');
          this.show('talents');
        });
        btns.appendChild(minus);
        btns.appendChild(plus);
        row.appendChild(btns);
        col.appendChild(row);
      });
      cols.appendChild(col);
    }
    p.appendChild(cols);

    const actions = el('div', 'actions');
    actions.appendChild(this.click(el('button', 'ghost-btn', 'Reset all points'), () => {
      this.profile.respec(cls.id);
      this.show('talents');
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
      'Permanent upgrades bought with Souls. They apply to every class, on every run, forever.');

    const grid = el('div', 'forge-grid');
    for (const def of PERMANENT) {
      const level = this.profile.data.permanent[def.id] || 0;
      const maxed = level >= def.max;
      const cost = upgradeCost(def, level);
      const afford = this.profile.souls >= cost;
      const card = el('div', 'forge-card' + (maxed ? ' maxed' : '') + (!afford && !maxed ? ' poor' : ''));
      card.innerHTML = `
        <div class="forge-icon">${def.icon}</div>
        <div class="forge-body">
          <div class="forge-name">${def.name}</div>
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
        this.show('forge');
      });
      card.appendChild(buy);
      grid.appendChild(card);
    }
    p.appendChild(grid);
    wrap.appendChild(p);
    return wrap;
  }

  // -------------------------------------------------------------------------
  // Stats / settings / how-to
  // -------------------------------------------------------------------------

  buildStats() {
    const wrap = el('div', 'screen');
    wrap.appendChild(this.backBar('title'));
    const s = this.profile.data.stats;
    const p = this.panel('Records', 'Career totals across every run.');
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
    table.appendChild(el('h3', null, 'By class'));
    for (const c of CLASSES) {
      const cd = this.profile.classData(c.id);
      const row = el('div', 'cs-row');
      row.innerHTML = `
        <span class="cs-name" style="color:${c.color}">${c.name}</span>
        <span>wave ${cd.bestWave}</span>
        <span>${cd.runs} runs</span>
        <span>${cd.kills} kills</span>
        <span>${this.profile.availableTalentPoints(c.id)} pts free</span>`;
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
      list.appendChild(row);
    };

    const toggle = (label, key, hint) => {
      const row = el('div', 'setting toggle');
      const btn = el('button', 'switch' + (st[key] ? ' on' : ''), st[key] ? 'ON' : 'OFF');
      row.innerHTML = `<label>${label}${hint ? `<span class="hint">${hint}</span>` : ''}</label>`;
      this.click(btn, () => {
        st[key] = !st[key];
        this.profile.save();
        this.ctx.onSettingsChanged();
        this.show('settings');
      });
      row.appendChild(btn);
      list.appendChild(row);
    };

    slider('Mouse sensitivity', 'sensitivity', 0.2, 3, 0.05, (v) => v.toFixed(2) + 'x');
    slider('Touch sensitivity', 'touchSensitivity', 0.2, 3, 0.05, (v) => v.toFixed(2) + 'x');
    slider('Field of view', 'fov', 60, 100, 1, (v) => Math.round(v) + '°');
    slider('Render scale', 'renderScale', 0.5, 1, 0.05, (v) => Math.round(v * 100) + '%');
    slider('Sound volume', 'sfxVolume', 0, 1, 0.05, (v) => Math.round(v * 100) + '%');
    slider('Music volume', 'musicVolume', 0, 1, 0.05, (v) => Math.round(v * 100) + '%');
    toggle('Invert look Y', 'invertY');
    toggle('Damage numbers', 'showDamage');
    toggle('Left-handed layout', 'leftHanded', 'Swaps the joystick and buttons');
    toggle('Hold to attack', 'autoAttack', 'Keep swinging while the button is held');
    toggle('Fullscreen on play', 'fullscreenOnPlay', 'Go fullscreen when a run starts');

    p.appendChild(list);
    p.appendChild(el('p', 'footnote', 'Render scale below 100% boosts frame rate on phones.'));
    wrap.appendChild(p);
    return wrap;
  }

  buildHowTo() {
    const wrap = el('div', 'screen');
    wrap.appendChild(this.backBar('title'));
    const p = this.panel('How to play');
    p.appendChild(el('div', 'howto', `
      <div class="howto-col">
        <h3>Phone</h3>
        <ul>
          <li><b>Left half</b> — drag to move (the stick appears where you touch)</li>
          <li><b>Right half</b> — drag to look around</li>
          <li><b>⚔</b> — attack (hold to keep attacking)</li>
          <li><b>⤒</b> — jump &nbsp; <b>»</b> — sprint</li>
          <li><b>Skill pad</b> — four class skills with cooldown rings</li>
        </ul>
      </div>
      <div class="howto-col">
        <h3>Keyboard & mouse</h3>
        <ul>
          <li><b>WASD</b> move · <b>Space</b> jump · <b>Shift</b> sprint</li>
          <li><b>Mouse</b> look · <b>Left click</b> attack</li>
          <li><b>1 2 3 4</b> (or Q E R F) — skills</li>
          <li><b>Esc</b> — pause</li>
        </ul>
      </div>
      <div class="howto-col">
        <h3>Controller</h3>
        <ul>
          <li><b>Left stick</b> move · <b>Right stick</b> look</li>
          <li><b>A</b> jump · <b>X</b> or <b>RT</b> attack · <b>L3/LT</b> sprint</li>
          <li><b>LB RB Y B</b> — skills 1–4</li>
          <li><b>Start</b> — pause</li>
          <li>Plug in and press anything; it takes over automatically.</li>
        </ul>
      </div>
      <div class="howto-col">
        <h3>The loop</h3>
        <ul>
          <li>Waves never stop. Every 5th wave is a boss.</li>
          <li>Clear a wave, pick <b>one of three upgrades</b> for this run.</li>
          <li>Dying banks your <b>Souls</b> — spend them in <b>The Forge</b> for permanent power.</li>
          <li>Reaching deeper waves grants <b>talent points</b> for that class.</li>
          <li>Mind the lava channels. They hurt everything, including bosses.</li>
        </ul>
      </div>`));
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

    // Current run build summary.
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
      ['Damage dealt', res.damageDealt.toLocaleString()],
      ['Souls banked', '💠 ' + res.souls],
      ['Talent points free', this.profile.availableTalentPoints(g.cls.id)],
      ['Class best', 'wave ' + cd.bestWave],
    ];
    for (const [k, v] of rows) {
      const d = el('div', 'stat-cell');
      d.innerHTML = `<b>${v}</b><span>${k}</span>`;
      grid.appendChild(d);
    }
    p.appendChild(grid);

    if (g.runUpgrades.length) {
      const chips = el('div', 'chips');
      for (const u of g.runUpgrades) {
        chips.appendChild(el('span', 'chip', `${u.icon} ${u.name}${u.stacks > 1 ? ` ×${u.stacks}` : ''}`));
      }
      const box = el('div', 'run-build');
      box.appendChild(el('h3', null, 'Your build'));
      box.appendChild(chips);
      p.appendChild(box);
    }

    const actions = el('div', 'actions');
    actions.appendChild(this.click(el('button', 'ghost-btn', 'The Forge'), () => this.show('forge')));
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
