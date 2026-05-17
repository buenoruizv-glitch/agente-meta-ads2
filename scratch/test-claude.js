const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config({ path: '.env.local' });

async function testClaude() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('No Claude API key found');
    return;
  }
  const client = new Anthropic({ apiKey });
  const models = [
    'claude-3-5-sonnet-20240620',
    'claude-3-5-sonnet-latest',
    'claude-3-haiku-20240307',
    'claude-3-opus-20240229'
  ];
  
  for (const model of models) {
    try {
      const response = await client.messages.create({
        model: model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      });
      console.log(`Model ${model} works! Response:`, response.content[0].text);
      return;
    } catch (error) {
      console.error(`Model ${model} failed:`, error.message);
    }
  }
}
testClaude();
