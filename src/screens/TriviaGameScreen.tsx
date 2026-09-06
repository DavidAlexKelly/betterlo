// src/screens/TriviaGameScreen.tsx
// The Trivia turn loop. Structure deliberately parallels GameScreen: paper
// prompt card on the indigo stage, quit modal, Android back intercept, and the
// same two fail-open interstitial placements.
//
// Turn phases:
//   spin        → CategoryWheel reveals the wedge the engine already picked
//   question    → paper card + tappable options, optional countdown
//   result      → right/wrong/time's-up, sips owed, wedge won, steal offer
//   steal       → the next player's shot at a missed question
//   stealResult → how that went
//
// ALL rules live in useTriviaEngine. This screen owns animation, layout and
// navigation only — same split as GameScreen/useCardEngine.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Modal, BackHandler, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { RootStackParamList } from '../navigation/types';
import { Colors, Jack, Type } from '../styles/theme';
import { WEDGES } from '../data/trivia/types';
import { STREAK_THRESHOLD, formatSips } from '../data/triviaData';
import { useGame } from '../components/GameContext';
import { useTrivia } from '../components/TriviaContext';
import { useTriviaEngine, TriviaResolution } from '../hooks/useTriviaEngine';
import { Ads } from '../monetization/ads';
import { JackButton } from '../components/jack';
import CategoryWheel from '../components/CategoryWheel';
import WedgeTracker from '../components/WedgeTracker';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'TriviaGame'>;
};

type Phase = 'spin' | 'question' | 'result' | 'steal' | 'stealResult';

/** One interstitial mid-game, at this many completed turns. */
const MIDPOINT_TURNS = 12;

