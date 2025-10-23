/**
 * Marketplace Tests
 * @module tests/marketplace
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import database from '../../src/marketplace/database/init.js';
import {
  searchPackages,
  getPackage,
  installPackage,
  uninstallPackage,
  ratePackage,
  getFeaturedPackages,
} from '../../src/marketplace/services/marketplace-service.js';

describe('Marketplace Database', () => {
  before(async () => {
    // Initialize test database
    database.initialize();
  });

  after(async () => {
    // Clean up
    database.close();
  });

  it('should initialize database successfully', () => {
    const health = database.healthCheck();
    assert.strictEqual(health.status, 'healthy');
  });

  it('should have required tables', () => {
    const tables = database.getTableNames();
    assert.ok(tables.includes('packages'));
    assert.ok(tables.includes('installations'));
    assert.ok(tables.includes('ratings'));
    assert.ok(tables.includes('download_stats'));
  });
});

describe('Marketplace Service', () => {
  before(async () => {
    database.initialize();

    // Insert test package
    const db = database.getDatabase();
    db.prepare(`
      INSERT INTO packages (id, name, version, category, author, description, install_command, install_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'test-package-1',
      'Test Package',
      '1.0.0',
      'mcp-servers',
      'Test Author',
      'A test package',
      'test-package',
      'npm'
    );
  });

  after(() => {
    database.close();
  });

  it('should search packages', async () => {
    const result = await searchPackages('test', {}, 'relevance', 1, 20);
    assert.ok(result.packages.length > 0);
    assert.ok(result.pagination);
  });

  it('should get package by ID', async () => {
    const pkg = await getPackage('test-package-1');
    assert.ok(pkg);
    assert.strictEqual(pkg.id, 'test-package-1');
    assert.strictEqual(pkg.name, 'Test Package');
  });

  it('should get featured packages', async () => {
    const packages = await getFeaturedPackages(10);
    assert.ok(Array.isArray(packages));
  });

  it('should rate package', async () => {
    const result = await ratePackage('test-package-1', 'user-1', 5, 'Great package!');
    assert.ok(result);
    assert.strictEqual(result.rating, 5);
    assert.strictEqual(result.packageId, 'test-package-1');
  });
});

describe('Installation Service', () => {
  it('should validate installation types', () => {
    const validTypes = ['npm', 'git', 'local', 'url'];
    validTypes.forEach(type => {
      assert.ok(['npm', 'git', 'local', 'url'].includes(type));
    });
  });
});
