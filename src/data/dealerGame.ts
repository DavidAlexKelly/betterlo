// src/data/dealerGame.ts
// ─────────────────────────────────────────────────────────────────────────────
// The Screw the Dealer! state machine, as PURE FUNCTIONS.
//
// Deliberately not inside the hook. Keeping the rules React-free means
// tools/dealer-smoke.ts can play entire games deterministically by injecting a
// known deck and threading state through applyGuess/applyNextTurn — which is
// the only way to actually test dealer rotation, streaks and the cap without a
// device. useDealerEngine.ts is a thin React wrapper over this.
//
// The drawn card is held in `hiddenCard` and is NOT part of any outcome until
// the turn resolves, so no screen can accidentally render it early.
// ─────────────────────────────────────────────────────────────────────────────

import { PenaltyContext } from './gameData';
import {
  Card, Hint, STREAK_TO_PASS,
  dealerDrinks, hintFor, rawDifference, shuffledDeck, wrongGuessDrinks,
} from './dealerData';

export type DealerEndCondition = 'deck' | 'oneDealEach' | 'endless';

export type DealerPhase = 'guess1' | 'guess2' | 'reveal' | 'over';

/** Structural, so the engine has no dependency on GameContext's Player. */
export interface DealerPlayerRef {
  id: number;
  name: string;
}

export interface DealerConfig {
  players: DealerPlayerRef[];
  /** null = uncapped. */
  drinkCap: number | null;
  endCondition: DealerEndCondition;
  /** Auto-pass the deck after this many consecutive turns dealing. null = off. */
  mercyTurns: number | null;
  /** Supplies `bonus` from the Sip Intensity stepper. */
  penaltyCtx?: PenaltyContext;
}

export interface DealerStats {
  /** Every drink taken, by any route. */
  totals: Record<number, number>;
  /** Drinks taken while holding the deck. */
  asDealer: Record<number, number>;
  /** Times they have held the deck. */
  reigns: Record<number, number>;
  /** Biggest single hit. */
  worstHit: Record<number, number>;
  /** Guesses landed, first or second. */
  correctGuesses: Record<number, number>;
}

export interface DealerOutcome {
  card: Card;
  dealer: DealerPlayerRef;
  guesser: DealerPlayerRef;
  firstGuess: number;
  /** null when they nailed it first time. */
  secondGuess: number | null;
  /** Which guess landed, or null if they missed both. */
  correctOn: 1 | 2 | null;
  dealerDrinks: number;
  guesserDrinks: number;
  /** Difference before the cap — lets the UI say "capped from 12". */
  rawDifference: number;
  capped: boolean;
  streakAfter: number;
  passedDeck: boolean;
  passReason: 'streak' | 'mercy' | null;
}

