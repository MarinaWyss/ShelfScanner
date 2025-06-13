import { Router, Request, Response } from "express";
import { getOpenAIRecommendations } from "./openai-recommendations.js";
import { getOpenAIDescription } from "./openai-descriptions.js";
import { log } from './simple-logger.js';

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
      // Import bookCacheService to check cache for detected books
      const { bookCacheService } = await import('./book-cache-service.js');
      
      // Enhance detected books with cached OpenAI data before generating recommendations
      const enhancedInputBooks = await Promise.all(books.map(async (book: any) => {
        const cachedBook = await bookCacheService.findInCache(book.title, book.author);
        
        if (cachedBook && cachedBook.source === 'openai') {
          log(`Using cached OpenAI data for input book "${book.title}": rating=${cachedBook.rating}, summary=${cachedBook.summary ? 'yes' : 'no'}`, "openai");
          
          // Use cached data to enhance the input book
          return {
            ...book,
            rating: cachedBook.rating || book.rating,
            summary: cachedBook.summary || book.summary
          };
        } else {
          log(`No cached OpenAI data found for input book "${book.title}"`, "openai");
        }
        
        return book;
      }));
      
      // Get base recommendations from OpenAI using enhanced books
      const baseRecommendations = await getOpenAIRecommendations(enhancedInputBooks, preferences || {}, deviceId);
      
      // Make sure we received recommendations from OpenAI
      if (!baseRecommendations || baseRecommendations.length === 0) {
        // If no recommendations were returned, inform the user
        log("No recommendations returned from OpenAI", "openai");
        return res.status(404).json({
          success: false,
          message: "No book recommendations could be generated based on your scanned books. Please try scanning different books."
        });
      }
      
      // Enhance each recommendation with cached or fresh OpenAI data
      const enhancedRecommendations = await Promise.all(baseRecommendations.map(async (book) => {
        try {
          log(`Processing recommendation: "${book.title}" by ${book.author}`, "openai");
          log(`Available books for matching: ${books.map(b => `"${b.title}" by ${b.author}`).join(', ')}`, "openai");
          
          // Find the original book from the user's list to get the cover URL
          const originalBook = books.find(b => 
            b.title.toLowerCase() === book.title.toLowerCase() && 
            b.author.toLowerCase() === book.author.toLowerCase()
          );
          
          if (originalBook) {
            log(`Found original book data: title="${originalBook.title}", author="${originalBook.author}"`, "openai");
          } else {
            log(`No original book found for recommendation "${book.title}" by ${book.author}`, "openai");
          }
          
          // Ensure we have a cover URL from the original scanned book if available
          const coverUrl = originalBook?.coverUrl || book.coverUrl || '';
          
          // Make sure we have an ISBN if it's available in the original book
          const isbn = originalBook?.isbn || book.isbn || '';
          
          // Import bookCacheService for consistent cache access
          let cachedBook = null;
          let description = '';
          let rating = '';
          
          try {
            log(`Importing bookCacheService...`, "openai");
            const { bookCacheService } = await import('./book-cache-service.js');
            log(`Successfully imported bookCacheService`, "openai");
            
            // First check if we have this recommendation in cache with OpenAI data
            log(`Checking cache for recommendation "${book.title}" by ${book.author}`, "openai");
            log(`About to call bookCacheService.findInCache with title="${book.title}", author="${book.author}"`, "openai");
            cachedBook = await bookCacheService.findInCache(book.title, book.author);
            log(`Cache lookup result: ${cachedBook ? `found book with source="${cachedBook.source}", rating="${cachedBook.rating}", summary="${cachedBook.summary ? 'present' : 'missing'}"` : 'no book found'}`, "openai");
            
            // If no cached book found, wait a moment and try again (handles race condition)
            if (!cachedBook || cachedBook.source !== 'openai') {
              log(`No cached OpenAI data found for "${book.title}" (source: ${cachedBook?.source || 'none'}), waiting and retrying...`, "openai");
              await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
              try {
                cachedBook = await bookCacheService.findInCache(book.title, book.author);
                if (cachedBook?.source === 'openai') {
                  log(`Found cached data after retry for "${book.title}": rating=${cachedBook.rating}, summary=${cachedBook.summary ? 'yes' : 'no'}`, "openai");
                } else {
                  log(`Still no cached OpenAI data for "${book.title}" after retry (source: ${cachedBook?.source || 'none'})`, "openai");
                }
              } catch (retryError) {
                log(`Error in cache retry lookup: ${retryError instanceof Error ? retryError.message : String(retryError)}`, "openai");
              }
            } else {
              log(`Found cached OpenAI data immediately for "${book.title}": rating=${cachedBook.rating}, summary=${cachedBook.summary ? 'yes' : 'no'}`, "openai");
            }
          } catch (error) {
            log(`Error in cache lookup: ${error instanceof Error ? error.message : String(error)}`, "openai");
            log(`Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`, "openai");
          }
          
          if (cachedBook && cachedBook.source === 'openai') {
            // Use cached OpenAI data if available
            log(`Found cached OpenAI data for recommendation "${book.title}": rating=${cachedBook.rating}, summary=${cachedBook.summary ? 'yes' : 'no'}`, "openai");
            
            if (cachedBook.summary) {
              description = cachedBook.summary;
              log(`Using cached OpenAI summary for recommendation "${book.title}"`, "openai");
            }
            
            if (cachedBook.rating) {
              rating = cachedBook.rating;
              log(`Using cached OpenAI rating for recommendation "${book.title}": ${rating}`, "openai");
            }
          } else {
            log(`No cached OpenAI data found for recommendation "${book.title}"`, "openai");
          }
          
          // If we still don't have a description, get it from OpenAI
          if (!description || description.length < 100) {
            description = await getOpenAIDescription(book.title, book.author);
            log(`Got fresh OpenAI description for recommendation "${book.title}"`, "openai");
          } else {
            log(`Using cached description for recommendation "${book.title}"`, "openai");
          }
          
          // If we still don't have a rating, get it from OpenAI
          if (!rating || rating === "0") {
            rating = await bookCacheService.getEnhancedRating(book.title, book.author, isbn);
            log(`Got fresh OpenAI rating for recommendation "${book.title}": ${rating}`, "openai");
          } else {
            log(`Using cached rating for recommendation "${book.title}": ${rating}`, "openai");
          }
          
          // Debug the rating value
          if (!rating || isNaN(parseFloat(rating))) {
            log(`WARNING: Invalid rating for "${book.title}": ${rating}`, "openai");
          }
          
          // Use the match reason provided directly from the recommendation
          // This is now generated within the recommendation prompt and should be more focused
          const matchReason = book.matchReason || "This book matches elements of your reading preferences.";
          
          // Cache this book with OpenAI data for future use if we don't already have it cached
          // or if we got fresh data that needs to be stored
          const needsCaching = (!cachedBook) || 
                              (cachedBook && (
                                (rating && rating !== cachedBook.rating) || 
                                (description && description !== cachedBook.summary)
                              ));
          
          if (needsCaching && (description || rating)) {
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
          
          // Return the enhanced recommendation with OpenAI data
          const enhancedBook = {
            title: book.title,
            author: book.author,
            coverUrl: coverUrl,
            summary: description || "A compelling book that explores important themes and ideas.",
            rating: rating || '4.0', // Use the rating (cached or fresh)
            isbn: isbn,
            categories: book.categories || [],
            matchScore: (book as any).matchScore || 75, // Default to 75 if no score available
            matchReason: matchReason || "This book aligns with your reading preferences.",
            fromAI: true
          };
          
          // Log the final book data for debugging
          log(`Final enhanced recommendation: "${book.title}" - rating=${enhancedBook.rating}, summary=${enhancedBook.summary ? 'present' : 'missing'}`, "openai");
          
          // Log the final enhanced book details for debugging
          log(`Final enhanced book: ${book.title}, rating=${enhancedBook.rating}, typeof rating=${typeof enhancedBook.rating}`, "openai");
          
          log(`Final recommendation for "${book.title}": rating=${enhancedBook.rating}, summary=${enhancedBook.summary ? 'yes' : 'no'}`, "openai");
          return enhancedBook;
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
    log(`Error getting direct OpenAI recommendations: ${error instanceof Error ? error.message : String(error)}`);
    return res.status(500).json({
      success: false,
      message: "Error generating recommendations",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

export const directOpenAIRoutes = router;