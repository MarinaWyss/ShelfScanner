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
            
            // First, check if this book already exists and has all content
            try {
              const { bookCacheService } = await import('../server/book-cache-service.js');
              
              // Check if this book already has OpenAI content
              const existingBook = await bookCacheService.findInCache(bookData.title, bookData.author || "Unknown");
              
              let needsRating = true;
              let needsSummary = true;
              
              if (existingBook) {
                // Check if we already have a valid rating
                if (existingBook.rating && parseFloat(existingBook.rating) >= 1.0 && parseFloat(existingBook.rating) <= 5.0) {
                  needsRating = false;
                  log(`Book "${bookData.title}" already has cached rating: ${existingBook.rating}`, 'books');
                }
                
                // Check if we already have a valid summary
                if (existingBook.summary && existingBook.summary.length > 50) {
                  needsSummary = false;
                  log(`Book "${bookData.title}" already has cached summary`, 'books');
                }
              }
              
              // Only generate rating if needed
              let rating = existingBook?.rating;
              if (needsRating) {
                rating = await bookCacheService.getEnhancedRating(bookData.title, bookData.author || "Unknown", bookData.isbn);
                log(`Generated new rating for "${bookData.title}": ${rating}`, 'books');
              }
              
              // Only generate summary if needed
              let summary = existingBook?.summary;
              if (needsSummary) {
                summary = await bookCacheService.getEnhancedSummary(bookData.title, bookData.author || "Unknown", bookData.isbn);
                log(`Generated new summary for "${bookData.title}": ${summary ? 'yes' : 'no'}`, 'books');
              }
              
              // Now cache/update the book with any new content
              const bookId = `${bookData.title}-${bookData.author || "Unknown"}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
              let cachedBook;
              
              // The BookCacheService has already handled caching during getEnhancedRating/getEnhancedSummary
              // So we just need to get the final cached book data
              cachedBook = await bookCacheService.findInCache(bookData.title, bookData.author || "Unknown") || existingBook;
              
              if (cachedBook) {
                log(`Using cached book data for "${bookData.title}": rating=${cachedBook.rating}, summary=${cachedBook.summary ? 'yes' : 'no'}`, 'books');
              } else {
                log(`Warning: No cached book found for "${bookData.title}" after enhancement attempts`, 'books');
                // Fallback: create minimal cache entry
                const bookId = `${bookData.title}-${bookData.author || "Unknown"}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
                cachedBook = await storage.cacheBook({
                  title: bookData.title,
                  author: bookData.author || "Unknown",
                  isbn: bookData.isbn || null,
                  coverUrl: bookData.coverUrl || null,
                  bookId,
                  expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                });
              }
              
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
              
              // Logging is now handled above
              
            } catch (openaiError) {
              // Don't fail the entire book save if OpenAI fails
              log(`Failed to generate OpenAI content for "${bookData.title}": ${openaiError instanceof Error ? openaiError.message : String(openaiError)}`, 'books');
              
              // Check if we already have this book cached (maybe from a previous attempt)
              const { bookCacheService } = await import('../server/book-cache-service.js');
              let cachedBook = await bookCacheService.findInCache(bookData.title, bookData.author || "Unknown");
              
              if (!cachedBook) {
                // Only create a new cache entry if one doesn't exist
                const bookId = `${bookData.title}-${bookData.author || "Unknown"}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
                cachedBook = await storage.cacheBook({
                  title: bookData.title,
                  author: bookData.author || "Unknown",
                  isbn: bookData.isbn || null,
                  coverUrl: bookData.coverUrl || null,
                  bookId,
                  expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                });
                log(`Created new cache entry for "${cachedBook.title}"`, 'books');
              } else {
                log(`Using existing cache entry for "${cachedBook.title}"`, 'books');
              }
              
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