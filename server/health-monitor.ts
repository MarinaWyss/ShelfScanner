import { checkSystemHealth, logEvent, LogLevel } from './monitor.js';
import { sendSystemHealthAlert, sendErrorAlert, sendDailySummary } from './notification.js';
import { log } from './simple-logger.js';

// Health monitoring state
let healthMonitorInterval: NodeJS.Timeout | null = null;
let dailySummaryInterval: NodeJS.Timeout | null = null;
let lastHealthStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
const lastAlertTime: Record<string, number> = {};

// Daily statistics tracking
let dailyStats = {
  apiUsage: {} as Record<string, { requests: number; errors: number }>,
  peakMemory: 0,
  avgCpuLoad: 0,
  criticalEvents: 0,
  warningEvents: 0,
  cpuSamples: [] as number[],
  startTime: new Date()
};

/**
 * Reset daily statistics (called at midnight)
 */
function resetDailyStats(): void {
  dailyStats = {
    apiUsage: {},
    peakMemory: 0,
    avgCpuLoad: 0,
    criticalEvents: 0,
    warningEvents: 0,
    cpuSamples: [],
    startTime: new Date()
  };
  log('Daily statistics reset', 'health-monitor');
}

/**
 * Update daily statistics with current system metrics
 */
function updateDailyStats(health: any): void {
  // Track peak memory usage
  if (health.memory?.usedPercentage > dailyStats.peakMemory) {
    dailyStats.peakMemory = health.memory.usedPercentage;
  }
  
  // Track CPU load samples for average calculation
  if (health.cpu?.loadPercentage) {
    dailyStats.cpuSamples.push(health.cpu.loadPercentage);
    dailyStats.avgCpuLoad = dailyStats.cpuSamples.reduce((a, b) => a + b, 0) / dailyStats.cpuSamples.length;
  }
  
  // Count critical and warning events
  if (health.critical?.length > 0) {
    dailyStats.criticalEvents++;
  }
  if (health.warnings?.length > 0) {
    dailyStats.warningEvents++;
  }
}

/**
 * Check if enough time has passed since last alert of this type
 */
function shouldSendAlert(alertType: string, cooldownMinutes = 15): boolean {
  const now = Date.now();
  const lastAlert = lastAlertTime[alertType] || 0;
  const cooldownMs = cooldownMinutes * 60 * 1000;
  
  if (now - lastAlert >= cooldownMs) {
    lastAlertTime[alertType] = now;
    return true;
  }
  return false;
}

/**
 * Perform comprehensive health check and send alerts if needed
 */
