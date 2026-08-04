// All the DOM. Panels are built once when you switch to them and then only
// have their numbers written back — rebuilding markup ten times a second eats
// scroll position, focus, and battery, in that order.

import { STATIONS } from '../data/stations.js';
import { UPGRADES } from '../data/upgrades.js';
import { QUESTS, CHAPTERS, questsInChapter } from '../data/quests.js';
import * as E from '../game/economy.js';
import * as G from '../game/state.js';
import { fmt, money, duration, clamp01 } from '../core/format.js';

const TABS = [
  { id: 'empire', label: 'Empire' },
  { id: 'stakes', label: 'Stakes' },
  { id: 'perks', label: 'Perks' },
  { id: 'quests', label: 'Quests' },
  { id: 'restake', label: 'Restake' },
  { id: 'about', label: 'About' },
];

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export function createUI(root, app) {
  const getState = app.getState;
  let tab = 'empire';
  let buyMode = 1;
  let updatePanel = () => {};

  // --- chrome ---------------------------------------------------------------

  const bar = el('div', 'topbar');
  const cashEl = el('div', 'stat big');
  const rateEl = el('div', 'stat sub');
  const shareEl = el('div', 'stat');
  const spEl = el('div', 'stat');
  const pumpBtn = el('button', 'pump-btn', 'PUMP');
  const left = el('div', 'topbar-left');
  left.append(cashEl, rateEl);
  const right = el('div', 'topbar-right');
  right.append(shareEl, spEl, pumpBtn);
  bar.append(left, right);

  pumpBtn.addEventListener('click', () => app.actions.pump());

  const tabbar = el('nav', 'tabbar');
  const tabButtons = {};
  for (const t of TABS) {
    const b = el('button', 'tab', t.label);
    b.addEventListener('click', () => setTab(t.id));
    tabButtons[t.id] = b;
    tabbar.append(b);
  }

  const panel = el('div', 'panel');
  root.append(bar, tabbar, panel);

  function setTab(id) {
    tab = id;
    for (const t of TABS) tabButtons[t.id].classList.toggle('on', t.id === id);
    panel.replaceChildren();
    updatePanel = BUILDERS[id](panel);
    updatePanel();
  }

  // --- empire ---------------------------------------------------------------

  function buildEmpire(host) {
    const head = el('div', 'panel-head');
    head.append(el('span', 'panel-title', 'The Empire'));
    const modes = el('div', 'buymodes');
    for (const m of [1, 10, 100, 'max']) {
      const b = el('button', 'mode', m === 'max' ? 'MAX' : 'x' + m);
      b.addEventListener('click', () => {
        buyMode = m;
        for (const c of modes.children) c.classList.toggle('on', c === b);
        updatePanel();
      });
      if (m === buyMode) b.classList.add('on');
      modes.append(b);
    }
    head.append(modes);
    host.append(head);

    const rows = [];
    for (const st of STATIONS) {
      const row = el('div', 'station');
      row.style.setProperty('--hue', st.hue);

      const badge = el('div', 'st-badge');
      const lvl = el('span', 'st-level', '0');
      badge.append(lvl);

      const mid = el('div', 'st-mid');
      const nameRow = el('div', 'st-namerow');
      nameRow.append(el('span', 'st-name', st.name));
      const per = el('span', 'st-per');
      nameRow.append(per);
      const blurb = el('div', 'st-blurb', st.blurb);
      const track = el('div', 'st-track');
      const fill = el('i', 'st-fill');
      track.append(fill);
      const meta = el('div', 'st-meta');
      mid.append(nameRow, blurb, track, meta);

      const acts = el('div', 'st-acts');
      const buy = el('button', 'buy');
      const buyLabel = el('span', 'buy-label', 'BUY');
      const buyCost = el('span', 'buy-cost', '—');
      buy.append(buyLabel, buyCost);
      const hire = el('button', 'hire');
      acts.append(buy, hire);

      buy.addEventListener('click', () => app.actions.buy(st.id, buyMode));
      hire.addEventListener('click', () => app.actions.hire(st.id));

      row.append(badge, mid, acts);
      host.append(row);
      rows.push({ st, row, lvl, per, fill, meta, buy, buyLabel, buyCost, hire });
    }

    return function update() {
      const s = getState();
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const level = s.levels[r.st.id] || 0;
        // A station shows up once the one before it exists. Locked rows stay
        // in the list, greyed, so the ladder ahead is always visible.
        const prev = i === 0 ? 1 : s.levels[STATIONS[i - 1].id] || 0;
        const unlocked = level > 0 || prev > 0;
        r.row.classList.toggle('locked', !unlocked);
        r.row.classList.toggle('owned', level > 0);

        r.lvl.textContent = level;
        const auto = s.advisors.includes(r.st.id);

        if (level > 0) {
          const time = E.cycleTime(r.st, level);
          r.fill.style.width = (clamp01((s.cycles[r.st.id] || 0) / time) * 100).toFixed(1) + '%';
          r.per.textContent = money(E.stationPerSecond(s, r.st)) + '/s';
          const next = E.nextMilestone(level);
          r.meta.textContent =
            money(E.cycleRevenue(s, r.st)) +
            ' every ' +
            time.toFixed(2) +
            's' +
            (next ? '  ·  x2 at level ' + next.at : '  ·  maxed');
        } else {
          r.fill.style.width = '0%';
          r.per.textContent = '';
          r.meta.textContent = r.st.blurb ? 'Not yet yours.' : '';
        }

        const count = E.buyCount(r.st, level, s.cash, buyMode);
        const cost = E.costOf(r.st, level, Math.max(1, count));
        const canBuy = count > 0 && cost <= s.cash;
        r.buyLabel.textContent = level >= G.MAX_LEVEL ? 'MAXED' : 'BUY x' + Math.max(1, count);
        r.buyCost.textContent = level >= G.MAX_LEVEL ? '' : money(cost);
        r.buy.disabled = !canBuy || !unlocked;

        if (auto) {
          r.hire.textContent = r.st.advisor.name + ' · AUTO';
          r.hire.disabled = true;
          r.hire.classList.add('auto');
        } else {
          r.hire.classList.remove('auto');
          r.hire.textContent = 'HIRE ' + r.st.advisor.name + ' · ' + money(r.st.advisor.cost);
          r.hire.disabled = level <= 0 || s.cash < r.st.advisor.cost;
        }
      }
    };
  }

  // --- stakes ---------------------------------------------------------------

  function buildStakes(host) {
    host.append(el('div', 'panel-title', 'Stakes'));
    host.append(
      el(
        'p',
        'note',
        'Lock cash and it comes back later with T-Shares on top. Longer pays better, bigger pays better, and ending early costs you.'
      )
    );

    const form = el('div', 'stake-form');
    const priceEl = el('div', 'stake-price');
    const pctRow = el('div', 'chiprow');
    let pct = 0.25;
    for (const p of [0.1, 0.25, 0.5, 1]) {
      const b = el('button', 'chip', Math.round(p * 100) + '%');
      if (p === pct) b.classList.add('on');
      b.addEventListener('click', () => {
        pct = p;
        for (const c of pctRow.children) c.classList.toggle('on', c === b);
        updatePanel();
      });
      pctRow.append(b);
    }

    const termRow = el('div', 'chiprow');
    let term = E.STAKE_TERMS[0].id;
    for (const t of E.STAKE_TERMS) {
      const b = el('button', 'chip', t.label);
      if (t.id === term) b.classList.add('on');
      b.addEventListener('click', () => {
        term = t.id;
        for (const c of termRow.children) c.classList.toggle('on', c === b);
        updatePanel();
      });
      termRow.append(b);
    }

    const preview = el('div', 'stake-preview');
    const open = el('button', 'primary', 'OPEN STAKE');
    open.addEventListener('click', () => {
      const s = getState();
      app.actions.openStake(s.cash * pct, term);
      updatePanel();
    });
    form.append(priceEl, el('div', 'label', 'Amount'), pctRow, el('div', 'label', 'Length'), termRow, preview, open);
    host.append(form);

    const list = el('div', 'stake-list');
    host.append(list);
    let rendered = -1;

    return function update() {
      const s = getState();
      const price = E.sharePrice(s);
      const amount = s.cash * pct;
      const t = E.STAKE_TERMS.find((x) => x.id === term);
      priceEl.textContent = 'Share price ' + money(price) + ' · you hold ' + fmt(s.tshares) + ' T-Shares';
      preview.textContent =
        'Stake ' + money(amount) + ' for ' + t.label + ' → ' + fmt(E.stakeYield(amount, price, t)) + ' T-Shares';
      open.disabled = !(amount > 0);

      // Rebuild the list only when a stake is added or removed; the bars
      // inside it are updated in place every frame.
      if (rendered !== s.stakes.length) {
        rendered = s.stakes.length;
        list.replaceChildren();
        if (!s.stakes.length) list.append(el('p', 'note', 'No open stakes.'));
        for (const stake of s.stakes) {
          const card = el('div', 'stake');
          const head = el('div', 'stake-head');
          head.append(el('span', 'stake-amt', money(stake.principal)));
          head.append(el('span', 'stake-yield', '+' + fmt(stake.tshares) + ' T-Shares'));
          const track = el('div', 'st-track');
          const fill = el('i', 'st-fill');
          track.append(fill);
          const foot = el('div', 'stake-foot');
          const timeEl = el('span', 'stake-time');
          const btn = el('button', 'small');
          btn.addEventListener('click', () => {
            const cur = getState().stakes.find((x) => x.id === stake.id);
            if (!cur) return;
            if (cur.matured) app.actions.claimStake(stake.id);
            else app.actions.endStakeEarly(stake.id);
            updatePanel();
          });
          foot.append(timeEl, btn);
          card.append(head, track, foot);
          card._bind = { stake, fill, timeEl, btn };
          list.append(card);
        }
      }

      for (const card of list.children) {
        if (!card._bind) continue;
        const live = s.stakes.find((x) => x.id === card._bind.stake.id);
        if (!live) continue;
        const p = E.stakeProgress(live, s.clock);
        card._bind.fill.style.width = (p * 100).toFixed(1) + '%';
        if (live.matured) {
          card._bind.timeEl.textContent = 'Matured';
          card._bind.btn.textContent = 'CLAIM';
          card._bind.btn.className = 'small good';
        } else {
          card._bind.timeEl.textContent = duration(live.end - s.clock) + ' left';
          card._bind.btn.textContent = 'END EARLY · -' + money(E.earlyEndPenalty(live, s.clock));
          card._bind.btn.className = 'small bad';
        }
      }
    };
  }

  // --- perks ----------------------------------------------------------------

  function buildPerks(host) {
    host.append(el('div', 'panel-title', 'Permanent Perks'));
    host.append(el('p', 'note', 'Bought with T-Shares. Survives every Restake.'));
    const cards = [];
    for (const u of UPGRADES) {
      const card = el('div', 'perk');
      const top = el('div', 'perk-top');
      top.append(el('span', 'perk-name', u.name));
      const cost = el('span', 'perk-cost', fmt(u.cost) + ' TS');
      top.append(cost);
      card.append(top, el('div', 'perk-blurb', u.blurb));
      const btn = el('button', 'small', 'BUY');
      btn.addEventListener('click', () => {
        app.actions.buyUpgrade(u.id);
        updatePanel();
      });
      card.append(btn);
      host.append(card);
      cards.push({ u, card, btn, cost });
    }
    return function update() {
      const s = getState();
      for (const c of cards) {
        const owned = s.upgrades.includes(c.u.id);
        c.card.classList.toggle('owned', owned);
        c.btn.textContent = owned ? 'OWNED' : 'BUY';
        c.btn.disabled = owned || s.tshares < c.u.cost;
      }
    };
  }

  // --- quests ---------------------------------------------------------------

  function buildQuests(host) {
    host.append(el('div', 'panel-title', 'Quests'));
    const rows = [];
    for (const ch of CHAPTERS) {
      const block = el('div', 'chapter');
      const h = el('div', 'chapter-head');
      h.append(el('span', 'chapter-n', 'Chapter ' + ch.n));
      h.append(el('span', 'chapter-name', ch.name));
      block.append(h);
      for (const q of questsInChapter(ch.n)) {
        const row = el('div', 'quest');
        const text = el('div', 'quest-text', q.text);
        const track = el('div', 'st-track');
        const fill = el('i', 'st-fill');
        track.append(fill);
        const meta = el('div', 'quest-meta');
        row.append(text, track, meta);
        block.append(row);
        rows.push({ q, row, fill, meta });
      }
      host.append(block);
    }
    return function update() {
      const s = getState();
      for (const r of rows) {
        const { have, need, done } = G.questProgress(s, r.q);
        r.row.classList.toggle('done', done);
        r.fill.style.width = (clamp01(have / need) * 100).toFixed(1) + '%';
        r.meta.textContent = done
          ? 'Done · +' + r.q.reward + ' T-Shares'
          : fmt(Math.min(have, need)) + ' / ' + fmt(need) + '  ·  +' + r.q.reward + ' TS';
      }
    };
  }

  // --- restake --------------------------------------------------------------

  function buildRestake(host) {
    host.append(el('div', 'panel-title', 'Restake'));
    host.append(
      el(
        'p',
        'note',
        'Burn the run down to nothing and keep the Sacrifice Points. Cash, stations and advisors go. T-Shares, perks and quests stay. Open stakes are paid out in full first.'
      )
    );
    const stats = el('div', 'restake-stats');
    host.append(stats);
    const btn = el('button', 'primary', 'RESTAKE');
    btn.addEventListener('click', () => {
      app.actions.restake();
      updatePanel();
    });
    host.append(btn);
    const gate = el('p', 'note');
    host.append(gate);

    return function update() {
      const s = getState();
      const pending = E.pendingSacrifice(s);
      stats.replaceChildren(
        line('Sacrifice Points held', fmt(s.sacrificePoints)),
        line('Current bonus', '+' + ((E.sacrificeMult(s) - 1) * 100).toFixed(0) + '% income'),
        line('Points waiting', fmt(pending)),
        line('Bonus after Restake', '+' + (((1 + 0.02 * (s.sacrificePoints + pending)) - 1) * 100).toFixed(0) + '%'),
        line('Earned this run', money(s.runEarned))
      );
      const ready = G.canRestake(s);
      btn.disabled = !ready;
      gate.textContent =
        s.chapter < G.RESTAKE_CHAPTER
          ? 'Locked until you finish Chapter ' + (G.RESTAKE_CHAPTER - 1) + '.'
          : pending <= 0
            ? 'Earn more this run — there are no points waiting yet.'
            : 'Ready.';
    };

    function line(k, v) {
      const d = el('div', 'kv');
      d.append(el('span', 'k', k), el('span', 'v', v));
      return d;
    }
  }

  // --- about ----------------------------------------------------------------

  function buildAbout(host) {
    host.append(el('div', 'panel-title', 'About'));
    host.append(
      el(
        'p',
        'note',
        'PULSE TYCOON is a parody. It is a joke about crypto-influencer culture — livestreams, slogans, staking ladders and showrooms — in the shape of an idle clicker.'
      )
    );
    host.append(
      el(
        'p',
        'note',
        'It is not affiliated with, endorsed by, or connected to any real project, company or person. The character in the corner is a cartoon, not a portrayal. Nothing here is financial advice, and none of these numbers are real money.'
      )
    );
    const stats = el('div', 'restake-stats');
    host.append(stats);
    const wipe = el('button', 'small bad', 'WIPE SAVE');
    wipe.addEventListener('click', () => {
      if (wipe.dataset.armed) app.actions.wipe();
      else {
        wipe.dataset.armed = '1';
        wipe.textContent = 'TAP AGAIN TO CONFIRM';
      }
    });
    host.append(wipe);

    return function update() {
      const s = getState();
      stats.replaceChildren(
        kv('Time played', duration(s.stats.playTime)),
        kv('Taps', fmt(s.stats.taps)),
        kv('Stakes claimed', fmt(s.stats.stakesClaimed)),
        kv('Pumps', fmt(s.stats.pumps)),
        kv('Restakes', fmt(s.stats.restakes)),
        kv('Lifetime earnings', money(s.lifetimeEarned))
      );
    };
    function kv(k, v) {
      const d = el('div', 'kv');
      d.append(el('span', 'k', k), el('span', 'v', v));
      return d;
    }
  }

  const BUILDERS = {
    empire: buildEmpire,
    stakes: buildStakes,
    perks: buildPerks,
    quests: buildQuests,
    restake: buildRestake,
    about: buildAbout,
  };

  // --- top bar update -------------------------------------------------------

  function update() {
    const s = getState();
    cashEl.textContent = money(s.cash);
    rateEl.textContent = money(E.incomePerSecond(s)) + ' / sec';
    shareEl.textContent = fmt(s.tshares) + ' TS';
    spEl.textContent = fmt(s.sacrificePoints) + ' SP';
    const ready = G.pumpReady(s);
    const active = s.pumpUntil > s.clock;
    pumpBtn.disabled = !ready;
    pumpBtn.classList.toggle('active', active);
    pumpBtn.textContent = active
      ? 'x' + E.pumpMult(s) + ' ' + (s.pumpUntil - s.clock).toFixed(0) + 's'
      : ready
        ? 'PUMP'
        : duration(s.pumpReadyAt - s.clock);
    updatePanel();
  }

  setTab('empire');
  return { update, setTab };
}
