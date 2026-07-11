import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Modality } from '@google/genai';
import dotenv from 'dotenv';
import { spawnContextIngestionSwarm } from './swarm';
import { ClientMessage, ServerMessage } from './types';

dotenv.config();

const PORT = 50051;
const TARGET_LIVE_MODEL = 'gemini-3.1-flash-live-preview';

// Initialize the Google GenAI SDK. 
// Note: It will pick up process.env.GEMINI_API_KEY automatically.
// The Live API sometimes requires apiVersion: 'v1alpha'. We'll configure it dynamically.
const ai = new GoogleGenAI({
  apiVersion: 'v1alpha'
});

const wss = new WebSocketServer({ port: PORT });
console.log(`[BharatFlow WebSocket Server serving at ws://localhost:${PORT}]`);

wss.on('connection', (ws: WebSocket) => {
  let liveSession: any = null;
  let currentSessionId = 'unknown';

  console.log('[Client Connected]');

  ws.on('message', async (data: string) => {
    try {
      const message: ClientMessage = JSON.parse(data);

      switch (message.type) {
        case 'INIT_SESSION':
          currentSessionId = message.sessionId || `session_${Date.now()}`;
          console.log(`[INIT_SESSION] Starting pipeline for session: ${currentSessionId}`);

          // 1. Spawning context ingestion swarm asynchronously (Control Plane)
          const contextId = await spawnContextIngestionSwarm(currentSessionId);
          console.log(`[Control Plane Swarm] Initialized with Context ID: ${contextId}`);

          // Send confirmation state back to the client
          const welcomeMsg: ServerMessage = {
            type: 'STATE_MUTATION',
            state: 'CONNECTED'
          };
          ws.send(JSON.stringify(welcomeMsg));

          // 2. Establishing full-duplex session to Google's live gateways
          try {
            liveSession = await ai.live.connect({
              model: TARGET_LIVE_MODEL,
              config: {
                responseModalities: [Modality.AUDIO],
                systemInstruction: `Inject local context vectors from interaction token: ${contextId}. Run real-time QA layers to enforce layout contrast limits.`,
              },
              callbacks: {
                onopen: () => {
                  console.log(`[Gemini WebSocket Connected] Session: ${currentSessionId}`);
                  const startMsg: ServerMessage = {
                    type: 'STATE_MUTATION',
                    state: 'STREAMING'
                  };
                  ws.send(JSON.stringify(startMsg));
                },
                onmessage: (msg: any) => {
                  // Interruption Recovery Branch (Barge-In)
                  if (msg.serverContent?.interrupted) {
                    console.log(`[Interruption Alert] Barge-in detected on ${currentSessionId}`);
                    const bMsg: ServerMessage = {
                      type: 'STATE_MUTATION',
                      state: 'BARGE_IN_FREEZE'
                    };
                    ws.send(JSON.stringify(bMsg));
                    return;
                  }

                  // Downstream Media Output Pipeline
                  const parts = msg.serverContent?.modelTurn?.parts;
                  if (parts && parts.length > 0) {
                    for (const part of parts) {
                      if (part.inlineData) {
                        const audioBase64 = part.inlineData.data;
                        const responseMsg: ServerMessage = {
                          type: 'AUDIO_OUTPUT',
                          audio: audioBase64
                        };
                        ws.send(JSON.stringify(responseMsg));
                      }
                    }
                  }
                },
                onerror: (err: any) => {
                  console.error(`[Gemini SDK Streaming Error on ${currentSessionId}]:`, err.message || err);
                },
                onclose: () => {
                  console.log(`[Gemini Session Closed]: ${currentSessionId}`);
                  const closedMsg: ServerMessage = {
                    type: 'STATE_MUTATION',
                    state: 'DISCONNECTED'
                  };
                  ws.send(JSON.stringify(closedMsg));
                }
              }
            });
          } catch (connErr) {
            console.error('[Gemini live.connect Failure]:', connErr);
            ws.send(JSON.stringify({
              type: 'STATE_MUTATION',
              state: 'DISCONNECTED'
            }));
          }
          break;

        case 'AUDIO_INPUT':
          if (liveSession && message.audio) {
            liveSession.sendRealtimeInput({
              mediaChunks: [
                {
                  mimeType: 'audio/pcm;rate=16000',
                  data: message.audio
                }
              ]
            });
          }
          break;

        case 'VIDEO_INPUT':
          if (liveSession && message.image) {
            liveSession.sendRealtimeInput({
              mediaChunks: [
                {
                  mimeType: 'image/jpeg',
                  data: message.image
                }
              ]
            });
          }
          break;

        case 'USER_CANCEL':
          console.log(`[USER_CANCEL] Disposing session: ${currentSessionId}`);
          if (liveSession) {
            liveSession.close();
            liveSession = null;
          }
          ws.send(JSON.stringify({
            type: 'STATE_MUTATION',
            state: 'DISCONNECTED'
          }));
          break;
      }
    } catch (err) {
      console.error('[Client Message Processing Error]:', err);
    }
  });

  ws.on('close', () => {
    console.log(`[Client Disconnected] Session ID: ${currentSessionId}`);
    if (liveSession) {
      liveSession.close();
      liveSession = null;
    }
  });
});
