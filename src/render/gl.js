// Thin WebGL wrapper: context creation, one shader program, buffer helpers.

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
layout(location=2) in float aLight;

uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
uniform vec2 uUVOffset;
uniform vec2 uUVScale;

out vec2 vUV;
out float vLight;
out float vDepth;

void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vec4 eye = uView * world;
  gl_Position = uProj * eye;
  vUV = uUVOffset + aUV * uUVScale;
  vLight = aLight;
  vDepth = length(eye.xyz);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
in float vLight;
in float vDepth;

uniform sampler2D uAtlas;
uniform vec4 uTint;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uEmissive;
uniform float uFlash;

out vec4 outColor;

void main() {
  vec4 tex = texture(uAtlas, vUV);
  if (tex.a < 0.35) discard;
  vec3 rgb = tex.rgb * uTint.rgb;
  float light = mix(vLight, 1.0, uEmissive);
  rgb *= light;
  rgb = mix(rgb, vec3(1.0, 0.55, 0.55), uFlash);
  float fog = clamp((vDepth - uFogNear) / max(uFogFar - uFogNear, 0.001), 0.0, 1.0);
  fog *= (1.0 - uEmissive * 0.6);
  rgb = mix(rgb, uFogColor, fog);
  outColor = vec4(rgb, tex.a * uTint.a);
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

export function createContext(canvas) {
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
    desynchronized: true,
  });
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
    'uFogNear', 'uFogFar', 'uEmissive', 'uUVOffset', 'uUVScale', 'uFlash']) {
    u[name] = gl.getUniformLocation(prog, name);
  }
  return { prog, u };
}

/** Vertex layout shared by every mesh: pos(3) uv(2) light(1) = 6 floats. */
export const STRIDE = 6 * 4;

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
  gl.bindVertexArray(null);
  return { vao, vbo, count: floats.length / 6 };
}
