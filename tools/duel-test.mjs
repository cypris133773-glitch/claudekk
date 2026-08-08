#!/usr/bin/env node
/**
 * A whole hosted match, played by two real browsers.
 *
 *   node tools/duel-test.mjs [--headed]
 *
 * `net-test.mjs` proves the pipe works. This proves the *game* works over it,
 * which is a different and much easier thing to get wrong. Two browser
 * contexts load the shipped build, one hosts and one joins, and the invite
 * codes are carried between them by this script exactly as a human would carry
 * them through a chat window.
 *
 * What it is actually watching for is the four ways a mode like this fails
 * silently:
 *
 *   1. The two arenas are not the same. A joiner standing in a wall the host
 *      cannot see is the classic peer-to-peer bug, and it is invisible until
 *      someone walks into it — so the world is hashed on both sides and
 *      compared byte for byte.
 *   2. Input does not arrive. The joiner presses forward; if the host's copy
 *      of that player does not move, the joiner is a spectator.
 *   3. Snapshots do not arrive. The host moves; if the joiner's ghost of it
 *      stays put, the joiner is playing alone.
 *   4. Damage does not cross. Two players who cannot hurt each other is a
 *      chat room with a jump button.
 *
 * Nothing here calls into the netcode to fake a step. The only thing this
 * script does that a player does not is set the two profiles up and copy the
 * codes, because there is no second human.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRAGMENT = path.join(ROOT, 'dist/craftarena-fragment.html');
const HEADED = process.argv.includes('--headed');

const require_ = createRequire(import.meta.url);
async function loadChromium() {
  const roots = [
    process.env.PW_MODULES, ROOT, process.env.SCRATCHPAD,
    '/tmp/claude-0/-home-user-claudekk/6e1ff4ef-d006-50e3-98cf-f197651cae20/scratchpad',
  ].filter(Boolean);
  for (const r of roots) {
    try {
      const p = require_.resolve('playwright-core', { paths: [r] });
      const m = await import(`file://${p}`);
      const c = m.chromium || (m.default && m.default.chromium);
      if (c) return c;
    } catch { /* next */ }
  }
  throw new Error('playwright-core not found; set PW_MODULES');
}

const CHROME = process.env.CHROME_PATH
  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

if (!fs.existsSync(FRAGMENT)) {
  console.error('dist/craftarena-fragment.html missing — run: npm run build:fragment');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(FRAGMENT));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const chromium = await loadChromium();
const browser = await chromium.launch({
  executablePath: CHROME,
  headless: !HEADED,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader',
    '--no-sandbox', '--disable-dev-shm-usage',
    '--force-webrtc-ip-handling-policy=default'],
});

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '[PASS]' : '[FAIL]'} ${name.padEnd(40)} ${detail || ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Two separate contexts, so the two profiles are two different players rather
// than one player looking at themselves.
const ctxA = await browser.newContext({ viewport: { width: 900, height: 560 } });
const ctxB = await browser.newContext({ viewport: { width: 900, height: 560 } });
const host = await ctxA.newPage();
const join = await ctxB.newPage();
const errors = { host: [], join: [] };
host.on('pageerror', (e) => errors.host.push(e.message));
join.on('pageerror', (e) => errors.join.push(e.message));

for (const p of [host, join]) {
  await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.CRAFTARENA && window.CRAFTARENA.game, null, { timeout: 30000 });
}

console.log('\nhosted duel, end to end\n');

/**
 * Give a page a character worth duelling with.
 *
 * Level 20 rather than level 1, because a duel between two characters with one
 * skill each proves the wire works and nothing about the mode. This is the one
 * place the test reaches past the UI, and only because the alternative is
 * playing forty waves twice.
 */
async function makeCharacter(page, className, name) {
  return page.evaluate(({ className, name }) => {
    const B = window.CRAFTARENA;
    const cls = B.CLASSES.find((c) => c.name === className);
    const ch = B.profile.createCharacter(cls.id);
    ch.name = name;
    // Straight onto the record rather than through finishRun: the point is a
    // level-20 character, not a simulated evening of play.
    ch.xp = 200000;
    B.profile.data.activeChar = ch.id;
    B.profile.save();
    return { id: ch.id, level: B.profile.level(ch.id), cls: cls.id };
  }, { className, name });
}

const charA = await makeCharacter(host, 'Warrior', 'Alpha');
const charB = await makeCharacter(join, 'Mage', 'Bravo');
check('both sides have a character', charA.level > 5 && charB.level > 5,
  `Alpha lv${charA.level} · Bravo lv${charB.level}`);

// --- the handshake, exactly as two people would do it ---------------------

const invite = await host.evaluate(async (charId) => {
  const B = window.CRAFTARENA;
  await B.lobby.host('1v1', charId);
  return B.lobby.invites[0].code;
}, charA.id);
check('host makes an invite code', typeof invite === 'string' && invite.length > 100,
  `${invite.length} characters`);

