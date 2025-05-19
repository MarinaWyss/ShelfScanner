import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { analyzeImage } from "./vision";
import { searchBooksByTitle, getRecommendations } from "./books";
import multer from "multer";
import { z } from "zod";
import { insertPreferenceSchema, insertBookSchema, insertRecommendationSchema } from "@shared/schema";

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
      
      // Analyze the image using Google Vision API
      const analysis = await analyzeImage(base64Image);
      
      // Extract potential book titles from the image text
      const bookTitles = analysis.text.split('\n')
        .filter((line: string) => line.length > 3) // Filter out very short lines
        .slice(0, 10); // Take up to 10 potential titles
      
      console.log("Extracted potential book titles:", bookTitles);
      
      // Search for books based on extracted text
      const detectedBooks = [];
      for (const title of bookTitles) {
        const bookResults = await searchBooksByTitle(title);
        if (bookResults.length > 0) {
          detectedBooks.push(...bookResults);
        }
      }
      
      // If no preferences exist, just return the detected books
      if (!preferences) {
        return res.status(200).json({
          books: detectedBooks.slice(0, 8), 
          analysis,
          message: "Books detected. Set your preferences to get personalized matches."
        });
      }
      
      // Score and rank books based on user preferences
      const rankedBooks = detectedBooks.map(book => {
        // Initialize match score
        let matchScore = 0;
        
        // Match against preferred genres
        if (preferences.genres && book.categories) {
          for (const genre of preferences.genres) {
            if (book.categories.some((category: string) => 
              category.toLowerCase().includes(genre.toLowerCase()))) {
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
            
            // Match shelf categories from Goodreads
            if (entry["Bookshelves"] && book.categories) {
              const shelves = entry["Bookshelves"].split(';').map((s: string) => s.trim().toLowerCase());
              for (const shelf of shelves) {
                if (book.categories.some((category: string) => 
                  category.toLowerCase().includes(shelf))) {
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
      
      // Return the top matches
      return res.status(200).json({
        books: rankedBooks.slice(0, 8), 
        analysis,
        message: "Books ranked based on your preferences."
      });
    } catch (error) {
      console.error('Error processing image:', error);
      return res.status(500).json({ 
        message: 'Error processing image',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Save user preferences
  app.post('/api/preferences', async (req: Request, res: Response) => {
    try {
      // For demo purposes, use a default user ID
      const userId = 1;
      
      // Extract data from request body
      let { genres, authors, goodreadsData } = req.body;
      
      // Don't trim Goodreads data - keep all book entries from the CSV regardless of size
      // This will preserve all the user's data as requested
      
      // Prepare data
      const preferenceData = {
        userId,
        genres,
        authors: authors || null,
        goodreadsData: goodreadsData || null
      };
      
      // Check if user already has preferences
      const existingPreference = await storage.getPreferencesByUserId(userId);
      
      if (existingPreference) {
        // Update existing preferences
        const updatedPreference = await storage.updatePreference(existingPreference.id, preferenceData);
        return res.status(200).json(updatedPreference);
      } else {
        // Create new preferences
        const newPreference = await storage.createPreference(preferenceData);
        return res.status(201).json(newPreference);
      }
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
      // For demo purposes, use a default user ID
      const userId = 1;
      
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

  // Save detected books
  app.post('/api/books', async (req: Request, res: Response) => {
    try {
      // For demo purposes, use a default user ID
      const userId = 1;
      
      // Validate request
      const bookSchema = z.array(insertBookSchema.extend({
        userId: z.number().optional()
      }));
      
      const booksData = bookSchema.parse(req.body.map((book: any) => ({
        ...book,
        userId
      })));
      
      // Save books
      const savedBooks = [];
      for (const bookData of booksData) {
        const savedBook = await storage.createBook(bookData);
        savedBooks.push(savedBook);
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

  // Get user's books
  app.get('/api/books', async (req: Request, res: Response) => {
    try {
      // For demo purposes, use a default user ID
      const userId = 1;
      
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

  // Generate book recommendations
  app.post('/api/recommendations', async (req: Request, res: Response) => {
    try {
      // For demo purposes, use a default user ID
      const userId = 1;
      
      // Get user preferences
      const preferences = await storage.getPreferencesByUserId(userId);
      if (!preferences) {
        return res.status(404).json({ message: 'User preferences not found' });
      }
      
      // Get user's books
      const books = await storage.getBooksByUserId(userId);
      const bookTitles = books.map(book => book.title);
      
      // Generate recommendations based on books and preferences
      const recommendations = await getRecommendations(
        bookTitles,
        preferences.genres
      );
      
      // Save recommendations
      const savedRecommendations = [];
      for (const rec of recommendations) {
        const recommendationData = {
          userId,
          bookId: books.length > 0 ? books[0].id : 1, // Use the first book as a reference or default to 1
          title: rec.title,
          author: rec.author,
          coverUrl: rec.coverUrl,
          rating: String(rec.rating),
          summary: rec.summary
        };
        
        const savedRecommendation = await storage.createRecommendation(recommendationData);
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

  // Get user's recommendations
  app.get('/api/recommendations', async (req: Request, res: Response) => {
    try {
      // For demo purposes, use a default user ID
      const userId = 1;
      
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

  const httpServer = createServer(app);
  return httpServer;
}
