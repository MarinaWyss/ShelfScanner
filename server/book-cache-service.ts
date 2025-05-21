import { db } from './db';
import { bookCache, type InsertBookCache, type BookCache } from '@shared/schema';
import { eq, and, or, sql, desc, asc, lte, gte } from 'drizzle-orm';
import { getAmazonBookRating, getEstimatedBookRating } from './amazon';
import { log } from './vite';
import OpenAI from "openai";
import { rateLimiter } from './rate-limiter';

// Configure OpenAI client
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 2,
  timeout: 15000
});

// Cache expiration duration in milliseconds
const CACHE_DURATION = {
  GOOGLE: 30 * 24 * 60 * 60 * 1000, // 30 days for Google Books (more stable)
  AMAZON: 7 * 24 * 60 * 60 * 1000,  // 7 days for Amazon (pricing changes)
  OPENAI: 90 * 24 * 60 * 60 * 1000, // 90 days for OpenAI summaries (content doesn't change)
};

// Default cache duration
const DEFAULT_EXPIRATION = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Book Cache Service - Manages storing and retrieving book information
 * to reduce expensive API calls while maintaining high-quality data
 */
export class BookCacheService {
  /**
   * Find a book in the cache by title and author
   * @param title Book title
   * @param author Book author
   * @returns BookCache object if found, undefined otherwise
   */
  async findInCache(title: string, author: string): Promise<BookCache | undefined> {
    // Normalize inputs for better matching
    const normalizedTitle = title.toLowerCase().trim();
    const normalizedAuthor = author.toLowerCase().trim();

    try {
      // Check for both exact and close matches
      const [exactMatch] = await db.select().from(bookCache).where(
        and(
          eq(sql`LOWER(${bookCache.title})`, normalizedTitle),
          or(
            eq(sql`LOWER(${bookCache.author})`, normalizedAuthor),
            sql`LOWER(${bookCache.author}) LIKE ${`%${normalizedAuthor}%`}`,
            sql`${normalizedAuthor} LIKE CONCAT('%', LOWER(${bookCache.author}), '%')`
          ),
          gte(bookCache.expiresAt, new Date()) // Not expired
        )
      );

      if (exactMatch) {
        log(`Cache hit for "${title}" by ${author}`, 'cache');
        return exactMatch;
      }

      // Try partial match if exact match fails
      const [partialMatch] = await db.select().from(bookCache).where(
        and(
          or(
            sql`LOWER(${bookCache.title}) LIKE ${`%${normalizedTitle}%`}`,
            sql`${normalizedTitle} LIKE CONCAT('%', LOWER(${bookCache.title}), '%')`
          ),
          or(
            sql`LOWER(${bookCache.author}) LIKE ${`%${normalizedAuthor}%`}`,
            sql`${normalizedAuthor} LIKE CONCAT('%', LOWER(${bookCache.author}), '%')`
          ),
          gte(bookCache.expiresAt, new Date()) // Not expired
        )
      ).limit(1);

      if (partialMatch) {
        log(`Partial cache hit for "${title}" by ${author}`, 'cache');
        return partialMatch;
      }

      log(`Cache miss for "${title}" by ${author}`, 'cache');
      return undefined;
    } catch (error) {
      log(`Error finding book in cache: ${error instanceof Error ? error.message : String(error)}`, 'cache');
      return undefined;
    }
  }

  /**
   * Find a book in the cache by ISBN
   * @param isbn Book ISBN
   * @returns BookCache object if found, undefined otherwise
   */
  async findByISBN(isbn: string): Promise<BookCache | undefined> {
    if (!isbn || isbn.length < 10) return undefined;

    try {
      const [book] = await db.select().from(bookCache).where(
        and(
          eq(bookCache.isbn, isbn),
          gte(bookCache.expiresAt, new Date()) // Not expired
        )
      );

      if (book) {
        log(`ISBN cache hit for ${isbn}`, 'cache');
      } else {
        log(`ISBN cache miss for ${isbn}`, 'cache');
      }

      return book;
    } catch (error) {
      log(`Error finding book by ISBN: ${error instanceof Error ? error.message : String(error)}`, 'cache');
      return undefined;
    }
  }

