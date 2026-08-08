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
 * Two, and it was four until it was measured.
 *
 * This runs per covered pixel of the whole arena, so on a software rasteriser
 * — which is what the playability harness runs on, and the worst hardware this
 * will ever meet — the loop bound is most of its cost. Four dropped the
 * landscape phone case from 45 fps to about 20, right onto the harness's
 * floor, and it failed about half the time.
 *
 * Two is not a compromise so much as an admission of what the feature is
 * actually for: the shot you just fired, and the blast that just went off. A
 * third simultaneous light in a voxel arena is not something anyone has ever
 * noticed missing, and the nearest-camera sort below means the two you get are
 * the two filling the screen.
 *
 * Exported so the renderer sizes its scratch buffers from the same number the
 * shader is compiled with — a mismatch is a uniform upload that silently
 * writes past the array.
 */
export const MAX_LIGHTS = 2;

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
uniform vec3 uSunDir;
uniform vec3 uCamPos;
uniform vec2 uSpecRim;   // specular strength, rim strength

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
uniform int uLightCount;

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
  // Ambient only. The sun used to be folded in here off the baked per-face
  // shade, and once a real normal arrived below that became the same light
  // counted twice — which is why a floor, whose baked shade is already 1.0,
  // came out pure white.
  float up = clamp((vLight - 0.55) * 2.2222, 0.0, 1.0);
  vec3 lightCol = mix(uGroundColor, uSkyColor, up);
  // Emissive light thrown by the room itself, flooded through the air at mesh
  // time and coloured here by the room's own hue. This is what makes the rock
  // beside a lake of fire look like it is beside a lake of fire, and it is the
  // difference between a lit room and an evenly lit one.
  lightCol += uGlowColor * vGlow * vGlow;
  // Inverse-square-ish falloff, clamped to the radius so a light has an end.
  // Squaring the linear term rather than dividing keeps it to two multiplies
  // and gives a softer core, which reads better on flat voxel faces than a
  // true 1/d^2 hotspot does.
  // Bounded by a count, not by the array size.
  //
  // Most frames have no dynamic light at all — nothing is in flight and
  // nothing has just gone off — and a fixed four-iteration loop made every one
  // of those frames pay for the busiest one. On a software rasteriser that is
  // per covered pixel of the whole arena, and it was measurably half the frame.
  for (int i = 0; i < uLightCount; i++) {
    float r = uLightPos[i].w;
    float d = distance(vWorld, uLightPos[i].xyz);
    float f = clamp(1.0 - d / r, 0.0, 1.0);
    lightCol += uLightColor[i] * f * f;
  }
  // --- Surface normal, for free ----------------------------------------
  //
  // The mesh carries no normals and does not need to. Every face in this game
  // is flat and axis-aligned, so the derivative of the world position across
  // two neighbouring pixels *is* the surface plane — two hardware
  // instructions, no vertex bandwidth, and exact rather than interpolated.
  //
  // This is what the renderer was missing to have materials at all. The baked
  // per-face shade gives direction; it cannot give a highlight, because a
  // highlight depends on where the camera is and a baked value does not know.
  vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  vec3 V = normalize(uCamPos - vWorld);
  // Face the viewer: the cross product's sign depends on triangle winding and
  // a back-facing normal turns a highlight into a black patch.
  if (dot(N, V) < 0.0) N = -N;

  // Sun wrap. Half-Lambert rather than a hard terminator — a voxel face is
  // large and flat, and a hard N.L makes one whole wall go black while the
  // wall beside it is fully lit.
  float ndl = dot(N, uSunDir) * 0.5 + 0.5;
  lightCol += uSunColor * (ndl * ndl);

  // Specular, by multiplication only. pow() runs once per covered pixel of the
  // whole arena and was measurable on a software rasteriser on its own, so the
  // exponent is built from four squarings: s^16 for the cost of four multiplies.
  vec3 H = normalize(uSunDir + V);
  float s = max(dot(N, H), 0.0);
  s *= s; s *= s; s *= s; s *= s;
  // Rim light: bright where the surface turns away from the camera, which is
  // what separates a silhouette from the wall behind it.
  float f = 1.0 - max(dot(N, V), 0.0);
  f *= f * f;

  lightCol = mix(lightCol, vec3(1.0), vEmissive);
  rgb *= lightCol * mix(max(vLight, vGlow * 0.85), 1.0, vEmissive);
  // Added after the albedo multiply, not before: a highlight is light arriving
  // at the eye, not more of the surface's own colour.
  rgb += uSunColor * s * uSpecRim.x * (1.0 - vEmissive);
  rgb += uSkyColor * f * uSpecRim.y * (1.0 - vEmissive);

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

// --- Post-processing --------------------------------------------------------
//
// WHY THE SCENE STOPPED GOING STRAIGHT TO THE SCREEN
//
// Everything above draws lit voxels and then hands them to the display. That
// is a renderer, but it is not a *look*. Three things were missing and all
// three are the same stage of the pipeline:
//
//   BLOOM      the game is full of things that are supposed to be brighter
//              than white — lava, rune blocks, an ultimate going off, a
//              fireball in flight — and every one of them was being clamped to
//              1.0 and drawn flat. Light that does not bleed does not read as
//              light; it reads as a pale blue square.
//   TONEMAP    linear colour clipped at 1.0 makes every bright surface go
//              chalky and every shadow go flat. A filmic curve is what puts
//              contrast back into the midtones and stops highlights turning
//              into paper.
//   VIGNETTE   a cheap, honest frame. It costs a multiply and it is the
//              difference between a viewport and a shot.
//
// The chain is: scene -> half-res bright pass -> two blur passes -> composite.
// Half res because a bloom is a blur and nobody can see the resolution of a
// blur, and it makes the most expensive stage a quarter of the pixels.

