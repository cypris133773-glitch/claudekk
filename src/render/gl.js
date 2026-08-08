// Thin WebGL wrapper: context creation, one shader program, buffer helpers.

// Everything that used to be a per-draw uniform — the model matrix, the tint,
// the atlas rect, emissive and flash — is a per-instance attribute now.
//
// The point is the draw call count. A busy frame is six hundred boxes and each
// one was its own drawArrays, which on a phone is six hundred crossings from
// JavaScript into the driver before a single pixel is shaded. As instances
// they are one buffer upload and one call, and the shader is otherwise
// identical: the same maths, read from a different place.
const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
layout(location=2) in float aLight;
layout(location=3) in float aGlow;
// Per instance. The matrix arrives as four columns because an attribute slot
// is a vec4 and a mat4 is simply four of them in consecutive locations.
layout(location=4) in vec4 iM0;
layout(location=5) in vec4 iM1;
layout(location=6) in vec4 iM2;
layout(location=7) in vec4 iM3;
layout(location=8) in vec4 iTint;
layout(location=9) in vec4 iRect;      // atlas u0, v0, du, dv
layout(location=10) in vec2 iMisc;     // emissive, flash

uniform mat4 uProj;
uniform mat4 uView;

out vec2 vUV;
out float vLight;
out float vGlow;
out float vDepth;
out vec4 vTint;
out float vEmissive;
out float vFlash;
out vec3 vWorld;

void main() {
  mat4 model = mat4(iM0, iM1, iM2, iM3);
  vec4 world = model * vec4(aPos, 1.0);
  vec4 eye = uView * world;
  gl_Position = uProj * eye;
  vWorld = world.xyz;
  vUV = iRect.xy + aUV * iRect.zw;
  vLight = aLight;
  vGlow = aGlow;
  vDepth = length(eye.xyz);
  vTint = iTint;
  vEmissive = iMisc.x;
  vFlash = iMisc.y;
}`;

/**
 * Dynamic light slots.
 *
 * Four: what a per-pixel loop can afford on a software rasteriser, and more
 * than anyone has noticed missing in a voxel arena. Exported so the renderer
 * sizes its scratch buffers from the same number the shader is compiled with —
 * a mismatch here is a uniform upload that silently writes past the array.
 */
export const MAX_LIGHTS = 4;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
in float vLight;
in float vGlow;
in float vDepth;
in vec4 vTint;
in float vEmissive;
in float vFlash;
in vec3 vWorld;

uniform sampler2D uAtlas;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uCutoff;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec3 uGlowColor;

// Dynamic lights: a fireball in flight, a blast going off, an ultimate.
//
// Four of them, because four is what fits in a per-pixel loop on a software
// rasteriser and because a fifth simultaneous light source in a voxel arena is
// not something anyone has ever noticed missing. xyz is the position and w is
// the radius; a radius of zero is an unused slot and costs one comparison.
//
// This is the difference between an explosion that is drawn in front of the
// room and one that happens in it. Everything else in this renderer is baked:
// the sun, the sky bounce and the emissive flood are all decided at mesh time,
// so before this the brightest thing in the game lit nothing at all.
#define MAX_LIGHTS ${MAX_LIGHTS}
uniform vec4 uLightPos[MAX_LIGHTS];
uniform vec3 uLightColor[MAX_LIGHTS];

out vec4 outColor;

void main() {
  vec4 tex = texture(uAtlas, vUV);
  if (tex.a < uCutoff) discard;
  vec3 rgb = tex.rgb * vTint.rgb;

  // Hemispheric lighting. The mesh has no normals, but the baked per-face
  // shade is a faithful proxy for one: 1.0 is an up face, 0.55 a down face,
  // the sides in between. Ramping that through a warm sun and a cool sky
  // bounce gives the flat voxel palette real directionality for the cost of
  // two mixes, and costs no vertex bandwidth at all.
  // Kept to mixes and multiplies: a pow() here runs once per covered pixel of
  // the whole arena, and on a software rasteriser that alone was measurable.
  float up = clamp((vLight - 0.55) * 2.2222, 0.0, 1.0);
  vec3 lightCol = mix(uGroundColor, uSkyColor, up) + uSunColor * (up * up);
  // Emissive light thrown by the room itself, flooded through the air at mesh
  // time and coloured here by the room's own hue. This is what makes the rock
  // beside a lake of fire look like it is beside a lake of fire, and it is the
  // difference between a lit room and an evenly lit one.
  lightCol += uGlowColor * vGlow * vGlow;
  // Inverse-square-ish falloff, clamped to the radius so a light has an end.
  // Squaring the linear term rather than dividing keeps it to two multiplies
  // and gives a softer core, which reads better on flat voxel faces than a
  // true 1/d^2 hotspot does.
  for (int i = 0; i < MAX_LIGHTS; i++) {
    float r = uLightPos[i].w;
    if (r <= 0.0) continue;
    float d = distance(vWorld, uLightPos[i].xyz);
    float f = clamp(1.0 - d / r, 0.0, 1.0);
    lightCol += uLightColor[i] * f * f;
  }
  lightCol = mix(lightCol, vec3(1.0), vEmissive);
  rgb *= lightCol * mix(max(vLight, vGlow * 0.85), 1.0, vEmissive);

  rgb = mix(rgb, vec3(1.0, 0.55, 0.55), vFlash);
  float fog = clamp((vDepth - uFogNear) / max(uFogFar - uFogNear, 0.001), 0.0, 1.0);
  fog *= (1.0 - vEmissive * 0.6);
  rgb = mix(rgb, uFogColor, fog);
  outColor = vec4(rgb, tex.a * vTint.a);
}`;