const reply = await join.evaluate(async ({ code, charId }) => {
  const B = window.CRAFTARENA;
  B.lobby.startJoin(charId);
  await B.lobby.submitOffer(code);
  return B.lobby.answer || B.lobby.error;
}, { code: invite, charId: charB.id });
check('joiner makes a reply code', reply.length > 100, `${reply.length} characters`);

await host.evaluate(async (code) => {
  await window.CRAFTARENA.lobby.acceptAnswer('p1', code);
}, reply);

const seated = await host.waitForFunction(
  () => window.CRAFTARENA.lobby.match.roster.size >= 2, null, { timeout: 20000 })
  .then(() => true).catch(() => false);
check('the joiner takes a seat', seated, seated ? '2 of 2 players' : 'never connected');

if (!seated) { await finish(); }

const roster = await host.evaluate(() =>
  window.CRAFTARENA.lobby.match.seats().map((s) => `${s.name}/${s.classId}/${s.team}`));
check('roster names both characters and sides',
  roster.length === 2 && roster[0].endsWith('/0') && roster[1].endsWith('/1'),
  roster.join('  '));

// --- into the arena -------------------------------------------------------

await host.evaluate(() => window.CRAFTARENA.lobby.begin());
const started = await Promise.all([host, join].map((p) =>
  p.waitForFunction(() => window.CRAFTARENA.game.mode === 'duel'
    && window.CRAFTARENA.game.running, null, { timeout: 25000 })
    .then(() => true).catch(() => false)));
check('both sides enter the match', started[0] && started[1],
  started[0] && started[1] ? 'host and joiner in the arena' : 'one side never started');

if (!(started[0] && started[1])) { await finish(); }

/**
 * A cheap fingerprint of the generated world.
 *
 * The whole block array, folded down to one number. Two arenas that differ by
 * a single block give different hashes, which is exactly the sensitivity this
 * needs — "nearly the same room" is the failure being looked for.
 */
const worldHash = (p) => p.evaluate(() => {
  const d = window.CRAFTARENA.game.world.data;
  let h = 2166136261;
  for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
});
const [hashA, hashB] = await Promise.all([worldHash(host), worldHash(join)]);
check('both built the identical arena', hashA === hashB, `${hashA} / ${hashB}`);

const spawns = await host.evaluate(() => {
  const g = window.CRAFTARENA.game;
  return g.fighters.map((f) => ({ id: f.duelId, t: f.duelTeam, x: +f.x.toFixed(1), z: +f.z.toFixed(1) }));
});
const apart = Math.hypot(spawns[0].x - spawns[1].x, spawns[0].z - spawns[1].z);
check('the two start apart and facing off', spawns.length === 2 && apart > 20,
  `${apart.toFixed(1)} blocks between them`);

// --- input crosses the wire ----------------------------------------------

// The joiner holds forward. Nothing is called on the host: the only path from
// this line to the host's simulation is the data channel.
const joinerStart = await host.evaluate(() => {
  const f = window.CRAFTARENA.game.fighters.find((x) => x.duelId !== 'h');
  return { x: f.x, z: f.z };
});
await join.evaluate(() => {
  const p = window.CRAFTARENA.game.player;
  window.__jx = p.x; window.__jz = p.z;
});
// A real key, through the real handler. Setting input.state directly would
// prove nothing: poll() rebuilds movement from the held keys every frame.
await join.keyboard.down('KeyW');
await wait(1600);
await join.keyboard.up('KeyW');
await wait(300);

const joinerMoved = await host.evaluate((s) => {
  const f = window.CRAFTARENA.game.fighters.find((x) => x.duelId !== 'h');
  return Math.hypot(f.x - s.x, f.z - s.z);
}, joinerStart);
// Reported alongside, so a failure says which half broke: the joiner not
// moving locally is a focus or a wall, and the joiner moving while the host
// disagrees is the wire.
const joinerLocal = await join.evaluate(() => {
  const g = window.CRAFTARENA.game;
  const p = g.player;
  return {
    moved: +Math.hypot(p.x - window.__jx, p.z - window.__jz).toFixed(2),
    enabled: window.CRAFTARENA.input.enabled,
    inWall: g.world.isSolid(p.x - Math.sin(p.yaw) * 1.2, p.y + 0.9, p.z - Math.cos(p.yaw) * 1.2),
    seq: window.CRAFTARENA.lobby.match.seq,
  };
});
check('joiner input drives the host simulation', joinerMoved > 2,
  `${joinerMoved.toFixed(1)} blocks on the host; joiner itself moved `
  + `${joinerLocal.moved}, input ${joinerLocal.enabled ? 'on' : 'OFF'}, `
  + `${joinerLocal.inWall ? 'wall ahead' : 'clear ahead'}, ${joinerLocal.seq} inputs sent`);

// --- snapshots cross the wire --------------------------------------------

const ghostStart = await join.evaluate(() => {
  const g = window.CRAFTARENA.game.fighters.find((x) => x.duelId === 'h');
  return { x: g.x, z: g.z };
});
await host.keyboard.down('KeyW');
await wait(1600);
await host.keyboard.up('KeyW');
await wait(300);

