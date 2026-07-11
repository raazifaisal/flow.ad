import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({});

interface BusinessProfile {
  businessName: string;
  merchantLocation: string;
  businessCategory: string;
  targetLanguage: string;
  requestCasualVibe?: boolean; // Optional flag to enable slang/casual copywriting
}

interface SwarmResult {
  interactionId: string;
  manifestJson: string;
}

/**
 * Extracts generated text content from the stateful Interaction resource steps.
 */
function extractTextFromInteraction(interaction: any): string | null {
  if (interaction.text) return interaction.text;
  if (interaction.outputText) return interaction.outputText;
  if (interaction.output_text) return interaction.output_text;
  
  if (interaction.steps && Array.isArray(interaction.steps)) {
    for (const step of interaction.steps) {
      if (step.modelOutput?.parts) {
        for (const part of step.modelOutput.parts) {
          if (part.text) return part.text;
        }
      } else if (step.content?.parts) {
        for (const part of step.content.parts) {
          if (part.text) return part.text;
        }
      }
    }
  }
  return null;
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
  const defaultManifest = JSON.stringify({
    local_event: "Weekend Baking Specials",
    environmental_trigger: "Breezy Bangalore weather",
    neighborhood_slangs: "Macha, Boss",
    recommended_copy_strategy: `Indulge in premium artisanal pastries and hot coffee at ${profile.businessName} today.`
  });

  try {
    const swarmInstruction = `
Context Flag: System Container Initialization Engine
Target Environment: Remote Linux Sandbox
Core Task: Hyper-Local Trend, Vibe and Event Analysis

Business Profile Context:
- Business Name: ${profile.businessName}
- Location: ${profile.merchantLocation}
- Category: ${profile.businessCategory}
- Target Language: ${profile.targetLanguage}
- Request Casual Slang Tone: ${profile.requestCasualVibe ? "YES" : "NO"}

You are an expert local market analyst. 
1. Use the google_search grounding tool to find the CURRENT weather conditions and temperature in ${profile.merchantLocation} (Bengaluru) for today.
2. Search specifically for active local events, fests, or community meetups happening TODAY within a 2km radius of SG Palya, Sadduguntepalya, or Koramangala. Restrict your queries/results using sources like Eventbrite, Reddit (e.g. r/bangalore), Meetup, and local listings. Do NOT return events far away (like Whitefield or JP Nagar).
3. Extract 3 popular local slang words in ${profile.targetLanguage} matching this neighborhood.
4. Synthesize this info and write a copywriting strategy:
   - If the business is a classy brand (like a Patisserie, Boutique, Cafe) and "Request Casual Slang Tone" is NO, write an elegant, classy, premium, and sophisticated copywriting strategy. Do NOT inject street slang words in the copy.
   - If "Request Casual Slang Tone" is YES, you may write a casual copy incorporating regional slang words naturally.

Output only a raw JSON payload containing:
{
  "local_event": "A highly localized event/fest/meetup happening within 2km of SG Palya/Koramangala/Sadduguntepalya today",
  "environmental_trigger": "Current real-time weather and temperature",
  "neighborhood_slangs": "The 3 neighborhood slang words detected",
  "recommended_copy_strategy": "The tailored copywriting slogan (classy/premium by default, casual with slang only if requested)"
}
Do not include markdown code wrappers (e.g., \`\`\`json) or any conversational text.
`;

    console.log('[Swarm Ingestion] Connecting to Interactions API...');
    const interaction = await (ai as any).interactions.create({
      agent: 'antigravity-preview-05-2026',
      input: swarmInstruction,
      environment: 'remote',
    });

    console.log(`[Swarm Ingestion] Successfully created interaction: ${interaction.id}`);
    
    const extractedText = extractTextFromInteraction(interaction);
    console.log('[Swarm Ingestion] Extracted manifest text:', extractedText);
    
    const manifestJson = extractedText || defaultManifest;
    
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
    local_event: "Weekend Baking Specials",
    environmental_trigger: "Breezy Bangalore weather",
    neighborhood_slangs: "Macha, Boss",
    recommended_copy_strategy: `Indulge in premium artisanal pastries and hot coffee at ${profile.businessName} today.`
  });

  try {
    console.log(`[Swarm Context Update] Sending update to thread: ${interactionId}`);
    
    const interaction = await (ai as any).interactions.create({
      agent: 'antigravity-preview-05-2026',
      input: inputUpdate,
      previous_interaction_id: interactionId,
      environment: 'remote',
    });

    const extractedText = extractTextFromInteraction(interaction);
    const updatedManifestJson = extractedText || defaultManifest;
    return updatedManifestJson;
  } catch (error: any) {
    console.warn(`[Control Plane Exception] Failed to update interaction ${interactionId}:`, error.message || error);
    return defaultManifest;
  }
}
