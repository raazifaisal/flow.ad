import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({});

interface BusinessProfile {
  businessName: string;
  merchantLocation: string;
  businessCategory: string;
  targetLanguage: string;
  requestCasualVibe?: boolean;
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
 * to dynamically query weather, events, and competitor details. It executes a python script
 * to run a margin pricing simulation based on ingested WhatsApp/Google Business records.
 */
export async function spawnContextIngestionSwarm(
  sessionId: string,
  profile: BusinessProfile,
  googleReviews?: any,
  whatsappOrders?: any
): Promise<SwarmResult> {
  const defaultManifest = JSON.stringify({
    local_event: "Weekend Specials",
    environmental_trigger: `Breezy weather at ${profile.merchantLocation}`,
    neighborhood_slangs: "None",
    recommended_copy_strategy: `Indulge in our premium offerings at ${profile.businessName} today.`
  });

  try {
    const swarmInstruction = `
Context Flag: System Container Initialization Engine
Target Environment: Remote Linux Sandbox
Core Task: Hyper-Local Trend, Competitor and Pricing Margin Analysis

Business Profile Context:
- Business Name: ${profile.businessName}
- Location: ${profile.merchantLocation}
- Category: ${profile.businessCategory}
- Target Language: ${profile.targetLanguage}
- Request Casual Slang Tone: ${profile.requestCasualVibe ? "YES" : "NO"}

Google Business Profile Reviews:
${googleReviews ? JSON.stringify(googleReviews, null, 2) : "No review logs available."}

WhatsApp Business Commerce Orders:
${whatsappOrders ? JSON.stringify(whatsappOrders, null, 2) : "No past orders available."}

You are an expert local market analyst and business strategist. Run a collaborative multi-agent simulation in your sandbox:
1. Use the google_search grounding tool to find:
   - Current weather conditions and temperature in "${profile.merchantLocation}" today.
   - Active local events, fests, or community meetups happening TODAY within a 2-kilometer radius of "${profile.merchantLocation}". Search sources like Eventbrite, Reddit, Meetup, and local listings. Do NOT return events far away.
   - Active competitor profiles in the "${profile.businessCategory}" category within a 2-kilometer radius of "${profile.merchantLocation}", looking for operating hours, customer complaints on social media/Reddit, or pricing gaps.
2. Ingest the Google Business reviews and WhatsApp orders to determine:
   - Your highest-rated, most popular, or highest-velocity items.
   - Core customer sentiment, feedback, and pain points.
3. Write a Python script inside your sandbox and execute it to run a margin analysis:
   - Identify your top-selling item and its typical price from the order history.
   - Estimate a reasonable Cost of Goods Sold (COGS) for this item (e.g., 30-40% of its retail price).
   - Run the python script to simulate total profit margins at three reasonable discount steps (e.g., 10%, 15%, 20%), factoring in a 1.5x volume increase for the discount.
4. Output a consolidated JSON payload containing your analysis:
{
  "local_event": "A highly localized event/fest/meetup happening within 2km of the location today",
  "environmental_trigger": "Current real-time weather and temperature",
  "neighborhood_slangs": "3 popular slang words matching this neighborhood",
  "recommended_copy_strategy": "A sophisticated copywriting slogan highlighting the item optimized in your pricing simulation. Default to classy/premium unless casual slang vibe is requested."
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
    local_event: "Weekend Specials",
    environmental_trigger: `Breezy weather at ${profile.merchantLocation}`,
    neighborhood_slangs: "None",
    recommended_copy_strategy: `Indulge in our premium offerings at ${profile.businessName} today.`
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
