// Minimal math helpers. No dependencies — everything the renderer and physics need.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 1, b = 0) => b + Math.random() * (a - b);
export const randInt = (a, b) => Math.floor(rand(b + 1, a));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

/** Shortest signed difference between two angles (radians). */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// ---------------------------------------------------------------------------
// mat4 — column-major Float32Array(16), same layout WebGL expects.
// ---------------------------------------------------------------------------

export function mat4() {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function identity(out) {
  out.fill(0);
  out[0] = out[5] = out[10] = out[15] = 1;
  return out;
}

export function perspective(out, fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

export function multiply(out, a, b) {
  // out = a * b
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    out[c * 4 + 0] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

export function translate(out, x, y, z) {
  identity(out);
  out[12] = x; out[13] = y; out[14] = z;
  return out;
}

/** Model matrix: translate * rotateY * rotateX * scale — enough for blocky entities. */
export function composeTRS(out, px, py, pz, ry, rx, sx, sy, sz) {
  const cy = Math.cos(ry), sy0 = Math.sin(ry);
  const cx = Math.cos(rx), sx0 = Math.sin(rx);
  // R = Ry * Rx
  const r00 = cy,            r01 = sy0 * sx0,  r02 = sy0 * cx;
  const r10 = 0,             r11 = cx,         r12 = -sx0;
  const r20 = -sy0,          r21 = cy * sx0,   r22 = cy * cx;
  out[0] = r00 * sx; out[1] = r10 * sx; out[2] = r20 * sx; out[3] = 0;
  out[4] = r01 * sy; out[5] = r11 * sy; out[6] = r21 * sy; out[7] = 0;
  out[8] = r02 * sz; out[9] = r12 * sz; out[10] = r22 * sz; out[11] = 0;
  out[12] = px; out[13] = py; out[14] = pz; out[15] = 1;
  return out;
}

/** First-person view matrix from eye position + yaw/pitch (radians). */
export function viewFromEuler(out, ex, ey, ez, yaw, pitch, roll = 0) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  // Camera basis: forward = (-sin(yaw)cos(pitch), sin(pitch), -cos(yaw)cos(pitch))
  const fx = -sy * cp, fy = sp, fz = -cy * cp;
  let rx = cy, ry = 0, rz = -sy;                // right = normalize(cross(fwd, worldUp))
  let ux = ry * fz - rz * fy;                   // up = cross(right, fwd)
  let uy = rz * fx - rx * fz;
  let uz = rx * fy - ry * fx;
  // Roll: spin right and up about the forward axis, leaving forward alone.
  //
  // A camera that never banks is a camera bolted to a tripod. A few degrees
  // into a strafe and a kick when something hits you is most of what separates
  // a first-person view that feels like a body from one that feels like a
  // floating rectangle — and it costs four multiplies on a matrix built once a
  // frame.
  if (roll) {
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const nrx = rx * cr + ux * sr, nry = ry * cr + uy * sr, nrz = rz * cr + uz * sr;
    const nux = ux * cr - rx * sr, nuy = uy * cr - ry * sr, nuz = uz * cr - rz * sr;
    rx = nrx; ry = nry; rz = nrz;
    ux = nux; uy = nuy; uz = nuz;
  }
  out[0] = rx; out[4] = ry; out[8] = rz; out[12] = -(rx * ex + ry * ey + rz * ez);
  out[1] = ux; out[5] = uy; out[9] = uz; out[13] = -(ux * ex + uy * ey + uz * ez);
  out[2] = -fx; out[6] = -fy; out[10] = -fz; out[14] = fx * ex + fy * ey + fz * ez;
  out[3] = 0; out[7] = 0; out[11] = 0; out[15] = 1;
  return out;
}

/** Unit forward vector for a yaw/pitch pair, matching viewFromEuler. */
export function forwardVec(yaw, pitch) {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}

export function dist2(ax, ay, az, bx, by, bz) {
  const dx = ax - bx, dy = ay - by, dz = az - bz;
  return dx * dx + dy * dy + dz * dz;
}

export function distXZ(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.hypot(dx, dz);
}

/** Deterministic-ish hash noise in [0,1) — used for procedural textures. */
export function hash2(x, y, seed = 0) {
  let h = x * 374761393 + y * 668265263 + seed * 1442695040888963407;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

/**
 * Where the sun is, as a unit vector pointing towards it.
 *
 * Lives here rather than in the renderer because two very different parts of
 * the game need to agree on it exactly: the shader, which uses it for
 * highlights, and the mesh builder, which marches along it to bake shadows. A
 * disagreement between those two is a room lit from one direction and shadowed
 * from another, which reads as broken without being obviously wrong anywhere.
 */
// Roughly 38 degrees above the horizon. A high sun is the safe choice and the
// boring one: it puts every shadow directly underneath the thing casting it,
// so a wall two blocks thick casts two blocks of shadow and the floor stays a
// flat sheet. Lower, and the same wall throws a shadow you can see across the
// room, which is most of what makes an arena look like a place at a time of
// day rather than a diagram under a lamp.
export const SUN_DIR = [0.556, 0.618, 0.556];
