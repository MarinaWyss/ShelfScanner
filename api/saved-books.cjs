/* eslint-disable no-undef */
// Import using CommonJS require for Vercel compatibility
require('dotenv/config');
require('@vercel/node'); // Import but don't assign to variables
const { storage } = require('../server/storage');
const { insertSavedBookSchema } = require('../shared/schema');
const { v4: uuidv4 } = require('uuid');
const { logDeviceOperation, logBookOperation } = require('../server/utils/safe-logger');
const { log } = require('../server/simple-logger');

/**
 * API handler for saved books
 * @param {import('@vercel/node').VercelRequest} req - The request object
 * @param {import('@vercel/node').VercelResponse} res - The response object
 */
module.exports = async function handler(req, res) {
  // Add comprehensive logging for debugging
  console.log('=== SAVED BOOKS API CALLED ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Cookies:', req.cookies);
  console.log('Body:', req.body);
  console.log('Environment:', process.env.NODE_ENV);
  console.log('Database URL exists:', !!process.env.DATABASE_URL);
  
  // Handle CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    return res.status(200).end();
  }

  try {
    console.log('Starting saved books processing...');
    
    // Extract device ID from cookies or generate new one
    let deviceId = req.cookies?.deviceId;
    console.log('Initial deviceId from cookies:', deviceId);
    
    if (!deviceId) {
      deviceId = uuidv4();
      console.log('Generated new deviceId:', deviceId);
      // Set cookie
      res.setHeader('Set-Cookie', `deviceId=${deviceId}; Path=/; Max-Age=${365 * 24 * 60 * 60}; SameSite=Strict; ${process.env.NODE_ENV === 'production' ? 'Secure;' : ''}`);
    }

    console.log('Using deviceId:', deviceId);

    if (req.method === 'GET') {
      console.log('Processing GET request for saved books');
      // Get saved books
      logDeviceOperation('Getting saved books', deviceId);
      
      console.log('Calling storage.getSavedBooksByDeviceId...');
      const savedBooks = await storage.getSavedBooksByDeviceId(deviceId);
      console.log('Retrieved saved books count:', savedBooks.length);
      
      // Enhance saved books with the latest data from book_cache
      console.log('Enhancing saved books with cache data...');
      const enhancedSavedBooks = await Promise.all(
        savedBooks.map(async (book) => {
          // If book has a bookCacheId, fetch the latest cache data
          if (book.bookCacheId) {
            try {
              // Get the latest cache data by ID
              const cacheEntry = await storage.getBookCacheById(book.bookCacheId);
              
              if (cacheEntry) {
                // Keep the saved book ID but use latest cache data for content
                return {
                  ...book,
                  // Use cache data if available, otherwise fallback to saved data
                  coverUrl: cacheEntry.coverUrl || book.coverUrl,
                  rating: cacheEntry.rating || book.rating,
                  summary: cacheEntry.summary || book.summary
                };
              }
            } catch (error) {
              console.error(`Error fetching cache data for book ID ${book.id}:`, error);
              log(`Error fetching cache data for book ID ${book.id}: ${error instanceof Error ? error.message : String(error)}`, 'saved-books');
            }
          }
          
          // If no bookCacheId or error fetching cache, return original book
          return book;
        })
      );
      
      console.log('Enhanced saved books count:', enhancedSavedBooks.length);
      console.log('Returning saved books successfully');
      return res.status(200).json(enhancedSavedBooks);
    }
    
    if (req.method === 'POST') {
      console.log('Processing POST request for saved books');
      // Save a book
      const { title, author, coverUrl, rating, summary } = req.body;
      console.log('Book to save:', { title, author, coverUrl, rating, summary });
      
      if (!title || !author) {
        console.log('Missing required fields: title or author');
        return res.status(400).json({ message: 'Book title and author are required' });
      }
      
      logDeviceOperation('Saving book', deviceId, `"${title}" by ${author}`);
      
      console.log('Checking if book exists in cache...');
      // First, check if book exists in cache or create it if not
      let bookCacheEntry = await storage.findBookInCache(title, author);
      console.log('Book cache entry found:', !!bookCacheEntry);
      
      // If not in cache, add it to cache first
      if (!bookCacheEntry) {
        console.log('Book not in cache, adding it first...');
        logBookOperation('Book not in cache, adding it first', title);
        
        // Create an expiration date (90 days)
        const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
        
        // Generate a unique book ID
        const bookId = req.body.isbn || `${title}-${author}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
        
        bookCacheEntry = await storage.cacheBook({
          title,
          author,
          isbn: req.body.isbn || null,
          coverUrl: coverUrl || null,
          rating: rating || null,
          summary: summary || null,
          source: 'saved', // Source is 'saved' for user-saved books
          bookId, // Add required bookId field
          metadata: req.body.metadata || null,
          expiresAt
        });
        
        console.log('Created cache entry with ID:', bookCacheEntry.id);
        logBookOperation('Created cache entry', title, author, `ID ${bookCacheEntry.id}`);
      } else {
        console.log('Found existing cache entry with ID:', bookCacheEntry.id);
        logBookOperation('Found existing cache entry', title, author, `ID ${bookCacheEntry.id}`);
      }
      
      console.log('Creating saved book record...');
      // Now create the saved book with a reference to the cache entry
      const bookToSave = {
        deviceId,
        title,
        author,
        coverUrl: coverUrl || bookCacheEntry.coverUrl,
        rating: rating || bookCacheEntry.rating,
        summary: summary || bookCacheEntry.summary,
        bookCacheId: bookCacheEntry.id
      };
      
      console.log('Book data to save:', bookToSave);
      
      // Validate book data
      const validatedData = insertSavedBookSchema.parse(bookToSave);
      console.log('Validated data:', validatedData);
      
      // Save book
      const savedBook = await storage.createSavedBook(validatedData);
      console.log('Saved book with ID:', savedBook.id);
      
      logBookOperation('Saved book', title, author, `ID ${savedBook.id}, linked to cache ID ${bookCacheEntry.id}`);
      
      console.log('Returning success response');
      return res.status(201).json(savedBook);
    }
    
    console.log('Method not allowed:', req.method);
    return res.status(405).json({ message: 'Method not allowed' });
  } catch (error) {
    console.error('=== ERROR IN SAVED BOOKS API ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('==============================');
    
    log(`Error in saved-books API: ${error instanceof Error ? error.message : String(error)}`, 'api-error');
    return res.status(500).json({ 
      message: 'Error handling saved books',
      error: error instanceof Error ? error.message : String(error),
      debug: {
        type: error.constructor.name,
        stack: error.stack
      }
    });
  }
}; 