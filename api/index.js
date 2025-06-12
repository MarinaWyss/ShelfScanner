/* eslint-disable no-undef */
// Vercel serverless function handler for the root API endpoint
require('@vercel/node'); // Import but don't assign to variables

/**
 * Default handler for API root
 * @param {import('@vercel/node').VercelRequest} req - The request object
 * @param {import('@vercel/node').VercelResponse} res - The response object
 */
module.exports = (req, res) => {
  return res.status(200).json({ 
    message: 'API is working correctly. Use specific endpoints like /api/saved-books or /api/preferences.' 
  });
}; 