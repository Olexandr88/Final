import winston from 'winston';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom log format
const logFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;

  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }

  return msg;
});

// TEMPORARY FIX: Console-only logging to avoid Winston file transport crashes
// File logging is disabled system-wide due to "write after end" errors
const isAgent = process.argv[1]?.includes('/agents/') || process.argv[1]?.includes('\\agents\\');
const isBridge = process.argv[1]?.includes('ai-bridge');

// Create logger instance - console only (file logging disabled)
const transports = [
  new winston.transports.Console({
    format: combine(colorize(), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFormat),
    handleExceptions: true,
    handleRejections: true,
    silent: false,
  }),
];

// FILE LOGGING DISABLED - Winston file transport causes crashes
// This is a temporary fix until Winston is replaced or properly debugged
if (false && !isAgent) {
  const logsDir = path.join(process.cwd(), 'logs');
  try {
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Add file transports for main processes
    transports.push(
      new winston.transports.File({
        filename: path.join(logsDir, 'error.log'),
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
        handleExceptions: false,
        handleRejections: false,
      }),
      new winston.transports.File({
        filename: path.join(logsDir, 'combined.log'),
        maxsize: 5242880, // 5MB
        maxFiles: 5,
        handleExceptions: false,
        handleRejections: false,
      })
    );
  } catch (error) {
    // File logging disabled, continue with console only
  }
}

// Create logger instance
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(errors({ stack: true }), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFormat),
  transports,
  exitOnError: false,
});

// Suppress all logger errors to prevent crashes
logger.on('error', () => {
  // Silently ignore - console transport will still work
});

export default logger;
