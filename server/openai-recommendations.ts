import OpenAI from "openai";
import { log } from './vite';
import { rateLimiter } from './rate-limiter';
import { trackApiFailure } from './utils/api-monitoring';

// Configure OpenAI client
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 2,
  timeout: 15000
});

/**
 * Interface for book information
 */
interface BookInfo {
  title: string;
  author: string;
  categories?: string[];
  summary?: string;
  rating?: string;
  isbn?: string;
  coverUrl?: string;
}

/**
 * Interface for user preferences
 */
interface UserPreferences {
  genres?: string[];
  authors?: string[];
  goodreadsData?: any[];
}

/**
 * Interface for recommendation response
 */
interface RecommendationResponse {
  bookTitle: string;
  bookAuthor: string;
  matchScore: number;
  matchReason?: string;
}

/**
 * Interface for enhanced BookInfo with match details
 */
interface EnhancedBookInfo extends BookInfo {
  matchScore?: number;
  matchReason?: string;
}

/**
 * Generate book recommendations using OpenAI
 * Takes a list of books and user preferences, returns scored recommendations
 * 
 * @param books List of books detected in the image
 * @param preferences User preferences
 * @returns Scored and sorted book recommendations
 */
export async function getOpenAIRecommendations(
  books: BookInfo[],
  preferences: UserPreferences
): Promise<BookInfo[]> {
  try {
    log(`Using OpenAI to analyze ${books.length} books for recommendations`, 'recommendations');
    
    // Check if OpenAI is configured
    if (!process.env.OPENAI_API_KEY) {
      log('OpenAI API key not configured for recommendations', 'recommendations');
      // Fall back to traditional scoring if OpenAI is not available
      // This ensures the feature still works without OpenAI
      return [];
    }
    
    // Check rate limits
    if (!rateLimiter.isAllowed('openai')) {
      log('Rate limit reached for OpenAI, skipping AI recommendations', 'recommendations');
      return [];
    }
    
    // Prepare the list of already read books from Goodreads data
    const alreadyReadBooks: string[] = [];
    if (preferences.goodreadsData && Array.isArray(preferences.goodreadsData)) {
      preferences.goodreadsData.forEach((entry: any) => {
        if (entry["Title"] && entry["My Rating"] && parseInt(entry["My Rating"]) > 0) {
          alreadyReadBooks.push(`"${entry["Title"]}" by ${entry["Author"] || 'unknown'} (rated ${entry["My Rating"]}/5)`);
        }
      });
    }
    
    // Prepare the list of detected books
    const detectedBooks = books.map(book => {
      return {
        title: book.title,
        author: book.author,
        categories: book.categories || [],
        rating: book.rating || 'unknown'
      };
    });
    
    // System prompt for OpenAI
    
    // Books the user has in their collection
    const booksInput = JSON.stringify(detectedBooks);
    
    // User preferences
    const preferencesInput = JSON.stringify({
      preferredGenres: preferences.genres || [],
      preferredAuthors: preferences.authors || [],
      alreadyReadBooks: alreadyReadBooks.slice(0, 20) // Limit to 20 for context length
    });
    
    // Make the request to OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: `You are an expert literary recommendation system with deep knowledge of books, genres, authors, and reading patterns. Your task is to analyze the books detected in a user's bookshelf photo and provide highly personalized recommendations based on their preferences and reading history.

Consider the following factors when generating recommendations:
1. Genre alignment: How well the book's categories match the user's preferred genres
2. Author familiarity: Whether the user has enjoyed other works by the same author
3. Reading patterns: Themes, styles and subjects that appear in the user's highly-rated books
4. Critical acclaim: The book's overall quality, cultural impact, and ratings
5. Thematic connections: How the book connects to others the user has enjoyed
6. Reading level and complexity: Match to the user's demonstrated preferences
7. Cultural or historical significance: Books that expand on interests shown in their collection

For each book, assign a match score from 0-100 that represents how strongly you recommend it based on these factors.`
        },
        {
          role: "user",
          content: `Here are the books detected in the user's photo: ${booksInput}
          
Here are the user's preferences: ${preferencesInput}

Analyze these books and provide personalized recommendations from this list only. Don't recommend books not in this list.

For each recommended book, provide:
1. The exact book title and author name as shown in the detected books list
2. A match score from 0-100 (where higher scores indicate stronger recommendations)

IMPORTANT: Return your recommendations in this exact JSON format with no text before or after:
{
  "recommendations": [
    {
      "bookTitle": "Book Title",
      "bookAuthor": "Author Name",
      "matchScore": 85,
      "matchReason": "Brief explanation of why this book matches the user's preferences (1-2 sentences)"
    }
  ]
}`
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 1000,
      temperature: 0.2 // Set to 0.2 for more deterministic recommendations
    });
    
    // Increment OpenAI API counter
    rateLimiter.increment('openai');
    
    // Parse the response
    const responseContent = response.choices[0].message.content;
    if (!responseContent) {
      log('Empty response from OpenAI', 'recommendations');
      return [];
    }
    
    try {
      log(`OpenAI response received`, 'recommendations');
      
      // Parse the JSON response
      const recommendationsData = JSON.parse(responseContent);
      
      // Extract the recommendations array
      if (!recommendationsData.recommendations || !Array.isArray(recommendationsData.recommendations)) {
        log('No recommendations array found in OpenAI response', 'recommendations');
        log(`Response keys: ${Object.keys(recommendationsData).join(', ')}`, 'recommendations');
        return [];
      }
      
      const recommendations = recommendationsData.recommendations;
      
      // Check if we have any recommendations
      if (recommendations.length === 0) {
        log('Empty recommendations array from OpenAI', 'recommendations');
        return [];
      }
      
      // Process and enhance the book objects
      log(`Successfully received ${recommendations.length} recommendations from OpenAI`, 'recommendations');
      
      // Match the recommendations back to the original book objects
      const enhancedBooks: EnhancedBookInfo[] = [];
      
      for (const rec of recommendations) {
        // Find the matching original book
        const originalBook = books.find(book => 
          book.title.toLowerCase() === rec.bookTitle.toLowerCase() ||
          book.title.toLowerCase().includes(rec.bookTitle.toLowerCase()) ||
          rec.bookTitle.toLowerCase().includes(book.title.toLowerCase())
        );
        
        if (!originalBook) {
          log(`Could not find matching book for "${rec.bookTitle}"`, 'recommendations');
          continue;
        }
        
        // Add the match score and reason to the original book
        enhancedBooks.push({
          ...originalBook,
          matchScore: rec.matchScore,
          matchReason: rec.matchReason
        });
      }
      
      // Sort by match score (highest first)
      enhancedBooks.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
      
      log(`Returning ${enhancedBooks.length} enhanced books with AI recommendations`, 'recommendations');
      return enhancedBooks as BookInfo[];
    } catch (error) {
      log(`Error parsing OpenAI response: ${error instanceof Error ? error.message : String(error)}`, 'recommendations');
      log(`Response content: ${responseContent}`, 'recommendations');
      return [];
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`Error getting OpenAI recommendations: ${errorMessage}`, 'recommendations');
    
    // Track API failure for monitoring and alerting
    trackApiFailure('openai', errorMessage);
    
    return [];
  }
}

/**
 * Process the recommendations from OpenAI and map them back to the original book objects
 * 
 * @param recommendations The recommendations from OpenAI
 * @param originalBooks The original book objects with all metadata
 * @returns The sorted book objects with match scores
 */
function processRecommendations(
  recommendations: RecommendationResponse[],
  originalBooks: BookInfo[]
): BookInfo[] {
  // Sort recommendations by match score (highest first)
  recommendations.sort((a, b) => b.matchScore - a.matchScore);
  
  // Map the recommendations back to original book objects
  return recommendations.map(recommendation => {
    // Find the original book object
    const originalBook = originalBooks.find(book => 
      book.title.toLowerCase() === recommendation.bookTitle.toLowerCase() && 
      book.author.toLowerCase() === recommendation.bookAuthor.toLowerCase()
    ) || originalBooks.find(book => 
      book.title.toLowerCase().includes(recommendation.bookTitle.toLowerCase()) || 
      recommendation.bookTitle.toLowerCase().includes(book.title.toLowerCase())
    );
    
    if (!originalBook) {
      log(`Could not find original book for "${recommendation.bookTitle}" by ${recommendation.bookAuthor}`, 'recommendations');
      return null;
    }
    
    // Return the original book with just the match score
    return {
      ...originalBook,
      matchScore: recommendation.matchScore
    };
  }).filter(book => book !== null) as BookInfo[];
}