#!/usr/bin/env node
/**
 * Jules-focused MCP server that exposes a thin wrapper around the Jules API.
 */

import { config } from 'dotenv';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import { pathToFileURL } from 'url';
import { JulesClient } from '../jules-client.js';

config();

const TOOL_DEFINITIONS = [
  {
    name: 'jules_create_session',
    description: 'Create a Jules session for a given source (for example a GitHub repo).',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Task prompt that Jules should execute.'
        },
        source_id: {
          type: 'string',
          description: 'Jules source identifier like sources/github/owner/repo.'
        },
        title: {
          type: 'string',
          description: 'Optional session title.'
        },
        starting_branch: {
          type: 'string',
          description: 'Git branch to use when creating the session.',
          default: 'main'
        }
      },
      required: ['prompt', 'source_id']
    }
  },
  {
    name: 'jules_list_sessions',
    description: 'List Jules sessions that are accessible with the configured API key.',
    inputSchema: {
      type: 'object',
      properties: {
        page_size: {
          type: 'number',
          description: 'Number of sessions to return (default 10).',
          default: 10
        },
        page_token: {
          type: 'string',
          description: 'Pagination token from a previous list call.'
        }
      }
    }
  },
  {
    name: 'jules_get_session',
    description: 'Fetch details for a single Jules session.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Fully qualified Jules session identifier.'
        }
      },
      required: ['session_id']
    }
  },
  {
    name: 'jules_send_message',
    description: 'Send a follow-up message to an existing Jules session.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Target session identifier.'
        },
        message: {
          type: 'string',
          description: 'Message content to send.'
        }
      },
      required: ['session_id', 'message']
    }
  }
];

function toTextContent(payload) {
  return [
    {
      type: 'text',
      text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)
    }
  ];
}

export class JulesMCPServer {
  constructor(options = {}) {
    this.options = {
      name: options.name || 'jules-mcp-server',
      version: options.version || '1.0.0',
      apiKey: options.apiKey || process.env.JULES_API_KEY || null
    };

    this.jules = new JulesClient(this.options.apiKey);

    this.server = new Server(
      {
        name: this.options.name,
        version: this.options.version
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOL_DEFINITIONS
    }));

    this.server.setRequestHandler(
      CallToolRequestSchema,
      async request => this.#handleCall(request)
    );
  }

  async start() {
    if (!this.options.apiKey) {
      console.warn(
        '[Jules MCP] JULES_API_KEY is not configured; tool calls will likely fail.'
      );
    }

    const transport = new StdioServerTransport();
    try {
      await this.server.connect(transport);
    } catch (error) {
      console.error('[Jules MCP] Failed to connect transport:', error);
      throw error;
    }

    // Keep stdin alive so the process does not exit before a client connects.
    if (typeof transport._stdin?.resume === 'function') {
      transport._stdin.resume();
    } else if (typeof process.stdin.resume === 'function') {
      process.stdin.resume();
    }

    console.log(`[Jules MCP] Server ready with tools: ${TOOL_DEFINITIONS.map(t => t.name).join(', ')}`);
  }

  async stop() {
    await this.server.close();
    console.log('[Jules MCP] Server stopped.');
  }

  async #handleCall(request) {
    const { name, arguments: args = {} } = request.params;

    switch (name) {
      case 'jules_create_session':
        return this.#handleCreateSession(args);
      case 'jules_list_sessions':
        return this.#handleListSessions(args);
      case 'jules_get_session':
        return this.#handleGetSession(args);
      case 'jules_send_message':
        return this.#handleSendMessage(args);
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  }

  async #handleCreateSession(args) {
    const { prompt, source_id: sourceId, title, starting_branch: startingBranch } = args;

    if (!prompt || !sourceId) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Both prompt and source_id parameters are required.'
      );
    }

    const result = await this.jules.createSession({
      prompt,
      sourceId,
      title,
      startingBranch
    });

    if (!result.success) {
      throw new McpError(
        ErrorCode.InternalError,
        result.error || 'Jules session creation failed.',
        { details: result }
      );
    }

    return {
      content: toTextContent({
        success: true,
        sessionId: result.sessionId,
        data: result.data
      }),
      metadata: {
        sessionId: result.sessionId ?? null
      }
    };
  }

  async #handleListSessions(args) {
    const { page_size: pageSize, page_token: pageToken } = args;

    const result = await this.jules.listSessions({
      pageSize,
      pageToken
    });

    if (!result.success) {
      throw new McpError(
        ErrorCode.InternalError,
        result.error || 'Failed to list Jules sessions.',
        { details: result }
      );
    }

    return {
      content: toTextContent(result.data),
      metadata: {
        count: Array.isArray(result.data?.sessions) ? result.data.sessions.length : undefined,
        nextPageToken: result.data?.nextPageToken
      }
    };
  }

  async #handleGetSession(args) {
    const rawSessionId = args.session_id;

    if (!rawSessionId) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'session_id parameter is required.'
      );
    }

    // Jules REST endpoints expect just the numeric identifier; strip resource prefixes if provided.
    const sessionId = rawSessionId.startsWith('sessions/')
      ? rawSessionId.split('/').pop()
      : rawSessionId;

    const result = await this.jules.getSession(sessionId);

    if (!result.success) {
      throw new McpError(
        ErrorCode.InternalError,
        result.error || 'Failed to fetch Jules session.',
        { details: result }
      );
    }

    return {
      content: toTextContent(result.data),
      metadata: {
        sessionId: rawSessionId
      }
    };
  }

  async #handleSendMessage(args) {
    const { session_id: sessionId, message } = args;

    if (!sessionId || !message) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Both session_id and message parameters are required.'
      );
    }

    const result = await this.jules.sendMessage(sessionId, message);

    if (!result.success) {
      throw new McpError(
        ErrorCode.InternalError,
        result.error || 'Failed to send message to Jules session.',
        { details: result }
      );
    }

    return {
      content: toTextContent(result.data),
      metadata: {
        sessionId
      }
    };
  }
}

async function main() {
  const server = new JulesMCPServer();

  try {
    console.log('[Jules MCP] Bootstrapping Jules MCP server...');
    await server.start();
    await new Promise(() => {});
  } catch (error) {
    console.error('[Jules MCP] Failed to start server:', error);
    process.exit(1);
  }

  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.stop();
    process.exit(0);
  });
}

const invokedDirectly =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedDirectly) {
  main().catch(error => {
    console.error('[Jules MCP] Fatal error:', error);
    process.exit(1);
  });
}

export default JulesMCPServer;
