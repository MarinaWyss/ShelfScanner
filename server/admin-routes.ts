import { Router, Request, Response, NextFunction } from 'express';
import { getApiUsageStats } from './api-stats';
import { logger } from './logger';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const router = Router();

// In-memory session store (will reset on server restart)
// In a production app, you should use Redis or another session store
const sessions = new Map<string, { username: string, expires: Date }>();

// Admin credentials (in production, these should be environment variables or in a database)
// The password is hashed for security
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
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
    logger.warn(`Failed admin login attempt for username: ${username}`);
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
  
  logger.info(`Admin login successful: ${username}`);
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
    return res.status(200).json(stats);
  } catch (error) {
    logger.error(`Error getting API statistics: ${error}`);
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
router.get('/logs', requireAuth, (req: Request, res: Response) => {
  try {
    const logDir = path.join(__dirname, '../logs');
    const logFiles = fs.readdirSync(logDir)
      .filter(file => file.endsWith('.log'))
      .sort((a, b) => {
        // Sort by date in filename descending (newest first)
        return b.localeCompare(a);
      });
    
    if (logFiles.length === 0) {
      return res.status(200).json({ logs: ['No log files found'] });
    }
    
    // Read the most recent log file
    const latestLog = logFiles[0];
    const logPath = path.join(logDir, latestLog);
    
    // Read the last 50 lines of the log file to avoid huge responses
    const logContent = fs.readFileSync(logPath, 'utf8');
    const logLines = logContent.split('\n').filter(line => line.trim() !== '');
    const lastLines = logLines.slice(-50).reverse(); // Get last 50 lines and reverse for newest first
    
    return res.status(200).json({ logs: lastLines });
  } catch (error) {
    logger.error(`Error reading logs: ${error}`);
    return res.status(500).json({ 
      message: 'Error reading logs',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Force log refresh
 * GET /api/admin/logs/refresh
 */
router.get('/logs/refresh', requireAuth, (req: Request, res: Response) => {
  // No action needed, just return success
  // The frontend will fetch logs again
  return res.status(200).json({ message: 'Logs refreshed' });
});

export const adminRoutes = router;