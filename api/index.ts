import { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  return res.status(404).json({ 
    message: 'API endpoint not found. Use specific endpoints like /api/saved-books or /api/preferences.' 
  });
} 