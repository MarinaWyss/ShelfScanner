/* eslint-disable no-undef */
// Import using ES modules for Vercel compatibility
import 'dotenv/config';
import { v4 as uuidv4 } from 'uuid';

/**
 * API handler for saved books
 * @param {import('@vercel/node').VercelRequest} req - The request object
 * @param {import('@vercel/node').VercelResponse} res - The response object
 */
export default async function handler(req, res) {
  // Add comprehensive logging for debugging
  console.log('=== SAVED BOOKS API CALLED ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Headers:', req.headers);
  console.log('Query:', req.query);
  console.log('Body:', req.body);
  
  // Handle CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Import storage dynamically to avoid issues with module resolution
    const { storage } = await import('../server/storage.js');
    const { insertSavedBookSchema } = await import('../shared/schema.js');
    const { logDeviceOperation, logBookOperation } = await import('../server/utils/safe-logger.js');
    const { log } = await import('../server/simple-logger.js');

    console.log('Modules imported successfully');

    if (req.method === 'GET') {
      try {
        const deviceId = req.query.deviceId || req.cookies?.deviceId;
        console.log('GET request for deviceId:', deviceId);
        
        if (!deviceId) {
          return res.status(400).json({ error: 'Device ID is required' });
        }

        const savedBooks = await storage.getSavedBooks(deviceId);
        console.log('Retrieved saved books:', savedBooks?.length || 0);
        
        await logDeviceOperation(deviceId, 'saved_books_get', { 
          found: savedBooks ? 'yes' : 'no',
          count: savedBooks?.length || 0 
        });
        
        return res.status(200).json({ 
          savedBooks: savedBooks || [],
          deviceId: deviceId 
        });
        
      } catch (error) {
        console.error('GET saved books error:', error);
        return res.status(500).json({ error: 'Failed to retrieve saved books' });
      }
    }

    if (req.method === 'POST') {
      try {
        console.log('POST request body:', req.body);
        
        const validation = insertSavedBookSchema.safeParse(req.body);
        
        if (!validation.success) {
          console.log('Validation failed:', validation.error);
          return res.status(400).json({ 
            error: 'Invalid request data',
            details: validation.error.errors 
          });
        }

        const { deviceId, book } = validation.data;
        console.log('Saving book for deviceId:', deviceId);
        
        // Generate book ID
        const bookWithId = {
          ...book,
          id: uuidv4(),
          deviceId: deviceId,
          savedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        };

        console.log('Book with ID:', bookWithId);
        
        const result = await storage.saveBook(bookWithId);
        console.log('Save result:', result);
        
        await logDeviceOperation(deviceId, 'book_save', { 
          success: 'yes',
          bookId: bookWithId.id,
          title: book.title || 'Unknown'
        });
        
        await logBookOperation(bookWithId.id, 'saved', {
          deviceId: deviceId,
          title: book.title || 'Unknown'
        });
        
        log('Book saved successfully', { 
          deviceId, 
          bookId: bookWithId.id,
          title: book.title 
        });
        
        return res.status(200).json({ 
          success: true, 
          book: result,
          message: 'Book saved successfully' 
        });
        
      } catch (error) {
        console.error('POST saved books error:', error);
        
        // Try to log the device operation even on error
        try {
          const deviceId = req.body?.deviceId;
          if (deviceId) {
            await logDeviceOperation(deviceId, 'book_save', { 
              success: 'no',
              error: error.message 
            });
          }
        } catch (logError) {
          console.error('Failed to log error operation:', logError);
        }
        
        return res.status(500).json({ error: 'Failed to save book' });
      }
    }

    if (req.method === 'DELETE') {
      try {
        const { bookId } = req.query;
        const deviceId = req.query.deviceId || req.cookies?.deviceId;
        
        console.log('DELETE request for bookId:', bookId, 'deviceId:', deviceId);
        
        if (!bookId) {
          return res.status(400).json({ error: 'Book ID is required' });
        }
        
        if (!deviceId) {
          return res.status(400).json({ error: 'Device ID is required' });
        }

        const result = await storage.deleteBook(bookId, deviceId);
        console.log('Delete result:', result);
        
        await logDeviceOperation(deviceId, 'book_delete', { 
          success: 'yes',
          bookId: bookId
        });
        
        await logBookOperation(bookId, 'deleted', {
          deviceId: deviceId
        });
        
        log('Book deleted successfully', { 
          deviceId, 
          bookId 
        });
        
        return res.status(200).json({ 
          success: true,
          message: 'Book deleted successfully' 
        });
        
      } catch (error) {
        console.error('DELETE saved books error:', error);
        
        // Try to log the device operation even on error
        try {
          const deviceId = req.query.deviceId || req.cookies?.deviceId;
          const bookId = req.query.bookId;
          if (deviceId && bookId) {
            await logDeviceOperation(deviceId, 'book_delete', { 
              success: 'no',
              bookId: bookId,
              error: error.message 
            });
          }
        } catch (logError) {
          console.error('Failed to log error operation:', logError);
        }
        
        return res.status(500).json({ error: 'Failed to delete book' });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
    
  } catch (error) {
    console.error('Saved books API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
} 