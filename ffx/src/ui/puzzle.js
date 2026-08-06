// Cloister of Tokenomics — the temple puzzle. Push glowing spheres onto the
// pedestals. The mechanism is a hydraulic ram and a mirror, and the priest is
// not going to tell you that.

import { el, button, clear } from '../core/dom.js';
import { audio } from '../core/audio.js';

// # wall, . floor, @ player, o sphere, x pedestal, * sphere already on pedestal
const LEVELS = [
  [
    '########',
    '#..x...#',
    '#..o...#',
    '#..@...#',
    '#......#',
    '########',
  ],
  [
    '#########',
    '#x..#...#',
    '#..o....#',
    '#..@..o.#',
    '#...#..x#',
    '#########',
  ],
  [
    '##########',
    '#x...#...#',
    '#.o..o..x#',
    '#..@.....#',
    '#..#..o..#',
    '#x.......#',
    '##########',
  ],
  [
    '##########',
    '#x..#...x#',
    '#.o...o..#',
    '#..#@#...#',
    '#.o...o..#',
    '#x..#...x#',
    '##########',
  ],
];

const FLAVOUR = [
  'The plaque says the solution has not changed in a thousand years. The plaque is the only thing that has been maintained.',
  'A priest watches you work and takes notes on a tablet that is not switched on.',
  'The temple charges admission to this room. You are, technically, doing unpaid labour.',
  'Every sphere is engraved with the words TRUST THE PROCESS on the underside, where nobody can see it.',
];

export function runPuzzle(app, level = 0) {
  return new Promise((resolve) => {
    const src = LEVELS[Math.min(level, LEVELS.length - 1)];
    let grid = src.map((row) => row.split(''));
    let player = { x: 0, y: 0 };
    let moves = 0;

    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        if (grid[y][x] === '@') { player = { x, y }; grid[y][x] = '.'; }
      }
    }
    const pedestals = new Set();
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        if (grid[y][x] === 'x' || grid[y][x] === '*') pedestals.add(`${x},${y}`);
      }
    }

    const boardEl = el('div', { class: 'puzzle-board' });
    const status = el('div', { class: 'puzzle-status' });
    const wrap = el('div', { class: 'modal-wrap puzzle' },
      el('div', { class: 'modal wide' },
        el('h2', {}, 'Cloister of Tokenomics'),
        el('p', { class: 'fine' }, FLAVOUR[Math.min(level, FLAVOUR.length - 1)]),
        boardEl,
        status,
        el('div', { class: 'puzzle-pad' },
          el('div'), button('▲', () => move(0, -1), { class: 'btn pad' }), el('div'),
          button('◀', () => move(-1, 0), { class: 'btn pad' }),
          button('↺', () => reset(), { class: 'btn pad' }),
          button('▶', () => move(1, 0), { class: 'btn pad' }),
          el('div'), button('▼', () => move(0, 1), { class: 'btn pad' }), el('div'),
        ),
        el('div', { class: 'puzzle-actions' },
          button('Bribe the priest (skip)', () => {
            audio.sfx('chest');
            app.toast('You paid a man in robes to look away. Extremely lore-accurate.', '');
            close(true);
          }, { class: 'btn small' }),
        ),
      ),
    );

    function reset() {
      grid = src.map((row) => row.split(''));
      for (let y = 0; y < grid.length; y++) {
        for (let x = 0; x < grid[y].length; x++) {
          if (grid[y][x] === '@') { player = { x, y }; grid[y][x] = '.'; }
        }
      }
      moves = 0;
      audio.sfx('cancel');
      draw();
    }

    function at(x, y) { return grid[y]?.[x] ?? '#'; }
    function isPed(x, y) { return pedestals.has(`${x},${y}`); }

    function move(dx, dy) {
      const nx = player.x + dx, ny = player.y + dy;
      const target = at(nx, ny);
      if (target === '#') { audio.sfx('error'); return; }
      if (target === 'o' || target === '*') {
        const bx = nx + dx, by = ny + dy;
        const beyond = at(bx, by);
        if (beyond === '#' || beyond === 'o' || beyond === '*') { audio.sfx('error'); return; }
        grid[ny][nx] = isPed(nx, ny) ? 'x' : '.';
        grid[by][bx] = isPed(bx, by) ? '*' : 'o';
        audio.sfx('hit');
      } else {
        audio.sfx('cursor');
      }
      player = { x: nx, y: ny };
      moves++;
      draw();
      if (solved()) {
        audio.sfx('levelup');
        status.textContent = `Solved in ${moves} moves. The door opens. Nobody has ever checked what is behind it.`;
        setTimeout(() => close(true), 1400);
      }
    }

    function solved() {
      for (const key of pedestals) {
        const [x, y] = key.split(',').map(Number);
        if (grid[y][x] !== '*') return false;
      }
      return true;
    }

    function draw() {
      clear(boardEl);
      boardEl.style.setProperty('--cols', String(grid[0].length));
      for (let y = 0; y < grid.length; y++) {
        for (let x = 0; x < grid[y].length; x++) {
          const c = grid[y][x];
          const isP = player.x === x && player.y === y;
          const cls = c === '#' ? 'wall' : c === 'o' ? 'orb' : c === '*' ? 'orb set' : c === 'x' ? 'ped' : 'floor';
          boardEl.append(el('div', { class: `cell ${cls} ${isP ? 'you' : ''}` },
            isP ? '◉' : c === 'o' || c === '*' ? '●' : c === 'x' ? '◇' : ''));
        }
      }
      const left = [...pedestals].filter((k) => {
        const [x, y] = k.split(',').map(Number);
        return grid[y][x] !== '*';
      }).length;
      status.textContent = `${left} pedestal${left === 1 ? '' : 's'} unfilled · ${moves} moves`;
    }

    function onKey(e) {
      const map = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
      const m = map[e.key];
      if (m) { e.preventDefault(); move(...m); }
      if (e.key === 'r') reset();
      if (e.key === 'Escape') close(false);
    }

    function close(won) {
      window.removeEventListener('keydown', onKey);
      wrap.remove();
      resolve(won);
    }

    // swipe support
    let sx = 0, sy = 0;
    boardEl.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
    boardEl.addEventListener('pointerup', (e) => {
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
      if (Math.abs(dx) > Math.abs(dy)) move(Math.sign(dx), 0);
      else move(0, Math.sign(dy));
    });

    window.addEventListener('keydown', onKey);
    app.ui.append(wrap);
    draw();
  });
}
