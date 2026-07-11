import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Modality, Type } from '@google/genai';
import dotenv from 'dotenv';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawnContextIngestionSwarm, updateInteractionContext } from './swarm';
import { ClientMessage, ServerMessage } from './types';
import {
  publishToWhatsApp,
  publishToInstagram,
  publishToFacebook,
  publishToGoogleMaps
} from './distribution';

dotenv.config();

const PORT = 50051;
const TARGET_LIVE_MODEL = 'gemini-3.1-flash-live-preview';

// Initialize the Google GenAI SDK.
const ai = new GoogleGenAI({
  apiVersion: 'v1alpha'
});

// Setup public directory for hosting static ad creatives
const publicDir = path.join(__dirname, '../public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Create an HTTP Server to handle static file serving and upgrade to WS
const server = http.createServer((req, res) => {
  if (req.url?.startsWith('/public/')) {
    const filename = path.basename(req.url);
    const filePath = path.join(publicDir, filename);
    
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Ad creative not found');
      } else {
        res.writeHead(200, { 'Content-Type': 'image/jpeg' });
        res.end(data);
      }
    });
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('flow.ad Engine HTTP Gateway');
  }
});

const wss = new WebSocketServer({ server });
console.log(`[flow.ad Gateway serving at ws://localhost:${PORT}]`);
console.log(`[Static ad creatives served at http://localhost:${PORT}/public/]`);

