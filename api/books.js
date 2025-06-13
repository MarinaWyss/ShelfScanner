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
        
        const userId = 1; // Default user ID
        
        // Handle both single book and array of books
        const booksToSave = Array.isArray(req.body) ? req.body : [req.body];
        
        log(`Saving ${booksToSave.length} books`, 'books');
        
        const savedBooks = [];
        
        for (const bookData of booksToSave) {
          try {
            // Validate book data
            if (!bookData.title) {
              // console.log('Missing title for book:', bookData); // REMOVED: Book data may contain sensitive info
              continue;
            }
            
            // Simply find the existing cached book (it should already exist from the detection phase)
            try {
              const { bookCacheService } = await import('../server/book-cache-service.js');
              
              // Find the existing cached book
              const cachedBook = await bookCacheService.findInCache(bookData.title, bookData.author || "Unknown");
              
              if (cachedBook) {
                log(`Found cached book data for "${bookData.title}": rating=${cachedBook.rating}, summary=${cachedBook.summary ? 'yes' : 'no'}`, 'books');
                
                savedBooks.push({
                  id: cachedBook.id,
                  userId,
                  title: cachedBook.title,
                  author: cachedBook.author,
                  isbn: cachedBook.isbn,
                  coverUrl: cachedBook.coverUrl,
                  rating: cachedBook.rating || '', // Include the rating
                  summary: cachedBook.summary || '', // Include the summary
                  metadata: cachedBook.metadata
                });
              } else {
                log(`Warning: No cached book found for "${bookData.title}" - this should not happen since books are cached during detection`, 'books');
                
                // Fallback: use the book data as-is
                savedBooks.push({
                  id: Math.random(), // temporary ID for response
                  userId,
                  title: bookData.title,
                  author: bookData.author || "Unknown",
                  isbn: bookData.isbn,
                  coverUrl: bookData.coverUrl,
                  rating: bookData.rating || '',
                  summary: bookData.summary || '',
                  metadata: bookData.metadata
                });
              }
              
            } catch (error) {
              log(`Error finding cached book for "${bookData.title}": ${error instanceof Error ? error.message : String(error)}`, 'books');
              
              // Fallback: use the book data as-is
              savedBooks.push({
                id: Math.random(), // temporary ID for response
                userId,
                title: bookData.title,
                author: bookData.author || "Unknown",
                isbn: bookData.isbn,
                coverUrl: bookData.coverUrl,
                rating: bookData.rating || '',
                summary: bookData.summary || '',
                metadata: bookData.metadata
              });
            }
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