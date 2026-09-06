// src/navigation/types.ts
export type RootStackParamList = {
  // Gate — shown once, before anything else, until age is confirmed
  AgeGate: undefined;

  // Bottom nav roots
  Play: undefined;
  Decks: undefined;
  Cards: undefined;

  // ── Truth or Dare setup flow (no bottom nav) ──
  DeckSelect: undefined;
  Game: undefined;
  GameOver: undefined;

  // ── Trivia setup flow ──
  TriviaSetup: undefined;
  TriviaGame: undefined;
  TriviaOver: undefined;

  // ── Screw the Dealer! setup flow ──
  DealerSetup: undefined;
  DealerGame: undefined;
  DealerOver: undefined;

  // ── Word Traitors! setup flow ──
  TraitorsSetup: undefined;
  TraitorsGame: undefined;
  TraitorsOver: undefined;

  /**
   * Shared lobby. Every game mode collects players here, so it has to be told
   * where to go next — otherwise it can only ever start Truth or Dare.
   */
  Players: { next: 'Game' | 'TriviaGame' | 'DealerGame' | 'TraitorsGame' };

  // Reachable from Play's header — privacy/terms/support
  Legal: undefined;
};
