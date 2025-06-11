import { Router, Request, Response, NextFunction } from 'express';
import { getApiUsageStats } from './api-stats';
import { checkSystemHealth, getRecentEvents, getLogs, LogLevel, getPerformanceHistory } from './monitor';
import { rateLimiter } from './rate-limiter';
import { getApiFailureStats } from './utils/api-monitoring';
import { 
  startHealthMonitoring, 
  stopHealthMonitoring, 
  getMonitoringStatus, 
  triggerHealthCheck, 
  triggerDailyReport 
} from './health-monitor';
import crypto from 'crypto';
import { log } from './vite';

const router = Router();

// In-memory session store (will reset on server restart)
const sessions = new Map<string, { username: string, expires: Date }>();

// Admin credentials - MUST be set via environment variables
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;

// Validate that admin credentials are configured
if (!ADMIN_USERNAME || !ADMIN_PASSWORD_HASH) {
  throw new Error('Admin credentials not configured. Please set ADMIN_USERNAME and ADMIN_PASSWORD_HASH environment variables.');
}

/**
 * Hash a password using SHA-256
 * @param password Plain text password
 * @returns Hashed password
 */
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * Generate a secure random session token
 * @returns Session token
 */
function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Middleware to check if user is authenticated
 */
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const sessionToken = req.cookies.admin_session;
  
  if (!sessionToken) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  
  const session = sessions.get(sessionToken);
  
  if (!session || session.expires < new Date()) {
    // Session expired or invalid
    if (session) {
      sessions.delete(sessionToken); // Clean up expired session
    }
    return res.status(401).json({ message: 'Session expired. Please login again.' });
  }
  
  // Session valid, set user in request for downstream middleware
  (req as any).adminUser = session.username;
  
  next();
}

/**
 * Admin login endpoint
 * POST /api/admin/login
 */
router.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  
  // Check credentials against environment variables (using hashed password)
  if (username !== ADMIN_USERNAME || hashPassword(password) !== ADMIN_PASSWORD_HASH) {
    // Log failed login attempt
    log(`Failed admin login attempt for username: ${username}`);
    return res.status(401).json({ message: 'Invalid username or password' });
  }
  
  // Create session
  const token = generateSessionToken();
  const expires = new Date();
  expires.setHours(expires.getHours() + 2); // 2-hour session
  
  // Store in memory
  sessions.set(token, {
    username,
    expires
  });
  
  // Set secure cookie
  res.cookie('admin_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    expires
  });
  
  log(`Admin login successful: ${username}`);
  return res.status(200).json({ message: 'Login successful' });
});

/**
 * Check if user is authenticated
 * GET /api/admin/check-auth
 */
router.get('/check-auth', requireAuth, (req: Request, res: Response) => {
  res.status(200).json({ authenticated: true });
});

/**
 * Admin logout endpoint
 * POST /api/admin/logout
 */
router.post('/logout', requireAuth, (req: Request, res: Response) => {
  const sessionToken = req.cookies.admin_session;
  
  if (sessionToken) {
    sessions.delete(sessionToken);
  }
  
  res.clearCookie('admin_session');
  res.status(200).json({ message: 'Logout successful' });
});

/**
 * Get API statistics
 * GET /api/admin/stats
 */
