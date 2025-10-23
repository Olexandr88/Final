/**
 * Blog Service
 * Business logic for blog posts, comments, and full-text search
 * @module developer-platform/services/blog-service
 */

import database from '../database/init.js';
import { logger } from '../../utils/logger.js';
import { randomUUID } from 'crypto';

/**
 * Search blog posts with full-text search
 * @param {string} query - Search query (FTS5 syntax)
 * @param {Object} filters - Additional filters (category, status, author_id)
 * @param {string} sort - Sort field (published_at, view_count, like_count, comment_count, relevance)
 * @param {number} page - Page number (1-indexed)
 * @param {number} limit - Results per page
 * @returns {Promise<Object>} Search results with pagination
 */
export async function searchBlogPosts(query, filters = {}, sort = 'published_at', page = 1, limit = 20) {
  const db = database.getDatabase();

  try {
    let sql;
    let params = [];
    let countSql;
    let countParams = [];

    // Full-text search query
    if (query && query.trim()) {
      sql = `
        SELECT bp.*, 
               bm3(blog_posts_fts) as relevance
        FROM blog_posts bp
        INNER JOIN blog_posts_fts fts ON bp.rowid = fts.rowid
        WHERE blog_posts_fts MATCH ?
      `;
      params.push(query);

      countSql = `
        SELECT COUNT(*) as count
        FROM blog_posts bp
        INNER JOIN blog_posts_fts fts ON bp.rowid = fts.rowid
        WHERE blog_posts_fts MATCH ?
      `;
      countParams.push(query);
    } else {
      // No search query, return all posts
      sql = 'SELECT * FROM blog_posts WHERE 1=1';
      countSql = 'SELECT COUNT(*) as count FROM blog_posts WHERE 1=1';
    }

    // Apply filters
    if (filters.category) {
      sql += ' AND bp.category = ?';
      countSql += ' AND category = ?';
      params.push(filters.category);
      countParams.push(filters.category);
    }

    if (filters.status) {
      sql += ' AND bp.status = ?';
      countSql += ' AND status = ?';
      params.push(filters.status);
      countParams.push(filters.status);
    }

    if (filters.author_id) {
      sql += ' AND bp.author_id = ?';
      countSql += ' AND author_id = ?';
      params.push(filters.author_id);
      countParams.push(filters.author_id);
    }

    // Sort
    const validSortFields = ['published_at', 'view_count', 'like_count', 'comment_count', 'relevance', 'created_at'];
    const sortField = validSortFields.includes(sort) ? sort : 'published_at';

    if (sortField === 'relevance' && (!query || !query.trim())) {
      // Can't sort by relevance without search query, default to published_at
      sql += ' ORDER BY bp.published_at DESC';
    } else if (sortField === 'relevance') {
      sql += ' ORDER BY relevance DESC';
    } else {
      sql += ` ORDER BY bp.${sortField} DESC`;
    }

    // Pagination
    const offset = (page - 1) * limit;
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    // Execute query
    const posts = db.prepare(sql).all(...params);

    // Parse JSON fields
    posts.forEach((post) => {
      if (post.tags) post.tags = JSON.parse(post.tags);
    });

    // Get total count
    const totalResult = db.prepare(countSql).get(...countParams);
    const total = totalResult.count;

    logger.info('Blog posts searched', {
      query,
      filters,
      resultsCount: posts.length,
      total,
    });

    return {
      posts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    logger.error('Failed to search blog posts', {
      error: error.message,
      query,
      filters,
    });
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
  const db = database.getDatabase();

  try {
    const post = db
      .prepare(
        `SELECT * FROM blog_posts 
         WHERE id = ? OR slug = ? 
         LIMIT 1`
      )
      .get(idOrSlug, idOrSlug);

    if (!post) {
      return null;
    }

    // Parse JSON fields
    if (post.tags) post.tags = JSON.parse(post.tags);

    // Increment view count
    if (incrementView) {
      db.prepare(
        `UPDATE blog_posts 
         SET view_count = view_count + 1 
         WHERE id = ?`
      ).run(post.id);
      post.view_count += 1;
    }

    logger.info('Blog post retrieved', { id: post.id, slug: post.slug });

    return post;
  } catch (error) {
    logger.error('Failed to get blog post', {
      error: error.message,
      idOrSlug,
    });
    throw error;
  }
}

/**
 * Create blog post
 * @param {Object} postData - Post data
 * @returns {Promise<Object>} Created post
 */
export async function createBlogPost(postData) {
  const db = database.getDatabase();

  try {
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
      tags: JSON.stringify(postData.tags || []),
      featured_image: postData.featured_image || null,
      status: postData.status || 'draft',
      view_count: 0,
      like_count: 0,
      comment_count: 0,
      published_at: postData.status === 'published' ? now : null,
      created_at: now,
      updated_at: now,
    };

    db.prepare(
      `INSERT INTO blog_posts (
        id, title, slug, content, excerpt, author_id, author_name,
        category, tags, featured_image, status, view_count, like_count,
        comment_count, published_at, created_at, updated_at
      ) VALUES (
        @id, @title, @slug, @content, @excerpt, @author_id, @author_name,
        @category, @tags, @featured_image, @status, @view_count, @like_count,
        @comment_count, @published_at, @created_at, @updated_at
      )`
    ).run(post);

    logger.info('Blog post created', { id, title: post.title });

    // Parse tags back to array for return
    post.tags = JSON.parse(post.tags);

    return post;
  } catch (error) {
    logger.error('Failed to create blog post', {
      error: error.message,
      title: postData.title,
    });
    throw error;
  }
}

/**
 * Get blog comments
 * @param {string} postId - Post ID
 * @param {number} page - Page number
 * @param {number} limit - Results per page
 * @returns {Promise<Object>} Comments with pagination
 */
export async function getBlogComments(postId, page = 1, limit = 50) {
  const db = database.getDatabase();

  try {
    const offset = (page - 1) * limit;

    const comments = db
      .prepare(
        `SELECT * FROM blog_comments 
         WHERE post_id = ? 
         ORDER BY created_at DESC 
         LIMIT ? OFFSET ?`
      )
      .all(postId, limit, offset);

    const totalResult = db
      .prepare('SELECT COUNT(*) as count FROM blog_comments WHERE post_id = ?')
      .get(postId);

    logger.info('Blog comments retrieved', {
      postId,
      count: comments.length,
    });

    return {
      comments,
      pagination: {
        page,
        limit,
        total: totalResult.count,
        totalPages: Math.ceil(totalResult.count / limit),
      },
    };
  } catch (error) {
    logger.error('Failed to get blog comments', {
      error: error.message,
      postId,
    });
    throw error;
  }
}

/**
 * Create blog comment
 * @param {Object} commentData - Comment data
 * @returns {Promise<Object>} Created comment
 */
export async function createBlogComment(commentData) {
  const db = database.getDatabase();

  try {
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

    db.prepare(
      `INSERT INTO blog_comments (
        id, post_id, user_id, user_name, content, parent_id,
        like_count, created_at, updated_at
      ) VALUES (
        @id, @post_id, @user_id, @user_name, @content, @parent_id,
        @like_count, @created_at, @updated_at
      )`
    ).run(comment);

    logger.info('Blog comment created', { id, postId: comment.post_id });

    return comment;
  } catch (error) {
    logger.error('Failed to create blog comment', {
      error: error.message,
      postId: commentData.post_id,
    });
    throw error;
  }
}

/**
 * Get featured blog posts
 * @param {number} limit - Number of posts to return
 * @returns {Promise<Array>} Featured posts
 */
export async function getFeaturedBlogPosts(limit = 5) {
  const db = database.getDatabase();

  try {
    const posts = db
      .prepare(
        `SELECT * FROM blog_posts 
         WHERE status = 'published' 
         ORDER BY like_count DESC, view_count DESC 
         LIMIT ?`
      )
      .all(limit);

    posts.forEach((post) => {
      if (post.tags) post.tags = JSON.parse(post.tags);
    });

    logger.info('Featured blog posts retrieved', { count: posts.length });

    return posts;
  } catch (error) {
    logger.error('Failed to get featured blog posts', {
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get recent blog posts
 * @param {number} limit - Number of posts to return
 * @returns {Promise<Array>} Recent posts
 */
export async function getRecentBlogPosts(limit = 10) {
  const db = database.getDatabase();

  try {
    const posts = db
      .prepare(
        `SELECT * FROM blog_posts 
         WHERE status = 'published' 
         ORDER BY published_at DESC 
         LIMIT ?`
      )
      .all(limit);

    posts.forEach((post) => {
      if (post.tags) post.tags = JSON.parse(post.tags);
    });

    logger.info('Recent blog posts retrieved', { count: posts.length });

    return posts;
  } catch (error) {
    logger.error('Failed to get recent blog posts', {
      error: error.message,
    });
    throw error;
  }
}
