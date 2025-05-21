import { log } from './vite';

/**
 * Simple in-memory rate limiter to control API usage
 */
export class RateLimiter {
  private requestCounts: Map<string, number> = new Map();
  private timestamps: Map<string, number> = new Map();
  private dailyLimits: Map<string, number> = new Map();
  private dailyUsage: Map<string, number> = new Map();
  private lastResetDay: Map<string, number> = new Map();
  
  constructor() {
    // Set default rate limits
    this.setLimit('openai', 10, 60); // Default: 10 requests per minute for OpenAI
    this.setDailyLimit('openai', 1000); // Increased to 1000 requests per day for OpenAI
    
    this.setLimit('google-books', 100, 60); // 100 requests per minute for Google Books
    this.setDailyLimit('google-books', 1000); // 1000 requests per day for Google Books
  }
  
  /**
   * Set rate limit for a specific API
   * @param apiName API identifier
   * @param limit Number of requests allowed
   * @param windowSeconds Time window in seconds
   */
  public setLimit(apiName: string, limit: number, windowSeconds: number): void {
    const key = `${apiName}_${windowSeconds}`;
    this.requestCounts.set(key, 0);
    this.timestamps.set(key, Date.now());
    this.dailyLimits.set(apiName, 0);
  }
  
  /**
   * Set daily limit for a specific API
   * @param apiName API identifier
   * @param limit Number of requests allowed per day
   */
  public setDailyLimit(apiName: string, limit: number): void {
    this.dailyLimits.set(apiName, limit);
    this.dailyUsage.set(apiName, 0);
    this.lastResetDay.set(apiName, new Date().getDate());
  }
  
  /**
   * Check if a request to the API is allowed based on rate limits
   * @param apiName API identifier
   * @param windowSeconds Time window in seconds
   * @returns boolean indicating if the request is allowed
   */
  public isAllowed(apiName: string, windowSeconds: number = 60): boolean {
    this.checkAndResetDaily(apiName);
    
    const key = `${apiName}_${windowSeconds}`;
    
    // Initialize if not exists
    if (!this.requestCounts.has(key)) {
      this.requestCounts.set(key, 0);
      this.timestamps.set(key, Date.now());
    }
    
    const currentTime = Date.now();
    const windowMs = windowSeconds * 1000;
    const windowStart = currentTime - windowMs;
    
    // Reset counter if window has passed
    if (this.timestamps.get(key)! < windowStart) {
      this.requestCounts.set(key, 0);
      this.timestamps.set(key, currentTime);
    }
    
    // Check rate limit
    const currentCount = this.requestCounts.get(key) || 0;
    const limit = apiName === 'openai' ? 10 : 100; // Default limits if not set
    
    // Check daily limit
    const dailyUsage = this.dailyUsage.get(apiName) || 0;
    const dailyLimit = this.dailyLimits.get(apiName) || Infinity;
    
    const isWithinRateLimit = currentCount < limit;
    const isWithinDailyLimit = dailyUsage < dailyLimit;
    
    if (!isWithinRateLimit) {
      log(`Rate limit exceeded for ${apiName}: ${currentCount}/${limit} requests within ${windowSeconds}s`, 'rate-limiter');
    }
    
    if (!isWithinDailyLimit) {
      log(`Daily limit exceeded for ${apiName}: ${dailyUsage}/${dailyLimit} requests`, 'rate-limiter');
    }
    
    return isWithinRateLimit && isWithinDailyLimit;
  }
  
  /**
   * Increment the count for an API after successful usage
   * @param apiName API identifier
   * @param windowSeconds Time window in seconds
   */
  public increment(apiName: string, windowSeconds: number = 60): void {
    this.checkAndResetDaily(apiName);
    
    const key = `${apiName}_${windowSeconds}`;
    
    // Increment request count
    const currentCount = this.requestCounts.get(key) || 0;
    this.requestCounts.set(key, currentCount + 1);
    
    // Increment daily usage
    const dailyUsage = this.dailyUsage.get(apiName) || 0;
    this.dailyUsage.set(apiName, dailyUsage + 1);
    
    log(`API call to ${apiName}: ${currentCount + 1} requests in current window, daily total: ${dailyUsage + 1}`, 'rate-limiter');
  }
  
  /**
   * Reset daily counters if day has changed
   * @param apiName API identifier
   */
  private checkAndResetDaily(apiName: string): void {
    const currentDay = new Date().getDate();
    const lastResetDay = this.lastResetDay.get(apiName) || currentDay;
    
    if (currentDay !== lastResetDay) {
      this.dailyUsage.set(apiName, 0);
      this.lastResetDay.set(apiName, currentDay);
      log(`Reset daily usage counter for ${apiName}`, 'rate-limiter');
    }
  }
  
  /**
   * Get current API usage statistics
   * @returns Object with usage statistics
   */
  public getUsageStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    // Manually get keys and iterate to avoid TypeScript iterator issues
    const keys = Array.from(this.requestCounts.keys());
    
    for (const key of keys) {
      const count = this.requestCounts.get(key) || 0;
      const [apiName, windowSeconds] = key.split('_');
      const dailyUsage = this.dailyUsage.get(apiName) || 0;
      const dailyLimit = this.dailyLimits.get(apiName) || Infinity;
      
      stats[apiName] = {
        windowUsage: count,
        windowSeconds: parseInt(windowSeconds),
        dailyUsage,
        dailyLimit,
        withinLimits: count < (apiName === 'openai' ? 10 : 100) && dailyUsage < dailyLimit
      };
    }
    
    return stats;
  }
}

// Create a singleton instance
export const rateLimiter = new RateLimiter();