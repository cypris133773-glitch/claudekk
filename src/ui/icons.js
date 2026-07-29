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
 * Draw one icon. `opts.ready` lifts the border and the glyph; a skill on
 * cooldown or short of resource is drawn flat and dim, so readiness is a
 * property of the art rather than a badge stuck on top of it.
 */
export function drawIcon(c, glyph, x, y, size, opts = {}) {
  const school = opts.school || SCHOOLS.physical;
  const ready = opts.ready !== false;
  const r = Math.max(3, size * 0.18);

  c.save();

  // Field: lit from the top left, like every slot in the genre.
  const grad = c.createLinearGradient(x, y, x + size, y + size);
  grad.addColorStop(0, ready ? school.edge : school.base);
  grad.addColorStop(0.45, school.base);
  grad.addColorStop(1, '#0b0d14');
  roundRectPath(c, x, y, size, size, r);
  c.fillStyle = grad;
  c.globalAlpha = ready ? 1 : 0.55;
  c.fill();

  // Inner bevel: a bright top-left edge and a dark bottom-right one is what
  // reads as carved rather than printed.
  c.globalAlpha = ready ? 0.85 : 0.4;
  c.lineWidth = Math.max(1, size * 0.05);
  roundRectPath(c, x + c.lineWidth, y + c.lineWidth,
    size - c.lineWidth * 2, size - c.lineWidth * 2, r * 0.8);
  c.strokeStyle = 'rgba(255,255,255,0.22)';
  c.stroke();

  // Outer border.
  c.globalAlpha = 1;
  c.lineWidth = Math.max(1.5, size * 0.07);
  roundRectPath(c, x + c.lineWidth / 2, y + c.lineWidth / 2,
    size - c.lineWidth, size - c.lineWidth, r);
  c.strokeStyle = ready ? school.edge : 'rgba(255,255,255,0.18)';
  c.stroke();

  // Glyph.
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = `${Math.round(size * 0.52)}px 'Segoe UI Emoji', 'Noto Color Emoji', system-ui, sans-serif`;
  c.globalAlpha = ready ? 1 : 0.5;
  if (ready) {
    c.shadowColor = school.glow;
    c.shadowBlur = size * 0.22;
  }
  c.fillStyle = '#fff';
  c.fillText(glyph, x + size / 2, y + size * 0.54);
  c.shadowBlur = 0;

  c.restore();
}

/** Convenience wrapper: draw a skill's icon with its own school. */
export function drawSkillIcon(c, skill, x, y, size, opts = {}) {
  drawIcon(c, skill.icon, x, y, size, { ...opts, school: schoolFor(skill) });
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
  return iconElement(skill.icon, size, { ...opts, school: schoolFor(skill) });
}
