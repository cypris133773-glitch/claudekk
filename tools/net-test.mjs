// Two real browser pages, one WebRTC data channel, no server in between.
//
// This is the load-bearing test for hosted PvP. Everything else in the mode is
// ordinary game code; the part that can silently not work is whether two
// browsers can be talked into a direct connection using nothing but a string a
// human carried between them.
//
//   node tools/net-test.mjs

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadChromium() {
  for (const r of [process.env.PW_MODULES, ROOT].filter(Boolean)) {
    try {
      const p = require_.resolve('playwright-core', { paths: [r] });
      const m = await import(`file://${p}`);
      return m.chromium || (m.default && m.default.chromium);
    } catch { /* next */ }
  }
  throw new Error('playwright-core not found; set PW_MODULES');
}

const CHROME = process.env.CHROME_PATH
  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

// The module under test, served as an importable ES module so the page runs
// exactly the source the game ships rather than a copy.
const PAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<script type="module">
  import { Peer, peerSupported, _codec } from '/peer.js';
  window.Peer = Peer;
  window.peerSupported = peerSupported;
  window._codec = _codec;
  window.__ready = true;
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  if (req.url.split('?')[0] === '/peer.js') {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    res.end(fs.readFileSync(path.join(ROOT, 'src', 'net', 'peer.js'), 'utf8'));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(PAGE);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const chromium = await loadChromium();
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage',
    // Loopback candidates are enough for two pages on one machine, and asking
    // for them explicitly keeps this test off the public internet.
    '--force-webrtc-ip-handling-policy=default'],
});

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '[PASS]' : '[FAIL]'} ${name.padEnd(38)} ${detail || ''}`);
};

const ctxA = await browser.newContext();
const ctxB = await browser.newContext();
const host = await ctxA.newPage();
const join = await ctxB.newPage();
for (const p of [host, join]) {
  p.on('pageerror', (e) => console.log('   pageerror:', e.message));
  await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__ready, null, { timeout: 15000 });
}

console.log('\nhosted PvP transport\n');

check('WebRTC is available', await host.evaluate(() => window.peerSupported()), '');

// --- the handshake, exactly as two people would do it --------------------
const offer = await host.evaluate(async () => {
  window.__host = new window.Peer({
    onMessage: (m) => { (window.__got = window.__got || []).push(m); },
    onOpen: () => { window.__open = true; },
  });
  return window.__host.createOffer();
});
check('host makes an invite code', typeof offer === 'string' && offer.length > 40,
  `${offer.length} characters`);

const answer = await join.evaluate(async (code) => {
  window.__join = new window.Peer({
    onMessage: (m) => { (window.__got = window.__got || []).push(m); },
    onOpen: () => { window.__open = true; },
  });
  return window.__join.acceptOffer(code);
}, offer);
check('joiner answers with a code', typeof answer === 'string' && answer.length > 40,
  `${answer.length} characters`);

await host.evaluate((code) => window.__host.acceptAnswer(code), answer);

const connected = await Promise.all([
  host.waitForFunction(() => window.__open === true, null, { timeout: 15000 })
    .then(() => true).catch(() => false),
  join.waitForFunction(() => window.__open === true, null, { timeout: 15000 })
    .then(() => true).catch(() => false),
]);
check('the channel opens on both ends', connected[0] && connected[1],
  connected[0] && connected[1] ? 'direct connection, no server' : 'timed out');

if (connected[0] && connected[1]) {
  // --- traffic in both directions ----------------------------------------
  await host.evaluate(() => {
    for (let i = 0; i < 20; i++) window.__host.send({ t: 'snap', n: i, x: 1.5, y: 2, z: 3 });
  });
  await join.evaluate(() => {
    for (let i = 0; i < 20; i++) window.__join.send({ t: 'input', n: i, move: [1, 0] });
  });
  await new Promise((r) => setTimeout(r, 900));

  const gotJoin = await join.evaluate(() => (window.__got || []).length);
  const gotHost = await host.evaluate(() => (window.__got || []).length);
  // Unreliable and unordered by design, so some loss is correct behaviour —
  // but on loopback nothing should actually be dropped.
  check('host -> joiner carries messages', gotJoin >= 18, `${gotJoin} of 20 arrived`);
  check('joiner -> host carries messages', gotHost >= 18, `${gotHost} of 20 arrived`);

  const shape = await join.evaluate(() => {
    const m = (window.__got || []).find((x) => x.t === 'snap');
    return m && m.x === 1.5 && m.z === 3;
  });
  check('payloads survive the trip', !!shape, 'fields intact');
}

// --- the codec, which is what a human actually handles -------------------
const codec = await host.evaluate(() => {
  const nl = String.fromCharCode(13) + String.fromCharCode(10);
  const d = { type: 'offer', sdp: `v=0${nl}o=- 1 2 IN IP4 127.0.0.1${nl}` };
  const round = window._codec.decodeCode(window._codec.encodeCode(d));
  let rejected = false;
  try { window._codec.decodeCode('not a code'); } catch { rejected = true; }
  let rejectedEmpty = false;
  try { window._codec.decodeCode('   '); } catch { rejectedEmpty = true; }
  // A code pasted with a line break in it, which is what happens in practice.
  const wrapped = window._codec.encodeCode(d);
  // A real newline. Written as a char code because this function is
  // serialised to the page, where a backslash-n in the source stays two
  // characters and would test nothing.
  const split = wrapped.slice(0, 10) + String.fromCharCode(10) + '  ' + wrapped.slice(10);
  let survivesWrap = false;
  try { survivesWrap = window._codec.decodeCode(split).sdp === d.sdp; } catch { /* no */ }
  return { same: round.sdp === d.sdp && round.type === 'offer', rejected, rejectedEmpty, survivesWrap };
});
check('invite codes round-trip', codec.same, '');
check('a bad code is refused, not crashed into', codec.rejected && codec.rejectedEmpty, '');
check('a code pasted across lines still works', codec.survivesWrap, 'whitespace stripped');

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
