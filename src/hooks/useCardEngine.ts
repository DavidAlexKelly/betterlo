// src/hooks/useCardEngine.ts
// The card-drawing brain, extracted from GameScreen so it is:
//   • deterministic — every draw receives an explicit round number, killing the
//     stale-closure off-by-one in the old loadChallenge/nextRound dance
//   • navigable — full history with goBack()/forward for "oops, skipped it"
//   • safe — merged pools can never be empty (custom decks no longer crash)
//   • complete — a scheduled rule-end card is flushed before game over,
//     so no rule is ever left running forever
//
// GameScreen keeps ownership of animation, layout and navigation.

import { useRef, useState, useCallback } from 'react';
import {
  getChallengePool, substituteTokens, Challenge, PenaltyContext,
  ALL_RULE_STARTS, ALL_RULE_ENDS, ALL_CHALLENGES,
} from '../data/gameData';
import { Player } from '../components/GameContext';
import { chance, pickOne, randomInt, shuffle } from '../utils/random';

const RULE_DRAW_CHANCE = 0.15;

// Survives across game sessions within one app session so "play again"
// doesn't repeat last game's cards in round 1. (Previously a loose module
// variable in GameScreen — now owned by the engine.)
let previousGameUsedIds: Set<string> = new Set();

export interface DrawnCard {
  challenge: Challenge;
  displayText: string;
  round: number;
}

export interface CardEngineOptions {
  players: Player[];
  /** Built-in mode ids selected for this game (custom deck ids are ignored here). */
  modeIds: string[];
  /** Pre-resolved cards from any selected custom decks. See src/data/customDecks.ts */
  extraPool?: Challenge[];
  totalRounds: number;
  buildPenaltyCtx: (c: Challenge) => PenaltyContext;
}

function prioritizeUninvolved(players: Player[], involved: Set<number>): Player[] {
  const uninvolved = shuffle(players.filter(p => !involved.has(p.id)));
  const alreadyInvolved = shuffle(players.filter(p => involved.has(p.id)));
  return [...uninvolved, ...alreadyInvolved];
}

export function useCardEngine(opts: CardEngineOptions) {
  const optsRef = useRef(opts);
  optsRef.current = opts; // always read fresh options — no stale closures

  const usedIds = useRef<Set<string>>(new Set(previousGameUsedIds));
  const usedRuleIds = useRef<Set<string>>(new Set());
  const involved = useRef<Set<number>>(new Set());
  const activeRuleId = useRef<string | null>(null);
  const pendingEnd = useRef<{ card: Challenge; fireOnRound: number } | null>(null);

  const history = useRef<DrawnCard[]>([]);
  const [index, setIndex] = useState(-1);
  // Re-render trigger; consumers read `current` below.
  const [, bump] = useState(0);

  const current: DrawnCard | null = index >= 0 ? history.current[index] : null;
  const canGoBack = index > 0;

  /** True when a rule is active and its end card is scheduled. GameScreen
   *  uses this to hold the game open one extra card at the finish line. */
  const hasPendingRuleEnd = () => pendingEnd.current !== null;

  const buildDisplay = useCallback((card: Challenge, round: number): DrawnCard => {
    const { players, buildPenaltyCtx } = optsRef.current;
    const ordered = prioritizeUninvolved(players, involved.current);
    if (ordered[0]) involved.current.add(ordered[0].id);
    if (card.text.includes('{player2}') && ordered[1]) involved.current.add(ordered[1].id);
    return {
      challenge: card,
      displayText: substituteTokens(card.text, ordered, buildPenaltyCtx(card)),
      round,
    };
  }, []);

  const pickNewCard = useCallback((round: number): DrawnCard => {
    const { modeIds, extraPool = [], totalRounds } = optsRef.current;

    // 1. A scheduled rule-end card fires first when due — including when the
    //    game is on its final card (the flush GameScreen asks for via
    //    hasPendingRuleEnd + one more draw).
    if (pendingEnd.current && round >= pendingEnd.current.fireOnRound) {
      const endCard = pendingEnd.current.card;
      pendingEnd.current = null;
      activeRuleId.current = null;
      return buildDisplay(endCard, round);
    }

    // 2. Maybe start a rule — only if none is active and the end card can
    //    still fire before the game finishes.
    const endDelay = 4 + randomInt(3); // 4–6 rounds
    if (
      !activeRuleId.current &&
      totalRounds - round > endDelay &&
      chance(RULE_DRAW_CHANCE)
    ) {
      const availableRules = ALL_RULE_STARTS.filter(r => !usedRuleIds.current.has(r.ruleId!));
      if (availableRules.length > 0) {
        const picked = pickOne(availableRules);
        activeRuleId.current = picked.ruleId!;
        usedRuleIds.current.add(picked.ruleId!);
        const endCard = ALL_RULE_ENDS[picked.ruleId!];
        if (endCard) pendingEnd.current = { card: endCard, fireOnRound: round + endDelay };
        return buildDisplay(picked, round);
      }
    }

    // 3. Normal draw. Built-in pools + custom deck cards, with a hard
    //    guarantee the pool is never empty (fixes the custom-deck crash).
    let pool = [...getChallengePool(modeIds), ...extraPool];
    if (pool.length === 0) pool = ALL_CHALLENGES;

    let available = pool.filter(c => !usedIds.current.has(c.id));
    if (available.length === 0) {
      // Everything seen — recycle, but still avoid the card on screen.
      usedIds.current = new Set(current ? [current.challenge.id] : []);
      available = pool.filter(c => !usedIds.current.has(c.id));
      if (available.length === 0) available = pool; // single-card pool edge case
    }
    const picked = pickOne(available);
    usedIds.current.add(picked.id);
    return buildDisplay(picked, round);
  }, [buildDisplay, current]);

  /**
   * Advance. If the user previously went back, this steps forward through
   * history (isNew: false — don't advance the round counter). Otherwise it
   * draws a fresh card (isNew: true — caller should advance the round).
   */
  const drawNext = useCallback((round: number): { card: DrawnCard; isNew: boolean } => {
    if (index < history.current.length - 1) {
      const nextIndex = index + 1;
      setIndex(nextIndex);
      return { card: history.current[nextIndex], isNew: false };
    }
    const card = pickNewCard(round);
    history.current.push(card);
    setIndex(history.current.length - 1);
    bump(n => n + 1);
    return { card, isNew: true };
  }, [index, pickNewCard]);

  /** Step back to the previous card (text is replayed exactly as shown). */
  const goBack = useCallback((): DrawnCard | null => {
    if (index <= 0) return null;
    const prevIndex = index - 1;
    setIndex(prevIndex);
    return history.current[prevIndex];
  }, [index]);

  /** All players featured as {player1} or {player2} at least once? */
  const allPlayersInvolved = useCallback(
    () => optsRef.current.players.every(p => involved.current.has(p.id)),
    [],
  );

  /** Call when navigating to GameOver so "play again" excludes this game's cards. */
  const finishGame = useCallback(() => {
    previousGameUsedIds = new Set(usedIds.current);
  }, []);

  /** Call after round 1 of a new game — lets last game's cards back in later. */
  const releasePreviousGameCards = useCallback(() => {
    previousGameUsedIds = new Set();
  }, []);

  return {
    current,
    canGoBack,
    drawNext,
    goBack,
    hasPendingRuleEnd,
    allPlayersInvolved,
    finishGame,
    releasePreviousGameCards,
  };
}