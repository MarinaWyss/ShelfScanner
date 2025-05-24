/**
 * Utility for monitoring OpenAI API usage
 */
import { log } from '../vite';
import { logEvent, LogLevel } from '../monitor';
import { rateLimiter } from '../rate-limiter';

// Track API usage for monitoring
const apiUsage: Record<string, {
  successCount: number;
  lastSuccess: Date;
  deviceIds: Set<string>;
}> = {
  'openai': {
    successCount: 0,
    lastSuccess: new Date(),
    deviceIds: new Set<string>()
  }
};

/**
 * Track successful API usage
 * @param apiName Name of the API (e.g., 'openai')
 * @param deviceId Optional device ID of the user
 */
export function trackApiSuccess(
  apiName: string,
  deviceId?: string
): void {
  // Initialize if not exists
  if (!apiUsage[apiName]) {
    apiUsage[apiName] = {
      successCount: 0,
      lastSuccess: new Date(),
      deviceIds: new Set<string>()
    };
  }
  
  // Update usage tracking
  apiUsage[apiName].successCount++;
  apiUsage[apiName].lastSuccess = new Date();
  
  // Add user to device list if provided
  if (deviceId) {
    apiUsage[apiName].deviceIds.add(deviceId);
  }
  
  // Log usage at significant thresholds
  if (apiUsage[apiName].successCount % 10 === 0) {
    log(`${apiName.toUpperCase()} API: ${apiUsage[apiName].successCount} successful calls`, 'api-monitoring');
    logEvent(LogLevel.INFO, `${apiName.toUpperCase()} API usage milestone`, {
      callCount: apiUsage[apiName].successCount,
      uniqueUsers: apiUsage[apiName].deviceIds.size
    });
  }
}

/**
 * Get current API usage statistics
 * @returns Object with API usage stats
 */
export function getApiUsageStats(): Record<string, any> {
  const stats: Record<string, any> = {};
  const rateLimits = rateLimiter.getUsageStats();
  
  for (const [api, data] of Object.entries(apiUsage)) {
    stats[api] = {
      successCount: data.successCount,
      lastSuccess: data.lastSuccess,
      uniqueUsers: data.deviceIds.size,
    };
    
    // Add rate limiter data if available
    if (rateLimits[api]) {
      stats[api].dailyUsage = rateLimits[api].dailyUsage;
      stats[api].dailyLimit = rateLimits[api].dailyLimit;
      stats[api].windowUsage = rateLimits[api].windowUsage;
      stats[api].windowSeconds = rateLimits[api].windowSeconds;
    }
  }
  
  return stats;
}