import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { analyzeImage } from "./vision";
import { analyzeBookshelfImage } from "./openai-vision";
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
      
      // Analyze the image using Google Vision API to extract text
      const analysis = await analyzeImage(base64Image);
      
      // Extract potential book titles from the image text
      const textLines = analysis.text.split('\n')
        .filter((line: string) => line.length > 3) // Filter out very short lines
        .map(line => line.trim());
      
      console.log("Extracted potential book titles:", textLines);
      
      // Search for books based on extracted text - only look for exact matches to text in the image
      const detectedBooks = [];
      const searchPromises = textLines.map(line => searchBooksByTitle(line));
      const searchResults = await Promise.all(searchPromises);
      
      // Process results - filter to keep only books that likely match titles in the image
      searchResults.forEach((results, index) => {
        if (results && results.length > 0) {
          const lineText = textLines[index].toLowerCase();
          
          // Only include books whose titles closely match text from the image
          const matchingBooks = results.filter(book => {
            const bookTitle = book.title.toLowerCase();
            // Check for significant overlap between the detected text and book title
            return (
              bookTitle.includes(lineText) || 
              lineText.includes(bookTitle) ||
              // Calculate similarity score - accept if more than 70% match
              calculateSimilarity(lineText, bookTitle) > 0.7
            );
          });
          
          if (matchingBooks.length > 0) {
            detectedBooks.push(...matchingBooks);
          }
        }
      });
      
      // If no books were detected, provide a helpful message
      if (detectedBooks.length === 0) {
        return res.status(200).json({
          books: [], 
          analysis,
          detectedTitles: textLines,
          message: "No books could be clearly identified in the image. Try taking a clearer photo with better lighting and make sure book titles are visible."
        });
      }
      
      // Create a debug message listing the books found in the image
      const bookTitlesFound = detectedBooks.map(book => book.title).join(", ");
      
      // If no preferences exist, just return the detected books
      if (!preferences) {
        return res.status(200).json({
          books: detectedBooks, 
          analysis,
          detectedTitles: textLines,
          booksFound: bookTitlesFound,
          message: `Found ${detectedBooks.length} books: ${bookTitlesFound}. Set preferences to get rankings.`
        });
      }
      
      // Score and rank the detected books based on user preferences
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
        analysis,
        detectedTitles: textLines,
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
