// src/screens/GameScreen.tsx
// The stage moment. The prompt card flips to PAPER — chalk-white face, ink
// text, a thick border and hard shadow in the current mode's color — so every
// draw pops like a Jackbox prompt against the indigo stage. The mode tag is a
// tilted sticker pinned to the card's top-left.
//
// ALL game logic is unchanged from the engine rewrite:
//   useCardEngine draws, BACK/SKIP history, custom deck pools, rule flushing,
//   both interstitial ad placements (midpoint + end), Android back → quit.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  Modal, BackHandler, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { RootStackParamList } from '../navigation/types';
import { Colors, Jack, Type, ModeColors, ModeLabels } from '../styles/theme';
import { Challenge, PenaltyContext, MODES } from '../data/gameData';
import { useGame } from '../components/GameContext';
import { useCardEngine } from '../hooks/useCardEngine';
import {
  loadCustomDecks, loadCustomCards, buildCustomPool, splitSelection,
} from '../data/customDecks';
import { Ads } from '../monetization/ads';
import { JackButton } from '../components/jack';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Game'>;
};

const BUILT_IN_MODE_IDS = MODES.map(m => m.id);

export default function GameScreen({ navigation }: Props) {
  const { state, nextRound, skipRound } = useGame();

  const [extraPool, setExtraPool] = useState<Challenge[]>([]);
  const [poolReady, setPoolReady] = useState(false);
  const [showQuitModal, setShowQuitModal] = useState(false);

  const { modeIds } = splitSelection(state.selectedModes, BUILT_IN_MODE_IDS);

  const buildPenaltyCtx = useCallback((c: Challenge): PenaltyContext => ({
    currentRound: state.currentRound,
    totalRounds: state.totalRounds,
    intensity: c.intensity,
    // The CARD's mechanic — not the selected deck. word_banks.json is keyed by
    // mechanic, so a truth card pulls truth topics and a chaos card pulls chaos
    // topics even when several decks are mixed into a single game. Passing the
    // frontend deck id here (the old behaviour) matched no bank at all.
    mode: c.mode,
    bonus: state.sipBonus,
  }), [state.currentRound, state.totalRounds, state.sipBonus]);

  const engine = useCardEngine({
    players: state.players,
    modeIds,
    extraPool,
    totalRounds: state.totalRounds,
    buildPenaltyCtx,
  });

  // ── Animations ──────────────────────────────────────────────
  const cardOpacity = useRef(new Animated.Value(1)).current;
  const cardTranslate = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(1)).current;

  const animateCard = (direction: 1 | -1, onMidpoint: () => void) => {
    Animated.parallel([
      Animated.timing(cardOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(cardTranslate, { toValue: -22 * direction, duration: 160, useNativeDriver: true }),
      Animated.timing(cardScale, { toValue: 0.95, duration: 160, useNativeDriver: true }),
    ]).start(() => {
      onMidpoint();
      cardTranslate.setValue(22 * direction);
      Animated.parallel([
        Animated.timing(cardOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
        Animated.spring(cardTranslate, { toValue: 0, tension: 90, friction: 10, useNativeDriver: true }),
        Animated.spring(cardScale, { toValue: 1, tension: 90, friction: 10, useNativeDriver: true }),
      ]).start();
    });
  };

  // ── Boot: resolve custom decks, then draw the first card ───
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [decks, cards] = await Promise.all([loadCustomDecks(), loadCustomCards()]);
      if (cancelled) return;
      const { customDeckIds } = splitSelection(state.selectedModes, BUILT_IN_MODE_IDS);
      setExtraPool(buildCustomPool(customDeckIds, decks, cards));
      setPoolReady(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (poolReady && !engine.current) {
      const { card } = engine.drawNext(state.currentRound || 1);
      if (card.challenge.isRule) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolReady]);

  // ── Android hardware back → quit confirm ───────────────────
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      setShowQuitModal(true);
      return true;
    });
    return () => handler.remove();
  }, []);

  // ── End condition ───────────────────────────────────────────
  const canEnd =
    state.currentRound >= state.totalRounds &&
    engine.allPlayersInvolved() &&
    !engine.hasPendingRuleEnd();

  // One interstitial per game at the halfway mark (plus one at the end).
  const midpointAdShown = useRef(false);

  const advance = (skipped: boolean) => {
    // ── Ad placement 2: game end — interstitial, then Game Over.
    if (canEnd) {
      engine.finishGame();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Ads.show(() => navigation.replace('GameOver'));
      return;
    }
    if (state.currentRound === 1) engine.releasePreviousGameCards();

    const goNext = () => {
      animateCard(1, () => {
        const { card, isNew } = engine.drawNext(state.currentRound + 1);
        if (isNew) (skipped ? skipRound : nextRound)();
        if (card.challenge.isRule) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      });
    };

    // ── Ad placement 1: midpoint — fires once.
    const midRound = Math.ceil(state.totalRounds / 2);
    if (!midpointAdShown.current && state.currentRound + 1 > midRound) {
      midpointAdShown.current = true;
      Ads.show(goNext);
      return;
    }

    goNext();
  };

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    advance(false);
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    advance(true);
  };

  const handleBack = () => {
    if (!engine.canGoBack) return;
    Haptics.selectionAsync();
    animateCard(-1, () => { engine.goBack(); });
  };

  // ── Derived display state ───────────────────────────────────
  const current = engine.current;
  const challenge = current?.challenge ?? null;
  const displayText = current?.displayText ?? '';

  const progress = Math.min(1, Math.max(0.04, (current?.round ?? 1) / state.totalRounds));

  const isRuleStart = challenge?.isRule === true;
  const isRuleEnd = challenge?.isRule === false && challenge?.ruleId !== undefined;
  const modeColor = isRuleStart ? '#FFCC26'
    : isRuleEnd ? '#B6F44A'
    : (challenge ? (ModeColors[challenge.mode] || Colors.primary) : Colors.primary);
  const modeLabel = isRuleStart ? '📜 NEW RULE'
    : isRuleEnd ? '✅ RULE OVER'
    : (challenge ? (ModeLabels[challenge.mode] || challenge.mode.toUpperCase()) : '');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.inner}>
        {/* Header: quit, avatars, round counter */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => setShowQuitModal(true)}
            style={styles.quitBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={20} color={Colors.onSurfaceVariant} />
          </TouchableOpacity>

          <View style={styles.avatarRow}>
            {state.players.slice(0, 5).map((p) => (
              <View key={p.id} style={[styles.avatar, { borderColor: p.color }]}>
                {p.photo ? (
                  <Image source={{ uri: p.photo }} style={styles.avatarImg} />
                ) : (
                  <Text style={[styles.avatarInitial, { color: p.color }]}>
                    {p.name.charAt(0).toUpperCase()}
                  </Text>
                )}
              </View>
            ))}
            {state.players.length > 5 && (
              <View style={[styles.avatar, { borderColor: Colors.outline }]}>
                <Text style={styles.avatarInitial}>+{state.players.length - 5}</Text>
              </View>
            )}
          </View>

          <View style={styles.roundBadge}>
            <Text style={styles.roundText}>
              {Math.min(current?.round ?? 1, state.totalRounds)}/{state.totalRounds}
            </Text>
          </View>
        </View>

        {/* Progress — chunky, ink-bordered */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: modeColor }]} />
        </View>

        {/* The prompt card — paper face, mode-colored border + hard shadow */}
        <Animated.View
          style={[
            styles.cardOuter,
            { opacity: cardOpacity, transform: [{ translateX: cardTranslate }, { scale: cardScale }] },
          ]}
        >
          <View style={[styles.cardShadow, { backgroundColor: modeColor }]} />
          <View style={[styles.cardFace, { borderColor: Colors.ink }]}>
            {/* Mode sticker, pinned and tilted */}
            <View style={[styles.modeStickerOuter, { transform: [{ rotate: Jack.tiltL }] }]}>
              <View style={styles.modeStickerShadow} />
              <View style={[styles.modeSticker, { backgroundColor: modeColor }]}>
                <Ionicons name={(challenge?.icon as any) || 'sparkles'} size={14} color={Colors.ink} />
                <Text style={styles.modeStickerText}>{modeLabel}</Text>
              </View>
            </View>

            <Text style={styles.challengeText}>{displayText}</Text>

            {challenge?.action ? (
              <View style={styles.actionRow}>
                <View style={[styles.actionDot, { backgroundColor: modeColor, borderColor: Colors.ink }]} />
                <Text style={styles.actionText}>{challenge.action}</Text>
              </View>
            ) : null}

            <View style={styles.watermark} pointerEvents="none">
              <Ionicons
                name={(challenge?.icon as any) || 'game-controller'}
                size={200}
                color={Colors.ink}
                style={{ opacity: 0.05 }}
              />
            </View>
          </View>
        </Animated.View>

        {/* Actions */}
        <View style={styles.actions}>
          <JackButton
            label={canEnd ? 'Finish Game' : 'Next Challenge'}
            icon={canEnd ? 'flag' : 'arrow-forward'}
            onPress={handleNext}
            haptic={false}
          />

          <View style={styles.secondaryRow}>
            <TouchableOpacity
              onPress={handleBack}
              style={[styles.secondaryBtn, !engine.canGoBack && styles.secondaryBtnDisabled]}
              activeOpacity={0.7}
              disabled={!engine.canGoBack}
            >
              <Ionicons
                name="arrow-undo"
                size={18}
                color={engine.canGoBack ? Colors.onSurfaceVariant : Colors.outlineVariant}
              />
              <Text style={[styles.secondaryText, !engine.canGoBack && styles.secondaryTextDisabled]}>
                Back
              </Text>
            </TouchableOpacity>

            <View style={styles.secondaryDivider} />

            <TouchableOpacity onPress={handleSkip} style={styles.secondaryBtn} activeOpacity={0.7}>
              <Ionicons name="play-skip-forward" size={18} color={Colors.onSurfaceVariant} />
              <Text style={styles.secondaryText}>Skip</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Quit confirm */}
      <Modal visible={showQuitModal} transparent animationType="slide" onRequestClose={() => setShowQuitModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Quit the game?</Text>
            <Text style={styles.modalSubtitle}>Progress will be lost.</Text>
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
    paddingVertical: 12,
  },
  quitBtn: {
    width: 38, height: 38, borderRadius: 12,
    borderWidth: 2, borderColor: Colors.outlineVariant,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surfaceContainerLow,
  },
  avatarRow: { flexDirection: 'row', paddingLeft: 10 },
  avatar: {
    width: 34, height: 34, borderRadius: 17, borderWidth: 2.5, marginLeft: -10,
    backgroundColor: Colors.surfaceContainerLow, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarInitial: { fontFamily: Type.display, fontSize: 13, color: Colors.onSurfaceVariant },
  roundBadge: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
    borderWidth: 2, borderColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceContainerLow,
  },
  roundText: {
    fontFamily: Type.display, fontSize: 12, color: Colors.onSurfaceVariant, letterSpacing: 0.5,
  },

  progressTrack: {
    height: 12, borderRadius: 8,
    borderWidth: 2, borderColor: Colors.ink,
    backgroundColor: Colors.surfaceContainerLow,
    marginBottom: 18, overflow: 'hidden',
  },
  progressFill: { height: '100%' },

  // ── The paper prompt card ──
  cardOuter: { flex: 1, position: 'relative' },
  cardShadow: {
    position: 'absolute', top: Jack.shadowBig, left: 0, right: 0, bottom: 0,
    borderRadius: Jack.radiusBig + 4,
  },
  cardFace: {
    flex: 1, marginBottom: Jack.shadowBig,
    borderRadius: Jack.radiusBig + 4, borderWidth: Jack.border,
    backgroundColor: Colors.paper,
    padding: 26, justifyContent: 'center',
    overflow: 'hidden',
  },
  modeStickerOuter: { position: 'absolute', top: 20, left: 20 },
  modeStickerShadow: {
    position: 'absolute', top: 3, left: 0, right: 0, bottom: 0,
    borderRadius: 10, backgroundColor: Colors.ink,
  },
  modeSticker: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 11, paddingVertical: 6,
    borderRadius: 10, borderWidth: 2.5, borderColor: Colors.ink,
    marginBottom: 3,
  },
  modeStickerText: {
    fontFamily: Type.display, fontSize: 12, letterSpacing: 1, color: Colors.ink,
    textTransform: 'uppercase',
  },
  challengeText: {
    fontFamily: Type.display, fontSize: 27, lineHeight: 36,
    color: Colors.ink,
  },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22 },
  actionDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  actionText: {
    fontFamily: Type.bodyBold, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase',
    color: '#5A5370',
  },
  watermark: { position: 'absolute', bottom: -40, right: -40 },

  actions: { paddingTop: 20, gap: 6 },
  secondaryRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 6,
  },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  secondaryBtnDisabled: { opacity: 0.5 },
  secondaryText: { fontFamily: Type.bodyBold, fontSize: 14, color: Colors.onSurfaceVariant },
  secondaryTextDisabled: { color: Colors.outlineVariant },
  secondaryDivider: { width: 2, height: 16, backgroundColor: Colors.outlineVariant, borderRadius: 1 },

  modalOverlay: {
    flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10,6,32,0.72)',
  },
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
