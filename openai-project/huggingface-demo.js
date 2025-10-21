const { HfInference } = require('@huggingface/inference');
require('dotenv').config();

const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

async function textGeneration() {
  console.log('🤖 Testing Text Generation...\n');

  try {
    const result = await hf.textGeneration({
      model: 'mistralai/Mistral-7B-Instruct-v0.2',
      inputs: 'Explain quantum computing in simple terms:',
      parameters: {
        max_new_tokens: 200,
        temperature: 0.7,
      },
    });

    console.log('Response:', result.generated_text);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

async function chatCompletion() {
  console.log('\n💬 Testing Chat Completion...\n');

  try {
    const result = await hf.chatCompletion({
      model: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
      messages: [{ role: 'user', content: 'Write a hello world function in JavaScript' }],
      max_tokens: 500,
    });

    console.log('Response:', result.choices[0].message.content);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

async function summarization() {
  console.log('\n📝 Testing Summarization...\n');

  try {
    const result = await hf.summarization({
      model: 'facebook/bart-large-cnn',
      inputs:
        'The tower is 324 metres (1,063 ft) tall, about the same height as an 81-storey building, and the tallest structure in Paris. Its base is square, measuring 125 metres (410 ft) on each side. During its construction, the Eiffel Tower surpassed the Washington Monument to become the tallest man-made structure in the world.',
      parameters: {
        max_length: 50,
      },
    });

    console.log('Summary:', result.summary_text);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

async function main() {
  if (!process.env.HUGGINGFACE_API_KEY) {
    console.error('❌ Error: HUGGINGFACE_API_KEY not found in .env file');
    console.log('\n📝 Get your free API key at: https://huggingface.co/settings/tokens');
    process.exit(1);
  }

  console.log('🚀 Hugging Face Inference API Demo\n');
  console.log('═'.repeat(50));

  await textGeneration();
  await chatCompletion();
  await summarization();

  console.log('\n' + '═'.repeat(50));
  console.log('✅ Demo complete!');
}

main();
