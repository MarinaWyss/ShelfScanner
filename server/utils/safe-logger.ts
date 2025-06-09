import { log } from '../vite';

/**
 * Sanitize a device ID for logging - only show first 4 and last 4 characters
 * @param deviceId The device ID to sanitize
 * @returns Sanitized device ID safe for logging
 */
export function sanitizeDeviceId(deviceId: string): string {
  if (!deviceId || deviceId.length < 8) {
    return '****';
  }
  return `${deviceId.slice(0, 4)}...${deviceId.slice(-4)}`;
}

/**
 * Sanitize user preferences for logging - remove personal data
 * @param preferences User preferences object
 * @returns Sanitized preferences safe for logging
 */
export function sanitizePreferences(preferences: any): any {
  if (!preferences) {return null;}
  
  return {
    genresCount: preferences.genres?.length || 0,
    authorsCount: preferences.authors?.length || 0,
    hasGoodreadsData: !!(preferences.goodreadsData?.length > 0),
    goodreadsBookCount: preferences.goodreadsData?.length || 0
  };
}

/**
 * Sanitize book data for logging - keep titles/authors but remove user-specific data
 * @param books Array of books
 * @returns Sanitized book data safe for logging
 */
export function sanitizeBooks(books: any[]): any {
  if (!books || !Array.isArray(books)) {return [];}
  
  return books.map(book => ({
    title: book.title || 'Unknown',
    author: book.author || 'Unknown',
    hasRating: !!book.rating,
    hasSummary: !!book.summary,
    categories: book.categories?.length || 0
  }));
}

/**
 * Safe logging function that automatically sanitizes sensitive data
 * @param message Log message
 * @param source Log source identifier
 * @param data Optional data object to log (will be sanitized)
 */
export function safeLog(message: string, source = 'app', data?: any): void {
  let sanitizedData = data;
  
  if (data) {
    // Deep clone to avoid modifying original
    sanitizedData = JSON.parse(JSON.stringify(data));
    
    // Sanitize common sensitive fields
    if (sanitizedData.deviceId) {
      sanitizedData.deviceId = sanitizeDeviceId(sanitizedData.deviceId);
    }
    
    if (sanitizedData.preferences) {
      sanitizedData.preferences = sanitizePreferences(sanitizedData.preferences);
    }
    
    if (sanitizedData.books) {
      sanitizedData.books = sanitizeBooks(sanitizedData.books);
    }
    
    // Remove any goodreads personal data
    if (sanitizedData.goodreadsData) {
      sanitizedData.goodreadsData = `[${sanitizedData.goodreadsData.length} entries]`;
    }
  }
  
  if (sanitizedData) {
    log(`${message} | Data: ${JSON.stringify(sanitizedData)}`, source);
  } else {
    log(message, source);
  }
}

/**
 * Log device operations safely
 */
export function logDeviceOperation(operation: string, deviceId: string, additionalInfo?: string): void {
  const sanitizedId = sanitizeDeviceId(deviceId);
  const message = `${operation} for device ${sanitizedId}${additionalInfo ? ` - ${additionalInfo}` : ''}`;
  log(message, 'device');
}

/**
 * Log book operations safely
 */
export function logBookOperation(operation: string, title: string, author?: string, additionalInfo?: string): void {
  const message = `${operation}: "${title}"${author ? ` by ${author}` : ''}${additionalInfo ? ` - ${additionalInfo}` : ''}`;
  log(message, 'books');
}

/**
 * Log API operations safely
 */
export function logApiOperation(operation: string, apiName: string, details?: any): void {
  const sanitizedDetails = details ? {
    requestCount: details.requestCount,
    success: details.success,
    duration: details.duration,
    // Remove any API keys or sensitive data
    ...(details.bookCount && { bookCount: details.bookCount }),
    ...(details.hasDeviceId && { hasDeviceId: true })
  } : undefined;
  
  safeLog(`${operation} - ${apiName}`, 'api', sanitizedDetails);
} 