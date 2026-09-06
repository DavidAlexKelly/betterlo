// src/screens/DealerGameScreen.tsx
// The Screw the Dealer! turn loop.
//
// Phases come straight from the engine: guess1 → guess2 → reveal. Every rule
// lives in src/data/dealerGame.ts; this screen owns layout, animation and
// navigation only.
//
// The dealer's damage counter is deliberately prominent — watching it climb is
// the entire point of the game.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Modal, BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { RootStackParamList } from '../navigation/types';
import { Colors, Jack, Type } from '../styles/theme';
import { STREAK_TO_PASS, cardName, rankLabel } from '../data/dealerData';
import { useGame } from '../components/GameContext';
import { useDealer } from '../components/DealerContext';
import { useDealerEngine } from '../hooks/useDealerEngine';
import { Ads } from '../monetization/ads';
import { JackButton } from '../components/jack';
import PlayingCard from '../components/PlayingCard';
import RankPad from '../components/RankPad';
import DealtGrid from '../components/DealtGrid';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'DealerGame'>;
};

/** One interstitial mid-game, after this many cards. */
const MIDPOINT_CARDS = 15;

export default function DealerGameScreen({ navigation }: Props) {
  const { state: gameState } = useGame();
  const { settings } = useDealer();

  const engine = useDealerEngine({
    players: gameState.players,
    drinkCap: settings.drinkCap,
    endCondition: settings.endCondition,
    mercyTurns: settings.mercyTurns,
    penaltyCtx: { bonus: gameState.sipBonus },
  });

  const [showQuit, setShowQuit] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const midpointAdShown = useRef(false);
  const endHandled = useRef(false);

  const fade = useRef(new Animated.Value(1)).current;
  const fadeIn = useCallback(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [fade]);

  // ── Android hardware back → quit sheet ──────────────────────
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      setShowQuit(true);
      return true;
    });
    return () => handler.remove();
  }, []);

  // ── Game over → snapshot, ad, results ───────────────────────
  // Driven off engine state rather than the Continue handler, because the
  // engine can end the game from several places (deck out, everyone dealt,
  // manual quit) and all of them should land here.
  useEffect(() => {
    if (!engine.isOver || endHandled.current) return;
    endHandled.current = true;
    engine.finishGame();
    Ads.show(() => navigation.replace('DealerOver'));
  }, [engine.isOver, engine, navigation]);

  const { phase, dealer, guesser, outcome, hint, firstGuess } = engine;

  const handleGuess = (rank: number) => {
    engine.guess(rank);
    fadeIn();
  };

  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!midpointAdShown.current && engine.state.cardsPlayed >= MIDPOINT_CARDS) {
      midpointAdShown.current = true;
      Ads.show(() => { engine.nextTurn(); fadeIn(); });
      return;
    }
    engine.nextTurn();
    fadeIn();
  };

  // A misconfigured game (no players) — fail to the menu rather than crash.
  if (!dealer || !guesser) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Not enough players for this game.</Text>
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

  const guessing = phase === 'guess1' || phase === 'guess2';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.inner}>
        {/* Header: quit · dealer + damage · deck left */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => setShowQuit(true)}
            style={styles.quitBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={20} color={Colors.onSurfaceVariant} />
          </TouchableOpacity>

          <View style={styles.dealerBox}>
            <Text style={styles.dealerLabel}>DEALER</Text>
            <Text style={styles.dealerName} numberOfLines={1}>
              {dealer.name.toUpperCase()}
            </Text>
            <View style={styles.streakRow}>
              {Array.from({ length: STREAK_TO_PASS }, (_, i) => (
                <View
                  key={i}
                  style={[
                    styles.streakPip,
                    i < engine.streak && styles.streakPipOn,
                  ]}
                />
              ))}
            </View>
          </View>

          <View style={styles.damageBox}>
            <Text style={styles.damageValue}>{engine.dealerDamage}</Text>
            <Text style={styles.damageLabel}>DRINKS</Text>
          </View>
        </View>

        {engine.justReshuffled && (
          <View style={styles.banner}>
            <Ionicons name="refresh" size={13} color={Colors.ink} />
            <Text style={styles.bannerText}>NEW DECK — TABLE CLEARED</Text>
          </View>
        )}

        {/* Card + guesser */}
        <View style={styles.stage}>
          <Text style={styles.guesserLine}>
            {guessing
              ? `${guesser.name.toUpperCase()} — WHAT'S THE CARD?`
              : `${outcome?.guesser.name.toUpperCase() ?? ''}`}
          </Text>

          <Animated.View style={{ opacity: fade }}>
            <PlayingCard
              card={outcome?.card ?? null}
              size="large"
              faceDown={guessing}
            />
          </Animated.View>

          {phase === 'guess2' && hint && firstGuess != null && (
            <View style={[styles.hintPill, { backgroundColor: hint === 'higher' ? '#B6F44A' : '#FF7A3C' }]}>
              <Ionicons
                name={hint === 'higher' ? 'arrow-up' : 'arrow-down'}
                size={16}
                color={Colors.ink}
              />
              <Text style={styles.hintText}>
                {hint === 'higher' ? 'HIGHER' : 'LOWER'} THAN {rankLabel(firstGuess)}
              </Text>
            </View>
          )}

          {phase === 'reveal' && outcome && (
            <View style={styles.resultBlock}>
              <Text style={styles.cardNameText}>{cardName(outcome.card)}</Text>

              {outcome.correctOn != null ? (
                <>
                  <Text style={styles.verdictGood}>
                    {outcome.correctOn === 1 ? 'FIRST GUESS!' : 'GOT IT!'}
                  </Text>
                  <Text style={styles.drinkLine}>
                    {outcome.dealer.name} drinks {outcome.dealerDrinks}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.verdictBad}>MISSED</Text>
                  <Text style={styles.drinkLine}>
                    {outcome.guesser.name} drinks {outcome.guesserDrinks}
                  </Text>
                  {outcome.capped && (
                    <Text style={styles.cappedNote}>
                      capped from {outcome.rawDifference}
                    </Text>
                  )}
                </>
              )}

              {outcome.passedDeck && (
                <View style={styles.passPill}>
                  <Ionicons name="swap-horizontal" size={14} color={Colors.ink} />
                  <Text style={styles.passText}>
                    {outcome.passReason === 'mercy' ? 'MERCY — ' : ''}DECK PASSES ON
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Pad or continue */}
        <View style={styles.controls}>
          {guessing ? (
            <RankPad
              onPick={handleGuess}
              allowedRanks={engine.allowedRanks}
            />
          ) : (
            <JackButton
              label={outcome?.passedDeck ? 'Pass the Deck' : 'Next Card'}
              icon="arrow-forward"
              onPress={handleContinue}
            />
          )}
        </View>

        {/* Table strip */}
        <TouchableOpacity
          style={styles.tableBar}
          activeOpacity={0.8}
          onPress={() => setShowTable(true)}
        >
          <View style={styles.tableHeader}>
            <Text style={styles.tableLabel}>
              ON THE TABLE · {engine.revealed.length}
            </Text>
            <Text style={styles.tableLabel}>
              {engine.deckRemaining} LEFT
            </Text>
          </View>
          <DealtGrid cards={engine.revealed} compact />
        </TouchableOpacity>
      </View>

      {/* Full table */}
      <Modal
        visible={showTable}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTable(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.tableSheet}>
            <View style={styles.tableHeader}>
              <Text style={styles.modalTitle}>On the table</Text>
              <TouchableOpacity onPress={() => setShowTable(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={Colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              {engine.deckRemaining} card{engine.deckRemaining === 1 ? '' : 's'} still in the deck.
            </Text>
            <View style={styles.tableGridWrap}>
              <DealtGrid cards={engine.revealed} />
            </View>
          </View>
        </View>
      </Modal>

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
              You can stop here and see the damage, or bail out entirely.
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
                  label="See Results"
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
  inner: { flex: 1, paddingHorizontal: 20, paddingBottom: 10 },
  centered: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 40,
  },
  emptyText: {
    fontFamily: Type.body, fontSize: 14, color: Colors.onSurfaceVariant, textAlign: 'center',
  },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, gap: 10,
  },
  quitBtn: {
    width: 38, height: 38, borderRadius: 12,
    borderWidth: 2, borderColor: Colors.outlineVariant,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surfaceContainerLow,
  },
  dealerBox: { flex: 1, alignItems: 'center' },
  dealerLabel: {
    fontFamily: Type.display, fontSize: 9, letterSpacing: 2, color: Colors.outline,
  },
  dealerName: {
    fontFamily: Type.display, fontSize: 16, color: Colors.onSurface, letterSpacing: 0.5,
  },
  streakRow: { flexDirection: 'row', gap: 4, marginTop: 4 },
  streakPip: {
    width: 9, height: 9, borderRadius: 5,
    borderWidth: 1.5, borderColor: Colors.outlineVariant,
  },
  streakPipOn: { backgroundColor: Colors.primary, borderColor: Colors.ink },
  damageBox: {
    minWidth: 52, alignItems: 'center',
    borderRadius: 12, borderWidth: 2.5, borderColor: Colors.ink,
    backgroundColor: Colors.secondary,
    paddingVertical: 4, paddingHorizontal: 8,
  },
  damageValue: { fontFamily: Type.display, fontSize: 20, color: '#fff' },
  damageLabel: {
    fontFamily: Type.display, fontSize: 8, letterSpacing: 1.5, color: '#fff', opacity: 0.85,
  },

  banner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: Colors.tertiary,
    borderRadius: 10, borderWidth: 2.5, borderColor: Colors.ink,
    paddingVertical: 6, marginBottom: 8,
  },
  bannerText: {
    fontFamily: Type.display, fontSize: 10, letterSpacing: 1.5, color: Colors.ink,
  },

  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  guesserLine: {
    fontFamily: Type.display, fontSize: 13, letterSpacing: 1.5,
    color: Colors.onSurfaceVariant, textAlign: 'center',
  },
  hintPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 12, borderWidth: 2.5, borderColor: Colors.ink,
  },
  hintText: {
    fontFamily: Type.display, fontSize: 13, letterSpacing: 1, color: Colors.ink,
  },

  resultBlock: { alignItems: 'center', gap: 4 },
  cardNameText: {
    fontFamily: Type.bodyMedium, fontSize: 13, color: Colors.onSurfaceVariant,
  },
  verdictGood: { fontFamily: Type.display, fontSize: 26, color: '#B6F44A' },
  verdictBad: { fontFamily: Type.display, fontSize: 26, color: Colors.error },
  drinkLine: { fontFamily: Type.display, fontSize: 17, color: Colors.onSurface },
  cappedNote: {
    fontFamily: Type.body, fontSize: 11, color: Colors.outline,
  },
  passPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 10, borderWidth: 2.5, borderColor: Colors.ink,
  },
  passText: {
    fontFamily: Type.display, fontSize: 10, letterSpacing: 1.2, color: Colors.ink,
  },

  controls: { paddingTop: 8, paddingBottom: 12, minHeight: 120, justifyContent: 'center' },

  tableBar: {
    borderTopWidth: 2.5, borderTopColor: Colors.outlineVariant,
    paddingTop: 8,
  },
  tableHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 6,
  },
  tableLabel: {
    fontFamily: Type.display, fontSize: 9, letterSpacing: 1.5, color: Colors.outline,
  },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10,6,32,0.72)' },
  modalSheet: {
    backgroundColor: Colors.surfaceContainerLow,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40,
    borderTopWidth: Jack.border, borderTopColor: Colors.ink,
  },
  tableSheet: {
    maxHeight: '75%',
    backgroundColor: Colors.surfaceContainerLow,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 20, paddingBottom: 32,
    borderTopWidth: Jack.border, borderTopColor: Colors.ink,
  },
  tableGridWrap: { marginTop: 12, flexShrink: 1 },
  modalTitle: { fontFamily: Type.display, fontSize: 20, color: Colors.onSurface },
  modalSubtitle: {
    fontFamily: Type.body, fontSize: 13, color: Colors.onSurfaceVariant,
    marginTop: 6, marginBottom: 16,
  },
  modalBtns: { flexDirection: 'row', gap: 12 },
});
