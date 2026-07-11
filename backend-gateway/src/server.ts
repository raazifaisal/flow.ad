import './clean-env';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Modality, Type } from '@google/genai';
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { spawnContextIngestionSwarm, updateInteractionContext, fetchReferenceAds, discoverBusiness } from './swarm';
import { ClientMessage, ServerMessage } from './types';

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

// Create the handler for static file serving and basic routes
const serverHandler = (req: http.IncomingMessage, res: http.ServerResponse) => {
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
    res.end('flow.ad Engine Gateway');
  }
};

let server: http.Server | https.Server;
const keyPath = path.join(__dirname, '../key.pem');
const certPath = path.join(__dirname, '../cert.pem');
let isSecure = false;

if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  console.log('[SOTA Live Server] SSL Certificates found. Running secure HTTPS/WSS server.');
  server = https.createServer({
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
  }, serverHandler);
  isSecure = true;
} else {
  console.log('[SOTA Live Server] No SSL Certificates found. Running fallback HTTP/WS server.');
  server = http.createServer(serverHandler);
}

const wss = new WebSocketServer({ server });
console.log(`[flow.ad Gateway serving at ${isSecure ? 'wss' : 'ws'}://localhost:${PORT}]`);
console.log(`[Static ad creatives served at ${isSecure ? 'https' : 'http'}://localhost:${PORT}/public/]`);

