// src/screens/DealerSetupScreen.tsx
// Setup for Screw the Dealer! — drink cap, how the game ends, and the mercy
// rule. Also states the rules, because this mode has more of them than the
// others and nobody wants to explain it twice at a party.

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { RootStackParamList } from '../navigation/types';
import { Colors, Jack, Type } from '../styles/theme';
import {
  CAP_OPTIONS, DrinkCap, END_CONDITIONS, MERCY_OPTIONS, useDealer,
} from '../components/DealerContext';
import { DealerEndCondition } from '../data/dealerGame';
import {
  DEALER_PENALTY_FIRST_GUESS, DEALER_PENALTY_SECOND_GUESS, STREAK_TO_PASS,
} from '../data/dealerData';
import { JackButton, JackIconButton } from '../components/jack';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'DealerSetup'>;
};

const RULES = [
  `Guess the value of the top card. Aces are low.`,
  `Miss, and you're told higher or lower — then you get one more go.`,
  `Guess right first time and the dealer drinks ${DEALER_PENALTY_FIRST_GUESS}. Second time, ${DEALER_PENALTY_SECOND_GUESS}.`,
  `Miss both and you drink the difference between your guess and the card.`,
  `The dealer only escapes after beating ${STREAK_TO_PASS} players in a row.`,
];

export default function DealerSetupScreen({ navigation }: Props) {
  const { settings, setDrinkCap, setEndCondition, setMercyTurns } = useDealer();

  const tap = (fn: () => void) => () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    fn();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <JackIconButton icon="arrow-back" onPress={() => navigation.goBack()} size={42} />
        <Text style={styles.headerTitle}>SCREW THE DEALER</Text>
        <View style={{ width: 42 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>SCREW{'\n'}<Text style={styles.pageTitleAccent}>THE DEALER</Text></Text>
          <Text style={styles.pageSubtitle}>
            Guess the card. Beat the dealer. Watch them suffer.
          </Text>
        </View>

        {/* Rules */}
        <View style={styles.rulesPanel}>
          {RULES.map((rule, i) => (
            <View key={i} style={styles.ruleRow}>
              <Text style={styles.ruleNumber}>{i + 1}</Text>
              <Text style={styles.ruleText}>{rule}</Text>
            </View>
          ))}
        </View>

        {/* Drink cap */}
        <Text style={styles.sectionLabel}>MAX DRINKS PER MISS</Text>
        <View style={styles.pillRow}>
          {CAP_OPTIONS.map(cap => {
            const active = settings.drinkCap === cap;
            return (
              <TouchableOpacity
                key={String(cap)}
                activeOpacity={0.8}
                onPress={tap(() => setDrinkCap(cap as DrinkCap))}
                style={[styles.pill, active && styles.pillActive]}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>
                  {cap === null ? 'No cap' : cap}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.hint}>
          Guessing an Ace against a King is 12 drinks uncapped — the harshest
          number in the app. The cap keeps that survivable.
        </Text>

        {/* End condition */}
        <Text style={styles.sectionLabel}>GAME LENGTH</Text>
        <View style={styles.endList}>
          {END_CONDITIONS.map(option => {
            const active = settings.endCondition === option.id;
            return (
              <View key={option.id} style={styles.rowOuter}>
                <View
                  style={[
                    styles.rowShadow,
                    { backgroundColor: active ? Colors.primary : Colors.ink },
                  ]}
                />
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={tap(() => setEndCondition(option.id as DealerEndCondition))}
                  style={[
                    styles.rowFace,
                    active
                      ? { borderColor: Colors.primary, backgroundColor: Colors.surfaceContainerHigh }
                      : { borderColor: Colors.ink, backgroundColor: Colors.surfaceContainerLow },
                  ]}
                >
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowTitle}>{option.label}</Text>
                    <Text style={styles.rowMeta}>{option.hint}</Text>
                  </View>
                  <View style={[
                    styles.radio,
                    active
                      ? { backgroundColor: Colors.primary, borderColor: Colors.ink }
                      : { borderColor: Colors.outlineVariant },
                  ]} />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {/* Mercy rule */}
        <Text style={styles.sectionLabel}>MERCY RULE</Text>
        <View style={styles.pillRow}>
          {MERCY_OPTIONS.map(turns => {
            const active = settings.mercyTurns === turns;
            return (
              <TouchableOpacity
                key={String(turns)}
                activeOpacity={0.8}
                onPress={tap(() => setMercyTurns(turns))}
                style={[styles.pill, active && styles.pillActive]}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>
                  {turns === null ? 'Off' : turns}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.hint}>
          Passes the deck after this many turns dealing, even if the dealer
          hasn't won three in a row. Turning it off means an unlucky dealer can
          be stuck indefinitely — and under &ldquo;Everyone deals&rdquo; the game
          may never end.
        </Text>

        <View style={styles.continue}>
          <JackButton
            label="Next — Add Players"
            icon="arrow-forward"
            onPress={() => navigation.navigate('Players', { next: 'DealerGame' })}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  headerTitle: {
    fontFamily: Type.display, fontSize: 13, letterSpacing: 2,
    color: Colors.onSurfaceVariant,
  },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },

  pageHeader: { marginTop: 4, marginBottom: 22 },
  pageTitle: { fontFamily: Type.display, fontSize: 34, lineHeight: 37, color: Colors.onSurface },
  pageTitleAccent: { color: Colors.primary },
  pageSubtitle: {
    fontFamily: Type.body, fontSize: 15, color: Colors.onSurfaceVariant, marginTop: 8,
  },

  rulesPanel: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Jack.radius,
    borderWidth: 2.5, borderColor: Colors.outlineVariant,
    padding: 14, gap: 10,
  },
  ruleRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  ruleNumber: {
    fontFamily: Type.display, fontSize: 12, color: Colors.primary,
    width: 14, marginTop: 2,
  },
  ruleText: {
    flex: 1, fontFamily: Type.body, fontSize: 13, lineHeight: 19,
    color: Colors.onSurfaceVariant,
  },

  sectionLabel: {
    fontFamily: Type.display, fontSize: 11, letterSpacing: 2,
    color: Colors.outline, marginTop: 26, marginBottom: 12,
  },

  pillRow: { flexDirection: 'row', gap: 8 },
  pill: {
    flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
    borderWidth: 2.5, borderColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceContainerLow,
  },
  pillActive: { backgroundColor: Colors.primary, borderColor: Colors.ink },
  pillText: { fontFamily: Type.display, fontSize: 13, color: Colors.onSurfaceVariant },
  pillTextActive: { color: Colors.ink },

  endList: { gap: 12 },
  rowOuter: { position: 'relative' },
  rowShadow: {
    position: 'absolute', top: Jack.shadow, left: 0, right: 0, bottom: 0,
    borderRadius: Jack.radius,
  },
  rowFace: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: Jack.radius, borderWidth: Jack.border,
    padding: 14, marginBottom: Jack.shadow,
  },
  rowInfo: { flex: 1 },
  rowTitle: { fontFamily: Type.display, fontSize: 15, color: Colors.onSurface },
  rowMeta: {
    fontFamily: Type.bodyMedium, fontSize: 12, lineHeight: 17,
    color: Colors.onSurfaceVariant, marginTop: 3,
  },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2.5 },

  hint: {
    fontFamily: Type.body, fontSize: 12, lineHeight: 18,
    color: Colors.outline, marginTop: 10,
  },

  continue: { marginTop: 32 },
});
