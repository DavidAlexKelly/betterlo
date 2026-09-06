// src/screens/TriviaSetupScreen.tsx
// Trivia's equivalent of DeckSelectScreen: pick the wedges in play, how many
// are needed to win, and the difficulty band. Then on to the shared lobby.
//
// Shows each wedge's question count and warns about thin ones — with the
// current seed data Geography has only 4 questions, and a group would see all
// of them in one game. Better to surface that here than have players discover
// it mid-round.

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { RootStackParamList } from '../navigation/types';
import { Colors, Jack, Type } from '../styles/theme';
import { WEDGE_LIST, WedgeId } from '../data/trivia/types';
import { QUESTION_COUNTS } from '../data/triviaData';
import {
  useTrivia, Difficulty, TimerSetting, TIMER_OPTIONS,
} from '../components/TriviaContext';
import { JackButton, JackIconButton } from '../components/jack';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'TriviaSetup'>;
};

/** Below this, a wedge will repeat inside a single game. */
const THIN_WEDGE = 15;

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  1: 'Easy',
  2: 'Medium',
  3: 'Hard',
};

export default function TriviaSetupScreen({ navigation }: Props) {
  const {
    settings, toggleWedge, setWedgesToWin, toggleDifficulty,
    setTimerSeconds, setStealsEnabled,
  } = useTrivia();

  const tap = (fn: () => void) => () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    fn();
  };

  // Can't require more wedges than are in play.
  const winOptions = [3, 4, 5, 6].filter(n => n <= settings.wedges.length);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <JackIconButton icon="arrow-back" onPress={() => navigation.goBack()} size={42} />
        <Text style={styles.headerTitle}>TRIVIA SETUP</Text>
        <View style={{ width: 42 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>PICK YOUR{'\n'}<Text style={styles.pageTitleAccent}>CATEGORIES</Text></Text>
          <Text style={styles.pageSubtitle}>Win one wedge from each to take the game.</Text>
        </View>

        {/* ── Wedges ── */}
        <Text style={styles.sectionLabel}>CATEGORIES</Text>
        <View style={styles.wedgeList}>
          {WEDGE_LIST.map(wedge => {
            const selected = settings.wedges.includes(wedge.id as WedgeId);
            const count = QUESTION_COUNTS[wedge.id];
            const thin = count < THIN_WEDGE;
            const isLast = selected && settings.wedges.length === 1;

            return (
              <View key={wedge.id} style={styles.rowOuter}>
                <View
                  style={[
                    styles.rowShadow,
                    { backgroundColor: selected ? wedge.color : Colors.ink },
                  ]}
                />
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={isLast ? undefined : tap(() => toggleWedge(wedge.id as WedgeId))}
                  style={[
                    styles.rowFace,
                    selected
                      ? { borderColor: wedge.color, backgroundColor: Colors.surfaceContainerHigh }
                      : { borderColor: Colors.ink, backgroundColor: Colors.surfaceContainerLow },
                  ]}
                >
                  <View style={[styles.wedgeIcon, { backgroundColor: wedge.color }]}>
                    <Ionicons name={wedge.icon as never} size={18} color={Colors.ink} />
                  </View>

                  <View style={styles.rowInfo}>
                    <Text style={styles.rowTitle}>{wedge.label}</Text>
                    <Text style={[styles.rowMeta, thin && styles.rowMetaWarn]}>
                      {count} question{count === 1 ? '' : 's'}
                      {thin ? '  ·  will repeat' : ''}
                    </Text>
                  </View>

                  <View style={[
                    styles.checkbox,
                    selected
                      ? { backgroundColor: wedge.color, borderColor: Colors.ink }
                      : { borderColor: Colors.outlineVariant },
                  ]}>
                    {selected && <Ionicons name="checkmark" size={15} color={Colors.ink} />}
                  </View>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {/* ── Wedges to win ── */}
        <Text style={styles.sectionLabel}>WEDGES TO WIN</Text>
        <View style={styles.pillRow}>
          {winOptions.map(n => {
            const active = settings.wedgesToWin === n;
            return (
              <TouchableOpacity
                key={n}
                activeOpacity={0.8}
                onPress={tap(() => setWedgesToWin(n))}
                style={[styles.pill, active && styles.pillActive]}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>{n}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.hint}>
          Fewer wedges makes for a shorter game. Six is the full pursuit.
        </Text>

        {/* ── Difficulty ── */}
        <Text style={styles.sectionLabel}>DIFFICULTY</Text>
        <View style={styles.pillRow}>
          {([1, 2, 3] as Difficulty[]).map(d => {
            const active = settings.difficulties.includes(d);
            return (
              <TouchableOpacity
                key={d}
                activeOpacity={0.8}
                onPress={tap(() => toggleDifficulty(d))}
                style={[styles.pill, styles.pillWide, active && styles.pillActive]}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>
                  {DIFFICULTY_LABELS[d]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.hint}>
          Harder questions cost more sips when you miss them.
        </Text>

        {/* ── Timer ── */}
        <Text style={styles.sectionLabel}>ANSWER TIMER</Text>
        <View style={styles.pillRow}>
          {TIMER_OPTIONS.map(t => {
            const active = settings.timerSeconds === t;
            return (
              <TouchableOpacity
                key={String(t)}
                activeOpacity={0.8}
                onPress={tap(() => setTimerSeconds(t as TimerSetting))}
                style={[styles.pill, active && styles.pillActive]}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>
                  {t === null ? 'Off' : `${t}s`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.hint}>
          Run out of time and it counts as a miss.
        </Text>

        {/* ── Steals ── */}
        <Text style={styles.sectionLabel}>STEALS</Text>
        <View style={styles.rowOuter}>
          <View style={styles.rowShadow} />
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={tap(() => setStealsEnabled(!settings.stealsEnabled))}
            style={[
              styles.rowFace,
              settings.stealsEnabled
                ? { borderColor: Colors.primary, backgroundColor: Colors.surfaceContainerHigh }
                : { borderColor: Colors.ink, backgroundColor: Colors.surfaceContainerLow },
            ]}
          >
            <View style={[styles.wedgeIcon, { backgroundColor: Colors.primary }]}>
              <Ionicons name="flash" size={18} color={Colors.ink} />
            </View>
            <View style={styles.rowInfo}>
              <Text style={styles.rowTitle}>Steal a missed question</Text>
              <Text style={styles.rowMeta}>
                The next player gets a shot at it — and the wedge
              </Text>
            </View>
            <View style={[
              styles.checkbox,
              settings.stealsEnabled
                ? { backgroundColor: Colors.primary, borderColor: Colors.ink }
                : { borderColor: Colors.outlineVariant },
            ]}>
              {settings.stealsEnabled && (
                <Ionicons name="checkmark" size={15} color={Colors.ink} />
              )}
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.continue}>
          <JackButton
            label="Next — Add Players"
            icon="arrow-forward"
            onPress={() => navigation.navigate('Players', { next: 'TriviaGame' })}
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

  pageHeader: { marginTop: 4, marginBottom: 24 },
  pageTitle: { fontFamily: Type.display, fontSize: 36, lineHeight: 39, color: Colors.onSurface },
  pageTitleAccent: { color: Colors.primary },
  pageSubtitle: {
    fontFamily: Type.body, fontSize: 15, color: Colors.onSurfaceVariant, marginTop: 8,
  },

  sectionLabel: {
    fontFamily: Type.display, fontSize: 11, letterSpacing: 2,
    color: Colors.outline, marginTop: 22, marginBottom: 12,
  },

  wedgeList: { gap: 12 },
  rowOuter: { position: 'relative' },
  rowShadow: {
    position: 'absolute', top: Jack.shadow, left: 0, right: 0, bottom: 0,
    borderRadius: Jack.radius,
  },
  rowFace: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: Jack.radius, borderWidth: Jack.border,
    padding: 12, marginBottom: Jack.shadow,
  },
  wedgeIcon: {
    width: 38, height: 38, borderRadius: 10,
    borderWidth: 2.5, borderColor: Colors.ink,
    alignItems: 'center', justifyContent: 'center',
  },
  rowInfo: { flex: 1 },
  rowTitle: { fontFamily: Type.display, fontSize: 15, color: Colors.onSurface },
  rowMeta: {
    fontFamily: Type.bodyMedium, fontSize: 12,
    color: Colors.onSurfaceVariant, marginTop: 2,
  },
  rowMetaWarn: { color: Colors.error },
  checkbox: {
    width: 26, height: 26, borderRadius: 8, borderWidth: 2.5,
    alignItems: 'center', justifyContent: 'center',
  },

  pillRow: { flexDirection: 'row', gap: 8 },
  pill: {
    flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
    borderWidth: 2.5, borderColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceContainerLow,
  },
  pillWide: { paddingHorizontal: 8 },
  pillActive: { backgroundColor: Colors.primary, borderColor: Colors.ink },
  pillText: { fontFamily: Type.display, fontSize: 13, color: Colors.onSurfaceVariant },
  pillTextActive: { color: Colors.ink },

  hint: {
    fontFamily: Type.body, fontSize: 12, lineHeight: 18,
    color: Colors.outline, marginTop: 10,
  },

  continue: { marginTop: 32 },
});
