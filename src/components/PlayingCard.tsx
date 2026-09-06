// src/components/PlayingCard.tsx
// A playing card in the app's sticker style: chalk-paper face, thick ink
// border, hard offset shadow. Face-down shows an indigo back so the guessing
// phases have something solid to look at.

import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Colors, Jack, Type } from '../styles/theme';
import { Card, SUIT_SYMBOLS, isRedSuit, rankLabel } from '../data/dealerData';

/** Red that reads on the chalk paper face without looking like an error state. */
export const CARD_RED = '#C6283C';

type Size = 'small' | 'medium' | 'large';

const DIMENSIONS: Record<Size, { w: number; h: number; rank: number; suit: number }> = {
  small: { w: 30, h: 42, rank: 13, suit: 11 },
  medium: { w: 62, h: 86, rank: 24, suit: 20 },
  large: { w: 132, h: 186, rank: 54, suit: 44 },
};

type Props = {
  /** null renders a face-down back. */
  card: Card | null;
  size?: Size;
  /** Force the back even when a card is supplied. */
  faceDown?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function PlayingCard({ card, size = 'medium', faceDown = false, style }: Props) {
  const d = DIMENSIONS[size];
  const showBack = faceDown || card == null;
  const shadow = size === 'large' ? Jack.shadowBig : Jack.shadow;

  return (
    <View style={[{ width: d.w, height: d.h + shadow }, style]}>
      <View
        style={[
          styles.shadow,
          { top: shadow, borderRadius: size === 'small' ? 5 : Jack.radius },
        ]}
      />
      <View
        style={[
          styles.face,
          {
            width: d.w,
            height: d.h,
            borderRadius: size === 'small' ? 5 : Jack.radius,
            borderWidth: size === 'small' ? 2 : Jack.border,
            backgroundColor: showBack ? Colors.surfaceContainerHigh : Colors.paper,
          },
        ]}
      >
        {showBack ? (
          <View style={styles.backMark}>
            <Text style={[styles.backText, { fontSize: d.suit }]}>?</Text>
          </View>
        ) : (
          <>
            <Text
              style={[
                styles.rank,
                { fontSize: d.rank, color: isRedSuit(card!.suit) ? CARD_RED : Colors.ink },
              ]}
            >
              {rankLabel(card!.rank)}
            </Text>
            <Text
              style={[
                styles.suit,
                { fontSize: d.suit, color: isRedSuit(card!.suit) ? CARD_RED : Colors.ink },
              ]}
            >
              {SUIT_SYMBOLS[card!.suit]}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: Colors.ink,
  },
  face: {
    borderColor: Colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  rank: { fontFamily: Type.display, lineHeight: undefined },
  suit: { fontFamily: Type.body, marginTop: -2 },
  backMark: { alignItems: 'center', justifyContent: 'center' },
  backText: { fontFamily: Type.display, color: Colors.outline },
});
