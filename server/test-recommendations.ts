import { Router, Request, Response } from "express";
import { getOpenAIRecommendations } from "./openai-recommendations";
import { log } from "./vite";
import { rateLimiter } from "./rate-limiter";

const router = Router();

/**
 * Test OpenAI book recommendations
 * POST /api/test/recommendations
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

    // Validate each book has at least title and author
    const invalidBooks = books.filter(book => !book.title || !book.author);
    if (invalidBooks.length > 0) {
      return res.status(400).json({
        success: false,
        message: "All books must have at least title and author"
      });
    }

    // Format user preferences
    const userPreferences = {
      genres: preferences?.genres || [],
      authors: preferences?.authors || [],
      goodreadsData: preferences?.goodreadsData || []
    };

    log(`Test API: Processing recommendation request with ${books.length} books`, "test");

    // Check OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      return res.status(400).json({
        success: false,
        message: "OpenAI API key is not configured. Please add it to your environment variables."
      });
    }
    
    // For the test page, we'll add the current usage stats but not block requests
    const openaiUsageStats = rateLimiter.getUsageStats();
    log(`Current OpenAI usage: ${JSON.stringify(openaiUsageStats)}`, "test");

    // Get recommendations
    const recommendations = await getOpenAIRecommendations(books, userPreferences);

    return res.json({
      success: true,
      books: books,
      preferences: userPreferences,
      recommendations: recommendations,
      count: recommendations.length
    });
  } catch (error) {
    log(`Error in test recommendations API: ${error instanceof Error ? error.message : String(error)}`, "test-error");
    return res.status(500).json({
      success: false,
      message: "Error processing recommendation request",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Export the router
export { router as testRecommendationsRoutes };