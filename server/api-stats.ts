import { rateLimiter } from './rate-limiter';

/**
 * Returns the current status of API rate limits and usage
 * This is used for monitoring purposes
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