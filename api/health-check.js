/* eslint-disable no-undef */
// Health check API for debugging Vercel deployment
import 'dotenv/config';

/**
 * Health check API handler
 * @param {import('@vercel/node').VercelRequest} req - The request object
 * @param {import('@vercel/node').VercelResponse} res - The response object
 */
export default async function handler(req, res) {
  console.log('=== HEALTH CHECK API CALLED ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Headers:', req.headers);
  console.log('Environment:', process.env.NODE_ENV);
  
  // Handle CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Test database connectivity
    let dbStatus = 'unknown';
    let dbError = null;
    
    try {
      const { testDatabaseConnection } = await import('../server/db.js');
      const dbResult = await testDatabaseConnection();
      dbStatus = dbResult ? 'connected' : 'failed';
      if (!dbResult) {
        dbError = 'Connection test returned false';
      }
    } catch (error) {
      console.error('Database test failed:', error);
      dbStatus = 'failed';
      dbError = error.message;
    }

    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'unknown',
      database: {
        status: dbStatus,
        error: dbError
      },
      vercel: {
        region: process.env.VERCEL_REGION || 'unknown',
        deployment: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown'
      }
    };

    console.log('Health check response:', healthData);
    
    return res.status(200).json(healthData);
    
  } catch (error) {
    console.error('Health check error:', error);
    
    const errorResponse = {
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
    
    return res.status(500).json(errorResponse);
  }
} 