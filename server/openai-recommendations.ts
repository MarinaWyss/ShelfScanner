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
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Using the latest model
      messages: [
        {
          role: "system",
          content: `You are a literary recommendation expert with deep knowledge of books across all genres.
          Your task is to recommend books based on a user's reading history and preferences.
          Provide diverse, thoughtful recommendations that match the user's taste.
          For each recommendation, include the full title and author name.
          Your recommendations should be specific books, not series or authors.`
        },
        {
          role: "user",
          content: `Based on the following books I've read: ${formattedBooks}
          ${genres ? `And my interest in these genres: ${genres}` : ''}
          ${authors ? `And my interest in these authors: ${authors}` : ''}
          
          Please recommend 5 books I might enjoy.
          
          Format your response as a JSON array with objects containing exactly these fields:
          - title: The book title
          - author: The book author
          - matchScore: A number between 1-100 indicating how well this matches my preferences
          
          Only return the JSON array with no additional text.`
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
      throw new Error("Empty response from OpenAI");
    }
    
    let recommendations;
    try {
      const parsed = JSON.parse(content);
      recommendations = parsed.recommendations || [];
      
      if (!Array.isArray(recommendations) || recommendations.length === 0) {
        // If the format doesn't match exactly, try to extract from the overall response
        recommendations = parsed;
      }
    } catch (error) {
      log(`Error parsing OpenAI recommendations: ${error instanceof Error ? error.message : String(error)}`, 'openai');
      throw new Error("Invalid response format from AI recommendations");
    }
    
    // Ensure we have valid recommendations
    if (!Array.isArray(recommendations) || recommendations.length === 0) {
      throw new Error("No valid recommendations received");
    }
    
    log(`Generated ${recommendations.length} recommendations`, 'openai');
    
    // Enhance recommendations with covers and additional data
    const enhancedRecommendations = await Promise.all(
      recommendations.map(async (rec: any) => {
        // Normalize recommendation fields
        const title = rec.title || "Unknown Title";
        const author = rec.author || "Unknown Author";
        const matchScore = rec.matchScore || 75; // Default to 75 if no score
        
        // Try to find cover and additional data from cache
        const cachedBook = await bookCacheService.findInCache(title, author);
        
        // Return the enhanced recommendation
        return {
          title,
          author,
          coverUrl: cachedBook?.coverUrl || undefined,
          summary: undefined, // We'll get a fresh description later
          rating: cachedBook?.rating || undefined,
          isbn: cachedBook?.isbn || undefined,
          categories: cachedBook?.metadata ? (cachedBook.metadata as any).categories : undefined,
          matchScore
        };
      })
    );
    
    return enhancedRecommendations;
  } catch (error) {
    log(`Error generating OpenAI recommendations: ${error instanceof Error ? error.message : String(error)}`, 'openai');
    throw error;
  }
}