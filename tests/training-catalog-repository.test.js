import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { TrainingCatalogRepository } from '../src/database/training-catalog-repository.js';
import fs from 'fs';

describe('TrainingCatalogRepository', () => {
  let repository;
  const TEST_DB_PATH = './data/test-training-catalog.db';

  before(() => {
    // Use test database
    process.env.TRAINING_DB_PATH = TEST_DB_PATH;
    repository = new TrainingCatalogRepository();
  });

  after(() => {
    repository.close();
    // Cleanup test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    if (fs.existsSync(TEST_DB_PATH + '-wal')) {
      fs.unlinkSync(TEST_DB_PATH + '-wal');
    }
    if (fs.existsSync(TEST_DB_PATH + '-shm')) {
      fs.unlinkSync(TEST_DB_PATH + '-shm');
    }
  });

  describe('Schema Initialization', () => {
    it('should create all tables', () => {
      const tables = repository.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table'
      `).all();

      const tableNames = tables.map(t => t.name);

      assert.ok(tableNames.includes('training_modules'), 'Should have training_modules table');
      assert.ok(tableNames.includes('training_paths'), 'Should have training_paths table');
      assert.ok(tableNames.includes('training_certifications'), 'Should have training_certifications table');
      assert.ok(tableNames.includes('training_exams'), 'Should have training_exams table');
      assert.ok(tableNames.includes('user_progress'), 'Should have user_progress table');
      assert.ok(tableNames.includes('sync_metadata'), 'Should have sync_metadata table');
    });
  });

  describe('upsertModules', () => {
    it('should insert new modules', () => {
      const modules = [
        {
          uid: 'test-module-1',
          title: 'Test Module 1',
          description: 'Test description',
          duration_minutes: 120,
          level: 'beginner',
          locale: 'en-us',
          last_modified: new Date().toISOString(),
          url: 'https://learn.microsoft.com/test-1',
          icon_url: 'https://learn.microsoft.com/icon-1.png',
          popularity_score: 100,
          products: ['azure', 'github'],
          roles: ['developer'],
          subjects: ['app-development'],
        },
      ];

      const count = repository.upsertModules(modules);
      assert.strictEqual(count, 1, 'Should insert 1 module');
    });

    it('should update existing modules', () => {
      const modules = [
        {
          uid: 'test-module-1',
          title: 'Updated Test Module 1',
          description: 'Updated description',
          duration_minutes: 150,
          level: 'intermediate',
          locale: 'en-us',
          last_modified: new Date().toISOString(),
          url: 'https://learn.microsoft.com/test-1',
          icon_url: 'https://learn.microsoft.com/icon-1.png',
          popularity_score: 150,
          products: ['azure'],
          roles: ['developer', 'administrator'],
          subjects: ['app-development', 'ai'],
        },
      ];

      const count = repository.upsertModules(modules);
      assert.strictEqual(count, 1, 'Should update 1 module');

      const module = repository.getModuleByUid('test-module-1');
      assert.strictEqual(module.title, 'Updated Test Module 1', 'Title should be updated');
      assert.strictEqual(module.level, 'intermediate', 'Level should be updated');
    });

    it('should handle batch inserts', () => {
      const modules = Array.from({ length: 150 }, (_, i) => ({
        uid: `test-module-batch-${i}`,
        title: `Batch Module ${i}`,
        description: `Description ${i}`,
        duration_minutes: 60,
        level: 'beginner',
        locale: 'en-us',
        last_modified: new Date().toISOString(),
        url: `https://learn.microsoft.com/batch-${i}`,
        icon_url: 'https://learn.microsoft.com/icon.png',
        popularity_score: i,
      }));

      const count = repository.upsertModules(modules);
      assert.strictEqual(count, 150, 'Should insert 150 modules in batches');
    });
  });

  describe('upsertLearningPaths', () => {
    it('should insert learning paths with modules', () => {
      const paths = [
        {
          uid: 'test-path-1',
          title: 'Test Path 1',
          description: 'Path description',
          level: 'beginner',
          locale: 'en-us',
          last_modified: new Date().toISOString(),
          url: 'https://learn.microsoft.com/path-1',
          icon_url: 'https://learn.microsoft.com/path-icon-1.png',
          modules: ['test-module-1', 'test-module-batch-0'],
        },
      ];

      const count = repository.upsertLearningPaths(paths);
      assert.strictEqual(count, 1, 'Should insert 1 path');
    });
  });

  describe('searchModules', () => {
    it('should search by level', () => {
      const results = repository.searchModules({ level: 'beginner', limit: 10 });
      assert.ok(Array.isArray(results), 'Should return array');
      assert.ok(results.length > 0, 'Should find beginner modules');
      assert.ok(results.every(m => m.level === 'beginner'), 'All results should be beginner level');
    });

    it('should search by product', () => {
      const results = repository.searchModules({ product: 'azure', limit: 10 });
      assert.ok(Array.isArray(results), 'Should return array');
    });

    it('should search by role', () => {
      const results = repository.searchModules({ role: 'developer', limit: 10 });
      assert.ok(Array.isArray(results), 'Should return array');
    });

    it('should search by subject', () => {
      const results = repository.searchModules({ subject: 'app-development', limit: 10 });
      assert.ok(Array.isArray(results), 'Should return array');
    });

    it('should support pagination', () => {
      const page1 = repository.searchModules({ level: 'beginner', limit: 5, offset: 0 });
      const page2 = repository.searchModules({ level: 'beginner', limit: 5, offset: 5 });

      assert.strictEqual(page1.length, 5, 'First page should have 5 results');
      assert.strictEqual(page2.length, 5, 'Second page should have 5 results');

      if (page1.length > 0 && page2.length > 0) {
        assert.notStrictEqual(page1[0].uid, page2[0].uid, 'Pages should have different results');
      }
    });

    it('should combine multiple filters', () => {
      const results = repository.searchModules({
        level: 'beginner',
        product: 'azure',
        role: 'developer',
        limit: 10,
      });

      assert.ok(Array.isArray(results), 'Should return array');
    });
  });

  describe('getModuleByUid', () => {
    it('should retrieve module with relationships', () => {
      const module = repository.getModuleByUid('test-module-1');

      assert.ok(module, 'Module should exist');
      assert.strictEqual(module.uid, 'test-module-1');
      assert.ok(Array.isArray(module.products), 'Should have products array');
      assert.ok(Array.isArray(module.roles), 'Should have roles array');
      assert.ok(Array.isArray(module.subjects), 'Should have subjects array');
    });

    it('should return null for non-existent module', () => {
      const module = repository.getModuleByUid('non-existent-uid');
      assert.strictEqual(module, null, 'Should return null for non-existent module');
    });
  });

  describe('Sync Metadata', () => {
    it('should record sync metadata', () => {
      const timestamp = new Date().toISOString();
      repository.recordSyncMetadata('FULL', timestamp, 100, null);

      const lastSync = repository.getLastSyncMetadata();
      assert.ok(lastSync, 'Should have sync metadata');
      assert.strictEqual(lastSync.sync_type, 'FULL');
      assert.strictEqual(lastSync.items_synced, 100);
    });

    it('should get last sync by type', () => {
      const timestamp = new Date().toISOString();
      repository.recordSyncMetadata('INCREMENTAL', timestamp, 50, null);

      const lastFull = repository.getLastSyncMetadata('FULL');
      const lastIncremental = repository.getLastSyncMetadata('INCREMENTAL');

      assert.strictEqual(lastFull.sync_type, 'FULL');
      assert.strictEqual(lastIncremental.sync_type, 'INCREMENTAL');
    });

    it('should record sync errors', () => {
      const timestamp = new Date().toISOString();
      repository.recordSyncMetadata('FULL', timestamp, 0, 'Network error');

      const lastSync = repository.getLastSyncMetadata();
      assert.strictEqual(lastSync.errors, 'Network error');
    });
  });

  describe('User Progress', () => {
    it('should track user progress', () => {
      repository.db.prepare(`
        INSERT INTO user_progress (user_id, content_uid, content_type, progress_percent)
        VALUES (?, ?, ?, ?)
      `).run('test-user', 'test-module-1', 'module', 50);

      const progress = repository.db.prepare(`
        SELECT * FROM user_progress WHERE user_id = ?
      `).get('test-user');

      assert.ok(progress, 'Progress should be recorded');
      assert.strictEqual(progress.progress_percent, 50);
    });

    it('should update existing progress', () => {
      repository.db.prepare(`
        INSERT INTO user_progress (user_id, content_uid, content_type, progress_percent)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, content_uid) DO UPDATE SET progress_percent = excluded.progress_percent
      `).run('test-user', 'test-module-1', 'module', 100);

      const progress = repository.db.prepare(`
        SELECT * FROM user_progress WHERE user_id = ? AND content_uid = ?
      `).get('test-user', 'test-module-1');

      assert.strictEqual(progress.progress_percent, 100);
    });
  });
});