wss.on('connection', (ws: WebSocket) => {
  let liveSession: any = null;
  let currentSessionId = 'unknown';
  let currentInteractionId = '';
  let fetchedReferences = '';
  let currentGenerationId = 0; // State variable to track and instantly abort stale generation processes

  // Session-level mutable state — starts null, populated by activate_swarm tool
  let businessProfile: { businessName: string; merchantLocation: string; businessCategory: string; targetLanguage: string } | null = null;
  let parsedManifest: any = null;

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
          console.log(`[INIT_SESSION] Starting Live-first session: ${currentSessionId}`);

          sendToClient({
            type: 'AGENT_LOG',
            agentName: 'System Gate',
            executionLog: 'Session initialization received. Starting Live-first conversational boot...'
          });

          // Immediately connect to Gemini Live with a cold-start system prompt (NO pre-context)
          try {
            liveSession = await ai.live.connect({
              model: TARGET_LIVE_MODEL,
              config: {
                responseModalities: [Modality.AUDIO],
                systemInstruction: `You are the flow.ad creative marketing assistant. You help local business owners create hyper-localized marketing ads through natural conversation.

IMPORTANT: This is a COLD START session. You have NO pre-loaded business context. You must conversationally discover everything.

## Session Boot Sequence

1. **Greet the user warmly** — Introduce yourself briefly. Say something like: "Hey! I'm your flow.ad assistant. I help local businesses create stunning marketing ads. Tell me about your business — what's the name and where is it located?"

2. **Discover the business** — Once the user tells you their business name and location, call the 'discover_business' tool to verify it exists via web search. Wait for the results.

3. **Confirm with the user** — Share what you found (business name, location, category, rating if available) and ask the user to confirm. If the search didn't find it, ask them to provide more details manually (category, what they sell, etc.)

4. **Learn their ad goals & preferred formats** — Once the business is confirmed, ask the user what product or offer they want to highlight, what vibe they want, and **critically ask what formats they want to generate**:
   - Still graphic ads only (1:1 image banner)
   - Video ads too (both 1:1 image banner and 9:16 vertical motion video)
   - Just the cinematic video (9:16 vertical motion video only)

5. **Activate the swarm** — Once you have the business profile, the user's ad intent, and their format selection, call the 'activate_swarm' tool with all the gathered details. This runs background intelligence agents to gather local context (weather, events, competitors, pricing).

6. **Generate ads** — After the swarm returns context, call 'fetch_reference_ads' first. Then, based on the user's preferred format:
   - If they selected **Still graphic ads only**, call 'generate_marketing_ad' with \`image_prompt\` and **WITHOUT** \`cinematic_prompts\`.
   - If they selected **Video ads too** or **Just the cinematic video**, call 'generate_marketing_ad' with both \`image_prompt\` and \`cinematic_prompts\`.

## Behavioral Rules
- Be conversational and natural, not robotic. Keep responses concise and friendly.
- Use the same language the user is actively speaking to you in. Do not auto-assume local native languages (e.g. Kannada, Tamil) for tools like activate_swarm unless the user explicitly requests it or speaks in that language.
- When generating ads with cinematic/video formats, all video ad prompts ('cinematic_prompts') must represent exactly 3 vertical 9:16 portrait keyframes designed to assemble a short-form vertical video between 3 to 10 seconds.
- Only pass essential creative parameters in tool arguments to keep context windows lean.
- If the user interrupts or changes direction mid-flow, adapt immediately.`,
                tools: [
                  {
                    functionDeclarations: [
                      {
                        name: 'discover_business',
                        description: 'Searches the web to verify a business exists and retrieve its details (category, rating, hours). Call this after the user tells you their business name and location.',
                        parameters: {
                          type: Type.OBJECT,
                          properties: {
                            business_name: { type: Type.STRING, description: 'Name of the business as stated by the user' },
                            location: { type: Type.STRING, description: 'Location/area of the business as stated by the user' }
                          },
                          required: ['business_name', 'location']
                        }
                      },
                      {
                        name: 'activate_swarm',
                        description: 'Activates the background intelligence swarm (Agents A-D) to gather local context: weather, events, competitors, pricing, slangs, and copy strategy. Call this after the business is confirmed AND you know the user\'s ad intent.',
                        parameters: {
                          type: Type.OBJECT,
                          properties: {
                            business_name: { type: Type.STRING, description: 'Confirmed business name' },
                            location: { type: Type.STRING, description: 'Confirmed business location' },
                            category: { type: Type.STRING, description: 'Business category (e.g. bakery, cafe, restaurant)' },
                            target_language: { type: Type.STRING, description: 'Primary local language for the area (e.g. Kannada, Tamil, Hindi)' },
                            ad_goal: { type: Type.STRING, description: 'What the user wants to advertise — product, offer, vibe, etc.' }
                          },
                          required: ['business_name', 'location', 'category', 'target_language']
                        }
                      },
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
                        description: 'Generates highly-localized marketing banners and optionally vertical cinematic storyboard keyframes/videos.',
                        parameters: {
                          type: Type.OBJECT,
                          properties: {
                            image_prompt: {
                              type: Type.STRING,
                              description: 'The dynamically architected full prompt for the Still ad banner (1:1).'
                            },
                            cinematic_prompts: {
                              type: Type.ARRAY,
                              items: { type: Type.STRING },
                              description: 'Optional. An array of dynamic prompts (exactly 3 items) representing consecutive storyboard keyframes (9:16 vertical reels).'
                            },
                            focus_product: {
                              type: Type.STRING,
                              description: 'Name of the main product featured in the ad'
                            }
                          },
                          required: ['image_prompt', 'focus_product']
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
                    agentName: 'Gemini Live Engine',
                    executionLog: 'Live WebSocket pipeline established. Cold-start conversational boot active. VAD listening.'
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

                        // ──── DISCOVER BUSINESS ────
                        if (name === 'discover_business') {
                          sendToClient({
                            type: 'AGENT_LOG',
                            agentName: 'Discovery Agent',
                            executionLog: `Searching for "${args.business_name}" near "${args.location}"...`
                          });

                           // Send function response back to Live immediately so it doesn't block the conversation
                           liveSession?.sendToolResponse({
                             functionResponses: [{
                               name: 'discover_business',
                               id: id,
                               response: {
                                 output: { status: 'searching_in_background', businessName: args.business_name }
                               }
                             }]
                           });

                           // Run search in the background
                           setTimeout(async () => {
                             try {
                               const result = await discoverBusiness(args.business_name, args.location);
                               console.log('[Discovery Agent] Result:', JSON.stringify(result));

                               sendToClient({
                                 type: 'AGENT_LOG',
                                 agentName: 'Discovery Agent',
                                 executionLog: result.found
                                   ? `Found: "${result.businessName}" (${result.category}) at ${result.location}. ${result.rating ? `Rating: ${result.rating}` : ''}`
                                   : `Could not verify "${args.business_name}" via web search.`
                               });

                               liveSession?.sendClientContent({
                                 turns: [{
                                   role: 'user',
                                   parts: [{ text: `[System Update] Web search results for "${args.business_name}" in "${args.location}" are in: ${JSON.stringify(result)}. If found, proceed to confirm with the user. If not found, tell them we couldn't verify it, present the summary, and ask them to confirm details manually.` }]
                                 }],
                                 turnComplete: true
                               });
                             } catch (err: any) {
                               console.error('[Discovery Agent Error]:', err);
                             }
                           }, 0);
                        }

                        // ──── ACTIVATE SWARM ────
                        else if (name === 'activate_swarm') {
                          sendToClient({
                            type: 'STATE_MUTATION',
                            state: 'STREAMING'
                          });

                          // Store the discovered business profile for the session
                          businessProfile = {
                            businessName: args.business_name,
                            merchantLocation: args.location,
                            businessCategory: args.category,
                            targetLanguage: args.target_language || 'English'
                          };

                          // Send confirmed profile to client
                          sendToClient({
                            type: 'BUSINESS_CONFIRMED',
                            businessProfile: businessProfile
                          });

                          sendToClient({
                            type: 'AGENT_LOG',
                            agentName: 'Swarm Coordinator',
                            executionLog: `Activating Control Plane swarm for "${businessProfile.businessName}" at ${businessProfile.merchantLocation}. Ad goal: ${args.ad_goal || 'general marketing'}`
                          });

                           // Return swarm manifest trigger response immediately so it does not block the conversation
                           liveSession?.sendToolResponse({
                             functionResponses: [{
                               name: 'activate_swarm',
                               id: id,
                               response: {
                                 output: {
                                   status: 'swarm_activated_in_background',
                                   message: 'The local intelligence swarm is analyzing ambient signals, events, pricing, and slangs in the background. Please continue talking to the user, perhaps telling them what we are doing, or ask about their design preferences.'
                                 }
                               }
                             }]
                           });

                           // Run swarm processing in the background
                           setTimeout(async () => {
                             try {
                               // Spawn the full context ingestion swarm (Agents A-D)
                               const swarmResult = await spawnContextIngestionSwarm(
                                 currentSessionId,
                                 businessProfile!,
                                 null, // No Google reviews for now
                                 null  // No WhatsApp orders for now
                               );
                               currentInteractionId = swarmResult.interactionId;
                               const manifestJson = swarmResult.manifestJson;
                               console.log(`[Control Plane Swarm] Manifest output: ${manifestJson}`);

                               // Parse the manifest
                               let manifestData: any;
                               try {
                                 manifestData = JSON.parse(manifestJson.replace(/```json|```/g, '').trim());
                               } catch (e) {
                                 console.warn('[Control Plane] Failed to parse manifest JSON, using raw text.');
                                 manifestData = {
                                   local_event: 'Local activity detected',
                                   environmental_trigger: 'Current weather conditions',
                                   neighborhood_slangs: 'Local expressions',
                                   recommended_copy_strategy: `Premium offerings at ${businessProfile!.businessName}`,
                                   hero_products: ['Signature items'],
                                   customer_sentiments: 'Neutral',
                                   competitor_analysis: 'Standard competition',
                                   pricing_simulation: 'Baseline pricing'
                                 };
                               }
                               parsedManifest = manifestData;

                               // Send detailed agent logs to client
                               sendToClient({
                                 type: 'AGENT_LOG',
                                 agentName: 'Geo Scout',
                                 executionLog: `[Agent A] Analyzed ambient signals: local_event = "${parsedManifest.local_event}", environmental_trigger = "${parsedManifest.environmental_trigger}"`
                               });

                               sendToClient({
                                 type: 'AGENT_LOG',
                                 agentName: 'Business Intelligence Analyst',
                                 executionLog: `[Agent B] Hero items identified: ${JSON.stringify(parsedManifest.hero_products)}. Sentiment: "${parsedManifest.customer_sentiments}"`
                               });

                               sendToClient({
                                 type: 'AGENT_LOG',
                                 agentName: 'War-Room Financial Strategist',
                                 executionLog: `[Agent C] Competitor analysis: "${parsedManifest.competitor_analysis}". Pricing: ${parsedManifest.pricing_simulation}`
                               });

                               sendToClient({
                                 type: 'AGENT_LOG',
                                 agentName: 'Creative Brand Coordinator',
                                 executionLog: `[Agent D] Slangs: ${parsedManifest.neighborhood_slangs}. Copy strategy: "${parsedManifest.recommended_copy_strategy}"`
                               });

                               liveSession?.sendClientContent({
                                 turns: [{
                                   role: 'user',
                                   parts: [{ text: `[System Update] Local intelligence swarm has completed. Discovered local event: "${parsedManifest.local_event}", weather/environment trigger: "${parsedManifest.environmental_trigger}", slangs: "${parsedManifest.neighborhood_slangs}", recommended copy strategy: "${parsedManifest.recommended_copy_strategy}", pricing recommendation: "${parsedManifest.pricing_simulation}". Please present these findings to the user and explain our copy strategy. Ask if they want to proceed with generating the ad creatives.` }]
                                 }],
                                 turnComplete: true
                               });
                             } catch (swarmErr: any) {
                               console.error('[Swarm Activation Error]:', swarmErr);
                               sendToClient({
                                 type: 'AGENT_LOG',
                                 agentName: 'Swarm Coordinator',
                                 executionLog: `Swarm activation failed: ${swarmErr.message || swarmErr}`
                               });
                             }
                           }, 0);
                        }

                        // ──── FETCH REFERENCE ADS ────
                        else if (name === 'fetch_reference_ads') {
                          sendToClient({
                            type: 'STATE_MUTATION',
                            state: 'STREAMING'
                          });

                          sendToClient({
                            type: 'AGENT_LOG',
                            agentName: 'Reference Curator',
                            executionLog: `[Agent E] Fetching dynamic competitor ad style references for category="${args.business_category}", product="${args.focus_product}", tone="${args.ad_tone}"...`
                          });

                          // Return immediately to keep conversation flowing
                          liveSession?.sendToolResponse({
                            functionResponses: [{
                              name: 'fetch_reference_ads',
                              id: id,
                              response: {
                                output: {
                                  status: 'fetching_references_in_background',
                                  message: 'I am fetching competitive reference ads to inspire our creative strategy. I will load them into my context in a moment.'
                                }
                              }
                            }]
                          });
 
                          setTimeout(async () => {
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
 
                              liveSession?.sendClientContent({
                                turns: [{
                                  role: 'user',
                                  parts: [{ text: `[System Update] Reference competitor ads for category="${args.business_category}" are in: ${refs}. Please analyze the visual vibe and copy angles in these references, and suggest an ad banner design structure to the user.` }]
                                }],
                                turnComplete: true
                              });
 
                            } catch (refErr: any) {
                              console.error('[Reference curator Error]:', refErr);
                              sendToClient({
                                type: 'AGENT_LOG',
                                agentName: 'Reference Curator',
                                executionLog: `Reference curation failed: ${refErr.message || refErr}`
                              });
                            }
                          }, 0);
                        }

                        // ──── GENERATE MARKETING AD ────
                        else if (name === 'generate_marketing_ad') {
                          const execGenerationId = currentGenerationId;

                          sendToClient({
                            type: 'STATE_MUTATION',
                            state: 'STREAMING'
                          });

                          // Return immediately to keep conversation flowing
                          liveSession?.sendToolResponse({
                            functionResponses: [{
                              name: 'generate_marketing_ad',
                              id: id,
                              response: {
                                output: {
                                  status: 'generating_assets_in_background',
                                  message: 'I have started the creative design pipeline to generate your ad assets. I will present them to you as soon as they are ready. Feel free to continue talking.'
                                }
                              }
                            }]
                          });
 
                          setTimeout(async () => {
                            try {
                              // Asynchronously update the stateful interaction thread if we have one
                              if (currentInteractionId && businessProfile) {
                                sendToClient({
                                  type: 'AGENT_LOG',
                                  agentName: 'Swarm Coordinator',
                                  executionLog: `Updating session interaction context with creative parameters (async)...`
                                });
 
                                const updateInstruction = `User requested creative generation. Focus Product: ${args.focus_product}. Update design blueprint in session_manifest.json.`;
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
                              }
 
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
 
                              const copyStrategy = parsedManifest?.recommended_copy_strategy || `Premium offerings at ${businessProfile?.businessName || 'our store'}`;
                              const stillPrompt = args.image_prompt || `Create a high resolution 1K studio display square ad banner for ${args.focus_product}.${referencePromptAddition} Integrate the following copy: "${copyStrategy}". Ensure professional typesetting and high contrast.`;
 
                              const promptsList = args.cinematic_prompts || [];
                              const hasCinematic = promptsList.length > 0;
 
                              // Interruption Check
                              if (execGenerationId !== currentGenerationId) {
                                console.log(`[Interruption Check] Session ${currentSessionId} generation cancelled before image API request.`);
                                return;
                              }
 
                              // Step B: Invoke Imagen (NB2 Lite equivalent)
                              sendToClient({
                                type: 'AGENT_LOG',
                                agentName: 'NB2 Lite Image Fleet',
                                executionLog: hasCinematic 
                                  ? 'Generating Still (1:1) and Cinematic storyboard keyframes (9:16) in parallel...'
                                  : 'Generating Still (1:1) ad banner...'
                              });
 
                              let stillResponse: any, frame1Response: any, frame2Response: any, frame3Response: any;
                              try {
                                if (hasCinematic) {
                                  const cinematicFrame1Prompt = promptsList[0] || `Create a high resolution 9:16 vertical mobile display ad keyframe for ${args.focus_product}.${referencePromptAddition} Focus purely on a detailed macro closeup shot of the fresh product.`;
                                  const cinematicFrame2Prompt = promptsList[1] || `Create a high resolution 9:16 vertical mobile display ad keyframe for ${args.focus_product}.${referencePromptAddition} Focus on displaying the text copy: "${copyStrategy}" clearly.`;
                                  const cinematicFrame3Prompt = promptsList[2] || `Create a high resolution 9:16 vertical mobile display ad keyframe for ${args.focus_product}.${referencePromptAddition} Focus on a final branding scene.`;
 
                                  [stillResponse, frame1Response, frame2Response, frame3Response] = await Promise.all([
                                    ai.models.generateContent({
                                      model: 'gemini-3.1-flash-lite-image',
                                      contents: stillPrompt,
                                      config: { responseModalities: ['IMAGE'] }
                                    }),
                                    ai.models.generateContent({
                                      model: 'gemini-3.1-flash-lite-image',
                                      contents: cinematicFrame1Prompt,
                                      config: { responseModalities: ['IMAGE'] }
                                    }),
                                    ai.models.generateContent({
                                      model: 'gemini-3.1-flash-lite-image',
                                      contents: cinematicFrame2Prompt,
                                      config: { responseModalities: ['IMAGE'] }
                                    }),
                                    ai.models.generateContent({
                                      model: 'gemini-3.1-flash-lite-image',
                                      contents: cinematicFrame3Prompt,
                                      config: { responseModalities: ['IMAGE'] }
                                    })
                                  ]);
                                } else {
                                  stillResponse = await ai.models.generateContent({
                                    model: 'gemini-3.1-flash-lite-image',
                                    contents: stillPrompt,
                                    config: { responseModalities: ['IMAGE'] }
                                  });
                                }
                              } catch (liteErr: any) {
                                console.warn(`[NB2 Lite Image API Failure]: ${liteErr.message || liteErr}. Falling back to 'imagen-4.0-fast-generate-001'...`);
                                sendToClient({
                                  type: 'AGENT_LOG',
                                  agentName: 'NB2 Lite Image Fleet',
                                  executionLog: `Model gemini-3.1-flash-lite-image failed/unavailable. Failing over to imagen-4.0-fast-generate-001...`
                                });
 
                                if (hasCinematic) {
                                  const cinematicFrame1Prompt = promptsList[0];
                                  const cinematicFrame2Prompt = promptsList[1];
                                  const cinematicFrame3Prompt = promptsList[2];
 
                                  [stillResponse, frame1Response, frame2Response, frame3Response] = await Promise.all([
                                    ai.models.generateImages({
                                      model: 'imagen-4.0-fast-generate-001',
                                      prompt: stillPrompt,
                                      config: { numberOfImages: 1, outputMimeType: 'image/jpeg', aspectRatio: '1:1' }
                                    }),
                                    ai.models.generateImages({
                                      model: 'imagen-4.0-fast-generate-001',
                                      prompt: cinematicFrame1Prompt,
                                      config: { numberOfImages: 1, outputMimeType: 'image/jpeg', aspectRatio: '9:16' }
                                    }),
                                    ai.models.generateImages({
                                      model: 'imagen-4.0-fast-generate-001',
                                      prompt: cinematicFrame2Prompt,
                                      config: { numberOfImages: 1, outputMimeType: 'image/jpeg', aspectRatio: '9:16' }
                                    }),
                                    ai.models.generateImages({
                                      model: 'imagen-4.0-fast-generate-001',
                                      prompt: cinematicFrame3Prompt,
                                      config: { numberOfImages: 1, outputMimeType: 'image/jpeg', aspectRatio: '9:16' }
                                    })
                                  ]);
                                } else {
                                  stillResponse = await ai.models.generateImages({
                                    model: 'imagen-4.0-fast-generate-001',
                                    prompt: stillPrompt,
                                    config: { numberOfImages: 1, outputMimeType: 'image/jpeg', aspectRatio: '1:1' }
                                  });
                                }
                              }
 
 
                              const base64Still = stillResponse.generatedImages?.[0]?.image?.imageBytes || stillResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
                              const base64F1 = frame1Response ? (frame1Response.generatedImages?.[0]?.image?.imageBytes || frame1Response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) : null;
                              const base64F2 = frame2Response ? (frame2Response.generatedImages?.[0]?.image?.imageBytes || frame2Response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) : null;
                              const base64F3 = frame3Response ? (frame3Response.generatedImages?.[0]?.image?.imageBytes || frame3Response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) : null;
 
                              if (!base64Still) {
                                throw new Error('Image generation did not return image bytes for Still ad');
                              }
                              if (hasCinematic && (!base64F1 || !base64F2 || !base64F3)) {
                                throw new Error('Image generation did not return image bytes for all keyframes');
                              }
 
                              // Save the images locally to public directory
                              const stillFilename = `still_${currentSessionId}.jpg`;
                              const stillPath = path.join(publicDir, stillFilename);
                              fs.writeFileSync(stillPath, Buffer.from(base64Still, 'base64'));
                              const stillUrl = `https://localhost:${PORT}/public/${stillFilename}`;
 
                              let f1Url = '', f2Url = '', f3Url = '';
                              if (base64F1 && base64F2 && base64F3) {
                                const f1Filename = `cinematic_frame1_${currentSessionId}.jpg`;
                                const f2Filename = `cinematic_frame2_${currentSessionId}.jpg`;
                                const f3Filename = `cinematic_frame3_${currentSessionId}.jpg`;
                                const f1Path = path.join(publicDir, f1Filename);
                                const f2Path = path.join(publicDir, f2Filename);
                                const f3Path = path.join(publicDir, f3Filename);
                                fs.writeFileSync(f1Path, Buffer.from(base64F1, 'base64'));
                                fs.writeFileSync(f2Path, Buffer.from(base64F2, 'base64'));
                                fs.writeFileSync(f3Path, Buffer.from(base64F3, 'base64'));
                                f1Url = `https://localhost:${PORT}/public/${f1Filename}`;
                                f2Url = `https://localhost:${PORT}/public/${f2Filename}`;
                                f3Url = `https://localhost:${PORT}/public/${f3Filename}`;
                              }
 
                              console.log(`[Media Generation] Saved generated keyframes to public directory`);
 
                              sendToClient({
                                type: 'AGENT_LOG',
                                agentName: 'NB2 Lite Image Fleet',
                                executionLog: hasCinematic 
                                  ? `Still ad (1:1) and 3 Cinematic video keyframes (9:16) generated successfully.`
                                  : `Still ad (1:1) generated successfully.`
                              });
 
                              // Step C: Run Gemini Visual QA Supervisor loop
                              sendToClient({
                                type: 'AGENT_LOG',
                                agentName: 'QA Supervisor',
                                executionLog: 'Starting visual layout and typography contrast audit on Still image...'
                              });
 
                              const qaInstruction = `
You are the Automated Production Supervisor. Analyze this incoming media frame against design constraints:
1. Is the overlaid text readable against the background? If color contrast is low, return compliant: false.
2. Is the main product visible and unclipped?
Output exactly a JSON object containing: {"compliant": boolean, "required_adjustments": string | null}. Do not wrap in markdown tags.
                              `;
 
                              // Use Interactions API instead of generateContent for gemini-omni-flash-preview
                              const qaResponse = await (ai.interactions.create as any)({
                                model: 'gemini-omni-flash-preview',
                                input: [
                                  { type: 'image', data: base64Still, mime_type: 'image/jpeg' },
                                  { type: 'text', text: qaInstruction }
                                ]
                              });
 
                              const qaText = qaResponse.output_text?.trim() || qaResponse.steps?.[2]?.content?.[0]?.text?.trim() || '{"compliant": true, "required_adjustments": null}';
                              console.log(`[QA Response] ${qaText}`);
                              
                              let parsedText = qaText;
                              const firstBrace = qaText.indexOf('{');
                              const lastBrace = qaText.lastIndexOf('}');
                              if (firstBrace !== -1 && lastBrace !== -1) {
                                parsedText = qaText.substring(firstBrace, lastBrace + 1);
                              }
                              const qaResult = JSON.parse(parsedText.trim());
 
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
 
 
                              let finalVideoUrl = '';
                              if (hasCinematic && base64F1) {
                                // Step D: Gemini Omni Flash vertical video compilation
                                sendToClient({
                                  type: 'AGENT_LOG',
                                  agentName: 'Gemini Omni Flash',
                                  executionLog: 'Generating 9:16 vertical motion video using Gemini Omni Flash...'
                                });
 
                                try {
                                  const videoInteraction = await (ai.interactions.create as any)({
                                    model: 'gemini-omni-flash-preview',
                                    input: [
                                      { type: 'image', data: base64F1, mime_type: 'image/jpeg' },
                                      { type: 'text', text: `Generate a 9:16 vertical portrait video ad based on this starting frame. Motion prompt: ${args.cinematic_prompts[0]}. Unbroken scene, smooth cinematography.` }
                                    ],
                                    response_format: {
                                      type: 'video',
                                      aspect_ratio: '9:16'
                                    }
                                  });
 
                                  const videoData = videoInteraction.output_video?.data || videoInteraction.steps?.[2]?.content?.[0]?.data;
                                  if (videoData) {
                                    const videoFilename = `video_${currentSessionId}.mp4`;
                                    const videoPath = path.join(publicDir, videoFilename);
                                    fs.writeFileSync(videoPath, Buffer.from(videoData, 'base64'));
                                    finalVideoUrl = `https://localhost:${PORT}/public/${videoFilename}`;
                                    console.log(`[Gemini Omni Flash] Video generated successfully: ${videoPath}`);
                                    sendToClient({
                                      type: 'AGENT_LOG',
                                      agentName: 'Gemini Omni Flash',
                                      executionLog: `Video ad generated successfully: ${finalVideoUrl}`
                                    });
                                  } else {
                                    console.log('[Gemini Omni Flash] No video data returned in response.');
                                  }
                                } catch (videoErr: any) {
                                  console.error('[Gemini Omni Flash Video Error]:', videoErr);
                                  sendToClient({
                                    type: 'AGENT_LOG',
                                    agentName: 'Gemini Omni Flash',
                                    executionLog: `Video generation failed: ${videoErr.message || videoErr}`
                                  });
                                }
                              }
 
                              // Send preview URL down to client
                              sendToClient({
                                type: 'AD_PREVIEW',
                                url: stillUrl,
                                stillUrl: stillUrl,
                                cinematicUrl: finalVideoUrl || f2Url || undefined, // Fallback to Frame 2 if video generation failed
                                keyframes: f1Url && f2Url && f3Url ? [f1Url, f2Url, f3Url] : []
                              });
 
                              // Inject success update back to Live conversation context
                              const videoMention = finalVideoUrl ? 'and a vertical motion video ad' : '';
                              liveSession?.sendClientContent({
                                turns: [{
                                  role: 'user',
                                  parts: [{ text: `[System Update] The creative design pipeline has successfully completed. The generated still image banner ${videoMention} are now displayed on the user's screen. Please describe the generated ad banner copy and styling, ask if they like them, and check if they want to publish.` }]
                                }],
                                turnComplete: true
                              });
 
                            } catch (genErr: any) {
                              console.error('[Creative Chain Error]:', genErr);
                              sendToClient({
                                type: 'AGENT_LOG',
                                agentName: 'Creative Director',
                                executionLog: `Generation pipeline exception: ${genErr.message || genErr}`
                              });
                            }
                          }, 0);
                        }
                      }
                    }
                  }

                  // Surface user audio transcripts
                  if (msg.inputTranscription?.text && msg.inputTranscription.finished) {
                    sendToClient({
                      type: 'TRANSCRIPT',
                      transcript: msg.inputTranscription.text,
                      sender: 'user'
                    });
                  }

                  // Surface model audio transcripts
                  if (msg.outputTranscription?.text && msg.outputTranscription.finished) {
                    sendToClient({
                      type: 'TRANSCRIPT',
                      transcript: msg.outputTranscription.text,
                      sender: 'ai'
                    });
                  }

                  // Downstream Media Output Pipeline (Audio Synthesized Voice + Text Transcripts)
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
                      // Surface text parts as transcripts in the chat feed
                      if (part.text) {
                        sendToClient({
                          type: 'TRANSCRIPT',
                          transcript: part.text,
                          sender: 'ai'
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

            // Send initial trigger turn to make Live greet the user
            // Must be AFTER await so liveSession is assigned (onopen fires before the Promise resolves)
            liveSession.sendClientContent({
              turns: [
                {
                  role: 'user',
                  parts: [{ text: 'Hello, I just connected. Please greet me and help me get started.' }]
                }
              ],
              turnComplete: true
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

            // Surface user text input as transcript in the chat
            sendToClient({
              type: 'TRANSCRIPT',
              transcript: message.text,
              sender: 'user'
            });

            liveSession.sendClientContent({
              turns: [
                {
                  role: 'user',
                  parts: [{ text: message.text }]
                }
              ],
              turnComplete: true
            });
          }
          break;

        case 'AUDIO_INPUT':
          if (liveSession && message.audio) {
            liveSession.sendRealtimeInput({
              audio: {
                mimeType: 'audio/pcm;rate=16000',
                data: message.audio
              }
            });
          }
          break;

        case 'VIDEO_INPUT':
          if (liveSession && message.image) {
            liveSession.sendRealtimeInput({
              video: {
                mimeType: 'image/jpeg',
                data: message.image
              }
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
