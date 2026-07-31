// Thin WebGL wrapper: context creation, one shader program, buffer helpers.

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
layout(location=2) in float aLight;
layout(location=3) in float aGlow;

uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
uniform vec2 uUVOffset;
uniform vec2 uUVScale;

out vec2 vUV;
out float vLight;
out float vGlow;
out float vDepth;

void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vec4 eye = uView * world;
  gl_Position = uProj * eye;
  vUV = uUVOffset + aUV * uUVScale;
  vLight = aLight;
  vGlow = aGlow;
  vDepth = length(eye.xyz);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
in float vLight;
in float vGlow;
in float vDepth;

uniform sampler2D uAtlas;
uniform vec4 uTint;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uEmissive;
uniform float uFlash;
uniform float uCutoff;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec3 uGlowColor;

out vec4 outColor;

void main() {
  vec4 tex = texture(uAtlas, vUV);
  if (tex.a < uCutoff) discard;
  vec3 rgb = tex.rgb * uTint.rgb;

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
  lightCol = mix(lightCol, vec3(1.0), uEmissive);
  rgb *= lightCol * mix(max(vLight, vGlow * 0.85), 1.0, uEmissive);

  rgb = mix(rgb, vec3(1.0, 0.55, 0.55), uFlash);
  float fog = clamp((vDepth - uFogNear) / max(uFogFar - uFogNear, 0.001), 0.0, 1.0);
  fog *= (1.0 - uEmissive * 0.6);
  rgb = mix(rgb, uFogColor, fog);
  outColor = vec4(rgb, tex.a * uTint.a);
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
  for (const name of ['uProj', 'uView', 'uModel', 'uAtlas', 'uTint', 'uFogColor',
    'uFogNear', 'uFogFar', 'uEmissive', 'uUVOffset', 'uUVScale', 'uFlash',
    'uCutoff', 'uSunColor', 'uSkyColor', 'uGroundColor', 'uGlowColor']) {
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

/** Vertex layout shared by every mesh: pos(3) uv(2) light(1) = 6 floats. */
export const STRIDE = 7 * 4;

export function createMesh(gl, floats) {
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
  gl.bindVertexArray(null);
  return { vao, vbo, count: floats.length / 6 };
}
