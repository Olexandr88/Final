/**
 * Memory Sync Manager - Cross-agent memory synchronization with MCP Memory
 * @module memory/memory-sync-manager
 */

import { logger } from '../utils/logger.js';
import { EventEmitter } from 'events';

export class MemorySyncManager extends EventEmitter {
  constructor(bridgeClient = null) {
    super();

    this.bridgeClient = bridgeClient;
    this.mcpMemoryClient = null;
    this.localCache = new Map();
    this.syncQueue = [];
    this.isSyncing = false;
  }

  /**
   * Initialize memory sync manager
   */
  async initialize(mcpMemoryClient) {
    try {
      logger.info('Initializing Memory Sync Manager');

      this.mcpMemoryClient = mcpMemoryClient;

      // Load existing memory graph
      const graph = await this._loadMemoryGraph();
      logger.info('Memory graph loaded', {
        entities: graph.entities?.length || 0,
        relations: graph.relations?.length || 0
      });

      // Set up sync interval
      this._startSyncLoop();

      logger.info('Memory Sync Manager initialized');

    } catch (error) {
      logger.error('Failed to initialize Memory Sync Manager', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Load memory graph from MCP
   */
  async _loadMemoryGraph() {
    try {
      if (!this.mcpMemoryClient) {
        return { entities: [], relations: [] };
      }

      const graph = await this.mcpMemoryClient.readGraph({});

      // Cache entities locally
      if (graph.entities) {
        graph.entities.forEach(entity => {
          this.localCache.set(entity.name, entity);
        });
      }

      return graph;

    } catch (error) {
      logger.warn('Failed to load memory graph', { error: error.message });
      return { entities: [], relations: [] };
    }
  }

  /**
   * Sync knowledge across all agents
   */
  async syncAcrossAgents(sessionId, knowledge) {
    try {
      logger.info('Syncing knowledge across agents', {
        sessionId,
        knowledgeItems: Object.keys(knowledge).length
      });

      // Step 1: Store in MCP Memory graph
      const entities = this._createEntitiesFromKnowledge(sessionId, knowledge);

      if (this.mcpMemoryClient && entities.length > 0) {
        await this.mcpMemoryClient.createEntities({ entities });
        logger.debug('Knowledge stored in MCP Memory', {
          entityCount: entities.length
        });
      }

      // Step 2: Update local cache
      entities.forEach(entity => {
        this.localCache.set(entity.name, entity);
      });

      // Step 3: Broadcast to all agents via A2A bridge
      if (this.bridgeClient) {
        await this.bridgeClient.broadcast({
          type: 'knowledge_update',
          data: {
            sessionId,
            knowledge,
            entities,
            timestamp: new Date()
          },
          persist: true,
          metadata: {
            source: 'memory-sync-manager',
            sessionId
          }
        });

        logger.debug('Knowledge broadcasted to agents');
      }

      // Emit event for local listeners
      this.emit('knowledge_synced', { sessionId, knowledge, entities });

      return {
        success: true,
        entitiesCreated: entities.length,
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Failed to sync knowledge', {
        sessionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create MCP Memory entities from knowledge object
   */
  _createEntitiesFromKnowledge(sessionId, knowledge) {
    const entities = [];

    // Create session entity
    entities.push({
      name: `session-${sessionId}`,
      entityType: 'AgentSession',
      observations: [
        `Session ID: ${sessionId}`,
        `Created: ${new Date().toISOString()}`,
        `Knowledge Items: ${Object.keys(knowledge).length}`
      ]
    });

    // Create entities for each knowledge item
    for (const [key, value] of Object.entries(knowledge)) {
      const entityName = `${sessionId}-${key}`;

      const observations = [];

      if (typeof value === 'object' && value !== null) {
        // Complex object - extract key insights
        if (value.task) observations.push(`Task: ${value.task}`);
        if (value.result) observations.push(`Result: ${value.result}`);
        if (value.insights) observations.push(`Insights: ${value.insights}`);
        if (value.context) {
          observations.push(`Context: ${JSON.stringify(value.context)}`);
        }

        // Add all other fields
        for (const [k, v] of Object.entries(value)) {
          if (!['task', 'result', 'insights', 'context'].includes(k)) {
            observations.push(`${k}: ${v}`);
          }
        }
      } else {
        // Simple value
        observations.push(`Value: ${value}`);
      }

      entities.push({
        name: entityName,
        entityType: 'KnowledgeItem',
        observations
      });
    }

    return entities;
  }

  /**
   * Search memory graph
   */
  async search(query, options = {}) {
    try {
      const { type, limit = 10 } = options;

      logger.debug('Searching memory', { query, type, limit });

      // Search local cache first
      const localResults = this._searchLocalCache(query, type);

      // If we have enough results, return them
      if (localResults.length >= limit) {
        return localResults.slice(0, limit);
      }

      // Search MCP Memory if available
      if (this.mcpMemoryClient) {
        const mcpResults = await this.mcpMemoryClient.searchNodes({ query });

        // Merge and deduplicate results
        const allResults = [...localResults, ...mcpResults];
        const uniqueResults = this._deduplicateResults(allResults);

        return uniqueResults.slice(0, limit);
      }

      return localResults.slice(0, limit);

    } catch (error) {
      logger.error('Memory search failed', { query, error: error.message });
      throw error;
    }
  }

  /**
   * Search local cache
   */
  _searchLocalCache(query, type) {
    const results = [];
    const queryLower = query.toLowerCase();

    for (const [name, entity] of this.localCache.entries()) {
      // Filter by type if specified
      if (type && entity.entityType !== type) {
        continue;
      }

      // Search in name
      if (name.toLowerCase().includes(queryLower)) {
        results.push(entity);
        continue;
      }

      // Search in observations
      if (entity.observations) {
        const matchesObservation = entity.observations.some(obs =>
          obs.toLowerCase().includes(queryLower)
        );

        if (matchesObservation) {
          results.push(entity);
        }
      }
    }

    return results;
  }

  /**
   * Deduplicate search results
   */
  _deduplicateResults(results) {
    const seen = new Set();
    const unique = [];

    for (const result of results) {
      if (!seen.has(result.name)) {
        seen.add(result.name);
        unique.push(result);
      }
    }

    return unique;
  }

  /**
   * Sync all sessions
   */
  async syncAll(options = {}) {
    const startTime = Date.now();

    try {
      logger.info('Syncing all sessions', options);

      const { sessionId, all = false } = options;

      let sessionIds = [];

      if (sessionId) {
        sessionIds = [sessionId];
      } else if (all) {
        sessionIds = await this._getAllSessionIds();
      }

      if (sessionIds.length === 0) {
        logger.warn('No sessions to sync');
        return {
          sessionsSynced: 0,
          agentsUpdated: 0,
          knowledgeItems: 0,
          duration: Date.now() - startTime
        };
      }

      // Sync each session
      let totalAgentsUpdated = 0;
      let totalKnowledgeItems = 0;

      for (const sid of sessionIds) {
        const sessionKnowledge = await this._getSessionKnowledge(sid);

        if (Object.keys(sessionKnowledge).length > 0) {
          await this.syncAcrossAgents(sid, sessionKnowledge);
          totalKnowledgeItems += Object.keys(sessionKnowledge).length;
          totalAgentsUpdated++; // Simplified - would count actual agents
        }
      }

      const duration = Date.now() - startTime;

      return {
        sessionsSynced: sessionIds.length,
        agentsUpdated: totalAgentsUpdated,
        knowledgeItems: totalKnowledgeItems,
        duration
      };

    } catch (error) {
      logger.error('Sync all failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get all session IDs from memory
   */
  async _getAllSessionIds() {
    const sessionIds = new Set();

    // Search local cache
    for (const [name, entity] of this.localCache.entries()) {
      if (entity.entityType === 'AgentSession') {
        const match = name.match(/session-(.+)/);
        if (match) {
          sessionIds.add(match[1]);
        }
      }
    }

    // Search MCP Memory
    if (this.mcpMemoryClient) {
      try {
        const sessions = await this.mcpMemoryClient.searchNodes({
          query: 'AgentSession'
        });

        sessions.forEach(session => {
          const match = session.name.match(/session-(.+)/);
          if (match) {
            sessionIds.add(match[1]);
          }
        });
      } catch (error) {
        logger.warn('Failed to search MCP sessions', { error: error.message });
      }
    }

    return Array.from(sessionIds);
  }

  /**
   * Get knowledge for specific session
   */
  async _getSessionKnowledge(sessionId) {
    const knowledge = {};

    // Search local cache
    for (const [name, entity] of this.localCache.entries()) {
      if (name.startsWith(`${sessionId}-`)) {
        const key = name.replace(`${sessionId}-`, '');
        knowledge[key] = this._extractKnowledgeFromEntity(entity);
      }
    }

    return knowledge;
  }

  /**
   * Extract knowledge object from entity
   */
  _extractKnowledgeFromEntity(entity) {
    if (!entity.observations || entity.observations.length === 0) {
      return null;
    }

    const knowledge = {};

    entity.observations.forEach(obs => {
      const match = obs.match(/^(.+?):\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        knowledge[key.toLowerCase()] = value;
      }
    });

    return knowledge;
  }

  /**
   * Start periodic sync loop
   */
  _startSyncLoop() {
    setInterval(async () => {
      if (this.isSyncing || this.syncQueue.length === 0) {
        return;
      }

      this.isSyncing = true;

      try {
        const item = this.syncQueue.shift();
        await this.syncAcrossAgents(item.sessionId, item.knowledge);
      } catch (error) {
        logger.error('Sync loop error', { error: error.message });
      } finally {
        this.isSyncing = false;
      }
    }, 5000); // Sync every 5 seconds
  }

  /**
   * Queue knowledge for syncing
   */
  queueSync(sessionId, knowledge) {
    this.syncQueue.push({ sessionId, knowledge });
    logger.debug('Knowledge queued for sync', {
      sessionId,
      queueSize: this.syncQueue.length
    });
  }

  /**
   * Create relations between entities
   */
  async createRelations(relations) {
    try {
      if (!this.mcpMemoryClient) {
        logger.warn('MCP Memory client not available for creating relations');
        return;
      }

      await this.mcpMemoryClient.createRelations({ relations });

      logger.info('Relations created', { count: relations.length });

    } catch (error) {
      logger.error('Failed to create relations', { error: error.message });
      throw error;
    }
  }

  /**
   * Add observations to existing entity
   */
  async addObservations(entityName, observations) {
    try {
      if (!this.mcpMemoryClient) {
        logger.warn('MCP Memory client not available');
        return;
      }

      await this.mcpMemoryClient.addObservations({
        observations: [{
          entityName,
          contents: observations
        }]
      });

      // Update local cache
      if (this.localCache.has(entityName)) {
        const entity = this.localCache.get(entityName);
        entity.observations = [...entity.observations, ...observations];
        this.localCache.set(entityName, entity);
      }

      logger.debug('Observations added', { entityName, count: observations.length });

    } catch (error) {
      logger.error('Failed to add observations', { error: error.message });
      throw error;
    }
  }

  /**
   * Get statistics about memory sync
   */
  getStats() {
    return {
      cachedEntities: this.localCache.size,
      queueSize: this.syncQueue.length,
      isSyncing: this.isSyncing,
      mcpConnected: this.mcpMemoryClient !== null,
      bridgeConnected: this.bridgeClient !== null
    };
  }
}
