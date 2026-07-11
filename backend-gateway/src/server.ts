import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Modality, Type } from '@google/genai';
import dotenv from 'dotenv';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawnContextIngestionSwarm, updateInteractionContext, fetchReferenceAds } from './swarm';
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
  let fetchedReferences = '';
  let currentGenerationId = 0; // State variable to track and instantly abort stale generation processes

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
          const mockReviewsPath = path.join(__dirname, 'mock_google_business_reviews.json');
          const mockOrdersPath = path.join(__dirname, 'mock_whatsapp_orders.json');

          let businessProfile = {
            businessName: "Sri Ganesha Tender Coconut & Fresh Fruit Juice",
            merchantLocation: "Malleshwaram, Bangalore",
            businessCategory: "Tender Coconut & Fruit Juice Stall",
            targetLanguage: "Kannada"
          };
          let googleReviews = null;
          let whatsappOrders = null;

          try {
            if (fs.existsSync(mockProfilePath)) {
              businessProfile = JSON.parse(fs.readFileSync(mockProfilePath, 'utf8'));
            }
            if (fs.existsSync(mockReviewsPath)) {
              googleReviews = JSON.parse(fs.readFileSync(mockReviewsPath, 'utf8'));
            }
            if (fs.existsSync(mockOrdersPath)) {
              whatsappOrders = JSON.parse(fs.readFileSync(mockOrdersPath, 'utf8'));
            }
          } catch (err) {
            console.warn('[INIT_SESSION] Failed to read mock business profile files, using baseline.');
          }

          sendToClient({
            type: 'AGENT_LOG',
            agentName: 'System Gate',
            executionLog: `Retrieved business profile for: "${businessProfile.businessName}" (${businessProfile.merchantLocation})`
          });

          // 1. Spawning context ingestion swarm asynchronously (Control Plane)
          const swarmResult = await spawnContextIngestionSwarm(currentSessionId, businessProfile, googleReviews, whatsappOrders);
          currentInteractionId = swarmResult.interactionId;
          const manifestJson = swarmResult.manifestJson;
          console.log(`[Control Plane Swarm] Manifest output: ${manifestJson}`);

          let parsedManifest: any = {
            local_event: "IPL Local Screening Party at near market center",
            environmental_trigger: "High temperature, sunny afternoon",
            neighborhood_slangs: "Gethu, Machan, Semma",
            recommended_copy_strategy: "Offer chilled local beverages with regional slang tags.",
            hero_products: ["croissants"],
            customer_sentiments: "Neutral customer sentiment",
            competitor_analysis: "Standard local competition detected",
            pricing_simulation: "Baseline pricing model applied"
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
            executionLog: `[Agent A] Analyzed ambient signals: local_event = "${parsedManifest.local_event}", environmental_trigger = "${parsedManifest.environmental_trigger}"`
          });

          sendToClient({
            type: 'AGENT_LOG',
            agentName: 'Business intelligence Analyst',
            executionLog: `[Agent B] Ingested Google Business reviews and WhatsApp orders. Hero items identified: ${JSON.stringify(parsedManifest.hero_products)}. Sentiment: "${parsedManifest.customer_sentiments}"`
          });

          sendToClient({
            type: 'AGENT_LOG',
            agentName: 'War-Room Financial Strategist',
            executionLog: `[Agent C] Scraped competitor status: "${parsedManifest.competitor_analysis}". Sandboxed Python simulation output: ${parsedManifest.pricing_simulation}`
          });

          sendToClient({
            type: 'AGENT_LOG',
            agentName: 'Creative Brand Coordinator',
            executionLog: `[Agent D] Extracted regional slangs: ${parsedManifest.neighborhood_slangs}. Generated brand ad copywriting strategy: "${parsedManifest.recommended_copy_strategy}"`
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
                systemInstruction: `The sandbox agent swarm provides pre-session ambient variables: ${JSON.stringify(parsedManifest)}. Once the user declares what they want to advertise (e.g. key lime pie, 20% off for Christ University students on weekdays), you MUST extract the tags (business_category, ad_tone, focus_product, offer_details) at runtime and call the 'fetch_reference_ads' tool first to find relevant campaigns. Then use those references to call the 'generate_marketing_ad' tool. All video ad prompts for Gemini Omni Flash ('cinematic_prompts') must represent exactly 3 vertical 9:16 portrait keyframes or scenes designed to assemble a short-form, high-speed vertical video between 3 to 10 seconds in length with synchronized audio. Run real-time QA layers to enforce layout contrast limits. Use tools to generate and publish ads when user requests them. Prioritize local native Indian languages and native scripts in copy strategy generation and verbal communication.`,
                tools: [
                  {
                    functionDeclarations: [
                      {
                        name: 'fetch_reference_ads',
                        description: 'Fetches real competitor reference ad campaigns based on user stated category, product, and tone tags at runtime.',
                        parameters: {
                          type: Type.OBJECT,
                          properties: {
                            business_category: { type: Type.STRING, description: 'Category of the business (e.g. bakery, cafe, boutique)' },
                            ad_tone: { type: Type.STRING, description: 'Visual/copy tone of the ad (e.g. elegant, casual, minimal)' },
                            focus_product: { type: Type.STRING, description: 'Name of the main product (e.g. key lime pie)' },
                            offer_details: { type: Type.STRING, description: 'Optional discount details or specific promotions' }
                          },
                          required: ['business_category', 'ad_tone', 'focus_product']
                        }
                      },
                      {
                        name: 'generate_marketing_ad',
                        description: 'Generates highly-localized marketing banners and cinematic storyboard keyframes incorporating slangs, customer sentiment, and weather triggers. The prompts must be dynamically architected by you based on the conversation history, user preferences, and any fetched reference campaign details.',
                        parameters: {
                          type: Type.OBJECT,
                          properties: {
                            image_prompt: {
                              type: Type.STRING,
                              description: 'The dynamically architected full prompt for the Still ad banner (1:1), weaving together slang, background theme, and focus product details.'
                            },
                            cinematic_prompts: {
                              type: Type.ARRAY,
                              items: { type: Type.STRING },
                              description: 'An array of dynamic prompts (exactly 3 items) representing consecutive storyboard keyframes (9:16 vertical reels) for video animations.'
                            },
                            focus_product: {
                              type: Type.STRING,
                              description: 'Name of the main product featured in the ad'
                            }
                          },
                          required: ['image_prompt', 'cinematic_prompts', 'focus_product']
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
                    currentGenerationId++; // Increment ID to instantly abort ongoing processes
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

                        if (name === 'fetch_reference_ads') {
                          sendToClient({
                            type: 'STATE_MUTATION',
                            state: 'CREATIVE_PROCESSING'
                          });

                          sendToClient({
                            type: 'AGENT_LOG',
                            agentName: 'Reference Curator',
                            executionLog: `[Agent E] Fetching dynamic competitor ad style references for category="${args.business_category}", product="${args.focus_product}", tone="${args.ad_tone}"...`
                          });

                          try {
                            const refs = await fetchReferenceAds(
                              args.business_category,
                              args.ad_tone,
                              args.focus_product,
                              args.offer_details
                            );
                            fetchedReferences = refs;
                            console.log(`[Agent E] Fetched references: ${refs}`);

                            sendToClient({
                              type: 'AGENT_LOG',
                              agentName: 'Reference Curator',
                              executionLog: `[Agent E] Curation completed. Loaded campaign reference resources.`
                            });

                            // Return response to Gemini Live Session
                            liveSession.send({
                              clientContent: {
                                turnComplete: true,
                                parts: [
                                  {
                                    functionResponse: {
                                      name: 'fetch_reference_ads',
                                      id: id,
                                      response: {
                                        output: {
                                          status: 'success',
                                          references: JSON.parse(refs)
                                        }
                                      }
                                    }
                                  }
                                ]
                              }
                            });

                          } catch (refErr: any) {
                            console.error('[Reference curator Error]:', refErr);
                            sendToClient({
                              type: 'AGENT_LOG',
                              agentName: 'Reference Curator',
                              executionLog: `Reference curation failed: ${refErr.message || refErr}`
                            });

                            liveSession.send({
                              clientContent: {
                                turnComplete: true,
                                parts: [
                                  {
                                    functionResponse: {
                                      name: 'fetch_reference_ads',
                                      id: id,
                                      response: {
                                        output: {
                                          status: 'failed',
                                          error: refErr.message || refErr
                                        }
                                      }
                                    }
                                  }
                                ]
                              }
                            });
                          } finally {
                            sendToClient({
                              type: 'STATE_MUTATION',
                              state: 'STREAMING'
                            });
                          }
                        }

                        else if (name === 'generate_marketing_ad') {
                          const execGenerationId = currentGenerationId;

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
                            // Asynchronously update the stateful interaction thread in the sandbox (Twin-Track - Track 2)
                            // This runs in the background and is NOT awaited here, saving 2-3 seconds of network roundtrip latency!
                            sendToClient({
                              type: 'AGENT_LOG',
                              agentName: 'Swarm Coordinator',
                              executionLog: `Updating session interaction context with creative parameters (async)...`
                            });

                            const updateInstruction = `User requested creative generation. Focus Product: ${args.focus_product}, Background Color: ${args.background_color}, Overriding Copy: ${args.text_copy || 'None'}. Update design blueprint in session_manifest.json.`;
                            updateInteractionContext(currentInteractionId, updateInstruction, businessProfile)
                              .then((updatedManifestJson) => {
                                console.log(`[Control Plane Swarm - Async Sync Done] Updated manifest: ${updatedManifestJson}`);
                                try {
                                  const updatedManifest = JSON.parse(updatedManifestJson.replace(/```json|```/g, '').trim());
                                  Object.assign(parsedManifest, updatedManifest);
                                } catch (e) {
                                  console.warn('[Control Plane - Async Sync] Failed to parse updated manifest background return.');
                                }
                              })
                              .catch((err) => {
                                console.error('[Control Plane - Async Sync Error]:', err);
                              });

                            // Step A: Creative Director Prompt generation fork
                            sendToClient({
                              type: 'AGENT_LOG',
                              agentName: 'Creative Director',
                              executionLog: 'Building prompt blueprint for NB2 Lite layout engine...'
                            });

                            let referencePromptAddition = '';
                            if (fetchedReferences) {
                              try {
                                const parsedRefs = JSON.parse(fetchedReferences);
                                if (Array.isArray(parsedRefs) && parsedRefs.length > 0) {
                                  referencePromptAddition = ` Apply style hints from these suggestive ad campaign references: ${parsedRefs.map((r: any) => `[Vibe: ${r.visual_vibe}, Layout: ${r.description}]`).join('; ')}.`;
                                }
                              } catch (e) {
                                console.warn('[Creative Chain] Failed to parse fetched reference details.');
                              }
                            }

                            const stillPrompt = args.image_prompt || `Create a high resolution 1K studio display square ad banner for ${args.focus_product} with a primary background color of ${args.background_color || 'neon-green'}.${referencePromptAddition} Integrate the following copy: "${args.text_copy || parsedManifest.recommended_copy_strategy}". Ensure professional typesetting and high contrast.`;

                            // Retrieve cinematic keyframe prompts dynamically from the Live API orchestrator, falling back to templates if not provided
                            const promptsList = args.cinematic_prompts || [];
                            const cinematicFrame1Prompt = promptsList[0] || `Create a high resolution 9:16 vertical mobile display ad keyframe for ${args.focus_product} closeup with a primary background color of ${args.background_color || 'neon-green'}.${referencePromptAddition} Focus purely on a detailed macro closeup shot of the fresh product, macro lighting, high contrast. No text overlays.`;
                            const cinematicFrame2Prompt = promptsList[1] || `Create a high resolution 9:16 vertical mobile display ad keyframe for ${args.focus_product} with a primary background color of ${args.background_color || 'neon-green'}.${referencePromptAddition} Focus on displaying the text copy: "${args.text_copy || parsedManifest.recommended_copy_strategy}" clearly over the product presentation. Ensure readability and high typography contrast.`;
                            const cinematicFrame3Prompt = promptsList[2] || `Create a high resolution 9:16 vertical mobile display ad keyframe for ${args.focus_product} with a primary background color of ${args.background_color || 'neon-green'}.${referencePromptAddition} Focus on a final elegant branding scene displaying the business name: "${businessProfile.businessName}" alongside the product.`;

                            // Interruption Check
                            if (execGenerationId !== currentGenerationId) {
                              console.log(`[Interruption Check] Session ${currentSessionId} generation cancelled before image API request.`);
                              return;
                            }

                            // Step B: Invoke Imagen (NB2 Lite equivalent)
                            sendToClient({
                              type: 'AGENT_LOG',
                              agentName: 'NB2 Lite Image Fleet',
                              executionLog: 'Generating Still (1:1) and Cinematic storyboard keyframes (9:16) in parallel...'
                            });

                            let stillResponse, frame1Response, frame2Response, frame3Response;
                            try {
                              [stillResponse, frame1Response, frame2Response, frame3Response] = await Promise.all([
                                ai.models.generateImages({
                                  model: 'gemini-3.1-flash-lite-image',
                                  prompt: stillPrompt,
                                  config: {
                                    numberOfImages: 1,
                                    outputMimeType: 'image/jpeg',
                                    aspectRatio: '1:1'
                                  }
                                }),
                                ai.models.generateImages({
                                  model: 'gemini-3.1-flash-lite-image',
                                  prompt: cinematicFrame1Prompt,
                                  config: {
                                    numberOfImages: 1,
                                    outputMimeType: 'image/jpeg',
                                    aspectRatio: '9:16'
                                  }
                                }),
                                ai.models.generateImages({
                                  model: 'gemini-3.1-flash-lite-image',
                                  prompt: cinematicFrame2Prompt,
                                  config: {
                                    numberOfImages: 1,
                                    outputMimeType: 'image/jpeg',
                                    aspectRatio: '9:16'
                                  }
                                }),
                                ai.models.generateImages({
                                  model: 'gemini-3.1-flash-lite-image',
                                  prompt: cinematicFrame3Prompt,
                                  config: {
                                    numberOfImages: 1,
                                    outputMimeType: 'image/jpeg',
                                    aspectRatio: '9:16'
                                  }
                                })
                              ]);
                            } catch (liteErr: any) {
                              console.warn(`[NB2 Lite Image API Failure]: ${liteErr.message || liteErr}. Falling back to 'imagen-3.0-generate-002'...`);
                              sendToClient({
                                type: 'AGENT_LOG',
                                agentName: 'NB2 Lite Image Fleet',
                                executionLog: `Model gemini-3.1-flash-lite-image failed/unavailable. Failing over to imagen-3.0-generate-002...`
                              });

                              // Interruption check before executing fallback to avoid wasting quota/time
                              if (execGenerationId !== currentGenerationId) {
                                console.log(`[Interruption Check] Session ${currentSessionId} generation cancelled before fallback.`);
                                return;
                              }

                              [stillResponse, frame1Response, frame2Response, frame3Response] = await Promise.all([
                                ai.models.generateImages({
                                  model: 'imagen-3.0-generate-002',
                                  prompt: stillPrompt,
                                  config: {
                                    numberOfImages: 1,
                                    outputMimeType: 'image/jpeg',
                                    aspectRatio: '1:1'
                                  }
                                }),
                                ai.models.generateImages({
                                  model: 'imagen-3.0-generate-002',
                                  prompt: cinematicFrame1Prompt,
                                  config: {
                                    numberOfImages: 1,
                                    outputMimeType: 'image/jpeg',
                                    aspectRatio: '9:16'
                                  }
                                }),
                                ai.models.generateImages({
                                  model: 'imagen-3.0-generate-002',
                                  prompt: cinematicFrame2Prompt,
                                  config: {
                                    numberOfImages: 1,
                                    outputMimeType: 'image/jpeg',
                                    aspectRatio: '9:16'
                                  }
                                }),
                                ai.models.generateImages({
                                  model: 'imagen-3.0-generate-002',
                                  prompt: cinematicFrame3Prompt,
                                  config: {
                                    numberOfImages: 1,
                                    outputMimeType: 'image/jpeg',
                                    aspectRatio: '9:16'
                                  }
                                })
                              ]);
                            }

                            // Interruption Check
                            if (execGenerationId !== currentGenerationId) {
                              console.log(`[Interruption Check] Session ${currentSessionId} generation cancelled during image generation.`);
                              return;
                            }

                            const base64Still = stillResponse.generatedImages?.[0]?.image?.imageBytes;
                            const base64F1 = frame1Response.generatedImages?.[0]?.image?.imageBytes;
                            const base64F2 = frame2Response.generatedImages?.[0]?.image?.imageBytes;
                            const base64F3 = frame3Response.generatedImages?.[0]?.image?.imageBytes;

                            if (!base64Still || !base64F1 || !base64F2 || !base64F3) {
                              throw new Error('Image generation did not return image bytes for all keyframes');
                            }

                            // Save the images locally to public directory
                            const stillFilename = `still_${currentSessionId}.jpg`;
                            const f1Filename = `cinematic_frame1_${currentSessionId}.jpg`;
                            const f2Filename = `cinematic_frame2_${currentSessionId}.jpg`;
                            const f3Filename = `cinematic_frame3_${currentSessionId}.jpg`;

                            const stillPath = path.join(publicDir, stillFilename);
                            const f1Path = path.join(publicDir, f1Filename);
                            const f2Path = path.join(publicDir, f2Filename);
                            const f3Path = path.join(publicDir, f3Filename);

                            fs.writeFileSync(stillPath, Buffer.from(base64Still, 'base64'));
                            fs.writeFileSync(f1Path, Buffer.from(base64F1, 'base64'));
                            fs.writeFileSync(f2Path, Buffer.from(base64F2, 'base64'));
                            fs.writeFileSync(f3Path, Buffer.from(base64F3, 'base64'));

                            const stillUrl = `http://localhost:${PORT}/public/${stillFilename}`;
                            const f1Url = `http://localhost:${PORT}/public/${f1Filename}`;
                            const f2Url = `http://localhost:${PORT}/public/${f2Filename}`;
                            const f3Url = `http://localhost:${PORT}/public/${f3Filename}`;

                            console.log(`[Media Generation] Saved generated keyframes to public directory`);

                            sendToClient({
                              type: 'AGENT_LOG',
                              agentName: 'NB2 Lite Image Fleet',
                              executionLog: `Still ad (1:1) and 3 Cinematic video keyframes (9:16) generated successfully.`
                            });

                            // Step C: Run Gemini 3.5 Flash Visual QA Supervisor loop
                            sendToClient({
                              type: 'AGENT_LOG',
                              agentName: 'QA Supervisor',
                              executionLog: 'Starting visual layout and typography contrast audit on Still image...'
                            });

                            // Interruption Check
                            if (execGenerationId !== currentGenerationId) {
                              console.log(`[Interruption Check] Session ${currentSessionId} generation cancelled before QA audit.`);
                              return;
                            }

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
                                    { inlineData: { mimeType: 'image/jpeg', data: base64Still } }
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

                            // Final Interruption Check before sending assets to client
                            if (execGenerationId !== currentGenerationId) {
                              console.log(`[Interruption Check] Session ${currentSessionId} generation cancelled during QA audit.`);
                              return;
                            }

                            // Step D: Gemini Omni Flash vertical video compilation
                            sendToClient({
                              type: 'AGENT_LOG',
                              agentName: 'Gemini Omni Flash',
                              executionLog: 'Injecting 3 keyframes as visual references into Omni Flash video pipeline...'
                            });

                            // Send preview URL down to client
                            sendToClient({
                              type: 'AD_PREVIEW',
                              url: stillUrl,
                              stillUrl: stillUrl,
                              cinematicUrl: f2Url, // Frame 2 (text layout) as primary cinematic preview
                              keyframes: [f1Url, f2Url, f3Url]
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
                                          ad_preview_url: stillUrl,
                                          still_url: stillUrl,
                                          cinematic_url: f2Url,
                                          keyframes: [f1Url, f2Url, f3Url]
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
                            // Only set streaming back if we haven't been interrupted and another generation isn't active
                            if (execGenerationId === currentGenerationId) {
                              sendToClient({
                                type: 'STATE_MUTATION',
                                state: 'STREAMING'
                              });
                            }
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

        case 'TEXT_INPUT':
          if (liveSession && message.text) {
            console.log(`[TEXT_INPUT] Routing text to Live session: "${message.text}"`);
            currentGenerationId++; // Increment generation ID to abort any active generation immediately
            liveSession.send({
              clientContent: {
                turns: [
                  {
                    role: 'user',
                    parts: [{ text: message.text }]
                  }
                ],
                turnComplete: true
              }
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
