class AudioService {
  private static instance: AudioService;
  private audioContext: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  
  // Playback scheduler variables
  private playbackContext: AudioContext | null = null;
  private nextPlayTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private isRecording = false;

  private constructor() {}

  public static getInstance(): AudioService {
    if (!AudioService.instance) {
      AudioService.instance = new AudioService();
    }
    return AudioService.instance;
  }

  // Initialize playback AudioContext at 24000Hz (matching Gemini output sample rate)
  private initPlayback() {
    if (!this.playbackContext) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.playbackContext = new AudioCtx({ sampleRate: 24000 });
      this.nextPlayTime = this.playbackContext.currentTime;
    }
    if (this.playbackContext.state === 'suspended') {
      this.playbackContext.resume();
    }
  }

  public async startRecording(onChunk: (base64Data: string) => void): Promise<void> {
    if (this.isRecording) return;

    // Guard: getUserMedia requires a secure context (HTTPS or localhost)
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      const err = new Error('INSECURE_CONTEXT');
      err.name = 'InsecureContextError';
      throw err;
    }

    this.isRecording = true;

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();
      this.micSource = this.audioContext.createMediaStreamSource(this.micStream);

      const bufferSize = 2048;
      this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
      
      const inputSampleRate = this.audioContext.sampleRate;
      const targetSampleRate = 16000;

      this.processorNode.onaudioprocess = (e) => {
        if (!this.isRecording) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = this.downsampleAndEncodePCM(inputData, inputSampleRate, targetSampleRate);
        if (pcmData.length > 0) {
          const base64 = this.arrayBufferToBase64(pcmData.buffer as ArrayBuffer);
          onChunk(base64);
        }
      };

      this.micSource.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);
      console.log(`[AudioService] Mic capture started. Downsampling from ${inputSampleRate}Hz to ${targetSampleRate}Hz.`);
    } catch (err: any) {
      this.isRecording = false;
      console.error('[AudioService] Error starting audio capture:', err);
      throw err;  // always re-throw so App.tsx can show the banner
    }
  }

  public stopRecording(): void {
    if (!this.isRecording) return;
    this.isRecording = false;

    try {
      if (this.processorNode) {
        this.processorNode.disconnect();
        this.processorNode = null;
      }
      if (this.micSource) {
        this.micSource.disconnect();
        this.micSource = null;
      }
      if (this.audioContext) {
        this.audioContext.close();
        this.audioContext = null;
      }
      if (this.micStream) {
        this.micStream.getTracks().forEach((track) => track.stop());
        this.micStream = null;
      }
      console.log('[AudioService] Mic capture stopped.');
    } catch (err) {
      console.error('[AudioService] Error stopping audio capture:', err);
    }
  }

  // Play a chunk of base64-encoded 24kHz Int16 Mono PCM
  public playChunk(base64Data: string): void {
    this.initPlayback();
    if (!this.playbackContext) return;

    try {
      const arrayBuffer = this.base64ToArrayBuffer(base64Data);
      const int16Array = new Int16Array(arrayBuffer);
      const float32Array = new Float32Array(int16Array.length);

      // Convert Int16 PCM range [-32768, 32767] to Float32 [-1.0, 1.0]
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }

      // Create AudioBuffer
      const audioBuffer = this.playbackContext.createBuffer(1, float32Array.length, 24000);
      audioBuffer.copyToChannel(float32Array, 0);

      // Create BufferSourceNode
      const source = this.playbackContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.playbackContext.destination);

      // Precise scheduling to prevent gaps (overlapping/clicking)
      const currentTime = this.playbackContext.currentTime;
      if (this.nextPlayTime < currentTime) {
        this.nextPlayTime = currentTime;
      }

      source.start(this.nextPlayTime);
      this.activeSources.push(source);

      // Update next scheduler mark
      this.nextPlayTime += audioBuffer.duration;

      // Cleanup finished sources from list
      source.onended = () => {
        const index = this.activeSources.indexOf(source);
        if (index > -1) {
          this.activeSources.splice(index, 1);
        }
      };
    } catch (err) {
      console.error('[AudioService] Error playing audio chunk:', err);
    }
  }

  // Instant Flush (Barge-In)
  public flushPlayback(): void {
    console.log(`[AudioService] Flushing playback. Stopping ${this.activeSources.length} active buffers.`);
    
    // Stop all active sources instantly
    this.activeSources.forEach((source) => {
      try {
        source.stop();
      } catch (e) {}
    });
    this.activeSources = [];
    
    // Reset play timeline to current
    if (this.playbackContext) {
      this.nextPlayTime = this.playbackContext.currentTime;
    }
  }

  // Linear interpolation downsampling
  private downsampleAndEncodePCM(
    inputData: Float32Array,
    inputSampleRate: number,
    targetSampleRate: number
  ): Int16Array {
    if (targetSampleRate === inputSampleRate) {
      return this.float32ToInt16(inputData);
    }

    const ratio = inputSampleRate / targetSampleRate;
    const newLength = Math.round(inputData.length / ratio);
    const result = new Int16Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const nextIndex = Math.round(i * ratio);
      // Bound check
      if (nextIndex >= inputData.length) break;

      // Convert Float32 [-1.0, 1.0] to Int16 [-32768, 32767]
      const sample = Math.max(-1, Math.min(1, inputData[nextIndex]));
      result[i] = sample < 0 ? sample * 32768 : sample * 32767;
    }
    return result;
  }

  private float32ToInt16(input: Float32Array): Int16Array {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 32768 : s * 32767;
    }
    return output;
  }

  // Helper converters
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

export default AudioService.getInstance();
