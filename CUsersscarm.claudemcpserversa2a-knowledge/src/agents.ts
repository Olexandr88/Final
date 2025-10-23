import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

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
  tags?: string[];
  category?: string;
  enabled?: boolean;
  deployedAt?: number;
  config?: Record<string, any>;
};

export type AgentFilter = {
  tags?: string[];
  category?: string;
  enabled?: boolean;
  search?: string;
};

// Scalable agent registry
export class AgentRegistry {
  private agents = new Map<string, AgentDescriptor>();
  private tagIndex = new Map<string, Set<string>>(); // tag -> agent IDs
  private categoryIndex = new Map<string, Set<string>>(); // category -> agent IDs
  
  constructor() {
    this.loadDefaultAgents();
  }
  
  // Deploy a new agent
  deploy(agent: AgentDescriptor): boolean {
    agent.enabled = agent.enabled ?? true;
    agent.deployedAt = Date.now();
    
    this.agents.set(agent.id, agent);
    this.updateIndices(agent);
    
    return true;
  }
  
  // Deploy multiple agents in batch
  deployBatch(agentList: AgentDescriptor[]): { success: number; failed: number; errors: string[] } {
    const result = { success: 0, failed: 0, errors: [] as string[] };
    
    for (const agent of agentList) {
      try {
        this.deploy(agent);
        result.success++;
      } catch (error) {
        result.failed++;
        result.errors.push(`Failed to deploy ${agent.id}: ${error}`);
      }
    }
    
    return result;
  }
  
  // Update existing agent
  update(agentId: string, updates: Partial<AgentDescriptor>): boolean {
    const existing = this.agents.get(agentId);
    if (!existing) return false;
    
    // Remove from old indices
    this.removeFromIndices(existing);
    
    // Apply updates
    const updated = { ...existing, ...updates };
    this.agents.set(agentId, updated);
    
    // Re-index
    this.updateIndices(updated);
    
    return true;
  }
  
  // Enable/disable agent
  setEnabled(agentId: string, enabled: boolean): boolean {
    return this.update(agentId, { enabled });
  }
  
  // Remove agent
  remove(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    
    this.removeFromIndices(agent);
    this.agents.delete(agentId);
    
    return true;
  }
  
  // Get agent by ID
  get(agentId: string): AgentDescriptor | undefined {
    return this.agents.get(agentId);
  }
  
  // List all agents with optional filtering
  list(filter?: AgentFilter): AgentDescriptor[] {
    let candidates = Array.from(this.agents.values());
    
    if (filter?.enabled !== undefined) {
      candidates = candidates.filter(a => a.enabled === filter.enabled);
    }
    
    if (filter?.category) {
      candidates = candidates.filter(a => a.category === filter.category);
    }
    
    if (filter?.tags && filter.tags.length > 0) {
      candidates = candidates.filter(a => 
        filter.tags!.some(tag => a.tags?.includes(tag))
      );
    }
    
    if (filter?.search) {
      const search = filter.search.toLowerCase();
      candidates = candidates.filter(a => 
        a.name.toLowerCase().includes(search) ||
        a.id.toLowerCase().includes(search) ||
        a.capabilities.some(c => c.name.toLowerCase().includes(search))
      );
    }
    
    return candidates;
  }
  
  // Get agents by category
  getByCategory(category: string): AgentDescriptor[] {
    const agentIds = this.categoryIndex.get(category) || new Set();
    return Array.from(agentIds).map(id => this.agents.get(id)!).filter(Boolean);
  }
  
  // Get agents by tag
  getByTag(tag: string): AgentDescriptor[] {
    const agentIds = this.tagIndex.get(tag) || new Set();
    return Array.from(agentIds).map(id => this.agents.get(id)!).filter(Boolean);
  }
  
  // Get all categories
  getCategories(): string[] {
    return Array.from(this.categoryIndex.keys());
  }
  
  // Get all tags
  getTags(): string[] {
    return Array.from(this.tagIndex.keys());
  }
  
  // Get registry stats
  getStats() {
    const all = Array.from(this.agents.values());
    const enabled = all.filter(a => a.enabled);
    const disabled = all.filter(a => !a.enabled);
    
    return {
      total: all.length,
      enabled: enabled.length,
      disabled: disabled.length,
      categories: this.categoryIndex.size,
      tags: this.tagIndex.size
    };
  }
  
  // Generate agents programmatically
  generateAgents(count: number, template?: Partial<AgentDescriptor>): AgentDescriptor[] {
    const agents: AgentDescriptor[] = [];
    const agentTypes = ['file-ops', 'code-gen', 'data-processor', 'web-scraper', 'system-monitor'];
    
    for (let i = 0; i < count; i++) {
      const typeIndex = i % agentTypes.length;
      const agentType = agentTypes[typeIndex];
      const agentNumber = Math.floor(i / agentTypes.length).toString().padStart(3, '0');
      const id = `${agentType}-${agentNumber}`;
      
      const agent: AgentDescriptor = {
        id,
        name: template?.name || `${this.capitalizeWords(agentType)} Agent ${agentNumber}`,
        version: template?.version || '1.0.0',
        category: template?.category || agentType.replace('-', '_'),
        tags: template?.tags || [agentType, 'auto-generated', 'production-ready'],
        capabilities: this.generateCapabilitiesForType(agentType),
        enabled: true,
        ...template
      };
      agents.push(agent);
    }
    
    return agents;
  }
  
  private capitalizeWords(str: string): string {
    return str.split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }
  
