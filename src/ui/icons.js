// Skill and item icons, drawn in code.
//
// These are original art. The look they are going for — a bevelled stone slot
// with a coloured field and a hard border — is a genre convention, not a
// borrowed asset: nothing here traces or reproduces another game's artwork,
// which is what makes it safe to sell.
//
// One draw function serves both surfaces. The HUD calls it straight onto the
// 2D overlay every frame; the DOM menus call iconElement(), which renders the
// same thing into a small canvas they can drop into a button.

/**
 * Schools decide the field colour and the glow. Assigned from a skill's kind
 * and id so a player can read a bar at a glance: red is a blow you swing,
 * blue is control, green is sustain.
 */
export const SCHOOLS = {
  physical: { base: '#7a2f24', edge: '#e0714f', glow: '#ff9d5c' },
  fire: { base: '#7a3410', edge: '#ff8a3c', glow: '#ffc06a' },
  frost: { base: '#123a52', edge: '#8fe3ff', glow: '#c9f3ff' },
  shadow: { base: '#2e1745', edge: '#a35cff', glow: '#d9b3ff' },
  holy: { base: '#5a4614', edge: '#ffe9a8', glow: '#fff6de' },
  nature: { base: '#1c4a24', edge: '#8ce06a', glow: '#d6ffb8' },
  storm: { base: '#123f45', edge: '#7ef0ff', glow: '#c0fbff' },
  arcane: { base: '#3a1f52', edge: '#c98fff', glow: '#e8d0ff' },
};

/** Skills whose school is not obvious from their kind. */
const BY_ID = {
  charge: 'physical', whirlwind: 'physical', shieldwall: 'physical', execute: 'physical',
  thunderclap: 'storm', rend: 'physical', heroicleap: 'physical', battlecry: 'physical',
  fireball: 'fire', flamestrike: 'fire', meteor: 'fire', immolation: 'fire',
  lavaburst: 'fire', searingtotem: 'fire', rainoffire: 'fire',
  frostnova: 'frost', blizzard: 'frost', blink: 'arcane', arcaneorb: 'arcane',
  timewarp: 'arcane',
  corruption: 'shadow', drainlife: 'shadow', summonimp: 'shadow', shadowfury: 'shadow',
  chaosbolt: 'shadow', howl: 'shadow', soulharvest: 'shadow', mindblast: 'shadow',
  voidform: 'shadow', chaosnova: 'shadow',
  chainlightning: 'storm', earthshock: 'nature', healingtotem: 'nature',
  stormstrike: 'storm', thunderstorm: 'storm', ghostwolf: 'nature',
  smite: 'holy', shield: 'holy', renew: 'holy', holynova: 'holy',
  divinestar: 'holy', mindsear: 'shadow',
  ambush: 'physical', fanofknives: 'nature', evasion: 'nature', eviscerate: 'physical',
  shuriken: 'nature', crimsontempest: 'physical', smokebomb: 'nature', shadowdance: 'shadow',
  felrush: 'nature', glaivethrow: 'nature', soulcleave: 'shadow', sigilofflame: 'fire',
  eyebeam: 'nature', metamorphosis: 'shadow',
  crusaderstrike: 'holy', consecration: 'holy', divineshield: 'holy', judgement: 'holy',
  hammerofwrath: 'holy', layonhands: 'holy', avengershield: 'holy', blessing: 'holy',
  divinestorm: 'holy', avengingwrath: 'holy',
  arcaneshot: 'nature', multishot: 'physical', summonbeast: 'nature',
  explosiveshot: 'fire', disengage: 'nature', serpentsting: 'nature',
  volley: 'nature', aspect: 'nature', freezingtrap: 'frost', killshot: 'physical',
};

const BY_KIND = {
  projectile: 'arcane', aoe_self: 'physical', aoe_target: 'fire', dash: 'physical',
  buff: 'holy', heal: 'nature', summon: 'shadow', cone: 'shadow', chain: 'storm',
  strike: 'physical', zone: 'fire',
};

export function schoolFor(skill) {
  if (!skill) return SCHOOLS.physical;
  const name = BY_ID[skill.id] || BY_KIND[skill.kind] || 'physical';
  return SCHOOLS[name] || SCHOOLS.physical;
}

