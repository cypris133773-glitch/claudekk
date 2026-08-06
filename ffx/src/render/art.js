// Every sprite in the game is drawn here, in code, from about a dozen
// primitives. Stylised silhouettes with a rim light rather than pixel art:
// forgiving at any resolution, sharp on a phone, and no binary assets.

const TAU = Math.PI * 2;

function shade(ctx, x0, y0, x1, y1, a, b) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  return g;
}

function blob(ctx, x, y, rx, ry, squash = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y + squash, rx, ry, 0, 0, TAU);
  ctx.fill();
}

function poly(ctx, pts, close = true) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (close) ctx.closePath();
}

function glow(ctx, x, y, r, color, alpha = 0.5) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'transparent');
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function eyes(ctx, x, y, spread, r, color, glowColor = color) {
  ctx.fillStyle = color;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 14;
  blob(ctx, x - spread, y, r, r * 1.15);
  blob(ctx, x + spread, y, r, r * 1.15);
  ctx.shadowBlur = 0;
}

/** Legs only swing while the field screen is moving the character. */
function walkPhase(state, t) {
  return state === 'walk' ? Math.sin(t * 2.2) * 0.5 : 0;
}

export function shadow(ctx, x, y, w, alpha = 0.34) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(x, y, w, w * 0.24, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/* ── party members ─────────────────────────────────────────────────────── */

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number,h:number,build:object,palette:object,t:number,
 *          state:string,flip:boolean,lunge:number}} o
 */
