/* eslint-disable no-undef */
// Import using ES modules for Vercel compatibility
import 'dotenv/config';

/**
 * API handler for books
 * @param {import('@vercel/node').VercelRequest} req - The request object
 * @param {import('@vercel/node').VercelResponse} res - The response object
 */
export default async function handler(req, res) {
  // Add comprehensive logging for debugging
  console.log('=== BOOKS API CALLED ===');
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
    const { log } = await import('../server/simple-logger.js');

    console.log('Modules imported successfully');

    if (req.method === 'GET') {
      try {
        // For GET requests, return user's books
        const userId = 1; // Default user ID
        
        log('Books GET request received', 'books');
        
        // Return empty array for now - this endpoint is mainly for compatibility
        return res.status(200).json([]);
        
      } catch (error) {
        console.error('GET books error:', error);
        return res.status(500).json({ error: 'Failed to retrieve books' });
      }
    }

    if (req.method === 'POST') {
      try {
        console.log('POST request body:', req.body);
        
        const userId = 1; // Default user ID
        
        // Handle both single book and array of books
        const booksToSave = Array.isArray(req.body) ? req.body : [req.body];
        
        log(`Saving ${booksToSave.length} books`, 'books');
        
        const savedBooks = [];
        
        for (const bookData of booksToSave) {
          try {
            // Validate book data
            if (!bookData.title) {
              console.log('Missing title for book:', bookData);
              continue;
            }
            
            // Cache the book data in book_cache to ensure consistent IDs
            const bookId = `${bookData.title}-${bookData.author || "Unknown"}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
            const cachedBook = await storage.cacheBook({
              title: bookData.title,
              author: bookData.author || "Unknown",
              isbn: bookData.isbn || null,
              coverUrl: bookData.coverUrl || null,
              source: "saved", // Mark as saved by user
              bookId, // Add required bookId field
              expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year expiration
            });
            
            savedBooks.push({
              id: cachedBook.id,
              userId,
              title: cachedBook.title,
              author: cachedBook.author,
              isbn: cachedBook.isbn,
              coverUrl: cachedBook.coverUrl,
              metadata: cachedBook.metadata
            });
            
            log(`Saved book: "${cachedBook.title}" by ${cachedBook.author}`, 'books');
          } catch (bookError) {
            console.error('Error saving individual book:', bookData, bookError);
            log(`Error saving book "${bookData.title}": ${bookError instanceof Error ? bookError.message : String(bookError)}`, 'books');
          }
        }
        
        log(`Successfully saved ${savedBooks.length} books`, 'books');
        return res.status(200).json(savedBooks);
        
      } catch (error) {
        console.error('POST books error:', error);
        log(`Error saving books: ${error instanceof Error ? error.message : String(error)}`, 'books');
        return res.status(500).json({ 
          error: 'Failed to save books',
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
    
  } catch (error) {
    console.error('Books API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
} 