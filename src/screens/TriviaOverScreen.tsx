// src/screens/TriviaOverScreen.tsx
// Trivia's curtain call, mirroring GameOverScreen's shape: tilted marquee for
// the headline, then the final standings.
//
// The engine's state is gone by the time we get here — useTriviaEngine lives
// in TriviaGameScreen, which navigates with `replace`. So player identity comes
// from GameContext, and the wedges/winner come from the snapshot the engine
// took in finishGame(), read back via readFinalStandings().

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Image, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { RootStackParamList } from '../navigation/types';
import { Colors, Jack, Type } from '../styles/theme';
import { useGame } from '../components/GameContext';
import { useTrivia } from '../components/TriviaContext';
import { readFinalStandings } from '../hooks/useTriviaEngine';
import { JackButton, JackPanel, ConfettiDots } from '../components/jack';
import WedgeTracker from '../components/WedgeTracker';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'TriviaOver'>;
};

export default function TriviaOverScreen({ navigation }: Props) {
  const { state } = useGame();
  const { settings } = useTrivia();
  const standings = readFinalStandings();

  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();
  }, [scaleAnim, fadeAnim]);

  const winner = state.players.find(p => p.id === standings.winnerId) ?? null;

  const ranked = [...state.players]
    .map(p => ({ player: p, wedges: standings.wedgesByPlayer[p.id] ?? [] }))
    .sort((a, b) => b.wedges.length - a.wedges.length);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ConfettiDots opacity={0.7} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: scaleAnim }] }}>
          <JackPanel
            color={Colors.primary}
            tilt={Jack.tiltL}
            shadow={Jack.shadowBig}
            faceStyle={styles.heroFace}
          >
            <Text style={styles.eyebrow}>PURSUIT COMPLETE</Text>
            <Text style={styles.heroText} numberOfLines={2}>
              {winner ? `${winner.name.toUpperCase()} WINS` : 'GG.'}
            </Text>
            <Text style={styles.subtitle}>
              {winner ? 'All wedges, and the final question.' : "Nobody closed it out."}
            </Text>
          </JackPanel>
        </Animated.View>

        <Animated.View style={[styles.standings, { opacity: fadeAnim }]}>
          <Text style={styles.sectionLabel}>FINAL STANDINGS</Text>

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
                  <WedgeTracker
                    held={row.wedges}
                    wedges={settings.wedges}
                    size={13}
                    style={{ marginTop: 4 }}
                  />
                </View>

                <Text style={[styles.wedgeCount, { color: row.player.color }]}>
                  {row.wedges.length}
                </Text>
              </View>
            </View>
          ))}
        </Animated.View>

        <Animated.View style={[styles.actions, { opacity: fadeAnim }]}>
          <JackButton
            label="Play Again"
            icon="refresh"
            onPress={() => navigation.replace('TriviaGame')}
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
  content: { paddingHorizontal: 24, paddingTop: 40, paddingBottom: 32, gap: 28 },

  heroFace: { alignItems: 'center', paddingVertical: 26, paddingHorizontal: 20 },
  eyebrow: {
    fontFamily: Type.display, fontSize: 12, letterSpacing: 2.5,
    color: Colors.ink, opacity: 0.7,
  },
  heroText: {
    fontFamily: Type.display, fontSize: 38, lineHeight: 42,
    color: Colors.ink, marginTop: 4, textAlign: 'center',
  },
  subtitle: {
    fontFamily: Type.body, fontSize: 13, color: Colors.ink,
    opacity: 0.8, marginTop: 6, textAlign: 'center',
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
  rank: {
    fontFamily: Type.display, fontSize: 15, color: Colors.outline, width: 18,
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
  wedgeCount: { fontFamily: Type.display, fontSize: 22 },

  actions: { gap: 14 },
});
