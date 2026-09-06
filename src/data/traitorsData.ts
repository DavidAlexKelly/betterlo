// src/data/traitorsData.ts
// ─────────────────────────────────────────────────────────────────────────────
// Word pack for Word Traitors!
//
// Unlike the trivia banks, words.json is HAND-AUTHORED and is the source of
// truth — there is no converter, because there is no messy upstream format to
// clean up. Add words by editing that file directly, then run:
//
//   node src/data/ValidateTraitors.js
//
// Ids are derived from the word rather than stored, so the JSON stays in the
// simple { word, hint } shape that's pleasant to extend by hand.
//
// No React Native imports, so this is testable without a device.
// ─────────────────────────────────────────────────────────────────────────────

import { pickOne, shuffle } from '../utils/random';
import rawWords from './traitors/words.json';

export interface TraitorWord {
  /** Derived from the word: "Smartphone" → "smartphone". */
  id: string;
  /** The secret the innocents see. */
  word: string;
  /** The vague nudge a traitor sees, when hints are switched on. */
  hint: string;
}

interface RawWord {
  word: string;
  hint: string;
}

export function wordId(word: string): string {
  return word.trim().toLowerCase().replace(/\s+/g, '-');
}

export const WORDS: TraitorWord[] = (rawWords as RawWord[]).map(w => ({
  id: wordId(w.word),
  word: w.word,
  hint: w.hint,
}));

export const WORD_COUNT = WORDS.length;

/**
 * A word the group hasn't had recently.
 *
 * Falls back to the full pack once everything has been used rather than
 * returning nothing — a long session must never run dry mid-round.
 */
export function pickWord(usedIds: Set<string>): TraitorWord {
  const fresh = WORDS.filter(w => !usedIds.has(w.id));
  return pickOne(fresh.length > 0 ? fresh : WORDS);
}

/**
 * Who the traitors are, as indices into the player list.
 *
 * Deliberately index-based: the caller pairs these with its own player array,
 * so this stays independent of GameContext's Player type.
 */
export function pickTraitorIndices(playerCount: number, traitorCount: number): number[] {
  // Always leave at least two innocents — a round with one honest player is
  // not a deduction game, it's a coin flip.
  const maxTraitors = Math.max(1, playerCount - 2);
  const count = Math.max(1, Math.min(traitorCount, maxTraitors));
  return shuffle(Array.from({ length: playerCount }, (_, i) => i)).slice(0, count);
}

/** Suggested traitor count for a group size — used as the setup default. */
export function suggestedTraitors(playerCount: number): number {
  if (playerCount >= 9) return 3;
  if (playerCount >= 6) return 2;
  return 1;
}

/** Randomised speaking order for the clue round. */
export function speakingOrder(playerCount: number): number[] {
  return shuffle(Array.from({ length: playerCount }, (_, i) => i));
}
