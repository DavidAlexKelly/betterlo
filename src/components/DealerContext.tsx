// src/components/DealerContext.tsx
// Setup settings for Screw the Dealer!, persisted between sessions.
//
// Same shape as TriviaContext: this holds only what the setup screen
// configures. Runtime game state lives in useDealerEngine / dealerGame.

import React, {
  createContext, useContext, useEffect, useRef, useState, ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DealerEndCondition } from '../data/dealerGame';

/** null = uncapped. */
export type DrinkCap = number | null;

export const CAP_OPTIONS: DrinkCap[] = [6, 8, 10, null];
export const MERCY_OPTIONS: Array<number | null> = [8, 12, 16, null];

export const END_CONDITIONS: Array<{ id: DealerEndCondition; label: string; hint: string }> = [
  {
    id: 'deck',
    label: 'One deck',
    hint: 'Ends when all 52 cards are gone. Around 50 turns.',
  },
  {
    id: 'oneDealEach',
    label: 'Everyone deals',
    hint: 'Ends once every player has held the deck. Scales with the group.',
  },
  {
    id: 'endless',
    label: 'Endless',
    hint: 'Runs until you stop it. Quitting still shows the damage.',
  },
];

export interface DealerSettings {
  drinkCap: DrinkCap;
  endCondition: DealerEndCondition;
  /** Auto-pass the deck after this many turns dealing. null = off. */
  mercyTurns: number | null;
}

const DEFAULTS: DealerSettings = {
  drinkCap: 10,
  endCondition: 'deck',
  // On by default: under "Everyone deals", a dealer who never beats three in a
  // row would never pass the deck, and the game could not reach its end
  // condition at all.
  mercyTurns: 12,
};

interface DealerContextType {
  settings: DealerSettings;
  setDrinkCap: (cap: DrinkCap) => void;
  setEndCondition: (end: DealerEndCondition) => void;
  setMercyTurns: (turns: number | null) => void;
  resetSettings: () => void;
}

const DealerContext = createContext<DealerContextType | null>(null);

const PERSIST_KEY = '@siphappens_dealer_v1';

const VALID_ENDS: DealerEndCondition[] = ['deck', 'oneDealEach', 'endless'];

export function DealerProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<DealerSettings>(DEFAULTS);
  const hydratedRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(PERSIST_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as Partial<DealerSettings>;
          setSettings({
            drinkCap: CAP_OPTIONS.includes(saved.drinkCap as DrinkCap)
              ? (saved.drinkCap as DrinkCap)
              : DEFAULTS.drinkCap,
            endCondition: VALID_ENDS.includes(saved.endCondition as DealerEndCondition)
              ? (saved.endCondition as DealerEndCondition)
              : DEFAULTS.endCondition,
            mercyTurns: MERCY_OPTIONS.includes(saved.mercyTurns ?? null)
              ? (saved.mercyTurns ?? null)
              : DEFAULTS.mercyTurns,
          });
        }
      } catch { /* corrupt or missing — defaults are fine */ }
      hydratedRef.current = true;
    })();
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    AsyncStorage.setItem(PERSIST_KEY, JSON.stringify(settings)).catch(() => {});
  }, [settings]);

  return (
    <DealerContext.Provider
      value={{
        settings,
        setDrinkCap: cap => setSettings(prev => ({ ...prev, drinkCap: cap })),
        setEndCondition: end => setSettings(prev => ({ ...prev, endCondition: end })),
        setMercyTurns: turns => setSettings(prev => ({ ...prev, mercyTurns: turns })),
        resetSettings: () => setSettings(DEFAULTS),
      }}
    >
      {children}
    </DealerContext.Provider>
  );
}

export function useDealer() {
  const ctx = useContext(DealerContext);
  if (!ctx) throw new Error('useDealer must be used inside DealerProvider');
  return ctx;
}