export default function TriviaGameScreen({ navigation }: Props) {
  const { state } = useGame();
  const { settings } = useTrivia();

  const engine = useTriviaEngine({
    players: state.players,
    wedges: settings.wedges,
    wedgesToWin: settings.wedgesToWin,
    difficulties: settings.difficulties,
    stealsEnabled: settings.stealsEnabled,
    penaltyCtx: { bonus: state.sipBonus },
  });

  const [phase, setPhase] = useState<Phase>('spin');
  const [showQuitModal, setShowQuitModal] = useState(false);
  const [turnCount, setTurnCount] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  // The first turn is drawn in an effect, so `current` is null on the very
  // first render. Without this the "no questions" empty state would flash
  // before the game starts.
  const [booted, setBooted] = useState(false);
  const midpointAdShown = useRef(false);
  const started = useRef(false);

  const fade = useRef(new Animated.Value(0)).current;

  const fadeIn = useCallback(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [fade]);

  // ── Boot: first turn ────────────────────────────────────────
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    engine.beginTurn();
    setPhase('spin');
    setBooted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Android hardware back → quit confirm ────────────────────
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      setShowQuitModal(true);
      return true;
    });
    return () => handler.remove();
  }, []);

  const current = engine.current;

  const applyResolution = useCallback((result: TriviaResolution | null) => {
    if (!result) return;
    Haptics.notificationAsync(
      result.correct
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error,
    );
    setRemaining(null);
    setTurnCount(n => n + 1);
    setPhase('result');
    fadeIn();
  }, [fadeIn]);

  // ── Countdown ───────────────────────────────────────────────
  // Held in a ref so the expiry effect below doesn't need it as a dependency
  // (which would restart the clock on every tick).
  const expireRef = useRef<() => void>(() => {});
  expireRef.current = () => applyResolution(engine.timeout());

  useEffect(() => {
    if (phase !== 'question' || settings.timerSeconds == null) {
      setRemaining(null);
      return;
    }
    setRemaining(settings.timerSeconds);
    const id = setInterval(
      () => setRemaining(r => (r == null ? null : r - 1)),
      1000,
    );
    return () => clearInterval(id);
    // Keyed on the question so each turn gets a fresh clock.
  }, [phase, current?.question.id, settings.timerSeconds]);

  useEffect(() => {
    if (phase === 'question' && remaining !== null && remaining <= 0) {
      expireRef.current();
    }
  }, [remaining, phase]);

  const handleWheelSettled = useCallback(() => {
    setPhase('question');
    fadeIn();
  }, [fadeIn]);

  const handleAnswer = (option: string) => {
    if (phase !== 'question') return;
    applyResolution(engine.resolve(option));
  };

  const handleStealAnswer = (option: string) => {
    if (phase !== 'steal') return;
    const result = engine.resolveSteal(option);
    if (!result) return;
    Haptics.notificationAsync(
      result.correct
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error,
    );
    setPhase('stealResult');
    fadeIn();
  };

  const nextTurn = useCallback(() => {
    engine.beginTurn();
    setPhase('spin');
  }, [engine]);

  const handleContinue = () => {
    const result = engine.lastResolution;

    // ── Ad placement 2: game end ──
    if (result?.isWin) {
      engine.finishGame();
      Ads.show(() => navigation.replace('TriviaOver'));
      return;
    }

    // ── Ad placement 1: midpoint, once ──
    if (!midpointAdShown.current && turnCount >= MIDPOINT_TURNS) {
      midpointAdShown.current = true;
      Ads.show(nextTurn);
      return;
    }

    nextTurn();
  };

  // Still drawing the first question — render nothing rather than briefly
  // flashing the empty state below.
  if (!booted) {
    return <SafeAreaView style={styles.container} edges={['top', 'bottom']} />;
  }

  // Nothing to show — a misconfigured game (no players, or every selected
  // wedge empty). Fail into the menu rather than a blank screen.
  if (!current) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.emptyState}>
          <Ionicons name="help-circle-outline" size={44} color={Colors.outlineVariant} />
          <Text style={styles.emptyText}>No questions available for these categories.</Text>
          <JackButton
            label="Back to Menu"
            variant="ghost"
            size="medium"
            onPress={() => navigation.replace('Play')}
          />
        </View>
      </SafeAreaView>
    );
  }

  const wedge = WEDGES[current.wedge];
  const result = engine.lastResolution;
  const steal = engine.pendingSteal;
  const stealResult = engine.lastSteal;
  const held = engine.wedgesFor(current.player.id);
  const streak = engine.streakFor(current.player.id);

  const timerTotal = settings.timerSeconds ?? 0;
  const timerFrac = timerTotal > 0 && remaining !== null
    ? Math.max(0, Math.min(1, remaining / timerTotal))
    : 0;
  const timerLow = timerFrac <= 0.25;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.inner}>
        {/* Header: quit · whose turn · their wedges */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => setShowQuitModal(true)}
            style={styles.quitBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={20} color={Colors.onSurfaceVariant} />
          </TouchableOpacity>

          <View style={styles.turnInfo}>
            <View style={styles.turnNameRow}>
              <Text style={styles.turnName} numberOfLines={1}>
                {current.player.name.toUpperCase()}
              </Text>
              {streak >= STREAK_THRESHOLD && (
                <View style={styles.streakBadge}>
                  <Ionicons name="flame" size={11} color={Colors.ink} />
                  <Text style={styles.streakText}>{streak}</Text>
                </View>
              )}
            </View>
            <WedgeTracker
              held={held}
              wedges={engine.activeWedges}
              size={14}
              showCount
            />
          </View>

          <View style={styles.avatarWrap}>
            {state.players.find(p => p.id === current.player.id)?.photo ? (
              <Image
                source={{ uri: state.players.find(p => p.id === current.player.id)!.photo }}
                style={styles.avatarImg}
              />
            ) : (
              <Text style={styles.avatarInitial}>
                {current.player.name.charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
        </View>

        {current.isFinal && phase === 'question' && (
          <View style={styles.finalBanner}>
            <Ionicons name="trophy" size={14} color={Colors.ink} />
            <Text style={styles.finalBannerText}>FINAL QUESTION — WIN IT ALL</Text>
          </View>
        )}

        {/* Countdown */}
        {phase === 'question' && remaining !== null && (
          <View style={styles.timerRow}>
            <View style={styles.timerTrack}>
              <View
                style={[
                  styles.timerFill,
                  {
                    width: `${timerFrac * 100}%`,
                    backgroundColor: timerLow ? Colors.error : wedge.color,
                  },
                ]}
              />
            </View>
            <Text style={[styles.timerText, timerLow && { color: Colors.error }]}>
              {Math.max(0, remaining)}s
            </Text>
          </View>
        )}

        {/* ── SPIN ── */}
        {phase === 'spin' && (
          <View style={styles.centered}>
            {/* Keyed per question so the spin restarts every turn. Without
                this, two consecutive turns on the same wedge leave `target`
                unchanged, the animation effect never re-runs, and onSettled
                never fires — the game would hang on "SPINNING…". */}
            <CategoryWheel
              key={current.question.id}
              wedges={engine.activeWedges}
              target={current.wedge}
              onSettled={handleWheelSettled}
            />
          </View>
        )}

        {/* ── QUESTION ── */}
        {phase === 'question' && (
          <Animated.View style={[styles.body, { opacity: fade }]}>
            <View style={styles.cardOuter}>
              <View style={[styles.cardShadow, { backgroundColor: wedge.color }]} />
              <View style={styles.cardFace}>
                <View style={[styles.wedgeSticker, { backgroundColor: wedge.color }]}>
                  <Ionicons name={wedge.icon as never} size={13} color={Colors.ink} />
                  <Text style={styles.wedgeStickerText}>{wedge.label}</Text>
                </View>
                <Text style={styles.questionText}>{current.question.question}</Text>
              </View>
            </View>

            <View style={styles.options}>
              {current.options.map(option => (
                <JackButton
                  key={option}
                  label={option}
                  size="medium"
                  variant="ghost"
                  haptic={false}
                  onPress={() => handleAnswer(option)}
                  textStyle={styles.optionText}
                />
              ))}
            </View>
          </Animated.View>
        )}

        {/* ── RESULT ── */}
        {phase === 'result' && result && (
          <Animated.View style={[styles.body, { opacity: fade }]}>
            <View style={styles.cardOuter}>
              <View
                style={[
                  styles.cardShadow,
                  { backgroundColor: result.correct ? '#B6F44A' : Colors.error },
                ]}
              />
              <View style={styles.cardFace}>
                <Text style={[
                  styles.verdict,
                  { color: result.correct ? '#3B7A00' : Colors.error },
                ]}>
                  {result.correct ? 'CORRECT!' : result.timedOut ? "TIME'S UP" : 'WRONG'}
                </Text>

                {!result.correct && (
                  <Text style={styles.answerReveal}>
                    Answer: <Text style={styles.answerRevealBold}>{result.answer}</Text>
                  </Text>
                )}

                {result.wonWedge && (
                  <View style={[styles.chip, { backgroundColor: wedge.color }]}>
                    <Ionicons name={wedge.icon as never} size={16} color={Colors.ink} />
                    <Text style={styles.chipText}>{wedge.label} WEDGE WON</Text>
                  </View>
                )}

                {result.streakSips > 0 && (
                  <View style={[styles.chip, { backgroundColor: '#FF7A3C' }]}>
                    <Ionicons name="flame" size={16} color={Colors.ink} />
                    <Text style={styles.chipText}>
                      {result.streak} IN A ROW — +{formatSips(result.streakSips)}
                    </Text>
                  </View>
                )}

                {result.sips > 0 && (
                  <Text style={styles.sips}>
                    {result.correct
                      ? `Give out ${formatSips(result.sips)}`
                      : `Drink ${formatSips(result.sips)}`}
                  </Text>
                )}

                {result.isWin && (
                  <Text style={styles.winText}>
                    {current.player.name} takes the whole thing.
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.options}>
              {steal ? (
                <>
                  <JackButton
                    label={`${steal.stealer.name} — Steal It`}
                    icon="flash"
                    onPress={() => { setPhase('steal'); fadeIn(); }}
                  />
                  <JackButton
                    label="Pass"
                    variant="ghost"
                    size="medium"
                    onPress={() => { engine.skipSteal(); handleContinue(); }}
                  />
                </>
              ) : (
                <>
                  <JackButton
                    label={
                      result.isWin ? 'See Results'
                        : result.goAgain ? 'Go Again'
                          : 'Pass the Phone'
                    }
                    icon={result.isWin ? 'trophy' : 'arrow-forward'}
                    onPress={handleContinue}
                  />
                  {!result.isWin && (
                    <Text style={styles.nextHint}>
                      {result.goAgain
                        ? `${current.player.name} keeps the phone.`
                        : `Next up: ${engine.currentPlayer?.name ?? ''}`}
                    </Text>
                  )}
                </>
              )}
            </View>
          </Animated.View>
        )}

        {/* ── STEAL ── */}
        {phase === 'steal' && steal && (
          <Animated.View style={[styles.body, { opacity: fade }]}>
            <View style={styles.cardOuter}>
              <View style={[styles.cardShadow, { backgroundColor: Colors.primary }]} />
              <View style={styles.cardFace}>
                <View style={[styles.wedgeSticker, { backgroundColor: Colors.primary }]}>
                  <Ionicons name="flash" size={13} color={Colors.ink} />
                  <Text style={styles.wedgeStickerText}>{steal.stealer.name} steals</Text>
                </View>
                <Text style={styles.questionText}>{steal.question.question}</Text>
              </View>
            </View>

            <View style={styles.options}>
              {steal.options.map(option => (
                <JackButton
                  key={option}
                  label={option}
                  size="medium"
                  variant="ghost"
                  haptic={false}
                  onPress={() => handleStealAnswer(option)}
                  textStyle={styles.optionText}
                />
              ))}
            </View>
          </Animated.View>
        )}

        {/* ── STEAL RESULT ── */}
        {phase === 'stealResult' && stealResult && (
          <Animated.View style={[styles.body, { opacity: fade }]}>
            <View style={styles.cardOuter}>
              <View
                style={[
                  styles.cardShadow,
                  { backgroundColor: stealResult.correct ? '#B6F44A' : Colors.error },
                ]}
              />
              <View style={styles.cardFace}>
                <Text style={[
                  styles.verdict,
                  { color: stealResult.correct ? '#3B7A00' : Colors.error },
                ]}>
                  {stealResult.correct ? 'STOLEN!' : 'NO STEAL'}
                </Text>

                {!stealResult.correct && (
                  <Text style={styles.answerReveal}>
                    Answer: <Text style={styles.answerRevealBold}>{stealResult.answer}</Text>
                  </Text>
                )}

                {stealResult.wonWedge && (
                  <View style={[styles.chip, { backgroundColor: wedge.color }]}>
                    <Ionicons name={wedge.icon as never} size={16} color={Colors.ink} />
                    <Text style={styles.chipText}>{wedge.label} WEDGE TAKEN</Text>
                  </View>
                )}

                <Text style={styles.sips}>
                  {stealResult.correct
                    ? `${stealResult.stealer.name} gives out ${formatSips(stealResult.sips)}`
                    : `${stealResult.stealer.name} drinks ${formatSips(stealResult.sips)}`}
                </Text>
              </View>
            </View>

            <View style={styles.options}>
              <JackButton
                label="Next Question"
                icon="arrow-forward"
                onPress={handleContinue}
              />
            </View>
          </Animated.View>
        )}
      </View>

      {/* Quit confirm — same pattern as GameScreen */}
      <Modal
        visible={showQuitModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowQuitModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Quit the game?</Text>
            <Text style={styles.modalSubtitle}>All wedges will be lost.</Text>
            <View style={styles.modalBtns}>
              <View style={{ flex: 1 }}>
                <JackButton
                  label="Keep Playing"
                  size="medium"
                  onPress={() => setShowQuitModal(false)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <JackButton
                  label="Quit"
                  size="medium"
                  variant="ghost"
                  onPress={() => { setShowQuitModal(false); navigation.replace('Play'); }}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  inner: { flex: 1, paddingHorizontal: 20, paddingBottom: 12 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, gap: 12,
  },
  quitBtn: {
    width: 38, height: 38, borderRadius: 12,
    borderWidth: 2, borderColor: Colors.outlineVariant,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surfaceContainerLow,
  },
  turnInfo: { flex: 1, gap: 5 },
  turnNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  turnName: {
    fontFamily: Type.display, fontSize: 15, letterSpacing: 0.5,
    color: Colors.onSurface, flexShrink: 1,
  },
  streakBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#FF7A3C',
    borderRadius: 8, borderWidth: 2, borderColor: Colors.ink,
    paddingHorizontal: 6, paddingVertical: 1,
  },
  streakText: { fontFamily: Type.display, fontSize: 11, color: Colors.ink },
  avatarWrap: {
    width: 38, height: 38, borderRadius: 19,
    borderWidth: 2.5, borderColor: Colors.primary,
    backgroundColor: Colors.surfaceContainerLow,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarInitial: { fontFamily: Type.display, fontSize: 15, color: Colors.primary },

  finalBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: Colors.primary,
    borderRadius: 10, borderWidth: 2.5, borderColor: Colors.ink,
    paddingVertical: 7, marginBottom: 10,
  },
  finalBannerText: {
    fontFamily: Type.display, fontSize: 11, letterSpacing: 1.5, color: Colors.ink,
  },

  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  timerTrack: {
    flex: 1, height: 10, borderRadius: 6, overflow: 'hidden',
    borderWidth: 2, borderColor: Colors.ink,
    backgroundColor: Colors.surfaceContainerLow,
  },
  timerFill: { height: '100%' },
  timerText: {
    fontFamily: Type.display, fontSize: 12, color: Colors.onSurfaceVariant,
    width: 32, textAlign: 'right',
  },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, paddingTop: 6 },

  cardOuter: { flex: 1, position: 'relative', marginBottom: 18 },
  cardShadow: {
    position: 'absolute', top: Jack.shadowBig, left: 0, right: 0, bottom: 0,
    borderRadius: Jack.radiusBig + 4,
  },
  cardFace: {
    flex: 1, marginBottom: Jack.shadowBig,
    borderRadius: Jack.radiusBig + 4,
    borderWidth: Jack.border, borderColor: Colors.ink,
    backgroundColor: Colors.paper,
    padding: 24, justifyContent: 'center', gap: 14,
  },
  wedgeSticker: {
    position: 'absolute', top: 18, left: 18,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 10, borderWidth: 2.5, borderColor: Colors.ink,
  },
  wedgeStickerText: {
    fontFamily: Type.display, fontSize: 11, letterSpacing: 1,
    color: Colors.ink, textTransform: 'uppercase',
  },
  questionText: {
    fontFamily: Type.display, fontSize: 23, lineHeight: 31, color: Colors.ink,
  },

  options: { gap: 10 },
  optionText: { textTransform: 'none', letterSpacing: 0.3 },

  verdict: { fontFamily: Type.display, fontSize: 40, letterSpacing: -0.5 },
  answerReveal: {
    fontFamily: Type.body, fontSize: 15, lineHeight: 22, color: '#5A5370',
  },
  answerRevealBold: { fontFamily: Type.bodyBold, color: Colors.ink },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 10, borderWidth: 2.5, borderColor: Colors.ink,
  },
  chipText: {
    fontFamily: Type.display, fontSize: 12, letterSpacing: 1, color: Colors.ink,
  },
  sips: { fontFamily: Type.display, fontSize: 20, color: Colors.ink },
  winText: {
    fontFamily: Type.body, fontSize: 14, lineHeight: 20, color: '#5A5370',
  },
  nextHint: {
    fontFamily: Type.body, fontSize: 13, color: Colors.onSurfaceVariant,
    textAlign: 'center', marginTop: 2,
  },

  emptyState: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 14, paddingHorizontal: 40,
  },
  emptyText: {
    fontFamily: Type.body, fontSize: 14, color: Colors.onSurfaceVariant,
    textAlign: 'center',
  },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10,6,32,0.72)' },
  modalSheet: {
    backgroundColor: Colors.surfaceContainerLow,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40,
    borderTopWidth: Jack.border, borderTopColor: Colors.ink,
  },
  modalTitle: { fontFamily: Type.display, fontSize: 22, color: Colors.onSurface },
  modalSubtitle: {
    fontFamily: Type.body, fontSize: 14, color: Colors.onSurfaceVariant,
    marginTop: 6, marginBottom: 22,
  },
  modalBtns: { flexDirection: 'row', gap: 12 },
});
