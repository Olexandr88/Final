/**
 * Blog Service
 * Business logic for blog posts and comments
 * @module developer-platform/services/blog-service
 */

import database from '../database/init.js';
import { logger } from '../../utils/logger.js';
import { randomUUID } from 'crypto';

/**
 * Search blog posts using FTS5
 * @param {string} query - Search query
 * @param {Object} filters - Filter options
 * @param {string} sort - Sort field
 * @param {number} page - Page number
 * @param {number} limit - Results per page
 * @returns {Promise<Object>} Search results with pagination
 */
export async function searchBlogPosts(query, filters = {}, sort = 'published_at', page = 1, limit = 20) {
  try {
    const db = database.getDatabase();
    const offset = (page - 1) * limit;

    let sql = '';
    let countSql = '';
    const params = [];
    const countParams = [];

    // Use FTS5 if query provided
    if (query && query.trim()) {
      sql = `SELECT bp.* FROM blog_posts bp
             INNER JOIN blog_posts_fts fts ON bp.rowid = fts.rowid
             WHERE blog_posts_fts MATCH ?`;
      countSql = `SELECT COUNT(*) as total FROM blog_posts bp
                  INNER JOIN blog_posts_fts fts ON bp.rowid = fts.rowid
                  WHERE blog_posts_fts MATCH ?`;
      params.push(query);
      countParams.push(query);
    } else {
      sql = 'SELECT * FROM blog_posts WHERE 1=1';
      countSql = 'SELECT COUNT(*) as total FROM blog_posts WHERE 1=1';
    }

    // Apply filters
    if (filters.category) {
      sql += ' AND category = ?';
      countSql += ' AND category = ?';
      params.push(filters.category);
      countParams.push(filters.category);
    }

    if (filters.status) {
      sql += ' AND status = ?';
      countSql += ' AND status = ?';
      params.push(filters.status);
      countParams.push(filters.status);
    } else {
      // Default to published only
      sql += ' AND status = ?';
      countSql += ' AND status = ?';
      params.push('published');
      countParams.push('published');
    }

    if (filters.author_id) {
      sql += ' AND author_id = ?';
      countSql += ' AND author_id = ?';
      params.push(filters.author_id);
      countParams.push(filters.author_id);
    }

    // Sorting
    const sortMap = {
      published_at: 'published_at DESC',
      view_count: 'view_count DESC',
      like_count: 'like_count DESC',
      comment_count: 'comment_count DESC',
      relevance: 'rowid',
    };
    sql += ` ORDER BY ${sortMap[sort] || sortMap.published_at}`;

    // Pagination
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const posts = db.prepare(sql).all(...params);
    const { total } = db.prepare(countSql).get(...countParams);

    logger.info('Blog posts searched', {
      query,
      filters,
      resultsCount: posts.length,
    });

    return {
      posts: posts.map(post => ({
        ...post,
        tags: post.tags ? JSON.parse(post.tags) : [],
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    logger.error('Failed to search blog posts', { error: error.message });
    throw error;
  }
}

/**
 * Get single blog post by ID or slug
 * @param {string} idOrSlug - Post ID or slug
 * @param {boolean} incrementView - Whether to increment view count
 * @returns {Promise<Object|null>} Blog post or null
 */
export async function getBlogPost(idOrSlug, incrementView = true) {
  try {
    const db = database.getDatabase();

    const post = db
      .prepare('SELECT * FROM blog_posts WHERE id = ? OR slug = ?')
      .get(idOrSlug, idOrSlug);

    if (!post) {
      return null;
    }

    // Increment view count
    if (incrementView && post.status === 'published') {
      db.prepare('UPDATE blog_posts SET view_count = view_count + 1 WHERE id = ?')
        .run(post.id);
      post.view_count += 1;
    }

    logger.info('Blog post retrieved', { id: post.id });

    return {
      ...post,
      tags: post.tags ? JSON.parse(post.tags) : [],
    };
  } catch (error) {
    logger.error('Failed to get blog post', { error: error.message });
    throw error;
  }
}

/**
 * Create new blog post
 * @param {Object} postData - Blog post data
 * @returns {Promise<Object>} Created post
 */
export async function createBlogPost(postData) {
  try {
    const db = database.getDatabase();
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);

    const post = {
      id,
      title: postData.title,
      slug: postData.slug,
      content: postData.content,
      excerpt: postData.excerpt || null,
      author_id: postData.author_id,
      author_name: postData.author_name,
      category: postData.category,
      tags: postData.tags ? JSON.stringify(postData.tags) : null,
      featured_image: postData.featured_image || null,
      status: postData.status || 'draft',
      published_at: postData.status === 'published' ? now : null,
      created_at: now,
      updated_at: now,
    };

    db.prepare(`
      INSERT INTO blog_posts (id, title, slug, content, excerpt, author_id, author_name, category, tags, featured_image, status, published_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      post.id,
      post.title,
      post.slug,
      post.content,
      post.excerpt,
      post.author_id,
      post.author_name,
      post.category,
      post.tags,
      post.featured_image,
      post.status,
      post.published_at,
      post.created_at,
      post.updated_at
    );

    logger.info('Blog post created', { id: post.id, title: post.title });

    return {
      ...post,
      tags: post.tags ? JSON.parse(post.tags) : [],
    };
  } catch (error) {
    logger.error('Failed to create blog post', { error: error.message });
    throw error;
  }
}

/**
 * Get comments for a blog post
 * @param {string} postId - Post ID
 * @param {number} page - Page number
 * @param {number} limit - Results per page
 * @returns {Promise<Object>} Comments with pagination
 */
export async function getBlogComments(postId, page = 1, limit = 50) {
  try {
    const db = database.getDatabase();
    const offset = (page - 1) * limit;

    const comments = db
      .prepare(`
        SELECT * FROM blog_comments
        WHERE post_id = ?
        ORDER BY created_at ASC
        LIMIT ? OFFSET ?
      `)
      .all(postId, limit, offset);

    const { total } = db
      .prepare('SELECT COUNT(*) as total FROM blog_comments WHERE post_id = ?')
      .get(postId);

    logger.info('Blog comments retrieved', { postId, count: comments.length });

    return {
      comments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    logger.error('Failed to get blog comments', { error: error.message });
    throw error;
  }
}

/**
 * Create blog comment
 * @param {Object} commentData - Comment data
 * @returns {Promise<Object>} Created comment
 */
export async function createBlogComment(commentData) {
  try {
    const db = database.getDatabase();
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);

    const comment = {
      id,
      post_id: commentData.post_id,
      user_id: commentData.user_id,
      user_name: commentData.user_name,
      content: commentData.content,
      parent_id: commentData.parent_id || null,
      like_count: 0,
      created_at: now,
      updated_at: now,
    };

    db.prepare(`
      INSERT INTO blog_comments (id, post_id, user_id, user_name, content, parent_id, like_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      comment.id,
      comment.post_id,
      comment.user_id,
      comment.user_name,
      comment.content,
      comment.parent_id,
      comment.like_count,
      comment.created_at,
      comment.updated_at
    );

    // Increment comment count on post
    db.prepare('UPDATE blog_posts SET comment_count = comment_count + 1 WHERE id = ?')
      .run(comment.post_id);

    logger.info('Blog comment created', { id: comment.id, postId: comment.post_id });

    return comment;
  } catch (error) {
    logger.error('Failed to create blog comment', { error: error.message });
    throw error;
  }
}

/**
 * Get featured blog posts
 * @param {number} limit - Number of posts to return
 * @returns {Promise<Array>} Featured posts
 */
export async function getFeaturedBlogPosts(limit = 5) {
  try {
    const db = database.getDatabase();

    const posts = db
      .prepare(`
        SELECT * FROM blog_posts
        WHERE status = 'published'
        ORDER BY view_count DESC, like_count DESC
        LIMIT ?
      `)
      .all(limit);

    logger.info('Featured blog posts retrieved', { count: posts.length });

    return posts.map(post => ({
      ...post,
      tags: post.tags ? JSON.parse(post.tags) : [],
    }));
  } catch (error) {
    logger.error('Failed to get featured blog posts', { error: error.message });
    throw error;
  }
}

/**
 * Get recent blog posts
 * @param {number} limit - Number of posts to return
 * @returns {Promise<Array>} Recent posts
 */
export async function getRecentBlogPosts(limit = 10) {
  try {
    const db = database.getDatabase();

    const posts = db
      .prepare(`
        SELECT * FROM blog_posts
        WHERE status = 'published'
        ORDER BY published_at DESC
        LIMIT ?
      `)
      .all(limit);

    logger.info('Recent blog posts retrieved', { count: posts.length });

    return posts.map(post => ({
      ...post,
      tags: post.tags ? JSON.parse(post.tags) : [],
    }));
  } catch (error) {
    logger.error('Failed to get recent blog posts', { error: error.message });
    throw error;
  }
}
