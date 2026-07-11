import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useAppState } from './store/useAppState';
import audioService from './services/audioService';
import { Viewfinder } from './components/Viewfinder';
import { InterruptionCanvas } from './components/InterruptionCanvas';

const BACKEND_WS_URL = 'ws://localhost:50051';

export default function App() {
  const {
    runtimeState,
    renderedAdUrl,
    agentLedger,
    setRuntimeState,
    setAdUrl,
    appendLedgerEntry,
    purgeEngine,
  } = useAppState();

  const wsRef = useRef<WebSocket | null>(null);
  const [sessionId, setSessionId] = useState(`session_${Date.now()}`);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      disconnectSession();
    };
  }, []);

  const initializeSession = () => {
    disconnectSession();
    purgeEngine();
    
    setRuntimeState('CONNECTED');
    console.log(`[App] Initializing WebSocket session at ${BACKEND_WS_URL}`);

    const ws = new WebSocket(BACKEND_WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[App] WebSocket Connection Open');
      // Send INIT_SESSION payload
      ws.send(
        JSON.stringify({
          type: 'INIT_SESSION',
          sessionId: sessionId,
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string);

        switch (message.type) {
          case 'STATE_MUTATION':
            console.log(`[App] State Mutation: ${message.state}`);
            setRuntimeState(message.state);

            if (message.state === 'BARGE_IN_FREEZE') {
              // Halts playback instantly on barge-in
              audioService.flushPlayback();
              appendLedgerEntry('Gemini live engine', 'User interruption registered. Flushing playback buffers.');
              // Reset back to streaming after showing animation overlay shortly
              setTimeout(() => {
                setRuntimeState('STREAMING');
              }, 1800);
            }
            break;

          case 'AUDIO_OUTPUT':
            if (message.audio) {
              audioService.playChunk(message.audio);
            }
            break;

          case 'AD_PREVIEW':
            if (message.url) {
              setAdUrl(message.url);
              appendLedgerEntry('Creative Agent', `New marketing video generated: ${message.url}`);
            }
            break;

          case 'AGENT_LOG':
            if (message.agentName && message.executionLog) {
              appendLedgerEntry(message.agentName, message.executionLog);
            }
            break;
        }
      } catch (err) {
        console.error('[App] WebSocket message parsing error:', err);
      }
    };

    ws.onerror = (err) => {
      console.error('[App] WebSocket Error:', err);
      setRuntimeState('DISCONNECTED');
    };

    ws.onclose = () => {
      console.log('[App] WebSocket Connection Closed');
      setRuntimeState('DISCONNECTED');
    };
  };

  const disconnectSession = () => {
    // Stop recording and player buffers
    audioService.stopRecording();
    audioService.flushPlayback();

    if (wsRef.current) {
      // Send cancel signal before closing
      try {
        wsRef.current.send(JSON.stringify({ type: 'USER_CANCEL' }));
      } catch (e) {}
      wsRef.current.close();
      wsRef.current = null;
    }
    setRuntimeState('DISCONNECTED');
  };

  const toggleStreamState = async () => {
    if (runtimeState === 'DISCONNECTED') {
      initializeSession();
    } else if (runtimeState === 'CONNECTED' || runtimeState === 'STREAMING' || runtimeState === 'BARGE_IN_FREEZE') {
      // Activate streaming mode
      setRuntimeState('STREAMING');
      await audioService.startRecording((chunk: string) => {
        // Send base64 PCM chunk directly over ws
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'AUDIO_INPUT',
              audio: chunk,
            })
          );
        }
      });
      appendLedgerEntry('Audio Controller', 'Microphone stream initialized at 16kHz PCM.');
    } else {
      // Stop streaming
      await audioService.stopRecording();
      setRuntimeState('CONNECTED');
      appendLedgerEntry('Audio Controller', 'Microphone stream suspended.');
    }
  };

  const handleFrameCapture = (base64Frame: string) => {
    // Send captured video frame to backend
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && runtimeState === 'STREAMING') {
      wsRef.current.send(
        JSON.stringify({
          type: 'VIDEO_INPUT',
          image: base64Frame,
        })
      );
    }
  };

  const getStatusColor = () => {
    switch (runtimeState) {
      case 'CONNECTED':
        return '#00ff00';
      case 'STREAMING':
        return '#00ffff';
      case 'BARGE_IN_FREEZE':
        return '#ff0055';
      case 'CREATIVE_PROCESSING':
        return '#ffaa00';
      default:
        return '#ff3b30';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.appTitle}>BHARATFLOW ENGINE</Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusIndicator, { backgroundColor: getStatusColor() }]} />
          <Text style={styles.statusText}>{runtimeState}</Text>
        </View>
      </View>

      {/* Main Stream Interaction Space */}
      <View style={styles.viewportContainer}>
        <Viewfinder
          active={runtimeState === 'STREAMING'}
          onFrame={handleFrameCapture}
        />
        <InterruptionCanvas active={runtimeState === 'BARGE_IN_FREEZE'} />
      </View>

      {/* Real-time Agent Log Ledger */}
      <View style={styles.ledgerSection}>
        <Text style={styles.sectionHeader}>SWARM AGENT LEDGER</Text>
        <ScrollView
          style={styles.ledgerScroll}
          contentContainerStyle={styles.ledgerContent}
        >
          {agentLedger.length === 0 ? (
            <Text style={styles.emptyLedgerText}>
              Launch session to inspect active Antigravity background worker logs.
            </Text>
          ) : (
            agentLedger.map((item, index) => (
              <View key={index} style={styles.ledgerEntry}>
                <Text style={styles.agentTag}>[{item.agent.toUpperCase()}]</Text>
                <Text style={styles.agentLogText}>{item.execution}</Text>
              </View>
            ))
          )}
        </ScrollView>
      </View>

      {/* Marketing Outcome Vector Display */}
      {renderedAdUrl && (
        <View style={styles.adBanner}>
          <Text style={styles.adBannerTitle}>⚡ LIVE MARKETING BANNER READY</Text>
          <Text style={styles.adBannerUrl} numberOfLines={1}>
            {renderedAdUrl}
          </Text>
        </View>
      )}

      {/* Interactive Controller buttons */}
      <View style={styles.controlsRow}>
        {runtimeState === 'DISCONNECTED' ? (
          <TouchableOpacity style={styles.primaryButton} onPress={initializeSession}>
            <Text style={styles.btnText}>INITIALIZE SESSION</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              style={[
                styles.actionButton,
                runtimeState === 'STREAMING' && styles.actionButtonActive,
              ]}
              onPress={toggleStreamState}
            >
              <Text style={[styles.btnText, runtimeState === 'STREAMING' && styles.btnTextActive]}>
                {runtimeState === 'STREAMING' ? 'SUSPEND STREAM' : 'START TALKING'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.dangerButton} onPress={disconnectSession}>
              <Text style={styles.btnText}>DISCONNECT</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  appTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '700',
  },
  viewportContainer: {
    height: '35%',
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  ledgerSection: {
    flex: 1,
    marginHorizontal: 16,
    backgroundColor: '#0c0c0c',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1a1a1a',
    padding: 12,
  },
  sectionHeader: {
    color: '#555',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  ledgerScroll: {
    flex: 1,
  },
  ledgerContent: {
    paddingBottom: 8,
  },
  emptyLedgerText: {
    color: '#444',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 32,
    lineHeight: 18,
  },
  ledgerEntry: {
    flexDirection: 'row',
    marginBottom: 8,
    alignItems: 'flex-start',
  },
  agentTag: {
    color: '#00ffff',
    fontSize: 10,
    fontWeight: 'bold',
    marginRight: 6,
    width: 120,
  },
  agentLogText: {
    color: '#eee',
    fontSize: 12,
    flex: 1,
  },
  adBanner: {
    backgroundColor: '#1c190a',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  adBannerTitle: {
    color: '#f59e0b',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 4,
  },
  adBannerUrl: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#00ffff',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionButtonActive: {
    backgroundColor: '#00ffff',
    borderColor: '#00ffff',
  },
  dangerButton: {
    flex: 0.8,
    backgroundColor: '#ff3b30',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 14,
  },
  btnTextActive: {
    color: '#000',
  },
});