function roundRectPath(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/**
 * A chamfered octagon. A voxel game's icon should not be a rounded square —
 * that is the shape of a phone app, and it is the shape every one of these
 * was.
 */
function chamferPath(c, x, y, s, cut) {
  c.beginPath();
  c.moveTo(x + cut, y);
  c.lineTo(x + s - cut, y);
  c.lineTo(x + s, y + cut);
  c.lineTo(x + s, y + s - cut);
  c.lineTo(x + s - cut, y + s);
  c.lineTo(x + cut, y + s);
  c.lineTo(x, y + s - cut);
  c.lineTo(x, y + cut);
  c.closePath();
}

const TAU = Math.PI * 2;

/**
 * The glyph vocabulary.
 *
 * Each returns a path in the unit box [-0.5, 0.5], y down; the composer
 * translates and scales it into the plate. Shapes rather than emoji, because
 * an emoji is a full-colour sticker from someone else's font: it does not take
 * the plate's light, it does not scale down cleanly, and it looks like exactly
 * what it is.
 *
 * Chosen so no two share both an aspect and a fill density — at 20px a glyph
 * is about 140 usable pixels and silhouette mass is the only signal that
 * survives. Detail is not available at that size and adding it is wasted.
 */
const MARK = {
  blade(c) {
    c.beginPath();
    c.moveTo(0, -0.48); c.lineTo(0.13, -0.28); c.lineTo(0.10, 0.14);
    c.lineTo(-0.10, 0.14); c.lineTo(-0.13, -0.28); c.closePath();
    c.moveTo(-0.24, 0.14); c.lineTo(0.24, 0.14);
    c.lineTo(0.17, 0.30); c.lineTo(-0.17, 0.30); c.closePath();
  },
  orb(c) { c.beginPath(); c.arc(0, 0, 0.33, 0, TAU); },
  bolt(c) {
    c.beginPath();
    c.moveTo(0.10, -0.50); c.lineTo(-0.26, 0.02); c.lineTo(-0.03, 0.02);
    c.lineTo(-0.16, 0.50); c.lineTo(0.28, -0.10); c.lineTo(0.03, -0.10);
    c.closePath();
  },
  shield(c) {
    c.beginPath();
    c.moveTo(-0.32, -0.40); c.lineTo(0.32, -0.40); c.lineTo(0.32, 0.02);
    c.quadraticCurveTo(0.32, 0.32, 0, 0.48);
    c.quadraticCurveTo(-0.32, 0.32, -0.32, 0.02);
    c.closePath();
  },
  flame(c) {
    c.beginPath();
    c.moveTo(0.04, -0.50);
    c.bezierCurveTo(0.34, -0.18, 0.36, 0.16, 0.14, 0.38);
    c.bezierCurveTo(0.02, 0.48, -0.20, 0.48, -0.28, 0.30);
    c.bezierCurveTo(-0.38, 0.08, -0.20, -0.06, -0.14, -0.22);
    c.bezierCurveTo(-0.10, -0.04, 0.02, -0.02, 0.06, -0.14);
    c.closePath();
  },
  shard(c) {
    c.beginPath();
    c.moveTo(0, -0.50); c.lineTo(0.17, -0.06); c.lineTo(0, 0.50);
    c.lineTo(-0.17, -0.06); c.closePath();
  },
  claw(c) {
    c.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = -0.70 + i * 0.70, oy = 0.44;
      const sn = Math.sin(a), cs = Math.cos(a);
      c.moveTo(sn * 0.10 - 0.09, oy - cs * 0.10);
      c.quadraticCurveTo(sn * 0.52 - 0.05, oy - cs * 0.70, sn * 0.55, oy - cs * 0.88);
      c.quadraticCurveTo(sn * 0.44 + 0.08, oy - cs * 0.62, sn * 0.10 + 0.09, oy - cs * 0.10);
      c.closePath();
    }
  },
  ring(c) {
    c.beginPath();
    c.arc(0, 0, 0.44, 0, TAU);
    c.arc(0, 0, 0.30, 0, TAU, true);
  },
  wedge(c) {
    c.beginPath();
    c.moveTo(0, 0.44);
    c.arc(0, 0.44, 0.88, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55);
    c.closePath();
  },
  chev(c) {
    c.beginPath();
    for (const dy of [-0.26, 0.14]) {
      c.moveTo(-0.38, dy + 0.18); c.lineTo(0, dy - 0.18); c.lineTo(0.38, dy + 0.18);
      c.lineTo(0.38, dy + 0.34); c.lineTo(0, dy - 0.02); c.lineTo(-0.38, dy + 0.34);
      c.closePath();
    }
  },
  drop(c) {
    c.beginPath();
    c.moveTo(0, -0.46);
    c.bezierCurveTo(0.29, -0.13, 0.36, 0.10, 0.28, 0.25);
    c.bezierCurveTo(0.17, 0.47, -0.17, 0.47, -0.28, 0.25);
    c.bezierCurveTo(-0.36, 0.10, -0.29, -0.13, 0, -0.46);
    c.closePath();
  },
  skull(c) {
    c.beginPath();
    c.moveTo(-0.34, -0.42); c.lineTo(0.34, -0.42); c.lineTo(0.34, 0.08);
    c.lineTo(0.19, 0.24); c.lineTo(0.19, 0.44); c.lineTo(-0.19, 0.44);
    c.lineTo(-0.19, 0.24); c.lineTo(-0.34, 0.08); c.closePath();
    c.rect(-0.26, -0.29, 0.19, 0.22);
    c.rect(0.07, -0.29, 0.19, 0.22);
  },
  hammer(c) {
    c.beginPath();
    c.rect(-0.06, -0.16, 0.12, 0.64);
    c.moveTo(-0.34, -0.44); c.lineTo(0.34, -0.44);
    c.lineTo(0.28, -0.06); c.lineTo(-0.28, -0.06); c.closePath();
  },
  wing(c) {
    c.beginPath();
    c.moveTo(-0.42, 0.32);
    c.bezierCurveTo(-0.28, -0.14, 0.02, -0.44, 0.42, -0.42);
    c.bezierCurveTo(0.21, -0.15, 0.19, 0.06, 0.15, 0.23);
    c.lineTo(0.02, 0.06); c.lineTo(-0.06, 0.29); c.lineTo(-0.19, 0.11);
    c.closePath();
  },
};