export function drawHero(ctx, o) {
  const { x, y, h, build, palette: p, t = 0 } = o;
  const state = o.state || 'idle';
  const flip = o.flip ? -1 : 1;
  const bob = Math.sin(t * 2.1) * h * 0.014;
  const lunge = o.lunge || 0;
  const cast = state === 'cast' ? Math.sin(t * 9) * 0.5 + 0.5 : 0;
  const ko = state === 'ko';

  ctx.save();
  ctx.translate(x + lunge * 26 * flip, y);
  ctx.scale(flip, 1);
  if (ko) {
    ctx.translate(0, h * 0.34);
    ctx.rotate(-0.9);
  }
  shadow(ctx, 0, 2, h * 0.2, ko ? 0.18 : 0.32);
  ctx.translate(0, bob);

  const bodyTop = -h * 0.7;
  const hipY = -h * 0.38;
  const headY = -h * 0.83;
  const shoulder = h * 0.165;
  const stride = walkPhase(state, t) * shoulder * 0.55;

  // legs — a little stride when moving so the field walk reads as walking
  ctx.fillStyle = p.dark;
  poly(ctx, [[-shoulder * 0.66, hipY], [-shoulder * 0.06, hipY],
    [-shoulder * 0.2 + stride, 0], [-shoulder * 0.76 + stride, 0]]);
  ctx.fill();
  poly(ctx, [[shoulder * 0.06, hipY], [shoulder * 0.66, hipY],
    [shoulder * 0.76 - stride, 0], [shoulder * 0.2 - stride, 0]]);
  ctx.fill();

  // torso — a tapered wedge reads as shoulders even at 40px tall
  ctx.fillStyle = shade(ctx, 0, bodyTop, 0, hipY, p.main, p.dark);
  poly(ctx, [
    [-shoulder, bodyTop + h * 0.05],
    [-shoulder * 0.82, bodyTop],
    [shoulder * 0.82, bodyTop],
    [shoulder, bodyTop + h * 0.05],
    [shoulder * 0.7, hipY],
    [-shoulder * 0.7, hipY],
  ]);
  ctx.fill();

  // neck
  ctx.fillStyle = '#d8b189';
  ctx.fillRect(-h * 0.022, bodyTop - h * 0.03, h * 0.044, h * 0.045);

  // silhouette layer — the thing that makes each of them readable at a glance
  ctx.fillStyle = p.dark;
  switch (build.cloak) {
    case 'coat': // Audit: long red coat off one shoulder
      ctx.fillStyle = shade(ctx, -shoulder, bodyTop, shoulder, 0, p.main, '#000');
      poly(ctx, [[-shoulder * 1.25, bodyTop], [shoulder * 0.4, bodyTop - h * 0.02],
        [shoulder * 0.5, -h * 0.06], [-shoulder * 1.5, -h * 0.02]]);
      ctx.fill();
      break;
    case 'gown': // Luna: wide belled gown
      ctx.fillStyle = shade(ctx, 0, hipY, 0, 0, p.main, '#05030a');
      poly(ctx, [[-shoulder * 0.8, hipY], [shoulder * 0.8, hipY],
        [shoulder * 1.55, 0], [-shoulder * 1.55, 0]]);
      ctx.fill();
      break;
    case 'obi': // Yield: summoner's skirt and sash
      ctx.fillStyle = shade(ctx, 0, hipY, 0, 0, '#f4f7ff', p.trim);
      poly(ctx, [[-shoulder * 0.8, hipY], [shoulder * 0.8, hipY],
        [shoulder * 1.15, 0], [-shoulder * 1.15, 0]]);
      ctx.fill();
      ctx.fillStyle = p.trim;
      ctx.fillRect(-shoulder * 0.85, hipY - h * 0.03, shoulder * 1.7, h * 0.045);
      break;
    case 'vest':
      ctx.fillStyle = p.trim;
      poly(ctx, [[-shoulder * 0.9, bodyTop + h * 0.05], [-shoulder * 0.25, bodyTop + h * 0.05],
        [-shoulder * 0.3, hipY], [-shoulder * 0.95, hipY]]);
      ctx.fill();
      poly(ctx, [[shoulder * 0.25, bodyTop + h * 0.05], [shoulder * 0.9, bodyTop + h * 0.05],
        [shoulder * 0.95, hipY], [shoulder * 0.3, hipY]]);
      ctx.fill();
      break;
    case 'pelt': // Copi: Ronso bulk
      ctx.fillStyle = shade(ctx, 0, bodyTop, 0, hipY, p.main, p.dark);
      blob(ctx, 0, bodyTop + h * 0.13, shoulder * 1.35, h * 0.17);
      break;
    case 'goggles':
    case 'jacket':
    default:
      ctx.fillStyle = p.trim;
      ctx.fillRect(-shoulder * 0.16, bodyTop + h * 0.05, shoulder * 0.32, h * 0.3);
      break;
  }

  // arms — drawn before the head so the weapon hand has something attached
  const armY = bodyTop + h * 0.055;
  const swingAngle = state === 'attack' ? -0.95 : cast ? -0.55 - cast * 0.35 : 0.3;
  ctx.strokeStyle = p.main;
  ctx.lineWidth = h * 0.036;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-shoulder * 0.86, armY);
  ctx.lineTo(-shoulder * 1.06, armY + h * 0.16 - stride * 0.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(shoulder * 0.86, armY);
  ctx.lineTo(shoulder * 0.86 + Math.sin(swingAngle + 0.6) * h * 0.15,
    armY + Math.cos(swingAngle + 0.6) * h * 0.15);
  ctx.stroke();

  // head
  const headR = h * 0.078;
  ctx.fillStyle = '#f0cfae';
  blob(ctx, 0, headY, headR, headR * 1.06);

  // hair
  ctx.fillStyle = p.hair || p.trim;
  switch (build.hair) {
    case 'spiky':
      // Swept back and to one side, so it reads as hair rather than a crown.
      blob(ctx, 0, headY - headR * 0.42, headR * 1.12, headR * 0.82);
      poly(ctx, [[-headR * 1.05, headY - headR * 0.5], [-headR * 2.1, headY - headR * 1.5],
        [-headR * 0.5, headY - headR * 1.15], [-headR * 1.2, headY - headR * 2.1],
        [headR * 0.1, headY - headR * 1.25], [headR * 0.7, headY - headR * 1.9],
        [headR * 1.05, headY - headR * 0.55]]);
      ctx.fill();
      break;
    case 'long':
      blob(ctx, 0, headY - headR * 0.35, headR * 1.12, headR * 0.85);
      poly(ctx, [[-headR, headY], [headR, headY], [headR * 0.8, headY + headR * 3.4], [-headR * 0.8, headY + headR * 3.4]]);
      ctx.fill();
      break;
    case 'bun':
      blob(ctx, 0, headY - headR * 0.5, headR * 1.15, headR * 0.9);
      blob(ctx, 0, headY - headR * 1.6, headR * 0.62, headR * 0.62);
      break;
    case 'flame':
      poly(ctx, [[-headR * 0.9, headY - headR * 0.4], [0, headY - headR * 2.6],
        [headR * 0.9, headY - headR * 0.4]]);
      ctx.fill();
      break;
    case 'tail':
      blob(ctx, 0, headY - headR * 0.42, headR * 1.1, headR * 0.8);
      poly(ctx, [[headR * 0.6, headY - headR * 0.6], [headR * 2.1, headY + headR * 1.2],
        [headR * 0.7, headY + headR * 0.4]]);
      ctx.fill();
      break;
    case 'braid':
      blob(ctx, 0, headY - headR * 0.45, headR * 1.1, headR * 0.85);
      ctx.fillRect(-headR * 1.5, headY + headR * 0.2, headR * 0.5, headR * 2.6);
      break;
    case 'horn':
      blob(ctx, 0, headY - headR * 0.4, headR * 1.14, headR * 0.9);
      ctx.fillStyle = p.trim;
      poly(ctx, [[-headR * 0.2, headY - headR * 0.9], [headR * 0.15, headY - headR * 2.9], [headR * 0.45, headY - headR * 0.85]]);
      ctx.fill();
      break;
    default:
      blob(ctx, 0, headY - headR * 0.4, headR * 1.1, headR * 0.85);
  }

  if (build.hair === 'goggles' || build.cloak === 'goggles') {
    ctx.fillStyle = '#0e2a1a';
    ctx.fillRect(-headR, headY - headR * 0.9, headR * 2, headR * 0.55);
  }

  // face
  if (!ko) eyes(ctx, 0, headY + headR * 0.05, headR * 0.36, headR * 0.14, '#141020', p.main);

  // weapon
  ctx.strokeStyle = p.trim;
  ctx.fillStyle = p.trim;
  ctx.lineCap = 'round';
  ctx.save();
  ctx.translate(shoulder * 0.86 + Math.sin(swingAngle + 0.6) * h * 0.15,
    armY + Math.cos(swingAngle + 0.6) * h * 0.15);
  ctx.rotate(swingAngle);
  switch (build.arm) {
    case 'sword':
      ctx.fillStyle = shade(ctx, 0, 0, 0, -h * 0.4, '#eaf6ff', p.main);
      poly(ctx, [[-h * 0.012, 0], [h * 0.012, 0], [h * 0.02, -h * 0.36], [0, -h * 0.42], [-h * 0.02, -h * 0.36]]);
      ctx.fill();
      break;
    case 'odachi':
      ctx.fillStyle = shade(ctx, 0, 0, 0, -h * 0.55, '#fff2e0', '#8a4a3a');
      poly(ctx, [[-h * 0.014, 0], [h * 0.016, 0], [h * 0.03, -h * 0.5], [-h * 0.004, -h * 0.56]]);
      ctx.fill();
      break;
    case 'staff':
      ctx.strokeStyle = '#d8c49a';
      ctx.lineWidth = h * 0.016;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.06);
      ctx.lineTo(0, -h * 0.44);
      ctx.stroke();
      ctx.fillStyle = p.trim;
      blob(ctx, 0, -h * 0.47, h * 0.038, h * 0.038);
      glow(ctx, 0, -h * 0.47, h * 0.13, p.trim, 0.75);
      break;
    case 'spear':
      ctx.strokeStyle = '#c9d6ff';
      ctx.lineWidth = h * 0.014;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.12);
      ctx.lineTo(0, -h * 0.48);
      ctx.stroke();
      ctx.fillStyle = '#eaf2ff';
      poly(ctx, [[-h * 0.026, -h * 0.44], [0, -h * 0.58], [h * 0.026, -h * 0.44]]);
      ctx.fill();
      break;
    case 'ball':
      ctx.fillStyle = '#f5f5f5';
      blob(ctx, h * 0.03, -h * 0.1, h * 0.055, h * 0.055);
      ctx.fillStyle = p.main;
      poly(ctx, [[h * 0.03, -h * 0.15], [h * 0.075, -h * 0.1], [h * 0.03, -h * 0.05], [-h * 0.015, -h * 0.1]]);
      ctx.fill();
      break;
    case 'doll':
      ctx.fillStyle = '#f8f0e0';
      blob(ctx, h * 0.03, -h * 0.08, h * 0.045, h * 0.05);
      ctx.fillStyle = p.trim;
      blob(ctx, h * 0.03, -h * 0.14, h * 0.028, h * 0.028);
      break;
    case 'claw':
      ctx.strokeStyle = p.trim;
      ctx.lineWidth = h * 0.01;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(0, -h * 0.05);
        ctx.lineTo(h * 0.05 + i * h * 0.01, -h * 0.02 + i * h * 0.03);
        ctx.stroke();
      }
      break;
    default: break;
  }
  ctx.restore();

  // rim light
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.4 + (state === 'cast' ? cast * 0.4 : 0);
  ctx.strokeStyle = p.main;
  ctx.lineWidth = Math.max(1, h * 0.007);
  poly(ctx, [[shoulder, bodyTop + h * 0.04], [shoulder * 0.78, hipY]], false);
  ctx.stroke();
  ctx.restore();

  if (state === 'cast') glow(ctx, 0, headY, h * 0.5, p.main, 0.22 + cast * 0.25);
  ctx.restore();
}

