import WebSocket from 'ws';
import { TrainingCatalogRepository } from '../database/training-catalog-repository.js';
import { logger } from '../utils/logger.js';

/**
 * Training Assistant Agent - AI-powered recommendations via AI Bridge
 * @module training-assistant-agent
 */

const AI_BRIDGE_URL = process.env.AI_BRIDGE_URL || 'ws://localhost:65028';
const AGENT_ID = 'training-assistant-agent';

export class TrainingAssistantAgent {
  constructor() {
    this.repository = new TrainingCatalogRepository();
    this.ws = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000; // 5 seconds
    this.capabilities = [
      'recommend_training',
      'analyze_skills',
      'track_progress',
      'suggest_path',
    ];
    logger.info('TrainingAssistantAgent initialized', { agentId: AGENT_ID });
  }

  /**
   * Connect to AI Bridge
   * @returns {Promise<void>}
   */
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(AI_BRIDGE_URL);

        this.ws.on('open', () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          logger.info('Connected to AI Bridge', { url: AI_BRIDGE_URL });

          // Register agent capabilities
          this._sendMessage({
            type: 'register',
            data: {
              agentId: AGENT_ID,
              capabilities: this.capabilities,
              metadata: {
                version: '1.0.0',
                description: 'AI-powered training recommendations and progress tracking',
              },
            },
          });

          resolve();
        });

        this.ws.on('message', (data) => {
          this._handleMessage(data);
        });

        this.ws.on('error', (error) => {
          logger.error('WebSocket error', { error: error.message });
          reject(error);
        });

        this.ws.on('close', () => {
          this.isConnected = false;
          logger.warn('Disconnected from AI Bridge');
          this._attemptReconnect();
        });
      } catch (error) {
        logger.error('Connection failed', { error: error.message });
        reject(error);
      }
    });
  }

  /**
   * Attempt reconnection with exponential backoff
   * @private
   */
  _attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached', {
        attempts: this.maxReconnectAttempts
      });
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    logger.info('Attempting reconnection', {
      attempt: this.reconnectAttempts,
      delayMs: delay
    });

    setTimeout(() => {
      this.connect().catch(error => {
        logger.error('Reconnection failed', { error: error.message });
      });
    }, delay);
  }

  /**
   * Handle incoming message from AI Bridge
   * @private
   * @param {Buffer} data - Raw message data
   */
  async _handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      logger.debug('Message received', { type: message.type });

      switch (message.type) {
        case 'recommend_training':
          await this._handleRecommendationRequest(message);
          break;
        case 'analyze_skills':
          await this._handleSkillAnalysis(message);
          break;
        case 'track_progress':
          await this._handleProgressTracking(message);
          break;
        case 'suggest_path':
          await this._handlePathSuggestion(message);
          break;
        default:
          logger.warn('Unknown message type', { type: message.type });
      }
    } catch (error) {
      logger.error('Message handling failed', { error: error.message });
    }
  }

  /**
   * Handle training recommendation request
   * @private
   * @param {Object} message - Recommendation request
   */
  async _handleRecommendationRequest(message) {
    try {
      const { requestId, data } = message;
      const { userContext, preferences = {} } = data;

      logger.info('Processing recommendation request', { requestId, userContext });

      // Extract skills from user context (GitHub repos, local projects)
      const detectedSkills = this._extractSkills(userContext);

      // Search for relevant modules
      const recommendations = [];
      for (const skill of detectedSkills) {
        const modules = this.repository.searchModules({
          query: skill,
          level: preferences.level || 'beginner',
          limit: 5,
        });
        recommendations.push(...modules);
      }

      // Deduplicate and rank by popularity
      const uniqueRecommendations = [...new Map(
        recommendations.map(m => [m.uid, m])
      ).values()].sort((a, b) => b.popularity_score - a.popularity_score);

      this._sendMessage({
        type: 'recommendation_response',
        data: {
          requestId,
          recommendations: uniqueRecommendations.slice(0, preferences.limit || 10),
          detectedSkills,
          metadata: {
            totalFound: uniqueRecommendations.length,
            timestamp: new Date().toISOString(),
          },
        },
      });

      logger.info('Recommendations sent', {
        requestId,
        count: uniqueRecommendations.length
      });
    } catch (error) {
      logger.error('Recommendation failed', { error: error.message });
    }
  }

  /**
   * Extract skills from user context
   * @private
   * @param {Object} userContext - User context data
   * @returns {Array<string>} Detected skills
   */
  _extractSkills(userContext) {
    const skills = new Set();

    // Analyze GitHub repositories
    if (userContext.github_repos) {
      userContext.github_repos.forEach(repo => {
        if (repo.language) skills.add(repo.language.toLowerCase());
        if (repo.topics) repo.topics.forEach(topic => skills.add(topic));
      });
    }

    // Analyze local projects
    if (userContext.local_projects) {
      userContext.local_projects.forEach(project => {
        if (project.tech_stack) {
          project.tech_stack.forEach(tech => skills.add(tech.toLowerCase()));
        }
      });
    }

    // Add explicit interests
    if (userContext.interests) {
      userContext.interests.forEach(interest => skills.add(interest.toLowerCase()));
    }

    logger.debug('Skills extracted', { count: skills.size, skills: Array.from(skills) });
    return Array.from(skills);
  }

  /**
   * Handle skill analysis request
   * @private
   * @param {Object} message - Analysis request
   */
  async _handleSkillAnalysis(message) {
    try {
      const { requestId, data } = message;
      const { userId } = data;

      logger.info('Analyzing user skills', { requestId, userId });

      // Get user progress data
      const progress = this.repository.db.prepare(`
        SELECT content_uid, content_type, progress_percent, completed_at
        FROM user_progress
        WHERE user_id = ?
      `).all(userId);

      // Aggregate skills by completed modules
      const completedModules = progress
        .filter(p => p.progress_percent === 100)
        .map(p => this.repository.getModuleByUid(p.content_uid))
        .filter(m => m !== null);

      const skillMap = {};
      completedModules.forEach(module => {
        if (module.subjects) {
          module.subjects.forEach(subject => {
            skillMap[subject] = (skillMap[subject] || 0) + 1;
          });
        }
      });

      this._sendMessage({
        type: 'skill_analysis_response',
        data: {
          requestId,
          skills: skillMap,
          completedModules: completedModules.length,
          totalProgress: progress.length,
          metadata: {
            timestamp: new Date().toISOString(),
          },
        },
      });

      logger.info('Skill analysis sent', { requestId, skillCount: Object.keys(skillMap).length });
    } catch (error) {
      logger.error('Skill analysis failed', { error: error.message });
    }
  }

  /**
   * Handle progress tracking request
   * @private
   * @param {Object} message - Progress request
   */
  async _handleProgressTracking(message) {
    try {
      const { requestId, data } = message;
      const { userId, contentUid, contentType, progressPercent } = data;

      logger.info('Tracking progress', { userId, contentUid, progressPercent });

      this.repository.db.prepare(`
        INSERT INTO user_progress (user_id, content_uid, content_type, progress_percent, last_accessed)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, content_uid) DO UPDATE SET
          progress_percent = excluded.progress_percent,
          last_accessed = CURRENT_TIMESTAMP,
          completed_at = CASE WHEN excluded.progress_percent = 100 THEN CURRENT_TIMESTAMP ELSE completed_at END
      `).run(userId, contentUid, contentType, progressPercent);

      this._sendMessage({
        type: 'progress_tracked',
        data: {
          requestId,
          success: true,
          timestamp: new Date().toISOString(),
        },
      });

      logger.info('Progress tracked successfully', { userId, contentUid });
    } catch (error) {
      logger.error('Progress tracking failed', { error: error.message });
    }
  }

  /**
   * Handle learning path suggestion request
   * @private
   * @param {Object} message - Path suggestion request
   */
  async _handlePathSuggestion(message) {
    try {
      const { requestId, data } = message;
      const { userId, goal } = data;

      logger.info('Suggesting learning path', { requestId, userId, goal });

      // Search paths related to goal
      const paths = this.repository.db.prepare(`
        SELECT p.* FROM training_paths p
        JOIN paths_fts fts ON p.uid = fts.uid
        WHERE paths_fts MATCH ?
        ORDER BY p.module_count DESC
        LIMIT 5
      `).all(goal);

      this._sendMessage({
        type: 'path_suggestion_response',
        data: {
          requestId,
          suggestedPaths: paths,
          metadata: {
            timestamp: new Date().toISOString(),
          },
        },
      });

      logger.info('Path suggestions sent', { requestId, count: paths.length });
    } catch (error) {
      logger.error('Path suggestion failed', { error: error.message });
    }
  }

  /**
   * Send message to AI Bridge
   * @private
   * @param {Object} message - Message to send
   */
  _sendMessage(message) {
    if (!this.isConnected || !this.ws) {
      logger.warn('Cannot send message - not connected');
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
      logger.debug('Message sent', { type: message.type });
    } catch (error) {
      logger.error('Failed to send message', { error: error.message });
    }
  }

  /**
   * Disconnect from AI Bridge
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
      logger.info('Disconnected from AI Bridge');
    }
  }

  /**
   * Cleanup resources
   */
  shutdown() {
    this.disconnect();
    this.repository.close();
    logger.info('TrainingAssistantAgent shut down');
  }
}

export default TrainingAssistantAgent;
