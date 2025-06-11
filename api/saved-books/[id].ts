import 'dotenv/config';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { storage } from '../../server/storage';
import { v4 as uuidv4 } from 'uuid';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'DELETE') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Extract device ID from cookies or generate new one
    let deviceId = req.cookies?.deviceId;
    
    if (!deviceId) {
      deviceId = uuidv4();
      // Set cookie
      res.setHeader('Set-Cookie', `deviceId=${deviceId}; Path=/; Max-Age=${365 * 24 * 60 * 60}; SameSite=Strict; ${process.env.NODE_ENV === 'production' ? 'Secure;' : ''}`);
    }

    // Extract ID from query params (Vercel automatically parses [id] from the filename)
    const { id } = req.query;
    const bookId = parseInt(Array.isArray(id) ? id[0] : id || '');
    
    if (isNaN(bookId)) {
      return res.status(400).json({ message: 'Invalid book ID' });
    }
    
    // Delete the saved book
    const deleted = await storage.deleteSavedBook(bookId);
    
    if (!deleted) {
      return res.status(404).json({ message: 'Book not found' });
    }
    
    return res.status(200).json({ message: 'Book deleted successfully' });
  } catch (error) {
    console.error('Error deleting saved book:', error);
    return res.status(500).json({ 
      message: 'Error deleting saved book',
      error: error instanceof Error ? error.message : String(error)
    });
  }
} 