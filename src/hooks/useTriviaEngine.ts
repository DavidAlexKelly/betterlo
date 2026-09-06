// src/hooks/useTriviaEngine.ts
// ─────────────────────────────────────────────────────────────────────────────
// The Trivia brain — wedge selection, question drawing, scoring, streaks,
// steals, turn rotation and win detection. Deliberately mirrors useCardEngine:
//   • optsRef so callbacks never read stale props
//   • ref-held "used" sets, with module-level memory across games in one app
//     session so "play again" doesn't replay the same questions
//   • the screen owns animation, layout and navigation; the engine owns rules
//
// Trivial-Pursuit rules encoded here:
//   • correct → keep the phone and go again (the roll-again rule)
//   • correct on a wedge you don't hold → win that wedge
//   • wrong → drink, phone passes on
//   • collect every required wedge → you enter the FINAL phase, where the group
//     picks the category. Get it right and you win; get it wrong and play
//     returns to normal.
//
// House rules layered on top (both optional, both off-by-default-safe):
//   • STREAKS — 3 correct in a row starts giving out bonus sips per answer.
//   • STEALS  — a missed question passes to the next player, who can take the
//     wedge off them. A failed steal costs less than an outright miss.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useRef, useState } from 'react';
import {
  STREAK_THRESHOLD, TIMEOUT_SENTINEL,
  buildOptions, failedStealSips, getWedgePool, isCorrect,
  streakRewardSips, wedgeRewardSips, wrongAnswerSips,
} from '../data/triviaData';
import { chance, pickOne, shuffle } from '../utils/random';

// Re-exported so screens can import it alongside the engine they're driving.
export { TIMEOUT_SENTINEL };
import { TriviaQuestion, WedgeId, WEDGE_IDS } from '../data/trivia/types';
import { PenaltyContext } from '../data/gameData';

/**
 * The engine only needs player identity. Kept structural rather than importing
 * `Player` from GameContext so this hook has no React Native dependency and
 * stays unit-testable — `Player` satisfies it already.
 */
export interface TriviaPlayerRef {
  id: number;
  name: string;
}

export type TriviaPhase = 'collecting' | 'final' | 'won';

export interface TriviaTurn {
  player: TriviaPlayerRef;
  wedge: WedgeId;
  question: TriviaQuestion;
  /** Answer order as it should be rendered. */
  options: string[];
  /** True when this is the challenger's title-deciding question. */
  isFinal: boolean;
}

export interface TriviaResolution {
  correct: boolean;
  /** The chosen option, echoed back for result-screen rendering. */
  chosen: string;
  /** Always populated so the UI can reveal the right answer when wrong. */
  answer: string;
  /** The clock ran out rather than the player picking wrongly. */
  timedOut: boolean;
  /** A wedge was just earned by this answer. */
  wonWedge: boolean;
  /** Sips to DRINK when wrong, or to GIVE OUT when correct. 0 when nothing happens. */
  sips: number;
  /** The answerer's run of correct answers, after this one. 0 when wrong. */
  streak: number;
  /** Portion of `sips` that came from the streak bonus. */
  streakSips: number;
  /** The answerer keeps the phone (correct answers go again). */
  goAgain: boolean;
  /** This answer won the game outright. */
  isWin: boolean;
  /** Who may steal this question, when steals are on and the answer was missed. */
  steal: TriviaPlayerRef | null;
}

export interface TriviaStealResolution {
  stealer: TriviaPlayerRef;
  correct: boolean;
  chosen: string;
  answer: string;
  wonWedge: boolean;
  /** Sips to GIVE OUT when the steal lands, or to DRINK when it fails. */
  sips: number;
}

