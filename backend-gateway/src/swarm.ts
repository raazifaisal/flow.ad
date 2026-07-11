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
 * Control Plane Architecture: Initializes a stateful sandbox interaction thread.
 * Coordinates 4 distinct agents collaborating on a shared blackboard state (session_manifest.json):
 * - Agent A (Geo Scout): Environmental/location signals.
 * - Agent B (Business Intelligence Analyst): Review/order history ingestion.
 * - Agent C (War-Room Financial Strategist): Competitor gap scraping & Python margin simulation.
 * - Agent D (Creative Brand Coordinator): Vibe curation, slang audit, and copy strategy.
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
    recommended_copy_strategy: `Indulge in our premium offerings at ${profile.businessName} today.`,
    hero_products: ["Our signature items"],
    customer_sentiments: "Neutral customer sentiment",
    competitor_analysis: "Standard local competition detected",
    pricing_simulation: "Baseline pricing model applied"
  });

  try {
    const swarmInstruction = `
Context Flag: System Container Initialization Engine
Target Environment: Remote Linux Sandbox
Core Task: Dynamic Multi-Agent Curation and Financial Simulation

You are the Swarm Coordinator managing 4 specialized agents collaborating via a shared memory container.
You have access to the google_search tool and can write and run python scripts in the environment.

Business Profile:
- Business Name: ${profile.businessName}
- Location: ${profile.merchantLocation}
- Category: ${profile.businessCategory}
- Target Language: ${profile.targetLanguage}
- Request Casual Slang Tone: ${profile.requestCasualVibe ? "YES" : "NO"}

Google Business Profile Reviews:
${googleReviews ? JSON.stringify(googleReviews, null, 2) : "No review logs available."}

WhatsApp Business Commerce Orders:
${whatsappOrders ? JSON.stringify(whatsappOrders, null, 2) : "No past orders available."}

Execute the following agent collaboration loop:

1. [Agent A: Geo Scout]
   - Task: Use google_search to retrieve current weather/temperature and local active events (within 2km) today. Target Eventbrite, local subreddits, and meetups. Avoid events in distant neighborhoods.
   - Outputs: local_event, environmental_trigger.

2. [Agent B: Business Intelligence Analyst]
   - Task: Read the raw Google Business Profile reviews and WhatsApp order history. Identify your top-velocity products (hero_products) and extract customer feedback comments to understand core sentiment and pain points.
   - Outputs: hero_products, customer_sentiments.

3. [Agent C: War-Room Financial Strategist]
   - Task: Use google_search to look up nearby competitors in the "${profile.businessCategory}" category within 2km. Find their operating hours or pricing gaps. 
   - Task: Extract the average price of your hero product from the WhatsApp order data. Estimate a logical COGS (30-40% of retail price).
   - Task: Write and run a Python script in your sandbox to simulate profit outcomes for three promotional discount steps (10%, 15%, 20%) assuming a 1.5x sales volume boost. Select the pricing target that yields the highest absolute profit increase.
   - Outputs: competitor_analysis, pricing_simulation.

4. [Agent D: Creative Brand Coordinator]
   - Task: Synthesize all agent outputs. Identify 3 popular slangs in "${profile.targetLanguage}" for this location.
   - Task: Formulate a compelling ad copywriting strategy. Keep it classy and elegant by default. Only use casual/slang tones if "Request Casual Slang Tone" is YES. Highlight the promo item selected by Agent C.
   - Outputs: neighborhood_slangs, recommended_copy_strategy.

Output only a single raw valid JSON payload containing these exact keys:
{
  "local_event": "string",
  "environmental_trigger": "string",
  "hero_products": ["string"],
  "customer_sentiments": "string",
  "competitor_analysis": "string",
  "pricing_simulation": "string summarizing optimal promo item, discount rate, and calculated profit increase",
  "neighborhood_slangs": "string",
  "recommended_copy_strategy": "string"
}
Do not include markdown wrappers (e.g., \`\`\`json) or any conversational text.
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

/**
 * Agent E: Reference Ad Curator.
 * Searches the web for real-world competitor/category reference ad campaigns matching the dynamic runtime tags.
 */
export async function fetchReferenceAds(
  businessCategory: string,
  adTone: string,
  focusProduct: string,
  offerDetails?: string
): Promise<string> {
  const defaultReferences = JSON.stringify([
    {
      headline: `Fresh ${focusProduct} Daily`,
      description: `Delicious handcrafted ${focusProduct} prepared with premium ingredients.`,
      visual_vibe: `Classy, elegant display with soft lighting and product focus.`,
      reference_url: `http://localhost:50051/public/fallback_ref.jpg`
    }
  ]);

  try {
    const referenceQueryInstruction = `
Context Flag: System Container Initialization Engine
Target Environment: Remote Linux Sandbox
Core Task: Agent E (Reference Ad Curator) Dynamic Web Curation

You are Agent E, the Reference Ad Curator. Your objective is to find real competitor campaigns, promotional structures, and style guidelines matching the following dynamic target tags:
- Business Category: ${businessCategory}
- Inferred Ad Tone: ${adTone}
- Focus Product: ${focusProduct}
- Specific Offer/Details: ${offerDetails || 'None'}

Using the google_search tool:
1. Search for successful digital ads, Instagram visual designs, and copy layout references for "${focusProduct}" within "${businessCategory}".
2. Identify target visual elements, color schemes, and layout formats.
3. Extract reference descriptions and style guides.

Compile your findings into a single raw JSON array containing exactly three reference ad items with these keys:
[
  {
    "headline": "inspirational copy slogan or headline",
    "description": "description of the ad layout, text overlay, and copy direction",
    "visual_vibe": "suggestive design styles, colors, and layout structure (e.g. minimalist gold accents, macro lighting)",
    "reference_url": "valid placeholder or web URL for style lookup"
  }
]

Do not include markdown wrappers (e.g., \`\`\`json) or any conversational text. Output only the raw valid JSON payload.
`;

    console.log('[Swarm Ingestion] Initializing Agent E (Reference Ad Curator) sandbox query...');
    const interaction = await (ai as any).interactions.create({
      agent: 'antigravity-preview-05-2026',
      input: referenceQueryInstruction,
      environment: 'remote',
    });

    console.log(`[Swarm Ingestion] Agent E created interaction: ${interaction.id}`);
    const extractedText = extractTextFromInteraction(interaction);
    console.log('[Swarm Ingestion] Agent E extracted references:', extractedText);

    return extractedText || defaultReferences;
  } catch (error: any) {
    console.warn('[Control Plane Exception] Agent E sandbox fetch failed. Fallback to baseline references:', error.message || error);
    return defaultReferences;
  }
}