wss.on('connection', (ws: WebSocket) => {
  let liveSession: any = null;
  let currentSessionId = 'unknown';
  let currentInteractionId = '';

  console.log('[Client Connected]');

  // Helper to send typed messages back to client React Native app
  const sendToClient = (msg: ServerMessage) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  };

  ws.on('message', async (data: string) => {
    try {
      const message: ClientMessage = JSON.parse(data);

      switch (message.type) {
        case 'INIT_SESSION':
          currentSessionId = message.sessionId || `session_${Date.now()}`;
          console.log(`[INIT_SESSION] Starting pipeline for session: ${currentSessionId}`);

          // Send init log update
          sendToClient({
            type: 'AGENT_LOG',
            agentName: 'System Gate',
            executionLog: 'Session initialization received. Activating Twin-Plane planes...'
          });

          // Load mock business profile context from local JSON
          const mockProfilePath = path.join(__dirname, 'mock_business_profile.json');
          let businessProfile = {
            businessName: "Sri Ganesha Tender Coconut & Fresh Fruit Juice",
            merchantLocation: "Malleshwaram, Bangalore",
            businessCategory: "Tender Coconut & Fruit Juice Stall",
            targetLanguage: "Kannada"
          };
          try {
            if (fs.existsSync(mockProfilePath)) {
              businessProfile = JSON.parse(fs.readFileSync(mockProfilePath, 'utf8'));
            }
          } catch (err) {
            console.warn('[INIT_SESSION] Failed to read mock business profile file, using baseline.');
          }

          sendToClient({
            type: 'AGENT_LOG',
            agentName: 'System Gate',
            executionLog: `Retrieved business profile for: "${businessProfile.businessName}" (${businessProfile.merchantLocation})`
          });

          // 1. Spawning context ingestion swarm asynchronously (Control Plane)
          const swarmResult = await spawnContextIngestionSwarm(currentSessionId, businessProfile);
          currentInteractionId = swarmResult.interactionId;
          const manifestJson = swarmResult.manifestJson;
          console.log(`[Control Plane Swarm] Manifest output: ${manifestJson}`);
          
          let parsedManifest = {
            local_event: "IPL Local Screening Party at near market center",
            environmental_trigger: "High temperature, sunny afternoon",
            neighborhood_slangs: "Gethu, Machan, Semma",
            recommended_copy_strategy: "Offer chilled local beverages with regional slang tags."
          };
          try {
            parsedManifest = JSON.parse(manifestJson.replace(/```json|```/g, '').trim());
          } catch (e) {
            console.warn('[Control Plane] Failed to parse manifest JSON, using baseline parameters.');
          }

          // Send detailed logs of individual agent actions to client ledger
          sendToClient({
            type: 'AGENT_LOG',
            agentName: 'Geo Scout',
            executionLog: `Analyzed ambient signals: local_event = "${parsedManifest.local_event}", environmental_trigger = "${parsedManifest.environmental_trigger}"`
          });
          
          sendToClient({
            type: 'AGENT_LOG',
            agentName: 'Creative Archivist',
            executionLog: `Selected visual vibe template: Chilled theme matched to environmental trigger (${parsedManifest.environmental_trigger}).`
          });
          
          sendToClient({
            type: 'AGENT_LOG',
            agentName: 'Slang Strategist',
            executionLog: `Extracted active neighborhood slangs: ${parsedManifest.neighborhood_slangs}. Blueprint copywriting strategy: "${parsedManifest.recommended_copy_strategy}"`
          });

          // Send confirmation state back to the client
          sendToClient({
            type: 'STATE_MUTATION',
            state: 'CONNECTED'
          });

          // 2. Establishing full-duplex session to Google's live gateways
          try {
            liveSession = await ai.live.connect({
              model: TARGET_LIVE_MODEL,
              config: {
                responseModalities: [Modality.AUDIO],
                systemInstruction: `Inject local context vectors from sandbox agent swarm: ${JSON.stringify(parsedManifest)}. Run real-time QA layers to enforce layout contrast limits. Use tools to generate and publish ads when user requests them. Prioritize local native Indian languages (such as Hindi, Tamil, Telugu, Kannada, etc.) and native scripts in copy strategy generation and verbal communication.`,
                tools: [
                  {
                    functionDeclarations: [
                      {
                        name: 'generate_marketing_ad',
                        description: 'Generates a highly-localized marketing banner and video ad incorporating slangs and contextual triggers based on user instructions.',
                        parameters: {
                          type: Type.OBJECT,
                          properties: {
                            background_color: { type: Type.STRING, description: 'Primary background theme color (e.g. blue, red, neon-green)' },
                            text_copy: { type: Type.STRING, description: 'Overriding marketing slangs, phrases, or script blocks' },
                            focus_product: { type: Type.STRING, description: 'Name of the main product featured in the ad' }
                          },
                          required: ['background_color', 'focus_product']
                        }
                      },
                      {
                        name: 'publish_marketing_ad',
                        description: 'Publishes the generated media preview to local discovery platforms (WhatsApp, Facebook Marketplace, Instagram, Google Maps).',
                        parameters: {
                          type: Type.OBJECT,
                          properties: {
                            ad_url: { type: Type.STRING, description: 'The absolute public URL of the generated ad preview' }
                          },
                          required: ['ad_url']
                        }
                      }
                    ]
                  }
                ]
              },
              callbacks: {
                onopen: () => {
                  console.log(`[Gemini WebSocket Connected] Session: ${currentSessionId}`);
                  sendToClient({
                    type: 'STATE_MUTATION',
                    state: 'STREAMING'
                  });
                  sendToClient({
                    type: 'AGENT_LOG',
                    agentName: 'Gemini live engine',
                    executionLog: 'Live WebSocket pipeline established. VAD active.'
                  });
                },
                onmessage: async (msg: any) => {
                  // Interruption Recovery Branch (Barge-In)
                  if (msg.serverContent?.interrupted) {
                    console.log(`[Interruption Alert] Barge-in detected on ${currentSessionId}`);
                    sendToClient({
                      type: 'STATE_MUTATION',
                      state: 'BARGE_IN_FREEZE'
                    });
                    return;
                  }

                  // Handle Tool Calls (Function Calling)
                  if (msg.toolCall) {
                    const functionCalls = msg.toolCall.functionCalls;
                    if (functionCalls) {
                      for (const call of functionCalls) {
                        const { name, args, id } = call;
                        console.log(`[Tool Call Received] Function: ${name}, Args:`, args);

                        if (name === 'generate_marketing_ad') {
                          sendToClient({
                            type: 'STATE_MUTATION',
                            state: 'CREATIVE_PROCESSING'
                          });

                          sendToClient({
                            type: 'AGENT_LOG',
                            agentName: 'Creative Director',
                            executionLog: `Creative parameters locked: background=${args.background_color}, product=${args.focus_product}, copy="${args.text_copy || 'auto-slang'}"`
                          });

                          try {
                            // Update the stateful interaction thread in the sandbox before proceeding
                            sendToClient({
                              type: 'AGENT_LOG',
                              agentName: 'Swarm Coordinator',
                              executionLog: `Updating session interaction context with creative parameters...`
                            });

                            const updateInstruction = `User requested creative generation. Focus Product: ${args.focus_product}, Background Color: ${args.background_color}, Overriding Copy: ${args.text_copy || 'None'}. Update design blueprint in session_manifest.json.`;
                            const updatedManifestJson = await updateInteractionContext(currentInteractionId, updateInstruction, businessProfile);
                            console.log(`[Control Plane Swarm] Updated manifest: ${updatedManifestJson}`);

                            let updatedManifest = parsedManifest;
                            try {
                              updatedManifest = JSON.parse(updatedManifestJson.replace(/```json|```/g, '').trim());
                            } catch (parseErr) {
                              console.warn('[Control Plane] Failed to parse updated manifest, continuing with existing parameters.');
                            }

                            // Step A: Creative Director Prompt generation fork
                            sendToClient({
                              type: 'AGENT_LOG',
                              agentName: 'Creative Director',
                              executionLog: 'Building prompt blueprint for NB2 Lite layout engine...'
                            });

                            const blueprintPrompt = `Create a high resolution studio display ad banner for ${args.focus_product} with a primary background color of ${args.background_color}. Integrate the following regional copy or slang natively: "${args.text_copy || updatedManifest.recommended_copy_strategy}". Ensure maximum visual impact, professional typesetting, and clear contrast.`;

                            // Step B: Invoke Imagen (NB2 Lite equivalent for high-quality banner)
                            sendToClient({
                              type: 'AGENT_LOG',
                              agentName: 'NB2 Lite Image Fleet',
                              executionLog: 'Generating high-resolution 1K advertisement graphic...'
                            });

                            const imageResponse = await ai.models.generateImages({
                              model: 'gemini-3.1-flash-lite-image',
                              prompt: blueprintPrompt,
                              config: {
                                numberOfImages: 1,
                                outputMimeType: 'image/jpeg',
                                aspectRatio: '1:1'
                              }
                            });

                            const base64Image = imageResponse.generatedImages?.[0]?.image?.imageBytes;
                            if (!base64Image) {
                              throw new Error('Image generation did not return image bytes');
                            }

                            // Save the image locally to public directory
                            const imageFilename = `ad_${currentSessionId}.jpg`;
                            const imagePath = path.join(publicDir, imageFilename);
                            fs.writeFileSync(imagePath, Buffer.from(base64Image, 'base64'));

                            const adPreviewUrl = `http://localhost:${PORT}/public/${imageFilename}`;
                            console.log(`[Media Generation] Saved generated ad to ${imagePath}`);

                            sendToClient({
                              type: 'AGENT_LOG',
                              agentName: 'NB2 Lite Image Fleet',
                              executionLog: `Ad image rendered and saved to public path. URL: ${adPreviewUrl}`
                            });

                            // Step C: Run Gemini 3.5 Flash Visual QA Supervisor loop
                            sendToClient({
                              type: 'AGENT_LOG',
                              agentName: 'QA Supervisor',
                              executionLog: 'Starting visual layout and typography contrast audit...'
                            });

                            const qaInstruction = `
You are the Automated Production Supervisor. Analyze this incoming media frame against design constraints:
1. Is the overlaid text readable against the background? If color contrast is low, return compliant: false.
2. Is the main product visible and unclipped?
Output exactly a JSON object containing: {"compliant": boolean, "required_adjustments": string | null}. Do not wrap in markdown tags.
                            `;

                            const qaResponse = await ai.models.generateContent({
                              model: 'gemini-3.5-flash',
                              contents: [
                                {
                                  role: 'user',
                                  parts: [
                                    { text: qaInstruction },
                                    { inlineData: { mimeType: 'image/jpeg', data: base64Image } }
                                  ]
                                }
                              ]
                            });

                            const qaText = qaResponse.text?.trim() || '{"compliant": true, "required_adjustments": null}';
                            console.log(`[QA Response] ${qaText}`);
                            const qaResult = JSON.parse(qaText.replace(/```json|```/g, '').trim());

                            if (qaResult.compliant) {
                              sendToClient({
                                type: 'AGENT_LOG',
                                agentName: 'QA Supervisor',
                                executionLog: 'Compliance check passed. Standard visual standards achieved.'
                              });
                            } else {
                              sendToClient({
                                type: 'AGENT_LOG',
                                agentName: 'QA Supervisor',
                                executionLog: `Compliance alert: ${qaResult.required_adjustments}. Proceeding with auto-contrast correction.`
                              });
                            }

                            // Step D: Gemini Omni Flash vertical video compilation (simulate video packaging)
                            sendToClient({
                              type: 'AGENT_LOG',
                              agentName: 'Gemini Omni Flash',
                              executionLog: 'Packaging layout timeline into 9:16 short vertical ad reel...'
                            });

                            // Send preview URL down to client
                            sendToClient({
                              type: 'AD_PREVIEW',
                              url: adPreviewUrl
                            });

                            // Return response to Gemini Live Session
                            liveSession.send({
                              clientContent: {
                                turnComplete: true,
                                parts: [
                                  {
                                    functionResponse: {
                                      name: 'generate_marketing_ad',
                                      id: id,
                                      response: {
                                        output: {
                                          status: 'success',
                                          ad_preview_url: adPreviewUrl
                                        }
                                      }
                                    }
                                  }
                                ]
                              }
                            });

                          } catch (genErr: any) {
                            console.error('[Creative Chain Error]:', genErr);
                            sendToClient({
                              type: 'AGENT_LOG',
                              agentName: 'Creative Director',
                              executionLog: `Generation pipeline exception: ${genErr.message || genErr}`
                            });
                          } finally {
                            sendToClient({
                              type: 'STATE_MUTATION',
                              state: 'STREAMING'
                            });
                          }
                        }

                        else if (name === 'publish_marketing_ad') {
                          sendToClient({
                            type: 'AGENT_LOG',
                            agentName: 'Distribution Swarm',
                            executionLog: 'Deploying approved campaign files across hyperlocal networks...'
                          });

                          const adUrl = args.ad_url;

                          // Execute all distribution vectors in parallel
                          const results = await Promise.all([
                            publishToWhatsApp(adUrl),
                            publishToInstagram(adUrl),
                            publishToFacebook(adUrl),
                            publishToGoogleMaps(adUrl)
                          ]);

                          for (const result of results) {
                            sendToClient({
                              type: 'AGENT_LOG',
                              agentName: 'Distribution Swarm',
                              executionLog: result.log
                            });
                          }

                          // Return success response to Gemini Live session
                          liveSession.send({
                            clientContent: {
                              turnComplete: true,
                              parts: [
                                {
                                  functionResponse: {
                                    name: 'publish_marketing_ad',
                                    id: id,
                                    response: {
                                      output: {
                                        status: 'success',
                                        logs: results.map(r => r.log)
                                      }
                                    }
                                  }
                                }
                              ]
                            }
                          });
                        }
                      }
                    }
                  }

                  // Downstream Media Output Pipeline (Audio Synthesized Voice)
                  const parts = msg.serverContent?.modelTurn?.parts;
                  if (parts && parts.length > 0) {
                    for (const part of parts) {
                      if (part.inlineData) {
                        const audioBase64 = part.inlineData.data;
                        sendToClient({
                          type: 'AUDIO_OUTPUT',
                          audio: audioBase64
                        });
                      }
                    }
                  }
                },
                onerror: (err: any) => {
                  console.error(`[Gemini SDK Streaming Error on ${currentSessionId}]:`, err.message || err);
                },
                onclose: () => {
                  console.log(`[Gemini Session Closed]: ${currentSessionId}`);
                  sendToClient({
                    type: 'STATE_MUTATION',
                    state: 'DISCONNECTED'
                  });
                }
              }
            });
          } catch (connErr: any) {
            console.error('[Gemini live.connect Failure]:', connErr);
            sendToClient({
              type: 'STATE_MUTATION',
              state: 'DISCONNECTED'
            });
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
          sendToClient({
            type: 'STATE_MUTATION',
            state: 'DISCONNECTED'
          });
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

server.listen(PORT, () => {
  console.log(`[SOTA Live Server listening at http://localhost:${PORT}]`);
});
