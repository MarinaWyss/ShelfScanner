import { bookCacheService } from './book-cache-service';
import { log } from './vite';
import { storage } from './storage';
import axios from 'axios';
import { rateLimiter } from './rate-limiter';

/**
 * Interface for book search response items
 */
export interface BookInfo {
  title: string;
  author: string;
  isbn?: string;
  coverUrl?: string;
  summary?: string;
  rating?: string;
  publisher?: string;
  categories?: string[];
  detectedFrom?: string;
}

/**
 * Search for books by title with enhanced data from OpenAI
 * Uses caching to avoid redundant API calls
 */
export async function searchEnhancedBooks(title: string): Promise<BookInfo[]> {
  try {
    if (!title || title.trim().length < 2) {
      log(`Skipping search for invalid title: "${title}"`, 'books');
      return [];
    }
    
    log(`Searching for book with title: "${title}"`, 'books');
    
    // First, check our cache to see if we've already searched for this book
    const cachedBook = await storage.findBookInCache(title, '');
    
    if (cachedBook) {
      log(`Found "${title}" in cache, using cached data`, 'books');
      
      const bookInfo: BookInfo = {
        title: cachedBook.title,
        author: cachedBook.author,
        isbn: cachedBook.isbn || undefined,
        coverUrl: cachedBook.coverUrl || undefined,
        summary: cachedBook.summary || undefined,
        rating: cachedBook.rating || undefined,
        publisher: cachedBook.metadata?.publisher,
        categories: cachedBook.metadata?.categories
      };
      
      // If we have minimal data, try to enhance it
      if (!bookInfo.summary || !bookInfo.rating) {
        return await enhanceBookData([bookInfo]);
      }
      
      return [bookInfo];
    }
    
    // If not in cache, search Google Books API
    return await searchGoogleBooks(title);
  } catch (error) {
    log(`Error searching for enhanced books: ${error instanceof Error ? error.message : String(error)}`, 'books');
    return [];
  }
}

/**
 * Search for books using Google Books API
 */
async function searchGoogleBooks(title: string): Promise<BookInfo[]> {
  try {
    // Check if we can make a Google Books API request
    if (!rateLimiter.isAllowed('google-books')) {
      log(`Rate limit reached for Google Books API, skipping search for "${title}"`, 'books');
      return [];
    }
    
    const exactQuery = `intitle:"${encodeURIComponent(title.trim())}"`;
    const googleBooksUrl = `https://www.googleapis.com/books/v1/volumes?q=${exactQuery}&maxResults=5`;
    
    const googleResponse = await axios.get(googleBooksUrl);
    
    // Increment the rate limiter counter for Google Books API
    rateLimiter.increment('google-books');
    
    if (googleResponse.data.items && googleResponse.data.items.length > 0) {
      log(`Found ${googleResponse.data.items.length} results for "${title}" in Google Books API`, 'books');
      
      // Map the Google Books results to our format
      const books = googleResponse.data.items.map((item: any) => {
        const bookTitle = item.volumeInfo?.title || 'Unknown Title';
        const bookAuthor = item.volumeInfo?.authors ? item.volumeInfo.authors.join(', ') : 'Unknown Author';
        const isbn = item.volumeInfo?.industryIdentifiers?.find((id: any) => id.type === 'ISBN_13')?.identifier || '';
        
        const bookInfo: BookInfo = {
          title: bookTitle,
          author: bookAuthor,
          isbn: isbn,
          coverUrl: item.volumeInfo?.imageLinks?.thumbnail || undefined,
          summary: item.volumeInfo?.description || undefined,
          rating: item.volumeInfo?.averageRating ? item.volumeInfo.averageRating.toString() : undefined,
          publisher: item.volumeInfo?.publisher,
          categories: item.volumeInfo?.categories,
          detectedFrom: title
        };
        
        return bookInfo;
      });
      
      // Enhance the books with OpenAI generated data
      return await enhanceBookData(books);
    }
    
    // If no results from Google Books, try Open Library
    return await searchOpenLibrary(title);
  } catch (error) {
    log(`Error searching Google Books API: ${error instanceof Error ? error.message : String(error)}`, 'books');
    // Fallback to Open Library
    return await searchOpenLibrary(title);
  }
}

/**
 * Search for books using Open Library API (fallback)
 */
