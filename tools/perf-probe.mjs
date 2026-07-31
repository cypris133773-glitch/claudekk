// Measure what a genuinely busy frame costs, and where.
//
//   node tools/perf-probe.mjs            # arena, wave 25, 30 mobs
//   node tools/perf-probe.mjs 40 40      # wave 40, 40 mobs
//
// The earlier probe read six live mobs off a fresh run and told us nothing:
// six mobs is not a busy frame. This one spawns the crowd itself, so the
// numbers are of the scene the player actually complains about.
//
// Reports draw calls, GL state changes, and the wall time of game.draw()
// split into the passes it is made of. Software rasteriser, so the absolute
// milliseconds mean nothing — the ratios and the call counts are the point.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRAGMENT = path.join(ROOT, 'dist', 'craftarena-fragment.html');

async function loadChromium() {
  const roots = [process.env.PW_MODULES, ROOT, process.env.SCRATCHPAD].filter(Boolean);
  for (const r of roots) {
    try {
      const p = require_.resolve('playwright-core', { paths: [r] });
      const m = await import(`file://${p}`);
      const c = m.chromium || (m.default && m.default.chromium);
      if (c) return c;
    } catch { /* try the next root */ }
  }
  throw new Error('playwright-core not found; set PW_MODULES');
}

const CHROME = process.env.CHROME_PATH
  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const LAUNCH_ARGS = [
  '--use-gl=swiftshader', '--enable-unsafe-swiftshader',
  '--no-sandbox', '--disable-dev-shm-usage',
];

const HOST_HTML = `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>host</title>
<style>html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#000}
#f{position:absolute;inset:0;width:100%;height:100%;border:0;display:block}</style>
</head><body>
<iframe id="f" src="/game.html" sandbox="allow-scripts"></iframe>
</body></html>`;

function startServer() {
  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(url === '/game.html' ? fs.readFileSync(FRAGMENT, 'utf8') : HOST_HTML);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const wave = Number(process.argv[2] || 25);
const crowd = Number(process.argv[3] || 30);

const chromium = await loadChromium();
const { server, port } = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: LAUNCH_ARGS });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await context.newPage();
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
const frame = page.frames().find((f) => f !== page.mainFrame());
await frame.waitForFunction(() => !!window.CRAFTARENA, null, { timeout: 20000 });

const report = await frame.evaluate(({ wave, crowd }) => {
  const B = window.CRAFTARENA;
  const g = B.game;
  B.menus.show(null);
  g.startRun(B.CLASSES[0]);
  g.wave = wave;

  // Ring the player with a real crowd at fighting distance, which is where
  // every silhouette part is still drawn and the cost is highest.
  const ids = Object.keys(B.MOB_TYPES).filter((k) => !B.MOB_TYPES[k].boss);
  const px = g.player.x, pz = g.player.z;
  for (let i = 0; i < crowd; i++) {
    const a = (i / crowd) * Math.PI * 2;
    const r = 5 + (i % 4) * 2.5;
    const x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
    const y = g.world.groundAt(x, z, g.player.y + 8) + 1;
    g.spawnMob(ids[i % ids.length], x, y, z, i % 6 === 0);
  }
  // And the transient debris a fight at that size actually carries.
  for (let i = 0; i < 6; i++) g.burst(px + i, g.player.y, pz + i, 12, '#ff8844');

  // Wrap the GL context so every call is counted, and every redundant one
  // is visible as its own number.
  const gl = g.r.gl;
  const counts = { draw: 0, uniform: 0, vao: 0, redundantUniform: 0, redundantVao: 0 };
  const last = {};
  let lastVao = null;
  const wrap = (name, key) => {
    const orig = gl[name].bind(gl);
    gl[name] = (...a) => {
      if (key) {
        const loc = a[0];
        const sig = name + '|' + a.slice(1).join(',');
        const prev = last.get ? null : last[locKey(loc)];
        if (prev === sig) counts.redundantUniform++;
        last[locKey(loc)] = sig;
        counts.uniform++;
      }
      return orig(...a);
    };
  };
  const locIds = new Map();
  let nextLoc = 0;
  const locKey = (loc) => {
    if (!locIds.has(loc)) locIds.set(loc, nextLoc++);
    return locIds.get(loc);
  };
  for (const n of Object.keys(gl.__proto__ || {})) { /* nothing */ }
  for (const n of ['uniform1f', 'uniform1i', 'uniform2f', 'uniform3f', 'uniform4f',
    'uniform2fv', 'uniform3fv', 'uniform4fv', 'uniformMatrix4fv']) wrap(n, true);
  const origVao = gl.bindVertexArray.bind(gl);
  gl.bindVertexArray = (v) => {
    counts.vao++;
    if (v === lastVao) counts.redundantVao++;
    lastVao = v;
    return origVao(v);
  };
  const origDraw = gl.drawArrays.bind(gl);
  gl.drawArrays = (...a) => { counts.draw++; return origDraw(...a); };

  // Time the passes. finish() after each so the rasteriser's work lands in
  // the pass that asked for it rather than all at the end.
  const t = {};
  const mark = (k, fn) => { const s = performance.now(); fn(); gl.finish(); t[k] = performance.now() - s; };

  const cam = g.camera;
  mark('sim', () => { for (let i = 0; i < 6; i++) g.update(1 / 60, B.input.poll(1 / 60)); });

  const before = { ...counts };
  mark('beginFrame', () => g.r.beginFrame(cam, g.r.skyTint));
  mark('world', () => g.r.drawWorld());
  mark('shadows', () => g.drawShadows());
  mark('mobs', () => { for (const m of g.mobs) m.draw(g.r); });
  mark('auras', () => g.drawAuras());
  mark('sky', () => g.r.drawSky());
  mark('particles', () => { for (const p of g.particles) p.draw(g.r); });
  mark('viewmodel', () => { if (!g.player.dead) g.player.drawViewModel(g.r, cam); });

  const live = g.mobs.filter((m) => !m.dead).length;
  return {
    wave: g.wave, live, particles: g.particles.length, gibs: g.gibs.length,
    counts, before, t,
  };
}, { wave, crowd });

const { counts, before, t } = report;
console.log(`wave ${report.wave} | live mobs ${report.live} | particles ${report.particles} | gibs ${report.gibs}`);
console.log('');
console.log('one frame:');
console.log(`  draw calls        ${counts.draw - before.draw}`);
console.log(`  uniform sets      ${counts.uniform - before.uniform}   (redundant ${counts.redundantUniform - before.redundantUniform})`);
console.log(`  VAO binds         ${counts.vao - before.vao}   (redundant ${counts.redundantVao - before.redundantVao})`);
console.log('');
console.log('pass timings (swiftshader — read the ratios, not the ms):');
const total = Object.entries(t).filter(([k]) => k !== 'sim').reduce((a, [, v]) => a + v, 0);
for (const [k, v] of Object.entries(t)) {
  const pct = k === 'sim' ? '' : `  ${(v / total * 100).toFixed(0)}%`;
  console.log(`  ${k.padEnd(12)} ${v.toFixed(1)} ms${pct}`);
}
console.log(`  ${'DRAW TOTAL'.padEnd(12)} ${total.toFixed(1)} ms`);

await browser.close();
server.close();