/**
 * Which mark a skill gets, chosen from its own words.
 *
 * Order matters — specific before generic. This resolves 100+ skills from
 * fifteen lines of data, which is the only way an icon set this size stays
 * maintainable: a new skill gets a sensible icon the moment it is named, and
 * nobody has to author one.
 */
const WORDS = [
  [/frost|ice|freez|blizz|chill/, 'shard'],
  [/fire|flame|pyro|lava|immol|burn|ember|molten|sear|scorch|infern/, 'flame'],
  [/light(?!n.*shield)|thunder|storm|shock|volt|spark|elemental|clap/, 'bolt'],
  [/charge|leap|rush|blink|gate|disengag|ambush|warp|swift|dance/, 'chev'],
  [/wing|hawk|aspect|feather|wolf|beast|pet|spirit|ancest|flight|volley/, 'wing'],
  [/drain|blood|life|vamp|renew|mend|glory|well|font|hands/, 'drop'],
  [/shield|ward|barrier|absorb|guard|wall|block|fortitude|sacred|divineshield/, 'shield'],
  [/glaive|blade|knife|knives|dagger|sword|cleave|shear|eviscer|backstab|execut|strike|slash|sever|stab/, 'blade'],
  [/wrath|rage|fury|berserk|avatar|metamorph|annihil|whirl|tempest|rend|claw|shred|tear|maul/, 'claw'],
  [/hammer|smash|crush|quake|earth|stone|totem|anvil|pillar|sigil|consecr|judge|verdict|bless/, 'hammer'],
  [/skull|death|doom|soul|void|demon|fiend|imp|fel|dark|shadow|corrupt|terror|scream|dread|pact|harvest|kill/, 'skull'],
  [/orb|sphere|ball|nova|bomb|meteor|comet|moon|globe|arcane|blast|star/, 'orb'],
  [/shot|arrow|bolt|quiver|sting|dart|shuriken|spike|fang|serpent|toss|trap/, 'shard'],
  [/ring|aura|halo|veil|shroud|smoke|circle|form|blur|evasion|dome/, 'ring'],
  [/beam|lance|ray|pierce|gaze|eye|sight|smite/, 'wedge'],
];

