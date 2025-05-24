/**
 * Utility for monitoring OpenAI API failures and providing alerts
 */
import { log } from '../vite';
import { logEvent, LogLevel } from '../monitor';
import { sendErrorAlert } from '../notification';

// Track API failure counts for monitoring
const apiFailures: Record<string, {
  count: number;
  lastFailure: Date;
  alertSent: boolean;
  users: Set<string>;
}> = {
  'openai': {
    count: 0,
    lastFailure: new Date(),
    alertSent: false,
    users: new Set<string>()
  }
};

// Reset counters daily
setInterval(() => {
  for (const key in apiFailures) {
    apiFailures[key].count = 0;
    apiFailures[key].alertSent = false;
    apiFailures[key].users.clear();
  }
}, 24 * 60 * 60 * 1000); // 24 hours

/**
 * Track API failures and trigger alerts when needed
 * @param apiName Name of the API (e.g., 'openai')
 * @param error Error object or message
 * @param deviceId Optional device ID of affected user
 * @returns True if this is a critical failure requiring attention
 */
export function trackApiFailure(
  apiName: string, 
  error: Error | string,
  deviceId?: string
): boolean {
  // Initialize if not exists
  if (!apiFailures[apiName]) {
    apiFailures[apiName] = {
      count: 0,
      lastFailure: new Date(),
      alertSent: false,
      users: new Set<string>()
    };
  }
  
  // Update failure tracking
  apiFailures[apiName].count++;
  apiFailures[apiName].lastFailure = new Date();
  
  // Add user to affected list if provided
  if (deviceId) {
    apiFailures[apiName].users.add(deviceId);
  }
  
  const errorMessage = error instanceof Error ? error.message : error;
  
  // Log the failure
  log(`${apiName.toUpperCase()} API failure: ${errorMessage}`, 'api-error');
  
  // Determine if this is a critical failure based on:
  // 1. Multiple failures in a short period
  // 2. Multiple users affected
  const isCritical = apiFailures[apiName].count >= 5 || apiFailures[apiName].users.size >= 3;
  
  // For critical failures, create system alerts but only once per day
  if (isCritical && !apiFailures[apiName].alertSent) {
    logEvent(LogLevel.CRITICAL, `Critical ${apiName.toUpperCase()} API failures detected`, {
      failureCount: apiFailures[apiName].count,
      affectedUsers: apiFailures[apiName].users.size,
      lastError: errorMessage
    });
    
    // Send admin alert
    sendErrorAlert(
      `Critical ${apiName.toUpperCase()} API Failures`,
      `Multiple failures detected affecting ${apiFailures[apiName].users.size} users`,
      {
        failureCount: apiFailures[apiName].count,
        lastError: errorMessage,
        lastFailureTime: apiFailures[apiName].lastFailure
      }
    ).catch(error => {
      log(`Failed to send alert email: ${error instanceof Error ? error.message : error}`, 'notification-error');
    });
    
    // Mark that we've sent an alert
    apiFailures[apiName].alertSent = true;
  }
  
  return isCritical;
}

/**
 * Get current API failure statistics
 * @returns Object with API failure stats
 */
export function getApiFailureStats(): Record<string, any> {
  const stats: Record<string, any> = {};
  
  for (const [api, data] of Object.entries(apiFailures)) {
    stats[api] = {
      failureCount: data.count,
      lastFailure: data.lastFailure,
      affectedUsers: data.users.size,
      isCritical: data.count >= 5 || data.users.size >= 3
    };
  }
  
  return stats;
}