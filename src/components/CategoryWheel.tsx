// src/components/CategoryWheel.tsx
// The category "spin".
//
// Not a rotating wheel — that needs react-native-svg, which isn't a
// dependency. Instead the highlight hops between the wedges and decelerates
// onto the target, slot-machine style. Same anticipation, no new packages,
// and it reads better than a spinning disc on a small screen.
//
// The TARGET IS DECIDED BEFORE THE ANIMATION RUNS: useTriviaEngine.beginTurn()
// already picked the wedge and drew the question. This only performs the
// reveal, then calls onSettled so the screen can show the question. Never
// derive the result from where the animation stops.

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Jack, Type } from '../styles/theme';
import { WedgeId, WEDGES } from '../data/trivia/types';

type Props = {
  /** Wedges in play — the highlight cycles through these. */
  wedges: WedgeId[];
  /** Where the spin must land. */
  target: WedgeId;
  /** Fires once the highlight has settled on `target`. */
  onSettled: () => void;
  /** Total spin duration, ms. */
  duration?: number;
};

export default function CategoryWheel({
  wedges, target, onSettled, duration = 1600,
}: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [settled, setSettled] = useState(false);
  const pop = useRef(new Animated.Value(0.9)).current;
  const settledRef = useRef(false);

  useEffect(() => {
    // Guard: a single-wedge game has nothing to animate.
    const targetIndex = Math.max(0, wedges.indexOf(target));
    if (wedges.length <= 1) {
      setActiveIndex(targetIndex);
      finish();
      return;
    }

    let cancelled = false;
    let elapsed = 0;
    let index = 0;
    // Enough extra hops that it always passes the target at least twice.
    const totalHops = wedges.length * 3 + targetIndex;
    let hop = 0;
    let timer: ReturnType<typeof setTimeout>;

    const step = () => {
      if (cancelled) return;
      index = (index + 1) % wedges.length;
      setActiveIndex(index);
      Haptics.selectionAsync();
      hop++;

      if (hop >= totalHops) {
        setActiveIndex(targetIndex);
        finish();
        return;
      }
      // Ease-out: each hop is slower than the last.
      const progress = hop / totalHops;
      const delay = 55 + Math.pow(progress, 2.4) * 260;
      elapsed += delay;
      timer = setTimeout(step, Math.min(delay, Math.max(40, duration - elapsed)));
    };

    timer = setTimeout(step, 60);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  function finish() {
    if (settledRef.current) return;
    settledRef.current = true;
    setSettled(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.spring(pop, {
      toValue: 1, tension: 90, friction: 6, useNativeDriver: true,
    }).start(() => onSettled());
  }

  const active = wedges[activeIndex] ?? target;
  const activeWedge = WEDGES[active];

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>{settled ? 'CATEGORY' : 'SPINNING…'}</Text>

      {/* The landed category, big */}
      <Animated.View style={{ transform: [{ scale: pop }] }}>
        <View style={styles.heroOuter}>
          <View style={[styles.heroShadow, { backgroundColor: Colors.ink }]} />
          <View style={[styles.heroFace, { backgroundColor: activeWedge.color }]}>
            <Ionicons name={activeWedge.icon as never} size={40} color={Colors.ink} />
            <Text style={styles.heroLabel}>{activeWedge.label.toUpperCase()}</Text>
          </View>
        </View>
      </Animated.View>

      {/* All wedges in play, current one lit */}
      <View style={styles.pipRow}>
        {wedges.map((id, i) => {
          const isActive = i === activeIndex;
          return (
            <View
              key={id}
              style={[
                styles.pip,
                {
                  backgroundColor: isActive ? WEDGES[id].color : Colors.surfaceContainerLow,
                  borderColor: isActive ? Colors.ink : Colors.outlineVariant,
                  transform: [{ scale: isActive ? 1.25 : 1 }],
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', gap: 20 },
  eyebrow: {
    fontFamily: Type.display, fontSize: 12, letterSpacing: 2.5,
    color: Colors.onSurfaceVariant,
  },
  heroOuter: { position: 'relative' },
  heroShadow: {
    position: 'absolute', top: Jack.shadowBig, left: 0, right: 0, bottom: 0,
    borderRadius: Jack.radiusBig,
  },
  heroFace: {
    minWidth: 240,
    paddingVertical: 28, paddingHorizontal: 26,
    marginBottom: Jack.shadowBig,
    borderRadius: Jack.radiusBig,
    borderWidth: Jack.border, borderColor: Colors.ink,
    alignItems: 'center', gap: 10,
  },
  heroLabel: {
    fontFamily: Type.display, fontSize: 20, letterSpacing: 1,
    color: Colors.ink, textAlign: 'center',
  },
  pipRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  pip: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
});
