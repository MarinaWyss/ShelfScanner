import winston from 'winston';
import 'winston-daily-rotate-file';
import path from 'path';

// Define log levels and colors
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

// Add colors to Winston
winston.addColors(colors);

// Create logs directory if it doesn't exist
// Use import.meta.url to get the current file URL in ESM
const currentFilePath = new URL(import.meta.url).pathname;
const currentDir = path.dirname(currentFilePath);
const logsDir = path.join(currentDir, '../logs');

// Define log formats
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} [${info.level}]: ${info.message}`
  )
);

// Create a rotating file transport for errors
const fileRotateTransport = new winston.transports.DailyRotateFile({
  filename: path.join(logsDir, 'app-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  level: 'info'
});

// Create a separate file for error logs
const errorFileRotateTransport = new winston.transports.DailyRotateFile({
  filename: path.join(logsDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  level: 'error'
});

// Create the logger
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'http',
  levels,
  format,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    fileRotateTransport,
    errorFileRotateTransport
  ],
});

// Export the logger and utility functions
export { logger };

// Function to log and optionally alert on critical events
export function logCritical(message: string, alertAdmin: boolean = false, metadata?: Record<string, any>) {
  logger.error(`CRITICAL: ${message}`, metadata);
  
  // Flag to indicate if alert was sent, to prevent duplicate alerts
  let alertSent = false;
  
  if (alertAdmin && !alertSent) {
    // This will be implemented in notification.ts
    // Will be triggered here to send email alert
    alertSent = true;
  }
  
  return alertSent;
}

// Special function to monitor API rate limits
export function logRateLimit(api: string, currentUsage: number, limit: number, metadata?: Record<string, any>) {
  const usagePercentage = (currentUsage / limit) * 100;
  
  // Determine log level based on usage percentage
  if (usagePercentage >= 90) {
    logger.error(`CRITICAL: ${api} API at ${usagePercentage.toFixed(1)}% of limit (${currentUsage}/${limit})`, metadata);
    return true; // Indicate this should trigger an alert
  } else if (usagePercentage >= 80) {
    logger.warn(`WARNING: ${api} API at ${usagePercentage.toFixed(1)}% of limit (${currentUsage}/${limit})`, metadata);
    return true; // Also alert on warning level
  } else if (usagePercentage >= 50) {
    logger.info(`INFO: ${api} API at ${usagePercentage.toFixed(1)}% of limit (${currentUsage}/${limit})`, metadata);
  }
  
  return false;
}