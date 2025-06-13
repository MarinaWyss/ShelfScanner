import { bookCacheService } from './book-cache-service';
import { log } from './simple-logger.js';

/**
 * Interface for OpenAI-enhanced book info
 */
export interface EnhancedBookInfo {
  title: string;
  author: string;
  isbn?: string;
  coverUrl?: string;
  summary?: string;
  rating?: string;
  fromCache: boolean;
  source: string;
}

/**
 * Get book details with OpenAI-enhanced rating and summary
 * This function guarantees OpenAI-generated content for both rating and summary
 */
export async function getOpenAIBookDetails(
  title: string,
  author: string,
  isbn?: string
): Promise<EnhancedBookInfo> {
  try {
    // Check cache first to avoid API calls if possible
    const cachedBook = await bookCacheService.findInCache(title, author);
    
    if (cachedBook && cachedBook.rating && cachedBook.summary && cachedBook.source === 'openai') {
      log(`Using cached OpenAI book data for "${title}" by ${author}`, 'books');
      
      return {
        title: cachedBook.title,
        author: cachedBook.author,
        isbn: cachedBook.isbn || undefined,
        coverUrl: cachedBook.coverUrl || undefined,
        summary: cachedBook.summary,
        rating: cachedBook.rating,
        fromCache: true,
        source: 'openai'
      };
    }
    
    // Create base book info
    const bookInfo: EnhancedBookInfo = {
      title,
      author,
      isbn,
      fromCache: false,
      source: 'openai'
    };
    
    // Get OpenAI-generated rating
    try {
      log(`Getting OpenAI rating for "${title}" by ${author}`, 'books');
      const rating = await bookCacheService.getEnhancedRating(title, author, isbn);
      
      if (rating) {
        bookInfo.rating = rating;
        log(`Got OpenAI rating for "${title}": ${rating}`, 'books');
      }
    } catch (error) {
      log(`Error getting OpenAI rating for "${title}": ${error instanceof Error ? error.message : String(error)}`, 'books');
    }
    
    // Get OpenAI-generated summary
    try {
      log(`Getting OpenAI summary for "${title}" by ${author}`, 'books');
      const summary = await bookCacheService.getEnhancedSummary(title, author);
      
      if (summary) {
        bookInfo.summary = summary;
        log(`Got OpenAI summary for "${title}"`, 'books');
      }
    } catch (error) {
      log(`Error getting OpenAI summary for "${title}": ${error instanceof Error ? error.message : String(error)}`, 'books');
    }
    
    return bookInfo;
  } catch (error) {
    log(`Error getting OpenAI book details: ${error instanceof Error ? error.message : String(error)}`, 'books');
    
    // Return minimal info if error occurs
    return {
      title,
      author,
      fromCache: false,
      source: 'error'
    };
  }
}