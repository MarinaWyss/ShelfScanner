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

      // Convert buffer to base64
      const base64Image = req.file.buffer.toString('base64');
      
      // Analyze the image using Google Vision API
      const analysis = await analyzeImage(base64Image);
      
      if (!analysis.isBookshelf) {
        return res.status(400).json({ 
          message: 'The uploaded image does not appear to contain books',
          analysis 
        });
      }
      
      // Search for books based on extracted text
      const bookTitles = analysis.text.split('\n')
        .filter((line: string) => line.length > 3) // Filter out very short lines
        .slice(0, 5); // Take only top results
      
      // Search for books based on extracted text
      const books = [];
      for (const title of bookTitles) {
        const bookResults = await searchBooksByTitle(title);
        if (bookResults.length > 0) {
          books.push(...bookResults);
        }
      }
      
      // Return the analysis and book information
      return res.status(200).json({
        books: books.slice(0, 5), // Only return top 5 results
        analysis
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
