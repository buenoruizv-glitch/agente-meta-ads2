
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function listModels() {
  const apiKey = 'AIzaSyDgBpsSUc9rsiUwp8LNgbqTMBqzksW9KBw';
  
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();
    const models = data.models || [];
    const filtered = models.filter(m => m.name.includes('gemini') && m.supportedGenerationMethods.includes('generateContent'));
    console.log(filtered.map(m => m.name).join('\n'));
  } catch (error) {
    console.error('Error:', error);
  }
}

listModels();
