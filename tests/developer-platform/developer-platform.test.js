/**
 * Developer Platform Tests
 * @module tests/developer-platform
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import database from '../../src/developer-platform/database/init.js';
import {
  searchBlogPosts,
  getBlogPost,
  createBlogPost,
  getFeaturedBlogPosts,
} from '../../src/developer-platform/services/blog-service.js';
import {
  searchEvents,
  getEvent,
  createEvent,
  registerForEvent,
  getFeaturedEvents,
} from '../../src/developer-platform/services/events-service.js';

describe('Developer Platform Database', () => {
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
    assert.ok(tables.includes('blog_posts'));
    assert.ok(tables.includes('blog_comments'));
    assert.ok(tables.includes('events'));
    assert.ok(tables.includes('event_registrations'));
    assert.ok(tables.includes('learning_paths'));
    assert.ok(tables.includes('communities'));
  });
});

describe('Blog Service', () => {
  let testPostId;

  before(async () => {
    database.initialize();
  });

  after(() => {
    database.close();
  });

  it('should create blog post', async () => {
    const post = await createBlogPost({
      title: 'Test Blog Post',
      slug: 'test-blog-post-' + Date.now(),
      content: 'This is test content',
      excerpt: 'Test excerpt',
      author_id: 'test-author',
      author_name: 'Test Author',
      category: 'tutorial',
      tags: ['test', 'nodejs'],
      status: 'published',
    });

    assert.ok(post.id);
    assert.strictEqual(post.title, 'Test Blog Post');
    assert.strictEqual(post.category, 'tutorial');
    testPostId = post.id;
  });

  it('should get blog post by ID', async () => {
    const post = await getBlogPost(testPostId, false);
    assert.ok(post);
    assert.strictEqual(post.id, testPostId);
    assert.strictEqual(post.title, 'Test Blog Post');
  });

  it('should search blog posts', async () => {
    const result = await searchBlogPosts('test', {}, 'published_at', 1, 20);
    assert.ok(result.posts.length > 0);
    assert.ok(result.pagination);
    assert.ok(result.pagination.total >= 1);
  });

  it('should get featured blog posts', async () => {
    const posts = await getFeaturedBlogPosts(5);
    assert.ok(Array.isArray(posts));
  });
});

describe('Events Service', () => {
  let testEventId;

  before(async () => {
    database.initialize();
  });

  after(() => {
    database.close();
  });

  it('should create event', async () => {
    const now = Math.floor(Date.now() / 1000);
    const event = await createEvent({
      title: 'Test Event',
      slug: 'test-event-' + Date.now(),
      description: 'This is a test event',
      short_description: 'Test event',
      event_type: 'webinar',
      location: { type: 'online', platform: 'Zoom' },
      start_time: now + 86400, // Tomorrow
      end_time: now + 90000, // Tomorrow + 1 hour
      timezone: 'UTC',
      organizer_id: 'test-org',
      organizer_name: 'Test Organizer',
      max_attendees: 100,
      tags: ['test'],
      status: 'upcoming',
    });

    assert.ok(event.id);
    assert.strictEqual(event.title, 'Test Event');
    assert.strictEqual(event.event_type, 'webinar');
    testEventId = event.id;
  });

  it('should get event by ID', async () => {
    const event = await getEvent(testEventId);
    assert.ok(event);
    assert.strictEqual(event.id, testEventId);
    assert.strictEqual(event.title, 'Test Event');
  });

  it('should search events', async () => {
    const result = await searchEvents('test', {}, 'start_time', 1, 20);
    assert.ok(result.events.length > 0);
    assert.ok(result.pagination);
  });

  it('should register for event', async () => {
    const registration = await registerForEvent({
      event_id: testEventId,
      user_id: 'test-user',
      user_name: 'Test User',
      user_email: 'test@example.com',
    });

    assert.ok(registration.id);
    assert.strictEqual(registration.event_id, testEventId);
    assert.strictEqual(registration.registration_status, 'registered');
  });

  it('should prevent duplicate registration', async () => {
    try {
      await registerForEvent({
        event_id: testEventId,
        user_id: 'test-user',
        user_name: 'Test User',
        user_email: 'test@example.com',
      });
      assert.fail('Should have thrown error for duplicate registration');
    } catch (error) {
      assert.ok(error.message.includes('Already registered'));
    }
  });

  it('should get featured events', async () => {
    const events = await getFeaturedEvents(5);
    assert.ok(Array.isArray(events));
  });
});