async function performHealthCheck(): Promise<void> {
  try {
    const health = await checkSystemHealth();
    
    // Update daily statistics
    updateDailyStats(health);
    
    // Check if health status has changed
    const statusChanged = health.status !== lastHealthStatus;
    
    // Send alerts based on health status
    if (health.status === 'critical') {
      if (statusChanged || shouldSendAlert('critical-health', 30)) {
        log('Sending critical health alert', 'health-monitor');
        await sendSystemHealthAlert('critical', health);
        
        logEvent(LogLevel.CRITICAL, 'Critical system health alert sent', {
          memory: health.memory?.usedPercentage,
          cpu: health.cpu?.loadPercentage,
          disk: health.disk?.usedPercentage
        });
      }
    } else if (health.status === 'warning') {
      if (statusChanged || shouldSendAlert('warning-health', 60)) {
        log('Sending warning health alert', 'health-monitor');
        await sendSystemHealthAlert('warning', health);
        
        logEvent(LogLevel.WARNING, 'Warning system health alert sent', {
          memory: health.memory?.usedPercentage,
          cpu: health.cpu?.loadPercentage,
          disk: health.disk?.usedPercentage
        });
      }
    }
    
    // Check for sustained high resource usage patterns
    if (health.memory?.usedPercentage > 80 && shouldSendAlert('high-memory', 120)) {
      await sendErrorAlert(
        'High Memory Usage Detected',
        `Memory usage has been consistently high: ${health.memory.usedPercentage.toFixed(1)}%`,
        { memoryDetails: health.memory }
      );
    }
    
    // Update last known status
    lastHealthStatus = health.status;
    
  } catch (error) {
    log(`Health check error: ${error}`, 'health-monitor');
    logEvent(LogLevel.ERROR, 'Health monitoring error', { error: error instanceof Error ? error.message : String(error) });
    
    if (shouldSendAlert('health-monitor-error', 60)) {
      await sendErrorAlert(
        'Health Monitor Error',
        'The health monitoring system encountered an error',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }
}

/**
 * Send daily summary report
 */
async function sendDailyReport(): Promise<void> {
  try {
    log('Generating daily summary report', 'health-monitor');
    
    await sendDailySummary({
      ...dailyStats,
      peakMemory: Math.round(dailyStats.peakMemory * 10) / 10,
      avgCpuLoad: Math.round(dailyStats.avgCpuLoad * 10) / 10
    });
    
    logEvent(LogLevel.INFO, 'Daily summary report sent', {
      peakMemory: dailyStats.peakMemory,
      avgCpuLoad: dailyStats.avgCpuLoad,
      criticalEvents: dailyStats.criticalEvents,
      warningEvents: dailyStats.warningEvents
    });
    
    // Reset stats for the new day
    resetDailyStats();
    
  } catch (error) {
    log(`Daily report error: ${error}`, 'health-monitor');
    logEvent(LogLevel.ERROR, 'Daily report generation error', { error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Calculate time until next midnight
 */
function getTimeUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0); // Next midnight
  return midnight.getTime() - now.getTime();
}

/**
 * Start the health monitoring service
 */
export function startHealthMonitoring(): void {
  if (healthMonitorInterval) {
    log('Health monitoring already running', 'health-monitor');
    return;
  }
  
  log('Starting health monitoring service', 'health-monitor');
  logEvent(LogLevel.INFO, 'Health monitoring service started');
  
  // Perform initial health check
  performHealthCheck();
  
  // Set up periodic health checks (every 5 minutes)
  healthMonitorInterval = setInterval(performHealthCheck, 5 * 60 * 1000);
  
  // Set up daily summary report
  // First, schedule for next midnight
  const timeUntilMidnight = getTimeUntilMidnight();
  
  setTimeout(() => {
    // Send daily report at midnight
    sendDailyReport();
    
    // Then set up daily interval
    dailySummaryInterval = setInterval(sendDailyReport, 24 * 60 * 60 * 1000);
  }, timeUntilMidnight);
  
  log('Health monitoring scheduled: checks every 5 minutes, daily reports at midnight', 'health-monitor');
}

/**
 * Stop the health monitoring service
 */
export function stopHealthMonitoring(): void {
  if (healthMonitorInterval) {
    clearInterval(healthMonitorInterval);
    healthMonitorInterval = null;
    log('Health monitoring stopped', 'health-monitor');
  }
  
  if (dailySummaryInterval) {
    clearInterval(dailySummaryInterval);
    dailySummaryInterval = null;
    log('Daily summary reporting stopped', 'health-monitor');
  }
  
  logEvent(LogLevel.INFO, 'Health monitoring service stopped');
}

/**
 * Get current monitoring status
 */
export function getMonitoringStatus(): {
  isRunning: boolean;
  lastHealthStatus: string;
  dailyStats: any;
} {
  return {
    isRunning: healthMonitorInterval !== null,
    lastHealthStatus,
    dailyStats
  };
}

/**
 * Manual trigger for health check (for testing or immediate check)
 */
export async function triggerHealthCheck(): Promise<any> {
  log('Manual health check triggered', 'health-monitor');
  await performHealthCheck();
  return await checkSystemHealth();
}

/**
 * Manual trigger for daily report (for testing)
 */
export async function triggerDailyReport(): Promise<void> {
  log('Manual daily report triggered', 'health-monitor');
  await sendDailyReport();
} 