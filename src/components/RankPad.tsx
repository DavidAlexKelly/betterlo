// src/components/RankPad.tsx
// The guess pad: A, 2–10, J, Q, K.
//
// After the hint, ranks the card cannot be are dimmed and unpressable. That is
// presentation only — the engine would happily accept an impossible guess — but
// it stops someone wasting their second guess on a rank the app just ruled out.

import React from 'react';
import { View, Text, StyleSheet, Pressable, StyleProp, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors, Jack, Type } from '../styles/theme';
import { RANKS, rankLabel } from '../data/dealerData';

type Props = {
  onPick: (rank: number) => void;
  /**
   * Ranks that are still possible. Pass an empty array during the first guess
   * to leave every rank enabled.
   */
  allowedRanks?: number[];
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function RankPad({ onPick, allowedRanks = [], disabled = false, style }: Props) {
  const restricted = allowedRanks.length > 0;
  const allowed = new Set(allowedRanks);

  return (
    <View style={[styles.grid, style]}>
      {RANKS.map(rank => {
        const off = disabled || (restricted && !allowed.has(rank));
        return (
          <Pressable
            key={rank}
            disabled={off}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onPick(rank);
            }}
            style={({ pressed }: { pressed: boolean }) => [
              styles.key,
              off && styles.keyOff,
              pressed && !off && styles.keyPressed,
            ]}
          >
            <Text style={[styles.keyText, off && styles.keyTextOff]}>
              {rankLabel(rank)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  key: {
    width: 58,
    height: 48,
    borderRadius: Jack.radius,
    borderWidth: 2.5,
    borderColor: Colors.ink,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  keyPressed: { transform: [{ translateY: 3 }] },
  keyOff: {
    backgroundColor: Colors.surfaceContainerLow,
    borderColor: Colors.outlineVariant,
    opacity: 0.5,
  },
  keyText: { fontFamily: Type.display, fontSize: 19, color: Colors.ink },
  keyTextOff: { color: Colors.outline },
});
