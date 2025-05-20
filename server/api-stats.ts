import { log } from './vite';
import { rateLimiter } from './rate-limiter';

/**
 * Returns the current status of API rate limits and usage
 */
export function getApiUsageStats(): Record<string, any> {
  return {
    timestamp: new Date().toISOString(),
    stats: rateLimiter.getUsageStats(),
    // Include environment configuration status (without leaking actual API keys)
    config: {
      openaiEnabled: process.env.ENABLE_OPENAI !== 'false',
      openaiConfigured: !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 5, 
      googleVisionConfigured: !!process.env.GOOGLE_VISION_API_KEY
    }
  };
}

/**
 * Adjusts the rate limit for a specific API
 */
export function setApiRateLimit(apiName: string, limit: number, windowSeconds = 60): boolean {
  try {
    log(`Setting rate limit for ${apiName} to ${limit} requests per ${windowSeconds} seconds`, 'api-stats');
    rateLimiter.setLimit(apiName, limit, windowSeconds);
    return true;
  } catch (error) {
    log(`Error setting rate limit: ${error instanceof Error ? error.message : String(error)}`, 'api-stats');
    return false;
  }
}

/**
 * Sets the daily limit for a specific API
 */
export function setApiDailyLimit(apiName: string, limit: number): boolean {
  try {
    log(`Setting daily limit for ${apiName} to ${limit} requests`, 'api-stats');
    rateLimiter.setDailyLimit(apiName, limit);
    return true;
  } catch (error) {
    log(`Error setting daily limit: ${error instanceof Error ? error.message : String(error)}`, 'api-stats');
    return false;
  }
}