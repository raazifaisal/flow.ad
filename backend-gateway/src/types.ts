export type ClientMessageType = 'INIT_SESSION' | 'AUDIO_INPUT' | 'VIDEO_INPUT' | 'USER_CANCEL' | 'TEXT_INPUT';

export interface ClientMessage {
  type: ClientMessageType;
  sessionId?: string;
  audio?: string; // base64 encoded mono PCM 16kHz
  image?: string; // base64 encoded JPEG
  text?: string;  // text command representing transcribed voice
}

export type ServerMessageType = 'STATE_MUTATION' | 'AUDIO_OUTPUT' | 'AD_PREVIEW' | 'AGENT_LOG';

export interface ServerMessage {
  type: ServerMessageType;
  state?: 'DISCONNECTED' | 'CONNECTED' | 'STREAMING' | 'BARGE_IN_FREEZE' | 'CREATIVE_PROCESSING';
  audio?: string; // base64 encoded mono PCM 24kHz
  url?: string;
  stillUrl?: string;
  cinematicUrl?: string;
  keyframes?: string[];
  agentName?: string;
  executionLog?: string;
}
