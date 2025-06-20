import { db } from './db.js';
import { bookCache, type InsertBookCache, type BookCache } from '../shared/schema.js';
import { eq, and, or, sql, lte, gte, isNotNull, not, isNull } from 'drizzle-orm';
import { getEstimatedBookRating } from './utils/book-utils.js';
import { log } from './simple-logger.js';
import OpenAI from "openai";
import { rateLimiter } from './rate-limiter.js';

// Configure OpenAI client
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 2,
  timeout: 15000
});

// Cache expiration duration in milliseconds
const CACHE_DURATION = {
  GOOGLE: 365 * 24 * 60 * 60 * 1000, // 365 days for Google Books (very stable)
  AMAZON: 7 * 24 * 60 * 60 * 1000,   // 7 days for Amazon (pricing changes)
  OPENAI: 365 * 24 * 60 * 60 * 1000, // 365 days for OpenAI summaries (content doesn't change)
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
    if (!isbn || isbn.length < 10) {return undefined;}

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
    source?: 'google' | 'amazon' | 'openai' | 'saved';
    expiresAt?: Date;
  }): Promise<BookCache> {
    // Determine the source based on the content being cached
    let source: 'google' | 'amazon' | 'openai' | 'saved';
    
    // If we have OpenAI-generated content (summary or rating), mark as OpenAI source
    if (bookData.summary || bookData.rating) {
      source = 'openai';
    } else {
      // Default to google for basic book info without OpenAI content, or use provided source
      source = bookData.source || 'google';
    }
    
    // Note: We now allow caching of OpenAI-generated summaries and ratings regardless of initial source
    // The source will be automatically set to 'openai' when we have OpenAI content
    
    try {
      // Normalize inputs for consistent matching
      const normalizedTitle = bookData.title.trim();
      const normalizedAuthor = bookData.author.trim();
      
      // First perform a direct query to find exact match to prevent duplicates
      const [directMatch] = await db.select().from(bookCache).where(
        and(
          eq(sql`LOWER(TRIM(${bookCache.title}))`, normalizedTitle.toLowerCase()),
          eq(sql`LOWER(TRIM(${bookCache.author}))`, normalizedAuthor.toLowerCase())
        )
      );
      
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
          case 'saved': expirationMs = CACHE_DURATION.OPENAI; break; // Long expiration for user saved books
        }
        
        expiresAt = new Date(now.getTime() + expirationMs);
      }

      // If we found an exact match with direct query, use that
      if (directMatch) {

        
        // Update the existing entry with any new information
        const [updated] = await db.update(bookCache)
          .set({
            isbn: bookData.isbn || directMatch.isbn,
            coverUrl: bookData.coverUrl || directMatch.coverUrl,
            rating: bookData.rating || directMatch.rating,
            summary: bookData.summary || directMatch.summary,
            source: source, // Use the determined source based on content
            metadata: bookData.metadata || directMatch.metadata,
            expiresAt: expiresAt
          })
          .where(eq(bookCache.id, directMatch.id))
          .returning();
          

        return updated;
      }
      
      // If no direct match, try the fuzzy search
      const existing = await this.findInCache(normalizedTitle, normalizedAuthor);
      
      if (existing) {
        // Update existing cache entry with fuzzy match
        const [updated] = await db.update(bookCache)
          .set({
            isbn: bookData.isbn || existing.isbn,
            coverUrl: bookData.coverUrl || existing.coverUrl,
            rating: bookData.rating || existing.rating,
            summary: bookData.summary || existing.summary,
            source: source, // Use the determined source based on content
            metadata: bookData.metadata || existing.metadata,
            expiresAt: expiresAt
          })
          .where(eq(bookCache.id, existing.id))
          .returning();
        

        return updated;
      }
      
      // Insert new cache entry
      // Generate a unique ID for this book
      const uniqueId = 
        bookData.isbn || 
        `${normalizedTitle}-${normalizedAuthor}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
      
      const insertData: InsertBookCache = {
        title: normalizedTitle,
        author: normalizedAuthor,
        isbn: bookData.isbn || undefined,
        coverUrl: bookData.coverUrl || undefined,
        rating: bookData.rating || undefined,
        summary: bookData.summary || undefined,
        source: source,
        bookId: uniqueId, // Use our generated unique ID
        metadata: bookData.metadata || undefined,
        expiresAt: expiresAt
      };
      
      const [inserted] = await db.insert(bookCache).values(insertData).returning();
      

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
      
      // Look for cached summary first - prioritize OpenAI content
      const cachedBook = await this.findInCache(title, author);
      if (cachedBook?.summary && cachedBook.source === 'openai') {
        // Only use cached summary if it's from OpenAI
        log(`Using cached OpenAI summary for "${title}"`, 'cache');
        return cachedBook.summary;
      }
      
      // Check rate limits and atomically increment if allowed
      if (!(await rateLimiter.checkAndIncrement('openai'))) {
        log('Rate limit reached for OpenAI, skipping summary enhancement', 'cache');
        return existingSummary || null;
      }
      
      // Generate a new summary using OpenAI's knowledge
      log(`Generating enhanced summary for "${title}" by ${author}`, 'cache');
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: "You are a literary expert providing engaging book summaries. Craft a concise 3-4 sentence summary that captures the essence of the book, its main themes, and what makes it notable. Focus on being informative yet brief."
          },
          {
            role: "user",
            content: `Summarize the book "${title}" by ${author}" in 3-4 sentences. Be engaging and highlight what makes this book special. Use only your existing knowledge about this book - do not conduct web searches.`
          }
        ],
        max_tokens: 200,
        temperature: 0.6 // Slightly higher temperature for more engaging summaries
      });
      
      const summary = response.choices[0].message.content?.trim() || null;
      
      if (summary) {
        // Cache the summary with a longer expiration since book content doesn't change
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 120); // 120 days cache for summaries
        
        // First check if we already have this book in cache to preserve its data
        const existingBook = await this.findInCache(title, author);
        
        // If we have an existing book, update it directly to avoid duplicate entries
        if (existingBook) {
          log(`Updating existing book cache entry (ID: ${existingBook.id}) with new summary`, 'cache');
          
          // Direct database update to ensure we don't create duplicates
          // Also update source to openai since we're adding OpenAI content
          const [updated] = await db.update(bookCache)
            .set({
              summary: summary,
              source: 'openai', // Mark as OpenAI source since we're adding OpenAI content
              expiresAt
            })
            .where(eq(bookCache.id, existingBook.id))
            .returning();
            
          log(`Updated summary for "${title}" in cache ID ${updated.id}`, 'cache');
        } else {
          // No existing entry - create a new one
          // Generate a unique book ID
          const _bookId = `${title.trim()}-${author.trim()}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
          
          const cacheData = {
            title: title.trim(),
            author: author.trim(),
            summary,
            source: 'openai' as const,
            isbn: undefined,
            coverUrl: undefined,
            rating: undefined,
            metadata: undefined,
            expiresAt
          };
          
          const inserted = await this.cacheBook(cacheData);
          log(`Created new cache entry with summary for "${title}" (ID: ${inserted.id})`, 'cache');
        }
        
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
      // Check for cached rating first - prioritize OpenAI content
      const cachedBook = await this.findInCache(title, author);
      if (cachedBook?.rating && cachedBook.source === 'openai') {
        // Only use cached rating if it's from OpenAI
        log(`Using cached OpenAI rating for "${title}": ${cachedBook.rating}`, 'cache');
        return cachedBook.rating;
      }
      
      // If we have an ISBN, try looking up by that
      if (isbn) {
        const isbnBook = await this.findByISBN(isbn);
        if (isbnBook?.rating) {
          // Check if it's a valid rating regardless of source
          const ratingNum = parseFloat(isbnBook.rating);
          if (!isNaN(ratingNum) && ratingNum >= 1.0 && ratingNum <= 5.0) {
            log(`Using cached ISBN rating for "${title}": ${isbnBook.rating}`, 'cache');
            
            // Also cache under title/author for future lookups
            await this.cacheBook({
              title,
              author,
              isbn,
              rating: isbnBook.rating,
              source: isbnBook.source || 'openai'
            });
            
            return isbnBook.rating;
          }
        }
      }
      
      // Check if OpenAI is configured
      if (!process.env.OPENAI_API_KEY) {
        log('OpenAI API key not configured for rating generation, using estimate', 'cache');
        const estimatedRating = getEstimatedBookRating(title, author);
        return estimatedRating;
      }
      
      // Check rate limits and atomically increment if allowed
      if (!(await rateLimiter.checkAndIncrement('openai'))) {
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
      
      const ratingText = response.choices[0].message.content?.trim() || '';
      log(`OpenAI response for "${title}" rating: "${ratingText}"`, 'cache');
      
      // Extract the numeric rating (looking for patterns like "4.5", "4.0", "4", etc.)
      const ratingMatch = ratingText.match(/(\d+(?:\.\d+)?)/);
      let rating = ratingMatch ? ratingMatch[1] : '';
      log(`Extracted rating for "${title}": "${rating}"`, 'cache');
      
      // Validate that rating is in the correct range and determine if it's actually from OpenAI
      let isOpenAIRating = false;
      if (rating) {
        const ratingNumber = parseFloat(rating);
        if (ratingNumber >= 1.0 && ratingNumber <= 5.0) {
          // Valid rating from OpenAI - ensure it has one decimal place
          rating = ratingNumber.toFixed(1);
          isOpenAIRating = true;
          log(`Got valid OpenAI rating: ${rating}`, 'cache');
        } else {
          // Invalid range, use a fallback
          log(`Invalid rating range from OpenAI: ${ratingNumber}, using fallback`, 'cache');
          rating = getEstimatedBookRating(title, author);
          isOpenAIRating = false;
        }
      } else {
        // No valid rating extracted, use a fallback
        log(`Could not extract rating from OpenAI response: "${ratingText}", using fallback`, 'cache');
        rating = getEstimatedBookRating(title, author);
        isOpenAIRating = false;
      }
      
      // First check if we already have this book in cache to preserve its data
      const existingBook = await this.findInCache(title, author);
      
      const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days
      
      // If we have an existing book, update it directly to avoid duplicate entries
      if (existingBook) {
        log(`Updating existing book cache entry (ID: ${existingBook.id}) with new rating: ${rating}`, 'cache');
        
        // Only mark as OpenAI source if we actually got a valid rating from OpenAI
        const sourceToUse = isOpenAIRating ? 'openai' : existingBook.source || 'google';
        
        // Direct database update to ensure we don't create duplicates
        const [updated] = await db.update(bookCache)
          .set({
            rating: rating,
            source: sourceToUse, // This will be 'openai' if rating came from OpenAI
            isbn: isbn || existingBook.isbn,
            expiresAt
          })
          .where(eq(bookCache.id, existingBook.id))
          .returning();
          
        log(`Updated rating for "${title}" in cache ID ${updated.id}`, 'cache');
      } else {
        // No existing entry - create a new one
        // Only mark as OpenAI source if we actually got a valid rating from OpenAI
        const sourceToUse = isOpenAIRating ? 'openai' : 'google';
        
        const cacheData = {
          title: title.trim(),
          author: author.trim(),
          isbn: isbn || undefined,
          rating: rating,
          source: sourceToUse as 'google' | 'amazon' | 'openai' | 'saved',
          coverUrl: undefined,
          summary: undefined,
          metadata: undefined,
          expiresAt
        };
        
        const inserted = await this.cacheBook(cacheData);
        log(`Created new cache entry with rating for "${title}" (ID: ${inserted.id})`, 'cache');
      }
      
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
  
  /**
   * Removes non-OpenAI ratings from the cache
   * This ensures we only use OpenAI-generated ratings for consistency
   * @returns Number of entries updated
   */
  async cleanupNonOpenAIRatings(): Promise<number> {
    try {
      // Find entries with ratings that don't have OpenAI as the source
      const entries = await db.select().from(bookCache)
        .where(
          and(
            isNotNull(bookCache.rating),
            or(
              not(eq(bookCache.source, 'openai')),
              isNull(bookCache.source)
            )
          )
        );
      
      if (entries.length === 0) {
        log('No non-OpenAI ratings found in cache', 'cache');
        return 0;
      }
      
      let updateCount = 0;
      for (const entry of entries) {
        // Reset the rating but keep other data
        await db.update(bookCache)
          .set({
            rating: null
          })
          .where(eq(bookCache.id, entry.id));
          
        updateCount++;
      }
      
      log(`Cleared ratings from ${updateCount} non-OpenAI cache entries`, 'cache');
      return updateCount;
    } catch (error) {
      log(`Error clearing non-OpenAI ratings: ${error instanceof Error ? error.message : String(error)}`, 'cache');
      return 0;
    }
  }
  
  /**
   * Clear cache for testing purposes, but preserves descriptions to avoid regenerating them
   * @param options Options for selective cache clearing
   * @returns Number of entries affected
   */
  async clearCacheForTesting(options: {
    preserveDescriptions?: boolean;
    titleFilter?: string;
  } = {}): Promise<number> {
    try {
      const { preserveDescriptions = true, titleFilter } = options;
      
      // If we need to preserve descriptions or filter by title, we need a more selective approach
      if (preserveDescriptions || titleFilter) {
        // First, get the entries that match our criteria
        const baseQuery = db.select().from(bookCache);
        const query = titleFilter 
          ? baseQuery.where(sql`LOWER(${bookCache.title}) LIKE ${`%${titleFilter.toLowerCase()}%`}`)
          : baseQuery;
        
        const entries = await query;
        const count = entries.length;
        
        if (count === 0) {
          log(`No cache entries found matching the criteria`, 'cache');
          return 0;
        }
        
        // For testing purposes, we'll just reset the expiresAt date to trigger a refresh
        // but keep the descriptions to avoid unnecessary OpenAI calls
        const now = new Date();
        // Set expiry to 1 minute ago to trigger a refresh on next access
        const expiry = new Date(now.getTime() - 60000);
        
        let updateCount = 0;
        for (const entry of entries) {
          let updateData: any = {
            expiresAt: expiry
          };
          
          // If we don't need to preserve descriptions, also clear those fields
          if (!preserveDescriptions) {
            updateData = {
              ...updateData,
              summary: null
            };
          }
          
          await db.update(bookCache)
            .set(updateData)
            .where(eq(bookCache.id, entry.id));
            
          updateCount++;
        }
        
        log(`Updated ${updateCount} cache entries for testing (preserving descriptions: ${preserveDescriptions})`, 'cache');
        return updateCount;
      } else {
        // If we don't need any special handling, just clear everything
        const result = await db.delete(bookCache).returning();
        const count = result.length;
        
        log(`Cleared ${count} entries from book cache`, 'cache');
        return count;
      }
    } catch (error) {
      log(`Error clearing cache for testing: ${error instanceof Error ? error.message : String(error)}`, 'cache');
      return 0;
    }
  }
}

// Create a singleton instance
export const bookCacheService = new BookCacheService();