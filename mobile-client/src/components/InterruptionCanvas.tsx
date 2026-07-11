import React, { useEffect } from 'react';
import { StyleSheet, View, Text, Animated } from 'react-native';

// Dynamically import Reanimated to support environments without native linking
let AnimatedView: any = null;
let useSharedValue: any = null;
let useAnimatedStyle: any = null;
let withRepeat: any = null;
let withTiming: any = null;
let withSequence: any = null;

try {
  const Reanimated = require('react-native-reanimated');
  AnimatedView = Reanimated.default.View;
  useSharedValue = Reanimated.useSharedValue;
  useAnimatedStyle = Reanimated.useAnimatedStyle;
  withRepeat = Reanimated.withRepeat;
  withTiming = Reanimated.withTiming;
  withSequence = Reanimated.withSequence;
} catch (e) {
  console.warn('[InterruptionCanvas] Reanimated not linked, falling back to standard Animated API.');
}

interface InterruptionCanvasProps {
  active: boolean;
}

export const InterruptionCanvas: React.FC<InterruptionCanvasProps> = ({ active }) => {
  // Fallback Animated value
  const pulseAnim = React.useRef(new Animated.Value(0)).current;

  // Reanimated shared value
  const pulseShared = useSharedValue ? useSharedValue(0) : null;

  useEffect(() => {
    if (active) {
      if (pulseShared) {
        pulseShared.value = withRepeat(
          withSequence(
            withTiming(1, { duration: 600 }),
            withTiming(0.2, { duration: 600 })
          ),
          -1,
          true
        );
      } else {
        // Standard Animated API loop
        Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 600,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 0.2,
              duration: 600,
              useNativeDriver: true,
            }),
          ])
        ).start();
      }
    } else {
      if (pulseShared) {
        pulseShared.value = 0;
      } else {
        pulseAnim.setValue(0);
      }
    }
  }, [active]);

  // Create style structures
  let borderStyle = {};
  if (pulseShared && useAnimatedStyle) {
    borderStyle = useAnimatedStyle(() => {
      return {
        opacity: pulseShared.value,
        borderColor: '#00ffff',
      };
    });
  } else {
    borderStyle = {
      opacity: pulseAnim,
      borderColor: '#00ffff',
    };
  }

  if (!active) return null;

  const OutputView = AnimatedView || Animated.View;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <OutputView style={[styles.pulseBorder, borderStyle]}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>BARGE-IN REGISTERED</Text>
        </View>
      </OutputView>
    </View>
  );
};

const styles = StyleSheet.create({
  pulseBorder: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    borderWidth: 3,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#00ffff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 15,
  },
  badge: {
    backgroundColor: '#00ffff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#00ffff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  badgeText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
  },
});
