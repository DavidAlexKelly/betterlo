// src/screens/DeckSelectScreen.tsx
// Deck picker as a wall of sticker cards. Selected decks fill with their mode
// color tint, get a colored hard shadow and a check badge. Logic unchanged.

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { RootStackParamList } from '../navigation/types';
import { Colors, Jack, Type } from '../styles/theme';
import { MODES } from '../data/gameData';
import { useGame } from '../components/GameContext';
import { loadCustomDecks, CustomDeck } from '../data/customDecks';
import { JackButton, JackIconButton, JackBadge } from '../components/jack';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'DeckSelect'>;
};

export default function DeckSelectScreen({ navigation }: Props) {
  const { state, toggleMode } = useGame();
  const [customDecks, setCustomDecks] = useState<CustomDeck[]>([]);

  useEffect(() => {
    loadCustomDecks().then(setCustomDecks);
  }, []);

  const allBuiltInSelected = MODES.every(m => state.selectedModes.includes(m.id));

  const handleToggle = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleMode(id);
  };

  const handleSelectAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    MODES.forEach(m => {
      const isSelected = state.selectedModes.includes(m.id);
      if (allBuiltInSelected ? isSelected : !isSelected) toggleMode(m.id);
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <JackIconButton icon="arrow-back" onPress={() => navigation.goBack()} size={42} />
        <Text style={styles.headerTitle}>CHOOSE DECKS</Text>
        <View style={{ width: 42 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>PICK YOUR{'\n'}<Text style={styles.pageTitleAccent}>DECKS</Text></Text>
          <Text style={styles.pageSubtitle}>Mix in as many as you like.</Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>BUILT-IN DECKS</Text>
          <TouchableOpacity onPress={handleSelectAll} activeOpacity={0.7}>
            <Text style={styles.selectAllText}>{allBuiltInSelected ? 'CLEAR' : 'SELECT ALL'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.deckGrid}>
          {MODES.map((mode, i) => {
            const isSelected = state.selectedModes.includes(mode.id);
            const isLast = state.selectedModes.length === 1 && isSelected;
            return (
              <View key={mode.id} style={styles.deckOuter}>
                {/* hard shadow — mode-colored when selected */}
                <View
                  style={[
                    styles.deckShadow,
                    { backgroundColor: isSelected ? mode.color : Colors.ink },
                  ]}
                />
                <TouchableOpacity
                  onPress={() => { if (!isLast) handleToggle(mode.id); }}
                  activeOpacity={0.9}
                  style={[
                    styles.deckFace,
                    isSelected
                      ? { borderColor: mode.color, backgroundColor: Colors.surfaceContainerHigh }
                      : { borderColor: Colors.ink, backgroundColor: Colors.surfaceContainerLow },
                  ]}
                >
                  <View style={styles.deckCardTop}>
                    <View style={[styles.deckIconWrap, { backgroundColor: mode.color }]}>
                      <Ionicons name={mode.icon as any} size={22} color={Colors.ink} />
                    </View>
                    <View style={[
                      styles.checkbox,
                      isSelected
                        ? { backgroundColor: mode.color, borderColor: Colors.ink }
                        : { borderColor: Colors.outlineVariant },
                    ]}>
                      {isSelected && <Ionicons name="checkmark" size={15} color={Colors.ink} />}
                    </View>
                  </View>

                  <Text style={styles.deckLabel}>{mode.label}</Text>
                  <Text style={styles.deckDesc}>{mode.desc}</Text>

                  <View style={styles.deckMeta}>
                    <Text style={[styles.deckMetaText, { color: mode.color }]}>{mode.intensity}</Text>
                    <Text style={styles.deckMetaDot}>•</Text>
                    <Text style={styles.deckMetaText}>{mode.time}</Text>
                  </View>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {customDecks.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>YOUR DECKS</Text>
            </View>
            <View style={styles.customList}>
              {customDecks.map(deck => {
                const isSelected = state.selectedModes.includes(deck.id);
                return (
                  <View key={deck.id} style={styles.deckOuter}>
                    <View
                      style={[
                        styles.deckShadow,
                        { backgroundColor: isSelected ? deck.color : Colors.ink },
                      ]}
                    />
                    <TouchableOpacity
                      onPress={() => handleToggle(deck.id)}
                      activeOpacity={0.9}
                      style={[
                        styles.customFace,
                        isSelected
                          ? { borderColor: deck.color, backgroundColor: Colors.surfaceContainerHigh }
                          : { borderColor: Colors.ink, backgroundColor: Colors.surfaceContainerLow },
                      ]}
                    >
                      <View style={[styles.customIconWrap, { backgroundColor: deck.color }]}>
                        <Ionicons name={deck.icon as any} size={18} color={Colors.ink} />
                      </View>
                      <View style={styles.customCardInfo}>
                        <Text style={styles.customName}>{deck.name}</Text>
                        <Text style={styles.customMeta}>
                          {deck.cardIds.length} card{deck.cardIds.length !== 1 ? 's' : ''}
                        </Text>
                      </View>
                      <View style={[
                        styles.checkbox,
                        isSelected
                          ? { backgroundColor: deck.color, borderColor: Colors.ink }
                          : { borderColor: Colors.outlineVariant },
                      ]}>
                        {isSelected && <Ionicons name="checkmark" size={15} color={Colors.ink} />}
                      </View>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </>
        )}

        <View style={styles.continueBtn}>
          <JackButton
            label="Next — Add Players"
            icon="arrow-forward"
            onPress={() => navigation.navigate('Players', { next: 'Game' })}
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
  headerTitle: { fontFamily: Type.display, fontSize: 13, letterSpacing: 2, color: Colors.onSurfaceVariant },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  pageHeader: { marginTop: 4, marginBottom: 20 },
  pageTitle: { fontFamily: Type.display, fontSize: 36, lineHeight: 39, color: Colors.onSurface },
  pageTitleAccent: { color: Colors.primary },
  pageSubtitle: { fontFamily: Type.body, fontSize: 15, color: Colors.onSurfaceVariant, marginTop: 8 },

  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 20, marginBottom: 14,
  },
  sectionLabel: { fontFamily: Type.display, fontSize: 11, letterSpacing: 2, color: Colors.outline },
  selectAllText: { fontFamily: Type.display, fontSize: 11, letterSpacing: 1, color: Colors.primary },

  deckGrid: { gap: 14 },
  deckOuter: { position: 'relative' },
  deckShadow: {
    position: 'absolute', top: Jack.shadow, left: 0, right: 0, bottom: 0,
    borderRadius: Jack.radiusBig,
  },
  deckFace: {
    borderRadius: Jack.radiusBig, borderWidth: Jack.border, padding: 16,
    marginBottom: Jack.shadow,
  },
  deckCardTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
  },
  deckIconWrap: {
    width: 42, height: 42, borderRadius: 12,
    borderWidth: 2.5, borderColor: Colors.ink,
    alignItems: 'center', justifyContent: 'center',
  },
  checkbox: {
    width: 26, height: 26, borderRadius: 8, borderWidth: 2.5,
    alignItems: 'center', justifyContent: 'center',
  },
  deckLabel: { fontFamily: Type.display, fontSize: 17, color: Colors.onSurface, marginBottom: 5 },
  deckDesc: { fontFamily: Type.body, fontSize: 12.5, color: Colors.onSurfaceVariant, lineHeight: 18 },
  deckMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  deckMetaText: { fontFamily: Type.display, fontSize: 10, letterSpacing: 1, color: Colors.outline, textTransform: 'uppercase' },
  deckMetaDot: { color: Colors.outline },

  customList: { gap: 12 },
  customFace: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: Jack.radius, borderWidth: Jack.border, padding: 12,
    marginBottom: Jack.shadow,
  },
  customIconWrap: {
    width: 38, height: 38, borderRadius: 10,
    borderWidth: 2.5, borderColor: Colors.ink,
    alignItems: 'center', justifyContent: 'center',
  },
  customCardInfo: { flex: 1 },
  customName: { fontFamily: Type.display, fontSize: 15, color: Colors.onSurface },
  customMeta: { fontFamily: Type.bodyMedium, fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },

  continueBtn: { marginTop: 30 },
});
