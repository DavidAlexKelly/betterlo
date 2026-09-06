// src/data/gameData.ts
// ─────────────────────────────────────────────────────────────────────────────
// Backend files are organised by card MECHANIC (drink, dare, truth, chaos, spicy).
// Frontend display modes are organised by EXPERIENCE and map to one or more
// backend files, filtered by intensity and optional tags.
//
// Frontend → Backend mapping:
//   Getting Started  → drink (1-2) + dare (1-2, no "bar" tag)
//   Letting Loose    → truth (2-3) + chaos (2-3) + dare (2-3, no "bar" tag)
//   Raising the Bar  → drink + dare + truth + chaos (all intensity, "bar" tag only)
//   Spicy            → spicy (all, no filter)
//
// word_banks.json is keyed by MECHANIC (matching Challenge.mode), never by
// frontend deck id — see PenaltyContext.mode below. Every bank must carry a
// `default` list so an unmapped mode degrades to generic content instead of
// rendering a literal "{topic}" on the card.
// ─────────────────────────────────────────────────────────────────────────────

import { coinFlip, pickOne } from '../utils/random';
import drinkCards  from './cards/drink.json';
import dareCards   from './cards/dare.json';
import truthCards  from './cards/truth.json';
import chaosCards  from './cards/chaos.json';
import spicyCards  from './cards/spicy.json';
import rulesData   from './cards/rules.json';
import wordBanks   from './cards/word_banks.json';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export interface Challenge {
  id: string;
  text: string;
  action: string;
  icon: string;
  intensity: 1 | 2 | 3;
  mode: string;
  tags?: string[];
  isRule?: boolean;
  ruleId?: string;
}

export interface GameMode {
  id: string;
  label: string;
  icon: string;
  color: string;
  desc: string;
  intensity: string;
  time: string;
}

interface RawCard {
  text: string;
  action: string;
  icon: string;
  intensity: 1 | 2 | 3;
  tags?: string[];
}

interface RawRulePair {
  ruleId: string;
  start: RawCard;
  end: RawCard;
}

// ─────────────────────────────────────────────
// PENALTY SYSTEM
// ─────────────────────────────────────────────

export interface PenaltyContext {
  currentRound?: number;
  totalRounds?: number;
  intensity?: 1 | 2 | 3;
  /**
   * The MECHANIC of the card being rendered (`drink` | `dare` | `truth` |
   * `chaos` | `spicy`, or `custom`/a category for user-written cards) — i.e.
   * `Challenge.mode`, NOT the frontend deck the player selected.
   *
   * This is the key used to pick a word bank in `word_banks.json`, so the
   * two must stay in sync: a truth card draws from `topic.truth`, a chaos
   * card from `topic.chaos`, and anything unrecognised (custom cards) falls
   * back to the bank's `default` list.
   */
  mode?: string;
  /** Additive bonus sips: 0 = standard, 1 = +1, 2 = +2, 3 = +3 */
  bonus?: number;
}

export const PENALTY = {
  sip:    1,
  small:  2,
  medium: 3,
  large:  4,
  max:    5,
  finish: 99,
} as const;

export function getPenalty(base: keyof typeof PENALTY, ctx: PenaltyContext = {}): number {
  const value = PENALTY[base];
  if (value === 99) return 99;
  return value + (ctx.bonus ?? 0);
}

export function formatPenalty(count: number): string {
  if (count === 99) return 'finish your drink';
  return count === 1 ? '1 sip' : `${count} sips`;
}

function resolveTakeOrGive(base: keyof typeof PENALTY, ctx: PenaltyContext): string {
  const amount = formatPenalty(getPenalty(base, ctx));
  return coinFlip() ? `take ${amount}` : `give out ${amount}`;
}

// ─────────────────────────────────────────────
// FRONTEND DISPLAY MODES
// These are what players see and select in the UI.
// ─────────────────────────────────────────────

export const MODES: GameMode[] = [
  {
    id: 'getting_started',
    label: 'GETTING STARTED',
    icon: 'happy',
    color: '#ff7afb',
    desc: 'Lighthearted fun to get the night going. Easy drinking, quick games, no pressure.',
    intensity: 'Easy Vibes',
    time: '15-30 MIN',
  },
  {
    id: 'letting_loose',
    label: 'LETTING LOOSE',
    icon: 'flame',
    color: '#ff6e84',
    desc: 'Things get personal. Hot takes, confessions, rankings and roasts.',
    intensity: 'Intense',
    time: '30-60 MIN',
  },
  {
    id: 'raising_the_bar',
    label: 'RAISING THE BAR',
    icon: 'beer',
    color: '#00fbfb',
    desc: "Cards built for a bar or public space. Strangers get involved. Don't play at home.",
    intensity: 'Medium',
    time: '20-40 MIN',
  },
  {
    id: 'spicy',
    label: 'SPICY 🌶️',
    icon: 'heart',
    color: '#ff4500',
    desc: 'Adults only. Explicit dares and confessions for the truly bold. 18+ strictly.',
    intensity: 'Very Intense',
    time: '20-40 MIN',
  },
];

// ─────────────────────────────────────────────
// BACKEND CARD POOLS (organised by mechanic)
// ─────────────────────────────────────────────

function buildPool(cards: RawCard[], source: string, prefix: string): Challenge[] {
  return cards.map((c, i) => ({ ...c, mode: source, id: `${prefix}-${i}` }));
}

