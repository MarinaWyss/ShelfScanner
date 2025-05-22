import OpenAI from "openai";
import { log } from './vite';
import { rateLimiter } from './rate-limiter';

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
  matchReason: string;
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
          content: `You are a book recommendation expert. Analyze the detected books and the user's preferences to provide personalized book recommendations.
          
Consider the following factors:
1. Genre matches between the user's preferred genres and the book's categories
2. Author matches if the user has read other books by the same author
3. The user's reading history and ratings of similar books
4. The book's overall quality and rating

For each book in the detected books list, assign a match score from 0-100 and explain why it would be a good recommendation.`
        },
        {
          role: "user",
          content: `Here are the books detected in the user's photo: ${booksInput}
          
Here are the user's preferences: ${preferencesInput}

Recommend the top books from the detected list that would be most interesting to this user.
For each book, provide:
1. The book title and author
2. A match score from 0-100
3. A brief explanation of why this book matches the user's preferences

IMPORTANT: Return the recommendations in this exact JSON format with no additional text before or after:
{
  "recommendations": [
    {
      "bookTitle": "Book Title",
      "bookAuthor": "Author Name",
      "matchScore": 85,
      "matchReason": "This book matches the user's preference for science fiction and is by an author they've rated highly."
    }
  ]
}`
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 1000,
      temperature: 0.5 // Lower temperature for more consistent recommendations
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
      const enhancedBooks = recommendations.map((rec: RecommendationResponse) => {
        // Find the matching original book
        const originalBook = books.find((book: BookInfo) => 
          book.title.toLowerCase() === rec.bookTitle.toLowerCase() ||
          book.title.toLowerCase().includes(rec.bookTitle.toLowerCase()) ||
          rec.bookTitle.toLowerCase().includes(book.title.toLowerCase())
        );
        
        if (!originalBook) {
          log(`Could not find matching book for "${rec.bookTitle}"`, 'recommendations');
          return null;
        }
        
        // Add the match score and reason to the original book
        return {
          ...originalBook,
          matchScore: rec.matchScore,
          matchReason: rec.matchReason
        };
      }).filter((book: any) => book !== null);
      
      // Sort by match score (highest first)
      enhancedBooks.sort((a: any, b: any) => (b.matchScore || 0) - (a.matchScore || 0));
      
      log(`Returning ${enhancedBooks.length} enhanced books with AI recommendations`, 'recommendations');
      return enhancedBooks as BookInfo[];
    } catch (error) {
      log(`Error parsing OpenAI response: ${error instanceof Error ? error.message : String(error)}`, 'recommendations');
      log(`Response content: ${responseContent}`, 'recommendations');
      return [];
    }
  } catch (error) {
    log(`Error getting OpenAI recommendations: ${error instanceof Error ? error.message : String(error)}`, 'recommendations');
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
    
    // Return the original book with the match score and reason
    return {
      ...originalBook,
      matchScore: recommendation.matchScore,
      matchReason: recommendation.matchReason
    };
  }).filter(book => book !== null) as BookInfo[];
}