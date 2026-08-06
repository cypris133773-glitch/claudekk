// Shops. The markup is editorial.

import { el, button, clear, fmt } from '../core/dom.js';
import { audio } from '../core/audio.js';
import { ITEMS } from '../data/items.js';
import { addItem } from '../game/party.js';

const PATTER = [
  '"Prices are up because demand is up. Demand is up because prices are up."',
  '"No refunds. Refunds are a centralised concept."',
  '"That one is sold out. It has been sold out since launch. It is very successful."',
  '"I take PLS, favours, and unstaked positions at a haircut."',
  '"Everything here is audited by me, personally, in my head, this morning."',
  '"Buy two and I will tell you which maester is lying. It is all of them. That will be 400 PLS."',
];

export function openShop(app, ev) {
  return new Promise((resolve) => {
    const state = app.state;
    const wrap = el('div', { class: 'modal-wrap shop' });
    const wallet = el('div', { class: 'shop-wallet' });
    const list = el('div', { class: 'shop-list' });

    function refresh() {
      wallet.textContent = `${fmt(state.pls)} PLS`;
      clear(list);
      for (const id of ev.stock) {
        const it = ITEMS[id];
        if (!it) continue;
        const owned = state.inv[id] || 0;
        const afford = state.pls >= it.price;
        list.append(el('div', { class: 'shop-row' },
          el('div', { class: 'shop-info' },
            el('b', {}, it.name),
            el('i', {}, it.desc),
          ),
          el('span', { class: 'shop-owned' }, owned ? `have ${owned}` : ''),
          button(`${fmt(it.price)} PLS`, () => {
            if (state.pls < it.price) { audio.sfx('error'); app.toast('Insufficient liquidity.', 'bad'); return; }
            state.pls -= it.price;
            addItem(state, id, 1);
            audio.sfx('chest');
            refresh();
          }, { class: `btn small ${afford ? 'primary' : ''}`, disabled: !afford }),
        ));
      }
    }

    wrap.append(el('div', { class: 'modal wide' },
      el('div', { class: 'shop-head' },
        el('h2', {}, 'Shop'),
        wallet,
      ),
      el('p', { class: 'fine' }, PATTER[Math.floor(Math.random() * PATTER.length)]),
      list,
      button('Leave', () => { audio.sfx('cancel'); wrap.remove(); resolve(); }, { class: 'btn big' }),
    ));
    app.ui.append(wrap);
    refresh();
  });
}
