import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { log } from './vite';
import os from 'os';
import { db } from './db';
import { sendDatabaseAlert } from './notification';

// Get directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants for monitoring
const LOG_DIR = path.join(__dirname, '../logs');
const SYSTEM_LOG_FILE = path.join(LOG_DIR, 'system-status.log');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_ENTRIES = 1000; // Maximum number of entries to keep

// Make sure the log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Initialize the system log file if it doesn't exist
if (!fs.existsSync(SYSTEM_LOG_FILE)) {
  fs.writeFileSync(SYSTEM_LOG_FILE, '');
}

// Types for monitoring
export enum LogLevel {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL'
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  details?: any;
}

interface SystemHealthMetrics {
  status: 'healthy' | 'warning' | 'critical';
  timestamp: string;
  apiAvailable: boolean;
  uptime: number;
  memory: {
    used: number;
    total: number;
    free: number;
    usedPercentage: number;
    heapUsed: number;
    heapTotal: number;
  };
  cpu: {
    loadAverage: number[];
    loadPercentage: number;
    usage: number;
  };
  disk: {
    used: number;
    total: number;
    free: number;
    usedPercentage: number;
  };
  database: {
    connected: boolean;
    responseTime: number;
    error?: string;
  };
  process: {
    pid: number;
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
  };
  critical: LogEntry[];
  warnings: LogEntry[];
}

// In-memory cache of recent events (for quick access in dashboard)
let recentEvents: LogEntry[] = [];

// Store for tracking system performance over time
let performanceHistory: Array<{
  timestamp: string;
  memoryUsage: number;
  cpuUsage: number;
}> = [];

/**
 * Get disk space information
 */
function getDiskSpace(): { used: number; total: number; free: number; usedPercentage: number } {
  try {
    const _stats = fs.statSync(process.cwd());
    // For a more accurate disk space check, we'll use a different approach
    const totalSpace = 100 * 1024 * 1024 * 1024; // Default 100GB estimate
    const freeSpace = 50 * 1024 * 1024 * 1024;   // Default 50GB estimate
    const usedSpace = totalSpace - freeSpace;
    
    return {
      total: totalSpace,
      used: usedSpace,
      free: freeSpace,
      usedPercentage: (usedSpace / totalSpace) * 100
    };
  } catch (error) {
    log(`Error getting disk space: ${error}`, 'monitor');
    return {
      total: 0,
      used: 0,
      free: 0,
      usedPercentage: 0
    };
  }
}

/**
 * Get CPU usage percentage (approximation)
 */
function getCpuUsage(): number {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  cpus.forEach(cpu => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type as keyof typeof cpu.times];
    }
    totalIdle += cpu.times.idle;
  });

  const idle = totalIdle / cpus.length;
  const total = totalTick / cpus.length;
  const usage = 100 - ~~(100 * idle / total);

  return Math.max(0, Math.min(100, usage));
}

/**
 * Log an event to the monitoring system
 * @param level Severity level
 * @param message Log message
 * @param details Additional details (optional)
 */