const backendPools = {
  drink: buildPool(drinkCards as RawCard[], 'drink', 'drink'),
  dare:  buildPool(dareCards  as RawCard[], 'dare',  'dare'),
  truth: buildPool(truthCards as RawCard[], 'truth', 'truth'),
  chaos: buildPool(chaosCards as RawCard[], 'chaos', 'chaos'),
  spicy: buildPool(spicyCards as RawCard[], 'spicy', 'spicy'),
};

// ─────────────────────────────────────────────
// FRONTEND → BACKEND MAPPING
// ─────────────────────────────────────────────

function hasTag(card: Challenge, tag: string): boolean {
  return Array.isArray(card.tags) && card.tags.includes(tag);
}

function noTag(card: Challenge, tag: string): boolean {
  return !Array.isArray(card.tags) || !card.tags.includes(tag);
}

const frontendPools: Record<string, Challenge[]> = {
  getting_started: [
    ...backendPools.drink.filter(c => c.intensity <= 2),
    ...backendPools.dare.filter(c => c.intensity <= 2 && noTag(c, 'bar')),
  ],
  letting_loose: [
    ...backendPools.truth.filter(c => c.intensity >= 2),
    ...backendPools.chaos.filter(c => c.intensity >= 2),
    ...backendPools.dare.filter(c => c.intensity >= 2 && noTag(c, 'bar')),
  ],
  raising_the_bar: [
    ...backendPools.drink.filter(c => hasTag(c, 'bar')),
    ...backendPools.dare.filter(c => hasTag(c, 'bar')),
    ...backendPools.truth.filter(c => hasTag(c, 'bar')),
    ...backendPools.chaos.filter(c => hasTag(c, 'bar')),
  ],
  spicy: backendPools.spicy,
};

export const ALL_CHALLENGES: Challenge[] = Object.values(frontendPools).flat();

export function getChallengePool(modes: string[]): Challenge[] {
  if (modes.length === 0) return ALL_CHALLENGES;
  return modes.flatMap(m => frontendPools[m] ?? []);
}

// ─────────────────────────────────────────────
// BUILD RULE POOLS
// ─────────────────────────────────────────────

export const ALL_RULE_STARTS: Challenge[] = (rulesData as RawRulePair[]).map((pair, i) => ({
  ...pair.start,
  mode: 'all',
  id: `rule-start-${i}`,
  isRule: true,
  ruleId: pair.ruleId,
}));

export const ALL_RULE_ENDS: Record<string, Challenge> = Object.fromEntries(
  (rulesData as RawRulePair[]).map((pair, i) => [
    pair.ruleId,
    {
      ...pair.end,
      mode: 'all',
      id: `rule-end-${i}`,
      isRule: false,
      ruleId: pair.ruleId,
    },
  ])
);

// ─────────────────────────────────────────────
// TOKEN SUBSTITUTION
// ─────────────────────────────────────────────

export function substituteTokens(
  text: string,
  players: { name: string }[],
  ctx: PenaltyContext = {}
): string {
  if (players.length === 0) return text;

  const banks = wordBanks as Record<string, Record<string, string[]>>;

  // Pre-resolve each unique {take_or_give_X} token once per draw
  const tog: Record<string, string> = {};
  const togPattern = /\{take_or_give_(sip|small|medium|large|max)\}/g;
  let togMatch: RegExpExecArray | null;
  // nosemgrep justification (regex-dos): togPattern is a fixed alternation of
  // five literals with no nested or ambiguous quantifiers, so it matches in
  // linear time and cannot backtrack catastrophically. Text comes from bundled
  // card JSON or a card the user typed on this device — there is no remote
  // input path into this function.
  // nosemgrep
  while ((togMatch = togPattern.exec(text)) !== null) {
    const key = togMatch[0];
    if (!tog[key]) {
      tog[key] = resolveTakeOrGive(togMatch[1] as keyof typeof PENALTY, ctx);
    }
  }

  let resolved = text;
  for (const [token, value] of Object.entries(tog)) {
    resolved = resolved.split(token).join(value);
  }

  // Word banks resolve BEFORE the player/penalty passes below. Two reasons:
  //   1. Bank entries may themselves contain tokens — vote_consequence holds
  //      values like "drinks {small}" — and those only get resolved if the
  //      penalty pass runs afterwards. Running banks last leaked raw braces.
  //   2. Every bank is guaranteed a `default` list (enforced by
  //      ValidateCards.js), so an unmapped mode can never render "{topic}".
  // The catch-all deliberately leaves {player1}/{sip}/{small}/... untouched:
  // they have no matching bank, so `banks[key]` is undefined and the match is
  // returned verbatim for the passes below to handle.
  resolved = resolved.replace(/\{(\w+)\}/g, (match, key: string) => {
    const bank = banks[key];
    if (!bank) return match;
    const list = bank[ctx.mode ?? 'default'] ?? bank['default'] ?? [];
    if (list.length === 0) return match;
    return pickOne(list);
  });

  return resolved
    .replace(/{player1}/g, players[0].name)
    .replace(/{player2}/g, players.length > 1 ? players[1].name : players[0].name)
    .replace(/{sip}/g,    formatPenalty(getPenalty('sip',    ctx)))
    .replace(/{small}/g,  formatPenalty(getPenalty('small',  ctx)))
    .replace(/{medium}/g, formatPenalty(getPenalty('medium', ctx)))
    .replace(/{large}/g,  formatPenalty(getPenalty('large',  ctx)))
    .replace(/{max}/g,    formatPenalty(getPenalty('max',    ctx)));
}