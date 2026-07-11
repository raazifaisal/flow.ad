import { Platform } from 'react-native';

// Dynamically import Native Modules if they are linked.
// This prevents compile/runtime crashes in test environments or environments where
// the native dependencies are not fully compiled or running in an emulator without mic access.
let AudioRecorder: any = null;
let PCMPlayer: any = null;

try {
  const AudioModule = require('@dr.pogodin/react-native-audio');
  AudioRecorder = AudioModule.InputAudioStream;
} catch (e) {
  console.warn('[AudioService] Could not load @dr.pogodin/react-native-audio native module, falling back to mock recorder.');
}

try {
  PCMPlayer = require('react-native-pcm-audio').default;
} catch (e) {
  console.warn('[AudioService] Could not load react-native-pcm-audio native module, falling back to mock player.');
}

class AudioService {
  private static instance: AudioService;
  private recorderInstance: any = null;
  private playerInstance: any = null;
  private isRecording = false;

  private constructor() {
    this.initPlayer();
  }

  public static getInstance(): AudioService {
    if (!AudioService.instance) {
      AudioService.instance = new AudioService();
    }
    return AudioService.instance;
  }

  private initPlayer() {
    if (PCMPlayer) {
      try {
        // Initialize PCM Player for 24kHz Mono 16-bit PCM playback.
        this.playerInstance = new PCMPlayer({
          sampleRate: 24000,
          channels: 1,
          bitDepth: 16,
        });
        this.playerInstance.start();
      } catch (err) {
        console.error('[AudioService] Failed to initialize PCM Player:', err);
      }
    } else {
      console.log('[AudioService Mock] Player initialized at 24kHz Mono.');
    }
  }

  public async startRecording(onChunk: (base64Data: string) => void): Promise<void> {
    if (this.isRecording) return;
    this.isRecording = true;

    if (AudioRecorder) {
      try {
        // Initialize recorder for 16kHz Mono 16-bit PCM.
        this.recorderInstance = new AudioRecorder({
          sampleRate: 16000,
          channels: 1,
          bitDepth: 16,
          bufferSize: 1024,
        });

        this.recorderInstance.on('data', (chunk: string) => {
          // chunk is base64 PCM audio data
          onChunk(chunk);
        });

        this.recorderInstance.start();
        console.log('[AudioService] Hardware recording started at 16kHz.');
      } catch (err) {
        console.error('[AudioService] Failed to start native recording:', err);
      }
    } else {
      console.log('[AudioService Mock] Mock recording loop started.');
      // Start a mock audio loop sending empty/simulated silent base64 PCM frames every 100ms
      const sendMockFrame = () => {
        if (!this.isRecording) return;
        const mockSilentPcm = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='; // Dummy base64 silence
        onChunk(mockSilentPcm);
        setTimeout(sendMockFrame, 100);
      };
      sendMockFrame();
    }
  }

  public async stopRecording(): Promise<void> {
    if (!this.isRecording) return;
    this.isRecording = false;

    if (this.recorderInstance) {
      try {
        this.recorderInstance.stop();
        this.recorderInstance = null;
        console.log('[AudioService] Hardware recording stopped.');
      } catch (err) {
        console.error('[AudioService] Error stopping native recorder:', err);
      }
    } else {
      console.log('[AudioService Mock] Mock recording stopped.');
    }
  }

  public playChunk(base64Data: string): void {
    if (this.playerInstance) {
      try {
        // Enqueue the incoming PCM chunk.
        this.playerInstance.write(base64Data);
      } catch (err) {
        console.error('[AudioService] Error feeding PCM chunks to player:', err);
      }
    } else {
      // Mock playback trace
      console.log(`[AudioService Mock] Playing down-stream chunk of length: ${base64Data.length}`);
    }
  }

  public flushPlayback(): void {
    if (this.playerInstance) {
      try {
        // Halt playback and clear queue instantly (<3ms)
        this.playerInstance.stop();
        this.playerInstance.start();
        console.log('[AudioService] Audio output buffers flushed.');
      } catch (err) {
        console.error('[AudioService] Error flushing playback buffer:', err);
      }
    } else {
      console.log('[AudioService Mock] Audio buffers flushed instantly.');
    }
  }
}

export default AudioService.getInstance();
