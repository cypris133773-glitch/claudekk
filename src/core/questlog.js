// The quest log: which three quests are offered, how far along they are, and
// what happens when one is finished.
//
// Kept apart from the quest *data* on purpose. quests.js answers "what is quest
// 217"; this answers "where is this player", which is the part that lives in
// save data and therefore the part that has to survive a save written by an
// older build.

import { questAt, QUEST_COUNT, ACTIVE_SLOTS, METRICS } from '../data/quests.js';

/**
 * A fresh log. `next` is the lowest quest index not yet handed out, so the
 * three active slots are always [next-3, next-1] in some order and the whole
 * state is four numbers plus per-slot progress.
 */
export function emptyQuestState() {
  const slots = [];
  for (let i = 0; i < ACTIVE_SLOTS; i++) slots.push({ index: i, progress: 0 });
  return { slots, next: ACTIVE_SLOTS, completed: 0, earned: 0 };
}

/**
 * Repair a quest state read from disk. A save from before quests existed has
 * none at all; one from a build with different slot counts has the wrong
 * shape. Both must end up playable rather than throwing on the menu screen.
 */
export function normaliseQuestState(state) {
  if (!state || !Array.isArray(state.slots)) return emptyQuestState();
  const out = {
    slots: [],
    next: Number.isFinite(state.next) ? state.next : ACTIVE_SLOTS,
    completed: Number.isFinite(state.completed) ? state.completed : 0,
    earned: Number.isFinite(state.earned) ? state.earned : 0,
  };
  const used = new Set();
  for (const s of state.slots) {
    if (out.slots.length >= ACTIVE_SLOTS) break;
    const index = Number.isFinite(s && s.index) ? Math.abs(Math.floor(s.index)) % QUEST_COUNT : 0;
    if (used.has(index)) continue;              // never offer the same quest twice
    used.add(index);
    out.slots.push({ index, progress: Math.max(0, Number(s.progress) || 0) });
  }
  // Top up if the save had fewer slots than this build offers.
  while (out.slots.length < ACTIVE_SLOTS) {
    let index = out.next % QUEST_COUNT;
    let guard = 0;
    while (used.has(index) && guard++ < QUEST_COUNT) index = (index + 1) % QUEST_COUNT;
    used.add(index);
    out.slots.push({ index, progress: 0 });
    out.next = index + 1;
  }
  return out;
}

/** The three offered quests, each with its live progress. */
export function activeQuests(state) {
  return state.slots.map((s) => {
    const q = questAt(s.index);
    const progress = Math.min(q.goal, s.progress);
    return { ...q, progress, done: progress >= q.goal, slot: s };
  });
}

/**
 * Feed a batch of run metrics into the log.
 *
 * `deltas` is what happened since the last call for counting metrics, and
 * `peaks` is the best-so-far for peak metrics — the caller knows which is
 * which because METRICS says so, and mixing them up is the one bug this
 * system can have that a player would notice (a "reach wave 20" quest ticking
 * up four at a time).
 *
 * Returns the quests that crossed their goal on this call, so the caller can
 * announce them. Nothing is paid out here: claiming is deliberately a button.
 */
export function applyProgress(state, deltas = {}, peaks = {}) {
  const finished = [];
  for (const slot of state.slots) {
    const q = questAt(slot.index);
    const was = slot.progress;
    if (q.kind === 'peak') {
      const p = peaks[q.metric];
      if (Number.isFinite(p)) slot.progress = Math.max(slot.progress, p);
    } else {
      const d = deltas[q.metric];
      if (Number.isFinite(d) && d > 0) slot.progress += d;
    }
    if (was < q.goal && slot.progress >= q.goal) finished.push(q);
  }
  return finished;
}

/**
 * Claim a finished quest: pay the diamonds and slide the next one in.
 *
 * Returns the reward, or 0 if the quest was not actually finished — the menu
 * disables the button, but a stale screen must not be able to mint currency.
 */
export function claimQuest(state, index, profile) {
  const slot = state.slots.find((s) => s.index === index);
  if (!slot) return 0;
  const q = questAt(index);
  if (slot.progress < q.goal) return 0;

  profile.data.souls += q.reward;
  profile.data.lifetimeSouls = (profile.data.lifetimeSouls || 0) + q.reward;
  state.completed++;
  state.earned += q.reward;

  // Slide the next unseen quest into the freed slot, skipping anything already
  // on the board. After 500 the list wraps, so the log never runs dry — the
  // goals at that point are the hardest the generator produces.
  const onBoard = new Set(state.slots.map((s) => s.index));
  onBoard.delete(index);
  let next = state.next % QUEST_COUNT;
  let guard = 0;
  while (onBoard.has(next) && guard++ < QUEST_COUNT) next = (next + 1) % QUEST_COUNT;
  slot.index = next;
  slot.progress = 0;
  state.next = next + 1;
  return q.reward;
}

/**
 * Skip a quest you do not want, for a price.
 *
 * Without this the log can deadlock in practice: "reach wave 62 in a single
 * run" sitting in a slot at the point where your best is 20 blocks a third of
 * the board for as long as it takes to get there. The cost is a share of what
 * the quest would have paid, so rerolling toward an easy one is never free
 * money.
 */
export function rerollCost(q) {
  return Math.max(50, Math.round(q.reward * 0.25 / 5) * 5);
}

export function rerollQuest(state, index, profile) {
  const slot = state.slots.find((s) => s.index === index);
  if (!slot) return false;
  const q = questAt(index);
  const cost = rerollCost(q);
  if (profile.data.souls < cost) return false;
  profile.data.souls -= cost;

  const onBoard = new Set(state.slots.map((s) => s.index));
  onBoard.delete(index);
  let next = state.next % QUEST_COUNT;
  let guard = 0;
  while (onBoard.has(next) && guard++ < QUEST_COUNT) next = (next + 1) % QUEST_COUNT;
  slot.index = next;
  slot.progress = 0;
  state.next = next + 1;
  return true;
}

export { METRICS };
