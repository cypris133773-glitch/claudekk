// Renderer: draws the arena mesh plus every blocky entity/particle with a
// single shader. Entities are built out of unit cubes, Minecraft-style.

import { createContext, createProgram, createSkyProgram, createMesh } from './gl.js';
import { createAtlasTexture, tileUV, T } from './atlas.js';
import { mat4, perspective, viewFromEuler, composeTRS, identity, multiply, clamp } from '../core/math.js';

/** Unit cube centred on the origin, uv 0..1 per face, shading baked into light. */
function cubeVerts() {
  const F = [
    { d: [1, 0, 0], s: 0.78, c: [[.5, .5, .5], [.5, -.5, .5], [.5, -.5, -.5], [.5, .5, -.5]] },
    { d: [-1, 0, 0], s: 0.78, c: [[-.5, .5, -.5], [-.5, -.5, -.5], [-.5, -.5, .5], [-.5, .5, .5]] },
    { d: [0, 1, 0], s: 1.00, c: [[-.5, .5, -.5], [-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5]] },
    { d: [0, -1, 0], s: 0.55, c: [[-.5, -.5, .5], [-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5]] },
    { d: [0, 0, 1], s: 0.88, c: [[-.5, .5, .5], [-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5]] },
    { d: [0, 0, -1], s: 0.66, c: [[.5, .5, -.5], [.5, -.5, -.5], [-.5, -.5, -.5], [-.5, .5, -.5]] },
  ];
  const uv = [[0, 0], [0, 1], [1, 1], [1, 0]];
  const out = [];
  for (const f of F) {
    const quad = f.c.map((c, i) => [c[0], c[1], c[2], uv[i][0], uv[i][1], f.s]);
    for (const i of [0, 1, 2, 0, 2, 3]) out.push(...quad[i]);
  }
  return new Float32Array(out);
}

const SKY_TOP = [0.32, 0.50, 0.76];
const SKY_BOT = [0.62, 0.72, 0.86];

/**
 * Per-theme lighting. `top` and `bottom` drive the sky gradient, `sun` is the
 * warm light on up-facing surfaces and the glow around the sun disc, `sky`
 * and `ground` are the hemispheric bounce the shader ramps between.
 * Index order matches Game.theme.
 */