async function searchOpenLibrary(title: string): Promise<BookInfo[]> {
  try {
    // Check rate limits
    if (!rateLimiter.isAllowed('open-library')) {
      log(`Rate limit reached for Open Library API, skipping fallback search for "${title}"`, 'books');
      return [];
    }
    
    const openLibraryUrl = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=5`;
    const openLibraryResponse = await axios.get(openLibraryUrl);
    
    // Increment rate limiter
    rateLimiter.increment('open-library');
    
    if (openLibraryResponse.data.docs && openLibraryResponse.data.docs.length > 0) {
      log(`Found ${openLibraryResponse.data.docs.length} results for "${title}" in Open Library`, 'books');
      
      // Map Open Library results to our format
      const books = openLibraryResponse.data.docs.map((doc: any) => {
        const bookInfo: BookInfo = {
          title: doc.title || 'Unknown Title',
          author: doc.author_name ? doc.author_name.join(', ') : 'Unknown Author',
          isbn: doc.isbn ? doc.isbn[0] : undefined,
          coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : undefined,
          publisher: doc.publisher ? doc.publisher[0] : undefined,
          detectedFrom: title
        };
        
        return bookInfo;
      });
      
      // Enhance the books with OpenAI generated data
      return await enhanceBookData(books);
    }
    
    log(`No results found for "${title}" in any book API`, 'books');
    return [];
  } catch (error) {
    log(`Error searching Open Library API: ${error instanceof Error ? error.message : String(error)}`, 'books');
    return [];
  }
}

/**
 * Enhance book data with OpenAI-generated ratings and summaries
 */
async function enhanceBookData(books: BookInfo[]): Promise<BookInfo[]> {
  try {
    // Process all books to enhance them with OpenAI-generated data
    const enhancedBooks = await Promise.all(
      books.map(async (book: BookInfo) => {
        log(`Enhancing data for book: "${book.title}" by ${book.author}`, 'books');
        
        // Check our cache first
        const cachedBook = await storage.findBookInCache(book.title, book.author);
        
        if (cachedBook) {
          // Use cached data where it exists and is better than what we have
          if (cachedBook.summary && (!book.summary || book.summary.length < cachedBook.summary.length)) {
            book.summary = cachedBook.summary;
          }
          
          if (cachedBook.rating && (!book.rating || cachedBook.source === 'openai')) {
            book.rating = cachedBook.rating;
          }
          
          if (cachedBook.coverUrl && !book.coverUrl) {
            book.coverUrl = cachedBook.coverUrl;
          }
          
          log(`Enhanced book "${book.title}" with cached data`, 'books');
          return book;
        }
        
        // Get enhanced rating from OpenAI if missing
        if (!book.rating) {
          try {
            const rating = await bookCacheService.getEnhancedRating(book.title, book.author, book.isbn);
            if (rating) {
              book.rating = rating;
              log(`Enhanced rating for "${book.title}": ${rating}`, 'books');
            }
          } catch (error) {
            log(`Failed to get enhanced rating for "${book.title}": ${error instanceof Error ? error.message : String(error)}`, 'books');
          }
        }
        
        // Get enhanced summary from OpenAI if missing or short
        if (!book.summary || book.summary.length < 100) {
          try {
            const summary = await bookCacheService.getEnhancedSummary(book.title, book.author, book.summary);
            if (summary) {
              book.summary = summary;
              log(`Enhanced summary for "${book.title}"`, 'books');
            }
          } catch (error) {
            log(`Failed to get enhanced summary for "${book.title}": ${error instanceof Error ? error.message : String(error)}`, 'books');
          }
        }
        
        // Cache this book for future use
        try {
          const now = new Date();
          const expiresAt = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000); // 60 days cache
          
          await storage.cacheBook({
            title: book.title,
            author: book.author,
            isbn: book.isbn,
            coverUrl: book.coverUrl,
            rating: book.rating,
            summary: book.summary,
            source: 'openai',
            metadata: {
              publisher: book.publisher,
              categories: book.categories
            },
            expiresAt: expiresAt
          });
          
          log(`Cached book data for "${book.title}"`, 'books');
        } catch (error) {
          log(`Failed to cache book data for "${book.title}": ${error instanceof Error ? error.message : String(error)}`, 'books');
        }
        
        return book;
      })
    );
    
    return enhancedBooks;
  } catch (error) {
    log(`Error enhancing book data: ${error instanceof Error ? error.message : String(error)}`, 'books');
    return books; // Return original books if enhancement fails
  }
}