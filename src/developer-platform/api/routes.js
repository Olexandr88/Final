/**
 * Developer Platform API Routes
 * @module developer-platform/api/routes
 */

import { Router } from 'express';
import {
  searchBlogPosts,
  getBlogPost,
  createBlogPost,
  getBlogComments,
  createBlogComment,
  getFeaturedBlogPosts,
  getRecentBlogPosts,
} from '../services/blog-service.js';
import {
  searchEvents,
  getEvent,
  createEvent,
  registerForEvent,
  getUserRegistrations,
  getFeaturedEvents,
} from '../services/events-service.js';
import { logger } from '../../utils/logger.js';

const router = Router();

// =====================================================
// BLOG ENDPOINTS
// =====================================================

/**
 * Search blog posts
 * GET /developer-platform/blog/search?q=query&category=news&sort=published_at&page=1&limit=20
 */
router.get('/blog/search', async (req, res) => {
  try {
    const { q = '', category, status, author_id, sort = 'published_at', page = 1, limit = 20 } = req.query;

    const filters = {};
    if (category) filters.category = category;
    if (status) filters.status = status;
    if (author_id) filters.author_id = author_id;

    const result = await searchBlogPosts(q, filters, sort, parseInt(page), parseInt(limit));

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Blog search failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get single blog post
 * GET /developer-platform/blog/:idOrSlug
 */
router.get('/blog/:idOrSlug', async (req, res) => {
  try {
    const { idOrSlug } = req.params;
    const post = await getBlogPost(idOrSlug);

    if (!post) {
      return res.status(404).json({ success: false, error: 'Blog post not found' });
    }

    res.json({ success: true, data: post });
  } catch (error) {
    logger.error('Get blog post failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Create blog post
 * POST /developer-platform/blog
 */
router.post('/blog', async (req, res) => {
  try {
    const post = await createBlogPost(req.body);
    res.status(201).json({ success: true, data: post });
  } catch (error) {
    logger.error('Create blog post failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get blog comments
 * GET /developer-platform/blog/:postId/comments?page=1&limit=50
 */
router.get('/blog/:postId/comments', async (req, res) => {
  try {
    const { postId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const result = await getBlogComments(postId, parseInt(page), parseInt(limit));
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Get blog comments failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Create blog comment
 * POST /developer-platform/blog/:postId/comments
 */
router.post('/blog/:postId/comments', async (req, res) => {
  try {
    const { postId } = req.params;
    const comment = await createBlogComment({ ...req.body, post_id: postId });
    res.status(201).json({ success: true, data: comment });
  } catch (error) {
    logger.error('Create blog comment failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get featured blog posts
 * GET /developer-platform/blog/featured?limit=5
 */
router.get('/blog-featured', async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    const posts = await getFeaturedBlogPosts(parseInt(limit));
    res.json({ success: true, data: posts });
  } catch (error) {
    logger.error('Get featured blog posts failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get recent blog posts
 * GET /developer-platform/blog/recent?limit=10
 */
router.get('/blog-recent', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const posts = await getRecentBlogPosts(parseInt(limit));
    res.json({ success: true, data: posts });
  } catch (error) {
    logger.error('Get recent blog posts failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// EVENTS ENDPOINTS
// =====================================================

/**
 * Search events
 * GET /developer-platform/events/search?q=query&event_type=webinar&status=upcoming&page=1&limit=20
 */
router.get('/events/search', async (req, res) => {
  try {
    const { q = '', event_type, status, featured, sort = 'start_time', page = 1, limit = 20 } = req.query;

    const filters = {};
    if (event_type) filters.event_type = event_type;
    if (status) filters.status = status;
    if (featured !== undefined) filters.featured = featured === 'true';

    const result = await searchEvents(q, filters, sort, parseInt(page), parseInt(limit));

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Events search failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get single event
 * GET /developer-platform/events/:idOrSlug
 */
router.get('/events/:idOrSlug', async (req, res) => {
  try {
    const { idOrSlug } = req.params;
    const event = await getEvent(idOrSlug);

    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    res.json({ success: true, data: event });
  } catch (error) {
    logger.error('Get event failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Create event
 * POST /developer-platform/events
 */
router.post('/events', async (req, res) => {
  try {
    const event = await createEvent(req.body);
    res.status(201).json({ success: true, data: event });
  } catch (error) {
    logger.error('Create event failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Register for event
 * POST /developer-platform/events/:eventId/register
 */
router.post('/events/:eventId/register', async (req, res) => {
  try {
    const { eventId } = req.params;
    const registration = await registerForEvent({ ...req.body, event_id: eventId });
    res.status(201).json({ success: true, data: registration });
  } catch (error) {
    logger.error('Event registration failed', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get user's event registrations
 * GET /developer-platform/events/user/:userId/registrations
 */
router.get('/events/user/:userId/registrations', async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.query;

    const filters = {};
    if (status) filters.status = status;

    const registrations = await getUserRegistrations(userId, filters);
    res.json({ success: true, data: registrations });
  } catch (error) {
    logger.error('Get user registrations failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get featured events
 * GET /developer-platform/events/featured?limit=5
 */
router.get('/events-featured', async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    const events = await getFeaturedEvents(parseInt(limit));
    res.json({ success: true, data: events });
  } catch (error) {
    logger.error('Get featured events failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// HEALTH CHECK
// =====================================================

/**
 * Health check endpoint
 * GET /developer-platform/health
 */
router.get('/health', async (req, res) => {
  try {
    const health = database.healthCheck();
    res.json(health);
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

export default router;
