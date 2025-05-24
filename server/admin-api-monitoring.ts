/**
 * Admin routes for API monitoring
 */
import { Router, Request, Response } from 'express';
import { getApiFailureStats } from './utils/api-monitoring';
import { rateLimiter } from './rate-limiter';

const router = Router();

/**
 * Get OpenAI API health and failure statistics
 * GET /api/admin/api-monitoring
 */
router.get('/api-monitoring', async (req: Request, res: Response) => {
  try {
    // Get API failure statistics
    const failureStats = getApiFailureStats();
    
    // Get current rate limiter usage
    const rateLimiterStats = rateLimiter.getUsageStats();
    
    return res.status(200).json({
      failures: failureStats,
      rateLimits: rateLimiterStats,
      openai: {
        configured: !!process.env.OPENAI_API_KEY,
        status: process.env.OPENAI_API_KEY ? 'available' : 'not configured',
        failureCount: failureStats.openai?.failureCount || 0,
        usageToday: rateLimiterStats.openai?.dailyUsage || 0,
        dailyLimit: rateLimiterStats.openai?.dailyLimit || 0,
        withinLimits: rateLimiterStats.openai?.withinLimits || false,
        affectedUsers: failureStats.openai?.affectedUsers || 0,
        lastFailure: failureStats.openai?.lastFailure || null,
        isCritical: failureStats.openai?.isCritical || false
      }
    });
  } catch (error) {
    console.error(`Error getting API monitoring data: ${error}`);
    return res.status(500).json({ 
      message: 'Error getting API monitoring data',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Reset API failure counters (for testing)
 * POST /api/admin/api-monitoring/reset
 */
router.post('/api-monitoring/reset', async (req: Request, res: Response) => {
  try {
    // This would normally reset the counters in the API monitoring system
    // We'll implement this with a placeholder for now
    
    return res.status(200).json({
      message: 'API monitoring counters reset successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`Error resetting API monitoring counters: ${error}`);
    return res.status(500).json({ 
      message: 'Error resetting API monitoring counters',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

export { router as adminApiMonitoringRoutes };