/** How many copies of the mark, and where. Count is a low-frequency signal
 *  and it is the one that still reads at 20px. */
const LAYOUT = {
  one: [[0, 0, 1, 0]],
  tilt: [[0, 0, 1, -0.42]],
  pair: [[-0.17, 0.03, 0.78, -0.34], [0.17, 0.03, 0.78, 0.34]],
  trio: [[-0.24, 0.09, 0.64, -0.60], [0, -0.05, 0.70, 0], [0.24, 0.09, 0.64, 0.60]],
  stack: [[0, -0.22, 0.62, 0], [0, 0.22, 0.62, 0]],
  big: [[0, 0, 1.14, 0]],
};

/** `kind` decides the arrangement, so how a skill is delivered is visible. */
const KIND_LAYOUT = {
  aoe_self: 'trio', aoe_target: 'big', zone: 'trio', cone: 'big',
  chain: 'stack', dash: 'tilt', strike: 'tilt', projectile: 'one',
  buff: 'one', heal: 'one', summon: 'one',
};

const markCache = new Map();
export function markFor(skill) {
  if (!skill) return { mark: 'blade', layout: 'one' };
  const key = skill.id || skill.name || '?';
  let hit = markCache.get(key);
  if (hit) return hit;
  const words = `${skill.id || ''} ${skill.name || ''}`.toLowerCase();
  let mark = 'orb';
  for (const [re, m] of WORDS) if (re.test(words)) { mark = m; break; }
  hit = { mark, layout: KIND_LAYOUT[skill.kind] || 'one' };
  markCache.set(key, hit);
  return hit;
}

