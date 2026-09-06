// src/components/WedgeTracker.tsx
// Shows which of the six wedges a player holds.
//
// Rendered as a row of ink-bordered pips rather than an actual pie: a real
// segmented circle needs react-native-svg, which isn't a dependency, and at
// header size a pie row is less legible than pips anyway. Swapping in a proper
// pie later only changes this file.

import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Jack, Type } from '../styles/theme';
import { WedgeId, WEDGES, WEDGE_IDS } from '../data/trivia/types';

type Props = {
  /** Wedges this player has won. */
  held: WedgeId[];
  /** Wedges in play this game. Defaults to all six. */
  wedges?: WedgeId[];
  size?: number;
  /** Show the wedge icon inside each earned pip. */
  showIcons?: boolean;
  /** Show "3/6" alongside. */
  showCount?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function WedgeTracker({
  held, wedges, size = 18, showIcons = false, showCount = false, style,
}: Props) {
  const inPlay = wedges && wedges.length > 0 ? wedges : [...WEDGE_IDS];
  const heldSet = new Set(held);

  return (
    <View style={[styles.row, style]}>
      {inPlay.map(id => {
        const wedge = WEDGES[id];
        const has = heldSet.has(id);
        return (
          <View
            key={id}
            style={[
              styles.pip,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: has ? wedge.color : 'transparent',
                borderColor: has ? Colors.ink : Colors.outlineVariant,
              },
            ]}
          >
            {has && showIcons && (
              <Ionicons
                name={wedge.icon as never}
                size={Math.round(size * 0.55)}
                color={Colors.ink}
              />
            )}
          </View>
        );
      })}

      {showCount && (
        <Text style={styles.count}>
          {heldSet.size}/{inPlay.length}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pip: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    fontFamily: Type.display,
    fontSize: 11,
    letterSpacing: 0.5,
    color: Colors.onSurfaceVariant,
    marginLeft: 4,
  },
});

export const WEDGE_TRACKER_BORDER = Jack.border;
