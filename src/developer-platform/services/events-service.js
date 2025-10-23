/**
 * Events Service
 * Business logic for events, webinars, registration management
 * @module developer-platform/services/events-service
 */

import database from '../database/init.js';
import { logger } from '../../utils/logger.js';
import { randomUUID } from 'crypto';

/**
 * Search events with full-text search
 * @param {string} query - Search query (FTS5 syntax)
 * @param {Object} filters - Additional filters (event_type, status, featured)
 * @param {string} sort - Sort field (start_time, attendees, relevance)
 * @param {number} page - Page number (1-indexed)
 * @param {number} limit - Results per page
 * @returns {Promise<Object>} Search results with pagination
 */
export async function searchEvents(query, filters = {}, sort = 'start_time', page = 1, limit = 20) {
  const db = database.getDatabase();

  try {
    let sql;
    let params = [];
    let countSql;
    let countParams = [];

    // Full-text search query
    if (query && query.trim()) {
      sql = `
        SELECT e.*, 
               bm3(events_fts) as relevance
        FROM events e
        INNER JOIN events_fts fts ON e.rowid = fts.rowid
        WHERE events_fts MATCH ?
      `;
      params.push(query);

      countSql = `
        SELECT COUNT(*) as count
        FROM events e
        INNER JOIN events_fts fts ON e.rowid = fts.rowid
        WHERE events_fts MATCH ?
      `;
      countParams.push(query);
    } else {
      // No search query, return all events
      sql = 'SELECT * FROM events WHERE 1=1';
      countSql = 'SELECT COUNT(*) as count FROM events WHERE 1=1';
    }

    // Apply filters
    if (filters.event_type) {
      sql += ' AND e.event_type = ?';
      countSql += ' AND event_type = ?';
      params.push(filters.event_type);
      countParams.push(filters.event_type);
    }

    if (filters.status) {
      sql += ' AND e.status = ?';
      countSql += ' AND status = ?';
      params.push(filters.status);
      countParams.push(filters.status);
    }

    if (filters.featured !== undefined) {
      sql += ' AND e.featured = ?';
      countSql += ' AND featured = ?';
      params.push(filters.featured ? 1 : 0);
      countParams.push(filters.featured ? 1 : 0);
    }

    // Sort
    const validSortFields = ['start_time', 'current_attendees', 'relevance', 'created_at'];
    const sortField = validSortFields.includes(sort) ? sort : 'start_time';

    if (sortField === 'relevance' && (!query || !query.trim())) {
      // Can't sort by relevance without search query, default to start_time
      sql += ' ORDER BY e.start_time ASC';
    } else if (sortField === 'relevance') {
      sql += ' ORDER BY relevance DESC';
    } else if (sortField === 'current_attendees') {
      sql += ' ORDER BY e.current_attendees DESC';
    } else {
      sql += ` ORDER BY e.${sortField} ASC`;
    }

    // Pagination
    const offset = (page - 1) * limit;
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    // Execute query
    const events = db.prepare(sql).all(...params);

    // Parse JSON fields
    events.forEach((event) => {
      if (event.tags) event.tags = JSON.parse(event.tags);
      if (event.location) event.location = JSON.parse(event.location);
    });

    // Get total count
    const totalResult = db.prepare(countSql).get(...countParams);
    const total = totalResult.count;

    logger.info('Events searched', {
      query,
      filters,
      resultsCount: events.length,
      total,
    });

    return {
      events,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    logger.error('Failed to search events', {
      error: error.message,
      query,
      filters,
    });
    throw error;
  }
}

/**
 * Get single event by ID or slug
 * @param {string} idOrSlug - Event ID or slug
 * @returns {Promise<Object|null>} Event or null
 */
export async function getEvent(idOrSlug) {
  const db = database.getDatabase();

  try {
    const event = db
      .prepare(
        `SELECT * FROM events 
         WHERE id = ? OR slug = ? 
         LIMIT 1`
      )
      .get(idOrSlug, idOrSlug);

    if (!event) {
      return null;
    }

    // Parse JSON fields
    if (event.tags) event.tags = JSON.parse(event.tags);
    if (event.location) event.location = JSON.parse(event.location);

    logger.info('Event retrieved', { id: event.id, slug: event.slug });

    return event;
  } catch (error) {
    logger.error('Failed to get event', {
      error: error.message,
      idOrSlug,
    });
    throw error;
  }
}

/**
 * Create event
 * @param {Object} eventData - Event data
 * @returns {Promise<Object>} Created event
 */
export async function createEvent(eventData) {
  const db = database.getDatabase();

  try {
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);

    const event = {
      id,
      title: eventData.title,
      slug: eventData.slug,
      description: eventData.description,
      short_description: eventData.short_description || null,
      event_type: eventData.event_type,
      location: JSON.stringify(eventData.location || {}),
      start_time: eventData.start_time,
      end_time: eventData.end_time,
      timezone: eventData.timezone || 'UTC',
      organizer_id: eventData.organizer_id,
      organizer_name: eventData.organizer_name,
      featured_image: eventData.featured_image || null,
      max_attendees: eventData.max_attendees || null,
      current_attendees: 0,
      tags: JSON.stringify(eventData.tags || []),
      registration_url: eventData.registration_url || null,
      meeting_link: eventData.meeting_link || null,
      status: eventData.status || 'upcoming',
      featured: eventData.featured ? 1 : 0,
      created_at: now,
      updated_at: now,
    };

    db.prepare(
      `INSERT INTO events (
        id, title, slug, description, short_description, event_type,
        location, start_time, end_time, timezone, organizer_id, organizer_name,
        featured_image, max_attendees, current_attendees, tags,
        registration_url, meeting_link, status, featured, created_at, updated_at
      ) VALUES (
        @id, @title, @slug, @description, @short_description, @event_type,
        @location, @start_time, @end_time, @timezone, @organizer_id, @organizer_name,
        @featured_image, @max_attendees, @current_attendees, @tags,
        @registration_url, @meeting_link, @status, @featured, @created_at, @updated_at
      )`
    ).run(event);

    logger.info('Event created', { id, title: event.title });

    // Parse JSON back for return
    event.tags = JSON.parse(event.tags);
    event.location = JSON.parse(event.location);

    return event;
  } catch (error) {
    logger.error('Failed to create event', {
      error: error.message,
      title: eventData.title,
    });
    throw error;
  }
}

