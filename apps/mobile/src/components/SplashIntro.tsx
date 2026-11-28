import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Route as RouteIcon } from 'lucide-react-native';
import { COLORS } from '../theme';

/**
 * Animated launch splash: logo scales & fades in, holds briefly, then
 * fades out smoothly into onboarding or the main app.
 */
export default function SplashIntro({ onDone }: { onDone: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.76)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const sequence = Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 520,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 7,
          tension: 65,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(550),
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: 340,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]);

    sequence.start(() => {
      onDone();
    });

    return () => sequence.stop();
  }, [containerOpacity, onDone, opacity, scale]);

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]}>
      <Animated.View style={[styles.logoWrap, { opacity, transform: [{ scale }] }]}>
        <View style={styles.badge}>
          <RouteIcon color={COLORS.accent} size={42} />
        </View>
        <Text style={styles.wordmark}>EasyDel</Text>
        <Text style={styles.tagline}>Routes &amp; stops made easy</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrap: {
    alignItems: 'center',
  },
  badge: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: COLORS.accentSoft,
    borderWidth: 1.5,
    borderColor: 'rgba(245, 158, 11, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  wordmark: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: COLORS.ink,
  },
  tagline: {
    marginTop: 6,
    fontSize: 14,
    color: COLORS.inkDim,
  },
});
