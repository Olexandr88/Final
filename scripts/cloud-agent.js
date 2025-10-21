const axios = require('axios');
const readline = require('readline');

// Cloud model configuration using environment variables
const CLOUD_PROVIDERS = {
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: process.env.OPENAI_MODEL || 'gpt-4',
    enabled: !!process.env.OPENAI_API_KEY,
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    endpoint: 'https://api.anthropic.com/v1/messages',
    model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
    enabled: !!process.env.ANTHROPIC_API_KEY,
  },
  google: {
    apiKey: process.env.GOOGLE_API_KEY,
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    model: process.env.GOOGLE_MODEL || 'gemini-pro',
    enabled: !!process.env.GOOGLE_API_KEY,
  },
};

// Get the first available provider
function getProvider() {
  const provider = process.env.CLOUD_PROVIDER || 'openai';

  if (CLOUD_PROVIDERS[provider] && CLOUD_PROVIDERS[provider].enabled) {
    return { name: provider, config: CLOUD_PROVIDERS[provider] };
  }

  // Fallback to any enabled provider
  for (const [name, config] of Object.entries(CLOUD_PROVIDERS)) {
    if (config.enabled) {
      return { name, config };
    }
  }

  throw new Error(
    'No cloud provider configured. Please set API keys in environment variables.'
  );
}

// OpenAI API call
async function callOpenAI(messages, config) {
  try {
    const response = await axios.post(
      config.endpoint,
      {
        model: config.model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 2000,
      },
      {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data.choices[0].message.content;
  } catch (error) {
    throw new Error(
      `OpenAI API error: ${error.response?.data?.error?.message || error.message}`
    );
  }
}

// Anthropic API call
async function callAnthropic(messages, config) {
  try {
    // Convert OpenAI format to Anthropic format
    const systemMessage = messages.find((m) => m.role === 'system');
    const userMessages = messages.filter((m) => m.role !== 'system');

    const response = await axios.post(
      config.endpoint,
      {
        model: config.model,
        max_tokens: 2000,
        system: systemMessage?.content || '',
        messages: userMessages,
      },
      {
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data.content[0].text;
  } catch (error) {
    throw new Error(
      `Anthropic API error: ${error.response?.data?.error?.message || error.message}`
    );
  }
}

// Google Gemini API call
async function callGoogle(messages, config) {
  try {
    // Convert messages to Gemini format
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const systemInstruction = messages.find(
      (m) => m.role === 'system'
    )?.content;

    const response = await axios.post(
      `${config.endpoint}/${config.model}:generateContent?key=${config.apiKey}`,
      {
        contents: contents,
        systemInstruction: systemInstruction
          ? { parts: [{ text: systemInstruction }] }
          : undefined,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2000,
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data.candidates[0].content.parts[0].text;
  } catch (error) {
    throw new Error(
      `Google API error: ${error.response?.data?.error?.message || error.message}`
    );
  }
}

// Main chat function
async function chat(messages) {
  const { name, config } = getProvider();

  console.log(`Using ${name} with model ${config.model}`);

  switch (name) {
    case 'openai':
      return await callOpenAI(messages, config);
    case 'anthropic':
      return await callAnthropic(messages, config);
    case 'google':
      return await callGoogle(messages, config);
    default:
      throw new Error(`Unknown provider: ${name}`);
  }
}

// Interactive CLI mode
async function interactiveMode() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const messages = [];
  const { name, config } = getProvider();

  console.log(`\n🤖 Cloud Agent - Connected to ${name} (${config.model})`);
  console.log('Type your messages (or "exit" to quit)\n');

  const askQuestion = () => {
    rl.question('You: ', async (input) => {
      if (input.toLowerCase() === 'exit') {
        console.log('Goodbye!');
        rl.close();
        return;
      }

      if (!input.trim()) {
        askQuestion();
        return;
      }

      messages.push({ role: 'user', content: input });

      try {
        process.stdout.write('Assistant: ');
        const response = await chat(messages);
        console.log(response + '\n');
        messages.push({ role: 'assistant', content: response });
      } catch (error) {
        console.error(`Error: ${error.message}\n`);
      }

      askQuestion();
    });
  };

  askQuestion();
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // Interactive mode
    interactiveMode().catch((error) => {
      console.error('Error:', error.message);
      process.exit(1);
    });
  } else {
    // Single query mode
    const query = args.join(' ');
    chat([{ role: 'user', content: query }])
      .then((response) => {
        console.log(response);
        process.exit(0);
      })
      .catch((error) => {
        console.error('Error:', error.message);
        process.exit(1);
      });
  }
}

module.exports = { chat, getProvider, CLOUD_PROVIDERS };