  private generateCapabilitiesForType(agentType: string): AgentCapability[] {
    switch (agentType) {
      case 'file-ops':
        return [
          {
            name: 'file_operations',
            description: 'Perform file system operations',
            inputSchema: {
              type: 'object',
              properties: {
                operation: { type: 'string', enum: ['create', 'read', 'list', 'analyze_structure'] },
                path: { type: 'string' },
                content: { type: 'string' },
                recursive: { type: 'boolean' },
                encoding: { type: 'string' }
              },
              required: ['operation', 'path']
            },
            outputSchema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                result: { type: 'object' },
                error: { type: 'string' }
              }
            }
          }
        ];
        
      case 'code-gen':
        return [
          {
            name: 'generate_code',
            description: 'Generate code with tests and documentation',
            inputSchema: {
              type: 'object',
              properties: {
                task: { type: 'string' },
                language: { type: 'string' },
                framework: { type: 'string' },
                save_to: { type: 'string' },
                test_cases: { type: 'boolean' }
              },
              required: ['task', 'language']
            },
            outputSchema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                result: {
                  type: 'object',
                  properties: {
                    mainCode: { type: 'object' },
                    testCode: { type: 'object' },
                    readme: { type: 'object' }
                  }
                }
              }
            }
          }
        ];
        
      case 'data-processor':
        return [
          {
            name: 'process_data',
            description: 'Process and transform data with multiple operations',
            inputSchema: {
              type: 'object',
              properties: {
                data: { type: 'object' },
                data_source: { type: 'string' },
                operations: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      type: { type: 'string', enum: ['filter', 'map', 'sort', 'group'] },
                      expression: { type: 'string' }
                    }
                  }
                },
                output_format: { type: 'string', enum: ['json', 'csv', 'xml'] },
                save_to: { type: 'string' }
              }
            },
            outputSchema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                result: {
                  type: 'object',
                  properties: {
                    data: { type: 'object' },
                    operations_performed: { type: 'array' },
                    total_items: { type: 'number' }
                  }
                }
              }
            }
          }
        ];
        
      case 'web-scraper':
        return [
          {
            name: 'scrape_web',
            description: 'Scrape data from web pages',
            inputSchema: {
              type: 'object',
              properties: {
                urls: { type: 'array', items: { type: 'string' } },
                selectors: {
                  type: 'object',
                  properties: {
                    title: { type: 'boolean' },
                    text: { type: 'boolean' }
                  }
                },
                output_file: { type: 'string' },
                format: { type: 'string', enum: ['json', 'csv'] }
              },
              required: ['urls']
            },
            outputSchema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                result: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      url: { type: 'string' },
                      status: { type: 'number' },
                      data: { type: 'object' },
                      error: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        ];
        
      case 'system-monitor':
        return [
          {
            name: 'monitor_system',
            description: 'Monitor system resources and generate reports',
            inputSchema: {
              type: 'object',
              properties: {
                checks: {
                  type: 'object',
                  properties: {
                    disk: { type: 'boolean' },
                    memory: { type: 'boolean' }
                  }
                },
                output_file: { type: 'string' },
                alert_threshold: {
                  type: 'object',
                  properties: {
                    memory: { type: 'number' }
                  }
                }
              },
              required: ['checks']
            },
            outputSchema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                result: {
                  type: 'object',
                  properties: {
                    timestamp: { type: 'string' },
                    checks: { type: 'object' },
                    alerts: { type: 'array' }
                  }
                }
              }
            }
          }
        ];
        
      default:
        return [
          {
            name: 'process',
            description: 'Generic processing capability',
            inputSchema: { type: 'object', properties: { data: { type: 'object' } } },
            outputSchema: { type: 'object', properties: { result: { type: 'object' } } }
          }
        ];
    }
  }
  
  private updateIndices(agent: AgentDescriptor) {
    // Update tag index
    if (agent.tags) {
      for (const tag of agent.tags) {
        if (!this.tagIndex.has(tag)) {
          this.tagIndex.set(tag, new Set());
        }
        this.tagIndex.get(tag)!.add(agent.id);
      }
    }
    
    // Update category index
    if (agent.category) {
      if (!this.categoryIndex.has(agent.category)) {
        this.categoryIndex.set(agent.category, new Set());
      }
      this.categoryIndex.get(agent.category)!.add(agent.id);
    }
  }
  
  private removeFromIndices(agent: AgentDescriptor) {
    // Remove from tag index
    if (agent.tags) {
      for (const tag of agent.tags) {
        const tagSet = this.tagIndex.get(tag);
        if (tagSet) {
          tagSet.delete(agent.id);
          if (tagSet.size === 0) {
            this.tagIndex.delete(tag);
          }
        }
      }
    }
    
    // Remove from category index
    if (agent.category) {
      const categorySet = this.categoryIndex.get(agent.category);
      if (categorySet) {
        categorySet.delete(agent.id);
        if (categorySet.size === 0) {
          this.categoryIndex.delete(agent.category);
        }
      }
    }
  }
  
  private loadDefaultAgents() {
    // Load the original echo agent
    const echo = makeEchoAgent();
    this.deploy(echo);
  }
}

// Global registry instance
export const agentRegistry = new AgentRegistry();

// Backward compatibility - expose as Record for existing code
export const agents = new Proxy({} as Record<string, AgentDescriptor>, {
  get(target, prop: string) {
    return agentRegistry.get(prop);
  },
  set(target, prop: string, value: AgentDescriptor) {
    agentRegistry.deploy(value);
    return true;
  },
  ownKeys(target) {
    return agentRegistry.list().map(a => a.id);
  },
  has(target, prop: string) {
    return agentRegistry.get(prop) !== undefined;
  }
});

function makeEchoAgent(): AgentDescriptor {
  return {
    id: 'echo',
    name: 'Echo Agent',
    version: '1.0.0',
    category: 'utility',
    tags: ['echo', 'test', 'utility'],
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
    enabled: true
  };
}

export function ensureRequestId(seed?: string) {
  return seed ?? uuidv4();
}
