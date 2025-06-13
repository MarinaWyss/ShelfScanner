/* eslint-disable no-undef */
// Vercel serverless function handler for the root API endpoint
require('@vercel/node'); // Import but don't assign to variables

/**
 * Default API handler
 * @param {import('@vercel/node').VercelRequest} req - The request object
 * @param {import('@vercel/node').VercelResponse} res - The response object
 */
export default async function handler(req, res) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  return res.status(200).json({ 
    message: 'ShelfScanner API',
    version: '1.0.0',
    endpoints: [
      '/api/health-check',
      '/api/preferences',
      '/api/saved-books'
    ]
  });
} 