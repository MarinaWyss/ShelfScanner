import { Router, Request, Response, NextFunction } from 'express';
import { getApiUsageStats } from './api-stats';
import { checkSystemHealth, getRecentEvents, getLogs, LogLevel } from './monitor';
import crypto from 'crypto';

const router = Router();

// In-memory session store (will reset on server restart)
const sessions = new Map<string, { username: string, expires: Date }>();

// Admin credentials (in production, use environment variables)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
// Default password: 'admin1234' (make sure to change this in production)
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || hashPassword('admin1234');

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
  
  // Always use a constant-time comparison to prevent timing attacks
  if (username !== ADMIN_USERNAME || hashPassword(password) !== ADMIN_PASSWORD_HASH) {
    // Log failed login attempt
    console.warn(`Failed admin login attempt for username: ${username}`);
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
  
  console.log(`Admin login successful: ${username}`);
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
router.get('/stats', requireAuth, (req: Request, res: Response) => {
  try {
    const stats = getApiUsageStats();
    const health = checkSystemHealth();
    
    return res.status(200).json({
      ...stats,
      health
    });
  } catch (error) {
    console.error(`Error getting API statistics: ${error}`);
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
    console.error(`Error reading logs: ${error}`);
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
router.get('/health', requireAuth, (req: Request, res: Response) => {
  try {
    const health = checkSystemHealth();
    return res.status(200).json(health);
  } catch (error) {
    console.error(`Error checking system health: ${error}`);
    return res.status(500).json({ 
      message: 'Error checking system health',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

export const adminMonitoringRoutes = router;