  /**
   * Save a book to the cache
   * @param bookData Book data to cache
   * @param source Source of the book data (google, amazon, openai)
   * @returns The cached book
   */
  async cacheBook(bookData: {
    title: string;
    author: string;
    isbn?: string;
    coverUrl?: string;
    rating?: string;
    summary?: string;
    metadata?: any;
    source?: 'google' | 'amazon' | 'openai';
    expiresAt?: Date;
  }): Promise<BookCache> {
    const source = bookData.source || 'google';
    try {
      // Set expiration based on source if not explicitly provided
      let expiresAt: Date;
      
      if (bookData.expiresAt) {
        // Use provided expiration date
        expiresAt = bookData.expiresAt;
      } else {
        // Calculate expiration based on source
        const now = new Date();
        let expirationMs = DEFAULT_EXPIRATION;
        
        switch (source) {
          case 'google': expirationMs = CACHE_DURATION.GOOGLE; break;
          case 'amazon': expirationMs = CACHE_DURATION.AMAZON; break;
          case 'openai': expirationMs = CACHE_DURATION.OPENAI; break;
        }
        
        expiresAt = new Date(now.getTime() + expirationMs);
      }

      // Check if this book already exists in cache
      const existing = await this.findInCache(bookData.title, bookData.author);
      
      if (existing) {
        // Update existing cache entry
        const [updated] = await db.update(bookCache)
          .set({
            isbn: bookData.isbn || existing.isbn,
            coverUrl: bookData.coverUrl || existing.coverUrl,
            rating: bookData.rating || existing.rating,
            summary: bookData.summary || existing.summary,
            source: source,
            metadata: bookData.metadata || existing.metadata,
            expiresAt: expiresAt
          })
          .where(eq(bookCache.id, existing.id))
          .returning();
        
        log(`Updated cache for "${bookData.title}" by ${bookData.author}`, 'cache');
        return updated;
      }
      
      // Insert new cache entry
      const insertData: InsertBookCache = {
        title: bookData.title,
        author: bookData.author,
        isbn: bookData.isbn || null,
        coverUrl: bookData.coverUrl || null,
        rating: bookData.rating || null,
        summary: bookData.summary || null,
        source: source,
        metadata: bookData.metadata || null,
        expiresAt: expiresAt
      };
      
      const [inserted] = await db.insert(bookCache).values(insertData).returning();
      
      log(`Added to cache: "${bookData.title}" by ${bookData.author}`, 'cache');
      return inserted;
    } catch (error) {
      log(`Error caching book: ${error instanceof Error ? error.message : String(error)}`, 'cache');
      throw error;
    }
  }

  /**
   * Remove expired entries from the cache
   * @returns Number of entries removed
   */
  async cleanupExpired(): Promise<number> {
    try {
      const now = new Date();
      const result = await db.delete(bookCache).where(lte(bookCache.expiresAt, now)).returning();
      const count = result.length;
      
      if (count > 0) {
        log(`Removed ${count} expired entries from book cache`, 'cache');
      }
      
      return count;
    } catch (error) {
      log(`Error cleaning up expired cache: ${error instanceof Error ? error.message : String(error)}`, 'cache');
      return 0;
    }
  }

