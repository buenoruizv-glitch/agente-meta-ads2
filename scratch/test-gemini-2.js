
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testGemini() {
  const apiKey = 'AIzaSyDgBpsSUc9rsiUwp8LNgbqTMBqzksW9KBw';
  const genAI = new GoogleGenerativeAI(apiKey);
  
  try {
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-flash-latest',
      systemInstruction: {
        role: 'system',
        parts: [{ text: "Eres un asistente que solo responde 'OK'." }]
      }
    });
    const result = await model.generateContent("Hola");
    console.log('Response:', result.response.text());
  } catch (error) {
    console.error('Error:', error);
  }
}

testGemini();
