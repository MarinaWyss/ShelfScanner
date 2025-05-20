import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { analyzeImage } from "./vision";
import { analyzeBookshelfImage } from "./openai-vision";
import { searchBooksByTitle, getRecommendations } from "./books";
import { getAmazonBookRating, getEstimatedBookRating } from "./amazon";
import multer from "multer";
import { z } from "zod";
import { insertPreferenceSchema, insertBookSchema, insertRecommendationSchema, insertSavedBookSchema } from "@shared/schema";

// In-memory storage for multer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
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
      
      // Enhance books with real Amazon ratings if they don't already have ratings
      books = await Promise.all(books.map(async (book: any) => {
        if (!book.rating || book.rating === "0") {
          // Try to get rating from Amazon
          const amazonRating = await getAmazonBookRating(book.title, book.author, book.isbn);
          
          if (amazonRating) {
            // If we got an Amazon rating, use it
            book.rating = amazonRating;
          } else {
            // If no rating from Amazon, use our estimation function
            book.rating = getEstimatedBookRating(book.title, book.author);
          }
        }
        return book;
      }));
      
      // Generate recommendations
      const recommendationsData = await getRecommendations(books, preferences);
      
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
  
  // Get user recommendations
  app.get('/api/recommendations', async (req: Request, res: Response) => {
    try {
      const userId = 1; // Default user ID
      
      const recommendations = await storage.getRecommendationsByUserId(userId);
      
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
  
  // Create HTTP server
  const server = createServer(app);
  return server;
}