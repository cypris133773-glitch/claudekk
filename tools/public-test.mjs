#!/usr/bin/env node
/**
 * Two browsers finding each other with no code passed between them.
 *
 *   node tools/public-test.mjs
 *
 * `duel-test.mjs` carries the invite codes from one page to the other, which
 * is exactly what a human does. This one does not: the host publishes, the
 * joiner lists and clicks, and the only thing connecting them is a server.
 *
 * That server is the real one — `api/rooms.js`, imported and called with the
 * same request shapes Vercel would hand it — backed by an in-process stand-in
 * for the key-value store. What is under test is the handshake, not Upstash.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRAGMENT = path.join(ROOT, 'dist/craftarena-fragment.html');

const require_ = createRequire(import.meta.url);
async function loadChromium() {
  for (const r of [process.env.PW_MODULES, ROOT,
    '/tmp/claude-0/-home-user-claudekk/6e1ff4ef-d006-50e3-98cf-f197651cae20/scratchpad'].filter(Boolean)) {
    try {
      const p = require_.resolve('playwright-core', { paths: [r] });
      const m = await import(`file://${p}`);
      const c = m.chromium || (m.default && m.default.chromium);
      if (c) return c;
    } catch { /* next */ }
  }
  throw new Error('playwright-core not found; set PW_MODULES');
}
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

// --- the key-value store, in one object -----------------------------------
//
// Enough Redis to run the function: get/set with EX, the set commands, and
// expiry. Real TTL behaviour is not simulated — nothing in a twenty-second
// test expires — but every command the function issues is answered.
const store = new Map();
const sets = new Map();
function redis(args) {
  const [cmd, ...rest] = args;
  switch (cmd) {
    case 'get': return store.has(rest[0]) ? store.get(rest[0]) : null;
    case 'set': store.set(rest[0], rest[1]); return 'OK';
    case 'del': store.delete(rest[0]); return 1;
    case 'smembers': return [...(sets.get(rest[0]) || [])];
    case 'sadd': {
      if (!sets.has(rest[0])) sets.set(rest[0], new Set());
      sets.get(rest[0]).add(rest[1]); return 1;
    }
    case 'srem': { const s = sets.get(rest[0]); if (s) s.delete(rest[1]); return 1; }
    case 'scard': return (sets.get(rest[0]) || new Set()).size;
    case 'expire': return 1;
    default: throw new Error('unhandled redis command: ' + cmd);
  }
}

// A fake Upstash REST endpoint the function will talk to.
const kvServer = http.createServer((req, res) => {
  const parts = req.url.slice(1).split('/').map(decodeURIComponent);
  let result = null;
  try { result = redis(parts); } catch (e) {
    res.writeHead(400).end(JSON.stringify({ error: e.message })); return;
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ result }));
});
await new Promise((r) => kvServer.listen(0, '127.0.0.1', r));
process.env.KV_REST_API_URL = `http://127.0.0.1:${kvServer.address().port}`;
process.env.KV_REST_API_TOKEN = 'test';

const { default: handler } = await import(`file://${path.join(ROOT, 'api/rooms.js')}`);

// The game, plus /api/rooms wired to the real handler.
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/rooms') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const shim = {
      method: req.method,
      query: Object.fromEntries(url.searchParams),
      body: raw ? JSON.parse(raw) : null,
    };
    const out = {
      _status: 200, _headers: {},
      setHeader(k, v) { this._headers[k] = v; },
      status(c) { this._status = c; return this; },
      end(body) {
        res.writeHead(this._status, this._headers);
        res.end(body);
      },
    };
    await handler(shim, out);
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(FRAGMENT));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '[PASS]' : '[FAIL]'} ${name.padEnd(42)} ${detail || ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const chromium = await loadChromium();
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox',
    '--disable-dev-shm-usage', '--force-webrtc-ip-handling-policy=default'],
});
const ctxA = await browser.newContext({ viewport: { width: 900, height: 600 } });
const ctxB = await browser.newContext({ viewport: { width: 900, height: 600 } });
const host = await ctxA.newPage();
const join = await ctxB.newPage();
const errors = [];
for (const p of [host, join]) {
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.CRAFTARENA && window.CRAFTARENA.game, null, { timeout: 30000 });
}

console.log('\npublic matchmaking, end to end\n');

const mk = (page, cls, name) => page.evaluate(({ cls, name }) => {
  const B = window.CRAFTARENA;
  const c = B.CLASSES.find((x) => x.id === cls);
  const ch = B.profile.createCharacter(c.id);
  ch.name = name;
  ch.xp = 200000;
  B.profile.data.activeChar = ch.id;
  B.profile.save();
  return ch.id;
}, { cls, name });