export interface TriviaEngineOptions {
  players: TriviaPlayerRef[];
  /** Wedges in play. Defaults to all six. */
  wedges?: WedgeId[];
  /** How many wedges are needed to reach the final question. */
  wedgesToWin?: number;
  /** Narrow the question difficulty. Empty/undefined = all. */
  difficulties?: Array<1 | 2 | 3>;
  /** Offer a missed question to the next player. */
  stealsEnabled?: boolean;
  /** Supplies `bonus` from the Sip Intensity stepper. */
  penaltyCtx?: PenaltyContext;
}

// Survives across games within one app session, so "play again" doesn't serve
// up the questions everyone just heard. Mirrors previousGameUsedIds in
// useCardEngine.
let previousGameUsedIds: Set<string> = new Set();

export interface FinalStandings {
  winnerId: number | null;
  wedgesByPlayer: Record<number, WedgeId[]>;
  /** Best streak achieved by each player over the game. */
  bestStreaks: Record<number, number>;
}

/**
 * Snapshot taken by finishGame(). TriviaGameScreen navigates with `replace`,
 * so the hook — and all its state — is gone by the time the results screen
 * mounts. Handing the standings over through module state is the same trick
 * useCardEngine uses for previousGameUsedIds, and avoids either lifting the
 * whole engine into a provider or serialising it through route params.
 */
let finalStandings: FinalStandings = {
  winnerId: null,
  wedgesByPlayer: {},
  bestStreaks: {},
};

export function readFinalStandings(): FinalStandings {
  return finalStandings;
}

interface PendingSteal {
  stealer: TriviaPlayerRef;
  question: TriviaQuestion;
  wedge: WedgeId;
  options: string[];
}

