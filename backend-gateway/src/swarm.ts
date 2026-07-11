import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface BusinessProfile {
  businessName: string;
  merchantLocation: string;
  businessCategory: string;
  targetLanguage: string;
}

interface SwarmResult {
  interactionId: string;
  manifestJson: string;
}

/**
 * Helper to wrap any promise with a timeout rejection.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Interactions API timeout after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

/**
 * Control Plane Architecture: Initializes a stateful sandbox interaction thread
 * and runs Agent A, B, and C. The swarm uses the google_search tool in the remote sandbox
 * to dynamically query weather, events, and slang for the merchant's location.
 */
export async function spawnContextIngestionSwarm(
  sessionId: string,
  profile: BusinessProfile
): Promise<SwarmResult> {
  // Simple baseline fallback in case of connection exceptions
  const defaultManifest = JSON.stringify({
    local_event: "Weekend Bakery Sale",
    environmental_trigger: "Breezy afternoon",
    neighborhood_slangs: "Boss, Macha",
    recommended_copy_strategy: `Fresh pastries and cakes at ${profile.businessName}!`
  });

  try {
    const swarmInstruction = `
Context Flag: System Container Initialization Engine
Target Environment: Remote Linux Sandbox
Core Task: Localized Trend and Vibe Analysis

Business Profile Context:
- Business Name: ${profile.businessName}
- Location: ${profile.merchantLocation}
- Category: ${profile.businessCategory}
- Target Language: ${profile.targetLanguage}

You are an expert local market analyst. Use the google_search grounding tool to find the CURRENT weather conditions, active local events, and trending regional slangs in ${profile.merchantLocation} for today.

Synthesize this info and output a raw JSON payload containing:
{
  "local_event": "A real event, festival, or holiday happening in the area today (based on search)",
  "environmental_trigger": "Current real-time weather and temperature (based on search)",
  "neighborhood_slangs": "3 popular local slang words in ${profile.targetLanguage} matching this neighborhood",
  "recommended_copy_strategy": "A creative, short ad slogan in ${profile.targetLanguage} script incorporating the product and slang"
}
Output only the raw JSON. Do not include markdown code wrappers (e.g., \`\`\`json) or any conversational text.
`;

    console.log('[Swarm Ingestion] Connecting to Interactions API with 15s timeout...');
    const interactionPromise = (ai as any).interactions.create({
      agent: 'antigravity-preview-05-2026',
      input: swarmInstruction,
      environment: 'remote',
    });

    const interaction = await withTimeout<any>(interactionPromise, 15000);
    console.log(`[Swarm Ingestion] Successfully created interaction: ${interaction.id}`);
    
    const manifestText = (interaction as any).output_text || interaction.text || defaultManifest;
    return {
      interactionId: interaction.id || `mock_thread_${Date.now()}`,
      manifestJson: manifestText
    };
  } catch (error: any) {
    console.warn('[Control Plane Exception] Swarm API failed/timed out. Fallback to baseline context:', error.message || error);
    return {
      interactionId: `mock_thread_${Date.now()}`,
      manifestJson: defaultManifest
    };
  }
}

/**
 * Appends context updates to the existing stateful interaction thread in the sandbox.
 */
export async function updateInteractionContext(
  interactionId: string,
  inputUpdate: string,
  profile: BusinessProfile
): Promise<string> {
  const defaultManifest = JSON.stringify({
    local_event: "Weekend Bakery Sale",
    environmental_trigger: "Breezy afternoon",
    neighborhood_slangs: "Boss, Macha",
    recommended_copy_strategy: `Fresh pastries and cakes at ${profile.businessName}!`
  });

  try {
    console.log(`[Swarm Context Update] Sending update to thread: ${interactionId} with 15s timeout`);
    
    const interactionPromise = (ai as any).interactions.create({
      agent: 'antigravity-preview-05-2026',
      input: inputUpdate,
      interactionId: interactionId,
      environment: 'remote',
    });

    const interaction = await withTimeout<any>(interactionPromise, 15000);
    return (interaction as any).output_text || interaction.text || defaultManifest;
  } catch (error: any) {
    console.warn(`[Control Plane Exception] Failed or timed out updating interaction ${interactionId}:`, error.message || error);
    return defaultManifest;
  }
}
