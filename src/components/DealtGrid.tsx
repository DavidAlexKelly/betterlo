// src/components/DealtGrid.tsx
// The cards laid out on the table, in the order they were dealt.
//
// Your rules say cards go face up "for people to see what's left in the deck",
// so this is deliberately the actual cards rather than a tally — players do
// their own counting.
//
// A full deck is 52 cards, which will not fit alongside the game UI, so this
// has two modes: a compact strip of the most recent few for the game screen,
// and a full wrapping grid for the expanded view.

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Colors, Type } from '../styles/theme';
import { Card } from '../data/dealerData';
import PlayingCard from './PlayingCard';

type Props = {
  cards: Card[];
  /** Strip mode: newest cards only, single row, no wrapping. */
  compact?: boolean;
  /** How many to show in compact mode. */
  compactLimit?: number;
};

export default function DealtGrid({ cards, compact = false, compactLimit = 10 }: Props) {
  if (cards.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          {compact ? 'Nothing dealt yet' : 'No cards on the table yet.'}
        </Text>
      </View>
    );
  }

  if (compact) {
    // Newest last, matching the physical layout, so the strip reads left to
    // right as the game has actually gone.
    const shown = cards.slice(-compactLimit);
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
      >
        {shown.map(card => (
          <PlayingCard key={card.id} card={card} size="small" />
        ))}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
      {cards.map(card => (
        <PlayingCard key={card.id} card={card} size="small" />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', gap: 5, alignItems: 'center', paddingRight: 8 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingBottom: 12,
  },
  empty: { paddingVertical: 10 },
  emptyText: {
    fontFamily: Type.body, fontSize: 12, color: Colors.outline,
  },
});
