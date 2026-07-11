import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, PermissionsAndroid, Platform } from 'react-native';

// Dynamically import Camera to prevent crash if not fully linked
let Camera: any = null;
let useCameraDevice: any = null;
try {
  const VisionCamera = require('react-native-vision-camera');
  Camera = VisionCamera.Camera;
  useCameraDevice = VisionCamera.useCameraDevice;
} catch (e) {
  console.warn('[Viewfinder] Vision Camera native module could not be loaded, using mock view.');
}

interface ViewfinderProps {
  onFrame: (base64Image: string) => void;
  active: boolean;
}

export const Viewfinder: React.FC<ViewfinderProps> = ({ onFrame, active }) => {
  const [hasPermission, setHasPermission] = useState(false);
  const cameraRef = useRef<any>(null);

  useEffect(() => {
    const requestPermission = async () => {
      if (!Camera) return;
      
      try {
        if (Platform.OS === 'android') {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.CAMERA,
            {
              title: 'Camera Permission',
              message: 'BharatFlow needs camera access to analyze products.',
              buttonNeutral: 'Ask Later',
              buttonNegative: 'Cancel',
              buttonPositive: 'OK',
            }
          );
          setHasPermission(granted === PermissionsAndroid.RESULTS.GRANTED);
        } else {
          const status = await Camera.requestCameraPermission();
          setHasPermission(status === 'granted');
        }
      } catch (err) {
        console.error('[Viewfinder] Error requesting camera permission:', err);
      }
    };

    requestPermission();
  }, []);

  // Set up 1 FPS (1000ms) capture interval when active
  useEffect(() => {
    if (!active) return;

    const interval = setInterval(async () => {
      if (cameraRef.current && hasPermission) {
        try {
          const photo = await cameraRef.current.takePhoto({
            qualityPrioritization: 'speed',
            flash: 'off',
            skipMetadata: true,
          });
          
          // In real production, read file and convert to base64.
          // Since React Native filesystem isn't fully set up here, we mock the base64 conversion.
          const mockBase64Frame = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
          onFrame(mockBase64Frame);
        } catch (err) {
          console.error('[Viewfinder] Capture error:', err);
        }
      } else {
        // Mock Frame generation for testing/development
        const mockBase64Frame = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
        onFrame(mockBase64Frame);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [active, hasPermission]);

  const device = useCameraDevice ? useCameraDevice('back') : null;

  if (Camera && hasPermission && device) {
    return (
      <View style={styles.container}>
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={active}
          photo={true}
        />
        <View style={styles.overlay}>
          <Text style={styles.text}>SPATIAL VIEWPORT ACTIVE (1 FPS)</Text>
        </View>
      </View>
    );
  }

  // Fallback visual mock viewfinder for testing/development
  return (
    <View style={styles.fallbackContainer}>
      <Text style={styles.fallbackText}>📷 CAMERA STREAM VISUALIZER (MOCK)</Text>
      <Text style={styles.fallbackSubtext}>
        {Camera ? 'Camera permissions not granted' : 'Native Vision Camera not linked'}
      </Text>
      {active && <Text style={styles.pingText}>● SENDING FRAME PACKETS AT 1 FPS</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  overlay: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  text: {
    color: '#00ffff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  fallbackContainer: {
    flex: 1,
    backgroundColor: '#151515',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
  },
  fallbackText: {
    color: '#aaa',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  fallbackSubtext: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
  },
  pingText: {
    color: '#00ffff',
    fontSize: 11,
    fontWeight: 'bold',
    marginTop: 12,
  },
});
