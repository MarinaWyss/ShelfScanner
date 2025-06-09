import { Router, Request, Response } from "express";
import { getOpenAIRecommendations } from "./openai-recommendations";
import { getOpenAIDescription } from "./openai-descriptions";
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
          // Find the original book from the user's list to get the cover URL
          const originalBook = books.find(b => 
            b.title.toLowerCase() === book.title.toLowerCase() && 
            b.author.toLowerCase() === book.author.toLowerCase()
          );
          
          // Ensure we have a cover URL from the original scanned book if available
          const coverUrl = originalBook?.coverUrl || book.coverUrl || '';
          
          // Get fresh OpenAI-generated description
          const description = await getOpenAIDescription(book.title, book.author);
          
          // Get fresh OpenAI-generated rating - we don't want to use fallbacks
          const bookCacheService = (await import('./book-cache-service')).bookCacheService;
          const rating = await bookCacheService.getEnhancedRating(book.title, book.author, book.isbn);
          
          // Use the match reason provided directly from the recommendation
          // This is now generated within the recommendation prompt and should be more focused
          const matchReason = book.matchReason || "This book matches elements of your reading preferences.";
          
          // Make sure we have an ISBN if it's available in the original book
          const isbn = originalBook?.isbn || book.isbn || '';
          
          // Cache this book with OpenAI data for future use
          if (description || rating) {
            // Let the BookCacheService handle generating the bookId
            // It will be created automatically based on ISBN or title+author
            await bookCacheService.cacheBook({
              title: book.title,
              author: book.author,
              isbn: isbn,
              coverUrl: coverUrl,
              rating: rating, 
              summary: description,
              source: 'openai',
              metadata: {
                categories: book.categories
              },
              expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 365 days cache
            });
            log(`Cached OpenAI data for recommendation "${book.title}"`, "openai");
          }
          
          // Return the enhanced recommendation with fresh OpenAI data
          return {
            title: book.title,
            author: book.author,
            coverUrl: coverUrl,
            summary: description || "A compelling book that explores important themes and ideas.", // Always use our fresh OpenAI description
            rating: rating || '4.0', // Use our fresh OpenAI rating
            isbn: isbn,
            categories: book.categories || [],
            matchScore: (book as any).matchScore || 75, // Default to 75 if no score available
            matchReason: matchReason || "This book aligns with your reading preferences.", // Always use our fresh match reason
            fromAI: true
          };
        } catch (error) {
          // If there's an error with OpenAI for this specific book, return basic info
          log(`Error enhancing book ${book.title}: ${error instanceof Error ? error.message : String(error)}`, "openai");
          
          // Find the original book from the user's list to get the cover URL (even in error case)
          const originalBook = books.find(b => 
            b.title.toLowerCase() === book.title.toLowerCase() && 
            b.author.toLowerCase() === book.author.toLowerCase()
          );
          
          // Ensure we have a cover URL from the original scanned book if available
          const coverUrl = originalBook?.coverUrl || book.coverUrl || '';
          
          // Make sure we have an ISBN if it's available in the original book
          const isbn = originalBook?.isbn || book.isbn || '';
          
          return {
            title: book.title,
            author: book.author,
            coverUrl: coverUrl,
            summary: "A compelling book that explores important themes and ideas.",
            rating: book.rating || '4.0',
            isbn: isbn,
            categories: book.categories || [],
            matchScore: (book as any).matchScore || 75,
            matchReason: book.matchReason || "This book includes themes or styles that connect with your reading preferences.",
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