import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({});

interface BusinessProfile {
  businessName: string;
  merchantLocation: string;
  businessCategory: string;
  targetLanguage: string;
  mockContext?: {
    local_event: string;
    environmental_trigger: string;
    neighborhood_slangs: string;
    recommended_copy_strategy: string;
  };
}

interface SwarmResult {
  interactionId: string;
  manifestJson: string;
}

/**
 * Helper to wrap a promise with a timeout.
 */
function withTimeout(promise: Promise<any>, ms: number, timeoutError: Error): Promise<any> {
  return Promise.race([
    promise,
    new Promise<any>((_, reject) => setTimeout(() => reject(timeoutError), ms))
  ]);
}

/**
 * Control Plane Architecture: Initializes a stateful sandbox interaction thread
 * and runs Agent A, B, and C with a resilient 45-second timeout guard.
 * Fallbacks are dynamically loaded from the mock profile JSON.
 */
export async function spawnContextIngestionSwarm(
  sessionId: string,
  profile: BusinessProfile
): Promise<SwarmResult> {
  const defaultManifest = JSON.stringify({
    local_event: profile.mockContext?.local_event || "Local Market Sale",
    environmental_trigger: profile.mockContext?.environmental_trigger || "Sunny weather",
    neighborhood_slangs: profile.mockContext?.neighborhood_slangs || "None",
    recommended_copy_strategy: profile.mockContext?.recommended_copy_strategy || `Visit ${profile.businessName} today!`
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
    const interactionPromise = (ai as any).interactions.create({
      agent: 'antigravity-preview-05-2026',
      input: swarmInstruction,
      environment: 'remote',
    });

    const interaction = await withTimeout(
      interactionPromise,
      45000,
      new Error('Interactions API request timed out')
    );

    console.log(`[Swarm Ingestion] Successfully created interaction: ${interaction.id}`);
    
    return {
      interactionId: interaction.id || `mock_thread_${Date.now()}`,
      manifestJson: interaction.text || defaultManifest
    };
  } catch (error: any) {
    console.warn('[Control Plane Exception] Swarm API failed or timed out. Fallback to baseline context:', error.message || error);
    return {
      interactionId: `mock_thread_${Date.now()}`,
      manifestJson: defaultManifest
    };
  }
}

/**
 * Appends context updates to the existing stateful interaction thread in the sandbox with a 25-second timeout guard.
 */
export async function updateInteractionContext(
  interactionId: string,
  inputUpdate: string,
  profile: BusinessProfile
): Promise<string> {
  const defaultManifest = JSON.stringify({
    local_event: profile.mockContext?.local_event || "Local Market Sale",
    environmental_trigger: profile.mockContext?.environmental_trigger || "Sunny weather",
    neighborhood_slangs: profile.mockContext?.neighborhood_slangs || "None",
    recommended_copy_strategy: profile.mockContext?.recommended_copy_strategy || `Visit ${profile.businessName} today!`
  });

  try {
    console.log(`[Swarm Context Update] Sending update to thread: ${interactionId}`);
    
    const interactionPromise = (ai as any).interactions.create({
      agent: 'antigravity-preview-05-2026',
      input: inputUpdate,
      interactionId: interactionId,
      environment: 'remote',
    });

    const interaction = await withTimeout(
      interactionPromise,
      25000,
      new Error('Interaction update request timed out')
    );

    return interaction.text || defaultManifest;
  } catch (error: any) {
    console.warn(`[Control Plane Exception] Failed to update interaction ${interactionId}:`, error.message || error);
    return defaultManifest;
  }
}
