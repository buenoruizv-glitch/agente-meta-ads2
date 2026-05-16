const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config({ path: '.env.local' });

async function test() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    console.error('No API key found');
    return;
  }
  
  // Try to use v1 instead of v1beta if possible
  // In the JS SDK, this is often handled internally, but let's see what ListModels says.
  
  const genAI = new GoogleGenerativeAI(apiKey);
  // Actually, the SDK version might not support passing apiVersion in the constructor like this
  // but let's try to check the SDK documentation or try another model name format.
  
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    const result = await model.generateContent('Hi');
    console.log('Model gemini-pro works!');
    console.log('Response:', result.response.text());
    return;
  } catch (e) {
    console.log('Model gemini-pro failed:', e.message);
  }
}

test();
