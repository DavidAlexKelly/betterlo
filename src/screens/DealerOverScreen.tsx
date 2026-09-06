// src/screens/DealerOverScreen.tsx
// Results for Screw the Dealer!
//
// Ranked by total drinks, worst first — in this game the person at the top of
// the table is the loser, and that's the joke. Reads the frozen snapshot from
// useDealerEngine because the engine unmounts on `replace`.

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Image, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { RootStackParamList } from '../navigation/types';
import { Colors, Jack, Type } from '../styles/theme';
import { useGame } from '../components/GameContext';
import { readDealerStandings } from '../hooks/useDealerEngine';
import { JackButton, JackPanel, ConfettiDots } from '../components/jack';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'DealerOver'>;
};

export default function DealerOverScreen({ navigation }: Props) {
  const { state } = useGame();
  const standings = readDealerStandings();

  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();
  }, [scaleAnim, fadeAnim]);

  const stats = standings?.stats;

  const ranked = [...state.players]
    .map(p => ({
      player: p,
      total: stats?.totals[p.id] ?? 0,
      asDealer: stats?.asDealer[p.id] ?? 0,
      reigns: stats?.reigns[p.id] ?? 0,
      worst: stats?.worstHit[p.id] ?? 0,
      correct: stats?.correctGuesses[p.id] ?? 0,
    }))
    .sort((a, b) => b.total - a.total);

  const victim = ranked[0] ?? null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ConfettiDots opacity={0.7} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: scaleAnim }] }}>
          <JackPanel
            color={Colors.secondary}
            tilt={Jack.tiltL}
            shadow={Jack.shadowBig}
            faceStyle={styles.heroFace}
          >
            <Text style={styles.eyebrow}>DECK&apos;S DONE</Text>
            <Text style={styles.heroText} numberOfLines={2}>
              {victim && victim.total > 0
                ? `${victim.player.name.toUpperCase()} GOT SCREWED`
                : 'NOBODY SUFFERED'}
            </Text>
            <Text style={styles.subtitle}>
              {victim && victim.total > 0
                ? `${victim.total} drinks. Worst single hit: ${victim.worst}.`
                : 'Suspiciously clean game.'}
            </Text>
          </JackPanel>
        </Animated.View>

        <Animated.View style={[styles.standings, { opacity: fadeAnim }]}>
          <Text style={styles.sectionLabel}>THE DAMAGE</Text>

          {ranked.map((row, i) => (
            <View key={row.player.id} style={styles.rowOuter}>
              <View style={styles.rowShadow} />
              <View style={[styles.rowFace, { borderColor: row.player.color }]}>
                <Text style={styles.rank}>{i + 1}</Text>

                <View style={[styles.orb, { borderColor: row.player.color }]}>
                  {row.player.photo ? (
                    <Image source={{ uri: row.player.photo }} style={styles.orbPhoto} />
                  ) : (
                    <Text style={[styles.orbInitial, { color: row.player.color }]}>
                      {row.player.name.charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>

                <View style={styles.rowInfo}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {row.player.name.toUpperCase()}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {row.asDealer} as dealer · {row.correct} guessed · worst {row.worst}
                  </Text>
                </View>

                <Text style={[styles.total, { color: row.player.color }]}>
                  {row.total}
                </Text>
              </View>
            </View>
          ))}

          {standings && (
            <Text style={styles.footnote}>
              {standings.cardsPlayed} card{standings.cardsPlayed === 1 ? '' : 's'} dealt
              {' · '}
              {standings.reignsCompleted} deal{standings.reignsCompleted === 1 ? '' : 's'} completed
            </Text>
          )}
        </Animated.View>

        <Animated.View style={[styles.actions, { opacity: fadeAnim }]}>
          <JackButton
            label="Play Again"
            icon="refresh"
            onPress={() => navigation.replace('DealerGame')}
          />
          <JackButton
            label="Main Menu"
            variant="ghost"
            size="medium"
            onPress={() => navigation.replace('Play')}
          />
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 24, paddingTop: 40, paddingBottom: 32, gap: 26 },

  heroFace: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 20 },
  eyebrow: {
    fontFamily: Type.display, fontSize: 12, letterSpacing: 2.5,
    color: '#fff', opacity: 0.8,
  },
  heroText: {
    fontFamily: Type.display, fontSize: 32, lineHeight: 36,
    color: '#fff', marginTop: 4, textAlign: 'center',
  },
  subtitle: {
    fontFamily: Type.body, fontSize: 13, color: '#fff',
    opacity: 0.9, marginTop: 8, textAlign: 'center',
  },

  standings: { gap: 12 },
  sectionLabel: {
    fontFamily: Type.display, fontSize: 11, letterSpacing: 2, color: Colors.outline,
  },
  rowOuter: { position: 'relative' },
  rowShadow: {
    position: 'absolute', top: 4, left: 0, right: 0, bottom: 0,
    borderRadius: Jack.radius, backgroundColor: Colors.ink,
  },
  rowFace: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: Jack.radius, borderWidth: Jack.border,
    backgroundColor: Colors.surfaceContainerLow,
    paddingVertical: 10, paddingHorizontal: 12, marginBottom: 4,
  },
  rank: { fontFamily: Type.display, fontSize: 15, color: Colors.outline, width: 18 },
  orb: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 2.5,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  orbPhoto: { width: '100%', height: '100%' },
  orbInitial: { fontFamily: Type.display, fontSize: 16 },
  rowInfo: { flex: 1 },
  rowName: { fontFamily: Type.display, fontSize: 14, color: Colors.onSurface },
  rowMeta: {
    fontFamily: Type.bodyMedium, fontSize: 11, color: Colors.onSurfaceVariant, marginTop: 2,
  },
  total: { fontFamily: Type.display, fontSize: 22 },

  footnote: {
    fontFamily: Type.body, fontSize: 11, color: Colors.outline,
    textAlign: 'center', marginTop: 6,
  },

  actions: { gap: 14 },
});
