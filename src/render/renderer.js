// Renderer: draws the arena mesh plus every blocky entity/particle with a
// single shader. Entities are built out of unit cubes, Minecraft-style.

import { createContext, createProgram, createMesh } from './gl.js';
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

  beginFrame(camera, sky = this.skyTint) {
    if (this.contextLost) return;
    const gl = this.gl;
    this.resize();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
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
    gl.uniform1f(this.u.uFlash, 0);
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
