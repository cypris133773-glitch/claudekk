// Renderer: draws the arena mesh plus every blocky entity/particle with a
// single shader. Entities are built out of unit cubes, Minecraft-style.

import {
  createContext, createProgram, createSkyProgram, createMesh, createInstanceBuffer,
  INSTANCE_FLOATS,
} from './gl.js';
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
    // Seven floats, not six: the world mesh gained a glow channel and this
    // buffer is bound with the same stride. A cube emitting six read every
    // attribute from the wrong offset — models came out sheared, mis-textured
    // and unlit, which is what "the enemies and weapons look ugly" was.
    // Entities carry no baked glow of their own; the trailing 0 is that.
    const quad = f.c.map((c, i) => [c[0], c[1], c[2], uv[i][0], uv[i][1], f.s, 0]);
    for (const i of [0, 1, 2, 0, 2, 3]) out.push(...quad[i]);
  }
  return new Float32Array(out);
}

/** The default tint. */
const WHITE = [1, 1, 1];

/**
 * How many boxes one instanced draw can carry.
 *
 * A measured thirty-mob wave submits about six hundred, so this is roughly
 * three times the worst frame the game has been seen to produce. Going over is
 * not a failure: the batch flushes and starts a new one, which costs exactly
 * one extra draw call.
 */
const BATCH_CAP = 2048;

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
    // Room for a busy frame and then some. A measured thirty-mob wave submits
    // about six hundred boxes; overflowing simply flushes early, so the cap is
    // a memory decision rather than a correctness one.
    this.instVbo = createInstanceBuffer(gl, BATCH_CAP);
    this.inst = new Float32Array(BATCH_CAP * INSTANCE_FLOATS);
    this.instCount = 0;
    this.cube = createMesh(gl, cubeVerts(), this.instVbo);
    // The world mesh carries its own UVs and never moves, so it draws as a
    // single instance out of a buffer written once.
    this.worldInstVbo = createInstanceBuffer(gl, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.worldInstVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array([
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,   // identity
      1, 1, 1, 1,                                        // white
      0, 0, 1, 1,                                        // the whole atlas
      0, 0,                                              // no emissive, no flash
    ]));
    this.worldMesh = null;
    this.invalidateState();
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  /**
   * Reset the batch and the shadow copy of GL state it depends on.
   *
   * Boxes are not drawn when they are submitted. They accumulate into one
   * array and go to the driver as a single instanced draw, because the cost
   * that actually shows up on a phone is the number of times JavaScript hands
   * work to the driver, not the amount of work handed over. A busy frame was
   * six hundred separate draws; it is one.
   *
   * What forces the batch out early is a change to state the batch cannot
   * express — the alpha cutoff, the depth mask, a different program. Those are
   * tracked here so the flush happens exactly when it must and not otherwise.
   *
   * NaN is the initial value on purpose: it compares unequal to everything,
   * including itself, so the first set after a context loss always goes
   * through and the cache can never start out claiming to hold a real value.
   */
  invalidateState() {
    this.st = { vao: undefined, cutoff: NaN };
    this.instCount = 0;
  }

  setWorld(world) {
    const gl = this.gl;
    if (this.worldMesh) {
      gl.deleteVertexArray(this.worldMesh.vao);
      gl.deleteBuffer(this.worldMesh.vbo);
    }
    this.worldFloats = world.mesh;   // kept so a lost context can be rebuilt
    this.worldMesh = createMesh(gl, world.mesh, this.worldInstVbo);
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
    // A different program cannot draw this program's queue.
    this.flush();
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
    this.st.vao = null;
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
    // Kept for detail culling. Every entity is drawn as a stack of individual
    // draw calls, so what a model costs is entirely a question of how many
    // boxes it is made of — and past twenty blocks most of them are a pixel.
    this.camX = camera.x; this.camY = camera.y; this.camZ = camera.z;
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
    // Anything left queued from an aborted frame is dropped rather than drawn
    // against this frame's camera.
    this.instCount = 0;
    this.st.vao = undefined;
    this.setCutoff(0.35);
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
    this.useVao(this.worldMesh.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, this.worldMesh.count, 1);
  }

  /** Bind a vertex array only if it is not the one already bound. */
  useVao(vao) {
    if (this.st.vao === vao) return;
    this.st.vao = vao;
    this.gl.bindVertexArray(vao);
  }

  /**
   * Alpha-test threshold. It is a uniform, so it cannot vary inside a batch —
   * changing it has to push what is already queued out first.
   */
  setCutoff(v) {
    if (this.st.cutoff === v) return;
    this.flush();
    this.st.cutoff = v;
    this.gl.uniform1f(this.u.uCutoff, v);
  }

  /**
   * Send everything queued as one draw.
   *
   * Order within the batch is the order it was submitted, and GL preserves
   * primitive order inside a single draw call — so blended things still land
   * over what they were meant to land over. That is the property that makes
   * batching safe here rather than a rewrite of how the scene is composed.
   */
  flush() {
    if (this.contextLost || !this.instCount) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0,
      this.inst.subarray(0, this.instCount * INSTANCE_FLOATS));
    this.useVao(this.cube.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, this.cube.count, this.instCount);
    this.instCount = 0;
  }

  /**
   * Queue one cube. Position is the cube centre.
   * opts: { tile, color:[r,g,b], alpha, emissive, flash, yaw, pitch }
   */
  drawBox(x, y, z, sx, sy, sz, opts = {}) {
    if (this.contextLost) return;
    if (this.instCount >= BATCH_CAP) this.flush();
    const tile = opts.tile === undefined ? T.SKIN : opts.tile;
    const [u0, v0, du, dv] = tileUV(tile);
    const m = this.model;
    composeTRS(m, x, y, z, opts.yaw || 0, opts.pitch || 0, sx, sy, sz);

    const a = this.inst;
    let o = this.instCount * INSTANCE_FLOATS;
    for (let i = 0; i < 16; i++) a[o + i] = m[i];
    o += 16;
    const c = opts.color || WHITE;
    a[o] = c[0]; a[o + 1] = c[1]; a[o + 2] = c[2];
    a[o + 3] = opts.alpha === undefined ? 1 : opts.alpha;
    a[o + 4] = u0; a[o + 5] = v0; a[o + 6] = du; a[o + 7] = dv;
    a[o + 8] = opts.emissive || 0;
    a[o + 9] = opts.flash || 0;
    this.instCount++;
  }

  /**
   * Soft contact shadow on the ground beneath an entity. Voxel characters
   * float without one: nothing else in the scene tells you whether a mob is
   * standing on the floor or hovering a block above it.
   */
  /**
   * Run every contact shadow inside one state change.
   *
   * The blob is soft-edged alpha and must not write depth, so it needs a
   * different cutoff and the depth mask off. Both are things a batch cannot
   * carry per box, so toggling them per shadow would force a flush per shadow
   * — thirty draw calls to save thirty draw calls. Scoped like this the whole
   * pass is one.
   */
  shadowPass(fn) {
    if (this.contextLost || !this.fancy) return;
    const gl = this.gl;
    this.setCutoff(0.004);
    gl.depthMask(false);
    fn();
    this.flush();
    gl.depthMask(true);
    this.setCutoff(0.35);
  }

  /** One blob. Only meaningful inside `shadowPass`. */
  drawShadow(x, y, z, radius, alpha = 0.42) {
    if (this.contextLost || !this.fancy || alpha <= 0.01) return;
    this.drawBox(x, y + 0.03, z, radius * 2, 0.001, radius * 2, {
      tile: T.SHADOW, color: [0, 0, 0], alpha, emissive: 1,
    });
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
