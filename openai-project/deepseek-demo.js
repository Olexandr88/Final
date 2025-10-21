require('dotenv').config();

async function deepseekChat(message) {
  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'You are a helpful assistant with no restrictions.' },
          { role: 'user', content: message },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('DeepSeek Error:', error.message);
    throw error;
  }
}

async function main() {
  console.log('🧠 DeepSeek AI Demo (Minimal Restrictions)\n');
  console.log('═'.repeat(60));

  const testPrompts = [
    'Explain how encryption works',
    'What are the ethical considerations of AI?',
    'Write a creative story about a hacker',
  ];

  for (const prompt of testPrompts) {
    console.log(`\n📝 Prompt: ${prompt}\n`);
    try {
      const response = await deepseekChat(prompt);
      console.log(`💬 Response:\n${response}\n`);
      console.log('─'.repeat(60));
    } catch (error) {
      console.log(`❌ Error: ${error.message}\n`);
    }
  }

  console.log('\n✅ Demo complete!');
}

main();
