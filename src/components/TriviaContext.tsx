// src/components/TriviaContext.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Trivia SETUP state only — which wedges are in play, how many are needed to
// win, and which difficulties are allowed.
//
// Deliberately separate from GameContext, which owns the shared session
// (players, sipBonus) plus a pile of Truth-or-Dare-specific state
// (selectedModes, currentRound, skips). Bolting trivia onto that reducer would
// tangle the two modes together.
//
// Runtime game state — whose turn it is, who holds which wedge, the current
// question — lives in useTriviaEngine, not here. This is just what the setup
// screen configures and the game screen reads once on mount.
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  createContext, useContext, useEffect, useRef, useState, ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WedgeId, WEDGE_IDS } from '../data/trivia/types';

export type Difficulty = 1 | 2 | 3;

/** Seconds on the clock, or null for no timer. */
export type TimerSetting = null | 15 | 30 | 45;

export const TIMER_OPTIONS: TimerSetting[] = [null, 15, 30, 45];

export interface TriviaSettings {
  /** Wedges in play. Never empty — the UI blocks deselecting the last one. */
  wedges: WedgeId[];
  /** Wedges needed before the final question. Clamped to wedges.length. */
  wedgesToWin: number;
  /** Allowed difficulties. Empty is treated as "all" by the data layer. */
  difficulties: Difficulty[];
  /** Countdown per question. null = off. */
  timerSeconds: TimerSetting;
  /** Offer a missed question to the next player. */
  stealsEnabled: boolean;
}

const DEFAULTS: TriviaSettings = {
  wedges: [...WEDGE_IDS],
  wedgesToWin: 6,
  difficulties: [1, 2, 3],
  timerSeconds: 30,
  stealsEnabled: true,
};

interface TriviaContextType {
  settings: TriviaSettings;
  toggleWedge: (wedge: WedgeId) => void;
  setWedgesToWin: (n: number) => void;
  toggleDifficulty: (d: Difficulty) => void;
  setTimerSeconds: (t: TimerSetting) => void;
  setStealsEnabled: (on: boolean) => void;
  resetSettings: () => void;
}

const TriviaContext = createContext<TriviaContextType | null>(null);

// Note the key prefix: `@siphappens_`, not the legacy `@nekkit_` used by the
// custom deck store. New storage should not inherit the old app name.
const PERSIST_KEY = '@siphappens_trivia_v1';

export function TriviaProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<TriviaSettings>(DEFAULTS);
  const hydratedRef = useRef(false);

  // Restore last-used setup — repeat groups tend to keep the same categories.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(PERSIST_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as Partial<TriviaSettings>;
          const wedges = Array.isArray(saved.wedges)
            ? saved.wedges.filter(w => (WEDGE_IDS as readonly string[]).includes(w))
            : DEFAULTS.wedges;
          const difficulties = Array.isArray(saved.difficulties)
            ? saved.difficulties.filter((d): d is Difficulty => d === 1 || d === 2 || d === 3)
            : DEFAULTS.difficulties;
          const timer = TIMER_OPTIONS.includes(saved.timerSeconds as TimerSetting)
            ? (saved.timerSeconds as TimerSetting)
            : DEFAULTS.timerSeconds;
          setSettings({
            wedges: wedges.length > 0 ? wedges : DEFAULTS.wedges,
            difficulties: difficulties.length > 0 ? difficulties : DEFAULTS.difficulties,
            wedgesToWin: clampWin(saved.wedgesToWin ?? DEFAULTS.wedgesToWin, wedges.length),
            timerSeconds: timer,
            stealsEnabled: typeof saved.stealsEnabled === 'boolean'
              ? saved.stealsEnabled
              : DEFAULTS.stealsEnabled,
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

  const toggleWedge = (wedge: WedgeId) => {
    setSettings(prev => {
      const on = prev.wedges.includes(wedge);
      if (on && prev.wedges.length === 1) return prev; // keep at least one
      const wedges = on
        ? prev.wedges.filter(w => w !== wedge)
        : [...WEDGE_IDS].filter(w => w === wedge || prev.wedges.includes(w));
      return { ...prev, wedges, wedgesToWin: clampWin(prev.wedgesToWin, wedges.length) };
    });
  };

  const setWedgesToWin = (n: number) =>
    setSettings(prev => ({ ...prev, wedgesToWin: clampWin(n, prev.wedges.length) }));

  const toggleDifficulty = (d: Difficulty) => {
    setSettings(prev => {
      const on = prev.difficulties.includes(d);
      if (on && prev.difficulties.length === 1) return prev; // keep at least one
      return {
        ...prev,
        difficulties: on
          ? prev.difficulties.filter(x => x !== d)
          : [...prev.difficulties, d].sort() as Difficulty[],
      };
    });
  };

  const setTimerSeconds = (t: TimerSetting) =>
    setSettings(prev => ({ ...prev, timerSeconds: t }));

  const setStealsEnabled = (on: boolean) =>
    setSettings(prev => ({ ...prev, stealsEnabled: on }));

  const resetSettings = () => setSettings(DEFAULTS);

  return (
    <TriviaContext.Provider
      value={{
        settings, toggleWedge, setWedgesToWin, toggleDifficulty,
        setTimerSeconds, setStealsEnabled, resetSettings,
      }}
    >
      {children}
    </TriviaContext.Provider>
  );
}

function clampWin(n: number, wedgeCount: number): number {
  return Math.max(1, Math.min(n, Math.max(1, wedgeCount)));
}

export function useTrivia() {
  const ctx = useContext(TriviaContext);
  if (!ctx) throw new Error('useTrivia must be used inside TriviaProvider');
  return ctx;
}
