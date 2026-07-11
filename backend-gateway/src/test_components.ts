import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
console.log('[Test Initialization] API Key present:', !!API_KEY);

if (!API_KEY) {
  console.error('[Error] No API Key found in environment variables. Please check backend-gateway/.env');
  process.exit(1);
}

const ai = new GoogleGenAI({});

async function testSwarmIngestion() {
  console.log('\n--- 1. Testing Interactions API Swarm (antigravity-preview-05-2026) ---');
  const swarmInstruction = `
Context Flag: System Container Initialization Engine
Target Environment: Remote Linux Sandbox
Core Task: Multi-Agent Localized Trend Analysis

You are the Federated Swarm Coordinator governing three internal execution tasks. You have access to the google_search grounding tool. Read and write your progress parameters to the shared memory object 'session_manifest.json'.

Perform the following system iterations:
1. Initialize Agent A (The Geo Scout): Query the search tool using target context for session instance: test_session_123. Identify immediate local events, college festivals, neighborhood sports matches, and localized weather fluctuations happening within a 2-kilometer grid today.
2. Initialize Agent B (The Creative Archivist): Analyze Agent A's findings. Select the optimal design template parameters and visual layout tokens from your internal library that match the current environmental vibe.
3. Initialize Agent C (The Slang Strategist): Scan nearby public business markers and social feeds. Extract highly active regional slangs, localized keywords, and popular idioms unique to this specific market zone.

Consolidate all values into a single, clean JSON string containing exclusively the keys:
'local_event', 'environmental_trigger', 'neighborhood_slangs', and 'recommended_copy_strategy'.

Constraint Check: Do not include markdown code wrappers (e.g., \`\`\`json) or any conversational text strings. Output only the raw valid JSON payload.
`;

  try {
    const interaction = await (ai as any).interactions.create({
      agent: 'antigravity-preview-05-2026',
      input: swarmInstruction,
      environment: 'remote',
    });
    
    console.log('[Success] Swarm Ingestion response:', interaction.text);
    return interaction.text;
  } catch (err: any) {
    console.error('[Fail] Swarm Ingestion failed:', err.message || err);
    return null;
  }
}

async function testImageGeneration() {
  console.log('\n--- 2. Testing Nano Banana 2 Lite Image Generation (gemini-3.1-flash-lite-image) ---');
  const prompt = 'Create a high resolution studio display ad banner for fresh mango juice with a primary background color of neon-green. Integrate the local slang "Semma" natively. Aspect ratio 1:1.';
  
  try {
    // Note: If gemini-3.1-flash-lite-image is not enabled for image generation on your keys,
    // we try it, and fall back to the standard Imagen 3 model if needed.
    const imageResponse = await ai.models.generateImages({
      model: 'gemini-3.1-flash-lite-image',
      prompt: prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/jpeg',
        aspectRatio: '1:1'
      }
    });

    const base64Image = imageResponse.generatedImages?.[0]?.image?.imageBytes;
    if (base64Image) {
      console.log('[Success] Image generated successfully. Size:', base64Image.length, 'bytes');
      // Save test image
      const testPath = path.join(__dirname, '../public/test_generated_ad.jpg');
      // Ensure folder exists
      fs.mkdirSync(path.dirname(testPath), { recursive: true });
      fs.writeFileSync(testPath, Buffer.from(base64Image, 'base64'));
      console.log('[Success] Saved test image to:', testPath);
      return base64Image;
    } else {
      throw new Error('Image bytes empty');
    }
  } catch (err: any) {
    console.error('[Fail] gemini-3.1-flash-lite-image failed:', err.message || err);
    console.log('[Info] Attempting fallback to standard Imagen 3 model...');
    try {
      const fallbackResponse = await ai.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: prompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
          aspectRatio: '1:1'
        }
      });
      const base64Image = fallbackResponse.generatedImages?.[0]?.image?.imageBytes;
      if (base64Image) {
        console.log('[Success] Fallback Imagen 3 generated successfully. Size:', base64Image.length, 'bytes');
        return base64Image;
      }
    } catch (fallbackErr: any) {
      console.error('[Fail] Fallback model also failed:', fallbackErr.message || fallbackErr);
    }
    return null;
  }
}

async function testVisualQASupervisor(base64Image: string) {
  console.log('\n--- 3. Testing Visual QA Supervisor (gemini-3.5-flash) ---');
  const qaInstruction = `
You are the Automated Production Supervisor. Analyze this incoming media frame against design constraints:
1. Is the overlaid text readable against the background? If color contrast is low, return compliant: false.
2. Is the main product visible and unclipped?
Output exactly a JSON object containing: {"compliant": boolean, "required_adjustments": string | null}. Do not wrap in markdown tags.
  `;

  try {
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

    console.log('[Success] Visual QA Response text:', qaResponse.text?.trim());
    const parsed = JSON.parse(qaResponse.text?.replace(/```json|```/g, '').trim() || '{}');
    console.log('[Success] Parsed QA Result:', parsed);
  } catch (err: any) {
    console.error('[Fail] Visual QA failed:', err.message || err);
  }
}

async function runAllTests() {
  console.log('=== STARTING BHARATFLOW ENGINE COMPONENT ISOLATION TESTS ===');
  
  // Test Swarm Ingestion
  await testSwarmIngestion();

  // Test Image Generation
  const base64Image = await testImageGeneration();
  
  if (base64Image) {
    // Test Visual QA using generated image bytes
    await testVisualQASupervisor(base64Image);
  } else {
    console.log('\n[Skip] Visual QA test skipped since image generation failed.');
  }

  console.log('\n=== ISOLATION TESTS COMPLETED ===');
}

runAllTests();