  /**
   * Get enhanced book summary using OpenAI, leveraging its knowledge of literature
   * @param title Book title
   * @param author Book author
   * @param existingSummary Existing summary to enhance (optional)
   * @returns Enhanced summary
   */
  async getEnhancedSummary(
    title: string, 
    author: string, 
    existingSummary?: string
  ): Promise<string | null> {
    try {
      // Check if OpenAI is configured
      if (!process.env.OPENAI_API_KEY) {
        log('OpenAI API key not configured for summary generation', 'cache');
        return existingSummary || null;
      }
      
      // Check rate limits
      if (!rateLimiter.isAllowed('openai')) {
        log('Rate limit reached for OpenAI, skipping summary enhancement', 'cache');
        return existingSummary || null;
      }
      
      // Look for cached summary first
      const cachedBook = await this.findInCache(title, author);
      if (cachedBook?.summary && cachedBook.source === 'openai') {
        log(`Using cached OpenAI summary for "${title}"`, 'cache');
        return cachedBook.summary;
      }
      
      // Generate a new summary using OpenAI's knowledge
      log(`Generating enhanced summary for "${title}" by ${author}`, 'cache');
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: "You are a literary expert with extensive knowledge of books across all genres. Your task is to provide accurate, engaging, and insightful book summaries based on your knowledge. Do not fabricate plot details if you're uncertain about the book's content - instead, focus on what you know with confidence. Summaries should be 2-3 paragraphs, highlighting themes, style, and significance."
          },
          {
            role: "user",
            content: `Please provide a compelling summary for the book "${title}" by ${author}". Use only your existing knowledge about this book - do not conduct web searches. If you have limited knowledge about this specific book, focus on what you do know about it or similar works by this author. The summary should be 2-3 paragraphs, highlighting key themes, writing style, and cultural/literary significance where relevant.`
          }
        ],
        max_tokens: 500,
        temperature: 0.7 // Slightly higher temperature for more engaging summaries
      });
      
      // Increment OpenAI API counter
      rateLimiter.increment('openai');
      
      const summary = response.choices[0].message.content?.trim() || null;
      
      if (summary) {
        // Cache the summary with a longer expiration since book content doesn't change
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 120); // 120 days cache for summaries
        
        await this.cacheBook({
          title,
          author,
          summary,
          expiresAt,
          source: 'openai'
        });
        
        log(`Successfully generated and cached summary for "${title}"`, 'cache');
      }
      
      return summary;
    } catch (error) {
      log(`Error generating summary: ${error instanceof Error ? error.message : String(error)}`, 'cache');
      return existingSummary || null;
    }
  }
  
  /**
   * Get enhanced book rating using OpenAI
   * Will try to use cached rating first, then use OpenAI to generate a rating
   * based on its knowledge of books and literature.
   * 
   * @param title Book title
   * @param author Book author
   * @param isbn Book ISBN (optional)
   * @returns Book rating string (e.g. "4.5")
   */
  async getEnhancedRating(
    title: string,
    author: string,
    isbn?: string
  ): Promise<string> {
    try {
      // Check for cached rating first
      const cachedBook = await this.findInCache(title, author);
      if (cachedBook?.rating) {
        log(`Using cached rating for "${title}": ${cachedBook.rating}`, 'cache');
        return cachedBook.rating;
      }
      
      // If we have an ISBN, try looking up by that
      if (isbn) {
        const isbnBook = await this.findByISBN(isbn);
        if (isbnBook?.rating) {
          log(`Using cached ISBN rating for "${title}": ${isbnBook.rating}`, 'cache');
          
          // Also cache under title/author for future lookups
          await this.cacheBook({
            title,
            author,
            isbn,
            rating: isbnBook.rating,
            source: 'openai'
          });
          
          return isbnBook.rating;
        }
      }
      
      // Check if OpenAI is configured
      if (!process.env.OPENAI_API_KEY) {
        log('OpenAI API key not configured for rating generation, using estimate', 'cache');
        const estimatedRating = getEstimatedBookRating(title, author);
        return estimatedRating;
      }
      
      // Check rate limits
      if (!rateLimiter.isAllowed('openai')) {
        log('Rate limit reached for OpenAI, using estimate for rating', 'cache');
        const estimatedRating = getEstimatedBookRating(title, author);
        return estimatedRating;
      }
      
      // Use OpenAI to generate a rating based on its knowledge
      log(`Generating rating for "${title}" by ${author} using OpenAI`, 'cache');
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: "You are a literary expert with extensive knowledge of books and their reception. Your task is to provide an accurate rating for a book based on critical consensus and general reader reception. Base your rating only on your knowledge of this book's reception - do not conduct web searches."
          },
          {
            role: "user",
            content: `Please rate the book "${title}" by ${author} on a scale of 1.0 to 5.0 stars (with one decimal place). Use your knowledge to provide the most accurate rating based on critical reception and reader feedback. Only respond with a single number between 1.0 and 5.0 (with one decimal place). If you don't have sufficient knowledge about this book, provide your best estimate of what its rating would be based on similar works by this author or in this genre.`
          }
        ],
        max_tokens: 10,
        temperature: 0.3 // Lower temperature for more consistent ratings
      });
      
      // Increment OpenAI API counter
      rateLimiter.increment('openai');
      
      const ratingText = response.choices[0].message.content?.trim() || '';
      
      // Extract the numeric rating (looking for patterns like "4.5" or "4.5 stars")
      const ratingMatch = ratingText.match(/(\d+\.\d+)/);
      let rating = ratingMatch ? ratingMatch[1] : '';
      
      // Validate that rating is in the correct range
      if (rating) {
        const ratingNumber = parseFloat(rating);
        if (ratingNumber < 1.0 || ratingNumber > 5.0) {
          // Invalid range, use a fallback
          rating = getEstimatedBookRating(title, author);
        }
      } else {
        // No valid rating extracted, use a fallback
        rating = getEstimatedBookRating(title, author);
      }
      
      // Cache the result
      await this.cacheBook({
        title,
        author,
        isbn,
        rating
      }, 'openai');
      
      log(`Generated rating for "${title}": ${rating}`, 'cache');
      return rating;
    } catch (error) {
      log(`Error getting enhanced rating: ${error instanceof Error ? error.message : String(error)}`, 'cache');
      return getEstimatedBookRating(title, author);
    }
  }
  
  /**
   * Run maintenance tasks (cleanup expired entries)
   * Should be called periodically
   */
  async runMaintenance(): Promise<void> {
    try {
      // Cleanup expired entries
      await this.cleanupExpired();
      
      // Additional maintenance tasks can be added here
    } catch (error) {
      log(`Error during cache maintenance: ${error instanceof Error ? error.message : String(error)}`, 'cache');
    }
  }
}

// Create a singleton instance
export const bookCacheService = new BookCacheService();