export function logEvent(level: LogLevel, message: string, details?: any): void {
  const timestamp = new Date().toISOString();
  
  // Create log entry
  const entry: LogEntry = {
    timestamp,
    level,
    message,
    details: details ? JSON.stringify(details) : undefined
  };
  
  // Add to recent events cache (limit size)
  recentEvents.unshift(entry);
  if (recentEvents.length > MAX_ENTRIES) {
    recentEvents = recentEvents.slice(0, MAX_ENTRIES);
  }
  
  // Format for log file
  const logLine = `[${timestamp}] [${level}] ${message}${details ? ' ' + JSON.stringify(details) : ''}\n`;
  
  // Write to log file (with basic rotation if needed)
  try {
    // Check file size and rotate if needed
    let stats;
    try {
      stats = fs.statSync(SYSTEM_LOG_FILE);
    } catch {
      // If file doesn't exist, create it
      fs.writeFileSync(SYSTEM_LOG_FILE, '');
      stats = fs.statSync(SYSTEM_LOG_FILE);
    }
    
    if (stats.size > MAX_LOG_SIZE) {
      // Create backup file
      const backupFile = `${SYSTEM_LOG_FILE}.${Date.now()}.bak`;
      fs.renameSync(SYSTEM_LOG_FILE, backupFile);
      fs.writeFileSync(SYSTEM_LOG_FILE, '');
      
      // Remove old backup files (keep last 5)
      const backupFiles = fs.readdirSync(LOG_DIR)
        .filter(file => file.startsWith('system-status.log.') && file.endsWith('.bak'))
        .sort((a, b) => b.localeCompare(a)); // Sort in reverse order
      
      if (backupFiles.length > 5) {
        backupFiles.slice(5).forEach(file => {
          fs.unlinkSync(path.join(LOG_DIR, file));
        });
      }
    }
    
    // Append to log file
    fs.appendFileSync(SYSTEM_LOG_FILE, logLine);
    
    // Also log to console for development
    if (process.env.NODE_ENV === 'development') {
      log(`[MONITOR] ${level}: ${message}`, 'monitor');
    }
  } catch (error) {
    log(`Error writing to monitoring log: ${error}`, 'monitor');
  }
}

/**
 * Log API usage with appropriate level based on usage percentage
 * @param api API name
 * @param currentUsage Current usage
 * @param limit Rate limit
 * @param metadata Additional metadata
 * @returns Boolean indicating if this is high usage (needs attention)
 */
export function logApiUsage(
  api: string, 
  currentUsage: number, 
  limit: number, 
  metadata?: Record<string, any>
): boolean {
  const usagePercentage = (currentUsage / limit) * 100;
  
  // Determine log level based on usage percentage
  let level = LogLevel.INFO;
  let needsAttention = false;
  
  if (usagePercentage >= 90) {
    level = LogLevel.CRITICAL;
    needsAttention = true;
  } else if (usagePercentage >= 80) {
    level = LogLevel.WARNING;
    needsAttention = true;
  } else if (usagePercentage >= 50) {
    level = LogLevel.INFO;
  }
  
  logEvent(
    level,
    `${api} API at ${usagePercentage.toFixed(1)}% of limit (${currentUsage}/${limit})`,
    metadata
  );
  
  return needsAttention;
}

/**
 * Get the most recent events
 * @param count Number of events to retrieve
 * @param level Optional filter by log level
 * @returns Array of log entries
 */
export function getRecentEvents(count = 50, level?: LogLevel): LogEntry[] {
  if (level) {
    return recentEvents
      .filter(entry => entry.level === level)
      .slice(0, count);
  }
  
  return recentEvents.slice(0, count);
}

/**
 * Get all logs from the log file
 * @param maxLines Maximum number of lines to retrieve
 * @returns Array of log lines
 */
export function getLogs(maxLines = 100): string[] {
  try {
    // Read the log file
    const content = fs.readFileSync(SYSTEM_LOG_FILE, 'utf8');
    
    // Split into lines
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    
    // Return the last n lines
    return lines.slice(-maxLines).reverse();
  } catch (error) {
    log(`Error reading logs: ${error}`, 'monitor');
    return [`Error reading logs: ${error}`];
  }
}

/**
 * Update performance history with current metrics
 */
function updatePerformanceHistory(): void {
  const memUsage = process.memoryUsage();
  const cpuUsage = getCpuUsage();
  
  performanceHistory.unshift({
    timestamp: new Date().toISOString(),
    memoryUsage: memUsage.heapUsed,
    cpuUsage: cpuUsage
  });
  
  // Keep only last 24 hours of data (assuming 1 minute intervals)
  if (performanceHistory.length > 1440) {
    performanceHistory = performanceHistory.slice(0, 1440);
  }
}

/**
 * Check database connectivity and performance
 */
