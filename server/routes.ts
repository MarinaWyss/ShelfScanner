import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { analyzeImage } from "./vision";
import { analyzeBookshelfImage } from "./openai-vision";
import { searchBooksByTitle, getRecommendations } from "./books";
import { searchEnhancedBooks } from "./enhanced-book-api";
import { getAmazonBookRating, getEstimatedBookRating } from "./amazon";
import { bookCacheService } from "./book-cache-service";
import { bookEnhancer } from "./book-enhancer";
import { getOpenAIBookDetails } from "./openai-books";
import { getOpenAIBookRating, getOpenAIBookSummary } from "./demo-openai";
import multer from "multer";
import { z } from "zod";
import { insertPreferenceSchema, insertBookSchema, insertRecommendationSchema, insertSavedBookSchema } from "@shared/schema";
import { getApiUsageStats } from "./api-stats";

// In-memory storage for multer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

import { registerEnvRoutes } from './env-routes';

import { authRoutes } from './auth-routes';

export async function registerRoutes(app: Express): Promise<Server> {
  // Register auth routes
  app.use('/api/auth', authRoutes);
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
      let cachedBook = await storage.findBookInCache(decodeURIComponent(title), decodeURIComponent(author));
      
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
      let bookData: any = {
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
  // API routes
  const apiRouter = app.route('/api');
  
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
      
      console.log("OpenAI identified book titles:", bookTitles);
      
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
      const userId = 1; // Default user ID
      
      // Validate request body
      const validatedData = insertPreferenceSchema.parse({
        ...req.body,
        userId
      });
      
      // Check if preferences already exist for this user
      const existingPreferences = await storage.getPreferencesByUserId(userId);
      
      let preferences;
      if (existingPreferences) {
        // Update existing preferences
        preferences = await storage.updatePreference(existingPreferences.id, validatedData);
      } else {
        // Create new preferences
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
      const userId = 1; // Default user ID
      
      const preferences = await storage.getPreferencesByUserId(userId);
      
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
  
  // Save books
  app.post('/api/books', async (req: Request, res: Response) => {
    try {
      const userId = 1; // Default user ID
      
      // Handle both single book and array of books
      const booksToSave = Array.isArray(req.body) ? req.body : [req.body];
      
      const savedBooks = [];
      
      for (const bookData of booksToSave) {
        // Validate book data
        const validatedData = insertBookSchema.parse({
          ...bookData,
          userId
        });
        
        // Save book
        const book = await storage.createBook(validatedData);
        savedBooks.push(book);
      }
      
      return res.status(201).json(savedBooks);
    } catch (error) {
      console.error('Error saving books:', error);
      return res.status(400).json({ 
        message: 'Error saving books',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Get user books
  app.get('/api/books', async (req: Request, res: Response) => {
    try {
      const userId = 1; // Default user ID
      
      const books = await storage.getBooksByUserId(userId);
      
      return res.status(200).json(books);
    } catch (error) {
      console.error('Error getting books:', error);
      return res.status(500).json({ 
        message: 'Error getting books',
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
      
      // Get books from request or from storage
      let books = req.body.books || await storage.getBooksByUserId(userId);
      
      if (!books || books.length === 0) {
        return res.status(400).json({ message: 'No books provided or found for this user' });
      }
      
      // Enhance books with OpenAI-generated ratings and summaries
      books = await Promise.all(books.map(async (book: any) => {
        // Always try to get rating from OpenAI first
        try {
          // Use the book cache service to get an enhanced rating
          const openAIRating = await bookCacheService.getEnhancedRating(book.title, book.author, book.isbn);
          if (openAIRating) {
            book.rating = openAIRating;
            console.log(`Using OpenAI rating for "${book.title}": ${openAIRating}`);
          }
        } catch (error) {
          console.error(`Error getting OpenAI rating for "${book.title}":`, error);
          
          // Fallback to Amazon rating if OpenAI fails
          const amazonRating = await getAmazonBookRating(book.title, book.author, book.isbn);
          if (amazonRating) {
            book.rating = amazonRating;
          } else {
            // Last resort - use estimation
            book.rating = getEstimatedBookRating(book.title, book.author);
          }
        }
        
        // Also enhance the book summary with OpenAI if it's missing or too short
        if (!book.summary || book.summary.length < 100) {
          try {
            const summary = await bookCacheService.getEnhancedSummary(book.title, book.author);
            if (summary) {
              book.summary = summary;
              console.log(`Enhanced summary for "${book.title}" with OpenAI`);
            }
          } catch (error) {
            console.error(`Error getting OpenAI summary for "${book.title}":`, error);
          }
        }
        
        return book;
      }));
      
      // Generate recommendations
      const recommendationsData = await getRecommendations(books, preferences);
      
      // Enhance recommendations with OpenAI content
      for (const recommendation of recommendationsData) {
        // Only enhance if summary is missing or too short
        if (!recommendation.summary || recommendation.summary.length < 100) {
          try {
            const summary = await bookCacheService.getEnhancedSummary(recommendation.title, recommendation.author);
            if (summary) {
              recommendation.summary = summary;
              console.log(`Enhanced recommendation summary for "${recommendation.title}" with OpenAI`);
            }
          } catch (error) {
            console.error(`Error getting OpenAI summary for recommendation "${recommendation.title}":`, error);
          }
        }
        
        // If rating is missing or zero, get one from OpenAI
        if (!recommendation.rating || recommendation.rating === "0") {
          try {
            const rating = await bookCacheService.getEnhancedRating(recommendation.title, recommendation.author);
            if (rating) {
              recommendation.rating = rating;
              console.log(`Enhanced recommendation rating for "${recommendation.title}" with OpenAI: ${rating}`);
            }
          } catch (error) {
            console.error(`Error getting OpenAI rating for recommendation "${recommendation.title}":`, error);
          }
        }
      }
      
      // Save recommendations
      const savedRecommendations = [];
      
      for (const recommendation of recommendationsData) {
        // Find matching book - or use the first book as a reference
        const matchingBook = books.find((b: any) => 
          b.title === recommendation.title || 
          (recommendation.isbn && b.isbn === recommendation.isbn)
        ) || books[0];
        
        // Ensure we have a valid bookId
        const bookId = matchingBook?.id || 1;
        
        // Validate recommendation data
        const validatedData = insertRecommendationSchema.parse({
          userId,
          bookId, // Use the determined bookId
          title: recommendation.title,
          author: recommendation.author,
          coverUrl: recommendation.coverUrl || null,
          summary: recommendation.summary || null,
          rating: typeof recommendation.rating === 'string' ? recommendation.rating : (recommendation.rating?.toString() || "0")
        });
        
        // Save recommendation
        const savedRecommendation = await storage.createRecommendation(validatedData);
        savedRecommendations.push(savedRecommendation);
      }
      
      return res.status(200).json(savedRecommendations);
    } catch (error) {
      console.error('Error generating recommendations:', error);
      return res.status(500).json({ 
        message: 'Error generating recommendations',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Get user recommendations with enhanced OpenAI content
  app.get('/api/recommendations', async (req: Request, res: Response) => {
    try {
      const userId = 1; // Default user ID
      const sessionId = req.query.sessionId || '';
      
      // IMPORTANT: Clear all previous recommendations before returning new ones
      // This ensures we only show recommendations from the current image
      if (!sessionId) {
        // If no sessionId provided, delete all previous recommendations
        await storage.deleteAllRecommendations(userId);
        console.log('Cleared all previous recommendations to ensure fresh results');
      }
      
      // Get recommendations from storage (now only the latest ones will exist)
      let recommendations = await storage.getRecommendationsByUserId(userId);
      
      console.log(`Retrieved ${recommendations.length} recommendations for current session`);
      
      // Enhance recommendations with OpenAI-generated content when needed
      recommendations = await Promise.all(recommendations.map(async (recommendation) => {
        // Get OpenAI summary if missing
        if (!recommendation.summary) {
          try {
            // Get the enhanced summary from OpenAI through the cache service
            const enhancedSummary = await bookCacheService.getEnhancedSummary(
              recommendation.title, 
              recommendation.author
            );
            
            if (enhancedSummary) {
              // Update the recommendation object
              recommendation.summary = enhancedSummary;
              
              // Also update in the database for future requests
              await storage.updateRecommendation(recommendation.id, {
                summary: enhancedSummary
              });
              
              console.log(`Enhanced recommendation summary for "${recommendation.title}" with OpenAI`);
            }
          } catch (error) {
            console.error(`Error enhancing recommendation summary for "${recommendation.title}":`, error);
          }
        }
        
        // Get enhanced rating if missing
        if (!recommendation.rating) {
          try {
            const enhancedRating = await bookCacheService.getEnhancedRating(
              recommendation.title, 
              recommendation.author
            );
            
            if (enhancedRating) {
              // Update the recommendation object
              recommendation.rating = enhancedRating;
              
              // Also update in the database for future requests
              await storage.updateRecommendation(recommendation.id, {
                rating: enhancedRating
              });
              
              console.log(`Enhanced recommendation rating for "${recommendation.title}" with OpenAI: ${enhancedRating}`);
            }
          } catch (error) {
            console.error(`Error enhancing recommendation rating for "${recommendation.title}":`, error);
          }
        }
        
        return recommendation;
      }));
      
      return res.status(200).json(recommendations);
    } catch (error) {
      console.error('Error getting recommendations:', error);
      return res.status(500).json({ 
        message: 'Error getting recommendations',
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
      
      // Return empty array instead of 404 for no books
      return res.status(200).json(savedBooks);
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
      
      // Prepare book data with device ID
      const bookToSave = {
        ...req.body,
        deviceId
      };
      
      // Validate book data
      const validatedData = insertSavedBookSchema.parse(bookToSave);
      
      // Save book
      const savedBook = await storage.createSavedBook(validatedData);
      
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