export interface DealerState {
  /** Undealt cards. */
  deck: Card[];
  /** Laid out on the table, in order. */
  revealed: Card[];
  /** Drawn but not shown. Cleared as soon as the turn resolves. */
  hiddenCard: Card | null;
  dealerIndex: number;
  guesserIndex: number;
  /** Players beaten in a row by the current dealer. */
  streak: number;
  /** Turns the current dealer has played, for the mercy rule. */
  dealerTurns: number;
  /** Completed dealer reigns, for the one-deal-each end condition. */
  reignsCompleted: number;
  phase: DealerPhase;
  firstGuess: number | null;
  hint: Hint | null;
  outcome: DealerOutcome | null;
  /** True only on the turn immediately after a reshuffle. */
  justReshuffled: boolean;
  cardsPlayed: number;
  stats: DealerStats;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function zeroed(players: DealerPlayerRef[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const p of players) out[p.id] = 0;
  return out;
}

function emptyStats(players: DealerPlayerRef[]): DealerStats {
  return {
    totals: zeroed(players),
    asDealer: zeroed(players),
    reigns: zeroed(players),
    worstHit: zeroed(players),
    correctGuesses: zeroed(players),
  };
}

function bump(
  record: Record<number, number>,
  id: number,
  by = 1,
): Record<number, number> {
  return { ...record, [id]: (record[id] ?? 0) + by };
}

function raiseTo(
  record: Record<number, number>,
  id: number,
  value: number,
): Record<number, number> {
  return { ...record, [id]: Math.max(record[id] ?? 0, value) };
}

/** Next guesser clockwise, skipping the dealer. */
export function nextGuesserIndex(
  current: number,
  dealerIndex: number,
  playerCount: number,
): number {
  if (playerCount <= 1) return current;
  let next = (current + 1) % playerCount;
  if (next === dealerIndex) next = (next + 1) % playerCount;
  return next;
}

export function isOver(state: DealerState): boolean {
  return state.phase === 'over';
}

/** The dealer's running damage this reign — the number the header shows off. */
export function dealerDamage(state: DealerState, cfg: DealerConfig): number {
  const dealer = cfg.players[state.dealerIndex];
  return dealer ? (state.stats.asDealer[dealer.id] ?? 0) : 0;
}

// ─────────────────────────────────────────────
// TRANSITIONS
// ─────────────────────────────────────────────

/**
 * Start a game. `deck` is injectable so tests can play a known sequence;
 * production passes nothing and gets a shuffle.
 */
export function createGame(cfg: DealerConfig, deck: Card[] = shuffledDeck()): DealerState {
  const [first, ...rest] = deck;
  const dealerIndex = 0;
  const stats = emptyStats(cfg.players);
  const firstDealer = cfg.players[dealerIndex];

  return {
    deck: rest,
    revealed: [],
    hiddenCard: first ?? null,
    dealerIndex,
    guesserIndex: nextGuesserIndex(dealerIndex, dealerIndex, cfg.players.length),
    streak: 0,
    dealerTurns: 0,
    reignsCompleted: 0,
    phase: first ? 'guess1' : 'over',
    firstGuess: null,
    hint: null,
    outcome: null,
    justReshuffled: false,
    cardsPlayed: 0,
    stats: firstDealer
      ? { ...stats, reigns: bump(stats.reigns, firstDealer.id) }
      : stats,
  };
}

function resolveTurn(
  state: DealerState,
  cfg: DealerConfig,
  info: { correctOn: 1 | 2 | null; firstGuess: number; secondGuess: number | null },
): DealerState {
  const card = state.hiddenCard;
  if (!card) return state;

  const dealer = cfg.players[state.dealerIndex];
  const guesser = cfg.players[state.guesserIndex];

  let dealerDrinksOwed = 0;
  let guesserDrinksOwed = 0;
  let raw = 0;
  let capped = false;
  let streak: number;

  if (info.correctOn != null) {
    // The player beat the dealer. Streak breaks.
    dealerDrinksOwed = dealerDrinks(info.correctOn, cfg.penaltyCtx);
    streak = 0;
  } else {
    raw = rawDifference(info.secondGuess as number, card.rank);
    guesserDrinksOwed = wrongGuessDrinks(
      info.secondGuess as number, card.rank, cfg.drinkCap,
    );
    capped = guesserDrinksOwed < raw;
    streak = state.streak + 1;
  }

  const dealerTurns = state.dealerTurns + 1;
  const streakHit = streak >= STREAK_TO_PASS;
  const mercyHit = cfg.mercyTurns != null && dealerTurns >= cfg.mercyTurns;
  const passedDeck = streakHit || mercyHit;

  // Stats
  let stats = state.stats;
  if (dealerDrinksOwed > 0 && dealer) {
    stats = {
      ...stats,
      totals: bump(stats.totals, dealer.id, dealerDrinksOwed),
      asDealer: bump(stats.asDealer, dealer.id, dealerDrinksOwed),
      worstHit: raiseTo(stats.worstHit, dealer.id, dealerDrinksOwed),
    };
  }
  if (guesserDrinksOwed > 0 && guesser) {
    stats = {
      ...stats,
      totals: bump(stats.totals, guesser.id, guesserDrinksOwed),
      worstHit: raiseTo(stats.worstHit, guesser.id, guesserDrinksOwed),
    };
  }
  if (info.correctOn != null && guesser) {
    stats = { ...stats, correctGuesses: bump(stats.correctGuesses, guesser.id) };
  }

  const outcome: DealerOutcome = {
    card,
    dealer,
    guesser,
    firstGuess: info.firstGuess,
    secondGuess: info.secondGuess,
    correctOn: info.correctOn,
    dealerDrinks: dealerDrinksOwed,
    guesserDrinks: guesserDrinksOwed,
    rawDifference: raw,
    capped,
    streakAfter: streak,
    passedDeck,
    passReason: passedDeck ? (streakHit ? 'streak' : 'mercy') : null,
  };

  return {
    ...state,
    phase: 'reveal',
    hiddenCard: null,
    revealed: [...state.revealed, card],
    streak,
    dealerTurns,
    cardsPlayed: state.cardsPlayed + 1,
    outcome,
    stats,
    justReshuffled: false,
  };
}

/** Submit a guess. Handles both the first and second attempt. */
export function applyGuess(
  state: DealerState,
  rank: number,
  cfg: DealerConfig,
): DealerState {
  if (state.phase !== 'guess1' && state.phase !== 'guess2') return state;
  const card = state.hiddenCard;
  if (!card) return state;

  if (state.phase === 'guess1') {
    if (rank === card.rank) {
      return resolveTurn(state, cfg, {
        correctOn: 1, firstGuess: rank, secondGuess: null,
      });
    }
    // Wrong — the app gives the hint the dealer would have to give, honestly.
    return {
      ...state,
      phase: 'guess2',
      firstGuess: rank,
      hint: hintFor(rank, card.rank),
      justReshuffled: false,
    };
  }

  const firstGuess = state.firstGuess ?? rank;
  return resolveTurn(state, cfg, {
    correctOn: rank === card.rank ? 2 : null,
    firstGuess,
    secondGuess: rank,
  });
}

/**
 * Move on from the reveal: rotate the deck or the guesser, check the end
 * condition, reshuffle if allowed, and draw the next card.
 *
 * `freshDeck` is injectable so tests can control what a reshuffle produces.
 */
export function applyNextTurn(
  state: DealerState,
  cfg: DealerConfig,
  freshDeck?: Card[],
): DealerState {
  if (state.phase !== 'reveal' || !state.outcome) return state;

  const playerCount = cfg.players.length;
  let dealerIndex = state.dealerIndex;
  let guesserIndex = state.guesserIndex;
  let streak = state.streak;
  let dealerTurns = state.dealerTurns;
  let reignsCompleted = state.reignsCompleted;
  let stats = state.stats;

  if (state.outcome.passedDeck) {
    dealerIndex = (dealerIndex + 1) % playerCount;
    guesserIndex = nextGuesserIndex(dealerIndex, dealerIndex, playerCount);
    streak = 0;
    dealerTurns = 0;
    reignsCompleted += 1;
    const newDealer = cfg.players[dealerIndex];
    if (newDealer) stats = { ...stats, reigns: bump(stats.reigns, newDealer.id) };
  } else {
    guesserIndex = nextGuesserIndex(guesserIndex, dealerIndex, playerCount);
  }

  const base = {
    ...state,
    dealerIndex,
    guesserIndex,
    streak,
    dealerTurns,
    reignsCompleted,
    stats,
    firstGuess: null,
    hint: null,
    outcome: null,
  };

  // Everyone has dealt — that's the game.
  if (cfg.endCondition === 'oneDealEach' && reignsCompleted >= playerCount) {
    return { ...base, phase: 'over', hiddenCard: null, justReshuffled: false };
  }

  let deck = state.deck;
  let revealed = state.revealed;
  let justReshuffled = false;

  if (deck.length === 0) {
    // Running out ends a 'deck' game; the other modes get a new deck and a
    // cleared table, because the laid-out cards describe the old deck.
    if (cfg.endCondition === 'deck') {
      return { ...base, phase: 'over', hiddenCard: null, justReshuffled: false };
    }
    deck = freshDeck ?? shuffledDeck();
    revealed = [];
    justReshuffled = true;
  }

  const [next, ...rest] = deck;
  if (!next) {
    return { ...base, phase: 'over', hiddenCard: null, justReshuffled: false };
  }

  return {
    ...base,
    phase: 'guess1',
    hiddenCard: next,
    deck: rest,
    revealed,
    justReshuffled,
  };
}

/** End the game early (the quit button under the endless end condition). */
export function endGame(state: DealerState): DealerState {
  return { ...state, phase: 'over', hiddenCard: null };
}
