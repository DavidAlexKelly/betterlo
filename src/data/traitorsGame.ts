// src/data/traitorsGame.ts
// ─────────────────────────────────────────────────────────────────────────────
// The Word Traitors! state machine, as PURE FUNCTIONS.
//
// Same shape as dealerGame.ts: React-free so tools/traitors-smoke.ts can play
// whole games and actually verify role assignment, the reveal pass, the
// accusation logic and scoring without a device.
//
// NOTE: this is the one mode with no drinking in it. There is no PenaltyContext
// here and no sips anywhere — rounds are scored innocents vs traitors instead.
//
// Reveal ordering: the hand-off pass follows the PLAYER LIST, because that's
// the order people are physically sitting in. The clue round uses a separate
// randomised speaking order, because going first is much harder than going
// last and it shouldn't always be the same person.
// ─────────────────────────────────────────────────────────────────────────────

import {
  TraitorWord, pickTraitorIndices, pickWord, speakingOrder,
} from './traitorsData';

export type TraitorsPhase =
  /** "Pass the phone to X" — nothing secret on screen. */
  | 'handoff'
  /** X's role, for X's eyes only. */
  | 'role'
  /** "X, you start" once everyone has seen their role. */
  | 'starter'
  /** Speaking order on screen, phone on the table. */
  | 'clues'
  /** Group has voted; someone taps the accused. */
  | 'accuse'
  /** Roles revealed, round scored. */
  | 'result'
  | 'over';

export interface TraitorsPlayerRef {
  id: number;
  name: string;
}

export interface TraitorsConfig {
  players: TraitorsPlayerRef[];
  traitorCount: number;
  /** Traitors see the word's vague hint rather than nothing at all. */
  hintsEnabled: boolean;
  /** null = keep playing until they stop. */
  totalRounds: number | null;
}

export interface TraitorsPlayerStats {
  timesTraitor: number;
  caught: number;
  survived: number;
}

export interface TraitorsRound {
  word: TraitorWord;
  /** Indices into cfg.players. */
  traitorIndices: number[];
  /** Indices into cfg.players, in the order they should give clues. */
  order: number[];
  /** How many players have finished looking at their role. */
  revealIndex: number;
  /** Indices the group has accused. */
  accused: number[];
  /** null until the accusation is submitted. */
  innocentsWin: boolean | null;
}

export interface TraitorsState {
  phase: TraitorsPhase;
  /** 1-based. */
  round: number;
  current: TraitorsRound;
  usedWordIds: string[];
  score: { innocentWins: number; traitorWins: number };
  stats: Record<number, TraitorsPlayerStats>;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function emptyStats(players: TraitorsPlayerRef[]): Record<number, TraitorsPlayerStats> {
  const out: Record<number, TraitorsPlayerStats> = {};
  for (const p of players) out[p.id] = { timesTraitor: 0, caught: 0, survived: 0 };
  return out;
}

function sameSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every(x => setB.has(x));
}

export function isTraitor(state: TraitorsState, playerIndex: number): boolean {
  return state.current.traitorIndices.includes(playerIndex);
}

/** The player currently being handed the phone, or shown their role. */
export function revealTarget(
  state: TraitorsState,
  cfg: TraitorsConfig,
): TraitorsPlayerRef | null {
  return cfg.players[state.current.revealIndex] ?? null;
}

/** Who speaks first this round. */
export function firstSpeaker(
  state: TraitorsState,
  cfg: TraitorsConfig,
): TraitorsPlayerRef | null {
  const idx = state.current.order[0];
  return idx == null ? null : cfg.players[idx] ?? null;
}

export function isOver(state: TraitorsState): boolean {
  return state.phase === 'over';
}

/** True once the group has picked exactly as many suspects as there are traitors. */
export function accusationComplete(state: TraitorsState): boolean {
  return state.current.accused.length === state.current.traitorIndices.length;
}

// ─────────────────────────────────────────────
// TRANSITIONS
// ─────────────────────────────────────────────

function buildRound(cfg: TraitorsConfig, usedWordIds: string[]): TraitorsRound {
  const word = pickWord(new Set(usedWordIds));
  return {
    word,
    traitorIndices: pickTraitorIndices(cfg.players.length, cfg.traitorCount),
    order: speakingOrder(cfg.players.length),
    revealIndex: 0,
    accused: [],
    innocentsWin: null,
  };
}

