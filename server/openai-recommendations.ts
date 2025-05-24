import OpenAI from "openai";
import { log } from './vite';
import { rateLimiter } from './rate-limiter';
import { bookCacheService } from './book-cache-service';

// Configure OpenAI client
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 2,
  timeout: 20000
});

/**
 * Get book recommendations using OpenAI
 * This ensures all recommendations come directly from AI
 * 
 * @param userBooks Array of books the user has read/saved
 * @param preferences User preferences (genres, authors, etc.)
 * @param deviceId Optional user device ID for analytics
 * @returns Array of book recommendations
 */
export async function getOpenAIRecommendations(
  userBooks: Array<{ title: string, author: string }>,
  preferences: { genres?: string[], authors?: string[], goodreadsData?: any } = {},
  deviceId?: string
): Promise<Array<{ 
  title: string, 
  author: string, 
  coverUrl?: string, 
  summary?: string,
  rating?: string,
  isbn?: string,
  categories?: string[],
  matchScore?: number,
  matchReason?: string
}>> {
  try {
    // Check if OpenAI is configured
    if (!process.env.OPENAI_API_KEY) {
      log('OpenAI API key not configured for recommendations', 'openai');
      throw new Error("OpenAI API key is required for recommendations");
    }
    
    // Check rate limits
    if (!rateLimiter.isAllowed('openai')) {
      log('Rate limit reached for OpenAI, unable to generate recommendations', 'openai');
      throw new Error("Rate limit reached for AI recommendations");
    }
    
    // Format user books for the prompt
    const formattedBooks = userBooks.map(book => 
      `"${book.title}" by ${book.author}`
    ).join(', ');
    
    // Format user preferences
    const genres = preferences.genres?.join(', ') || '';
    const authors = preferences.authors?.join(', ') || '';
    
    // Generate recommendations using OpenAI
    log(`Generating recommendations based on ${userBooks.length} books`, 'openai');
    
    // We will never use fallback recommendations
    // All recommendations must be derived from the user's actual scanned books
    // If OpenAI doesn't provide valid recommendations, we'll throw an error
    // This ensures we only show genuine personalized recommendations
    
    try {
      // Attempt to get recommendations from OpenAI
      // Create a list of book titles and authors from the input
      const bookTitlesAndAuthors = userBooks.map(book => ({
        title: book.title,
        author: book.author
      }));
      
      // Convert to JSON string for the prompt
      const bookListJSON = JSON.stringify(bookTitlesAndAuthors, null, 2);
      
      // Format user preferences for a richer prompt
      const formattedGenres = preferences.genres && preferences.genres.length > 0 
        ? `Genres I enjoy: ${preferences.genres.join(', ')}.` 
        : '';
      
      const formattedAuthors = preferences.authors && preferences.authors.length > 0 
        ? `Authors I like: ${preferences.authors.join(', ')}.` 
        : '';
      
      // Format any Goodreads data if available in a more readable way
      let goodreadsInfo = '';
      // @ts-ignore - Goodreads data may exist in the preferences object
      if (preferences.goodreadsData) {
        try {
          const goodreads = preferences.goodreadsData;
          const favoriteBooks = goodreads.favoriteBooks 
            ? `Favorite books from Goodreads: ${goodreads.favoriteBooks.join(', ')}.` 
            : '';
          const favoriteGenres = goodreads.favoriteGenres 
            ? `Favorite genres from Goodreads: ${goodreads.favoriteGenres.join(', ')}.` 
            : '';
          const recentlyRead = goodreads.recentlyRead 
            ? `Recently read books: ${goodreads.recentlyRead.join(', ')}.` 
            : '';
            
          // Extract "Want to Read" books from Goodreads data if available
          let wantToReadBooks = '';
          if (preferences.goodreadsData.raw && Array.isArray(preferences.goodreadsData.raw)) {
            const wantToReadList = preferences.goodreadsData.raw
              .filter((entry: any) => 
                entry["Bookshelves"] && 
                (entry["Bookshelves"].includes("to-read") || 
                 entry["Bookshelves"].includes("want-to-read") || 
                 entry["Bookshelves"].includes("want to read")))
              .map((entry: any) => `${entry["Title"]} by ${entry["Author"]}`)
              .slice(0, 10); // Limit to 10 books to avoid very long prompts
              
            if (wantToReadList.length > 0) {
              wantToReadBooks = `Books I want to read from Goodreads: ${wantToReadList.join(', ')}.`;
            }
          }
          
          goodreadsInfo = [favoriteBooks, favoriteGenres, recentlyRead, wantToReadBooks]
            .filter(text => text.length > 0)
            .join(' ');
          
          // Fallback if the structure is different
          if (!goodreadsInfo) {
            goodreadsInfo = `Additional reading preferences from my Goodreads profile.`;
          }
        } catch (error) {
          // If there's an error parsing Goodreads data, use a simpler format
          goodreadsInfo = `I have additional reading preferences from my Goodreads profile.`;
        }
      }
      
      // Combine all preference information
      const userPreferencesText = [formattedGenres, formattedAuthors, goodreadsInfo]
        .filter(text => text.length > 0)
        .join(' ');
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o", // Using the latest model
        messages: [
          {
            role: "system",
            content: `You are a literary recommendation expert. Your task is to select books from a provided list that best match the user's specific reading preferences, and provide a brief explanation for each match.

CRITICAL INSTRUCTIONS:
1. You MUST ONLY select books from the exact list provided to you
2. Do NOT invent or suggest books that are not in the provided list
3. Do NOT recommend books that are similar but not on the list
4. The ONLY valid recommendations are books EXPLICITLY listed in the JSON array I will provide
5. If you can't find 5 good recommendations from the list, return fewer recommendations
6. Base your selections on how well each book aligns with the user's stated genre preferences, favorite authors, and reading history
7. If the user has a "Want to Read" list from Goodreads, PRIORITIZE books that are similar to those on their list
8. For each book, provide a SPECIFIC, CONCISE reason (1-2 sentences) explaining the match
9. When a book is similar to something on their "Want to Read" list, mention this specific connection in the match reason
10. Match reasons should ONLY reference preferences the user explicitly mentioned - no assumptions
11. Higher scoring books should have more specific, compelling match reasons`
          },
          {
            role: "user",
            content: `Here is my list of books:
            
${bookListJSON}

My reading preferences:
${userPreferencesText || "I'm open to discovering interesting books from various genres."}

From ONLY this list above, recommend the 5 books that would best match my reading preferences.

Format your response as a JSON object with a "recommendations" array containing ONLY books from my list.
Each recommendation should include:
- title: The exact book title from my list
- author: The exact author name from my list
- matchScore: A number between 1-100 indicating how well this book matches my preferences
- matchReason: A SPECIFIC, CONCISE reason (1-2 sentences) why this book matches my preferences. DO NOT use generic phrases like "aligns with your interests" - explain exactly HOW it connects to my stated preferences. For high scores (80+), the reason should be especially clear and compelling.

IMPORTANT: You can ONLY recommend books from the list I provided. Do not suggest any books that aren't on this list.

Example format:
{
  "recommendations": [
    {
      "title": "Book Title From My List",
      "author": "Author From My List",
      "matchScore": 95,
      "matchReason": "This book directly addresses your interest in [specific genre/topic] with [specific element] that connects to your preference for [specific author/style]."
    }
  ]
}

Only return the JSON object with no additional text.`
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 1000,
        temperature: 0.7
      });
      
      // Increment the rate limiter counter
      rateLimiter.increment('openai');
      
      // Parse the recommendations
      const content = response.choices[0].message.content;
      if (!content) {
        log("Empty response from OpenAI API", 'openai');
        throw new Error("OpenAI API returned an empty response");
      }
      
      try {
        // Log the raw response for debugging
        log(`Raw OpenAI response: ${content.substring(0, 200)}...`, 'openai');
        
        const parsed = JSON.parse(content);
        
        // Check if we have recommendations in the expected format
        if (parsed.recommendations && Array.isArray(parsed.recommendations) && parsed.recommendations.length > 0) {
          log(`Successfully parsed ${parsed.recommendations.length} recommendations from OpenAI`, 'openai');
          
          // Create a map of books from the user's list for easy lookup
          const userBooksMap = new Map();
          userBooks.forEach(book => {
            const key = `${book.title.toLowerCase()}|${book.author.toLowerCase()}`;
            userBooksMap.set(key, book);
          });
          
          // Validate that each recommendation is from the user's book list
          // And enhance with original properties (like coverUrl, isbn) from the user's book
          const validatedRecommendations = parsed.recommendations.filter((rec: any) => {
            if (!rec.title || !rec.author) return false;
            
            const key = `${rec.title.toLowerCase()}|${rec.author.toLowerCase()}`;
            const isInUserBooks = userBooksMap.has(key);
            
            if (!isInUserBooks) {
              log(`Filtering out recommendation "${rec.title}" as it's not in the user's book list`, 'openai');
            }
            
            return isInUserBooks;
          }).map((rec: any) => {
            // Enhance the recommendation with original properties from the user's book
            const key = `${rec.title.toLowerCase()}|${rec.author.toLowerCase()}`;
            const originalBook = userBooksMap.get(key);
            
            // Preserve important properties from the original book like coverUrl and ISBN
            // Also include the matchReason from the OpenAI response
            return {
              ...rec,
              coverUrl: originalBook.coverUrl || rec.coverUrl,
              isbn: originalBook.isbn || rec.isbn,
              matchReason: rec.matchReason || `This book scores ${rec.matchScore || 75}/100 for your reading preferences.`
            };
          });
          
          log(`Validated ${validatedRecommendations.length} recommendations are from the user's book list`, 'openai');
          return validatedRecommendations;
        }
        
        // If not in the expected format but we have an array, try to use that with validation
        if (Array.isArray(parsed) && parsed.length > 0) {
          log(`Found ${parsed.length} recommendations in array format from OpenAI`, 'openai');
          
          // Create a map of books from the user's list for easy lookup
          const userBooksMap = new Map();
          userBooks.forEach(book => {
            const key = `${book.title.toLowerCase()}|${book.author.toLowerCase()}`;
            userBooksMap.set(key, book);
          });
          
          // Validate that each recommendation is from the user's book list
          // And enhance with original properties (like coverUrl, isbn) from the user's book
          const validatedRecommendations = parsed.filter((rec: any) => {
            if (!rec.title || !rec.author) return false;
            
            const key = `${rec.title.toLowerCase()}|${rec.author.toLowerCase()}`;
            return userBooksMap.has(key);
          }).map((rec: any) => {
            // Enhance the recommendation with original properties from the user's book
            const key = `${rec.title.toLowerCase()}|${rec.author.toLowerCase()}`;
            const originalBook = userBooksMap.get(key);
            
            // Preserve important properties from the original book like coverUrl and ISBN
            // Also include the matchReason from the OpenAI response
            return {
              ...rec,
              coverUrl: originalBook.coverUrl || rec.coverUrl,
              isbn: originalBook.isbn || rec.isbn,
              matchReason: rec.matchReason || `This book scores ${rec.matchScore || 75}/100 for your reading preferences.`
            };
          });
          
          log(`Validated ${validatedRecommendations.length} recommendations are from the user's book list`, 'openai');
          return validatedRecommendations;
        }
        
        log("No valid recommendations structure found in OpenAI response", 'openai');
        throw new Error("Could not extract valid book recommendations from OpenAI response");
      } catch (error) {
        log(`Error parsing OpenAI recommendations: ${error instanceof Error ? error.message : String(error)}`, 'openai');
        throw new Error("Failed to parse OpenAI book recommendations");
      }
    } catch (error) {
      log(`Error from OpenAI API: ${error instanceof Error ? error.message : String(error)}`, 'openai');
      throw new Error(`Failed to generate book recommendations: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // The code has been restructured to handle this better with proper returns
    // in the try/catch blocks above
    
    // We should never reach this point, but just in case
    log("Reached unexpected code path in recommendations", 'openai');
    throw new Error("Failed to generate recommendations from scanned books");
  } catch (error) {
    log(`Error generating OpenAI recommendations: ${error instanceof Error ? error.message : String(error)}`, 'openai');
    throw error;
  }
}