export function useTriviaEngine(opts: TriviaEngineOptions) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const usedIds = useRef<Set<string>>(new Set(previousGameUsedIds));
  const playerIndex = useRef(0);
  const streaks = useRef<Record<number, number>>({});
  const bestStreaks = useRef<Record<number, number>>({});

  const [wedgesByPlayer, setWedgesByPlayer] = useState<Record<number, WedgeId[]>>({});
  const [phase, setPhase] = useState<TriviaPhase>('collecting');
  const [challengerId, setChallengerId] = useState<number | null>(null);
  const [winnerId, setWinnerId] = useState<number | null>(null);
  const [current, setCurrent] = useState<TriviaTurn | null>(null);
  const [lastResolution, setLastResolution] = useState<TriviaResolution | null>(null);
  const [pendingSteal, setPendingSteal] = useState<PendingSteal | null>(null);
  const [lastSteal, setLastSteal] = useState<TriviaStealResolution | null>(null);

  const activeWedges = useCallback((): WedgeId[] => {
    const w = optsRef.current.wedges;
    return w && w.length > 0 ? w : [...WEDGE_IDS];
  }, []);

  const requiredWedgeCount = useCallback((): number => {
    const { wedgesToWin } = optsRef.current;
    const max = activeWedges().length;
    return Math.max(1, Math.min(wedgesToWin ?? max, max));
  }, [activeWedges]);

  const wedgesFor = useCallback(
    (playerId: number): WedgeId[] => wedgesByPlayer[playerId] ?? [],
    [wedgesByPlayer],
  );

  const streakFor = useCallback(
    (playerId: number): number => streaks.current[playerId] ?? 0,
    [],
  );

  const playerAt = useCallback((index: number): TriviaPlayerRef | null => {
    const { players } = optsRef.current;
    if (players.length === 0) return null;
    return players[index % players.length];
  }, []);

  const currentPlayer = useCallback(
    (): TriviaPlayerRef | null => playerAt(playerIndex.current),
    [playerAt],
  );

  /**
   * Pick a wedge at random, biased towards ones the current player still
   * needs — a purely random spin makes the endgame drag while someone waits
   * for their last wedge.
   */
  const spinWedge = useCallback((): WedgeId => {
    const pool = activeWedges();
    const player = currentPlayer();
    if (!player) return pool[0];

    const held = new Set(wedgesFor(player.id));
    const needed = pool.filter(w => !held.has(w));
    const from = needed.length > 0 && chance(0.7) ? needed : pool;
    return pickOne(from);
  }, [activeWedges, currentPlayer, wedgesFor]);

  const pickQuestion = useCallback((wedge: WedgeId): TriviaQuestion | null => {
    const { difficulties } = optsRef.current;
    const pool = getWedgePool(wedge, difficulties);
    if (pool.length === 0) return null;

    let available = pool.filter(q => !usedIds.current.has(q.id));
    if (available.length === 0) {
      // Wedge exhausted — recycle it, but never immediately repeat the last
      // question shown from it.
      const keep = current?.question.id;
      usedIds.current = new Set(
        [...usedIds.current].filter(id => !pool.some(q => q.id === id)),
      );
      available = pool.filter(q => q.id !== keep);
      if (available.length === 0) available = pool;
    }
    return shuffle(available)[0];
  }, [current]);

  /** Draw the next question. Pass a wedge to override the spin (used by FINAL). */
  const beginTurn = useCallback((wedge?: WedgeId): TriviaTurn | null => {
    const player = currentPlayer();
    if (!player) return null;

    const chosenWedge = wedge ?? spinWedge();
    const question = pickQuestion(chosenWedge);
    if (!question) return null;

    usedIds.current.add(question.id);
    const turn: TriviaTurn = {
      player,
      wedge: chosenWedge,
      question,
      options: buildOptions(question),
      isFinal: phase === 'final' && challengerId === player.id,
    };
    setCurrent(turn);
    setLastResolution(null);
    setPendingSteal(null);
    setLastSteal(null);
    return turn;
  }, [currentPlayer, spinWedge, pickQuestion, phase, challengerId]);

  const recordStreak = useCallback((playerId: number, value: number) => {
    streaks.current[playerId] = value;
    bestStreaks.current[playerId] = Math.max(bestStreaks.current[playerId] ?? 0, value);
  }, []);

  const awardWedge = useCallback((playerId: number, wedge: WedgeId): number => {
    const held = wedgesByPlayer[playerId] ?? [];
    if (held.includes(wedge)) return held.length;
    const updated = [...held, wedge];
    setWedgesByPlayer(prev => ({ ...prev, [playerId]: updated }));
    return updated.length;
  }, [wedgesByPlayer]);

  /** Grade the answer, award wedges, advance the turn. */
  const resolve = useCallback((chosen: string): TriviaResolution | null => {
    const turn = current;
    if (!turn) return null;

    const { penaltyCtx = {}, stealsEnabled = false, players } = optsRef.current;
    const correct = isCorrect(turn.question, chosen);
    const timedOut = chosen === TIMEOUT_SENTINEL;

    let wonWedge = false;
    let sips = 0;
    let streakSips = 0;
    let isWin = false;
    let steal: TriviaPlayerRef | null = null;
    let streak = 0;

    if (correct) {
      streak = streakFor(turn.player.id) + 1;
      recordStreak(turn.player.id, streak);

      if (turn.isFinal) {
        isWin = true;
        setWinnerId(turn.player.id);
        setPhase('won');
      } else {
        const held = wedgesFor(turn.player.id);
        if (!held.includes(turn.wedge)) {
          wonWedge = true;
          sips += wedgeRewardSips(penaltyCtx);
          const total = awardWedge(turn.player.id, turn.wedge);
          if (total >= requiredWedgeCount()) {
            setPhase('final');
            setChallengerId(turn.player.id);
          }
        }
        if (streak >= STREAK_THRESHOLD) {
          streakSips = streakRewardSips(penaltyCtx);
          sips += streakSips;
        }
      }
    } else {
      recordStreak(turn.player.id, 0);
      sips = wrongAnswerSips(turn.question.difficulty, penaltyCtx);
      // A missed final question drops the challenger back into normal play.
      if (turn.isFinal) {
        setPhase('collecting');
        setChallengerId(null);
      }
    }

    // Correct answers keep the phone (roll-again). A win ends the game, so
    // nobody goes again.
    const goAgain = correct && !isWin;
    const nextIndex = (playerIndex.current + 1) % Math.max(1, players.length);
    if (!goAgain && !isWin) {
      playerIndex.current = nextIndex;

      // Offer the miss to whoever now holds the phone. Not on the final
      // question — that's the challenger's alone — and pointless solo.
      if (stealsEnabled && !turn.isFinal && players.length > 1) {
        const stealer = playerAt(nextIndex);
        if (stealer && stealer.id !== turn.player.id) {
          steal = stealer;
          setPendingSteal({
            stealer,
            question: turn.question,
            wedge: turn.wedge,
            // Reshuffle so the stealer can't just infer from layout.
            options: buildOptions(turn.question),
          });
        }
      }
    }

    const resolution: TriviaResolution = {
      correct, chosen, answer: turn.question.answer, timedOut,
      wonWedge, sips, streak, streakSips, goAgain, isWin, steal,
    };
    setLastResolution(resolution);
    return resolution;
  }, [
    current, wedgesFor, streakFor, recordStreak, awardWedge,
    requiredWedgeCount, playerAt,
  ]);

  /** Grade the stealer's attempt at the question the previous player missed. */
  const resolveSteal = useCallback((chosen: string): TriviaStealResolution | null => {
    const steal = pendingSteal;
    if (!steal) return null;

    const { penaltyCtx = {} } = optsRef.current;
    const correct = isCorrect(steal.question, chosen);

    let wonWedge = false;
    let sips: number;

    if (correct) {
      const held = wedgesFor(steal.stealer.id);
      if (!held.includes(steal.wedge)) {
        wonWedge = true;
        awardWedge(steal.stealer.id, steal.wedge);
      }
      sips = wedgeRewardSips(penaltyCtx);
    } else {
      sips = failedStealSips(penaltyCtx);
    }

    // A steal never triggers the final phase — reaching the last wedge should
    // happen on your own turn, not off someone else's mistake.
    const resolution: TriviaStealResolution = {
      stealer: steal.stealer,
      correct,
      chosen,
      answer: steal.question.answer,
      wonWedge,
      sips,
    };
    setPendingSteal(null);
    setLastSteal(resolution);
    return resolution;
  }, [pendingSteal, wedgesFor, awardWedge]);

  /** Decline the steal and move on. */
  const skipSteal = useCallback(() => {
    setPendingSteal(null);
    setLastSteal(null);
  }, []);

  /** A timeout counts as a wrong answer without the player picking anything. */
  const timeout = useCallback(() => resolve(TIMEOUT_SENTINEL), [resolve]);

  /**
   * Call immediately before navigating to the results screen: freezes the
   * standings for TriviaOverScreen to read, and remembers this game's
   * questions so "play again" doesn't repeat them.
   */
  const finishGame = useCallback(() => {
    previousGameUsedIds = new Set(usedIds.current);
    finalStandings = {
      winnerId,
      wedgesByPlayer: { ...wedgesByPlayer },
      bestStreaks: { ...bestStreaks.current },
    };
  }, [winnerId, wedgesByPlayer]);

  /** Call after the first turn of a new game to let old questions back in. */
  const releasePreviousGameQuestions = useCallback(() => {
    previousGameUsedIds = new Set();
  }, []);

  return {
    current,
    lastResolution,
    pendingSteal,
    lastSteal,
    phase,
    challengerId,
    winnerId,
    currentPlayer: currentPlayer(),
    activeWedges: activeWedges(),
    requiredWedgeCount: requiredWedgeCount(),
    wedgesFor,
    streakFor,
    wedgesByPlayer,
    beginTurn,
    resolve,
    resolveSteal,
    skipSteal,
    timeout,
    finishGame,
    releasePreviousGameQuestions,
  };
}
