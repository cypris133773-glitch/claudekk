// Status effects. `turns` counts the afflicted unit's own turns, so Slow does
// not evaporate while a fast enemy takes four actions in a row.

export const STATUS = {
  poison: { name: 'Rekt', glyph: '☣', tone: 'bad', desc: 'Loses 6% max HP each turn.' },
  silence: { name: 'Muted', glyph: '🔇', tone: 'bad', desc: 'Cannot cast.' },
  sleep: { name: 'Coping', glyph: '💤', tone: 'bad', desc: 'Skips turns until hit.' },
  blind: { name: 'FUDded', glyph: '🌑', tone: 'bad', desc: 'Accuracy gutted.' },
  slow: { name: 'Congested', glyph: '🐌', tone: 'bad', desc: 'Turns come half as often.' },
  confuse: { name: 'Aped', glyph: '🌀', tone: 'bad', desc: 'Attacks at random.' },
  berserk: { name: 'Diamond Hands', glyph: '💎', tone: 'mixed', desc: 'Auto-attacks, hits harder.' },
  doom: { name: 'Unstaked', glyph: '⌛', tone: 'bad', desc: 'KO when the countdown ends.' },
  zombie: { name: 'Exit-Scammed', glyph: '🧟', tone: 'bad', desc: 'Healing damages instead.' },
  powerBreak: { name: 'Leverage Break', glyph: '⚔', tone: 'bad', desc: 'Strength down 30%.' },
  armorBreak: { name: 'Contract Break', glyph: '🛡', tone: 'bad', desc: 'Defence halved, armour off.' },
  magicBreak: { name: 'Narrative Break', glyph: '✦', tone: 'bad', desc: 'Magic down 30%.' },
  mentalBreak: { name: 'Conviction Break', glyph: '🧠', tone: 'bad', desc: 'Magic defence halved.' },
  haste: { name: 'Hasted', glyph: '⚡', tone: 'good', desc: 'Turns come 50% more often.' },
  protect: { name: 'Protected', glyph: '🔰', tone: 'good', desc: 'Physical damage way down.' },
  shell: { name: 'Shelled', glyph: '🔮', tone: 'good', desc: 'Magic damage way down.' },
  regen: { name: 'Yielding', glyph: '🌱', tone: 'good', desc: 'Heals a little each turn.' },
  autolife: { name: 'Insured', glyph: '🪽', tone: 'good', desc: 'Revives once on KO.' },
  aim: { name: 'Aimed', glyph: '🎯', tone: 'good', desc: 'Accuracy way up.' },
  defending: { name: 'Guarding', glyph: '🚧', tone: 'good', desc: 'Halves the next hit.' },
  cheer: { name: 'Cheered', glyph: '📣', tone: 'good', desc: 'Strength and defence up.' },
};

export const BAD_STATUS = Object.keys(STATUS).filter((k) => STATUS[k].tone === 'bad');

export function statusName(id) {
  return STATUS[id]?.name ?? id;
}
