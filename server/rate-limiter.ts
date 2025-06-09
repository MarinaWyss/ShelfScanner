import { log } from './vite';
import { logApiUsage, LogLevel, logEvent } from './monitor';

/**
 * Simple in-memory rate limiter to control API usage
 * Enhanced with monitoring and alerting capabilities
 */
export class RateLimiter {
  private requestCounts: Map<string, number> = new Map();
  private timestamps: Map<string, number> = new Map();
  private dailyLimits: Map<string, number> = new Map();
  private dailyUsage: Map<string, number> = new Map();
  private lastResetDay: Map<string, number> = new Map();
  private alertsSent: Map<string, boolean> = new Map();
  
  constructor() {
    // Set rate limits based on expected usage of 100 users per day, each scanning 5 shelves
    this.setLimit('openai', 60, 60); // Updated: 60 requests per minute for OpenAI (up from 10)
    this.setDailyLimit('openai', 15000); // Updated: 15,000 requests per day for OpenAI (up from 1000)
    
    this.setLimit('google-books', 100, 60); // Maintained: 100 requests per minute for Google Books
    this.setDailyLimit('google-books', 7500); // Updated: 7,500 requests per day for Google Books (up from 1000)
    
    this.setLimit('google-vision', 20, 60); // Maintained: 20 requests per minute for Google Vision
    this.setDailyLimit('google-vision', 1000); // Restored to original 1000 requests per day for Google Vision
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
   * Enhanced with monitoring and alerting
   * @param apiName API identifier
   * @param windowSeconds Time window in seconds
   * @returns boolean indicating if the request is allowed
   */
  public isAllowed(apiName: string, windowSeconds = 60): boolean {
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
    const limit = apiName === 'openai' ? 60 : 
                 apiName === 'google-vision' ? 20 : 100; // Get appropriate limits
    
    // Check daily limit
    const dailyUsage = this.dailyUsage.get(apiName) || 0;
    const dailyLimit = this.dailyLimits.get(apiName) || Infinity;
    
    const isWithinRateLimit = currentCount < limit;
    const isWithinDailyLimit = dailyUsage < dailyLimit;
    
    // Check if we need to send alerts
    this.checkForAlerts(apiName, currentCount, limit, dailyUsage, dailyLimit);
    
    if (!isWithinRateLimit) {
      log(`Rate limit exceeded for ${apiName}: ${currentCount}/${limit} requests within ${windowSeconds}s`, 'rate-limiter');
      logEvent(LogLevel.ERROR, `Rate limit exceeded for ${apiName}: ${currentCount}/${limit} requests within ${windowSeconds}s`);
    }
    
    if (!isWithinDailyLimit) {
      log(`Daily limit exceeded for ${apiName}: ${dailyUsage}/${dailyLimit} requests`, 'rate-limiter');
      logEvent(LogLevel.ERROR, `Daily limit exceeded for ${apiName}: ${dailyUsage}/${dailyLimit} requests`);
    }
    
    return isWithinRateLimit && isWithinDailyLimit;
  }
  
  /**
   * Check if alerts should be logged based on usage thresholds
   * @param apiName API name
   * @param currentCount Current count in window
   * @param limit Window limit
   * @param dailyUsage Daily usage
   * @param dailyLimit Daily limit
   */
  private checkForAlerts(
    apiName: string, 
    currentCount: number, 
    limit: number, 
    dailyUsage: number, 
    dailyLimit: number
  ): void {
    const usagePercent = (dailyUsage / dailyLimit) * 100;
    const _windowPercent = (currentCount / limit) * 100;
    const alertKey = `${apiName}_alert`;
    
    // Check if we've already sent an alert for this API today
    const alreadySentAlert = this.alertsSent.get(alertKey) || false;
    
    // Alert on high daily usage (only log once per day)
    if (usagePercent >= 80 && !alreadySentAlert) {
      // Log the high usage with proper log level
      logApiUsage(apiName, dailyUsage, dailyLimit, { type: 'daily' });
      
      // Log a critical event if usage is very high
      if (usagePercent >= 90) {
        logEvent(
          LogLevel.CRITICAL, 
          `${apiName} API quota is nearly exhausted (${usagePercent.toFixed(1)}%)`,
          { apiName, dailyUsage, dailyLimit, usagePercent }
        );
      }
      
      // Mark that we've alerted for this API today
      this.alertsSent.set(alertKey, true);
    }
    
    // Reset alert flag at midnight
    const currentDay = new Date().getDate();
    const lastAlertDay = this.lastResetDay.get(apiName) || currentDay;
    if (currentDay !== lastAlertDay) {
      this.alertsSent.set(alertKey, false);
    }
  }
  
  /**
   * Increment the count for an API after successful usage
   * @param apiName API identifier
   * @param windowSeconds Time window in seconds
   */
  public increment(apiName: string, windowSeconds = 60): void {
    this.checkAndResetDaily(apiName);
    
    const key = `${apiName}_${windowSeconds}`;
    
    // Increment request count
    const currentCount = this.requestCounts.get(key) || 0;
    this.requestCounts.set(key, currentCount + 1);
    
    // Increment daily usage
    const dailyUsage = this.dailyUsage.get(apiName) || 0;
    this.dailyUsage.set(apiName, dailyUsage + 1);
    
    log(`API call to ${apiName}: ${currentCount + 1} requests in current window, daily total: ${dailyUsage + 1}`, 'rate-limiter');
    
    // Check if we need to log high usage warning
    const limit = apiName === 'openai' ? 60 : 
                 apiName === 'google-vision' ? 20 : 100;
    const dailyLimit = this.dailyLimits.get(apiName) || Infinity;
    
    // Only log when usage reaches significant thresholds
    if (dailyUsage + 1 >= dailyLimit * 0.5 && (dailyUsage + 1) % 5 === 0) {
      // Log usage milestone every 5 requests once we're past 50%
      logApiUsage(apiName, dailyUsage + 1, dailyLimit, { 
        windowUsage: currentCount + 1,
        windowLimit: limit
      });
    }
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
        withinLimits: count < (apiName === 'openai' ? 60 : apiName === 'google-vision' ? 20 : 100) && dailyUsage < dailyLimit
      };
    }
    
    return stats;
  }
}

// Create a singleton instance
export const rateLimiter = new RateLimiter();