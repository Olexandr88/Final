/**
 * TypeScript definitions for Microsoft Learn Training Catalog Integration
 */

export interface TrainingModule {
  id?: number;
  uid: string;
  title: string;
  description?: string;
  duration_minutes?: number;
  level?: 'beginner' | 'intermediate' | 'advanced';
  locale?: string;
  last_modified?: string;
  url?: string;
  icon_url?: string;
  popularity_score?: number;
  synced_at?: string;
  products?: string[];
  roles?: string[];
  subjects?: string[];
}

export interface LearningPath {
  id?: number;
  uid: string;
  title: string;
  description?: string;
  level?: 'beginner' | 'intermediate' | 'advanced';
  locale?: string;
  last_modified?: string;
  url?: string;
  icon_url?: string;
  module_count?: number;
  synced_at?: string;
  modules?: string[];
}

export interface Certification {
  id?: number;
  uid: string;
  title: string;
  description?: string;
  level?: 'beginner' | 'intermediate' | 'advanced';
  locale?: string;
  last_modified?: string;
  url?: string;
  icon_url?: string;
  exam_uid?: string;
  synced_at?: string;
}

export interface Exam {
  id?: number;
  uid: string;
  title: string;
  description?: string;
  url?: string;
  certification_uid?: string;
  synced_at?: string;
}

export interface UserProgress {
  id?: number;
  user_id: string;
  content_uid: string;
  content_type: 'module' | 'path' | 'certification';
  progress_percent: number;
  started_at?: string;
  completed_at?: string | null;
  last_accessed?: string;
}

export interface SyncMetadata {
  id?: number;
  sync_type: 'FULL' | 'INCREMENTAL';
  last_sync_timestamp: string;
  items_synced: number;
  errors?: string | null;
  created_at?: string;
}

export interface CatalogFilters {
  search?: string;
  level?: 'beginner' | 'intermediate' | 'advanced';
  product?: string;
  role?: string;
  subject?: string;
  locale?: string;
  last_modified?: string;
  page?: number;
  limit?: number;
  offset?: number;
}

export interface SearchCriteria {
  query?: string;
  level?: string;
  product?: string;
  role?: string;
  subject?: string;
  limit?: number;
  offset?: number;
}

export interface SyncResult {
  success: boolean;
  syncType?: 'FULL' | 'INCREMENTAL';
  timestamp?: string;
  itemsSynced?: number;
  duration?: string;
  breakdown?: {
    modules: number;
    paths: number;
    certifications: number;
    exams: number;
  };
  error?: string;
  reason?: string;
}

export interface SyncStatus {
  isRunning: boolean;
  isSyncing: boolean;
  cronSchedule: string;
  lastSync: {
    type: 'FULL' | 'INCREMENTAL';
    timestamp: string;
    itemsSynced: number;
    createdAt: string;
    errors?: string | null;
  } | null;
  cacheStats: {
    keys: number;
    hits: number;
    misses: number;
    hitRate: string;
  };
  recentHistory: SyncResult[];
}

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  metadata?: {
    timestamp: string;
    [key: string]: any;
  };
  pagination?: {
    page: number;
    limit: number;
    hasMore: boolean;
  };
}

export interface RecommendationContext {
  userId?: string;
  skills?: string[];
  preferences?: {
    level?: 'beginner' | 'intermediate' | 'advanced';
    limit?: number;
  };
  github_repos?: Array<{
    language?: string;
    topics?: string[];
  }>;
  local_projects?: Array<{
    tech_stack?: string[];
  }>;
  interests?: string[];
}

export interface RecommendationResponse {
  recommendations: TrainingModule[];
  inProgress: UserProgress[];
  detectedSkills?: string[];
}

export interface ProgressTrackingRequest {
  userId: string;
  contentUid: string;
  contentType: 'module' | 'path' | 'certification';
  progressPercent: number;
}

export interface AgentMessage {
  type: 'register' | 'recommend_training' | 'analyze_skills' | 'track_progress' | 'suggest_path' | string;
  data: {
    agentId?: string;
    capabilities?: string[];
    requestId?: string;
    [key: string]: any;
  };
  metadata?: Record<string, any>;
}

export declare class MicrosoftLearnClient {
  constructor();

  fetchModules(filters?: CatalogFilters): Promise<TrainingModule[]>;
  fetchLearningPaths(filters?: CatalogFilters): Promise<LearningPath[]>;
  fetchCertifications(filters?: CatalogFilters): Promise<Certification[]>;
  fetchExams(filters?: CatalogFilters): Promise<Exam[]>;
  fetchUpdatedSince(timestamp: string, filters?: CatalogFilters): Promise<{
    modules: TrainingModule[];
    paths: LearningPath[];
    certifications: Certification[];
    exams: Exam[];
  }>;
  fetchAll(filters?: CatalogFilters): Promise<{
    modules: TrainingModule[];
    paths: LearningPath[];
    certifications: Certification[];
    exams: Exam[];
  }>;

  clearCache(): void;
  getCacheStats(): {
    keys: number;
    hits: number;
    misses: number;
    hitRate: string;
  };
}

export declare class TrainingCatalogRepository {
  constructor();

  upsertModules(modules: TrainingModule[]): number;
  upsertLearningPaths(paths: LearningPath[]): number;
  searchModules(criteria?: SearchCriteria): TrainingModule[];
  getModuleByUid(uid: string): TrainingModule | null;
  recordSyncMetadata(syncType: 'FULL' | 'INCREMENTAL', timestamp: string, itemsSynced: number, errors?: string | null): void;
  getLastSyncMetadata(syncType?: 'FULL' | 'INCREMENTAL'): SyncMetadata | null;

  close(): void;
}

export declare class TrainingSyncService {
  constructor();

  start(): void;
  stop(): void;
  triggerManualSync(syncType?: 'FULL' | 'INCREMENTAL'): Promise<SyncResult>;
  getStatus(): SyncStatus;
  clearCache(): void;
  shutdown(): void;
}

export declare class TrainingAssistantAgent {
  constructor();

  connect(): Promise<void>;
  disconnect(): void;
  shutdown(): void;
}

export declare class TrainingController {
  constructor();

  getCatalog(query: CatalogFilters): Promise<APIResponse<TrainingModule[]>>;
  getModuleByUid(uid: string): Promise<APIResponse<TrainingModule>>;
  searchCatalog(query: { q: string; limit?: number; offset?: number }): Promise<APIResponse<TrainingModule[]>>;
  getRecommendations(context: RecommendationContext): Promise<APIResponse<RecommendationResponse>>;
  trackProgress(progressData: ProgressTrackingRequest): Promise<APIResponse<any>>;
  triggerSync(syncType?: 'FULL' | 'INCREMENTAL'): Promise<SyncResult>;
  getSyncStatus(): Promise<APIResponse<SyncStatus>>;

  shutdown(): void;
}
