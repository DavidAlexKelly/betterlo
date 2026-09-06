// src/screens/PlayersScreen.tsx
// The lobby. Keyboard fix: tapping anywhere outside the input now dismisses
// the keyboard (TouchableWithoutFeedback wrapper + dismiss-on-drag on the
// scroll view), so you can't get stuck typing. All logic unchanged.

import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Animated, Image, Keyboard, TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { RootStackParamList } from '../navigation/types';
import { Colors, Jack, Type } from '../styles/theme';
import { MODES } from '../data/gameData';
import { useGame } from '../components/GameContext';
import Logo from '../components/Logo';
import { JackButton, JackIconButton } from '../components/jack';

// The lobby is shared by both game modes, so route.params.next says where to
// go when the group is ready. Truth or Dare arrives here from DeckSelect,
// Trivia from TriviaSetup.
type Props = NativeStackScreenProps<RootStackParamList, 'Players'>;

const BONUS_STEPS = [0, 1, 2, 3] as const;
const BONUS_DISPLAY = ['Standard', '+1 sip', '+2 sips', '+3 sips'] as const;

export default function PlayersScreen({ navigation, route }: Props) {
  const next = route.params?.next ?? 'Game';
  const isTruthOrDare = next === 'Game';
  // Screw the Dealer needs a dealer plus enough opponents for "beat 3 in a
  // row" to mean anything; with two players the dealer faces the same person
  // three times running.
  // Word Traitors needs enough bodies for the traitor to hide among; Screw the
  // Dealer needs a dealer plus enough opponents for "beat 3 in a row" to mean
  // anything. Both are 3.
  const minPlayers = next === 'DealerGame' || next === 'TraitorsGame' ? 3 : 2;
  const { state, addPlayer, removePlayer, updatePlayerPhoto, startGame, toggleMode, setSipBonus } = useGame();
  const [inputValue, setInputValue] = useState('');
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleAdd = () => {
    if (!inputValue.trim()) { shake(); return; }
    addPlayer(inputValue);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInputValue('');
  };

  const handleRemove = (id: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    removePlayer(id);
  };

  const handleTakePhoto = async (playerId: number) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      updatePlayerPhoto(playerId, result.assets[0].uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleStart = () => {
    if (state.players.length < minPlayers) return;
    // startGame() seeds Truth-or-Dare round state (currentRound/totalRounds).
    // Trivia tracks its own progress in useTriviaEngine, so skip it there.
    if (isTruthOrDare) startGame();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    navigation.navigate(next);
  };

  const handleBonusChange = (value: 0 | 1 | 2 | 3) => {
    if (value === state.sipBonus) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSipBonus(value);
  };

  const canStart = state.players.length >= minPlayers;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={{ flex: 1 }}>
          <View style={styles.header}>
            <JackIconButton icon="arrow-back" onPress={() => navigation.goBack()} size={42} />
            <Logo />
            <View style={{ width: 42 }} />
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View style={styles.pageHeader}>
              <Text style={styles.pageTitle}>WHO'S{'\n'}<Text style={styles.pageTitleAccent}>IN?</Text></Text>
              <Text style={styles.pageSubtitle}>Add everyone at the table.</Text>
            </View>

            <Animated.View style={[styles.inputRow, { transform: [{ translateX: shakeAnim }] }]}>
              <View style={styles.inputOuter}>
                <View style={styles.inputShadow} />
                <TextInput
                  style={styles.input}
                  placeholder="Type a name..."
                  placeholderTextColor={Colors.outline}
                  value={inputValue}
                  onChangeText={setInputValue}
                  onSubmitEditing={handleAdd}
                  returnKeyType="done"
                  maxLength={20}
                  autoCapitalize="words"
                />
              </View>
              <JackIconButton
                icon="add"
                onPress={handleAdd}
                color={Colors.primary}
                iconColor={Colors.ink}
                size={54}
              />
            </Animated.View>

            <View style={styles.listHeader}>
              <Text style={styles.listLabel}>AT THE TABLE</Text>
              <Text style={styles.playerCount}>{String(state.players.length).padStart(2, '0')}</Text>
            </View>

            {state.players.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={40} color={Colors.outlineVariant} />
                <Text style={styles.emptyText}>{`Add at least ${minPlayers} players to start.`}</Text>
              </View>
            ) : (
              <View style={styles.playerList}>
                {state.players.map((player, i) => (
                  <View
                    key={player.id}
                    style={[
                      styles.ticketOuter,
                      { transform: [{ rotate: i % 2 === 0 ? '-0.5deg' : '0.5deg' }] },
                    ]}
                  >
                    <View style={styles.ticketShadow} />
                    <View style={[styles.ticketFace, { borderColor: player.color }]}>
                      <View style={styles.playerLeft}>
                        <TouchableOpacity onPress={() => handleTakePhoto(player.id)} activeOpacity={0.8} style={styles.orbWrapper}>
                          <View style={[styles.playerOrb, { borderColor: player.color }]}>
                            {player.photo ? (
                              <Image source={{ uri: player.photo }} style={styles.playerPhoto} />
                            ) : (
                              <Text style={[styles.playerInitial, { color: player.color }]}>
                                {player.name.charAt(0).toUpperCase()}
                              </Text>
                            )}
                          </View>
                          <View style={[styles.cameraBadge, { backgroundColor: player.color }]}>
                            <Ionicons name="camera" size={10} color={Colors.ink} />
                          </View>
                        </TouchableOpacity>
                        <View>
                          <Text style={styles.playerName}>{player.name.toUpperCase()}</Text>
                          <Text style={[styles.playerRank, { color: player.color }]}>{player.rank}</Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleRemove(player.id)}
                        style={styles.removeBtn}
                        activeOpacity={0.7}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="close" size={20} color={Colors.outline} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {canStart && (
              <>
                {/* Deck chips — Truth or Dare only. Trivia chooses its
                    categories back in TriviaSetupScreen. */}
                {isTruthOrDare && (
                <View style={styles.section}>
                  <Text style={styles.sectionEyebrow}>ACTIVE DECKS</Text>
                  <View style={styles.deckChipsRow}>
                    {MODES.map(mode => {
                      const active = state.selectedModes.includes(mode.id);
                      const isLast = state.selectedModes.length === 1 && active;
                      return (
                        <TouchableOpacity
                          key={mode.id}
                          onPress={() => { if (!isLast) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleMode(mode.id); } }}
                          activeOpacity={0.8}
                          style={[
                            styles.deckChip,
                            active
                              ? { backgroundColor: mode.color, borderColor: Colors.ink }
                              : { borderColor: Colors.outlineVariant },
                          ]}
                        >
                          <Text style={[styles.deckChipText, active && { color: Colors.ink }]}>{mode.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
                )}

                {/* Sip bonus stepper */}
                <View style={styles.section}>
                  <Text style={styles.sectionEyebrow}>SIP INTENSITY</Text>
                  <View style={styles.bonusRow}>
                    {BONUS_STEPS.map(step => {
                      const active = state.sipBonus === step;
                      return (
                        <TouchableOpacity
                          key={step}
                          onPress={() => handleBonusChange(step)}
                          activeOpacity={0.8}
                          style={[styles.bonusPill, active && styles.bonusPillActive]}
                        >
                          <Text style={[styles.bonusPillText, active && styles.bonusPillTextActive]}>
                            {BONUS_DISPLAY[step]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <JackButton
              label={canStart ? 'Start Game' : `Add ${minPlayers}+ Players`}
              icon={canStart ? 'play' : undefined}
              onPress={handleStart}
              disabled={!canStart}
            />
          </View>
        </View>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 150 },
  pageHeader: { marginTop: 4, marginBottom: 22 },
  pageTitle: { fontFamily: Type.display, fontSize: 40, lineHeight: 43, color: Colors.onSurface },
  pageTitleAccent: { color: Colors.primary },
  pageSubtitle: { fontFamily: Type.body, fontSize: 15, color: Colors.onSurfaceVariant, marginTop: 8 },

  inputRow: { flexDirection: 'row', gap: 12, marginBottom: 26, alignItems: 'flex-start' },
  inputOuter: { flex: 1, position: 'relative' },
  inputShadow: {
    position: 'absolute', top: 4, left: 0, right: 0, bottom: 0,
    borderRadius: Jack.radius, backgroundColor: Colors.ink,
  },
  input: {
    height: 54, borderRadius: Jack.radius, paddingHorizontal: 18, marginBottom: 4,
    backgroundColor: Colors.surfaceContainer, color: Colors.onSurface,
    fontFamily: Type.bodyMedium, fontSize: 15,
    borderWidth: Jack.border, borderColor: Colors.ink,
  },

  listHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14,
  },
  listLabel: { fontFamily: Type.display, fontSize: 12, letterSpacing: 2, color: Colors.outline },
  playerCount: { fontFamily: Type.display, fontSize: 16, color: Colors.primary },

  emptyState: { alignItems: 'center', gap: 10, paddingVertical: 40 },
  emptyText: { fontFamily: Type.body, fontSize: 14, color: Colors.onSurfaceVariant },

  playerList: { gap: 12 },
  ticketOuter: { position: 'relative' },
  ticketShadow: {
    position: 'absolute', top: 4, left: 0, right: 0, bottom: 0,
    borderRadius: Jack.radius, backgroundColor: Colors.ink,
  },
  ticketFace: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: Jack.radius, borderWidth: Jack.border,
    backgroundColor: Colors.surfaceContainerLow,
    paddingVertical: 10, paddingHorizontal: 12, marginBottom: 4,
  },
  playerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  orbWrapper: { position: 'relative' },
  playerOrb: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 2.5,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  playerPhoto: { width: '100%', height: '100%' },
  playerInitial: { fontFamily: Type.display, fontSize: 17 },
  cameraBadge: {
    position: 'absolute', bottom: -2, right: -4,
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 1.5, borderColor: Colors.ink,
    alignItems: 'center', justifyContent: 'center',
  },
  playerName: { fontFamily: Type.display, fontSize: 15, color: Colors.onSurface, letterSpacing: 0.5 },
  playerRank: { fontFamily: Type.bodyBold, fontSize: 11, marginTop: 2 },
  removeBtn: { padding: 6 },

  section: { marginTop: 28 },
  sectionEyebrow: { fontFamily: Type.display, fontSize: 11, letterSpacing: 2, color: Colors.outline, marginBottom: 12 },
  deckChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  deckChip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12,
    borderWidth: 2.5, backgroundColor: Colors.surfaceContainerLow,
  },
  deckChipText: { fontFamily: Type.display, fontSize: 11, letterSpacing: 0.5, color: Colors.onSurfaceVariant },

  bonusRow: { flexDirection: 'row', gap: 8 },
  bonusPill: {
    flex: 1, paddingVertical: 11, borderRadius: 12, alignItems: 'center',
    borderWidth: 2.5, borderColor: Colors.outlineVariant, backgroundColor: Colors.surfaceContainerLow,
  },
  bonusPillActive: { backgroundColor: Colors.secondary, borderColor: Colors.ink },
  bonusPillText: { fontFamily: Type.display, fontSize: 11, color: Colors.onSurfaceVariant },
  bonusPillTextActive: { color: '#fff' },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 34,
    backgroundColor: Colors.background,
    borderTopWidth: Jack.border, borderTopColor: Colors.ink,
  },
});
