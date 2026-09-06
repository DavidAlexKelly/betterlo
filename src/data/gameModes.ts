// src/data/gameModes.ts
// ─────────────────────────────────────────────────────────────────────────────
// TOP-LEVEL game modes — the tiles on the main menu. One entry per distinct
// way to play Sip Happens.
//
// ⚠️ Not to be confused with `MODES` in gameData.ts. Despite the name, those
// are the DECKS *inside* the Truth or Dare mode (Getting Started, Letting
// Loose, Raising the Bar, Spicy). Renaming that export to DECKS is a separate
// cleanup — it's referenced across five screens.
//
// Adding a new mode:
//   1. Build its screens.
//   2. Register the route in navigation/types.ts and App.tsx.
//   3. Add an entry here with `available: true` and its `route`.
// The menu renders straight off this array, so no screen changes are needed.
// ─────────────────────────────────────────────────────────────────────────────

import { Colors } from '../styles/theme';
import { RootStackParamList } from '../navigation/types';

export type GameModeId =
  | 'truth_or_dare'
  | 'trivia'
  | 'screw_the_dealer'
  | 'word_traitors';

export interface GameModeDefinition {
  id: GameModeId;
  label: string;
  tagline: string;
  /** Ionicons glyph name. */
  icon: string;
  /** Accent colour — drives the tile's hard shadow, icon chip and meta text. */
  color: string;
  /** Short strapline, e.g. "2+ PLAYERS · 15–60 MIN". */
  meta: string;
  /** Screen the tile opens. `null` while the mode has no screens yet. */
  route: keyof RootStackParamList | null;
  /** false → tile renders locked with a COMING SOON badge and is not pressable. */
  available: boolean;
}

export const GAME_MODES: GameModeDefinition[] = [
  {
    id: 'truth_or_dare',
    label: 'TRUTH OR DARE!',
    tagline: 'Dares, confessions, votes and pure chaos. Pick your decks, pass the phone, see who cracks first.',
    icon: 'flame',
    color: Colors.secondary,
    meta: '2+ PLAYERS · 15–60 MIN',
    route: 'DeckSelect',
    available: true,
  },
  {
    id: 'trivia',
    label: 'TRIVIA',
    tagline: 'Answer fast, drink when you get it wrong. Categories, streaks and sudden death.',
    icon: 'bulb',
    color: Colors.tertiary,
    meta: '2+ PLAYERS · 20–40 MIN',
    route: 'TriviaSetup',
    available: true,
  },
  {
    id: 'screw_the_dealer',
    label: 'SCREW THE DEALER!',
    tagline: 'Guess the top card in two goes. Beat the dealer and they drink — but they only escape after three wins in a row.',
    icon: 'albums',
    color: '#B6F44A', // lime — distinct from the other two tiles
    meta: '3+ PLAYERS · 20–50 MIN',
    route: 'DealerSetup',
    available: true,
  },
  {
    id: 'word_traitors',
    label: 'WORD TRAITORS!',
    tagline: 'Everyone gets the secret word — except the traitors. Give a clue, find the liars, or bluff your way through.',
    icon: 'eye-off',
    color: '#8C6BFF', // grape — the fourth distinct tile colour
    meta: '3+ PLAYERS · NO DRINKING',
    route: 'TraitorsSetup',
    available: true,
  },
];