const a = await mk(host, 'warrior', 'Alpha');
const b = await mk(join, 'mage', 'Bravo');

const avail = await host.evaluate(() => window.CRAFTARENA.lobby.checkMatchmaking());
check('the deployment reports matchmaking on', avail === true, avail ? 'store reachable' : 'off');

// --- host publishes -------------------------------------------------------
await host.evaluate((charId) => window.CRAFTARENA.lobby.hostPublic('1v1', charId), a);
const listed = await host.waitForFunction(() => window.CRAFTARENA.lobby.publicId, null, { timeout: 20000 })
  .then(() => true).catch(() => false);
check('hosting publishes a room', listed, listed ? 'listed' : 'never listed');

// --- the joiner sees it, with no code having moved ------------------------
const seen = await join.evaluate(async () => {
  const B = window.CRAFTARENA;
  await B.lobby.refreshRooms(true);
  return B.lobby.rooms.map((r) => `${r.name}/${r.mode}`);
});
check('the other browser sees it in the list', seen.length === 1 && seen[0] === 'Alpha/1v1',
  seen.join(', ') || 'empty list');

// --- one tap ---------------------------------------------------------------
const roomId = await join.evaluate(() => window.CRAFTARENA.lobby.rooms[0].id);
await join.evaluate(({ id, charId }) => window.CRAFTARENA.lobby.joinPublic(id, charId),
  { id: roomId, charId: b });

const connected = await host.waitForFunction(
  () => window.CRAFTARENA.lobby.match && window.CRAFTARENA.lobby.match.roster.size >= 2,
  null, { timeout: 30000 }).then(() => true).catch(() => false);
check('they connect with no code passed', connected,
  connected ? 'two browsers, one click' : 'never connected');

if (connected) {
  const roster = await host.evaluate(() =>
    window.CRAFTARENA.lobby.match.seats().map((s) => `${s.name}/${s.classId}`));
  check('the host knows who joined', roster.length === 2 && roster[1].startsWith('Bravo'),
    roster.join('  '));

  // The room must be gone: a filled seat left listed is a seat two people
  // click and one of them waits forever for.
  const after = await join.evaluate(async () => {
    await window.CRAFTARENA.lobby.refreshRooms(true);
    return window.CRAFTARENA.lobby.rooms.length;
  });
  check('a filled game leaves the list', after === 0, `${after} still listed`);

  await host.evaluate(() => window.CRAFTARENA.lobby.begin());
  const started = await Promise.all([host, join].map((p) =>
    p.waitForFunction(() => window.CRAFTARENA.game.mode === 'duel' && window.CRAFTARENA.game.running,
      null, { timeout: 25000 }).then(() => true).catch(() => false)));
  check('both sides enter the arena', started[0] && started[1],
    started[0] && started[1] ? 'match live' : 'one side never started');

  if (started[0] && started[1]) {
    const worlds = await Promise.all([host, join].map((p) => p.evaluate(() => {
      const d = window.CRAFTARENA.game.world.data;
      let h = 2166136261;
      for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 16777619); }
      return (h >>> 0).toString(16);
    })));
    check('both built the identical arena', worlds[0] === worlds[1], worlds.join(' / '));
  }
}

// --- a name from a stranger is text, not markup ---------------------------
//
// A room name is the only string in this game that did not come from the
// repository. It is typed by somebody else and rendered on your screen.
const xss = await join.evaluate(async () => {
  const B = window.CRAFTARENA;
  const evil = '<img src=x onerror="window.__pwned=1">';
  B.lobby.matchmaking = true;
  B.lobby.rooms = [{ id: 'AAAAAA', name: evil, mode: '1v1', build: B.menus.ctx.build, at: Date.now() }];
  // Building the screen refreshes the list, which would replace the planted
  // room with the real (empty) one before it was ever rendered. The
  // controller rate-limits that to one fetch every four seconds, so a fresh
  // timestamp is what holds the fixture still.
  B.lobby.roomsAt = Date.now();
  B.lobby.leave();
  B.lobby.matchmaking = true;
  B.lobby.rooms = [{ id: 'AAAAAA', name: evil, mode: '1v1', build: B.menus.ctx.build, at: Date.now() }];
  B.lobby.roomsAt = Date.now();
  B.menus.show('duel');
  await new Promise((r) => setTimeout(r, 250));
  const row = document.querySelector('.room-name');
  return { pwned: !!window.__pwned, text: row ? row.textContent : null };
});
check('a hostile room name is shown, not run', !xss.pwned && xss.text && xss.text.includes('<img'),
  xss.pwned ? 'SCRIPT EXECUTED' : 'rendered as text');

check('no runtime errors', errors.length === 0, errors.slice(0, 2).join(' | ') || 'clean');

await browser.close();
server.close();
kvServer.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
