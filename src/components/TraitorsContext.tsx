// src/components/TraitorsContext.tsx
// Setup settings for Word Traitors!, persisted between sessions.
//
// Note traitorCount can be 'auto'. Setup runs BEFORE the lobby, so the group
// size isn't known yet — 'auto' defers the decision to kick-off and derives it
// from the actual player count.

import React, {
  createContext, useContext, useEffect, useRef, useState, ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type TraitorCountSetting = 'auto' | 1 | 2 | 3;

export const TRAITOR_COUNT_OPTIONS: TraitorCountSetting[] = ['auto', 1, 2, 3];
export const ROUND_OPTIONS: Array<number | null> = [3, 5, 7, null];

export interface TraitorsSettings {
  traitorCount: TraitorCountSetting;
  /** Traitors see the word's vague hint instead of nothing. */
  hintsEnabled: boolean;
  /** null = endless. */
  totalRounds: number | null;
}

const DEFAULTS: TraitorsSettings = {
  traitorCount: 'auto',
  hintsEnabled: true,
  totalRounds: 5,
};

interface TraitorsContextType {
  settings: TraitorsSettings;
  setTraitorCount: (n: TraitorCountSetting) => void;
  setHintsEnabled: (on: boolean) => void;
  setTotalRounds: (n: number | null) => void;
  resetSettings: () => void;
}

const TraitorsContext = createContext<TraitorsContextType | null>(null);

const PERSIST_KEY = '@siphappens_traitors_v1';

export function TraitorsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<TraitorsSettings>(DEFAULTS);
  const hydratedRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(PERSIST_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as Partial<TraitorsSettings>;
          setSettings({
            traitorCount: TRAITOR_COUNT_OPTIONS.includes(saved.traitorCount as TraitorCountSetting)
              ? (saved.traitorCount as TraitorCountSetting)
              : DEFAULTS.traitorCount,
            hintsEnabled: typeof saved.hintsEnabled === 'boolean'
              ? saved.hintsEnabled
              : DEFAULTS.hintsEnabled,
            totalRounds: ROUND_OPTIONS.includes(saved.totalRounds ?? null)
              ? (saved.totalRounds ?? null)
              : DEFAULTS.totalRounds,
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
    <TraitorsContext.Provider
      value={{
        settings,
        setTraitorCount: n => setSettings(prev => ({ ...prev, traitorCount: n })),
        setHintsEnabled: on => setSettings(prev => ({ ...prev, hintsEnabled: on })),
        setTotalRounds: n => setSettings(prev => ({ ...prev, totalRounds: n })),
        resetSettings: () => setSettings(DEFAULTS),
      }}
    >
      {children}
    </TraitorsContext.Provider>
  );
}

export function useTraitors() {
  const ctx = useContext(TraitorsContext);
  if (!ctx) throw new Error('useTraitors must be used inside TraitorsProvider');
  return ctx;
}