const ghostMoved = await join.evaluate((s) => {
  const g = window.CRAFTARENA.game.fighters.find((x) => x.duelId === 'h');
  return Math.hypot(g.x - s.x, g.z - s.z);
}, ghostStart);
check('host snapshots move the joiner\'s view', ghostMoved > 2,
  `${ghostMoved.toFixed(1)} blocks seen by the joiner`);

// The joiner's own body must agree with where the host thinks it is. This is
// the prediction/correction loop, and it drifting is the one bug that makes a
// duel unplayable without ever looking broken.
const drift = await join.evaluate(async () => {
  const B = window.CRAFTARENA;
  const p = B.game.player;
  const snap = B.game.lastOwnSnap;
  return snap ? Math.hypot(p.x - snap.x, p.z - snap.z) : -1;
});
if (drift >= 0) {
  check('the joiner agrees with the host about itself', drift < 1.5,
    `${drift.toFixed(2)} blocks apart`);
}

// --- damage crosses the wire ---------------------------------------------

const hpBefore = await join.evaluate(() =>
  window.CRAFTARENA.game.player.hp);
// Walk the host into the joiner and swing. Real movement and a real attack
// button; the damage is resolved by the host and has to come back as health.
await host.evaluate(() => {
  const B = window.CRAFTARENA;
  const g = B.game;
  const me = g.player;
  const foe = g.fighters.find((f) => f !== me);
  // Stand next to them and look at them, then hold attack. Placing the body
  // is not cheating the netcode — it is skipping a walk across the arena that
  // the movement check above already proved works.
  me.x = foe.x + 1.2; me.z = foe.z;
  me.y = foe.y;
  me.yaw = Math.atan2(-(foe.x - me.x), -(foe.z - me.z));
});
// Attacking is holding the left button on the view, which is what a player
// does. The auto-attack setting turns a held button into repeated swings.
await host.mouse.move(450, 280);
await host.mouse.down();
await wait(900);
await host.mouse.up();
await wait(400);

const hpAfter = await join.evaluate(() => window.CRAFTARENA.game.player.hp);
check('a hit on the host lands on the joiner', hpAfter < hpBefore,
  `${Math.round(hpBefore)} → ${Math.round(hpAfter)} health`);

// Read once the fight has actually stopped. A Warrior leaves a bleed, so for
// a few seconds after the last swing the two sides are *supposed* to disagree
// by whatever ticked between the joiner's last snapshot and this line — that
// is latency working, not a desync. What must be true is that they converge
// once nothing is happening, so the check waits for the bleed to run out and
// then demands they agree exactly.
await wait(4000);
const settled = await Promise.all([
  host.evaluate(() => {
    const g = window.CRAFTARENA.game;
    return Math.round(g.fighters.find((f) => f !== g.player).hp);
  }),
  join.evaluate(() => Math.round(window.CRAFTARENA.game.player.hp)),
]);
check('host and joiner settle on the same health', settled[0] === settled[1],
  `host says ${settled[0]}, joiner says ${settled[1]}`);

// --- rounds ---------------------------------------------------------------

const scored = await host.evaluate(async () => {
  const g = window.CRAFTARENA.game;
  const foe = g.fighters.find((f) => f !== g.player);
  const before = g.duelScore.score.slice();
  // Kill them outright. The round logic is what is under test here, not the
  // twenty seconds of swinging that would otherwise get there.
  foe.hp = 0; foe.dead = true;
  await new Promise((r) => setTimeout(r, 400));
  return { before, after: g.duelScore.score.slice(), round: g.duelScore.round };
});
check('a wipe scores the round', scored.after[0] === scored.before[0] + 1,
  `${scored.before.join('-')} → ${scored.after.join('-')}, round ${scored.round}`);

const roundReset = await host.evaluate(async () => {
  const g = window.CRAFTARENA.game;
  // Wait out the break, then check everyone is up again and back on a mark.
  await new Promise((r) => setTimeout(r, 6000));
  const foe = g.fighters.find((f) => f !== g.player);
  const apart = Math.hypot(foe.x - g.player.x, foe.z - g.player.z);
  return { alive: !foe.dead && foe.hp === foe.maxHp, apart: +apart.toFixed(1) };
});
check('the next round puts everyone back', roundReset.alive && roundReset.apart > 20,
  `both alive, ${roundReset.apart} blocks apart`);

const joinerScore = await join.evaluate(() => window.CRAFTARENA.game.duelScore.score.slice());
check('the joiner is told the score', joinerScore[0] === scored.after[0],
  `joiner sees ${joinerScore.join('-')}`);

// --- nothing was paid out -------------------------------------------------

const paid = await host.evaluate(() => {
  const B = window.CRAFTARENA;
  return { souls: B.game.soulsEarned, xp: B.game.xpEarned, rewards: !!B.game.noRewards };
});
check('a duel pays nothing', paid.souls === 0 && paid.xp === 0 && paid.rewards,
  'no gold, no XP, no progress');

check('no runtime errors on either side',
  errors.host.length === 0 && errors.join.length === 0,
  errors.host.concat(errors.join).slice(0, 2).join(' | ') || 'clean');

await finish();

async function finish() {
  await browser.close();
  server.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}