const THEMES = [
  { // temperate noon
    top: SKY_TOP, bottom: SKY_BOT,
    sun: [0.30, 0.24, 0.14], sky: [0.80, 0.86, 1.00], ground: [0.42, 0.40, 0.44],
    sunPos: [0.35, 0.62], glow: [0.45, 0.36, 0.20],
  },
  { // desert afternoon
    top: [0.44, 0.56, 0.78], bottom: [0.90, 0.78, 0.56],
    sun: [0.40, 0.28, 0.12], sky: [0.94, 0.88, 0.76], ground: [0.50, 0.42, 0.34],
    sunPos: [-0.42, 0.48], glow: [0.50, 0.36, 0.16],
  },
  { // volcanic night
    top: [0.05, 0.05, 0.10], bottom: [0.26, 0.10, 0.08],
    sun: [0.34, 0.12, 0.03], sky: [0.34, 0.34, 0.48], ground: [0.30, 0.16, 0.14],
    sunPos: [0.10, -0.30], glow: [0.85, 0.34, 0.10],
  },
  { // frozen dusk
    top: [0.20, 0.30, 0.48], bottom: [0.62, 0.72, 0.84],
    sun: [0.24, 0.22, 0.28], sky: [0.74, 0.84, 1.00], ground: [0.44, 0.48, 0.58],
    sunPos: [0.55, 0.30], glow: [0.30, 0.44, 0.62],
  },
  // --- Raid rooms, 4..10, one per raid in RAIDS order. ---------------------
  //
  // Fog is part of a theme now, and it is the single biggest mood lever in
  // here: every room used to be fogged identically at 34/82, which is why a
  // drowned swamp and a frost castle read as the same distance away. Pulling
  // Black Temple in to 18/52 is what makes it feel like a room rather than a
  // field, and pushing Ulduar out to 34/86 is what makes it feel like a hall.
  { // the sunken city — shafts of green-gold daylight through a canopy
    top: [0.12, 0.19, 0.09], bottom: [0.25, 0.36, 0.20],
    sun: [0.26, 0.30, 0.10], sky: [0.72, 0.82, 0.62], ground: [0.30, 0.34, 0.24],
    sunPos: [0.20, 0.72], fogNear: 26, fogFar: 62, glow: [0.42, 0.52, 0.16],
  },
  { // grey stone over a lake of fire — lit from below, which is the whole read
    top: [0.07, 0.03, 0.02], bottom: [0.25, 0.08, 0.04],
    sun: [0.06, 0.03, 0.02], sky: [0.34, 0.34, 0.38], ground: [0.52, 0.22, 0.09],
    sunPos: [0.00, 0.45], fogNear: 22, fogFar: 58, glow: [1.00, 0.38, 0.10],
  },
  { // a broken ballroom, candlelit
    top: [0.08, 0.06, 0.13], bottom: [0.16, 0.13, 0.21],
    sun: [0.10, 0.08, 0.16], sky: [0.62, 0.58, 0.80], ground: [0.24, 0.20, 0.30],
    sunPos: [0.62, 0.70], fogNear: 30, fogFar: 70, glow: [0.72, 0.52, 0.22],
  },
  { // a machine hall — the only cold, clean, right-angled room
    top: [0.06, 0.10, 0.15], bottom: [0.11, 0.19, 0.25],
    sun: [0.16, 0.20, 0.26], sky: [0.76, 0.84, 0.96], ground: [0.30, 0.36, 0.42],
    sunPos: [-0.50, 0.28], fogNear: 34, fogFar: 86, glow: [0.80, 0.46, 0.14],
  },
  { // black stone and one green fire — the darkest room in the game
    top: [0.02, 0.04, 0.03], bottom: [0.06, 0.10, 0.07],
    sun: [0.02, 0.05, 0.02], sky: [0.26, 0.34, 0.26], ground: [0.10, 0.16, 0.10],
    sunPos: [0.00, -0.60], fogNear: 18, fogFar: 52, glow: [0.42, 0.90, 0.26],
  },
  { // black rock under a burning sky — the only room whose sky is the light
    top: [1.00, 0.48, 0.14], bottom: [0.23, 0.06, 0.02],
    sun: [0.60, 0.20, 0.04], sky: [0.90, 0.46, 0.18], ground: [0.18, 0.08, 0.06],
    sunPos: [0.00, 0.85], fogNear: 30, fogFar: 74, glow: [1.00, 0.42, 0.12],
  },
  { // the frost castle — pale stone, deep blue air, low hard light
    top: [0.04, 0.08, 0.14], bottom: [0.09, 0.19, 0.30],
    sun: [0.14, 0.18, 0.28], sky: [0.82, 0.90, 1.00], ground: [0.08, 0.12, 0.20],
    sunPos: [0.55, 0.12], fogNear: 28, fogFar: 78, glow: [0.46, 0.72, 0.95],
  },
];

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = createContext(canvas);
    this.contextLost = false;
    this.buildGpuResources();
    this.worldFloats = null;
    this.proj = mat4();
    this.view = mat4();
    this.viewProj = mat4();
    this.model = mat4();
    this.identity = identity(mat4());
    this.renderScale = 1;
    // Fancy adds the sky gradient, contact shadows and death debris. It is
    // pure fill rate and draw calls, so it is the first thing to go when a
    // device cannot hold frame rate.
    this.fancy = true;
    this.theme = THEMES[0];
    this.fov = 74;
    this.fogNear = 34;
    this.fogFar = 82;
    this.skyTint = [0.55, 0.66, 0.82];

    // A GPU reset — backgrounding a tab on Android, an iOS memory warning, a
    // driver timeout — takes the context away. Without preventDefault the
    // browser will never restore it, and every draw afterwards is a silent
    // no-op on a black screen. Everything the renderer owns lives on the GPU,
    // so it is all rebuilt from scratch when the context comes back.
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      console.warn('WebGL context lost; waiting for the browser to restore it.');
    });
    canvas.addEventListener('webglcontextrestored', () => {
      try {
        this.buildGpuResources();
        if (this.worldFloats) this.worldMesh = createMesh(this.gl, this.worldFloats);
        this.contextLost = false;
      } catch (err) {
        console.error('WebGL context restore failed.', err);
      }
    });
  }

  /** Everything that has to be re-uploaded after a context loss. */
  buildGpuResources() {
    const gl = this.gl;
    const { prog, u } = createProgram(gl);
    this.prog = prog;
    this.u = u;
    this.sky = createSkyProgram(gl);
    this.atlas = createAtlasTexture(gl);
    this.cube = createMesh(gl, cubeVerts());
    this.worldMesh = null;
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  setWorld(world) {
    const gl = this.gl;
    if (this.worldMesh) {
      gl.deleteVertexArray(this.worldMesh.vao);
      gl.deleteBuffer(this.worldMesh.vbo);
    }
    this.worldFloats = world.mesh;   // kept so a lost context can be rebuilt
    this.worldMesh = createMesh(gl, world.mesh);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.renderScale;
    // Asking for a drawing buffer wider than the GL limit does not throw: the
    // allocation just fails and the canvas goes black. A retina tablet at
    // dpr 2 clears 4096 easily, so clamp rather than trust the device.
    const max = this.maxDrawingBuffer();
    const w = clamp(Math.floor(this.canvas.clientWidth * dpr), 1, max);
    const h = clamp(Math.floor(this.canvas.clientHeight * dpr), 1, max);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.aspect = w / h;
  }

  maxDrawingBuffer() {
    if (!this.maxDim) {
      const gl = this.gl;
      const dims = gl.getParameter(gl.MAX_VIEWPORT_DIMS) || [4096, 4096];
      const rb = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 4096;
      const limit = Math.min(dims[0], dims[1], rb);
      this.maxDim = Number.isFinite(limit) && limit >= 1024 ? limit : 4096;
    }
    return this.maxDim;
  }

  /** Pick the lighting set for an arena theme. */
  setTheme(index) {
    this.theme = THEMES[((index | 0) % THEMES.length + THEMES.length) % THEMES.length];
    this.skyTint = this.theme.bottom;
    // Fog belongs to the room. The four arena themes do not carry one and fall
    // back to the numbers every room used to share.
    this.fogNear = this.theme.fogNear ?? 34;
    this.fogFar = this.theme.fogFar ?? 82;
  }

  /** How many themes exist, so a caller can index the raid ones by name. */
  static get THEME_COUNT() { return THEMES.length; }

  /**
   * Vertical gradient plus a soft sun. Drawn *after* the opaque scene, not
   * before it: at depth 1.0 with LEQUAL it lands only on pixels nothing else
   * touched, so an arena that fills the view costs no sky fill at all. Drawn
   * first it was a guaranteed full-screen overdraw every frame, which is most
   * of a frame's budget on a weak mobile GPU.
   */
  drawSky() {
    if (this.contextLost || !this.fancy) return;
    const gl = this.gl;
    const t = this.theme;
    gl.depthMask(false);
    gl.depthFunc(gl.LEQUAL);
    gl.useProgram(this.sky.prog);
    gl.bindVertexArray(this.sky.vao);
    gl.uniform3fv(this.sky.u.uTop, t.top);
    gl.uniform3fv(this.sky.u.uBottom, t.bottom);
    gl.uniform3fv(this.sky.u.uSun, t.sun);
    gl.uniform2fv(this.sky.u.uSunPos, t.sunPos);
    gl.uniform1f(this.sky.u.uAspect, this.aspect || 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    // Every other draw path assumes the world program is current.
    gl.useProgram(this.prog);
    gl.bindVertexArray(null);
  }

  beginFrame(camera, sky = this.skyTint) {
    if (this.contextLost) return;
    const gl = this.gl;
    this.resize();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    // The sky pass covers every pixel, so clearing colour first would write
    // the whole framebuffer twice — on a software rasteriser that alone cost
    // a third of the frame rate.
    gl.clearColor(sky[0], sky[1], sky[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // The configured FOV is vertical, which pinches the view badly on a
    // portrait phone where the aspect ratio is below 1. There, treat it as a
    // horizontal FOV instead and solve for the vertical one, so turning the
    // phone changes the shape of the view rather than how much you can see.
    let fovRad = (camera.fov || this.fov) * Math.PI / 180;
    if (this.aspect < 1) {
      fovRad = 2 * Math.atan(Math.tan(fovRad / 2) / Math.max(this.aspect, 0.35));
    }
    perspective(this.proj, fovRad, this.aspect, 0.06, 260);
    viewFromEuler(this.view, camera.x, camera.y, camera.z, camera.yaw, camera.pitch);
    multiply(this.viewProj, this.proj, this.view);

    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.uniform1i(this.u.uAtlas, 0);
    gl.uniformMatrix4fv(this.u.uProj, false, this.proj);
    gl.uniformMatrix4fv(this.u.uView, false, this.view);
    gl.uniform3fv(this.u.uFogColor, sky);
    gl.uniform1f(this.u.uFogNear, this.fogNear);
    gl.uniform1f(this.u.uFogFar, this.fogFar);
    gl.uniform3fv(this.u.uGlowColor, this.theme.glow || [0.5, 0.38, 0.18]);
    gl.uniform1f(this.u.uFlash, 0);
    gl.uniform1f(this.u.uCutoff, 0.35);
    if (this.fancy) {
      gl.uniform3fv(this.u.uSunColor, this.theme.sun);
      gl.uniform3fv(this.u.uSkyColor, this.theme.sky);
      gl.uniform3fv(this.u.uGroundColor, this.theme.ground);
    } else {
      // Neutral values collapse the hemispheric ramp back to the flat baked
      // face shading, with no branch in the fragment shader.
      gl.uniform3f(this.u.uSunColor, 0, 0, 0);
      gl.uniform3f(this.u.uSkyColor, 1, 1, 1);
      gl.uniform3f(this.u.uGroundColor, 1, 1, 1);
    }
  }

  drawWorld() {
    if (!this.worldMesh || this.contextLost) return;
    const gl = this.gl;
    gl.uniformMatrix4fv(this.u.uModel, false, this.identity);
    gl.uniform4f(this.u.uTint, 1, 1, 1, 1);
    gl.uniform2f(this.u.uUVOffset, 0, 0);
    gl.uniform2f(this.u.uUVScale, 1, 1);
    gl.uniform1f(this.u.uEmissive, 0);
    gl.bindVertexArray(this.worldMesh.vao);
    gl.drawArrays(gl.TRIANGLES, 0, this.worldMesh.count);
  }

  /**
   * Draw one cube. Position is the cube centre.
   * opts: { tile, color:[r,g,b], alpha, emissive, flash, yaw, pitch }
   */
  drawBox(x, y, z, sx, sy, sz, opts = {}) {
    if (this.contextLost) return;
    const gl = this.gl;
    const tile = opts.tile === undefined ? T.SKIN : opts.tile;
    const [u0, v0, du, dv] = tileUV(tile);
    composeTRS(this.model, x, y, z, opts.yaw || 0, opts.pitch || 0, sx, sy, sz);
    gl.uniformMatrix4fv(this.u.uModel, false, this.model);
    const c = opts.color || [1, 1, 1];
    gl.uniform4f(this.u.uTint, c[0], c[1], c[2], opts.alpha === undefined ? 1 : opts.alpha);
    gl.uniform2f(this.u.uUVOffset, u0, v0);
    gl.uniform2f(this.u.uUVScale, du, dv);
    gl.uniform1f(this.u.uEmissive, opts.emissive || 0);
    gl.uniform1f(this.u.uFlash, opts.flash || 0);
    gl.bindVertexArray(this.cube.vao);
    gl.drawArrays(gl.TRIANGLES, 0, this.cube.count);
    if (opts.flash) gl.uniform1f(this.u.uFlash, 0);
  }

  /**
   * Soft contact shadow on the ground beneath an entity. Voxel characters
   * float without one: nothing else in the scene tells you whether a mob is
   * standing on the floor or hovering a block above it.
   */
  drawShadow(x, y, z, radius, alpha = 0.42) {
    if (this.contextLost || !this.fancy || alpha <= 0.01) return;
    const gl = this.gl;
    // The soft edge is entirely alpha, so the usual cutoff would carve the
    // blob into a hard-edged disc.
    gl.uniform1f(this.u.uCutoff, 0.004);
    gl.depthMask(false);
    this.drawBox(x, y + 0.03, z, radius * 2, 0.001, radius * 2, {
      tile: T.SHADOW, color: [0, 0, 0], alpha, emissive: 1,
    });
    gl.depthMask(true);
    gl.uniform1f(this.u.uCutoff, 0.35);
  }

  /**
   * World point -> CSS pixel coordinates, for HUD elements anchored to
   * entities (damage numbers, off-screen markers). Returns null if behind.
   */
  project(x, y, z) {
    const m = this.viewProj;
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
    const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (cw <= 0.0001) return null;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    return { x: (cx / cw * 0.5 + 0.5) * w, y: (0.5 - cy / cw * 0.5) * h, depth: cw };
  }

  /** Cube whose local origin sits at a pivot — used for swinging limbs. */
  drawLimb(px, py, pz, yaw, pitch, sx, sy, sz, offY, opts = {}) {
    // Offset along the limb's local Y so the pivot is at the top of the box.
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cy = Math.cos(yaw), sy0 = Math.sin(yaw);
    const lx = 0, ly = offY, lz = 0;
    const wx = px + (cy * lx + sy0 * sp * ly + sy0 * cp * lz);
    const wy = py + (cp * ly - sp * lz);
    const wz = pz + (-sy0 * lx + cy * sp * ly + cy * cp * lz);
    this.drawBox(wx, wy, wz, sx, sy, sz, { ...opts, yaw, pitch });
  }
}

export { clamp };
export const SKY = { SKY_TOP, SKY_BOT };
