// src/screens/TraitorsSetupScreen.tsx
// Setup for Word Traitors! — how many traitors, whether they get a hint, and
// how many rounds. Also states the loop, because this is the only mode where
// players need to know what's about to be asked of them before it starts.

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { RootStackParamList } from '../navigation/types';
import { Colors, Jack, Type } from '../styles/theme';
import {
  ROUND_OPTIONS, TRAITOR_COUNT_OPTIONS, TraitorCountSetting, useTraitors,
} from '../components/TraitorsContext';
import { WORD_COUNT } from '../data/traitorsData';
import { JackButton, JackIconButton } from '../components/jack';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'TraitorsSetup'>;
};

const STEPS = [
  'Pass the phone round. Everyone sees the secret word — except the traitors.',
  'Go round in order giving one-word clues. Prove you know it without saying it.',
  'Argue about who sounded off.',
  'Vote, then reveal. Catch every traitor or they win.',
];

export default function TraitorsSetupScreen({ navigation }: Props) {
  const { settings, setTraitorCount, setHintsEnabled, setTotalRounds } = useTraitors();

  const tap = (fn: () => void) => () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    fn();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <JackIconButton icon="arrow-back" onPress={() => navigation.goBack()} size={42} />
        <Text style={styles.headerTitle}>WORD TRAITORS</Text>
        <View style={{ width: 42 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>WORD{'\n'}<Text style={styles.pageTitleAccent}>TRAITORS</Text></Text>
          <Text style={styles.pageSubtitle}>
            Everyone knows the word. Almost everyone.
          </Text>
        </View>

        <View style={styles.stepsPanel}>
          {STEPS.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <Text style={styles.stepNumber}>{i + 1}</Text>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>

        {/* Traitors */}
        <Text style={styles.sectionLabel}>TRAITORS</Text>
        <View style={styles.pillRow}>
          {TRAITOR_COUNT_OPTIONS.map(option => {
            const active = settings.traitorCount === option;
            return (
              <TouchableOpacity
                key={String(option)}
                activeOpacity={0.8}
                onPress={tap(() => setTraitorCount(option as TraitorCountSetting))}
                style={[styles.pill, active && styles.pillActive]}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>
                  {option === 'auto' ? 'Auto' : option}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.hint}>
          Auto scales with the group: one traitor, two from six players, three
          from nine. There are always at least two innocents.
        </Text>

        {/* Hints */}
        <Text style={styles.sectionLabel}>TRAITOR HINTS</Text>
        <View style={styles.rowOuter}>
          <View style={styles.rowShadow} />
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={tap(() => setHintsEnabled(!settings.hintsEnabled))}
            style={[
              styles.rowFace,
              settings.hintsEnabled
                ? { borderColor: Colors.primary, backgroundColor: Colors.surfaceContainerHigh }
                : { borderColor: Colors.ink, backgroundColor: Colors.surfaceContainerLow },
            ]}
          >
            <View style={[styles.rowIcon, { backgroundColor: Colors.primary }]}>
              <Ionicons name="eye" size={18} color={Colors.ink} />
            </View>
            <View style={styles.rowInfo}>
              <Text style={styles.rowTitle}>Give traitors a nudge</Text>
              <Text style={styles.rowMeta}>
                They see one vague word — &ldquo;Round&rdquo; for Pizza. Off means
                they go in completely blind.
              </Text>
            </View>
            <View style={[
              styles.checkbox,
              settings.hintsEnabled
                ? { backgroundColor: Colors.primary, borderColor: Colors.ink }
                : { borderColor: Colors.outlineVariant },
            ]}>
              {settings.hintsEnabled && (
                <Ionicons name="checkmark" size={15} color={Colors.ink} />
              )}
            </View>
          </TouchableOpacity>
        </View>

        {/* Rounds */}
        <Text style={styles.sectionLabel}>ROUNDS</Text>
        <View style={styles.pillRow}>
          {ROUND_OPTIONS.map(option => {
            const active = settings.totalRounds === option;
            return (
              <TouchableOpacity
                key={String(option)}
                activeOpacity={0.8}
                onPress={tap(() => setTotalRounds(option))}
                style={[styles.pill, active && styles.pillActive]}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>
                  {option === null ? 'Endless' : option}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.hint}>
          {WORD_COUNT} words in the pack, and a round never repeats one.
        </Text>

        <View style={styles.continue}>
          <JackButton
            label="Next — Add Players"
            icon="arrow-forward"
            onPress={() => navigation.navigate('Players', { next: 'TraitorsGame' })}
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
  pageTitle: { fontFamily: Type.display, fontSize: 36, lineHeight: 39, color: Colors.onSurface },
  pageTitleAccent: { color: Colors.secondary },
  pageSubtitle: {
    fontFamily: Type.body, fontSize: 15, color: Colors.onSurfaceVariant, marginTop: 8,
  },

  stepsPanel: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Jack.radius,
    borderWidth: 2.5, borderColor: Colors.outlineVariant,
    padding: 14, gap: 10,
  },
  stepRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepNumber: {
    fontFamily: Type.display, fontSize: 12, color: Colors.secondary,
    width: 14, marginTop: 2,
  },
  stepText: {
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

  rowOuter: { position: 'relative' },
  rowShadow: {
    position: 'absolute', top: Jack.shadow, left: 0, right: 0, bottom: 0,
    borderRadius: Jack.radius, backgroundColor: Colors.ink,
  },
  rowFace: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: Jack.radius, borderWidth: Jack.border,
    padding: 12, marginBottom: Jack.shadow,
  },
  rowIcon: {
    width: 38, height: 38, borderRadius: 10,
    borderWidth: 2.5, borderColor: Colors.ink,
    alignItems: 'center', justifyContent: 'center',
  },
  rowInfo: { flex: 1 },
  rowTitle: { fontFamily: Type.display, fontSize: 15, color: Colors.onSurface },
  rowMeta: {
    fontFamily: Type.bodyMedium, fontSize: 12, lineHeight: 17,
    color: Colors.onSurfaceVariant, marginTop: 3,
  },
  checkbox: {
    width: 26, height: 26, borderRadius: 8, borderWidth: 2.5,
    alignItems: 'center', justifyContent: 'center',
  },

  hint: {
    fontFamily: Type.body, fontSize: 12, lineHeight: 18,
    color: Colors.outline, marginTop: 10,
  },

  continue: { marginTop: 32 },
});
