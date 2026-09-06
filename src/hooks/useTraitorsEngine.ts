// src/hooks/useTraitorsEngine.ts
// Thin React wrapper around the Word Traitors! state machine. Every rule lives
// in src/data/traitorsGame.ts as a pure function so it can be tested without a
// device (tools/traitors-smoke.ts).

import { useCallback, useRef, useState } from 'react';
import {
  TraitorsConfig, TraitorsPlayerStats, TraitorsState,
  accusationComplete, advanceReveal, createGame, endGame, firstSpeaker,
  goToAccuse, isOver, isTraitor, nextRound, revealTarget, startClues,
  submitAccusation, toggleAccused,
} from '../data/traitorsGame';

export interface TraitorsFinalStandings {
  score: { innocentWins: number; traitorWins: number };
  stats: Record<number, TraitorsPlayerStats>;
  rounds: number;
}

/**
 * Snapshot for the results screen — the game screen navigates with `replace`,
 * so this hook is gone by the time results render. Same approach as the other
 * three engines.
 */
let finalStandings: TraitorsFinalStandings | null = null;

export function readTraitorsStandings(): TraitorsFinalStandings | null {
  return finalStandings;
}

export function useTraitorsEngine(cfg: TraitorsConfig) {
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  const [state, setState] = useState<TraitorsState>(() => createGame(cfg));

  const stateRef = useRef(state);
  stateRef.current = state;

  const tapReveal = useCallback(() => {
    setState(s => advanceReveal(s, cfgRef.current));
  }, []);

  const beginClues = useCallback(() => setState(startClues), []);
  const beginVote = useCallback(() => setState(goToAccuse), []);
  const accuse = useCallback((playerIndex: number) => {
    setState(s => toggleAccused(s, playerIndex));
  }, []);
  const reveal = useCallback(() => {
    setState(s => submitAccusation(s, cfgRef.current));
  }, []);
  const advanceRound = useCallback(() => {
    setState(s => nextRound(s, cfgRef.current));
  }, []);
  const quit = useCallback(() => setState(endGame), []);

  const finishGame = useCallback(() => {
    const s = stateRef.current;
    finalStandings = {
      score: s.score,
      stats: s.stats,
      rounds: s.round,
    };
  }, []);

  return {
    state,
    phase: state.phase,
    round: state.round,
    score: state.score,

    /** Whose turn it is to take the phone / see their role. */
    revealTarget: revealTarget(state, cfgRef.current),
    /** True when the currently revealed player is a traitor. */
    revealIsTraitor: isTraitor(state, state.current.revealIndex),
    firstSpeaker: firstSpeaker(state, cfgRef.current),

    word: state.current.word,
    traitorIndices: state.current.traitorIndices,
    order: state.current.order,
    accused: state.current.accused,
    innocentsWin: state.current.innocentsWin,
    accusationComplete: accusationComplete(state),
    isOver: isOver(state),

    tapReveal,
    beginClues,
    beginVote,
    accuse,
    reveal,
    advanceRound,
    quit,
    finishGame,
  };
}