function mix(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',')})`;
}

/**
 * Fill a mark with two tones split by a hard diagonal, then outline it.
 *
 * Two flat facets and a black keyline, one light direction — the same way
 * atlas.js shades a block face. A gradient inside a 12px glyph is wasted; a
 * hard seam is not, and it is the whole difference between vector clipart and
 * something that looks carved.
 */
function facet(c, draw, lit, mid, scale) {
  draw(c);
  c.fillStyle = lit;
  c.fill('evenodd');
  c.save();
  c.clip('evenodd');
  c.fillStyle = mid;
  c.beginPath();
  c.moveTo(-1.5, 0.60); c.lineTo(1.5, -0.80); c.lineTo(1.5, 1.5); c.lineTo(-1.5, 1.5);
  c.closePath();
  c.fill();
  c.restore();
  c.lineJoin = 'round';
  c.lineWidth = 0.055 / scale;
  c.strokeStyle = 'rgba(6,8,13,0.9)';
  draw(c);
  c.stroke();
}

/**
 * Draw one icon.
 *
 * The plate is neutral steel and the school colour lives in the rim, one vent
 * of light and the glyph. That inversion is the whole change: when the plate
 * *is* the school colour, every icon is a coloured square with a sticker on
 * it, and eight hues only read as eight hues if the plate is not one of them.
 *
 * `opts.ready` lifts the rim and lights the glyph; a skill on cooldown loses
 * the light rather than being dimmed uniformly, because losing the light is
 * what reads as "off" at 20px.
 */
export function drawIcon(c, glyph, x, y, size, opts = {}) {
  const school = opts.school || SCHOOLS.physical;
  const ready = opts.ready !== false;
  const cut = size * 0.19;

  c.save();

  // Seat: the same shape, offset down, so the plate sits *in* the panel.
  chamferPath(c, x, y + Math.max(1, size * 0.03), size, cut);
  c.fillStyle = '#05060a';
  c.fill();

  // Field: machined steel, lit top-left.
  const field = c.createLinearGradient(x, y, x + size, y + size);
  field.addColorStop(0, '#3d4552');
  field.addColorStop(0.5, '#20262f');
  field.addColorStop(1, '#0d1017');
  chamferPath(c, x, y, size, cut);
  c.fillStyle = field;
  c.fill();

  // The one place the school colour enters the plate.
  c.save();
  chamferPath(c, x, y, size, cut);
  c.clip();
  const vent = c.createRadialGradient(
    x + size * 0.5, y + size * 0.56, 0, x + size * 0.5, y + size * 0.56, size * 0.66);
  vent.addColorStop(0, school.base);
  vent.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalAlpha = ready ? 0.78 : 0;
  c.fillStyle = vent;
  c.fillRect(x, y, size, size);
  c.globalAlpha = 1;
  // Rake: one highlight down the left chamfer and across the top.
  c.strokeStyle = 'rgba(255,255,255,0.28)';
  c.lineWidth = Math.max(1, size * 0.035);
  c.beginPath();
  c.moveTo(x + cut * 0.4, y + size - cut);
  c.lineTo(x + cut * 0.4, y + cut);
  c.lineTo(x + cut, y + cut * 0.4);
  c.lineTo(x + size - cut, y + cut * 0.4);
  c.stroke();
  c.restore();

  // Glyph.
  const { mark, layout } = opts.mark || { mark: null, layout: 'one' };
  const lit = ready ? mix(school.edge, '#ffffff', 0.40) : '#8b93a2';
  const midCol = ready ? mix(school.edge, school.base, 0.55) : '#5a616e';
  if (mark && MARK[mark]) {
    const copies = LAYOUT[layout] || LAYOUT.one;
    for (const [dx, dy, sc, rot] of copies) {
      c.save();
      c.translate(x + size * (0.5 + dx * 0.5), y + size * (0.5 + dy * 0.5));
      const g = size * 0.62 * sc;
      c.scale(g, g);
      c.rotate(rot);
      if (ready) { c.shadowColor = school.glow; c.shadowBlur = size * 0.10 / g; }
      facet(c, MARK[mark], lit, midCol, g);
      c.restore();
    }
  } else if (glyph) {
    // Anything with no mark of its own — a Forge track, a difficulty tier —
    // still draws its emoji, so nothing loses its icon while the vocabulary
    // grows to cover it.
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `${Math.round(size * 0.5)}px 'Segoe UI Emoji', 'Noto Color Emoji', system-ui, sans-serif`;
    c.globalAlpha = ready ? 1 : 0.5;
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillText(glyph, x + size / 2 + size * 0.03, y + size * 0.55);
    c.fillStyle = '#fff';
    c.fillText(glyph, x + size / 2, y + size * 0.52);
    c.globalAlpha = 1;
  }
  c.shadowBlur = 0;

  // Rim, doubled: a dark seat under a bright edge.
  c.lineWidth = Math.max(1.5, size * 0.075);
  chamferPath(c, x + c.lineWidth / 2, y + c.lineWidth / 2, size - c.lineWidth, cut);
  c.strokeStyle = 'rgba(0,0,0,0.62)';
  c.stroke();
  c.lineWidth = Math.max(1, size * 0.04);
  chamferPath(c, x + c.lineWidth / 2, y + c.lineWidth / 2, size - c.lineWidth, cut);
  c.strokeStyle = ready ? school.edge : 'rgba(190,205,230,0.22)';
  c.stroke();

  // Cooldown and locked states darken the whole plate rather than only the
  // glyph, so the difference is the light on it.
  if (!ready) {
    chamferPath(c, x, y, size, cut);
    c.fillStyle = 'rgba(8,10,16,0.40)';
    c.fill();
  }

  c.restore();
}

/** Convenience wrapper: draw a skill's icon with its own school. */
export function drawSkillIcon(c, skill, x, y, size, opts = {}) {
  drawIcon(c, skill.icon, x, y, size,
    { ...opts, school: schoolFor(skill), mark: markFor(skill) });
}

/**
 * The same icon as a standalone canvas, for the DOM menus. Rendered at device
 * resolution so it stays crisp on a phone, and sized in CSS pixels.
 */
export function iconElement(glyph, size, opts = {}) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const el = document.createElement('canvas');
  el.width = Math.round(size * dpr);
  el.height = Math.round(size * dpr);
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  const c = el.getContext('2d');
  c.scale(dpr, dpr);
  drawIcon(c, glyph, 0, 0, size, opts);
  return el;
}

export function skillIconElement(skill, size, opts = {}) {
  return iconElement(skill.icon, size,
    { ...opts, school: schoolFor(skill), mark: markFor(skill) });
}