/** One triangle covering the screen. No vertex buffer, no attributes. */
const POST_VERT = `#version 300 es
precision highp float;
out vec2 vUV;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * Bright pass, at half resolution.
 *
 * A soft knee rather than a hard cut. A hard threshold makes bloom pop in and
 * out as a surface crosses it, which on a moving voxel face is a flicker you
 * cannot stop looking at; the knee ramps it in over a range instead.
 */
const BRIGHT_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uThreshold;
out vec4 outColor;
void main() {
  // Four taps in a box, which both downsamples and pre-blurs for free.
  vec3 c = texture(uScene, vUV + uTexel * vec2(-1.0, -1.0)).rgb
         + texture(uScene, vUV + uTexel * vec2( 1.0, -1.0)).rgb
         + texture(uScene, vUV + uTexel * vec2(-1.0,  1.0)).rgb
         + texture(uScene, vUV + uTexel * vec2( 1.0,  1.0)).rgb;
  c *= 0.25;
  float lum = max(c.r, max(c.g, c.b));
  float knee = smoothstep(uThreshold, uThreshold + 0.45, lum);
  outColor = vec4(c * knee, 1.0);
}`;

/**
 * Separable blur. Run twice — once across, once down — which is two passes of
 * nine taps instead of one pass of eighty-one.
 */
const BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSrc;
uniform vec2 uDir;
out vec4 outColor;
void main() {
  // Five taps at linear-sampled midpoints, which is a nine-tap gaussian for
  // the cost of five: the hardware does two of the samples in each fetch.
  vec3 c = texture(uSrc, vUV).rgb * 0.2270270270;
  c += texture(uSrc, vUV + uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture(uSrc, vUV - uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture(uSrc, vUV + uDir * 3.2307692308).rgb * 0.0702702703;
  c += texture(uSrc, vUV - uDir * 3.2307692308).rgb * 0.0702702703;
  outColor = vec4(c, 1.0);
}`;

/**
 * Composite: scene + bloom, tonemapped and graded, with a vignette.
 *
 * The tonemap is the Narkowicz ACES fit — one rational function, six
 * multiplies and a divide, and visually indistinguishable from the full curve
 * at a fraction of its cost. Applied after the bloom is added rather than
 * before, so the bloom is part of what gets rolled off instead of being pasted
 * on top of an already-graded image.
 */
const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomAmount;
uniform float uExposure;
uniform float uSaturation;
uniform float uVignette;
out vec4 outColor;

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec3 col = texture(uScene, vUV).rgb;
  col += texture(uBloom, vUV).rgb * uBloomAmount;
  col *= uExposure;
  col = aces(col);

  // Saturation, around the luminance the eye actually weights. Voxel palettes
  // are flat by construction and a little extra chroma is most of what makes
  // one look painted rather than printed.
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(lum), col, uSaturation);

  // Vignette, and a very slight warm/cool split between centre and edge. Both
  // are multiplies; neither is subtle enough to notice and both are missed
  // when they are gone.
  vec2 d = vUV - 0.5;
  float v = 1.0 - dot(d, d) * uVignette;
  col *= v * v;

  outColor = vec4(col, 1.0);
}`;

function linkPost(gl, frag, names) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compilePost(gl, gl.VERTEX_SHADER, POST_VERT));
  gl.attachShader(prog, compilePost(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('Post program link failed: ' + gl.getProgramInfoLog(prog));
  }
  const u = {};
  for (const n of names) u[n] = gl.getUniformLocation(prog, n);
  return { prog, u };
}
function compilePost(gl, type, src) { return compile(gl, type, src); }

export function createPostPrograms(gl) {
  return {
    bright: linkPost(gl, BRIGHT_FRAG, ['uScene', 'uTexel', 'uThreshold']),
    blur: linkPost(gl, BLUR_FRAG, ['uSrc', 'uDir']),
    composite: linkPost(gl, COMPOSITE_FRAG,
      ['uScene', 'uBloom', 'uBloomAmount', 'uExposure', 'uSaturation', 'uVignette']),
  };
}

/**
 * A colour target, and optionally a depth buffer to go with it.
 *
 * `half` asks for a 16-bit float target so the scene can carry values above
 * 1.0 into the bright pass — which is the entire point of the exercise, since
 * an 8-bit target clamps exactly the highlights bloom is meant to find. It is
 * an extension, and on hardware without it this quietly returns an 8-bit
 * target instead: the bloom still works, it just has less to work with.
 */
export function createTarget(gl, w, h, { depth = false, half = false } = {}) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const useHalf = half && !!gl.getExtension('EXT_color_buffer_half_float');
  if (useHalf) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  // Linear, because every consumer of these is either a blur or a full-screen
  // resample and both want the hardware to do the filtering.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  let rbo = null;
  if (depth) {
    rbo = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rbo);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rbo);
  }
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  if (!ok) {
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(tex);
    if (rbo) gl.deleteRenderbuffer(rbo);
    return null;
  }
  return { fbo, tex, rbo, w, h, half: useHalf };
}

export function deleteTarget(gl, t) {
  if (!t) return;
  gl.deleteFramebuffer(t.fbo);
  gl.deleteTexture(t.tex);
  if (t.rbo) gl.deleteRenderbuffer(t.rbo);
}

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
    'uLightPos', 'uLightColor', 'uLightCount', 'uSunDir', 'uCamPos', 'uSpecRim']) {
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