// Sky: one full-screen triangle with a vertical gradient and a soft sun
// bloom. A flat clear colour is the single biggest thing that made the arena
// read as a tech demo rather than a place.
const SKY_VERT = `#version 300 es
precision highp float;
out vec2 vNdc;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 1.0, 1.0);
}`;

const SKY_FRAG = `#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uTop;
uniform vec3 uBottom;
uniform vec3 uSun;
uniform vec2 uSunPos;
uniform float uAspect;
out vec4 outColor;
// Multiplies only — no pow, no exp. This shader runs on every pixel of open
// sky, and the transcendentals it started with cost real frames on a software
// rasteriser for a gradient nobody can tell apart from this one.
void main() {
  float t = clamp(vNdc.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = mix(uBottom, uTop, t * (0.65 + 0.35 * t));
  vec2 d = vec2((vNdc.x - uSunPos.x) * uAspect, vNdc.y - uSunPos.y);
  float glow = max(0.0, 1.0 - dot(d, d) * 1.6);
  col += uSun * glow * glow * 0.55;
  outColor = vec4(col, 1.0);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error('Shader compile failed: ' + gl.getShaderInfoLog(sh));
  }
  return sh;
}

/**
 * getContext is specified to return null when it cannot make a context, but
 * some engines throw instead, and a few refuse an attribute set they dislike
 * (desynchronized on older Android WebViews) rather than ignoring the unknown
 * keys. So: ask for the good one, then settle for any WebGL2 at all. Failing
 * that this throws by design — main.js turns it into the "Cannot start" panel,
 * which is the one capability the game genuinely cannot do without.
 */
export function createContext(canvas) {
  const attempt = (attrs) => {
    try { return canvas.getContext('webgl2', attrs); } catch { return null; }
  };
  const gl = attempt({
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
    desynchronized: true,
  }) || attempt({ antialias: false, alpha: false }) || attempt(undefined);
  if (!gl) throw new Error('WebGL2 is not available on this device.');
  return gl;
}

export function createProgram(gl) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('Program link failed: ' + gl.getProgramInfoLog(prog));
  }
  const u = {};
  // uModel, uTint, uUVOffset, uUVScale, uEmissive and uFlash are gone: they
  // varied per box, which is exactly what an instance attribute is for.
  for (const name of ['uProj', 'uView', 'uAtlas', 'uFogColor', 'uFogNear',
    'uFogFar', 'uCutoff', 'uSunColor', 'uSkyColor', 'uGroundColor', 'uGlowColor',
    'uLightPos', 'uLightColor']) {
    u[name] = gl.getUniformLocation(prog, name);
  }
  return { prog, u };
}

/** The sky gradient program. Draws with no buffers at all — three vertices
 *  generated from gl_VertexID cover the screen. */
export function createSkyProgram(gl) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, SKY_VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, SKY_FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('Sky program link failed: ' + gl.getProgramInfoLog(prog));
  }
  const u = {};
  for (const name of ['uTop', 'uBottom', 'uSun', 'uSunPos', 'uAspect']) {
    u[name] = gl.getUniformLocation(prog, name);
  }
  // A VAO is still required in WebGL2 even when the program reads no
  // attributes; drawing with none bound is an error on some drivers.
  const vao = gl.createVertexArray();
  return { prog, u, vao };
}

/** Vertex layout shared by every mesh: pos(3) uv(2) light(1) glow(1). */
export const VERTEX_FLOATS = 7;
export const STRIDE = VERTEX_FLOATS * 4;

/**
 * Per-instance layout: model matrix (16), tint (4), atlas rect (4),
 * emissive + flash (2).
 */
export const INSTANCE_FLOATS = 26;
export const INSTANCE_STRIDE = INSTANCE_FLOATS * 4;

/**
 * Bind an instance buffer's attributes into whichever vertex array is current.
 *
 * `vertexAttribDivisor(loc, 1)` is the whole trick: it tells the driver to
 * advance this attribute once per *instance* rather than once per vertex, so
 * thirty-six vertices of cube read one matrix, one tint and one atlas rect.
 */
function bindInstanceAttribs(gl, vbo) {
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  // Four columns of the model matrix, then tint, rect, and the two scalars.
  const layout = [[4, 4, 0], [5, 4, 16], [6, 4, 32], [7, 4, 48],
    [8, 4, 64], [9, 4, 80], [10, 2, 96]];
  for (const [loc, size, offset] of layout) {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, INSTANCE_STRIDE, offset);
    gl.vertexAttribDivisor(loc, 1);
  }
}

/**
 * A mesh, wired to draw instanced.
 *
 * `instanceVbo` supplies the per-instance attributes. The world mesh passes a
 * one-entry static buffer and draws a single instance; the unit cube passes
 * the renderer's growing scratch buffer and draws six hundred.
 */
export function createMesh(gl, floats, instanceVbo) {
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, floats, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, STRIDE, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, STRIDE, 20);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 1, gl.FLOAT, false, STRIDE, 24);
  if (instanceVbo) bindInstanceAttribs(gl, instanceVbo);
  gl.bindVertexArray(null);
  // Divided by the real stride. This read `/ 6` against a 7-float vertex for
  // as long as the glow channel has existed, so every mesh in the game drew a
  // sixth more vertices than it had — six phantom triangles per box, six
  // hundred boxes a frame, all of them reading past the end of the buffer.
  return { vao, vbo, count: floats.length / VERTEX_FLOATS };
}

/** A buffer sized for `n` instances, written every frame. */
export function createInstanceBuffer(gl, n) {
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, n * INSTANCE_STRIDE, gl.DYNAMIC_DRAW);
  return vbo;
}
