/* eslint-disable no-undef */
// Health check API for debugging Vercel deployment
require('dotenv/config');
require('@vercel/node');

/**
 * Health check API handler
 * @param {import('@vercel/node').VercelRequest} req - The request object
 * @param {import('@vercel/node').VercelResponse} res - The response object
 */
module.exports = async function handler(req, res) {
  console.log('=== HEALTH CHECK API CALLED ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
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
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      vercel: {
        region: process.env.VERCEL_REGION || 'unknown',
        deployment: process.env.VERCEL_DEPLOYMENT_ID || 'unknown'
      },
      database: {
        url_exists: !!process.env.DATABASE_URL,
        url_prefix: process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 20) + '...' : 'none'
      },
      cookies: req.cookies || {},
      headers: {
        'user-agent': req.headers['user-agent'],
        'x-forwarded-for': req.headers['x-forwarded-for'],
        'x-real-ip': req.headers['x-real-ip']
      }
    };

    // Try to test database connection
    try {
      console.log('Testing database connection...');
      
      // First test the basic connection
      const { testDatabaseConnection } = require('../server/db');
      const connectionTest = await testDatabaseConnection();
      
      if (connectionTest) {
        // If basic connection works, test storage operations
        const { storage } = require('../server/storage');
        const recentBooks = await storage.getRecentlyAddedBooks(1);
        
        healthData.database.connection = 'success';
        healthData.database.basic_test = 'passed';
        healthData.database.storage_test = 'passed';
        healthData.database.recent_books_count = recentBooks.length;
        console.log('Database connection and storage tests passed');
      } else {
        healthData.database.connection = 'failed';
        healthData.database.basic_test = 'failed';
        healthData.status = 'unhealthy';
      }
    } catch (dbError) {
      console.error('Database test failed:', dbError);
      healthData.database.connection = 'failed';
      healthData.database.error = dbError.message;
      healthData.database.error_type = dbError.constructor.name;
      healthData.status = 'unhealthy';
    }

    console.log('Health check data:', JSON.stringify(healthData, null, 2));
    
    return res.status(healthData.status === 'healthy' ? 200 : 503).json(healthData);
  } catch (error) {
    console.error('Health check error:', error);
    
    return res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message,
      error_type: error.constructor.name,
      stack: error.stack
    });
  }
}; 