/**
 * Register for event
 * @param {Object} registrationData - Registration data
 * @returns {Promise<Object>} Created registration
 */
export async function registerForEvent(registrationData) {
  const db = database.getDatabase();

  try {
    // Check if event exists and has capacity
    const event = await getEvent(registrationData.event_id);
    if (!event) {
      throw new Error('Event not found');
    }

    if (event.max_attendees && event.current_attendees >= event.max_attendees) {
      throw new Error('Event is full');
    }

    // Check if already registered
    const existing = db
      .prepare(
        `SELECT id FROM event_registrations 
         WHERE event_id = ? AND user_id = ?`
      )
      .get(registrationData.event_id, registrationData.user_id);

    if (existing) {
      throw new Error('Already registered for this event');
    }

    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);

    const registration = {
      id,
      event_id: registrationData.event_id,
      user_id: registrationData.user_id,
      user_name: registrationData.user_name,
      user_email: registrationData.user_email,
      registration_status: 'registered',
      attendance_status: null,
      registered_at: now,
    };

    // Use transaction to ensure atomicity
    const insertRegistration = db.prepare(
      `INSERT INTO event_registrations (
        id, event_id, user_id, user_name, user_email,
        registration_status, attendance_status, registered_at
      ) VALUES (
        @id, @event_id, @user_id, @user_name, @user_email,
        @registration_status, @attendance_status, @registered_at
      )`
    );

    const updateEvent = db.prepare(
      `UPDATE events 
       SET current_attendees = current_attendees + 1 
       WHERE id = ?`
    );

    const transaction = db.transaction(() => {
      insertRegistration.run(registration);
      updateEvent.run(registrationData.event_id);
    });

    transaction();

    logger.info('Event registration created', {
      id,
      eventId: registration.event_id,
      userId: registration.user_id,
    });

    return registration;
  } catch (error) {
    logger.error('Failed to register for event', {
      error: error.message,
      eventId: registrationData.event_id,
      userId: registrationData.user_id,
    });
    throw error;
  }
}

/**
 * Get user's event registrations
 * @param {string} userId - User ID
 * @param {Object} filters - Additional filters (status)
 * @returns {Promise<Array>} User registrations
 */
export async function getUserRegistrations(userId, filters = {}) {
  const db = database.getDatabase();

  try {
    let sql = `
      SELECT er.*, e.title, e.start_time, e.end_time, e.event_type, e.location
      FROM event_registrations er
      INNER JOIN events e ON er.event_id = e.id
      WHERE er.user_id = ?
    `;
    const params = [userId];

    if (filters.status) {
      sql += ' AND e.status = ?';
      params.push(filters.status);
    }

    sql += ' ORDER BY e.start_time ASC';

    const registrations = db.prepare(sql).all(...params);

    // Parse JSON fields
    registrations.forEach((reg) => {
      if (reg.location) reg.location = JSON.parse(reg.location);
    });

    logger.info('User registrations retrieved', {
      userId,
      count: registrations.length,
    });

    return registrations;
  } catch (error) {
    logger.error('Failed to get user registrations', {
      error: error.message,
      userId,
    });
    throw error;
  }
}

/**
 * Get featured events
 * @param {number} limit - Number of events to return
 * @returns {Promise<Array>} Featured events
 */
export async function getFeaturedEvents(limit = 5) {
  const db = database.getDatabase();

  try {
    const events = db
      .prepare(
        `SELECT * FROM events 
         WHERE featured = 1 AND status = 'upcoming' 
         ORDER BY start_time ASC 
         LIMIT ?`
      )
      .all(limit);

    events.forEach((event) => {
      if (event.tags) event.tags = JSON.parse(event.tags);
      if (event.location) event.location = JSON.parse(event.location);
    });

    logger.info('Featured events retrieved', { count: events.length });

    return events;
  } catch (error) {
    logger.error('Failed to get featured events', {
      error: error.message,
    });
    throw error;
  }
}
