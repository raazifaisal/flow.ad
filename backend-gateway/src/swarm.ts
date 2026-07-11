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
 * and runs Agent A, B, and C.
 */
export async function spawnContextIngestionSwarm(
  sessionId: string,
  profile: BusinessProfile
): Promise<SwarmResult> {
  const defaultManifest = JSON.stringify({
    local_event: "IPL Local Screening Party at near market center",
    environmental_trigger: "High temperature, sunny afternoon",
    neighborhood_slangs: "Gethu, Machan, Semma",
    recommended_copy_strategy: `Offer chilled beverages at ${profile.businessName} with regional slang tags.`
  });

  try {
    const swarmInstruction = `
Context Flag: System Container Initialization Engine
Target Environment: Remote Linux Sandbox
Core Task: Multi-Agent Localized Trend Analysis

Business Profile Context:
- Business Name: ${profile.businessName}
- Location: ${profile.merchantLocation}
- Category: ${profile.businessCategory}
- Target Language: ${profile.targetLanguage}

You are the Federated Swarm Coordinator governing three internal execution tasks. You have access to the google_search grounding tool. Read and write your progress parameters to the shared memory object 'session_manifest.json'.

Perform the following system iterations:
1. Initialize Agent A (The Geo Scout): Query the search tool using the merchant location: ${profile.merchantLocation}. Identify immediate local events, college festivals, neighborhood sports matches, and localized weather fluctuations happening within a 2-kilometer grid today.
2. Initialize Agent B (The Creative Archivist): Analyze Agent A's findings. Synthesize the optimal design theme, color palettes, and visual layout instructions dynamically using world knowledge matching the current environmental vibe and target product category: ${profile.businessCategory}.
3. Initialize Agent C (The Slang Strategist): Scan nearby public business markers and social feeds around ${profile.merchantLocation}. Extract highly active regional slangs, localized keywords, and popular idioms unique to this specific market zone matching target language: ${profile.targetLanguage}.

Consolidate all values into a single, clean JSON string containing exclusively the keys:
'local_event', 'environmental_trigger', 'neighborhood_slangs', and 'recommended_copy_strategy'.

Constraint Check: Do not include markdown code wrappers (e.g., \`\`\`json) or any conversational text strings. Output only the raw valid JSON payload.
`;

    const interaction = await (ai as any).interactions.create({
      agent: 'antigravity-preview-05-2026',
      input: swarmInstruction,
      environment: 'remote',
    });

    console.log(`[Swarm Ingestion] Successfully created interaction: ${interaction.id}`);
    
    return {
      interactionId: interaction.id || `mock_thread_${Date.now()}`,
      manifestJson: interaction.text || defaultManifest
    };
  } catch (error: any) {
    console.warn('[Control Plane Exception] Swarm API not available. Fallback to default baseline context:', error.message || error);
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
  inputUpdate: string
): Promise<string> {
  const defaultManifest = JSON.stringify({
    local_event: "IPL Local Screening Party at near market center",
    environmental_trigger: "High temperature, sunny afternoon",
    neighborhood_slangs: "Gethu, Machan, Semma",
    recommended_copy_strategy: "Offer chilled local beverages with regional slang tags."
  });

  try {
    console.log(`[Swarm Context Update] Sending new step to thread: ${interactionId}`);
    
    const interaction = await (ai as any).interactions.create({
      agent: 'antigravity-preview-05-2026',
      input: inputUpdate,
      interactionId: interactionId,
      environment: 'remote',
    });

    return interaction.text || defaultManifest;
  } catch (error: any) {
    console.warn(`[Control Plane Exception] Failed to update interaction ${interactionId}:`, error.message || error);
    return defaultManifest;
  }
}
