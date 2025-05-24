import { Router, Request, Response } from "express";
import { getOpenAIRecommendations } from "./openai-recommendations";
import { getOpenAIDescription, getOpenAIMatchReason } from "./openai-descriptions";
import { log } from './vite';

const router = Router();

/**
 * Get fresh recommendations with OpenAI descriptions and match reasons
 * POST /api/direct/recommendations
 */
router.post("/recommendations", async (req: Request, res: Response) => {
  try {
    const { books, preferences } = req.body;

    if (!books || !Array.isArray(books) || books.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide a non-empty array of books"
      });
    }

    // Get device ID from cookie if available
    const deviceId = req.cookies?.deviceId || 'test-user';
    
    log(`Processing direct OpenAI recommendation request with ${books.length} books`, "openai");

    // Check OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      return res.status(400).json({
        success: false,
        message: "OpenAI API key is not configured. Please add it to your environment variables."
      });
    }
    
    // Get base recommendations from OpenAI
    const baseRecommendations = await getOpenAIRecommendations(books, preferences || {}, deviceId);
    
    // Enhance each recommendation with fresh OpenAI descriptions and match reasons
    const enhancedRecommendations = await Promise.all(baseRecommendations.map(async (book) => {
      // Generate a fresh description using OpenAI (not from Google Books)
      const description = await getOpenAIDescription(book.title, book.author);
      
      // Generate a personalized match reason explaining why this book matches preferences
      const matchReason = await getOpenAIMatchReason(book.title, book.author, preferences || {});
      
      // Return the enhanced recommendation
      return {
        title: book.title,
        author: book.author,
        coverUrl: book.coverUrl || '',
        summary: description, // Always use our fresh OpenAI description
        rating: book.rating || '',
        isbn: book.isbn || '',
        categories: book.categories || [],
        matchScore: (book as any).matchScore || 75, // Default to 75 if no score available
        matchReason: matchReason, // Always use our fresh match reason
        fromAI: true
      };
    }));
    
    // Return enhanced recommendations directly to client
    res.json(enhancedRecommendations);
  } catch (error) {
    console.error("Error getting direct OpenAI recommendations:", error);
    res.status(500).json({
      success: false,
      message: "Error generating recommendations",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

export const directOpenAIRoutes = router;