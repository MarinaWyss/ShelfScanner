import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { analyzeBookshelfImage } from "./openai-vision";
import { searchBooksByTitle, getRecommendations } from "./books";
import { searchEnhancedBooks } from "./enhanced-book-api";
import { bookCacheService } from "./book-cache-service";
import { bookEnhancer } from "./book-enhancer";
import { getOpenAIBookDetails } from "./openai-books";
import { getOpenAIBookRating, getOpenAIBookSummary } from "./utils/openai-utils";
import multer from "multer";
import { insertPreferenceSchema, insertSavedBookSchema } from "@shared/schema";
import { getApiUsageStats } from "./api-stats";

// In-memory storage for multer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

import { registerEnvRoutes } from './env-routes';
import { adminMonitoringRoutes } from './admin-monitoring';

import { directOpenAIRoutes } from './direct-openai-routes';

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth routes have been removed
  
  // Register admin monitoring routes (protected by authentication)
  app.use('/api/admin', adminMonitoringRoutes);
  
  // Register direct OpenAI routes for fresh, high-quality book recommendations
  app.use('/api/direct', directOpenAIRoutes);
  

  // Clean up non-OpenAI ratings to ensure consistent OpenAI-generated content
  try {
    const cleanedCount = await bookCacheService.cleanupNonOpenAIRatings();
    console.log(`Cleaned up ${cleanedCount} non-OpenAI ratings from cache during startup`);
  } catch (error) {
    console.error('Error cleaning up non-OpenAI ratings:', error);
  }

  // Make environment variables available to the frontend
  app.get('/api/env', (req, res) => {
    res.json({
      ADSENSE_PUBLISHER_ID: process.env.ADSENSE_PUBLISHER_ID || '',
    });
  });
  // Register environment routes
  registerEnvRoutes(app);
  
  // Enhanced book search endpoint with OpenAI-powered data
  app.get('/api/enhanced-books', async (req: Request, res: Response) => {
    try {
      const { title } = req.query;
      
      if (!title || typeof title !== 'string') {
        return res.status(400).json({ message: "Title parameter is required" });
      }
      
      // Use our new enhanced book search with OpenAI-powered data
      const books = await searchEnhancedBooks(title);
      res.json(books);
    } catch (error) {
      console.error("Error searching for enhanced books:", error);
      res.status(500).json({ message: "Error retrieving book information" });
    }
  });
  
  // Book details endpoint with OpenAI-generated ratings and summaries
  app.get('/api/book-details/:title/:author', async (req: Request, res: Response) => {
    try {
      const { title, author } = req.params;
      
      if (!title || !author) {
        return res.status(400).json({ message: "Both title and author are required" });
      }
      
      // Check cache first
      const cachedBook = await storage.findBookInCache(decodeURIComponent(title), decodeURIComponent(author));
      
      if (cachedBook) {
        return res.json({
          title: cachedBook.title,
          author: cachedBook.author,
          isbn: cachedBook.isbn,
          coverUrl: cachedBook.coverUrl,
          rating: cachedBook.rating,
          summary: cachedBook.summary,
          metadata: cachedBook.metadata,
          source: cachedBook.source,
          fromCache: true
        });
      }
      
      // If not in cache, generate data with OpenAI
      const bookData: any = {
        title: decodeURIComponent(title),
        author: decodeURIComponent(author)
      };
      
      // Get enhanced rating
      const rating = await bookCacheService.getEnhancedRating(bookData.title, bookData.author);
      if (rating) {
        bookData.rating = rating;
      }
      
      // Get enhanced summary
      const summary = await bookCacheService.getEnhancedSummary(bookData.title, bookData.author);
      if (summary) {
        bookData.summary = summary;
      }
      
      // Return the enhanced book data
      res.json({
        ...bookData,
        fromCache: false
      });
    } catch (error) {
      console.error("Error getting book details:", error);
      res.status(500).json({ message: "Error retrieving book details" });
    }
  });
  
  // Upload and analyze bookshelf image
  app.post('/api/books/analyze', upload.single('image'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No image file provided' });
      }

      const userId = 1; // Default user ID
      
      // Get user preferences to match with detected books
      const preferences = await storage.getPreferencesByUserId(userId);
      
      // Convert buffer to base64
      const base64Image = req.file.buffer.toString('base64');
      
      // Use OpenAI Vision API to identify book titles in the image
      const visionAnalysis = await analyzeBookshelfImage(base64Image);
      
      if (!visionAnalysis.isBookshelf) {
        return res.status(200).json({
          books: [],
          bookTitles: [],
          message: "The image doesn't appear to be a bookshelf. Please upload a photo of books on a shelf."
        });
      }
      
      // Use the titles identified by OpenAI Vision
      const bookTitles = visionAnalysis.bookTitles;
      
      if (process.env.NODE_ENV === 'development') {
        console.log("OpenAI identified book titles:", bookTitles);
      }
      
      if (bookTitles.length === 0) {
        return res.status(200).json({
          books: [],
          bookTitles: [],
          message: "No books could be clearly identified in the image. Try taking a clearer photo with better lighting and make sure book titles are visible."
        });
      }
      
      // Search for books based on the identified titles
      const detectedBooks: any[] = [];
      
      for (const title of bookTitles) {
        const bookResults = await searchBooksByTitle(title);
        
        if (bookResults && bookResults.length > 0) {
          // Find the closest match to the exact title identified by OpenAI
          const titleLower = title.toLowerCase();
          
          const bestMatch = bookResults.reduce((best: any, current: any) => {
            const currentTitle = current.title.toLowerCase();
            const currentSimilarity = calculateSimilarity(titleLower, currentTitle);
            const bestSimilarity = best ? calculateSimilarity(titleLower, best.title.toLowerCase()) : 0;
            
            return currentSimilarity > bestSimilarity ? current : best;
          }, null);
          
          if (bestMatch && calculateSimilarity(titleLower, bestMatch.title.toLowerCase()) > 0.6) {
            detectedBooks.push(bestMatch);
          }
        }
      }
      
      // If no books were detected, provide a helpful message
      if (detectedBooks.length === 0) {
        return res.status(200).json({
          books: [], 
          bookTitles,
          message: "We identified some book titles, but couldn't find detailed information for them. Try taking a clearer photo with better lighting."
        });
      }
      
      // Create a debug message listing the books found in the image
      const bookTitlesFound = detectedBooks.map(book => book.title).join(", ");
      
      // If no preferences exist, just return the detected books
      if (!preferences) {
        return res.status(200).json({
          books: detectedBooks, 
          bookTitles,
          booksFound: bookTitlesFound,
          message: `Found ${detectedBooks.length} books in your photo: ${bookTitlesFound}. Set preferences to get rankings.`
        });
      }
      
      // Score and rank ONLY the detected books based on user preferences
      const rankedBooks = detectedBooks.map(book => {
        // Initialize match score
        let matchScore = 0;
        
        // Match against preferred genres
        if (preferences.genres && book.categories) {
          for (const genre of preferences.genres) {
            if (book.categories.some((category: string) => 
              category && category.toLowerCase().includes(genre.toLowerCase()))) {
              matchScore += 3;
            }
          }
        }
        
        // Match against preferred authors
        if (preferences.authors && book.author) {
          for (const author of preferences.authors) {
            if (book.author.toLowerCase().includes(author.toLowerCase())) {
              matchScore += 5;
            }
          }
        }
        
        // Check Goodreads data for highly rated books by same author or genre
        if (preferences.goodreadsData && Array.isArray(preferences.goodreadsData)) {
          for (const entry of preferences.goodreadsData) {
            // Match author from Goodreads
            if (entry["Author"] && book.author && 
                entry["Author"].toLowerCase().includes(book.author.toLowerCase())) {
              matchScore += 2;
              
              // Add bonus if it was highly rated
              if (entry["My Rating"] && parseInt(entry["My Rating"]) >= 4) {
                matchScore += 3;
              }
            }
            
            // Exact title match is a strong signal
            if (entry["Title"] && entry["Title"].toLowerCase() === book.title.toLowerCase()) {
              const rating = entry["My Rating"] ? parseInt(entry["My Rating"]) : 0;
              if (rating >= 4) {
                matchScore += 8; // You already read and liked this book!
              } else if (rating > 0) {
                matchScore += rating; // Score based on your rating
              }
            }
            
            // Match shelf categories from Goodreads
            if (entry["Bookshelves"] && book.categories) {
              const shelves = entry["Bookshelves"].split(';').map((s: string) => s.trim().toLowerCase());
              for (const shelf of shelves) {
                if (book.categories.some((category: string) => 
                  category && category.toLowerCase().includes(shelf))) {
                  matchScore += 1;
                  
                  // Add bonus if it was highly rated
                  if (entry["My Rating"] && parseInt(entry["My Rating"]) >= 4) {
                    matchScore += 2;
                  }
                }
              }
            }
          }
        }
        
        return {
          ...book,
          matchScore
        };
      });
      
      // Sort by match score (highest first)
      rankedBooks.sort((a, b) => b.matchScore - a.matchScore);
      
      // Return the ranked books found in the image
      return res.status(200).json({
        books: rankedBooks, 
        bookTitles,
        booksFound: bookTitlesFound,
        message: `Found ${detectedBooks.length} books in your photo: ${bookTitlesFound}. These have been ranked based on your preferences.`
      });
    } catch (error) {
      console.error('Error processing image:', error);
      return res.status(500).json({ 
        message: 'Error processing image',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Helper function to calculate similarity between two strings
  function calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) {
      return 1.0;
    }
    
    // Calculate Levenshtein distance
    const distance = levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }
  
  // Levenshtein distance calculation for string similarity
  function levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    
    // Initialize the matrix
    for (let i = 0; i <= str1.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str2.length; j++) {
      matrix[0][j] = j;
    }
    
    // Fill the matrix
    for (let i = 1; i <= str1.length; i++) {
      for (let j = 1; j <= str2.length; j++) {
        const cost = str1.charAt(i - 1) === str2.charAt(j - 1) ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost  // substitution
        );
      }
    }
    
    return matrix[str1.length][str2.length];
  }

  // Save user preferences
  app.post('/api/preferences', async (req: Request, res: Response) => {
    try {
      // Extract deviceId from request
      const deviceId = req.deviceId;
      
      if (!deviceId) {
        return res.status(400).json({ message: 'Device ID is required' });
      }
      
      // For backward compatibility we still include userId but use deviceId as primary identifier
      const userId = 1;
      
      // Validate request body
      const validatedData = insertPreferenceSchema.parse({
        ...req.body,
        userId,
        deviceId
      });
      
      // Check if preferences already exist for this specific device
      const existingPreferences = await storage.getPreferencesByDeviceId(deviceId);
      
      let preferences;
      if (existingPreferences) {
        // Update existing preferences
        preferences = await storage.updatePreference(existingPreferences.id, validatedData);
      } else {
        // Create brand new preferences for this device
        preferences = await storage.createPreference(validatedData);
      }
      
      return res.status(201).json(preferences);
    } catch (error) {
      console.error('Error saving preferences:', error);
      return res.status(400).json({ 
        message: 'Error saving preferences',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Get user preferences
  app.get('/api/preferences', async (req: Request, res: Response) => {
    try {
      // Extract deviceId from request
      const deviceId = req.deviceId;
      
      if (!deviceId) {
        return res.status(400).json({ message: 'Device ID is required' });
      }
      
      // Only get preferences specific to this device ID
      const preferences = await storage.getPreferencesByDeviceId(deviceId);
      
      // If no preferences, don't fall back to shared ones
      // New devices should start fresh with their own preferences
      
      if (!preferences) {
        return res.status(404).json({ message: 'Preferences not found' });
      }
      
      return res.status(200).json(preferences);
    } catch (error) {
      console.error('Error getting preferences:', error);
      return res.status(500).json({ 
        message: 'Error getting preferences',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Books API has been updated to use book_cache instead of the deprecated books table
  // However, we still need this endpoint for compatibility with the frontend
  
  // Save books endpoint (redirects to use book_cache internally)
  app.post('/api/books', async (req: Request, res: Response) => {
    try {
      const userId = 1; // Default user ID
      
      // Handle both single book and array of books
      const booksToSave = Array.isArray(req.body) ? req.body : [req.body];
      
      const savedBooks = [];
      
      for (const bookData of booksToSave) {
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
      }
      
      return res.status(200).json(savedBooks);
    } catch (error) {
      console.error('Error saving books:', error);
      return res.status(400).json({ 
        message: 'Error saving books',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Get recommendations
  app.post('/api/recommendations', async (req: Request, res: Response) => {
    try {
      const userId = 1; // Default user ID
      
      // Get user preferences
      const preferences = await storage.getPreferencesByUserId(userId);
      
      if (!preferences) {
        return res.status(404).json({ message: 'Preferences not found' });
      }
      
      // IMPORTANT: Only use books from the current image - no longer using stored books
      let books = req.body.books || [];
      
      if (!books || books.length === 0) {
        return res.status(400).json({ message: 'No books provided in the current image' });
      }
      
      console.log(`Processing ${books.length} books from current image only`);
      
      // Process books: First check cache, then get OpenAI data if needed, and store in cache
      books = await Promise.all(books.map(async (book: any) => {
        console.log(`Processing book: "${book.title}" by ${book.author}`);
        
        // First check if we have this book in cache with OpenAI data
        const cachedBook = await storage.findBookInCache(book.title, book.author);
        
        if (cachedBook && cachedBook.source === 'openai') {
          // We have cache hit - use cached data
          console.log(`Using cached OpenAI data for "${book.title}"`);
          
          // Apply cached rating if available
          if (cachedBook.rating) {
            book.rating = cachedBook.rating;
            console.log(`Using cached OpenAI rating for "${book.title}": ${cachedBook.rating}`);
          }
          
          // Apply cached summary if available
          if (cachedBook.summary) {
            book.summary = cachedBook.summary;
            console.log(`Using cached OpenAI summary for "${book.title}"`);
          }
        }
        
        // If rating is still missing, get fresh rating from OpenAI
        if (!book.rating) {
          try {
            const rating = await bookCacheService.getEnhancedRating(book.title, book.author, book.isbn);
            if (rating) {
              book.rating = rating;
              console.log(`Got fresh OpenAI rating for "${book.title}": ${rating}`);
            }
          } catch (error) {
            console.error(`Error getting OpenAI rating for "${book.title}":`, error);
            book.rating = '';  // Leave empty rather than using fallbacks
          }
        }
        
        // If summary is missing or too short, get fresh summary from OpenAI
        if (!book.summary || book.summary.length < 100) {
          try {
            const summary = await bookCacheService.getEnhancedSummary(book.title, book.author);
            if (summary) {
              book.summary = summary;
              console.log(`Got fresh OpenAI summary for "${book.title}"`);
            }
          } catch (error) {
            console.error(`Error getting OpenAI summary for "${book.title}":`, error);
            book.summary = '';  // Leave empty rather than using fallbacks
          }
        }
        
        // Ensure everything we got from OpenAI is cached for future use
        try {
          if (book.rating || book.summary) {
            const bookId = book.isbn || `${book.title}-${book.author}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
            await storage.cacheBook({
              title: book.title,
              author: book.author,
              isbn: book.isbn || null,
              coverUrl: book.coverUrl || null,
              rating: book.rating || null,
              summary: book.summary || null,
              source: 'openai',
              bookId,
              metadata: {
                publisher: book.publisher || null,
                categories: book.categories || null
              },
              expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 365 days cache
            });
            console.log(`Cached OpenAI data for "${book.title}"`);
          }
        } catch (cacheError) {
          console.error(`Error caching book data for "${book.title}":`, cacheError);
        }
        
        return book;
      }));
      
      // Generate recommendations
      const recommendationsData = await getRecommendations(books, preferences);
      
      // Determine if we're using OpenAI or fallback algorithm for recommendations
      const isUsingOpenAI = recommendationsData.some(rec => rec.matchReason && rec.matchReason.length > 0);
      console.log(`Using ${isUsingOpenAI ? 'OpenAI' : 'fallback algorithm'} for recommendations`);
      
      // Enhance each recommendation with OpenAI data and cache it for future use
      const enhancedRecommendations = await Promise.all(recommendationsData.map(async (recommendation: any) => {
        // If this is a fallback recommendation without a match reason, add a fallback explanation
        if (!isUsingOpenAI && (!recommendation.matchReason || recommendation.matchReason.length === 0)) {
          recommendation.matchReason = "using fallback algo";
        }
        console.log(`Enhancing recommendation: "${recommendation.title}" by ${recommendation.author}`);
        
        // First check if we have this recommendation in cache
        const cachedBook = await storage.findBookInCache(recommendation.title, recommendation.author);
        
        if (cachedBook && cachedBook.source === 'openai') {
          // Use cached OpenAI data if available
          console.log(`Using cached OpenAI data for recommendation "${recommendation.title}"`);
          
          // Use cached rating
          if (cachedBook.rating) {
            recommendation.rating = cachedBook.rating;
            console.log(`Using cached OpenAI rating for recommendation "${recommendation.title}": ${cachedBook.rating}`);
          }
          
          // Use cached summary
          if (cachedBook.summary) {
            recommendation.summary = cachedBook.summary;
            console.log(`Using cached OpenAI summary for recommendation "${recommendation.title}"`);
          }
        }
        
        // If we still don't have a rating, get it from OpenAI
        if (!recommendation.rating || recommendation.rating === "0") {
          try {
            const rating = await bookCacheService.getEnhancedRating(recommendation.title, recommendation.author);
            if (rating) {
              recommendation.rating = rating;
              console.log(`Got fresh OpenAI rating for recommendation "${recommendation.title}": ${rating}`);
            }
          } catch (error) {
            console.error(`Error getting OpenAI rating for recommendation "${recommendation.title}":`, error);
          }
        }
        
        // If summary is missing or too short, get it from OpenAI
        if (!recommendation.summary || recommendation.summary.length < 100) {
          try {
            const summary = await bookCacheService.getEnhancedSummary(recommendation.title, recommendation.author);
            if (summary) {
              recommendation.summary = summary;
              console.log(`Got fresh OpenAI summary for recommendation "${recommendation.title}"`);
            }
          } catch (error) {
            console.error(`Error getting OpenAI summary for recommendation "${recommendation.title}":`, error);
          }
        }
        
        // Only cache if we don't already have this book in the cache
        // or if we got fresh data from OpenAI that needs to be stored
        try {
          // We only need to update the cache if we got fresh data or the book wasn't in cache
          const needsCaching = (!cachedBook) || 
                              (cachedBook && (
                                (recommendation.rating && recommendation.rating !== cachedBook.rating) || 
                                (recommendation.summary && recommendation.summary !== cachedBook.summary)
                              ));
          
          if (needsCaching && (recommendation.rating || recommendation.summary)) {
            const bookId = recommendation.isbn || 
              `${recommendation.title}-${recommendation.author}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
            
            await storage.cacheBook({
              title: recommendation.title,
              author: recommendation.author,
              isbn: recommendation.isbn || null,
              coverUrl: recommendation.coverUrl || null,
              rating: recommendation.rating || null,
              summary: recommendation.summary || null,
              source: 'openai',
              bookId, // Add required bookId field
              metadata: {
                publisher: recommendation.publisher || null,
                categories: recommendation.categories || null
              },
              expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 365 days cache
            });
            console.log(`Cached OpenAI data for recommendation "${recommendation.title}" - ${needsCaching ? "new or updated data" : "already in cache"}`);
          } else {
            console.log(`Skipping cache for "${recommendation.title}" - already in cache with same data`);
          }
        } catch (cacheError) {
          console.error(`Error caching recommendation data for "${recommendation.title}":`, cacheError);
        }
        
        return recommendation;
      }));
      
      // Return recommendations directly without storing in database
      console.log(`Returning ${enhancedRecommendations.length} recommendations directly to client`);
      return res.status(200).json(enhancedRecommendations);
    } catch (error) {
      console.error('Error generating recommendations:', error);
      return res.status(500).json({ 
        message: 'Error generating recommendations',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Get user recommendations - IMPROVED to work with ephemeral recommendations
  app.get('/api/recommendations', async (req: Request, res: Response) => {
    try {
      // Since recommendations are now ephemeral and generated on-demand,
      // we need to inform the client that they should use the POST endpoint
      console.log('GET /api/recommendations requested, but recommendations are now ephemeral');
      
      return res.status(200).json({ 
        message: 'Recommendations are now generated on-demand and not stored. Please use POST /api/recommendations with your detected books to get recommendations.',
        recommendations: [] 
      });
    } catch (error) {
      console.error('Error with recommendations endpoint:', error);
      return res.status(500).json({ 
        message: 'Error with recommendations endpoint',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Saved Books API Endpoints
  
  // Get saved books for a device
  app.get('/api/saved-books', async (req: Request, res: Response) => {
    try {
      // Extract deviceId from cookie
      const deviceId = req.cookies.deviceId || '';
      console.log('GetSavedBooks - Device ID from cookie:', deviceId);
      
      // Validate deviceId
      if (!deviceId) {
        console.log('GetSavedBooks - No device ID provided');
        return res.status(400).json({ message: 'Device ID is required' });
      }
      
      // Get saved books
      const savedBooks = await storage.getSavedBooksByDeviceId(deviceId);
      console.log(`GetSavedBooks - Found ${savedBooks.length} books for device ${deviceId}`);
      
      // Enhance saved books with the latest data from book_cache
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
            }
          }
          
          // If no bookCacheId or error fetching cache, return original book
          return book;
        })
      );
      
      // Return empty array instead of 404 for no books
      return res.status(200).json(enhancedSavedBooks);
    } catch (error) {
      console.error('Error getting saved books:', error);
      return res.status(500).json({ 
        message: 'Error getting saved books',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Save a book
  app.post('/api/saved-books', async (req: Request, res: Response) => {
    try {
      // Extract deviceId from cookie
      const deviceId = req.cookies.deviceId || '';
      
      // Validate deviceId
      if (!deviceId) {
        return res.status(400).json({ message: 'Device ID is required' });
      }
      
      const { title, author, coverUrl, rating, summary } = req.body;
      
      if (!title || !author) {
        return res.status(400).json({ message: 'Book title and author are required' });
      }
      
      console.log(`Saving book "${title}" by ${author} for device ${deviceId}`);
      
      // First, check if book exists in cache or create it if not
      let bookCacheEntry = await storage.findBookInCache(title, author);
      
      // If not in cache, add it to cache first
      if (!bookCacheEntry) {
        console.log(`Book "${title}" not in cache, adding it first`);
        
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
        
        console.log(`Created cache entry for "${title}" with ID ${bookCacheEntry.id}`);
      } else {
        console.log(`Found existing cache entry for "${title}" with ID ${bookCacheEntry.id}`);
      }
      
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
      
      // Validate book data
      const validatedData = insertSavedBookSchema.parse(bookToSave);
      
      // Save book
      const savedBook = await storage.createSavedBook(validatedData);
      
      console.log(`Saved book "${title}" with ID ${savedBook.id}, linked to cache ID ${bookCacheEntry.id}`);
      
      return res.status(201).json(savedBook);
    } catch (error) {
      console.error('Error saving book:', error);
      return res.status(400).json({ 
        message: 'Error saving book',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Delete a saved book
  app.delete('/api/saved-books/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ message: 'Invalid book ID' });
      }
      
      // Delete the saved book
      const deleted = await storage.deleteSavedBook(id);
      
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
  });
  
  // Keep the /api/stats endpoint as it might be used internally for monitoring
  app.get('/api/stats', async (req: Request, res: Response) => {
    try {
      const stats = getApiUsageStats();
      return res.status(200).json(stats);
    } catch (error) {
      console.error('Error getting API statistics:', error);
      return res.status(500).json({ 
        message: 'Error getting API statistics',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Endpoint to enhance saved books with OpenAI-generated summaries and ratings
  app.post('/api/enhance-saved-books', async (req: Request, res: Response) => {
    try {
      // Extract deviceId from cookie or request body
      const deviceId = req.cookies.deviceId || req.body.deviceId;
      
      if (!deviceId) {
        return res.status(400).json({ message: 'Device ID is required' });
      }
      
      console.log(`Enhancing saved books for device ${deviceId}`);
      
      // Call the book enhancer to improve book data using OpenAI
      const enhancedCount = await bookEnhancer.enhanceSavedBooks(deviceId);
      
      // Retrieve the enhanced books
      const savedBooks = await storage.getSavedBooksByDeviceId(deviceId);
      
      return res.status(200).json({ 
        message: `Enhanced ${enhancedCount} books with AI-generated summaries and ratings`,
        books: savedBooks
      });
    } catch (error) {
      console.error('Error enhancing saved books:', error);
      return res.status(500).json({ 
        message: 'Error enhancing saved books',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Endpoint to enhance a single book with OpenAI data
  app.post('/api/enhance-book', async (req: Request, res: Response) => {
    try {
      const { title, author, isbn } = req.body;
      
      if (!title || !author) {
        return res.status(400).json({ message: 'Book title and author are required' });
      }
      
      console.log(`Enhancing book: "${title}" by ${author}`);
      
      // Use the book enhancer to get improved data
      const enhancedBook = await bookEnhancer.enhanceBook({
        title,
        author,
        isbn
      });
      
      return res.status(200).json(enhancedBook);
    } catch (error) {
      console.error('Error enhancing book:', error);
      return res.status(500).json({ 
        message: 'Error enhancing book data',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Simple demo endpoint that clearly shows OpenAI generated ratings and summaries
  app.get('/api/demo/openai-book', async (req: Request, res: Response) => {
    try {
      const { title, author } = req.query;
      
      if (!title || !author || typeof title !== 'string' || typeof author !== 'string') {
        return res.status(400).json({ message: 'Title and author are required as query parameters' });
      }
      
      console.log(`DEMO: Getting OpenAI rating and summary for "${title}" by ${author}`);
      
      // Get direct OpenAI rating
      const rating = await getOpenAIBookRating(title, author);
      
      // Get direct OpenAI summary
      const summary = await getOpenAIBookSummary(title, author);
      
      return res.status(200).json({
        title,
        author,
        rating,
        summary,
        source: 'openai-direct',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error in OpenAI book demo:', error);
      return res.status(500).json({ 
        message: 'Error getting OpenAI book data',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Endpoint to get book information directly from OpenAI
  app.get('/api/openai-book', async (req: Request, res: Response) => {
    try {
      const { title, author } = req.query;
      
      if (!title || !author || typeof title !== 'string' || typeof author !== 'string') {
        return res.status(400).json({ message: 'Title and author are required as query parameters' });
      }
      
      console.log(`Getting OpenAI book details for "${title}" by ${author}`);
      
      // Get book details using OpenAI exclusively
      const bookDetails = await getOpenAIBookDetails(title, author);
      
      return res.status(200).json({
        ...bookDetails,
        requestedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting OpenAI book details:', error);
      return res.status(500).json({ 
        message: 'Error getting book details from OpenAI',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Admin endpoint to update the book cache for testing
  app.post('/api/admin/test-cache', async (req: Request, res: Response) => {
    try {
      const { preserveDescriptions = true, titleFilter } = req.body;
      
      const count = await bookCacheService.clearCacheForTesting({
        preserveDescriptions,
        titleFilter
      });
      
      return res.status(200).json({ 
        message: `Successfully updated ${count} cache entries for testing (preserving descriptions: ${preserveDescriptions})`,
        success: true,
        count
      });
    } catch (error) {
      return res.status(500).json({ 
        message: 'Error updating cache for testing', 
        error: error instanceof Error ? error.message : String(error),
        success: false
      });
    }
  });
  
  // Test endpoint for OpenAI connection
  app.get('/api/test/openai', async (_req: Request, res: Response) => {
    try {
      // Import the test function
      const { testOpenAI } = await import('./openai-test');
      
      // Run the test
      const result = await testOpenAI();
      
      // Return the result
      res.json(result);
    } catch (error) {
      console.error('Error testing OpenAI:', error);
      res.status(500).json({ 
        message: 'Error testing OpenAI',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Test endpoint for OpenAI-powered recommendations
  app.post('/api/test/ai-recommendations', async (req: Request, res: Response) => {
    try {
      const { books, preferences } = req.body;
      
      if (!books || !Array.isArray(books) || books.length === 0) {
        return res.status(400).json({ message: 'Please provide a non-empty array of books' });
      }
      
      // Import the OpenAI recommendations function
      const { getOpenAIRecommendations } = await import('./openai-recommendations');
      
      console.log(`Testing AI recommendations with ${books.length} books`);
      
      // Get AI-powered recommendations
      const recommendations = await getOpenAIRecommendations(books, preferences || {});
      
      console.log(`Received ${recommendations.length} AI-powered recommendations`);
      
      // Return the recommendations
      res.json({
        message: `Successfully generated ${recommendations.length} AI-powered recommendations`,
        recommendations
      });
    } catch (error) {
      console.error('Error generating AI recommendations:', error);
      res.status(500).json({ 
        message: 'Error generating AI recommendations',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Create HTTP server
  const server = createServer(app);
  return server;
}