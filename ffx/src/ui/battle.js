// The battle screen. Canvas for the arena, DOM for everything you press.
//
// The turn rail on the side is the load-bearing UI: it shows the next fourteen
// turns, and it re-forecasts while your finger is resting on an ability, so
// "this spell is slow" is something you can see before you commit.

import { el, button, clear, fmt, sleep } from '../core/dom.js';
import { audio } from '../core/audio.js';
import { rng } from '../core/rng.js';
import { Battle } from '../game/battle.js';
import { ABILITIES } from '../data/abilities.js';
import { ITEMS } from '../data/items.js';
import { AEONS } from '../data/aeons.js';
import { CHARACTERS } from '../data/characters.js';
import { STATUS } from '../data/status.js';
import { CHAPTERS } from '../data/story.js';
import { drawHero, drawFoe } from '../render/art.js';
import { Backdrop, shadeColor } from '../render/backdrop.js';
import { runOverdrive } from './overdrive.js';

const ROMAN = ['', 'A', 'B', 'C', 'D', 'E'];

export function makeBattleScreen(app, encounter, onDone) {
  const state = app.state;
  const battle = new Battle(state, encounter, rng);
  const chapter = CHAPTERS[state.chapter] || CHAPTERS[0];
  const back = new Backdrop();
  const pos = new Map();       // uid -> {x,y,size}
  const anim = new Map();      // uid -> visual state
  let phase = 'intro';
  let pending = null;          // { kind, ability|item, needs }
  let dom = {};
  let previewRank = null;

  // Give duplicate enemies letters, the way every JRPG has since 1991.
  const seen = {};
  for (const f of battle.allFoes()) {
    seen[f.id] = (seen[f.id] || 0) + 1;
    f.index = seen[f.id];
  }
  for (const f of battle.allFoes()) {
    if (seen[f.id] > 1) f.suffix = ' ' + ROMAN[f.index];
  }

  const nameOf = (u) => (u.side === 'foe' ? u.name + (u.suffix || '') : u.name);
  const av = (uid) => anim.get(uid) || anim.set(uid, { state: 'idle', until: 0, lunge: 0, flash: 0, hurt: 0 }).get(uid);

  /* ── DOM ──────────────────────────────────────────────────────────── */

  function build() {
    clear(app.ui);
    dom.rail = el('div', { class: 'turn-rail' });
    dom.log = el('div', { class: 'battle-log' });
    dom.party = el('div', { class: 'party-status' });
    dom.cmds = el('div', { class: 'cmd-root' });
    dom.sub = el('div', { class: 'cmd-sub hidden' });
    dom.target = el('div', { class: 'target-bar hidden' });
    dom.banner = el('div', { class: 'battle-banner' },
      el('h2', {}, encounter.boss ? nameOf(battle.foes()[0]) : 'Ambushed'),
      el('p', {}, encounter.boss ? (battle.foes()[0].def.intro || '') : chapter.region.name),
    );
    dom.root = el('div', { class: 'battle-ui' }, dom.rail, dom.log, dom.party, dom.sub, dom.target, dom.cmds, dom.banner);
    app.ui.append(dom.root);
    renderParty();
    renderRail();
  }

  function log(text, tone = '') {
    if (!text) return;
    const line = el('div', { class: `log-line ${tone}` }, text);
    dom.log.prepend(line);
    while (dom.log.children.length > 4) dom.log.lastChild.remove();
    setTimeout(() => line.classList.add('fade'), 2400);
  }

  function renderRail() {
    const order = battle.order(previewRank);
    clear(dom.rail);
    dom.rail.append(el('div', { class: 'rail-label' }, 'TURN ORDER'));
    order.slice(0, 12).forEach((u, i) => {
      const chip = el('div', {
        class: `rail-chip ${u.side} ${i === 0 ? 'now' : ''} ${u.ko ? 'ko' : ''}`,
        style: { '--tone': u.palette?.main || '#ff6b6b' },
      },
        el('span', { class: 'rail-abbr' }, (u.name || '?').slice(0, 2).toUpperCase() + (u.suffix || '').trim()),
        el('span', { class: 'rail-name' }, nameOf(u)),
      );
      dom.rail.append(chip);
    });
  }

  function renderParty() {
    clear(dom.party);
    const list = battle.aeon ? [battle.aeon] : battle.front();
    for (const u of list) {
      const st = charStatusChips(u);
      const row = el('div', { class: `pstat ${u.ko ? 'ko' : ''} ${battle.actor === u ? 'active' : ''}` },
        el('div', { class: 'pstat-top' },
          el('span', { class: 'pstat-name', style: { color: u.palette?.main || '#fff' } }, u.name),
          st,
        ),
        bar('hp', u.hp, u.maxHp),
        bar('mp', u.mp, u.maxMp),
        el('div', { class: 'od-bar' },
          el('i', { style: { width: Math.min(100, u.overdrive) + '%' } }),
          el('span', {}, u.overdrive >= 100 ? 'OVERDRIVE' : `${Math.floor(u.overdrive)}%`),
        ),
      );
      dom.party.append(row);
    }
  }

  function charStatusChips(u) {
    const wrap = el('div', { class: 'status-chips' });
    for (const k of Object.keys(u.status)) {
      const s = STATUS[k];
      if (!s) continue;
      wrap.append(el('span', { class: `chip ${s.tone}`, title: `${s.name}: ${s.desc}` }, s.glyph));
    }
    return wrap;
  }

  function bar(kind, v, max) {
    const pct = Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100));
    return el('div', { class: `stat-bar ${kind} ${pct < 25 ? 'low' : ''}` },
      el('i', { style: { width: pct + '%' } }),
      el('span', {}, `${fmt(Math.max(0, v))}`),
      el('em', {}, `/${fmt(max)}`),
    );
  }

  /* ── command menus ────────────────────────────────────────────────── */

  function showCommands(unit) {
    phase = 'await';
    previewRank = null;
    renderRail();
    renderParty();
    clear(dom.cmds);
    dom.sub.classList.add('hidden');
    dom.target.classList.add('hidden');

    const cmds = [];
    const isAeon = unit.isAeon;

    // Yobimbo does not have abilities. Yobimbo has rates.
    if (unit.id === 'yobimbo') {
      cmds.push(['💰', 'Pay', () => openList('Name your price', payEntries())]);
      cmds.push(['↩', 'Dismiss', () => run({ type: 'dismiss' })]);
      for (const [glyph, label, fn] of cmds) {
        dom.cmds.append(button(el('span', { class: 'cmd-glyph' }, glyph),
          () => { audio.sfx('cursor'); fn(); }, { class: 'cmd-btn' }));
        dom.cmds.lastChild.append(el('span', { class: 'cmd-label' }, label));
      }
      dom.cmds.classList.remove('hidden');
      return;
    }

    cmds.push(['⚔', 'Attack', () => pick(ABILITIES.attack)]);

    const skills = (unit.abilities || []).filter((a) => a !== 'attack');
    if (skills.length) cmds.push(['✦', 'Skill', () => openList('Skills', skills.map(skillEntry))]);

    if (!isAeon) {
      cmds.push(['🎒', 'Item', () => openList('Items', itemEntries())]);
      if (unit.id === 'yield' && state.aeons.length) {
        cmds.push(['☄', 'Summon', () => openList('Airdrops', aeonEntries())]);
      }
      const benchers = battle.bench();
      if (benchers.length) cmds.push(['⇄', 'Swap', () => openList('Swap in', benchers.map(swapEntry))]);
    } else {
      cmds.push(['↩', 'Dismiss', () => run({ type: 'dismiss' })]);
    }

    if (unit.overdrive >= 100) cmds.push(['★', 'Overdrive', () => doOverdrive(unit), 'od']);
    if (battle.canFlee && !isAeon) cmds.push(['🏃', 'Sell', () => run({ type: 'flee' })]);
    cmds.push(['🛡', 'Guard', () => pick(ABILITIES.defend)]);

    for (const [glyph, label, fn, cls] of cmds) {
      dom.cmds.append(button(
        el('span', { class: 'cmd-glyph' }, glyph),
        () => { audio.sfx('cursor'); fn(); },
        { class: `cmd-btn ${cls || ''}` },
      ));
      dom.cmds.lastChild.append(el('span', { class: 'cmd-label' }, label));
    }
    dom.cmds.classList.remove('hidden');
  }

  function skillEntry(id) {
    const a = ABILITIES[id];
    const unit = battle.actor;
    const affordable = a.mp <= unit.mp;
    return {
      label: a.name,
      sub: a.desc,
      right: a.mp ? `${a.mp} MP` : '',
      disabled: !affordable,
      hover: () => { previewRank = { id: unit.uid, rank: a.rank }; renderRail(); },
      go: () => pick(a),
    };
  }

  function itemEntries() {
    return Object.entries(state.inv)
      .filter(([id]) => ITEMS[id]?.battle)
      .map(([id, n]) => {
        const it = ITEMS[id];
        return {
          label: it.name, sub: it.desc, right: `×${n}`,
          go: () => pick({ ...it, __item: id, kind: it.kind === 'attack' ? 'attack' : 'heal', target: it.target }),
        };
      });
  }

  function aeonEntries() {
    return state.aeons.map((id) => {
      const a = AEONS[id];
      return {
        label: a.name, sub: `${a.epithet} — ${a.desc}`,
        right: state.aeonHp[id] === 0 ? 'KO' : '',
        disabled: state.aeonHp[id] === 0,
        go: () => run({ type: 'summon', aeon: id }),
      };
    });
  }

  /** He can tell when you are lowballing, and the tiers are public. */
  function payEntries() {
    const purse = state.pls;
    return AEONS.yobimbo.tiers.map((t, i) => {
      const next = AEONS.yobimbo.tiers[i + 1];
      const amount = Math.max(1, Math.floor(purse * (next ? (t.min + next.min) / 2 || 0.03 : 0.75)));
      return {
        label: `${t.name} — ${fmt(amount)} PLS`,
        sub: t.desc,
        right: amount > purse ? 'too rich' : '',
        disabled: amount > purse,
        go: () => run({ type: 'pay', amount }),
      };
    });
  }

  function swapEntry(u) {
    return {
      label: u.name, sub: `${CHARACTERS[u.id]?.role || ''}`,
      right: `${fmt(u.hp)} HP`,
      go: () => run({ type: 'swap', to: u.uid }),
    };
  }

  function openList(title, entries) {
    clear(dom.sub);
    dom.sub.append(el('div', { class: 'sub-head' },
      el('span', {}, title),
      button('✕', () => { dom.sub.classList.add('hidden'); previewRank = null; renderRail(); }, { class: 'btn tiny' }),
    ));
    const list = el('div', { class: 'sub-list' });
    if (!entries.length) list.append(el('p', { class: 'fine' }, 'Nothing here.'));
    for (const e of entries) {
      const b = button(
        el('span', { class: 'entry-main' },
          el('b', {}, e.label),
          e.sub && el('i', {}, e.sub),
        ),
        () => { audio.sfx('confirm'); dom.sub.classList.add('hidden'); e.go(); },
        { class: 'entry', disabled: e.disabled },
      );
      if (e.right) b.append(el('span', { class: 'entry-right' }, e.right));
      if (e.hover) {
        b.addEventListener('pointerenter', e.hover);
        b.addEventListener('focus', e.hover);
      }
      list.append(b);
    }
    dom.sub.append(list);
    dom.sub.classList.remove('hidden');
  }

  /* ── targeting ────────────────────────────────────────────────────── */

  function pick(action) {
    const unit = battle.actor;
    const needsEnemy = ['enemy'].includes(action.target || 'enemy');
    const needsAlly = action.target === 'ally';
    if (!needsEnemy && !needsAlly) return execute(action, null);

    const options = needsEnemy ? battle.foes()
      : (battle.aeon ? [battle.aeon] : battle.front()).filter((u) => action.revive || !u.ko || action.kind === 'heal');
    if (options.length === 1) return execute(action, [options[0].uid]);

    phase = 'targeting';
    pending = { action, options };
    clear(dom.target);
    dom.target.append(el('span', { class: 'target-hint' }, needsEnemy ? 'Choose a target' : 'Choose an ally'));
    for (const t of options) {
      dom.target.append(button(nameOf(t), () => execute(action, [t.uid]), { class: 'btn small target-btn' }));
    }
    dom.target.append(button('Cancel', () => { phase = 'await'; dom.target.classList.add('hidden'); showCommands(unit); }, { class: 'btn small' }));
    dom.target.classList.remove('hidden');
    dom.cmds.classList.add('hidden');
  }

  function execute(action, targets) {
    dom.target.classList.add('hidden');
    dom.cmds.classList.add('hidden');
    previewRank = null;
    if (action.__item) run({ type: 'item', item: action.__item, targets });
    else run({ type: 'ability', ability: action.id, targets });
  }

  async function doOverdrive(unit) {
    dom.cmds.classList.add('hidden');
    let cmd;
    if (unit.isAeon) {
      const od = unit.aeonDef.overdrive;
      unit.overdrive = 0;
      cmd = { type: 'overdrive', name: od.name, power: od.power, hits: od.hits, all: true, element: od.element };
    } else if (unit.id === 'yobimbo') {
      cmd = null;
    } else {
      cmd = await runOverdrive(app, unit, battle);
    }
    if (!cmd) { showCommands(unit); return; }
    audio.sfx('overdrive');
    app.flash('rgba(255,255,255,0.35)', 220);
    run(cmd);
  }

  function run(cmd) {
    const unit = battle.actor;
    const events = battle.command(cmd);
    const setter = av(unit.uid);
    if (cmd.type === 'ability' && ABILITIES[cmd.ability]?.kind === 'magic') setter.state = 'cast';
    else if (cmd.type !== 'swap' && cmd.type !== 'summon') setter.state = 'attack';
    setter.until = app.t + 0.42;
    setter.lunge = 1;
    (async () => {
      await animate(events);
      if (cmd.type === 'swap' || cmd.type === 'summon') {
        renderParty();
        renderRail();
        showCommands(battle.actor);
        return;
      }
      step();
    })();
  }

  /* ── the loop ─────────────────────────────────────────────────────── */

  async function step() {
    if (phase === 'over') return;
    const res = battle.advance();
    if (res.events?.length) await animate(res.events);
    if (res.kind === 'await') {
      showCommands(res.unit);
      return;
    }
    if (res.kind === 'end') { await finish(res.outcome); return; }
    await sleep(90);
    step();
  }

  async function animate(events) {
    phase = 'animating';
    dom.cmds.classList.add('hidden');
    for (const ev of events) {
      const target = ev.target ? battle.byUid(ev.target) : null;
      switch (ev.type) {
        case 'cast':
          log(`${nameOf(battle.byUid(ev.source) || {})} — ${ev.name}`, 'cast');
          if (ev.kind === 'magic') { audio.sfx('magic'); av(ev.source).state = 'cast'; av(ev.source).until = app.t + 0.5; }
          await sleep(200);
          break;
        case 'damage': {
          if (!target) break;
          const a = av(ev.target);
          a.hurt = app.t + 0.32;
          a.flash = app.t + 0.16;
          fly(ev.target, ev.immune ? 'IMMUNE' : fmt(ev.amount), classFor(ev));
          audio.sfx(ev.crit ? 'crit' : 'hit');
          if (ev.amount > 1500 || ev.crit) app.shake(ev.crit ? 14 : 9);
          if (ev.effective) log(`Effective — ${nameOf(target)} is exactly the wrong shape for that.`, 'good');
          if (ev.weak) log(`${nameOf(target)} is weak to it.`, 'good');
          renderParty();
          await sleep(ev.multi ? 90 : 230);
          break;
        }
        case 'heal':
          if (!target) break;
          fly(ev.target, '+' + fmt(ev.amount), ev.absorbed ? 'absorb' : 'heal');
          audio.sfx('heal');
          renderParty();
          await sleep(200);
          break;
        case 'mp':
          fly(ev.target, '+' + fmt(ev.amount) + ' MP', 'mp');
          renderParty();
          await sleep(160);
          break;
        case 'miss':
          fly(ev.target, ev.reason === 'flying' ? 'CAN’T REACH' : 'MISS', 'miss');
          audio.sfx('miss');
          await sleep(200);
          break;
        case 'status': {
          const s = STATUS[ev.status];
          fly(ev.target, ev.cleared ? 'CLEANSED' : (s ? `${s.glyph} ${s.name}` : ev.status), s?.tone === 'good' ? 'buff' : 'debuff');
          renderParty();
          await sleep(200);
          break;
        }
        case 'statusEnd': renderParty(); break;
        case 'delay':
          fly(ev.target, 'DELAYED', 'debuff');
          renderRail();
          await sleep(200);
          break;
        case 'ko':
          if (!target) break;
          av(ev.target).state = 'ko';
          audio.sfx('ko');
          log(`${nameOf(target)} is finished.`, 'bad');
          renderParty();
          renderRail();
          await sleep(320);
          break;
        case 'revive':
          av(ev.target).state = 'idle';
          fly(ev.target, ev.insurance ? 'INSURED' : 'REVIVED', 'heal');
          audio.sfx('heal');
          renderParty();
          renderRail();
          await sleep(300);
          break;
        case 'summon':
          audio.sfx('summon');
          app.flash('rgba(160,107,255,0.4)', 500);
          log(ev.text, 'good');
          renderParty();
          renderRail();
          await sleep(700);
          break;
        case 'unsummon':
        case 'swap':
          log(ev.text);
          renderParty();
          renderRail();
          await sleep(300);
          break;
        case 'overdrive':
          log(`${nameOf(battle.byUid(ev.source) || {})} — ${ev.name}!`, 'good');
          app.shake(16);
          await sleep(320);
          break;
        case 'steal':
        case 'learn':
        case 'mix':
          log(ev.text, 'good');
          audio.sfx('chest');
          await sleep(320);
          break;
        case 'text':
          log(ev.text);
          await sleep(300);
          break;
        default:
          break;
      }
    }
    renderRail();
    renderParty();
  }

  function classFor(ev) {
    if (ev.immune) return 'immune';
    if (ev.crit) return 'crit';
    if (ev.weak || ev.effective) return 'weak';
    if (ev.counter) return 'counter';
    return 'dmg';
  }

  function fly(uid, text, cls) {
    const p = pos.get(uid);
    if (!p) return;
    const node = el('div', { class: `flyer ${cls}` }, text);
    node.style.left = p.x + 'px';
    node.style.top = (p.y - p.size * 0.7) + 'px';
    app.fx.append(node);
    setTimeout(() => node.remove(), 1200);
  }

  /* ── end ──────────────────────────────────────────────────────────── */

  async function finish(outcome) {
    phase = 'over';
    dom.cmds.classList.add('hidden');
    dom.sub.classList.add('hidden');
    if (outcome === 'fled') { onDone('fled'); return; }
    if (outcome === 'defeat') {
      audio.stop();
      await sleep(600);
      onDone('defeat');
      return;
    }

    audio.play('victory');
    const sp = battle.spoils;
    const rows = [
      `AP  ${fmt(sp.ap)}`,
      `PLS  ${fmt(sp.pls)}`,
    ];
    const items = {};
    for (const i of sp.items) items[i] = (items[i] || 0) + 1;
    for (const [id, n] of Object.entries(items)) rows.push(`${ITEMS[id]?.name || id} ×${n}`);
    for (const [id, n] of Object.entries(sp.levels || {})) {
      rows.push(`${CHARACTERS[id].name}: +${n} Stake Level${n > 1 ? 's' : ''}`);
    }
    if (Object.keys(sp.levels || {}).length) audio.sfx('levelup');

    const panel = el('div', { class: 'victory' },
      el('h2', {}, 'VICTORY'),
      el('div', { class: 'victory-rows' }, ...rows.map((r) => el('div', {}, r))),
      el('p', { class: 'fine' }, quip()),
      el('div', { class: 'victory-actions' },
        button('Continue', () => onDone('victory'), { class: 'btn big primary' }),
        button('Stake Grid', () => app.toGrid(() => onDone('victory')), { class: 'btn big' }),
      ),
    );
    app.ui.append(panel);
  }

  function quip() {
    const lines = [
      'The Church will describe this as a market correction.',
      'Nobody was liquidated. Several were inconvenienced.',
      'You have been paid in a currency with no bid.',
      'Somewhere, a man with a watch is claiming he called this.',
      'Post-fight statement: "we are stronger than ever and also on fire".',
      'A moderator has deleted the thread about this fight.',
      'The floor held. The floor is other people.',
    ];
    return lines[Math.floor(rng() * lines.length)];
  }

  /* ── canvas hit testing ───────────────────────────────────────────── */

  function onPointerDown(e) {
    if (phase !== 'targeting' || !pending) return;
    const x = e.clientX, y = e.clientY;
    for (const u of pending.options) {
      const p = pos.get(u.uid);
      if (!p) continue;
      if (Math.abs(x - p.x) < p.size * 0.45 && y > p.y - p.size && y < p.y + 20) {
        audio.sfx('confirm');
        execute(pending.action, [u.uid]);
        return;
      }
    }
  }

  /* ── screen ───────────────────────────────────────────────────────── */

  return {
    music: encounter.boss ? 'boss' : 'battle',

    enter() {
      build();
      back.reset(chapter.region.weather);
      app.canvas.addEventListener('pointerdown', onPointerDown);
      setTimeout(() => dom.banner?.classList.add('gone'), 2200);
      setTimeout(() => step(), 900);
    },

    exit() {
      app.canvas.removeEventListener('pointerdown', onPointerDown);
      for (const n of app.fx.querySelectorAll('.flyer')) n.remove();
    },

    update(dt) {
      back.update(dt, chapter.region, app.w, app.h);
      for (const [, a] of anim) {
        if (a.until && app.t > a.until && a.state !== 'ko') { a.state = 'idle'; a.until = 0; }
        a.lunge *= 0.86;
      }
    },

    draw(ctx, w, h) {
      const portrait = app.portrait;
      // The combatants stand on the region's own horizon rather than floating
      // above it: the backdrop is drawn against a virtual height chosen so its
      // horizon lands exactly where the feet go.
      const groundY = h * (portrait ? 0.6 : 0.68);
      ctx.fillStyle = shadeColor(chapter.region.ground.color, -0.6);
      ctx.fillRect(0, 0, w, h);
      back.draw(ctx, chapter.region, w, groundY / 0.74, 1200, app.t);

      // Arena vignette so the sprites read against the region art.
      const grad = ctx.createLinearGradient(0, groundY - 140, 0, h);
      grad.addColorStop(0, 'rgba(5,6,15,0)');
      grad.addColorStop(0.45, 'rgba(5,6,15,0.5)');
      grad.addColorStop(1, 'rgba(5,6,15,0.88)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, groundY - 140, w, h - groundY + 140);

      const scale = Math.min(1.15, Math.max(0.62, Math.min(w / 900, h / 640)));
      pos.clear();

      // enemies, right
      const foes = battle.allFoes();
      foes.forEach((f, i) => {
        const n = foes.length;
        const spread = Math.min(w * 0.32, 90 * n);
        const x = w * (portrait ? 0.62 : 0.68) + (i - (n - 1) / 2) * (spread / Math.max(1, n - 1 || 1));
        const y = groundY + (i % 2) * 26;
        const sz = 152 * scale * (f.def.sprite?.scale || 1);
        pos.set(f.uid, { x, y, size: sz });
        const a = av(f.uid);
        drawFoe(ctx, {
          x, y, size: sz, shape: f.def.sprite?.shape || 'blob',
          palette: f.def.sprite?.palette || { main: '#a06bff', trim: '#fff', dark: '#201040' },
          t: app.t, state: f.ko ? 'ko' : a.state, phase: i * 1.7, lunge: a.lunge,
        });
        if (app.t < a.flash) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.ellipse(x, y - sz * 0.4, sz * 0.4, sz * 0.45, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        if (!f.ko && (phase === 'targeting' && pending?.options.includes(f))) {
          drawReticle(ctx, x, y - sz * 0.45, sz * 0.44, app.t);
        }
        // name plate
        ctx.save();
        ctx.font = `600 ${Math.round(11 * scale + 3)}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = f.ko ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.85)';
        ctx.fillText(nameOf(f), x, y + 24);
        if (!f.ko) {
          const bw = Math.max(56, sz * 0.42);
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(x - bw / 2, y + 30, bw, 5);
          ctx.fillStyle = f.boss ? '#ff58c8' : '#ff8f6b';
          ctx.fillRect(x - bw / 2, y + 30, bw * Math.max(0, f.hp / f.maxHp), 5);
        }
        ctx.restore();
      });

      // party, left
      const party = battle.aeon ? [battle.aeon] : battle.front();
      party.forEach((u, i) => {
        const x = w * (portrait ? 0.26 : 0.24) - i * 18 * scale;
        const y = groundY + 34 + i * 30;
        const c = CHARACTERS[u.id];
        const hgt = (u.isAeon ? 220 : 190) * scale * (c?.build.height || u.build?.scale || 1);
        pos.set(u.uid, { x, y, size: hgt });
        const a = av(u.uid);
        if (u.isAeon) {
          drawFoe(ctx, {
            x, y, size: hgt, shape: u.build?.shape || 'wyrm', palette: u.palette,
            t: app.t, state: u.ko ? 'ko' : a.state, lunge: -a.lunge,
          });
        } else {
          drawHero(ctx, {
            x, y, h: hgt, build: c?.build || {}, palette: u.palette,
            t: app.t, state: u.ko ? 'ko' : a.state, flip: false, lunge: a.lunge,
          });
        }
        if (phase === 'targeting' && pending?.options.includes(u)) {
          drawReticle(ctx, x, y - hgt * 0.45, hgt * 0.4, app.t);
        }
        if (battle.actor === u && phase === 'await') {
          drawActiveMark(ctx, x, y - hgt - 14, app.t, u.palette?.main || '#4ee0e6');
        }
      });
    },
  };
}

function drawReticle(ctx, x, y, r, t) {
  ctx.save();
  ctx.strokeStyle = '#ffe98f';
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.6 + Math.sin(t * 6) * 0.3;
  ctx.beginPath();
  ctx.arc(x, y, r + Math.sin(t * 3) * 3, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const a = t * 1.4 + (i / 4) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * (r - 8), y + Math.sin(a) * (r - 8));
    ctx.lineTo(x + Math.cos(a) * (r + 10), y + Math.sin(a) * (r + 10));
    ctx.stroke();
  }
  ctx.restore();
}

function drawActiveMark(ctx, x, y, t, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  const bob = Math.sin(t * 4) * 4;
  ctx.beginPath();
  ctx.moveTo(x, y + bob + 10);
  ctx.lineTo(x - 8, y + bob);
  ctx.lineTo(x + 8, y + bob);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
