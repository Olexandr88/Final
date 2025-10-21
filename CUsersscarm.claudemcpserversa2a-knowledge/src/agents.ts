import { v4 as uuidv4 } from 'uuid';

export type AgentCapability = {
  name: string;
  inputSchema: object;
  outputSchema: object;
  description?: string;
};

export type AgentDescriptor = {
  id: string;
  name: string;
  version: string;
  capabilities: AgentCapability[];
};

export const agents: Record<string, AgentDescriptor> = {};

function makeEchoAgent(): AgentDescriptor {
  return {
    id: 'echo',
    name: 'Echo Agent',
    version: '1.0.0',
    capabilities: [
      {
        name: 'chat',
        description: 'Echoes your input back, token-streamed.',
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            messages: {
              type: 'array',
              items: {
                type: 'object',
                required: ['role', 'content'],
                additionalProperties: false,
                properties: {
                  role: { type: 'string', enum: ['user', 'assistant', 'system'] },
                  content: { type: 'string' },
                },
              },
            },
          },
          required: ['messages'],
        },
        outputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            requestId: { type: 'string' },
            streamUrl: { type: 'string' },
          },
          required: ['requestId', 'streamUrl'],
        },
      },
    ],
  };
}

// Initialize default agents
(function init() {
  const echo = makeEchoAgent();
  agents[echo.id] = echo;
})();

export function ensureRequestId(seed?: string) {
  return seed ?? uuidv4();
}
