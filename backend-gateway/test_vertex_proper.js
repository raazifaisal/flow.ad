require('dotenv').config();
// MUST delete the API keys from environment so it doesn't accidentally use the standard API
delete process.env.GOOGLE_API_KEY;
delete process.env.GEMINI_API_KEY;

const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({
  vertexai: { project: 'deepmind-hack26blr-4106', location: 'us-central1' }
});

async function testImageGen() {
  try {
    console.log("Testing NB2 Lite on Vertex AI...");
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-image',
      contents: 'A futuristic city skyline at sunset',
      config: {
        responseModalities: ['IMAGE'],
      }
    });
    console.log("Success with Vertex nb2lite!");
    const imagePart = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (imagePart) {
      console.log("Got image data:", imagePart.mimeType, imagePart.data.substring(0, 30) + '...');
    } else {
      console.log("No image data returned in response.");
    }
  } catch (err) {
    console.error("Error with Vertex nb2lite:", err.message);
  }
}

testImageGen();