router.get('/stats', requireAuth, async (req: Request, res: Response) => {
  try {
    const stats = getApiUsageStats();
    const health = await checkSystemHealth();
    const apiFailures = getApiFailureStats();
    
    // Get OpenAI specific monitoring information
    const openaiMonitoring = {
      configured: !!process.env.OPENAI_API_KEY,
      status: process.env.OPENAI_API_KEY ? 'available' : 'not configured',
      failureCount: apiFailures.openai?.failureCount || 0,
      affectedUsers: apiFailures.openai?.affectedUsers || 0,
      lastFailure: apiFailures.openai?.lastFailure || null,
      isCritical: apiFailures.openai?.isCritical || false,
      usageToday: stats.openai?.dailyUsage || 0,
      dailyLimit: stats.openai?.dailyLimit || 0
    };
    
    return res.status(200).json({
      ...stats,
      health,
      apiMonitoring: {
        openai: openaiMonitoring,
        failures: apiFailures
      }
    });
  } catch (error) {
    log(`Error getting API statistics: ${error}`);
    return res.status(500).json({ 
      message: 'Error getting API statistics',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Get application logs
 * GET /api/admin/logs
 */
router.get('/logs', requireAuth, async (req: Request, res: Response) => {
  try {
    // Get the maxLines parameter from query string
    const maxLines = req.query.maxLines ? parseInt(req.query.maxLines as string) : 100;
    
    // Get the log level filter from query string
    const levelFilter = req.query.level as LogLevel | undefined;
    
    // Get the logs
    const logs = getLogs(maxLines);
    const recentEvents = getRecentEvents(maxLines, levelFilter);
    
    return res.status(200).json({ 
      logs,
      recentEvents
    });
  } catch (error) {
    log(`Error reading logs: ${error}`);
    return res.status(500).json({ 
      message: 'Error reading logs',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Get system health status
 * GET /api/admin/health
 */
router.get('/health', requireAuth, async (req: Request, res: Response) => {
  try {
    const health = await checkSystemHealth();
    return res.status(200).json(health);
  } catch (error) {
    log(`Error checking system health: ${error}`);
    return res.status(500).json({ 
      message: 'Error checking system health',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Manual test endpoint for incrementing API usage counters
 * POST /api/admin/test-increment
 */
router.post('/test-increment', requireAuth, (req: Request, res: Response) => {
  try {
    const { apiName, count = 1 } = req.body;
    
    if (!apiName) {
      return res.status(400).json({ message: 'API name is required' });
    }
    
    // Increment the counter for the specified API
    for (let i = 0; i < (count as number); i++) {
      rateLimiter.increment(apiName);
    }
    
    // Get the updated stats
    const stats = getApiUsageStats();
    
    return res.status(200).json({ 
      message: `Successfully incremented usage counter for ${apiName} by ${count}`,
      stats 
    });
  } catch (error) {
    log(`Error testing API counter: ${error}`);
    return res.status(500).json({ 
      message: 'Error testing API counter',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Get performance history for trending
 * GET /api/admin/performance-history
 */
router.get('/performance-history', requireAuth, (req: Request, res: Response) => {
  try {
    const hours = req.query.hours ? parseInt(req.query.hours as string) : 24;
    const history = getPerformanceHistory(hours);
    
    return res.status(200).json({ 
      history,
      totalPoints: history.length
    });
  } catch (error) {
    log(`Error getting performance history: ${error}`);
    return res.status(500).json({ 
      message: 'Error getting performance history',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Get health monitoring status
 * GET /api/admin/health-monitor/status
 */
router.get('/health-monitor/status', requireAuth, (req: Request, res: Response) => {
  try {
    const status = getMonitoringStatus();
    return res.status(200).json(status);
  } catch (error) {
    log(`Error getting monitoring status: ${error}`);
    return res.status(500).json({ 
      message: 'Error getting monitoring status',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Start health monitoring
 * POST /api/admin/health-monitor/start
 */
router.post('/health-monitor/start', requireAuth, (req: Request, res: Response) => {
  try {
    startHealthMonitoring();
    return res.status(200).json({ 
      message: 'Health monitoring started successfully',
      status: getMonitoringStatus()
    });
  } catch (error) {
    log(`Error starting health monitoring: ${error}`);
    return res.status(500).json({ 
      message: 'Error starting health monitoring',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Stop health monitoring
 * POST /api/admin/health-monitor/stop
 */
router.post('/health-monitor/stop', requireAuth, (req: Request, res: Response) => {
  try {
    stopHealthMonitoring();
    return res.status(200).json({ 
      message: 'Health monitoring stopped successfully',
      status: getMonitoringStatus()
    });
  } catch (error) {
    log(`Error stopping health monitoring: ${error}`);
    return res.status(500).json({ 
      message: 'Error stopping health monitoring',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Trigger manual health check
 * POST /api/admin/health-monitor/check
 */
router.post('/health-monitor/check', requireAuth, async (req: Request, res: Response) => {
  try {
    const health = await triggerHealthCheck();
    return res.status(200).json({ 
      message: 'Health check completed',
      health
    });
  } catch (error) {
    log(`Error triggering health check: ${error}`);
    return res.status(500).json({ 
      message: 'Error triggering health check',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Trigger manual daily report
 * POST /api/admin/health-monitor/daily-report
 */
router.post('/health-monitor/daily-report', requireAuth, async (req: Request, res: Response) => {
  try {
    await triggerDailyReport();
    return res.status(200).json({ 
      message: 'Daily report sent successfully'
    });
  } catch (error) {
    log(`Error triggering daily report: ${error}`);
    return res.status(500).json({ 
      message: 'Error triggering daily report',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

export const adminMonitoringRoutes = router;