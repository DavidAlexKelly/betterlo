// src/screens/PlayScreen.tsx
// The main menu is now a GAME MODE picker rather than a single "Start a Game"
// button. It renders one tile per entry in src/data/gameModes.ts, so shipping
// a new mode is a data change here, not a screen rewrite.
//
// "Truth or Dare!" is the original deck-based game — tapping it does exactly
// what the old Start button did (resetGame, then push DeckSelect), so the
// DeckSelect → Players → Game → GameOver flow is untouched.
//
// Trivia is registered but `available: false`, so it renders locked with a
// COMING SOON badge and swallows taps until its screens exist.

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/types';
import { Colors, Jack, Type } from '../styles/theme';
import { APP_TAGLINE } from '../branding';
import { GAME_MODES, GameModeDefinition } from '../data/gameModes';
import Logo from '../components/Logo';
import BottomNav from '../components/BottomNav';
import { JackTile, JackBadge, JackIconButton, ConfettiDots } from '../components/jack';
import { useGame } from '../components/GameContext';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Play'>;
};

// Alternating tilts keep the stack feeling hand-placed rather than gridded.
const TILE_TILTS = [Jack.tiltL, Jack.tiltR];

export default function PlayScreen({ navigation }: Props) {
  const { resetGame } = useGame();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const handleSelect = (mode: GameModeDefinition) => {
    // JackTile already blocks presses when disabled; this is belt-and-braces
    // so a mis-configured entry (available: true, route: null) can't crash.
    if (!mode.available || !mode.route) return;
    // Clear any half-finished game before entering a mode — matches the old
    // Start button's behaviour.
    resetGame();
    navigation.navigate(mode.route as never);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ConfettiDots opacity={0.55} />

      {/* Header — identical structure/padding to DecksScreen & CardsScreen */}
      <View style={styles.header}>
        <Logo />
        <JackIconButton
          icon="settings-outline"
          onPress={() => navigation.navigate('Legal')}
          size={42}
        />
      </View>

      <Animated.View
        style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
      >
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>
            CHOOSE YOUR{'\n'}<Text style={styles.pageTitleAccent}>GAME</Text>
          </Text>
          <Text style={styles.pageSubtitle}>{APP_TAGLINE}</Text>
        </View>

        {/* Scrolls from four modes onward — flexing them all onto one screen
            squeezes the taglines to nothing on smaller phones. */}
        <ScrollView
          style={styles.tilesScroll}
          contentContainerStyle={styles.tiles}
          showsVerticalScrollIndicator={false}
        >
          {GAME_MODES.map((mode, i) => (
            <JackTile
              key={mode.id}
              onPress={() => handleSelect(mode)}
              disabled={!mode.available}
              color={Colors.surfaceContainer}
              shadowColor={mode.color}
              shadow={Jack.shadowBig}
              tilt={TILE_TILTS[i % TILE_TILTS.length]}
              faceStyle={styles.tileFace}
            >
              <View style={styles.tileTop}>
                <View style={[styles.tileIcon, { backgroundColor: mode.color }]}>
                  <Ionicons name={mode.icon as never} size={26} color={Colors.ink} />
                </View>
                {!mode.available && (
                  <JackBadge
                    label="Coming Soon"
                    color={Colors.outline}
                    textColor={Colors.ink}
                    tilt={Jack.tiltR}
                  />
                )}
              </View>

              {/* Label + tagline are grouped so the face's space-between
                  distributes three blocks (top / middle / footer) rather than
                  splaying the tagline away from its own heading. */}
              <View style={styles.tileMiddle}>
                <Text style={styles.tileLabel}>{mode.label}</Text>
                <Text style={styles.tileTagline} numberOfLines={3}>{mode.tagline}</Text>
              </View>

              <View style={styles.tileFooter}>
                <Text
                  style={[
                    styles.tileMeta,
                    { color: mode.available ? mode.color : Colors.outline },
                  ]}
                >
                  {mode.meta}
                </Text>
                {mode.available && (
                  <Ionicons name="arrow-forward" size={20} color={Colors.onSurface} />
                )}
              </View>
            </JackTile>
          ))}
        </ScrollView>
      </Animated.View>

      <BottomNav current="play" navigation={navigation} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  // Must match the header style in DecksScreen/CardsScreen exactly.
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingVertical: 14,
  },
  content: {
    flex: 1, paddingHorizontal: 24, paddingBottom: 110,
  },

  pageHeader: { marginTop: 4, marginBottom: 20 },
  pageTitle: {
    fontFamily: Type.display, fontSize: 36, lineHeight: 39, color: Colors.onSurface,
    letterSpacing: -0.3,
  },
  pageTitleAccent: { color: Colors.primary },
  pageSubtitle: {
    fontFamily: Type.body, fontSize: 14, lineHeight: 20, color: Colors.onSurfaceVariant,
    marginTop: 10, maxWidth: 300,
  },

  // Two tiles share the remaining height evenly.
  tilesScroll: { flex: 1 },
  // Tiles are a fixed height now rather than flexing to share the screen, so
  // four of them scroll instead of being crushed.
  tiles: { gap: 16, paddingBottom: 8 },
  tileFace: {
    padding: 20,
    justifyContent: 'space-between',
    // Replaces the old flex:1 sharing. Tall enough for the icon row, a
    // two-line label, a three-line tagline and the footer.
    minHeight: 210,
  },
  tileTop: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
  },
  tileIcon: {
    width: 52, height: 52, borderRadius: 14,
    borderWidth: 2.5, borderColor: Colors.ink,
    alignItems: 'center', justifyContent: 'center',
  },
  tileMiddle: { marginTop: 14 },
  tileLabel: {
    fontFamily: Type.display, fontSize: 26, lineHeight: 30,
    color: Colors.onSurface,
  },
  tileTagline: {
    fontFamily: Type.body, fontSize: 13, lineHeight: 19,
    color: Colors.onSurfaceVariant, marginTop: 6,
  },
  tileFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 14,
  },
  tileMeta: {
    fontFamily: Type.display, fontSize: 11, letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
});
