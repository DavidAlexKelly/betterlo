// src/hooks/useDealerEngine.ts
// ─────────────────────────────────────────────────────────────────────────────
// React wrapper around the Screw the Dealer! state machine.
//
// Deliberately thin: every rule lives in src/data/dealerGame.ts as a pure
// function, so it can be tested without a device (see tools/dealer-smoke.ts).
// This file only holds the state, exposes derived values the screen needs, and
// snapshots the final standings for the results screen.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useRef, useState } from 'react';
import { possibleRanks } from '../data/dealerData';
import {
  DealerConfig, DealerState, DealerStats,
  applyGuess, applyNextTurn, createGame, dealerDamage, endGame, isOver,
} from '../data/dealerGame';

export interface DealerFinalStandings {
  stats: DealerStats;
  cardsPlayed: number;
  reignsCompleted: number;
}

/**
 * Snapshot taken by finishGame(). DealerGameScreen navigates with `replace`, so
 * this hook is unmounted before the results screen renders. Same approach as
 * useTriviaEngine / useCardEngine.
 */
let finalStandings: DealerFinalStandings | null = null;

export function readDealerStandings(): DealerFinalStandings | null {
  return finalStandings;
}

export function useDealerEngine(cfg: DealerConfig) {
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  const [state, setState] = useState<DealerState>(() => createGame(cfg));

  // Mirrored into a ref so finishGame() can read the settled state without
  // taking it as a dependency (which would rebuild the callback every turn).
  const stateRef = useRef(state);
  stateRef.current = state;

  const guess = useCallback((rank: number) => {
    setState(s => applyGuess(s, rank, cfgRef.current));
  }, []);

  const nextTurn = useCallback(() => {
    setState(s => applyNextTurn(s, cfgRef.current));
  }, []);

  /** Quit early — the only way to end an `endless` game. */
  const quit = useCallback(() => {
    setState(s => endGame(s));
  }, []);

  const finishGame = useCallback(() => {
    const s = stateRef.current;
    finalStandings = {
      stats: s.stats,
      cardsPlayed: s.cardsPlayed,
      reignsCompleted: s.reignsCompleted,
    };
  }, []);

  const players = cfgRef.current.players;
  const dealer = players[state.dealerIndex] ?? null;
  const guesser = players[state.guesserIndex] ?? null;

  return {
    // Raw state, for anything the screen needs that isn't derived below.
    state,

    phase: state.phase,
    dealer,
    guesser,
    /** Drinks the current dealer has taken this reign — the header's headline. */
    dealerDamage: dealerDamage(state, cfgRef.current),
    streak: state.streak,
    firstGuess: state.firstGuess,
    hint: state.hint,
    /** Only populated once the turn has resolved; null while guessing. */
    outcome: state.outcome,
    /** Cards on the table, oldest first. */
    revealed: state.revealed,
    deckRemaining: state.deck.length,
    justReshuffled: state.justReshuffled,
    isOver: isOver(state),

    /**
     * Ranks still possible for the second guess. Empty during the first guess —
     * the screen should dim nothing then.
     */
    allowedRanks: state.hint != null && state.firstGuess != null
      ? possibleRanks(state.firstGuess, state.hint)
      : [],

    guess,
    nextTurn,
    quit,
    finishGame,
  };
}
