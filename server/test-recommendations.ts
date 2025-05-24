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

    // Get device ID from request if available
    const deviceId = req.cookies?.deviceId || 'test-user';
    
    // Get recommendations with device ID for tracking
    const recommendations = await getOpenAIRecommendations(books, userPreferences, deviceId);
    
    // Add test explanations if none exist (for demonstration purposes)
    recommendations.forEach(book => {
      if (!book.matchReason) {
        // Generate a sample explanation based on book properties
        const genre = book.categories?.[0] || "this genre";
        const rating = parseFloat(book.rating) || 3.5;
        
        if (rating >= 4.5) {
          book.matchReason = `This highly-rated book matches your interest in ${genre}. Its exceptional quality (${book.rating}/5 stars) suggests you'll find it engaging.`;
        } else if (rating >= 4.0) {
          book.matchReason = `Based on your reading preferences, this ${genre} book aligns well with your taste. It has received positive reviews (${book.rating}/5 stars).`;
        } else {
          book.matchReason = `This book may complement your existing collection with its ${genre} themes and moderate reader reception (${book.rating}/5 stars).`;
        }
      }
    });

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