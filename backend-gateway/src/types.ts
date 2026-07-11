export type ClientMessageType = 'INIT_SESSION' | 'AUDIO_INPUT' | 'VIDEO_INPUT' | 'USER_CANCEL' | 'UPDATE_CONTEXT';

export interface ClientMessage {
  type: ClientMessageType;
  sessionId?: string;
  audio?: string; // base64 encoded mono PCM 16kHz
  image?: string; // base64 encoded JPEG
  businessProfile?: {
    businessName: string;
    merchantLocation: string;
    businessCategory: string;
    targetLanguage: string;
  };
  manifest?: {
    local_event: string;
    environmental_trigger: string;
    neighborhood_slangs: string;
    recommended_copy_strategy: string;
  };
}

export type ServerMessageType = 'STATE_MUTATION' | 'AUDIO_OUTPUT' | 'AD_PREVIEW' | 'AGENT_LOG' | 'MANIFEST_UPDATED';

export interface ServerMessage {
  type: ServerMessageType;
  state?: 'DISCONNECTED' | 'CONNECTED' | 'STREAMING' | 'BARGE_IN_FREEZE' | 'CREATIVE_PROCESSING';
  audio?: string; // base64 encoded mono PCM 24kHz
  url?: string;
  agentName?: string;
  executionLog?: string;
  manifest?: {
    local_event: string;
    environmental_trigger: string;
    neighborhood_slangs: string;
    recommended_copy_strategy: string;
  };
}
