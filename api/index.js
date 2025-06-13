/* eslint-disable no-undef */
// Vercel serverless function handler for the root API endpoint
require('@vercel/node'); // Import but don't assign to variables

/**
 * Default API handler
 * @param {Request} request - The request object
 */
export default async function handler(request) {
  const headers = {
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version',
    'Content-Type': 'application/json'
  };

  return new Response(
    JSON.stringify({ 
      message: 'ShelfScanner API',
      version: '1.0.0',
      endpoints: [
        '/api/health-check',
        '/api/preferences',
        '/api/saved-books'
      ]
    }),
    { status: 200, headers }
  );
} 