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
  preferences: { genres?: string[], authors?: string[] } = {},
  deviceId?: string
): Promise<Array<{ 
  title: string, 
  author: string, 
  coverUrl?: string, 
  summary?: string,
  rating?: string,
  isbn?: string,
  categories?: string[],
  matchScore?: number
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
      const response = await openai.chat.completions.create({
        model: "gpt-4o", // Using the latest model
        messages: [
          {
            role: "system",
            content: `You are a literary recommendation expert with deep knowledge of books across all genres.
            Your task is to recommend ONLY books that are SIMILAR to the specific books in the user's photo.
            VERY IMPORTANT: You must ONLY recommend books that are DIRECTLY related to the books shown in the user's scan.
            NEVER recommend books outside the themes and styles represented in the user's scanned books.
            Each recommendation must share significant thematic, stylistic, or subject matter with the books in the user's scan.
            For each recommendation, include the full title and author name.
            Your recommendations should be specific books, not series or authors.
            IMPORTANT: Your recommendations must be real books that actually exist and can be found in bookstores or libraries.`
          },
          {
            role: "user",
            content: `These are the books I scanned from my bookshelf: ${formattedBooks}
            ${genres ? `I'm particularly interested in these genres: ${genres}` : ''}
            ${authors ? `I enjoy books by these authors: ${authors}` : ''}
            
            Please recommend 5 books I might enjoy. Choose books that are similar in theme, style, or subject matter to the ones I've read.
            
            Format your response as a JSON object with a "recommendations" array containing objects with these fields:
            - title: The book title
            - author: The book author
            - matchScore: A number between 1-100 indicating how well this matches my preferences
            
            Example format:
            {
              "recommendations": [
                {
                  "title": "Book Title 1",
                  "author": "Author Name 1",
                  "matchScore": 95
                },
                {
                  "title": "Book Title 2",
                  "author": "Author Name 2",
                  "matchScore": 90
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
          return parsed.recommendations;
        }
        
        // If not in the expected format but we have an array, try to use that
        if (Array.isArray(parsed) && parsed.length > 0) {
          log(`Found ${parsed.length} recommendations in array format from OpenAI`, 'openai');
          return parsed;
        }
        
        // Last attempt - look for any array in the response
        const possibleArrays = Object.values(parsed).filter(value => Array.isArray(value) && value.length > 0);
        if (possibleArrays.length > 0) {
          const validRecommendations = possibleArrays[0] as Array<{title: string, author: string, matchScore?: number}>;
          log(`Found ${validRecommendations.length} recommendations in nested format from OpenAI`, 'openai');
          return validRecommendations;
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