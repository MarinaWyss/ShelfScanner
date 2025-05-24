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
    
    // Log the request details for debugging
    log(`Processing recommendation request for ${books.length} books with preferences: ${JSON.stringify(preferences || {})}`, "openai");
    
    // We don't use fallback recommendations anymore
    // All recommendations must come from the actual scanned books
    // This ensures authenticity and personalization
    
    try {
      // Get base recommendations from OpenAI
      const baseRecommendations = await getOpenAIRecommendations(books, preferences || {}, deviceId);
      
      // Make sure we received recommendations from OpenAI
      if (!baseRecommendations || baseRecommendations.length === 0) {
        // If no recommendations were returned, inform the user
        log("No recommendations returned from OpenAI", "openai");
        return res.status(404).json({
          success: false,
          message: "No book recommendations could be generated based on your scanned books. Please try scanning different books."
        });
      }
      
      // Enhance each recommendation with fresh OpenAI descriptions and match reasons
      const enhancedRecommendations = await Promise.all(baseRecommendations.map(async (book) => {
        try {
          // Generate a fresh description using OpenAI (not from Google Books)
          const description = await getOpenAIDescription(book.title, book.author);
          
          // Generate a personalized match reason explaining why this book matches preferences
          const matchReason = await getOpenAIMatchReason(book.title, book.author, preferences || {});
          
          // Return the enhanced recommendation
          return {
            title: book.title,
            author: book.author,
            coverUrl: book.coverUrl || '',
            summary: description || "A compelling book that explores important themes and ideas.", // Always use our fresh OpenAI description
            rating: book.rating || '4.0',
            isbn: book.isbn || '',
            categories: book.categories || [],
            matchScore: (book as any).matchScore || 75, // Default to 75 if no score available
            matchReason: matchReason || "This book aligns with your reading preferences.", // Always use our fresh match reason
            fromAI: true
          };
        } catch (error) {
          // If there's an error with OpenAI for this specific book, return basic info
          log(`Error enhancing book ${book.title}: ${error instanceof Error ? error.message : String(error)}`, "openai");
          return {
            title: book.title,
            author: book.author,
            coverUrl: book.coverUrl || '',
            summary: "A compelling book that explores important themes and ideas.",
            rating: book.rating || '4.0',
            isbn: book.isbn || '',
            categories: book.categories || [],
            matchScore: (book as any).matchScore || 75,
            matchReason: "This book appears to align with your reading preferences.",
            fromAI: true
          };
        }
      }));
      
      // Return enhanced recommendations directly to client
      return res.json(enhancedRecommendations);
    } catch (error) {
      // If there's any error in the process, inform the user
      log(`Error processing recommendations: ${error instanceof Error ? error.message : String(error)}`, "openai");
      return res.status(500).json({
        success: false,
        message: "We couldn't generate personalized recommendations based on your books. Please try again or scan different books."
      });
    }
  } catch (error) {
    console.error("Error getting direct OpenAI recommendations:", error);
    return res.status(500).json({
      success: false,
      message: "Error generating recommendations",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

export const directOpenAIRoutes = router;