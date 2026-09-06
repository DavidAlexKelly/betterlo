// src/screens/TraitorsOverScreen.tsx
// Final score for Word Traitors!
//
// No drinks in this mode, so the results are innocents-vs-traitors across the
// session, plus who was best at getting away with it.

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Image, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { RootStackParamList } from '../navigation/types';
import { Colors, Jack, Type } from '../styles/theme';
import { useGame } from '../components/GameContext';
import { readTraitorsStandings } from '../hooks/useTraitorsEngine';
import { JackButton, JackPanel, ConfettiDots } from '../components/jack';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'TraitorsOver'>;
};

export default function TraitorsOverScreen({ navigation }: Props) {
  const { state } = useGame();
  const standings = readTraitorsStandings();

  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();
  }, [scaleAnim, fadeAnim]);

  const score = standings?.score ?? { innocentWins: 0, traitorWins: 0 };
  const innocentsAhead = score.innocentWins > score.traitorWins;
  const drawn = score.innocentWins === score.traitorWins;

  // Best liar: most survivals as a traitor, tie-broken by fewest times caught.
  const ranked = [...state.players]
    .map(p => {
      const s = standings?.stats[p.id];
      return {
        player: p,
        timesTraitor: s?.timesTraitor ?? 0,
        survived: s?.survived ?? 0,
        caught: s?.caught ?? 0,
      };
    })
    .sort((a, b) => (b.survived - a.survived) || (a.caught - b.caught));

  const bestLiar = ranked.find(r => r.survived > 0) ?? null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ConfettiDots opacity={0.7} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: scaleAnim }] }}>
          <JackPanel
            color={drawn ? Colors.surfaceContainer : innocentsAhead ? '#B6F44A' : Colors.secondary}
            tilt={Jack.tiltL}
            shadow={Jack.shadowBig}
            faceStyle={styles.heroFace}
          >
            <Text style={[styles.eyebrow, !innocentsAhead && !drawn && styles.onDark]}>
              {standings?.rounds ?? 0} ROUND{(standings?.rounds ?? 0) === 1 ? '' : 'S'}
            </Text>
            <Text style={[styles.heroText, !innocentsAhead && !drawn && styles.onDark]}>
              {drawn ? 'DEAD HEAT' : innocentsAhead ? 'INNOCENTS WIN' : 'TRAITORS WIN'}
            </Text>
            <Text style={[styles.subtitle, !innocentsAhead && !drawn && styles.onDark]}>
              {score.innocentWins} caught · {score.traitorWins} got away
            </Text>
          </JackPanel>
        </Animated.View>

        {bestLiar && (
          <Animated.View style={{ opacity: fadeAnim }}>
            <View style={styles.liarPanel}>
              <Text style={styles.liarLabel}>BEST LIAR</Text>
              <Text style={styles.liarName}>{bestLiar.player.name.toUpperCase()}</Text>
              <Text style={styles.liarMeta}>
                got away with it {bestLiar.survived} time{bestLiar.survived === 1 ? '' : 's'}
              </Text>
            </View>
          </Animated.View>
        )}

        <Animated.View style={[styles.standings, { opacity: fadeAnim }]}>
          <Text style={styles.sectionLabel}>AS A TRAITOR</Text>

          {ranked.map(row => (
            <View key={row.player.id} style={styles.rowOuter}>
              <View style={styles.rowShadow} />
              <View style={[styles.rowFace, { borderColor: row.player.color }]}>
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
                    {row.timesTraitor === 0
                      ? 'never a traitor'
                      : `traitor ${row.timesTraitor}× · caught ${row.caught}`}
                  </Text>
                </View>

                <Text style={[styles.survived, { color: row.player.color }]}>
                  {row.survived}
                </Text>
              </View>
            </View>
          ))}
        </Animated.View>

        <Animated.View style={[styles.actions, { opacity: fadeAnim }]}>
          <JackButton
            label="Play Again"
            icon="refresh"
            onPress={() => navigation.replace('TraitorsGame')}
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
  content: { paddingHorizontal: 24, paddingTop: 40, paddingBottom: 32, gap: 24 },

  heroFace: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 20 },
  eyebrow: {
    fontFamily: Type.display, fontSize: 12, letterSpacing: 2.5,
    color: Colors.ink, opacity: 0.7,
  },
  heroText: {
    fontFamily: Type.display, fontSize: 32, lineHeight: 36,
    color: Colors.ink, marginTop: 4, textAlign: 'center',
  },
  subtitle: {
    fontFamily: Type.body, fontSize: 13, color: Colors.ink,
    opacity: 0.85, marginTop: 6, textAlign: 'center',
  },
  onDark: { color: '#fff' },

  liarPanel: {
    alignItems: 'center', gap: 2,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Jack.radius, borderWidth: 2.5, borderColor: Colors.outlineVariant,
    paddingVertical: 16,
  },
  liarLabel: {
    fontFamily: Type.display, fontSize: 10, letterSpacing: 2, color: Colors.outline,
  },
  liarName: { fontFamily: Type.display, fontSize: 24, color: Colors.primary },
  liarMeta: { fontFamily: Type.body, fontSize: 12, color: Colors.onSurfaceVariant },

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
  survived: { fontFamily: Type.display, fontSize: 22 },

  actions: { gap: 14 },
});
