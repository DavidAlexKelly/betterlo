// src/components/jack.tsx
// The Jackbox "sticker" UI kit — the whole redesign in three primitives.
//
//   JackButton  — solid fill, thick ink border, HARD offset shadow.
//                 Pressing physically drops the face onto its shadow.
//   JackPanel   — same construction, not pressable. Supports flex layouts
//                 (the game card uses flex:1) and optional tilt.
//   JackBadge   — small sticker chip for labels, counters and mode tags.
//
// How the hard shadow works (no images, no blur, works on iOS + Android):
//   ┌ outer View (position relative, transparent)
//   │   ├ shadow View — absolute, offset down by Jack.shadow, ink-colored
//   │   └ face View  — marginBottom: Jack.shadow, border + fill on top
//   Pressing animates the face's translateY from 0 → Jack.shadow.

import React, { useRef } from 'react';
import {
  View, Text, StyleSheet, Animated, Pressable,
  ViewStyle, TextStyle, StyleProp,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Jack, Type } from '../styles/theme';

// ─────────────────────────────────────────────────────────────
// JackButton
// ─────────────────────────────────────────────────────────────

type JackButtonProps = {
  label: string;
  onPress?: () => void;
  /** Face color. Defaults to buzzer yellow. */
  color?: string;
  /** Label/icon color. Defaults to ink. */
  textColor?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconLeft?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
  /** 'ghost' renders a stage-colored face for secondary actions. */
  variant?: 'solid' | 'ghost';
  tilt?: string;
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function JackButton({
  label, onPress, color = Colors.primary, textColor = Colors.ink,
  icon, iconLeft, disabled = false, size = 'large', variant = 'solid',
  tilt, haptic = true, style, textStyle,
}: JackButtonProps) {
  const drop = useRef(new Animated.Value(0)).current;

  const pressIn = () =>
    Animated.timing(drop, { toValue: Jack.shadow, duration: 70, useNativeDriver: true }).start();
  const pressOut = () =>
    Animated.timing(drop, { toValue: 0, duration: 110, useNativeDriver: true }).start();

  const handlePress = () => {
    if (disabled) return;
    if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress?.();
  };

  const isGhost = variant === 'ghost';
  const face = disabled
    ? Colors.surfaceContainerHigh
    : isGhost ? Colors.surfaceContainer : color;
  const ink = disabled
    ? Colors.outline
    : isGhost ? Colors.onSurface : textColor;

  const height = size === 'large' ? 60 : size === 'medium' ? 50 : 40;
  const fontSize = size === 'large' ? 17 : size === 'medium' ? 14 : 12;
  const iconSize = size === 'large' ? 20 : 16;

  return (
    <View style={[styles.btnOuter, tilt ? { transform: [{ rotate: tilt }] } : null, style]}>
      {!disabled && <View style={[styles.hardShadow, { borderRadius: Jack.radius }]} />}
      <Pressable
        onPress={handlePress}
        onPressIn={disabled ? undefined : pressIn}
        onPressOut={disabled ? undefined : pressOut}
        disabled={disabled}
      >
        <Animated.View
          style={[
            styles.btnFace,
            {
              height,
              backgroundColor: face,
              borderColor: disabled ? Colors.outlineVariant : Colors.ink,
              transform: [{ translateY: drop }],
            },
          ]}
        >
          {iconLeft && <Ionicons name={iconLeft} size={iconSize} color={ink} />}
          <Text style={[styles.btnLabel, { color: ink, fontSize }, textStyle]} numberOfLines={1}>
            {label}
          </Text>
          {icon && <Ionicons name={icon} size={iconSize} color={ink} />}
        </Animated.View>
      </Pressable>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// JackIconButton — square sticker with just an icon
// ─────────────────────────────────────────────────────────────

type JackIconButtonProps = {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  color?: string;
  iconColor?: string;
  size?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function JackIconButton({
  icon, onPress, color = Colors.surfaceContainer, iconColor = Colors.onSurface,
  size = 44, disabled = false, style,
}: JackIconButtonProps) {
  const drop = useRef(new Animated.Value(0)).current;
  const pressIn = () =>
    Animated.timing(drop, { toValue: Jack.shadow - 1, duration: 70, useNativeDriver: true }).start();
  const pressOut = () =>
    Animated.timing(drop, { toValue: 0, duration: 110, useNativeDriver: true }).start();

  return (
    <View style={[styles.btnOuter, style]}>
      {!disabled && <View style={[styles.hardShadow, { borderRadius: 12 }]} />}
      <Pressable
        onPress={disabled ? undefined : () => { Haptics.selectionAsync(); onPress?.(); }}
        onPressIn={disabled ? undefined : pressIn}
        onPressOut={disabled ? undefined : pressOut}
        disabled={disabled}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Animated.View
          style={[
            styles.iconFace,
            {
              width: size, height: size,
              backgroundColor: color,
              opacity: disabled ? 0.45 : 1,
              transform: [{ translateY: drop }],
            },
          ]}
        >
          <Ionicons name={icon} size={Math.round(size * 0.5)} color={iconColor} />
        </Animated.View>
      </Pressable>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// JackPanel — non-pressable sticker surface
// ─────────────────────────────────────────────────────────────

type JackPanelProps = {
  children: React.ReactNode;
  /** Face color. Defaults to a stage panel. */
  color?: string;
  /** Border color. Defaults to ink. */
  borderColor?: string;
  /** Shadow color. Defaults to ink. */
  shadowColor?: string;
  radius?: number;
  shadow?: number;
  tilt?: string;
  /** Style for the OUTER wrapper (use for flex/margins). */
  style?: StyleProp<ViewStyle>;
  /** Style for the face (use for padding/alignment). */
  faceStyle?: StyleProp<ViewStyle>;
  flex?: boolean;
};

export function JackPanel({
  children, color = Colors.surfaceContainer, borderColor = Colors.ink,
  shadowColor = Colors.ink, radius = Jack.radiusBig, shadow = Jack.shadow,
  tilt, style, faceStyle, flex = false,
}: JackPanelProps) {
  return (
    <View style={[flex && { flex: 1 }, tilt ? { transform: [{ rotate: tilt }] } : null, style]}>
      <View
        style={{
          position: 'absolute', top: shadow, left: 0, right: 0, bottom: 0,
          borderRadius: radius, backgroundColor: shadowColor,
        }}
      />
      <View
        style={[
          flex && { flex: 1 },
          {
            marginBottom: shadow,
            borderRadius: radius,
            borderWidth: Jack.border,
            borderColor,
            backgroundColor: color,
            overflow: 'hidden',
          },
          faceStyle,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// JackTile — a JackPanel you can press
//
// JackButton is pressable but fixed-height and single-line; JackPanel holds
// arbitrary content but isn't pressable. The game-mode menu needs both, so
// this is the panel construction wrapped in the button's press-drop.
// `disabled` renders a flat, dimmed, ink-outlined face with no shadow — used
// for modes that aren't built yet.
// ─────────────────────────────────────────────────────────────

type JackTileProps = {
  children: React.ReactNode;
  onPress?: () => void;
  color?: string;
  borderColor?: string;
  shadowColor?: string;
  radius?: number;
  shadow?: number;
  tilt?: string;
  disabled?: boolean;
  haptic?: boolean;
  /** Style for the OUTER wrapper (use for flex/margins). */
  style?: StyleProp<ViewStyle>;
  /** Style for the face (use for padding/alignment). */
  faceStyle?: StyleProp<ViewStyle>;
  flex?: boolean;
};

export function JackTile({
  children, onPress, color = Colors.surfaceContainer, borderColor = Colors.ink,
  shadowColor = Colors.ink, radius = Jack.radiusBig, shadow = Jack.shadow,
  tilt, disabled = false, haptic = true, style, faceStyle, flex = false,
}: JackTileProps) {
  const drop = useRef(new Animated.Value(0)).current;

  const pressIn = () =>
    Animated.timing(drop, { toValue: shadow, duration: 70, useNativeDriver: true }).start();
  const pressOut = () =>
    Animated.timing(drop, { toValue: 0, duration: 110, useNativeDriver: true }).start();

  const handlePress = () => {
    if (disabled) return;
    if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress?.();
  };

  return (
    <View style={[flex && { flex: 1 }, tilt ? { transform: [{ rotate: tilt }] } : null, style]}>
      {/* Hidden when disabled — but the face keeps its marginBottom, so
          locked and unlocked tiles stay exactly the same height. */}
      {!disabled && (
        <View
          style={{
            position: 'absolute', top: shadow, left: 0, right: 0, bottom: 0,
            borderRadius: radius, backgroundColor: shadowColor,
          }}
        />
      )}
      <Pressable
        onPress={handlePress}
        onPressIn={disabled ? undefined : pressIn}
        onPressOut={disabled ? undefined : pressOut}
        disabled={disabled}
        style={flex ? { flex: 1 } : undefined}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
      >
        <Animated.View
          style={[
            flex && { flex: 1 },
            {
              marginBottom: shadow,
              borderRadius: radius,
              borderWidth: Jack.border,
              borderColor: disabled ? Colors.outlineVariant : borderColor,
              backgroundColor: color,
              opacity: disabled ? 0.55 : 1,
              overflow: 'hidden',
              transform: [{ translateY: drop }],
            },
            faceStyle,
          ]}
        >
          {children}
        </Animated.View>
      </Pressable>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// JackBadge — small sticker chip
// ─────────────────────────────────────────────────────────────

type JackBadgeProps = {
  label: string;
  color?: string;
  textColor?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tilt?: string;
  style?: StyleProp<ViewStyle>;
};

export function JackBadge({
  label, color = Colors.primary, textColor = Colors.ink, icon, tilt, style,
}: JackBadgeProps) {
  return (
    <View style={[styles.btnOuter, tilt ? { transform: [{ rotate: tilt }] } : null, style]}>
      <View style={[styles.hardShadow, { borderRadius: 10, top: 3 }]} />
      <View style={[styles.badgeFace, { backgroundColor: color, marginBottom: 3 }]}>
        {icon && <Ionicons name={icon} size={13} color={textColor} />}
        <Text style={[styles.badgeText, { color: textColor }]}>{label}</Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// ConfettiDots — ambient stage decoration (pure Views, no images)
// ─────────────────────────────────────────────────────────────

const DOTS = [
  { top: '8%',  left: '8%',   size: 10, color: '#FF4D8D', rotate: '18deg',  shape: 'square' },
  { top: '14%', right: '10%', size: 8,  color: '#3EE6E0', rotate: '0deg',   shape: 'circle' },
  { top: '30%', left: '4%',   size: 7,  color: '#FFCC26', rotate: '45deg',  shape: 'square' },
  { top: '46%', right: '5%',  size: 9,  color: '#B6F44A', rotate: '30deg',  shape: 'square' },
  { top: '64%', left: '7%',   size: 8,  color: '#8C6BFF', rotate: '0deg',   shape: 'circle' },
  { top: '78%', right: '9%',  size: 10, color: '#FF7A3C', rotate: '20deg',  shape: 'square' },
] as const;

export function ConfettiDots({ opacity = 0.5 }: { opacity?: number }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {DOTS.map((d, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            top: d.top as any,
            ...('left' in d ? { left: (d as any).left } : { right: (d as any).right }),
            width: d.size, height: d.size,
            borderRadius: d.shape === 'circle' ? d.size / 2 : 2,
            backgroundColor: d.color,
            opacity,
            transform: [{ rotate: d.rotate }],
          }}
        />
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  btnOuter: { position: 'relative' },
  hardShadow: {
    position: 'absolute', top: Jack.shadow, left: 0, right: 0, bottom: 0,
    backgroundColor: Colors.ink,
  },
  btnFace: {
    marginBottom: Jack.shadow,
    borderRadius: Jack.radius,
    borderWidth: Jack.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingHorizontal: 22,
  },
  btnLabel: {
    fontFamily: Type.display,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  iconFace: {
    marginBottom: Jack.shadow - 1,
    borderRadius: 12,
    borderWidth: Jack.border,
    borderColor: Colors.ink,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeFace: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 2, borderColor: Colors.ink,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontFamily: Type.display, fontSize: 11, letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