export function createGame(cfg: TraitorsConfig): TraitorsState {
  const current = buildRound(cfg, []);
  return {
    phase: cfg.players.length > 0 ? 'handoff' : 'over',
    round: 1,
    current,
    usedWordIds: [current.word.id],
    score: { innocentWins: 0, traitorWins: 0 },
    stats: emptyStats(cfg.players),
  };
}

/**
 * One tap during the reveal pass.
 *
 *   handoff → role      (the player has taken the phone and tapped)
 *   role    → handoff   (they've seen it; next player's name goes up)
 *   role    → starter   (that was the last player)
 *
 * The role is never on screen during a hand-off, so the phone can change hands
 * without anyone glimpsing someone else's card.
 */
export function advanceReveal(state: TraitorsState, cfg: TraitorsConfig): TraitorsState {
  if (state.phase === 'handoff') {
    return { ...state, phase: 'role' };
  }
  if (state.phase !== 'role') return state;

  const nextIndex = state.current.revealIndex + 1;
  if (nextIndex >= cfg.players.length) {
    return { ...state, phase: 'starter' };
  }
  return {
    ...state,
    phase: 'handoff',
    current: { ...state.current, revealIndex: nextIndex },
  };
}

export function startClues(state: TraitorsState): TraitorsState {
  return state.phase === 'starter' ? { ...state, phase: 'clues' } : state;
}

export function goToAccuse(state: TraitorsState): TraitorsState {
  return state.phase === 'clues' ? { ...state, phase: 'accuse' } : state;
}

/**
 * Select or deselect a suspect. Selecting beyond the traitor count is ignored,
 * so the group can't accuse four people and be trivially right.
 */
export function toggleAccused(state: TraitorsState, playerIndex: number): TraitorsState {
  if (state.phase !== 'accuse') return state;
  const { accused, traitorIndices } = state.current;

  if (accused.includes(playerIndex)) {
    return {
      ...state,
      current: { ...state.current, accused: accused.filter(i => i !== playerIndex) },
    };
  }
  if (accused.length >= traitorIndices.length) return state;
  return {
    ...state,
    current: { ...state.current, accused: [...accused, playerIndex] },
  };
}

/**
 * Lock in the accusation and score the round.
 *
 * Innocents only win on an exact match. Catching one of two traitors is a loss
 * — a partial catch means a traitor is still standing, so they got away with it.
 */
export function submitAccusation(
  state: TraitorsState,
  cfg: TraitorsConfig,
): TraitorsState {
  if (state.phase !== 'accuse' || !accusationComplete(state)) return state;

  const { accused, traitorIndices } = state.current;
  const innocentsWin = sameSet(accused, traitorIndices);

  const stats = { ...state.stats };
  for (const idx of traitorIndices) {
    const player = cfg.players[idx];
    if (!player) continue;
    const prev = stats[player.id] ?? { timesTraitor: 0, caught: 0, survived: 0 };
    const wasCaught = accused.includes(idx);
    stats[player.id] = {
      timesTraitor: prev.timesTraitor + 1,
      caught: prev.caught + (wasCaught ? 1 : 0),
      survived: prev.survived + (wasCaught ? 0 : 1),
    };
  }

  return {
    ...state,
    phase: 'result',
    current: { ...state.current, innocentsWin },
    score: {
      innocentWins: state.score.innocentWins + (innocentsWin ? 1 : 0),
      traitorWins: state.score.traitorWins + (innocentsWin ? 0 : 1),
    },
    stats,
  };
}

/** Deal the next round, or end the game if the round limit is reached. */
export function nextRound(state: TraitorsState, cfg: TraitorsConfig): TraitorsState {
  if (state.phase !== 'result') return state;

  if (cfg.totalRounds != null && state.round >= cfg.totalRounds) {
    return { ...state, phase: 'over' };
  }

  const current = buildRound(cfg, state.usedWordIds);
  return {
    ...state,
    phase: 'handoff',
    round: state.round + 1,
    current,
    usedWordIds: [...state.usedWordIds, current.word.id],
  };
}

export function endGame(state: TraitorsState): TraitorsState {
  return { ...state, phase: 'over' };
}
