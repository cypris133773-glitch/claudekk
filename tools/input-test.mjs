// Verifies the player can actually control the game, which unit tests cannot
// cover: a real touch drag must move the character, and the mouse must still
// work when pointer lock is refused (the iframe case).
//
// Needs a browser, so it is not part of `npm test`:
//   npm start
//   npx playwright-core install chromium   # or set CHROME to an existing one
//   node tools/input-test.mjs
import { chromium } from 'playwright-core';

const URL = process.argv[2] || 'http://localhost:8080/';
const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
});

const startRun = async (page) => {
  await page.evaluate(async () => {
    const B = window.BLOCKFRAY;
    const m = await import('./src/data/classes.js').catch(() => import('/src/data/classes.js'));
    B.menus.show(null);
    B.game.startRun(m.CLASS_BY_ID.warrior);
    B.__input = B.input || null;
  });
  // Enable input the way the real start path does.
  await page.evaluate(() => { window.BLOCKFRAY.input.setEnabled(true); });
  await page.waitForTimeout(200);
};

// ---- 1. Touch: drag on the left half must move the player -----------------
{
  const ctx = await browser.newContext({
    viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('TOUCH PAGEERROR', e.message));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await startRun(page);

  const before = await page.evaluate(() => {
    const p = window.BLOCKFRAY.game.player;
    return { x: p.x, z: p.z, yaw: p.yaw };
  });

  // Left half drag = movement stick.
  await page.touchscreen.tap(200, 300);
  const cdp = await ctx.newCDPSession(page);
  const touchSeq = async (type, x, y) => {
    await cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
    });
  };
  await touchSeq('touchStart', 200, 300);
  for (let i = 0; i < 12; i++) {
    await touchSeq('touchMove', 200, 300 - i * 5);
    await page.waitForTimeout(16);
  }
  const stick = await page.evaluate(() => {
    const B = window.BLOCKFRAY;
    const j = B.input.joystick;
    return {
      joystick: !!j,
      stickDx: j ? +(j.x - j.ox).toFixed(1) : null,
      stickDy: j ? +(j.y - j.oy).toFixed(1) : null,
      speed: +Math.hypot(B.game.player.vx, B.game.player.vz).toFixed(2),
    };
  });
  await touchSeq('touchEnd', 200, 240);

  // Right half drag = look.
  await touchSeq('touchStart', 650, 200);
  for (let i = 0; i < 10; i++) {
    await touchSeq('touchMove', 650 + i * 8, 200);
    await page.waitForTimeout(16);
  }
  await touchSeq('touchEnd', 730, 200);
  const yawAfter = await page.evaluate(() => window.BLOCKFRAY.game.player.yaw);
  const yawDelta = Math.abs(yawAfter - before.yaw);

  console.log('TOUCH stick:', JSON.stringify(stick), 'yawDelta:', yawDelta.toFixed(3));
  console.log('TOUCH  =>', (stick.stickDy < -20 && stick.speed > 0.5 && yawDelta > 0.05) ? 'WORKS' : 'BROKEN');
  await ctx.close();
}

// ---- 2. Mouse with pointer lock refused ------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('MOUSE PAGEERROR', e.message));
  await page.addInitScript(() => {
    // Simulate an iframe that does not allow pointer lock.
    Element.prototype.requestPointerLock = function () {
      const err = new Error('pointer lock blocked');
      document.dispatchEvent(new Event('pointerlockerror'));
      return Promise.reject(err);
    };
  });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await startRun(page);

  const mouseYawBefore = await page.evaluate(() => window.BLOCKFRAY.game.player.yaw);
  await page.mouse.move(500, 320);
  await page.mouse.down();
  for (let i = 0; i < 12; i++) {
    await page.mouse.move(500 + i * 10, 320);
    await page.waitForTimeout(16);
  }
  const res = await page.evaluate(() => {
    const B = window.BLOCKFRAY;
    return {
      attack: B.input.mouseDown === true,
      dragLook: B.input.dragLook === true,
      blocked: B.input.pointerLockBlocked,
      yaw: B.game.player.yaw,
    };
  });
  await page.mouse.up();
  const mouseYawDelta = Math.abs(res.yaw - mouseYawBefore);
  console.log('MOUSE (lock refused):', JSON.stringify(res), 'yawDelta:', mouseYawDelta.toFixed(3));
  console.log('MOUSE  =>', (res.attack && mouseYawDelta > 0.05) ? 'WORKS' : 'BROKEN');
  await ctx.close();
}

await browser.close();
