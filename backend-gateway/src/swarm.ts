import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({});

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

    console.log('[Swarm Ingestion] Connecting to Interactions API...');
    const interaction = await (ai as any).interactions.create({
      agent: 'antigravity-preview-05-2026',
      input: swarmInstruction,
      environment: 'remote',
    });

    console.log(`[Swarm Ingestion] Successfully created interaction: ${interaction.id}`);
    console.log('[Swarm Ingestion] Diagnostic keys:', Object.keys(interaction));
    console.log('[Swarm Ingestion] raw text:', (interaction as any).text);
    console.log('[Swarm Ingestion] outputText:', (interaction as any).outputText);
    console.log('[Swarm Ingestion] output_text:', (interaction as any).output_text);
    
    const manifestJson = (interaction as any).text || (interaction as any).outputText || (interaction as any).output_text || defaultManifest;
    
    return {
      interactionId: interaction.id || `mock_thread_${Date.now()}`,
      manifestJson: manifestJson
    };
  } catch (error: any) {
    console.warn('[Control Plane Exception] Swarm API failed. Fallback to baseline context:', error.message || error);
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
    console.log(`[Swarm Context Update] Sending update to thread: ${interactionId}`);
    
    const interaction = await (ai as any).interactions.create({
      agent: 'antigravity-preview-05-2026',
      input: inputUpdate,
      interactionId: interactionId,
      environment: 'remote',
    });

    const updatedManifestJson = (interaction as any).text || (interaction as any).outputText || (interaction as any).output_text || defaultManifest;
    return updatedManifestJson;
  } catch (error: any) {
    console.warn(`[Control Plane Exception] Failed to update interaction ${interactionId}:`, error.message || error);
    return defaultManifest;
  }
}
