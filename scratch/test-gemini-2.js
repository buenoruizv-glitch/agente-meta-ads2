const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testGemini() {
  const apiKey = 'AIzaSyDgBpsSUc9rsiUwp8LNgbqTMBqzksW9KBw';
  const genAI = new GoogleGenerativeAI(apiKey);
  
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];
  
  for (const modelName of models) {
    try {
      console.log(`Testing model: ${modelName}...`);
      const model = genAI.getGenerativeModel({ 
        model: modelName,
        systemInstruction: {
          role: 'system',
          parts: [{ text: "Eres un asistente que solo responde 'OK' o llama a una función si el usuario te lo pide." }]
        },
        tools: [{
          functionDeclarations: [{
            name: 'mock_tool',
            description: 'A mock tool to test function calling',
            parameters: {
              type: 'object',
              properties: {
                message: { type: 'string' }
              },
              required: ['message']
            }
          }]
        }]
      });
      const result = await model.generateContent("Llama al mock_tool con el mensaje 'hello world'");
      console.log('Result:', JSON.stringify(result.response));
      const calls = result.response.functionCalls();
      console.log('Calls:', calls);
    } catch (error) {
      console.error(`Error for ${modelName}:`, error.message);
    }
  }
}

testGemini();
