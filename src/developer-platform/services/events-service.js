/**
 * Events Service
 * Business logic for events and registrations
 * @module developer-platform/services/events-service
 */

import database from '../database/init.js';
import { logger } from '../../utils/logger.js';
import { randomUUID } from 'crypto';

/**
 * Search events using FTS5
 * @param {string} query - Search query
 * @param {Object} filters - Filter options
 * @param {string} sort - Sort field
 * @param {number} page - Page number
 * @param {number} limit - Results per page
 * @returns {Promise<Object>} Search results with pagination
 */
export async function searchEvents(query, filters = {}, sort = 'start_time', page = 1, limit = 20) {
  try {
    const db = database.getDatabase();
    const offset = (page - 1) * limit;

    let sql = '';
    let countSql = '';
    const params = [];
    const countParams = [];

    // Use FTS5 if query provided
    if (query && query.trim()) {
      sql = `SELECT e.* FROM events e
             INNER JOIN events_fts fts ON e.rowid = fts.rowid
             WHERE events_fts MATCH ?`;
      countSql = `SELECT COUNT(*) as total FROM events e
                  INNER JOIN events_fts fts ON e.rowid = fts.rowid
                  WHERE events_fts MATCH ?`;
      params.push(query);
      countParams.push(query);
    } else {
      sql = 'SELECT * FROM events WHERE 1=1';
      countSql = 'SELECT COUNT(*) as total FROM events WHERE 1=1';
    }

    // Apply filters
    if (filters.event_type) {
      sql += ' AND event_type = ?';
      countSql += ' AND event_type = ?';
      params.push(filters.event_type);
      countParams.push(filters.event_type);
    }

    if (filters.status) {
      sql += ' AND status = ?';
      countSql += ' AND status = ?';
      params.push(filters.status);
      countParams.push(filters.status);
    } else {
      // Default to upcoming events
      sql += ' AND status = ?';
      countSql += ' AND status = ?';
      params.push('upcoming');
      countParams.push('upcoming');
    }

    if (filters.featured !== undefined) {
      sql += ' AND featured = ?';
      countSql += ' AND featured = ?';
      params.push(filters.featured ? 1 : 0);
      countParams.push(filters.featured ? 1 : 0);
    }

    // Sorting
    const sortMap = {
      start_time: 'start_time ASC',
      attendees: 'current_attendees DESC',
      relevance: 'rowid',
    };
    sql += ` ORDER BY ${sortMap[sort] || sortMap.start_time}`;

    // Pagination
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const events = db.prepare(sql).all(...params);
    const { total } = db.prepare(countSql).get(...countParams);

    logger.info('Events searched', { query, filters, resultsCount: events.length });

    return {
      events: events.map(event => ({
        ...event,
        tags: event.tags ? JSON.parse(event.tags) : [],
        location: event.location ? JSON.parse(event.location) : null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    logger.error('Failed to search events', { error: error.message });
    throw error;
  }
}

/**
 * Get single event by ID or slug
 * @param {string} idOrSlug - Event ID or slug
 * @returns {Promise<Object|null>} Event or null
 */
export async function getEvent(idOrSlug) {
  try {
    const db = database.getDatabase();

    const event = db
      .prepare('SELECT * FROM events WHERE id = ? OR slug = ?')
      .get(idOrSlug, idOrSlug);

    if (!event) {
      return null;
    }

    logger.info('Event retrieved', { id: event.id });

    return {
      ...event,
      tags: event.tags ? JSON.parse(event.tags) : [],
      location: event.location ? JSON.parse(event.location) : null,
    };
  } catch (error) {
    logger.error('Failed to get event', { error: error.message });
    throw error;
  }
}

/**
 * Create new event
 * @param {Object} eventData - Event data
 * @returns {Promise<Object>} Created event
 */
export async function createEvent(eventData) {
  try {
    const db = database.getDatabase();
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);

    const event = {
      id,
      title: eventData.title,
      slug: eventData.slug,
      description: eventData.description,
      short_description: eventData.short_description || null,
      event_type: eventData.event_type,
      location: eventData.location ? JSON.stringify(eventData.location) : null,
      start_time: eventData.start_time,
      end_time: eventData.end_time,
      timezone: eventData.timezone || 'UTC',
      organizer_id: eventData.organizer_id,
      organizer_name: eventData.organizer_name,
      featured_image: eventData.featured_image || null,
      max_attendees: eventData.max_attendees || null,
      current_attendees: 0,
      tags: eventData.tags ? JSON.stringify(eventData.tags) : null,
      registration_url: eventData.registration_url || null,
      meeting_link: eventData.meeting_link || null,
      status: eventData.status || 'upcoming',
      featured: eventData.featured || false,
      created_at: now,
      updated_at: now,
    };

    db.prepare(`
      INSERT INTO events (id, title, slug, description, short_description, event_type, location, start_time, end_time, timezone, organizer_id, organizer_name, featured_image, max_attendees, current_attendees, tags, registration_url, meeting_link, status, featured, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.id,
      event.title,
      event.slug,
      event.description,
      event.short_description,
      event.event_type,
      event.location,
      event.start_time,
      event.end_time,
      event.timezone,
      event.organizer_id,
      event.organizer_name,
      event.featured_image,
      event.max_attendees,
      event.current_attendees,
      event.tags,
      event.registration_url,
      event.meeting_link,
      event.status,
      event.featured ? 1 : 0,
      event.created_at,
      event.updated_at
    );

    logger.info('Event created', { id: event.id, title: event.title });

    return {
      ...event,
      tags: event.tags ? JSON.parse(event.tags) : [],
      location: event.location ? JSON.parse(event.location) : null,
    };
  } catch (error) {
    logger.error('Failed to create event', { error: error.message });
    throw error;
  }
}

/**
 * Register user for event
 * @param {Object} registrationData - Registration data
 * @returns {Promise<Object>} Registration record
 */
export async function registerForEvent(registrationData) {
  try {
    const db = database.getDatabase();
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);

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
      .prepare('SELECT id FROM event_registrations WHERE event_id = ? AND user_id = ?')
      .get(registrationData.event_id, registrationData.user_id);

    if (existing) {
      throw new Error('Already registered for this event');
    }

    const registration = {
      id,
      event_id: registrationData.event_id,
      user_id: registrationData.user_id,
      user_name: registrationData.user_name,
      user_email: registrationData.user_email,
      registration_status: 'registered',
      attended: false,
      registered_at: now,
    };

    db.transaction(() => {
      db.prepare(`
        INSERT INTO event_registrations (id, event_id, user_id, user_name, user_email, registration_status, attended, registered_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        registration.id,
        registration.event_id,
        registration.user_id,
        registration.user_name,
        registration.user_email,
        registration.registration_status,
        registration.attended ? 1 : 0,
        registration.registered_at
      );

      // Update event attendee count
      db.prepare('UPDATE events SET current_attendees = current_attendees + 1 WHERE id = ?')
        .run(registration.event_id);
    })();

    logger.info('Event registration created', { id: registration.id, eventId: registration.event_id });

    return registration;
  } catch (error) {
    logger.error('Failed to register for event', { error: error.message });
    throw error;
  }
}

/**
 * Get user's event registrations
 * @param {string} userId - User ID
 * @param {Object} filters - Filter options
 * @returns {Promise<Array>} User's registrations
 */
export async function getUserRegistrations(userId, filters = {}) {
  try {
    const db = database.getDatabase();

    let sql = `
      SELECT er.*, e.title, e.start_time, e.end_time, e.event_type, e.location
      FROM event_registrations er
      JOIN events e ON er.event_id = e.id
      WHERE er.user_id = ?
    `;
    const params = [userId];

    if (filters.status) {
      sql += ' AND er.registration_status = ?';
      params.push(filters.status);
    }

    sql += ' ORDER BY e.start_time ASC';

    const registrations = db.prepare(sql).all(...params);

    logger.info('User registrations retrieved', { userId, count: registrations.length });

    return registrations.map(reg => ({
      ...reg,
      location: reg.location ? JSON.parse(reg.location) : null,
    }));
  } catch (error) {
    logger.error('Failed to get user registrations', { error: error.message });
    throw error;
  }
}

/**
 * Get featured/upcoming events
 * @param {number} limit - Number of events to return
 * @returns {Promise<Array>} Featured events
 */
export async function getFeaturedEvents(limit = 5) {
  try {
    const db = database.getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const events = db
      .prepare(`
        SELECT * FROM events
        WHERE status = 'upcoming' AND start_time > ?
        ORDER BY featured DESC, start_time ASC
        LIMIT ?
      `)
      .all(now, limit);

    logger.info('Featured events retrieved', { count: events.length });

    return events.map(event => ({
      ...event,
      tags: event.tags ? JSON.parse(event.tags) : [],
      location: event.location ? JSON.parse(event.location) : null,
    }));
  } catch (error) {
    logger.error('Failed to get featured events', { error: error.message });
    throw error;
  }
}