/* ── enemies ───────────────────────────────────────────────────────────── */

export function drawFoe(ctx, o) {
  const { x, y, size, shape, palette: p, t = 0 } = o;
  const state = o.state || 'idle';
  const s = size;
  const bob = Math.sin(t * 1.7 + (o.phase || 0)) * s * 0.03;
  const flap = Math.sin(t * 7 + (o.phase || 0));
  const ko = state === 'ko';

  ctx.save();
  ctx.translate(x + (o.lunge || 0) * -22, y);
  if (ko) {
    ctx.globalAlpha = 0.35;
    ctx.translate(0, s * 0.2);
    ctx.rotate(0.7);
  }
  shadow(ctx, 0, 0, s * 0.42, ko ? 0.14 : 0.3);
  ctx.translate(0, bob);

  const main = shade(ctx, 0, -s, 0, 0, p.main, p.dark);

  switch (shape) {
    case 'wasp':
    case 'moth': {
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.save();
      ctx.translate(0, -s * 0.62);
      ctx.rotate(flap * 0.35);
      blob(ctx, -s * 0.42, -s * 0.1, s * 0.4, s * 0.16);
      ctx.rotate(-flap * 0.7);
      blob(ctx, s * 0.42, -s * 0.1, s * 0.4, s * 0.16);
      ctx.restore();
      ctx.fillStyle = main;
      blob(ctx, 0, -s * 0.6, s * 0.2, s * 0.34);
      ctx.fillStyle = p.trim;
      blob(ctx, 0, -s * 0.86, s * 0.15, s * 0.15);
      eyes(ctx, 0, -s * 0.88, s * 0.06, s * 0.035, '#160a06', p.main);
      break;
    }
    case 'hound': {
      ctx.fillStyle = main;
      blob(ctx, 0, -s * 0.42, s * 0.38, s * 0.24);
      blob(ctx, -s * 0.36, -s * 0.6, s * 0.2, s * 0.17);
      ctx.fillStyle = p.trim;
      poly(ctx, [[-s * 0.48, -s * 0.72], [-s * 0.36, -s * 0.94], [-s * 0.26, -s * 0.7]]);
      ctx.fill();
      poly(ctx, [[s * 0.3, -s * 0.5], [s * 0.62, -s * 0.78], [s * 0.36, -s * 0.34]]);
      ctx.fill();
      eyes(ctx, -s * 0.4, -s * 0.62, s * 0.06, s * 0.032, '#ffea9e', p.trim);
      break;
    }
    case 'orb': {
      glow(ctx, 0, -s * 0.6, s * 0.7, p.main, 0.4);
      ctx.fillStyle = main;
      blob(ctx, 0, -s * 0.6, s * 0.34, s * 0.34);
      ctx.fillStyle = p.trim;
      ctx.font = `700 ${s * 0.2}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('↑', 0, -s * 0.52);
      break;
    }
    case 'flea': {
      ctx.fillStyle = main;
      blob(ctx, 0, -s * 0.34, s * 0.26, s * 0.2);
      ctx.strokeStyle = p.trim;
      ctx.lineWidth = s * 0.02;
      for (let i = -1; i <= 1; i += 2) {
        ctx.beginPath();
        ctx.moveTo(i * s * 0.12, -s * 0.3);
        ctx.lineTo(i * s * 0.34, -s * 0.56);
        ctx.lineTo(i * s * 0.42, -s * 0.1);
        ctx.stroke();
      }
      eyes(ctx, 0, -s * 0.38, s * 0.08, s * 0.04, '#0b2a24', p.main);
      break;
    }
    case 'plant': {
      ctx.fillStyle = p.dark;
      ctx.fillRect(-s * 0.05, -s * 0.5, s * 0.1, s * 0.5);
      ctx.fillStyle = main;
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.5 + Math.sin(t + i) * 0.06;
        ctx.save();
        ctx.translate(0, -s * 0.5);
        ctx.rotate(a);
        blob(ctx, 0, -s * 0.26, s * 0.1, s * 0.26);
        ctx.restore();
      }
      ctx.fillStyle = p.trim;
      blob(ctx, 0, -s * 0.52, s * 0.12, s * 0.12);
      break;
    }
    case 'brute': {
      ctx.fillStyle = main;
      blob(ctx, 0, -s * 0.5, s * 0.36, s * 0.36);
      blob(ctx, -s * 0.42, -s * 0.44, s * 0.15, s * 0.24);
      blob(ctx, s * 0.42, -s * 0.44, s * 0.15, s * 0.24);
      ctx.fillStyle = p.trim;
      blob(ctx, 0, -s * 0.86, s * 0.19, s * 0.17);
      eyes(ctx, 0, -s * 0.87, s * 0.08, s * 0.04, '#1a1020', p.main);
      break;
    }
    case 'drone': {
      ctx.fillStyle = main;
      poly(ctx, [[-s * 0.3, -s * 0.72], [s * 0.3, -s * 0.72], [s * 0.38, -s * 0.3], [-s * 0.38, -s * 0.3]]);
      ctx.fill();
      ctx.fillStyle = p.dark;
      ctx.fillRect(-s * 0.42, -s * 0.3, s * 0.84, s * 0.1);
      ctx.fillStyle = p.trim;
      blob(ctx, 0, -s * 0.52, s * 0.08, s * 0.08);
      glow(ctx, 0, -s * 0.52, s * 0.34, p.trim, 0.5);
      ctx.strokeStyle = p.trim;
      ctx.lineWidth = s * 0.015;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.72);
      ctx.lineTo(0, -s * 0.92);
      ctx.stroke();
      break;
    }
    case 'chest': {
      ctx.fillStyle = main;
      ctx.fillRect(-s * 0.34, -s * 0.5, s * 0.68, s * 0.5);
      ctx.fillStyle = p.trim;
      ctx.fillRect(-s * 0.36, -s * 0.56, s * 0.72, s * 0.1);
      ctx.fillStyle = '#2a1408';
      poly(ctx, [[-s * 0.3, -s * 0.46], [s * 0.3, -s * 0.46], [s * 0.22, -s * 0.28], [-s * 0.22, -s * 0.28]]);
      ctx.fill();
      ctx.fillStyle = '#fff';
      for (let i = -2; i <= 2; i++) {
        poly(ctx, [[i * s * 0.11 - s * 0.03, -s * 0.46], [i * s * 0.11 + s * 0.03, -s * 0.46], [i * s * 0.11, -s * 0.36]]);
        ctx.fill();
      }
      break;
    }
    case 'shill': {
      ctx.fillStyle = main;
      poly(ctx, [[-s * 0.2, -s * 0.66], [s * 0.2, -s * 0.66], [s * 0.3, 0], [-s * 0.3, 0]]);
      ctx.fill();
      ctx.fillStyle = '#f0cfae';
      blob(ctx, 0, -s * 0.78, s * 0.13, s * 0.14);
      ctx.fillStyle = p.trim;
      poly(ctx, [[-s * 0.16, -s * 0.86], [s * 0.16, -s * 0.86], [s * 0.2, -s * 0.94], [-s * 0.2, -s * 0.94]]);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(s * 0.16, -s * 0.5, s * 0.16, s * 0.22); // the phone
      glow(ctx, s * 0.24, -s * 0.39, s * 0.3, '#ffffff', 0.4);
      break;
    }
    case 'wraith': {
      glow(ctx, 0, -s * 0.55, s * 0.66, p.main, 0.3);
      ctx.fillStyle = main;
      poly(ctx, [[0, -s * 1], [s * 0.3, -s * 0.5], [s * 0.18, 0], [-s * 0.18, 0], [-s * 0.3, -s * 0.5]]);
      ctx.fill();
      ctx.fillStyle = p.trim;
      eyes(ctx, 0, -s * 0.74, s * 0.08, s * 0.045, p.trim, p.main);
      break;
    }
    case 'golem': {
      ctx.fillStyle = main;
      ctx.fillRect(-s * 0.34, -s * 0.82, s * 0.68, s * 0.62);
      ctx.fillStyle = p.dark;
      ctx.fillRect(-s * 0.46, -s * 0.74, s * 0.12, s * 0.4);
      ctx.fillRect(s * 0.34, -s * 0.74, s * 0.12, s * 0.4);
      ctx.fillStyle = p.trim;
      for (let i = 0; i < 4; i++) ctx.fillRect(-s * 0.26, -s * 0.74 + i * s * 0.12, s * 0.52, s * 0.03);
      eyes(ctx, 0, -s * 0.62, s * 0.1, s * 0.04, '#fff6d8', p.trim);
      break;
    }
    case 'bolt': {
      glow(ctx, 0, -s * 0.6, s * 0.8, p.main, 0.5);
      ctx.fillStyle = p.main;
      poly(ctx, [[-s * 0.1, -s], [s * 0.14, -s * 0.62], [s * 0.02, -s * 0.6],
        [s * 0.18, -s * 0.16], [-s * 0.06, -s * 0.5], [s * 0.04, -s * 0.52]]);
      ctx.fill();
      break;
    }
    case 'cactus': {
      ctx.fillStyle = main;
      blob(ctx, 0, -s * 0.44, s * 0.16, s * 0.32);
      blob(ctx, -s * 0.26, -s * 0.56, s * 0.09, s * 0.16);
      blob(ctx, s * 0.26, -s * 0.56, s * 0.09, s * 0.16);
      ctx.fillStyle = '#0d1a10';
      eyes(ctx, 0, -s * 0.62, s * 0.06, s * 0.035, '#0d1a10', p.trim);
      ctx.fillRect(-s * 0.04, -s * 0.48, s * 0.08, s * 0.03);
      break;
    }
    case 'flan': {
      ctx.fillStyle = main;
      ctx.beginPath();
      ctx.moveTo(-s * 0.36, 0);
      ctx.quadraticCurveTo(-s * 0.4, -s * 0.72, 0, -s * 0.72);
      ctx.quadraticCurveTo(s * 0.4, -s * 0.72, s * 0.36, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = p.trim;
      eyes(ctx, 0, -s * 0.46, s * 0.1, s * 0.045, p.trim, p.main);
      glow(ctx, 0, -s * 0.4, s * 0.6, p.main, 0.2);
      break;
    }
    case 'squid': {
      ctx.fillStyle = main;
      blob(ctx, 0, -s * 0.6, s * 0.28, s * 0.34);
      ctx.strokeStyle = p.main;
      ctx.lineWidth = s * 0.05;
      ctx.lineCap = 'round';
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * s * 0.09, -s * 0.34);
        ctx.quadraticCurveTo(i * s * 0.2 + Math.sin(t * 2 + i) * s * 0.08, -s * 0.16, i * s * 0.24, s * 0.02);
        ctx.stroke();
      }
      eyes(ctx, 0, -s * 0.66, s * 0.11, s * 0.05, p.trim, p.trim);
      break;
    }
    case 'crane': {
      ctx.strokeStyle = p.main;
      ctx.lineWidth = s * 0.06;
      ctx.beginPath();
      ctx.moveTo(-s * 0.1, 0);
      ctx.lineTo(-s * 0.1, -s * 0.9);
      ctx.lineTo(s * 0.5, -s * 0.78);
      ctx.stroke();
      ctx.lineWidth = s * 0.02;
      ctx.beginPath();
      ctx.moveTo(s * 0.44, -s * 0.78);
      ctx.lineTo(s * 0.44, -s * 0.44);
      ctx.stroke();
      ctx.fillStyle = p.trim;
      blob(ctx, s * 0.44, -s * 0.36, s * 0.14, s * 0.1);
      glow(ctx, s * 0.44, -s * 0.36, s * 0.4, p.trim, 0.4);
      ctx.fillStyle = main;
      ctx.fillRect(-s * 0.3, -s * 0.36, s * 0.4, s * 0.36);
      break;
    }
    case 'maester': {
      ctx.fillStyle = main;
      poly(ctx, [[-s * 0.16, -s * 0.78], [s * 0.16, -s * 0.78], [s * 0.42, 0], [-s * 0.42, 0]]);
      ctx.fill();
      ctx.fillStyle = p.trim;
      poly(ctx, [[-s * 0.16, -s * 0.78], [s * 0.16, -s * 0.78], [s * 0.2, -s * 0.3], [-s * 0.2, -s * 0.3]]);
      ctx.fill();
      ctx.fillStyle = '#f0cfae';
      blob(ctx, 0, -s * 0.9, s * 0.12, s * 0.13);
      // the watch
      ctx.fillStyle = '#ffe98f';
      blob(ctx, s * 0.3, -s * 0.36, s * 0.07, s * 0.07);
      glow(ctx, s * 0.3, -s * 0.36, s * 0.28, '#ffe98f', 0.7);
      eyes(ctx, 0, -s * 0.91, s * 0.05, s * 0.028, '#20102a', p.trim);
      break;
    }
    case 'templar': {
      ctx.fillStyle = main;
      poly(ctx, [[-s * 0.24, -s * 0.8], [s * 0.24, -s * 0.8], [s * 0.3, 0], [-s * 0.3, 0]]);
      ctx.fill();
      ctx.fillStyle = p.trim;
      poly(ctx, [[-s * 0.34, -s * 0.62], [0, -s * 0.72], [s * 0.34, -s * 0.62], [s * 0.3, -s * 0.2], [0, -s * 0.02], [-s * 0.3, -s * 0.2]]);
      ctx.fill();
      ctx.fillStyle = p.dark;
      blob(ctx, 0, -s * 0.9, s * 0.13, s * 0.14);
      eyes(ctx, 0, -s * 0.9, s * 0.055, s * 0.03, '#ffdf9e', p.trim);
      break;
    }
    case 'choir': {
      for (let i = -1; i <= 1; i++) {
        ctx.fillStyle = i === 0 ? main : p.dark;
        poly(ctx, [[i * s * 0.3 - s * 0.13, -s * 0.66], [i * s * 0.3 + s * 0.13, -s * 0.66],
          [i * s * 0.3 + s * 0.2, 0], [i * s * 0.3 - s * 0.2, 0]]);
        ctx.fill();
        ctx.fillStyle = p.trim;
        blob(ctx, i * s * 0.3, -s * 0.74, s * 0.09, s * 0.1);
      }
      glow(ctx, 0, -s * 0.5, s * 0.8, p.trim, 0.25);
      break;
    }
    case 'larva': {
      ctx.fillStyle = main;
      ctx.beginPath();
      ctx.moveTo(-s * 0.4, 0);
      for (let i = 0; i <= 10; i++) {
        const u = i / 10;
        ctx.lineTo(-s * 0.4 + u * s * 0.8, -s * 0.4 - Math.sin(u * Math.PI) * s * 0.34 - Math.sin(t * 2 + u * 6) * s * 0.03);
      }
      ctx.lineTo(s * 0.4, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = p.trim;
      for (let i = 0; i < 3; i++) blob(ctx, -s * 0.16 + i * s * 0.16, -s * 0.56, s * 0.04, s * 0.04);
      glow(ctx, 0, -s * 0.5, s * 0.7, p.trim, 0.28);
      break;
    }
    case 'dragon':
    case 'wyrm': {
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.save();
      ctx.translate(0, -s * 0.66);
      ctx.rotate(flap * 0.18);
      poly(ctx, [[0, 0], [-s * 0.9, -s * 0.34], [-s * 0.5, s * 0.2]]);
      ctx.fill();
      ctx.rotate(-flap * 0.36);
      poly(ctx, [[0, 0], [s * 0.9, -s * 0.34], [s * 0.5, s * 0.2]]);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = main;
      blob(ctx, 0, -s * 0.62, s * 0.26, s * 0.3);
      poly(ctx, [[-s * 0.1, -s * 0.86], [s * 0.34, -s * 1.02], [s * 0.1, -s * 0.72]]);
      ctx.fill();
      ctx.fillStyle = p.trim;
      eyes(ctx, s * 0.12, -s * 0.9, s * 0.05, s * 0.03, p.trim, p.main);
      break;
    }
    case 'maiden': {
      ctx.fillStyle = main;
      poly(ctx, [[-s * 0.14, -s * 0.72], [s * 0.14, -s * 0.72], [s * 0.34, 0], [-s * 0.34, 0]]);
      ctx.fill();
      ctx.fillStyle = p.trim;
      blob(ctx, 0, -s * 0.84, s * 0.12, s * 0.13);
      glow(ctx, 0, -s * 0.6, s * 0.75, p.main, 0.35);
      ctx.strokeStyle = p.trim;
      ctx.lineWidth = s * 0.012;
      ctx.beginPath();
      ctx.arc(0, -s * 0.84, s * 0.24, Math.PI, 0);
      ctx.stroke();
      break;
    }
    case 'ronin': {
      ctx.fillStyle = main;
      poly(ctx, [[-s * 0.2, -s * 0.7], [s * 0.2, -s * 0.7], [s * 0.28, 0], [-s * 0.28, 0]]);
      ctx.fill();
      ctx.fillStyle = p.dark;
      poly(ctx, [[-s * 0.3, -s * 0.78], [s * 0.3, -s * 0.78], [0, -s * 0.94]]);
      ctx.fill();
      ctx.strokeStyle = p.trim;
      ctx.lineWidth = s * 0.02;
      ctx.beginPath();
      ctx.moveTo(-s * 0.3, -s * 0.2);
      ctx.lineTo(s * 0.36, -s * 0.46);
      ctx.stroke();
      break;
    }
    case 'steed': {
      ctx.fillStyle = main;
      blob(ctx, 0, -s * 0.44, s * 0.38, s * 0.2);
      blob(ctx, s * 0.34, -s * 0.66, s * 0.16, s * 0.13);
      ctx.fillStyle = p.trim;
      poly(ctx, [[s * 0.44, -s * 0.76], [s * 0.52, -s * 1.06], [s * 0.34, -s * 0.74]]);
      ctx.fill();
      glow(ctx, s * 0.46, -s * 0.9, s * 0.4, p.trim, 0.5);
      break;
    }
    case 'chained': {
      ctx.fillStyle = main;
      poly(ctx, [[-s * 0.24, -s * 0.9], [s * 0.24, -s * 0.9], [s * 0.34, 0], [-s * 0.34, 0]]);
      ctx.fill();
      ctx.strokeStyle = p.trim;
      ctx.lineWidth = s * 0.016;
      for (let i = -1; i <= 1; i += 2) {
        ctx.beginPath();
        ctx.moveTo(i * s * 0.3, -s * 0.7);
        ctx.lineTo(i * s * 0.52, 0);
        ctx.stroke();
      }
      ctx.fillStyle = p.dark;
      blob(ctx, 0, -s * 0.98, s * 0.14, s * 0.15);
      glow(ctx, 0, -s * 0.5, s * 0.9, p.trim, 0.25);
      break;
    }
    case 'parasite': {
      glow(ctx, 0, -s * 0.5, s * 0.9, p.main, 0.5);
      ctx.fillStyle = main;
      blob(ctx, 0, -s * 0.5, s * 0.18, s * 0.14);
      ctx.strokeStyle = p.trim;
      ctx.lineWidth = s * 0.012;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + t * 0.4;
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.5);
        ctx.lineTo(Math.cos(a) * s * 0.44, -s * 0.5 + Math.sin(a) * s * 0.34);
        ctx.stroke();
      }
      break;
    }
    default: {
      ctx.fillStyle = main;
      blob(ctx, 0, -s * 0.45, s * 0.32, s * 0.34);
      eyes(ctx, 0, -s * 0.5, s * 0.1, s * 0.045, p.trim, p.main);
    }
  }

  if (state === 'cast') glow(ctx, 0, -s * 0.5, s * 1.1, p.trim, 0.3);
  ctx.restore();
}

/** Portrait badge used in menus and the turn rail. */
export function drawPortrait(ctx, x, y, r, palette, build, isAeon = false) {
  ctx.save();
  ctx.translate(x, y);
  const g = ctx.createRadialGradient(0, -r * 0.3, r * 0.1, 0, 0, r);
  g.addColorStop(0, palette.main);
  g.addColorStop(1, palette.dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.98, 0, TAU);
  ctx.clip();
  drawHero(ctx, { x: 0, y: r * 1.5, h: r * 2.9, build: build || { arm: '', cloak: '', hair: '' }, palette, t: 0, state: 'idle' });
  ctx.restore();
  ctx.strokeStyle = isAeon ? '#ff58c8' : palette.trim;
  ctx.lineWidth = Math.max(1.4, r * 0.09);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.stroke();
  ctx.restore();
}
