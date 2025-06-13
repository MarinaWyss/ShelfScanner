/* eslint-disable no-undef */
// Health check API for debugging Vercel deployment
import 'dotenv/config';

/**
 * Health check API handler
 * @param {Request} request - The request object
 * @param {Response} response - The response object
 */
export default async function handler(request) {
  console.log('=== HEALTH CHECK API CALLED ===');
  console.log('Method:', request.method);
  console.log('URL:', request.url);
  console.log('Environment:', process.env.NODE_ENV);
  
  // Handle CORS
  const headers = {
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version',
    'Content-Type': 'application/json'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers });
  }

  if (request.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }), 
      { status: 405, headers }
    );
  }

  try {
    // Test database connectivity
    let dbStatus = 'unknown';
    let dbError = null;
    
    try {
      const { testDatabaseConnection } = await import('../server/db.js');
      const dbResult = await testDatabaseConnection();
      dbStatus = dbResult.success ? 'connected' : 'failed';
      if (!dbResult.success) {
        dbError = dbResult.error;
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
    
    return new Response(
      JSON.stringify(healthData), 
      { status: 200, headers }
    );
    
  } catch (error) {
    console.error('Health check error:', error);
    
    const errorResponse = {
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
    
    return new Response(
      JSON.stringify(errorResponse), 
      { status: 500, headers }
    );
  }
} 