// src/data/dealerData.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cards and drink maths for Screw the Dealer!
//
// Aces are low: A=1 … 10, J=11, Q=12, K=13. Only rank matters to the rules;
// suits exist so the laid-out grid looks like actual cards.
//
// Unlike Trivia, this mode does NOT reuse the PENALTY scale. The paper rules
// fix the numbers — 4 drinks, 2 drinks, or the difference — so those are the
// numbers. Sip Intensity is applied additively to the two FIXED dealer
// penalties only; it deliberately does not scale the difference, which is
// already variable and already the harshest number in the app.
//
// No React Native imports here, so tools/dealer-smoke.ts can execute all of it.
// ─────────────────────────────────────────────────────────────────────────────

import { PenaltyContext } from './gameData';
import { shuffle } from '../utils/random';

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

export const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

/** 1 = Ace (low) … 13 = King. */
export const RANKS: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export const MIN_RANK = 1;
export const MAX_RANK = 13;

export interface Card {
  rank: number;
  suit: Suit;
  /** Stable within a deck, e.g. "7-hearts". */
  id: string;
}

const RANK_LABELS: Record<number, string> = {
  1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7',
  8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K',
};

export const SUIT_SYMBOLS: Record<Suit, string> = {
  spades: '\u2660',
  hearts: '\u2665',
  diamonds: '\u2666',
  clubs: '\u2663',
};

export const RED_SUITS: Suit[] = ['hearts', 'diamonds'];

export function rankLabel(rank: number): string {
  return RANK_LABELS[rank] ?? String(rank);
}

export function isRedSuit(suit: Suit): boolean {
  return RED_SUITS.includes(suit);
}

/** Long form for the reveal line, e.g. "Queen of Hearts". */
export function cardName(card: Card): string {
  const names: Record<number, string> = {
    1: 'Ace', 11: 'Jack', 12: 'Queen', 13: 'King',
  };
  const rank = names[card.rank] ?? String(card.rank);
  const suit = card.suit.charAt(0).toUpperCase() + card.suit.slice(1);
  return `${rank} of ${suit}`;
}

// ─────────────────────────────────────────────
// DECK
// ─────────────────────────────────────────────

/** All 52, in order. Four of every rank. */
export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit, id: `${rank}-${suit}` });
    }
  }
  return deck;
}

export const DECK_SIZE = 52;

export function shuffledDeck(): Card[] {
  return shuffle(buildDeck());
}

// ─────────────────────────────────────────────
// RULES
// ─────────────────────────────────────────────

export type Hint = 'higher' | 'lower';

export const STREAK_TO_PASS = 3;

/** Drinks the dealer takes when beaten. Fixed by the rules. */
export const DEALER_PENALTY_FIRST_GUESS = 4;
export const DEALER_PENALTY_SECOND_GUESS = 2;

/**
 * What the dealer must say after a wrong first guess. The app answers this
 * instead of the dealer, so it cannot be a lie.
 */
export function hintFor(guess: number, rank: number): Hint {
  return rank > guess ? 'higher' : 'lower';
}

/**
 * Ranks still possible after a hint. Used to dim the pad for the second guess —
 * the engine still accepts any rank, this is presentation only.
 */
export function possibleRanks(firstGuess: number, hint: Hint): number[] {
  return hint === 'higher'
    ? RANKS.filter(r => r > firstGuess)
    : RANKS.filter(r => r < firstGuess);
}

/** Drinks the dealer owes for being beaten. Sip Intensity applies here. */
export function dealerDrinks(correctOn: 1 | 2, ctx: PenaltyContext = {}): number {
  const base = correctOn === 1
    ? DEALER_PENALTY_FIRST_GUESS
    : DEALER_PENALTY_SECOND_GUESS;
  return base + (ctx.bonus ?? 0);
}

/** The uncapped gap between a guess and the card. */
export function rawDifference(guess: number, rank: number): number {
  return Math.abs(guess - rank);
}

/**
 * Drinks the guesser owes after missing twice: the difference, capped.
 *
 * The cap exists because an Ace guess against a King is 12 drinks in one turn,
 * which is more than any other single penalty in the app by a factor of two.
 * Pass null to play it uncapped.
 */
export function wrongGuessDrinks(
  secondGuess: number,
  rank: number,
  cap: number | null,
): number {
  const diff = rawDifference(secondGuess, rank);
  if (cap == null) return diff;
  return Math.min(diff, cap);
}

/** How many of each rank are still unseen, for an optional counting aid. */
export function remainingByRank(revealed: Card[]): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const rank of RANKS) counts[rank] = SUITS.length;
  for (const card of revealed) {
    counts[card.rank] = Math.max(0, (counts[card.rank] ?? 0) - 1);
  }
  return counts;
}
