// src/screens/TraitorsGameScreen.tsx
// Word Traitors! — the whole round loop on one screen.
//
// The reveal pass is the part that has to be exactly right:
//
//   PASS TO ADA      (nothing secret on screen — safe to hand over)
//     tap
//   ADA'S ROLE       (the word, or "you're a traitor")
//     tap
//   PASS TO BEA      ...
//     ...
//   ADA, YOU START   (once everyone has looked)
//
// Because the tap after a role always lands on a neutral hand-off, a role is
// never on screen while the phone is changing hands.
//
// All rules live in src/data/traitorsGame.ts. This screen is layout only.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, TouchableOpacity, Animated, Modal, BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { RootStackParamList } from '../navigation/types';
import { Colors, Jack, Type } from '../styles/theme';
import { suggestedTraitors } from '../data/traitorsData';
import { useGame } from '../components/GameContext';
import { useTraitors } from '../components/TraitorsContext';
import { useTraitorsEngine } from '../hooks/useTraitorsEngine';
import { Ads } from '../monetization/ads';
import { JackButton } from '../components/jack';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'TraitorsGame'>;
};

/** One interstitial mid-session, after this many completed rounds. */
const MIDPOINT_ROUNDS = 3;

export default function TraitorsGameScreen({ navigation }: Props) {
  const { state: gameState } = useGame();
  const { settings } = useTraitors();

  const players = gameState.players;
  const traitorCount = settings.traitorCount === 'auto'
    ? suggestedTraitors(players.length)
    : settings.traitorCount;

  const engine = useTraitorsEngine({
    players,
    traitorCount,
    hintsEnabled: settings.hintsEnabled,
    totalRounds: settings.totalRounds,
  });

  const [showQuit, setShowQuit] = useState(false);
  const midpointAdShown = useRef(false);
  const endHandled = useRef(false);

  const fade = useRef(new Animated.Value(1)).current;
  const fadeIn = useCallback(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [fade]);

  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      setShowQuit(true);
      return true;
    });
    return () => handler.remove();
  }, []);

  useEffect(() => {
    if (!engine.isOver || endHandled.current) return;
    endHandled.current = true;
    engine.finishGame();
    Ads.show(() => navigation.replace('TraitorsOver'));
  }, [engine.isOver, engine, navigation]);

  const { phase } = engine;

  const handleTap = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    engine.tapReveal();
    fadeIn();
  };

  const handleNextRound = () => {
    if (!midpointAdShown.current && engine.round >= MIDPOINT_ROUNDS) {
      midpointAdShown.current = true;
      Ads.show(() => { engine.advanceRound(); fadeIn(); });
      return;
    }
    engine.advanceRound();
    fadeIn();
  };

  if (players.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <Text style={styles.dim}>No players in this game.</Text>
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

  // ── Full-screen reveal phases (no chrome — the tap target is everything) ──
  if (phase === 'handoff' || phase === 'role') {
    const target = engine.revealTarget;
    const traitor = engine.revealIsTraitor;

    return (
      <Pressable style={styles.container} onPress={handleTap}>
        <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
          <Animated.View style={[styles.centered, { opacity: fade }]}>
            {phase === 'handoff' ? (
              <>
                <Text style={styles.eyebrow}>PASS THE PHONE TO</Text>
                <Text style={styles.bigName}>{target?.name.toUpperCase()}</Text>
                <Text style={styles.tapHint}>Tap when you&apos;ve got it</Text>
              </>
            ) : traitor ? (
              <>
                <View style={styles.traitorPanel}>
                  <Ionicons name="eye-off" size={34} color="#fff" />
                  <Text style={styles.traitorTitle}>YOU&apos;RE A TRAITOR</Text>
                  {settings.hintsEnabled ? (
                    <>
                      <Text style={styles.traitorSub}>Your only clue</Text>
                      <Text style={styles.hintWord}>{engine.word.hint}</Text>
                    </>
                  ) : (
                    <Text style={styles.traitorSub}>No hint. Bluff it.</Text>
                  )}
                </View>
                <Text style={styles.tapHint}>Tap to pass on</Text>
              </>
            ) : (
              <>
                <Text style={styles.eyebrow}>THE WORD IS</Text>
                <View style={styles.wordPanel}>
                  <Text style={styles.wordText}>{engine.word.word}</Text>
                </View>
                <Text style={styles.tapHint}>Tap to pass on</Text>
              </>
            )}
          </Animated.View>
        </SafeAreaView>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.inner}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => setShowQuit(true)}
            style={styles.quitBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={20} color={Colors.onSurfaceVariant} />
          </TouchableOpacity>
          <Text style={styles.roundLabel}>
            ROUND {engine.round}
            {settings.totalRounds ? ` / ${settings.totalRounds}` : ''}
          </Text>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreText}>
              {engine.score.innocentWins}–{engine.score.traitorWins}
            </Text>
          </View>
        </View>

        {/* ── STARTER ── */}
        {phase === 'starter' && (
          <Animated.View style={[styles.centered, { opacity: fade }]}>
            <Text style={styles.eyebrow}>EVERYONE&apos;S SEEN THEIR ROLE</Text>
            <Text style={styles.bigName}>
              {engine.firstSpeaker?.name.toUpperCase()}
            </Text>
            <Text style={styles.starterLine}>you start</Text>
            <JackButton
              label="Begin Clues"
              icon="arrow-forward"
              onPress={() => { engine.beginClues(); fadeIn(); }}
              style={styles.wideBtn}
            />
          </Animated.View>
        )}

        {/* ── CLUES ── */}
        {phase === 'clues' && (
          <Animated.View style={[styles.flex, { opacity: fade }]}>
            <Text style={styles.sectionLabel}>SPEAKING ORDER</Text>
            <View style={styles.orderList}>
              {engine.order.map((playerIndex, i) => {
                const p = players[playerIndex];
                if (!p) return null;
                return (
                  <View key={p.id} style={[styles.orderRow, { borderColor: p.color }]}>
                    <Text style={styles.orderNumber}>{i + 1}</Text>
                    <Text style={styles.orderName}>{p.name.toUpperCase()}</Text>
                  </View>
                );
              })}
            </View>
            <Text style={styles.dim}>
              One clue each, no saying the word. Then argue about it.
            </Text>
            <View style={styles.bottomBtn}>
              <JackButton
                label="Go to the Vote"
                icon="hand-left"
                onPress={() => { engine.beginVote(); fadeIn(); }}
              />
            </View>
          </Animated.View>
        )}

        {/* ── ACCUSE ── */}
        {phase === 'accuse' && (
          <Animated.View style={[styles.flex, { opacity: fade }]}>
            <Text style={styles.sectionLabel}>
              WHO&apos;S LYING? PICK {engine.traitorIndices.length}
            </Text>
            <View style={styles.playerGrid}>
              {players.map((p, i) => {
                const picked = engine.accused.includes(i);
                return (
                  <TouchableOpacity
                    key={p.id}
                    activeOpacity={0.85}
                    onPress={() => { Haptics.selectionAsync(); engine.accuse(i); }}
                    style={[
                      styles.playerChip,
                      picked
                        ? { backgroundColor: Colors.secondary, borderColor: Colors.ink }
                        : { borderColor: p.color },
                    ]}
                  >
                    <Text style={[styles.playerChipText, picked && { color: '#fff' }]}>
                      {p.name.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.bottomBtn}>
              <JackButton
                label={
                  engine.accusationComplete
                    ? 'Reveal Roles'
                    : `Pick ${engine.traitorIndices.length - engine.accused.length} more`
                }
                icon={engine.accusationComplete ? 'eye' : undefined}
                disabled={!engine.accusationComplete}
                onPress={() => { engine.reveal(); fadeIn(); }}
              />
            </View>
          </Animated.View>
        )}

        {/* ── RESULT ── */}
        {phase === 'result' && (
          <Animated.View style={[styles.flex, { opacity: fade }]}>
            <View
              style={[
                styles.verdictPanel,
                { backgroundColor: engine.innocentsWin ? '#B6F44A' : Colors.secondary },
              ]}
            >
              <Text style={[styles.verdictText, { color: engine.innocentsWin ? Colors.ink : '#fff' }]}>
                {engine.innocentsWin ? 'TRAITORS CAUGHT' : 'TRAITORS WIN'}
              </Text>
              <Text style={[styles.verdictSub, { color: engine.innocentsWin ? Colors.ink : '#fff' }]}>
                The word was {engine.word.word}
              </Text>
            </View>

            <Text style={styles.sectionLabel}>THE ROLES</Text>
            <View style={styles.rolesList}>
              {players.map((p, i) => {
                const wasTraitor = engine.traitorIndices.includes(i);
                const wasAccused = engine.accused.includes(i);
                return (
                  <View
                    key={p.id}
                    style={[
                      styles.roleRow,
                      { borderColor: wasTraitor ? Colors.secondary : Colors.outlineVariant },
                    ]}
                  >
                    <Text style={styles.roleName}>{p.name.toUpperCase()}</Text>
                    <View style={styles.roleTags}>
                      {wasAccused && (
                        <Text style={styles.accusedTag}>ACCUSED</Text>
                      )}
                      <Text style={[
                        styles.roleTag,
                        wasTraitor ? styles.roleTagTraitor : styles.roleTagInnocent,
                      ]}>
                        {wasTraitor ? 'TRAITOR' : 'INNOCENT'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>

            <View style={styles.bottomBtn}>
              <JackButton
                label={
                  settings.totalRounds != null && engine.round >= settings.totalRounds
                    ? 'See Final Score'
                    : 'Next Round'
                }
                icon="arrow-forward"
                onPress={handleNextRound}
              />
            </View>
          </Animated.View>
        )}
      </View>

      {/* Quit */}
      <Modal
        visible={showQuit}
        transparent
        animationType="slide"
        onRequestClose={() => setShowQuit(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>End the game?</Text>
            <Text style={styles.modalSubtitle}>
              Stop here and see the score, or bail out entirely.
            </Text>
            <View style={styles.modalBtns}>
              <View style={{ flex: 1 }}>
                <JackButton
                  label="Keep Playing"
                  size="medium"
                  onPress={() => setShowQuit(false)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <JackButton
                  label="See Score"
                  size="medium"
                  variant="ghost"
                  onPress={() => { setShowQuit(false); engine.quit(); }}
                />
              </View>
            </View>
            <JackButton
              label="Quit to Menu"
              size="small"
              variant="ghost"
              onPress={() => { setShowQuit(false); navigation.replace('Play'); }}
              style={{ marginTop: 12 }}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  inner: { flex: 1, paddingHorizontal: 20, paddingBottom: 12 },
  centered: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 14, paddingHorizontal: 28,
  },
  dim: {
    fontFamily: Type.body, fontSize: 13, lineHeight: 19,
    color: Colors.onSurfaceVariant, textAlign: 'center',
  },

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
  roundLabel: {
    fontFamily: Type.display, fontSize: 12, letterSpacing: 2,
    color: Colors.onSurfaceVariant,
  },
  scoreBox: {
    borderRadius: 10, borderWidth: 2.5, borderColor: Colors.ink,
    backgroundColor: Colors.surfaceContainerHigh,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  scoreText: { fontFamily: Type.display, fontSize: 13, color: Colors.onSurface },

  eyebrow: {
    fontFamily: Type.display, fontSize: 12, letterSpacing: 2.5,
    color: Colors.onSurfaceVariant, textAlign: 'center',
  },
  bigName: {
    fontFamily: Type.display, fontSize: 42, lineHeight: 46,
    color: Colors.primary, textAlign: 'center',
  },
  starterLine: {
    fontFamily: Type.displayItalic, fontSize: 20, color: Colors.onSurface,
  },
  tapHint: {
    fontFamily: Type.body, fontSize: 13, color: Colors.outline, marginTop: 8,
  },
  wideBtn: { alignSelf: 'stretch', marginTop: 18 },

  wordPanel: {
    backgroundColor: Colors.paper,
    borderRadius: Jack.radiusBig, borderWidth: Jack.border, borderColor: Colors.ink,
    paddingVertical: 30, paddingHorizontal: 34,
  },
  wordText: {
    fontFamily: Type.display, fontSize: 38, color: Colors.ink, textAlign: 'center',
  },
  traitorPanel: {
    backgroundColor: Colors.secondary,
    borderRadius: Jack.radiusBig, borderWidth: Jack.border, borderColor: Colors.ink,
    paddingVertical: 28, paddingHorizontal: 30,
    alignItems: 'center', gap: 6,
  },
  traitorTitle: {
    fontFamily: Type.display, fontSize: 26, color: '#fff', textAlign: 'center',
  },
  traitorSub: {
    fontFamily: Type.body, fontSize: 13, color: '#fff', opacity: 0.9,
  },
  hintWord: {
    fontFamily: Type.display, fontSize: 30, color: '#fff', marginTop: 2,
  },

  sectionLabel: {
    fontFamily: Type.display, fontSize: 11, letterSpacing: 2,
    color: Colors.outline, marginTop: 12, marginBottom: 12,
  },

  orderList: { gap: 8 },
  orderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: Jack.radius, borderWidth: 2.5,
    backgroundColor: Colors.surfaceContainerLow,
    paddingVertical: 10, paddingHorizontal: 14,
  },
  orderNumber: {
    fontFamily: Type.display, fontSize: 14, color: Colors.outline, width: 18,
  },
  orderName: { fontFamily: Type.display, fontSize: 15, color: Colors.onSurface },

  playerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  playerChip: {
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: Jack.radius, borderWidth: 2.5,
    backgroundColor: Colors.surfaceContainerLow,
  },
  playerChipText: {
    fontFamily: Type.display, fontSize: 14, color: Colors.onSurface,
  },

  verdictPanel: {
    borderRadius: Jack.radiusBig, borderWidth: Jack.border, borderColor: Colors.ink,
    paddingVertical: 20, paddingHorizontal: 18, alignItems: 'center', gap: 4,
  },
  verdictText: { fontFamily: Type.display, fontSize: 26, textAlign: 'center' },
  verdictSub: { fontFamily: Type.body, fontSize: 14, textAlign: 'center' },

  rolesList: { gap: 8 },
  roleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: Jack.radius, borderWidth: 2.5,
    backgroundColor: Colors.surfaceContainerLow,
    paddingVertical: 10, paddingHorizontal: 14,
  },
  roleName: { fontFamily: Type.display, fontSize: 14, color: Colors.onSurface },
  roleTags: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accusedTag: {
    fontFamily: Type.display, fontSize: 9, letterSpacing: 1, color: Colors.outline,
  },
  roleTag: {
    fontFamily: Type.display, fontSize: 10, letterSpacing: 1,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
    borderWidth: 2, borderColor: Colors.ink, overflow: 'hidden',
  },
  roleTagTraitor: { backgroundColor: Colors.secondary, color: '#fff' },
  roleTagInnocent: { backgroundColor: Colors.surfaceContainerHighest, color: Colors.onSurface },

  bottomBtn: { marginTop: 'auto', paddingTop: 16 },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10,6,32,0.72)' },
  modalSheet: {
    backgroundColor: Colors.surfaceContainerLow,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40,
    borderTopWidth: Jack.border, borderTopColor: Colors.ink,
  },
  modalTitle: { fontFamily: Type.display, fontSize: 20, color: Colors.onSurface },
  modalSubtitle: {
    fontFamily: Type.body, fontSize: 13, color: Colors.onSurfaceVariant,
    marginTop: 6, marginBottom: 16,
  },
  modalBtns: { flexDirection: 'row', gap: 12 },
});