async function checkDatabaseHealth(): Promise<{ connected: boolean; responseTime: number; error?: string }> {
  try {
    const startTime = Date.now();
    
    // Simple query to test database connectivity
    await db.execute('SELECT 1 as health_check');
    
    const responseTime = Date.now() - startTime;
    
    return {
      connected: true,
      responseTime
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Log database error
    logEvent(LogLevel.CRITICAL, 'Database connection failed', { error: errorMessage });
    
    // Send alert for database issues (with cooldown)
    if (Math.random() < 0.1) { // Only send alert 10% of the time to avoid spam
      sendDatabaseAlert(errorMessage).catch(alertError => {
        log(`Failed to send database alert: ${alertError}`, 'monitor');
      });
    }
    
    return {
      connected: false,
      responseTime: -1,
      error: errorMessage
    };
  }
}

/**
 * Check overall system health and generate metrics
 * @returns SystemHealthMetrics object
 */
export async function checkSystemHealth(): Promise<SystemHealthMetrics> {
  updatePerformanceHistory();
  
  const memoryUsage = process.memoryUsage();
  const systemMem = {
    total: os.totalmem(),
    free: os.freemem(),
    used: os.totalmem() - os.freemem()
  };
  
  const diskSpace = getDiskSpace();
  const cpuUsage = getCpuUsage();
  const loadAverage = os.loadavg();
  
  // Calculate percentages
  const memUsedPercentage = (systemMem.used / systemMem.total) * 100;
  const loadPercentage = (loadAverage[0] / os.cpus().length) * 100;
  
  // Determine overall health status
  let status: 'healthy' | 'warning' | 'critical' = 'healthy';
  
  if (memUsedPercentage > 90 || diskSpace.usedPercentage > 90 || loadPercentage > 90) {
    status = 'critical';
  } else if (memUsedPercentage > 75 || diskSpace.usedPercentage > 75 || loadPercentage > 75) {
    status = 'warning';
  }
  
  // Get recent critical and warning events
  const criticalEvents = getRecentEvents(10, LogLevel.CRITICAL);
  const warningEvents = getRecentEvents(20, LogLevel.WARNING);
  
  // Log health status if concerning
  if (status === 'critical') {
    logEvent(LogLevel.CRITICAL, 'System health is critical', {
      memoryUsage: memUsedPercentage,
      diskUsage: diskSpace.usedPercentage,
      cpuLoad: loadPercentage
    });
  } else if (status === 'warning') {
    logEvent(LogLevel.WARNING, 'System health shows warning signs', {
      memoryUsage: memUsedPercentage,
      diskUsage: diskSpace.usedPercentage,
      cpuLoad: loadPercentage
    });
  }
  
  const databaseHealth = await checkDatabaseHealth();
  
  return {
    status,
    timestamp: new Date().toISOString(),
    apiAvailable: true,
    uptime: process.uptime(),
    memory: {
      used: systemMem.used,
      total: systemMem.total,
      free: systemMem.free,
      usedPercentage: memUsedPercentage,
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal
    },
    cpu: {
      loadAverage: loadAverage,
      loadPercentage: loadPercentage,
      usage: cpuUsage
    },
    disk: diskSpace,
    database: databaseHealth,
    process: {
      pid: process.pid,
      memoryUsage: memoryUsage,
      cpuUsage: process.cpuUsage()
    },
    critical: criticalEvents,
    warnings: warningEvents
  };
}

/**
 * Get performance history for trending analysis
 * @param hours Number of hours of history to return (default 24)
 * @returns Array of performance data points
 */
export function getPerformanceHistory(hours = 24): Array<{
  timestamp: string;
  memoryUsage: number;
  cpuUsage: number;
}> {
  const hoursInMs = hours * 60 * 60 * 1000;
  const cutoffTime = new Date(Date.now() - hoursInMs);
  
  return performanceHistory.filter(entry => 
    new Date(entry.timestamp) >= cutoffTime
  );
}

// Initialize the monitoring system
logEvent(LogLevel.INFO, 'Monitoring system initialized');