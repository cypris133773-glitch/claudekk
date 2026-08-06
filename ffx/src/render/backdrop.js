// Parallax regions, drawn from the `region` block on each chapter. Layer shapes
// are generated from a hash of their index so they stay put while the camera
// moves, without storing anything.

const TAU = Math.PI * 2;

const hash = (n) => {
  let x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

export class Backdrop {
  constructor() {
    this.particles = [];
    this.flash = 0;
    this.lastWeather = null;
  }

  reset(weather) {
    this.particles.length = 0;
    this.lastWeather = weather;
  }

  update(dt, region, w, h) {
    const weather = region?.weather || 'none';
    if (weather !== this.lastWeather) this.reset(weather);
    if (weather === 'none') return;

    const want = { snow: 90, ash: 70, sparks: 60, spores: 50, sandstorm: 120, petals: 45, lightning: 30, rain: 140 }[weather] || 40;
    while (this.particles.length < want) {
      this.particles.push({
        x: Math.random() * w, y: Math.random() * h,
        vx: 0, vy: 0, r: 1 + Math.random() * 2.4, a: 0.3 + Math.random() * 0.6,
        s: Math.random(),
      });
    }
    for (const p of this.particles) {
      switch (weather) {
        case 'snow': p.x += Math.sin(p.y * 0.01 + p.s * 6) * 12 * dt; p.y += (14 + p.s * 22) * dt; break;
        case 'ash': p.x += (10 + p.s * 20) * dt; p.y += (8 + p.s * 16) * dt; break;
        case 'sparks': p.y -= (30 + p.s * 60) * dt; p.x += Math.sin(p.y * 0.02) * 14 * dt; break;
        case 'spores': p.y -= (6 + p.s * 12) * dt; p.x += Math.sin(p.y * 0.015 + p.s) * 10 * dt; break;
        case 'sandstorm': p.x -= (160 + p.s * 240) * dt; p.y += Math.sin(p.x * 0.01) * 20 * dt; break;
        case 'petals': p.x += Math.sin(p.y * 0.02 + p.s * 5) * 26 * dt; p.y += (22 + p.s * 26) * dt; break;
        case 'rain': p.x -= 60 * dt; p.y += (420 + p.s * 220) * dt; break;
        case 'lightning': p.y += (18 + p.s * 30) * dt; break;
        default: break;
      }
      if (p.y > h + 8) { p.y = -8; p.x = Math.random() * w; }
      if (p.y < -8) { p.y = h + 8; p.x = Math.random() * w; }
      if (p.x < -8) { p.x = w + 8; p.y = Math.random() * h; }
      if (p.x > w + 8) { p.x = -8; p.y = Math.random() * h; }
    }

    if (weather === 'lightning') {
      this.flash = Math.max(0, this.flash - dt * 3);
      if (Math.random() < dt * 0.35) this.flash = 1;
    }
  }

  draw(ctx, region, w, h, scroll, t) {
    const r = region;
    const horizon = h * 0.74;

    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, r.sky[0]);
    sky.addColorStop(0.6, r.sky[1]);
    sky.addColorStop(1, r.sky[2] || r.sky[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizon + 2);

    // A sun/moon disc, low and hazy.
    const sunX = w * 0.72;
    const sunY = horizon * 0.42;
    const g = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, h * 0.32);
    g.addColorStop(0, 'rgba(255,246,214,0.55)');
    g.addColorStop(0.25, 'rgba(255,220,160,0.16)');
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, horizon);

    for (let i = 0; i < r.layers.length; i++) {
      this.drawLayer(ctx, r.layers[i], i, w, h, horizon, scroll, t);
    }

    // ground
    const gg = ctx.createLinearGradient(0, horizon, 0, h);
    gg.addColorStop(0, r.ground.color);
    gg.addColorStop(1, shadeColor(r.ground.color, -0.55));
    ctx.fillStyle = gg;
    ctx.fillRect(0, horizon, w, h - horizon);

    ctx.strokeStyle = r.ground.accent;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    ctx.lineTo(w, horizon);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // ground texture streaks that scroll with the camera
    ctx.save();
    ctx.globalAlpha = 0.13;
    ctx.strokeStyle = r.ground.accent;
    for (let i = 0; i < 26; i++) {
      const seed = hash(i * 7.3);
      const y = horizon + (h - horizon) * (0.08 + seed * 0.9);
      const x = ((i * 260 - scroll * 1.2) % (w + 400)) - 200;
      const len = 60 + seed * 160;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y);
      ctx.stroke();
    }
    ctx.restore();

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(220,230,255,${this.flash * 0.5})`;
      ctx.fillRect(0, 0, w, h);
    }

    this.drawWeather(ctx, region, w, h);
  }

  drawLayer(ctx, layer, idx, w, h, horizon, scroll, t) {
    const off = -scroll * layer.speed;
    const base = horizon + 2;
    const H = h * layer.height;
    const step = w / Math.max(3, layer.count / 2);
    ctx.fillStyle = layer.color;

    for (let i = -2; i < layer.count + 2; i++) {
      const seed = hash(i * 3.7 + idx * 11.1);
      const seed2 = hash(i * 9.1 + idx * 5.3);
      const span = (layer.count + 4) * step;
      let x = i * step + (off % span);
      if (x < -step * 2) x += span;
      if (x > w + step * 2) x -= span;
      const hh = H * (0.5 + seed * 0.75);

      switch (layer.type) {
        case 'mountains':
          ctx.beginPath();
          ctx.moveTo(x - step * 0.9, base);
          ctx.lineTo(x, base - hh);
          ctx.lineTo(x + step * 0.9, base);
          ctx.closePath();
          ctx.fill();
          break;
        case 'hills':
          ctx.beginPath();
          ctx.ellipse(x, base, step * 0.95, hh * 0.7, 0, Math.PI, TAU);
          ctx.fill();
          break;
        case 'towers': {
          const wd = step * (0.22 + seed2 * 0.3);
          ctx.fillRect(x, base - hh, wd, hh);
          ctx.save();
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = '#8fd6ff';
          for (let k = 0; k < Math.floor(hh / 26); k++) {
            if (hash(i * 31 + k) > 0.62) ctx.fillRect(x + wd * 0.25, base - hh + 12 + k * 24, wd * 0.5, 5);
          }
          ctx.restore();
          ctx.fillStyle = layer.color;
          break;
        }
        case 'trees':
          ctx.fillRect(x - 3, base - hh * 0.45, 6, hh * 0.45);
          ctx.beginPath();
          ctx.moveTo(x - step * 0.4, base - hh * 0.35);
          ctx.lineTo(x, base - hh);
          ctx.lineTo(x + step * 0.4, base - hh * 0.35);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(x, base - hh * 0.5, step * 0.34, hh * 0.28, 0, 0, TAU);
          ctx.fill();
          break;
        case 'ruins':
          ctx.fillRect(x, base - hh, step * 0.4, hh);
          ctx.fillRect(x + step * 0.5, base - hh * 0.6, step * 0.28, hh * 0.6);
          break;
        case 'crowd': {
          const n = 6;
          for (let k = 0; k < n; k++) {
            const cx = x + k * (step / n);
            const cy = base - H * (0.5 + hash(i * 17 + k) * 0.3) + Math.sin(t * 2 + i + k) * 3;
            ctx.beginPath();
            ctx.arc(cx, cy, H * 0.09, 0, TAU);
            ctx.fill();
          }
          break;
        }
        case 'dunes':
          ctx.beginPath();
          ctx.moveTo(x - step, base);
          ctx.quadraticCurveTo(x, base - hh, x + step, base);
          ctx.closePath();
          ctx.fill();
          break;
        case 'crystals':
          ctx.beginPath();
          ctx.moveTo(x - step * 0.22, base);
          ctx.lineTo(x - step * 0.08, base - hh);
          ctx.lineTo(x + step * 0.1, base - hh * 0.82);
          ctx.lineTo(x + step * 0.24, base);
          ctx.closePath();
          ctx.fill();
          break;
        case 'cathedral': {
          const wd = step * 0.5;
          ctx.fillRect(x, base - hh * 0.7, wd, hh * 0.7);
          ctx.beginPath();
          ctx.moveTo(x - wd * 0.1, base - hh * 0.7);
          ctx.lineTo(x + wd * 0.5, base - hh);
          ctx.lineTo(x + wd * 1.1, base - hh * 0.7);
          ctx.closePath();
          ctx.fill();
          ctx.save();
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = '#f5c66b';
          ctx.beginPath();
          ctx.ellipse(x + wd * 0.5, base - hh * 0.42, wd * 0.16, hh * 0.14, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
          ctx.fillStyle = layer.color;
          break;
        }
        default:
          ctx.fillRect(x, base - hh, step * 0.4, hh);
      }
    }
  }

  drawWeather(ctx, region, w, h) {
    const weather = region?.weather || 'none';
    if (weather === 'none' || !this.particles.length) return;
    const colors = {
      snow: '#ffffff', ash: '#ffb08a', sparks: '#ffd98f', spores: '#c8ffb0',
      sandstorm: '#f0d9a8', petals: '#ffd0ea', rain: '#bfe8ff', lightning: '#dfe8ff',
    };
    ctx.save();
    ctx.fillStyle = colors[weather] || '#fff';
    for (const p of this.particles) {
      ctx.globalAlpha = p.a * 0.8;
      if (weather === 'rain') {
        ctx.fillRect(p.x, p.y, 1.4, 12);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

export function shadeColor(hex, amt) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + (amt < 0 ? v * amt : (255 - v) * amt))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
