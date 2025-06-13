import { log } from './simple-logger.js';
import { logError, logWarning, logInfo, logRateLimit } from './simple-error-logger.js';
import { db } from './db.js';
import { rateLimits } from '../shared/schema.js';
import { eq, and, sql } from 'drizzle-orm';

/**
 * Database-based rate limiter for serverless environments
 * Uses PostgreSQL to persist rate limiting data across function invocations
 */
export class DatabaseRateLimiter {
  private readonly limits = {
    'openai': { perMinute: 60, perDay: 15000 },
    'google-books': { perMinute: 100, perDay: 7500 },
    'google-vision': { perMinute: 20, perDay: 1000 },
    'open-library': { perMinute: 60, perDay: 1000 }
  };

  /**
   * Check if a request to the API is allowed based on rate limits
   * @param apiName API identifier
   * @param windowSeconds Time window in seconds (default: 60)
   * @returns boolean indicating if the request is allowed
   */
  public async isAllowed(apiName: string, windowSeconds = 60): Promise<boolean> {
    try {
      const now = new Date();
      const windowStart = new Date(Math.floor(now.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000);
      const dailyDate = now.toISOString().split('T')[0]; // YYYY-MM-DD format
      
      const limits = this.limits[apiName as keyof typeof this.limits];
      if (!limits) {
        log(`Unknown API: ${apiName}, allowing request`, 'rate-limiter');
        return true;
      }

      // Get or create current window and daily records
      const existing = await db
        .select()
        .from(rateLimits)
        .where(
          and(
            eq(rateLimits.apiName, apiName),
            eq(rateLimits.windowStart, windowStart),
            eq(rateLimits.windowSeconds, windowSeconds)
          )
        )
        .limit(1);

      const dailyRecord = await db
        .select()
        .from(rateLimits)
        .where(
          and(
            eq(rateLimits.apiName, apiName),
            eq(rateLimits.dailyDate, dailyDate)
          )
        )
        .limit(1);

      const currentWindowCount = existing[0]?.requestCount || 0;
      const currentDailyCount = dailyRecord[0]?.dailyCount || 0;

      // Check limits
      const withinWindowLimit = currentWindowCount < limits.perMinute;
      const withinDailyLimit = currentDailyCount < limits.perDay;

      if (!withinWindowLimit) {
        logRateLimit(apiName, 'window', limits.perMinute, currentWindowCount);
      }

      if (!withinDailyLimit) {
        logRateLimit(apiName, 'daily', limits.perDay, currentDailyCount);
      }

      // Check for alerts
      this.checkForAlerts(apiName, currentWindowCount, limits.perMinute, currentDailyCount, limits.perDay);

      return withinWindowLimit && withinDailyLimit;
    } catch (error) {
      log(`Rate limiter error: ${error instanceof Error ? error.message : String(error)}`, 'rate-limiter');
      // On error, allow the request (fail open)
      return true;
    }
  }

  /**
   * Increment the count for an API after successful usage
   * @param apiName API identifier
   * @param windowSeconds Time window in seconds (default: 60)
   */
  public async increment(apiName: string, windowSeconds = 60): Promise<void> {
    try {
      const now = new Date();
      const windowStart = new Date(Math.floor(now.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000);
      const dailyDate = now.toISOString().split('T')[0]; // YYYY-MM-DD format

      // Use PostgreSQL's UPSERT (INSERT ... ON CONFLICT) for atomic increment
      await db
        .insert(rateLimits)
        .values({
          apiName,
          windowStart,
          windowSeconds,
          requestCount: 1,
          dailyDate,
          dailyCount: 1,
        })
        .onConflictDoUpdate({
          target: [rateLimits.apiName, rateLimits.windowStart, rateLimits.windowSeconds],
          set: {
            requestCount: sql`${rateLimits.requestCount} + 1`,
            updatedAt: new Date(),
          },
        });

      // Separate upsert for daily count
      await db
        .insert(rateLimits)
        .values({
          apiName,
          windowStart: now, // Use current time for daily records
          windowSeconds: 86400, // 24 hours in seconds
          requestCount: 0,
          dailyDate,
          dailyCount: 1,
        })
        .onConflictDoUpdate({
          target: [rateLimits.apiName, rateLimits.dailyDate],
          set: {
            dailyCount: sql`${rateLimits.dailyCount} + 1`,
            updatedAt: new Date(),
          },
        });

      log(`API call to ${apiName}: incremented counters`, 'rate-limiter');
    } catch (error) {
      log(`Rate limiter increment error: ${error instanceof Error ? error.message : String(error)}`, 'rate-limiter');
    }
  }

  /**
   * Check if alerts should be logged based on usage thresholds
   */
  private checkForAlerts(
    apiName: string, 
    currentCount: number, 
    limit: number, 
    dailyUsage: number, 
    dailyLimit: number
  ): void {
    const usagePercent = (dailyUsage / dailyLimit) * 100;

    // Alert on high daily usage
    if (usagePercent >= 80) {
      logWarning(`High API usage for ${apiName}: ${usagePercent.toFixed(1)}%`, {
        api: apiName,
        current: dailyUsage,
        limit: dailyLimit,
        metadata: { type: 'daily', usagePercent }
      });

      if (usagePercent >= 90) {
        logError(`${apiName} API quota is nearly exhausted (${usagePercent.toFixed(1)}%)`, undefined, {
          api: apiName,
          current: dailyUsage,
          limit: dailyLimit,
          metadata: { usagePercent, critical: true }
        });
      }
    }
  }

  /**
   * Get current API usage statistics
   */
  public async getUsageStats(): Promise<Record<string, any>> {
    try {
      const stats: Record<string, any> = {};
      const today = new Date().toISOString().split('T')[0];

      for (const [apiName, limits] of Object.entries(this.limits)) {
        // Get current window usage
        const now = new Date();
        const windowStart = new Date(Math.floor(now.getTime() / 60000) * 60000); // 1-minute window
        
        const windowRecord = await db
          .select()
          .from(rateLimits)
          .where(
            and(
              eq(rateLimits.apiName, apiName),
              eq(rateLimits.windowStart, windowStart),
              eq(rateLimits.windowSeconds, 60)
            )
          )
          .limit(1);

        // Get daily usage
        const dailyRecord = await db
          .select()
          .from(rateLimits)
          .where(
            and(
              eq(rateLimits.apiName, apiName),
              eq(rateLimits.dailyDate, today)
            )
          )
          .limit(1);

        const windowUsage = windowRecord[0]?.requestCount || 0;
        const dailyUsage = dailyRecord[0]?.dailyCount || 0;

        stats[apiName] = {
          windowUsage,
          windowSeconds: 60,
          dailyUsage,
          dailyLimit: limits.perDay,
          withinLimits: windowUsage < limits.perMinute && dailyUsage < limits.perDay
        };
      }

      return stats;
    } catch (error) {
      log(`Error getting usage stats: ${error instanceof Error ? error.message : String(error)}`, 'rate-limiter');
      return {};
    }
  }

  /**
   * Clean up old rate limiting records (optional maintenance)
   */
  public async cleanup(): Promise<void> {
    try {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      await db
        .delete(rateLimits)
        .where(sql`${rateLimits.windowStart} < ${threeDaysAgo}`);

      log('Cleaned up old rate limiting records', 'rate-limiter');
    } catch (error) {
      log(`Cleanup error: ${error instanceof Error ? error.message : String(error)}`, 'rate-limiter');
    }
  }
}

// Create a singleton instance
export const rateLimiter = new DatabaseRateLimiter();