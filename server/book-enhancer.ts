import { bookCacheService } from './book-cache-service';
import { storage } from './storage';
import { log } from './vite';

/**
 * Utility for enhancing book information with OpenAI-generated content
 * This provides a way to improve existing books with high-quality summaries and ratings
 */
export class BookEnhancer {
  /**
   * Enhances a set of books with OpenAI-generated summaries and ratings
   * Uses caching to avoid redundant API calls
   */
  async enhanceBooks(books: Array<{
    title: string;
    author: string;
    isbn?: string;
    summary?: string;
    rating?: string;
  }>): Promise<Array<{
    title: string;
    author: string;
    isbn?: string;
    summary?: string;
    rating?: string;
    enhanced: boolean;
  }>> {
    if (!books || books.length === 0) {
      return [];
    }

    const enhancedBooks = await Promise.all(
      books.map(async (book) => {
        try {
          // Start with a copy of the original book
          const enhancedBook = { ...book, enhanced: false };
          
          // Check if this book exists in cache with enhanced content
          const cachedBook = await storage.findBookInCache(book.title, book.author);
          
          // If we have a cached version with good data, use it
          if (cachedBook) {
            if (cachedBook.summary && (!book.summary || book.summary.length < cachedBook.summary.length)) {
              enhancedBook.summary = cachedBook.summary;
              enhancedBook.enhanced = true;
            }
            
            if (cachedBook.rating && !book.rating) {
              enhancedBook.rating = cachedBook.rating;
              enhancedBook.enhanced = true;
            }
            
            log(`Enhanced book "${book.title}" with cached data`, 'enhancer');
            
            // If we have complete data, return early
            if (enhancedBook.summary && enhancedBook.rating) {
              return enhancedBook;
            }
          }
          
          // Generate missing data with OpenAI
          
          // Get enhanced rating if missing
          if (!enhancedBook.rating) {
            try {
              const rating = await bookCacheService.getEnhancedRating(book.title, book.author, book.isbn);
              if (rating) {
                enhancedBook.rating = rating;
                enhancedBook.enhanced = true;
                log(`Enhanced rating for "${book.title}" with OpenAI data`, 'enhancer');
              }
            } catch (error) {
              log(`Error enhancing rating for "${book.title}": ${error instanceof Error ? error.message : String(error)}`, 'enhancer');
            }
          }
          
          // Get enhanced summary if missing or too short
          if (!enhancedBook.summary || enhancedBook.summary.length < 100) {
            try {
              const summary = await bookCacheService.getEnhancedSummary(book.title, book.author, enhancedBook.summary);
              if (summary) {
                enhancedBook.summary = summary;
                enhancedBook.enhanced = true;
                log(`Enhanced summary for "${book.title}" with OpenAI data`, 'enhancer');
              }
            } catch (error) {
              log(`Error enhancing summary for "${book.title}": ${error instanceof Error ? error.message : String(error)}`, 'enhancer');
            }
          }
          
          return enhancedBook;
        } catch (error) {
          log(`Error enhancing book "${book.title}": ${error instanceof Error ? error.message : String(error)}`, 'enhancer');
          return { ...book, enhanced: false };
        }
      })
    );
    
    return enhancedBooks;
  }
  
  /**
   * Enhances a single book with OpenAI-generated summary and rating
   * Returns a new object with the enhanced data
   */
  async enhanceBook(book: {
    title: string;
    author: string;
    isbn?: string;
    summary?: string;
    rating?: string;
  }): Promise<{
    title: string;
    author: string;
    isbn?: string;
    summary?: string;
    rating?: string;
    enhanced: boolean;
  }> {
    const [enhancedBook] = await this.enhanceBooks([book]);
    return enhancedBook;
  }
  
  /**
   * Enhances saved books for a device
   * This takes the books from storage and enhances them with OpenAI data
   */
  async enhanceSavedBooks(deviceId: string): Promise<number> {
    try {
      // Get all saved books for this device
      const savedBooks = await storage.getSavedBooksByDeviceId(deviceId);
      
      if (!savedBooks || savedBooks.length === 0) {
        return 0;
      }
      
      log(`Enhancing ${savedBooks.length} saved books for device ${deviceId}`, 'enhancer');
      
      // Process books to enhance them
      let enhancedCount = 0;
      
      for (const book of savedBooks) {
        // Check if this book needs enhancement
        if (book.summary && book.summary.length >= 100 && book.rating) {
          // Book already has good data
          continue;
        }
        
        // Skip if we can't identify the book
        if (!book.title || !book.author) {
          continue;
        }
        
        try {
          // Check cache first
          const cachedBook = await storage.findBookInCache(book.title, book.author);
          
          if (cachedBook) {
            // Only update if cache has better data
            let needsUpdate = false;
            
            if (cachedBook.summary && (!book.summary || book.summary.length < cachedBook.summary.length)) {
              book.summary = cachedBook.summary;
              needsUpdate = true;
            }
            
            if (cachedBook.rating && !book.rating) {
              book.rating = cachedBook.rating;
              needsUpdate = true;
            }
            
            if (needsUpdate) {
              // Update the saved book with the better data
              await this.updateSavedBook(book);
              enhancedCount++;
            }
            
            // Continue to next book since we found cache data
            continue;
          }
          
          // Generate missing data with OpenAI and update the book
          let updated = false;
          
          // Get enhanced rating if missing
          if (!book.rating) {
            const rating = await bookCacheService.getEnhancedRating(book.title, book.author, book.isbn);
            if (rating) {
              book.rating = rating;
              updated = true;
            }
          }
          
          // Get enhanced summary if missing or too short
          if (!book.summary || book.summary.length < 100) {
            const summary = await bookCacheService.getEnhancedSummary(book.title, book.author, book.summary);
            if (summary) {
              book.summary = summary;
              updated = true;
            }
          }
          
          if (updated) {
            // Update the saved book with the enhanced data
            await this.updateSavedBook(book);
            enhancedCount++;
          }
        } catch (error) {
          log(`Error enhancing saved book "${book.title}": ${error instanceof Error ? error.message : String(error)}`, 'enhancer');
        }
      }
      
      return enhancedCount;
    } catch (error) {
      log(`Error enhancing saved books: ${error instanceof Error ? error.message : String(error)}`, 'enhancer');
      return 0;
    }
  }
  
  /**
   * Update a saved book in storage
   * This is a helper method for enhanceSavedBooks
   */
  private async updateSavedBook(book: any): Promise<void> {
    try {
      // For this implementation, we're updating the book directly
      // In a real system, you'd update via storage or database
      
      // Cache this book for future reference too
      await bookCacheService.cacheBook({
        title: book.title,
        author: book.author,
        isbn: book.isbn,
        coverUrl: book.coverUrl,
        rating: book.rating,
        summary: book.summary,
        source: 'openai',
        metadata: null
      });
      
      log(`Updated saved book "${book.title}" with enhanced data`, 'enhancer');
    } catch (error) {
      log(`Error updating saved book: ${error instanceof Error ? error.message : String(error)}`, 'enhancer');
    }
  }
}

// Export a singleton instance
export const bookEnhancer = new BookEnhancer();