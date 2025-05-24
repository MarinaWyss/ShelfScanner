import { Router, Request, Response } from "express";
import { getOpenAIRecommendations } from "./openai-recommendations";
import { log } from './vite';

const router = Router();

/**
 * Get fresh recommendations directly from OpenAI, bypassing cache
 * POST /api/fresh-recommendations
 */
router.post("/fresh-recommendations", async (req: Request, res: Response) => {
  try {
    const { books, preferences } = req.body;

    if (!books || !Array.isArray(books) || books.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide a non-empty array of books"
      });
    }

    // Validate each book has at least title and author
    const invalidBooks = books.filter(book => !book.title || !book.author);
    if (invalidBooks.length > 0) {
      return res.status(400).json({
        success: false,
        message: "All books must have at least title and author"
      });
    }

    // Get device ID from cookie if available
    const deviceId = req.cookies?.deviceId || 'test-user';
    
    log(`Processing fresh recommendation request with ${books.length} books`, "openai");

    // Check OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      return res.status(400).json({
        success: false,
        message: "OpenAI API key is not configured. Please add it to your environment variables."
      });
    }
    
    // Get recommendations directly from OpenAI
    const recommendations = await getOpenAIRecommendations(books, preferences || {}, deviceId);
    
    // Format the recommendations for client-side display
    const formattedRecommendations = recommendations.map(book => {
      // Log the match reason for debugging
      console.log(`Match reason for "${book.title}": ${(book as any).matchReason || 'None provided'}`);
      
      return {
        title: book.title,
        author: book.author,
        coverUrl: book.coverUrl || '',
        summary: book.summary || 'No summary available',
        rating: book.rating || '',
        isbn: book.isbn || '',
        categories: book.categories || [],
        matchScore: (book as any).matchScore || 0,
        matchReason: (book as any).matchReason || 'No match reason provided',
        fromAI: true
      };
    });
    
    // Return recommendations directly to client
    res.json(formattedRecommendations);
  } catch (error) {
    console.error("Error getting OpenAI recommendations:", error);
    res.status(500).json({
      success: false,
      message: "Error generating recommendations",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

export const forceOpenAIRecommendationsRoutes = router;