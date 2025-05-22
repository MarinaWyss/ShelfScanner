import axios from 'axios';
import { log } from './vite';
import { getEstimatedBookRating, getAmazonBookRating } from './amazon';
import { rateLimiter } from './rate-limiter';
import { bookCacheService } from './book-cache-service';
import { getOpenAIRecommendations } from './openai-recommendations';

/**
 * Local database of popular book ratings to provide accurate ratings without API calls
 */
function getPopularBookRating(title: string, author: string): string | null {
  // Normalize inputs for better matching
  const normalizedTitle = title.toLowerCase().trim();
  const normalizedAuthor = author.toLowerCase().trim();
  
  // Database of known book ratings
  const popularBooks: {title: string, author: string, rating: string}[] = [
    // Bestsellers & Popular fiction
    {title: "atomic habits", author: "james clear", rating: "4.8"},
    {title: "the creative act", author: "rick rubin", rating: "4.8"},
    {title: "american gods", author: "neil gaiman", rating: "4.6"},
    {title: "the psychology of money", author: "morgan housel", rating: "4.7"},
    {title: "stumbling on happiness", author: "daniel gilbert", rating: "4.3"},
    {title: "this is how you lose the time war", author: "amal el-mohtar", rating: "4.5"},
    {title: "this is how you lose the time war", author: "max gladstone", rating: "4.5"},
    {title: "the book of five rings", author: "miyamoto musashi", rating: "4.7"},
    {title: "economics for everyone", author: "jim stanford", rating: "4.5"},
    {title: "apocalypse never", author: "michael shellenberger", rating: "4.7"},
    {title: "economic facts and fallacies", author: "thomas sowell", rating: "4.8"},
    {title: "thinking, fast and slow", author: "daniel kahneman", rating: "4.6"},
    {title: "sapiens", author: "yuval noah harari", rating: "4.7"},
    {title: "educated", author: "tara westover", rating: "4.7"},
    {title: "becoming", author: "michelle obama", rating: "4.8"},
    {title: "the silent patient", author: "alex michaelides", rating: "4.5"},
    {title: "where the crawdads sing", author: "delia owens", rating: "4.8"},
    {title: "dune", author: "frank herbert", rating: "4.7"},
    {title: "project hail mary", author: "andy weir", rating: "4.8"},
    {title: "the martian", author: "andy weir", rating: "4.7"},
    {title: "the midnight library", author: "matt haig", rating: "4.3"},
    {title: "1984", author: "george orwell", rating: "4.7"},
    {title: "to kill a mockingbird", author: "harper lee", rating: "4.8"},
    {title: "the great gatsby", author: "f. scott fitzgerald", rating: "4.5"},
    {title: "pride and prejudice", author: "jane austen", rating: "4.7"},
    {title: "the alchemist", author: "paulo coelho", rating: "4.7"},
    {title: "the four agreements", author: "don miguel ruiz", rating: "4.7"},
    {title: "the power of now", author: "eckhart tolle", rating: "4.7"},
    {title: "man's search for meaning", author: "viktor e. frankl", rating: "4.7"},
    {title: "a brief history of time", author: "stephen hawking", rating: "4.7"}
  ];
  
  // Check for exact or partial matches
  for (const book of popularBooks) {
    // Exact match case
    if (normalizedTitle === book.title && normalizedAuthor.includes(book.author)) {
      return book.rating;
    }
    
    // Partial match case - if title contains the entire book title or vice versa
    if ((normalizedTitle.includes(book.title) || book.title.includes(normalizedTitle)) && 
        (normalizedAuthor.includes(book.author) || book.author.includes(normalizedAuthor))) {
      return book.rating;
    }
  }
  
  return null;
}

interface BookResponse {
  id?: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    description?: string;
    imageLinks?: {
      thumbnail?: string;
      smallThumbnail?: string;
    };
    industryIdentifiers?: {
      type: string;
      identifier: string;
    }[];
    averageRating?: number;
    ratingsCount?: number;
    categories?: string[];
    publisher?: string;
    publishedDate?: string;
  };
}

interface OpenLibraryResponse {
  docs?: {
    title?: string;
    author_name?: string[];
    isbn?: string[];
    cover_i?: number;
    publisher?: string[];
    first_publish_year?: number;
  }[];
}

// Define explicit type for book objects
interface BookObject {
  title: string;
  author: string;
  isbn: string;
  coverUrl: string;
  summary: string;
  rating: string;
  publisher: string;
  categories: string[];
  detectedFrom?: string;
}

export async function searchBooksByTitle(title: string): Promise<any[]> {
  try {
    if (!title || title.trim().length < 2) {
      log(`Skipping search for invalid title: "${title}"`, 'books');
      return [];
    }
    
    log(`Searching for book: "${title}"`, 'books');
    
    // Step 1: Check cache first to avoid API calls if we already have this book
    try {
      // By using our cache, we completely avoid making API calls for books we've seen before
      const cachedBooksFromTitle = await storage.findBookInCache(title, '');
      
      if (cachedBooksFromTitle) {
        log(`Found "${title}" in cache, using cached data`, 'books');
        
        const cachedBook: BookObject = {
          title: cachedBooksFromTitle.title,
          author: cachedBooksFromTitle.author,
          isbn: cachedBooksFromTitle.isbn || '',
          coverUrl: cachedBooksFromTitle.coverUrl || '',
          summary: cachedBooksFromTitle.summary || '',
          rating: cachedBooksFromTitle.rating || '',
          publisher: cachedBooksFromTitle.metadata?.publisher || '',
          categories: cachedBooksFromTitle.metadata?.categories || []
        };
        
        // If the summary is sparse or missing, try to enhance it
        if (!cachedBook.summary || cachedBook.summary.length < 100) {
          log(`Enhancing summary for "${cachedBook.title}"`, 'books');
          const enhancedSummary = await bookCacheService.getEnhancedSummary(
            cachedBook.title, 
            cachedBook.author,
            cachedBook.summary
          );
          
          if (enhancedSummary) {
            cachedBook.summary = enhancedSummary;
            
            // Update the cache with the enhanced summary
            await bookCacheService.cacheBook({
              title: cachedBook.title,
              author: cachedBook.author,
              isbn: cachedBook.isbn,
              coverUrl: cachedBook.coverUrl,
              rating: cachedBook.rating,
              summary: enhancedSummary,
              source: 'openai',
              metadata: {
                publisher: cachedBook.publisher,
                categories: cachedBook.categories
              },
              expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days for enhanced summaries
            });
          }
        }
        
        return [cachedBook];
      }
    } catch (error) {
      // If cache access fails, continue with API lookup
      log(`Cache lookup failed: ${error instanceof Error ? error.message : String(error)}`, 'books');
    }
    
    // Step 2: Check if we can make a Google Books API request (basic rate limiting to prevent throttling)
    if (!rateLimiter.isAllowed('google-books')) {
      log(`Rate limit reached for Google Books API, skipping search for "${title}"`, 'books');
      return [];
    }
    
    // Try Google Books API first with exact title search
    const exactQuery = `intitle:"${encodeURIComponent(title.trim())}"`;
    const googleBooksUrl = `https://www.googleapis.com/books/v1/volumes?q=${exactQuery}&maxResults=5`;
    
    const googleResponse = await axios.get(googleBooksUrl);
    
    // Increment the rate limiter counter for Google Books API
    rateLimiter.increment('google-books');
    
    if (googleResponse.data.items && googleResponse.data.items.length > 0) {
      log(`Found ${googleResponse.data.items.length} results for "${title}"`, 'books');
      
      // Map the Google Books results
      const books = googleResponse.data.items.map((item: BookResponse) => {
        const bookTitle = item.volumeInfo?.title || 'Unknown Title';
        const bookAuthor = item.volumeInfo?.authors ? item.volumeInfo.authors.join(', ') : 'Unknown Author';
        const isbn = item.volumeInfo?.industryIdentifiers?.find(id => id.type === 'ISBN_13')?.identifier || '';
        
        return {
          title: bookTitle,
          author: bookAuthor,
          isbn: isbn,
          coverUrl: item.volumeInfo?.imageLinks?.thumbnail || '',
          summary: item.volumeInfo?.description || '',
          // Use Google Books rating as initial value (this will be updated with Amazon rating)
          rating: item.volumeInfo?.averageRating ? item.volumeInfo.averageRating.toString() : '',
          publisher: item.volumeInfo?.publisher || '',
          categories: item.volumeInfo?.categories || [],
          // Include the detected book title for debugging
          detectedFrom: title
        };
      });
      
      // Process all books to enhance them with ratings and summaries
      const enhancedBooks = await Promise.all(
        books.map(async (book: BookObject) => {
          // Step 1: Check for cached enhanced data for this book
          const cachedBook = await storage.findBookInCache(book.title, book.author);
          
          if (cachedBook) {
            // Use cached data for book details that may be missing or could be improved
            if (cachedBook.summary && (!book.summary || book.summary.length < cachedBook.summary.length)) {
              book.summary = cachedBook.summary;
            }
            
            if (cachedBook.rating && (!book.rating || cachedBook.source === 'amazon')) {
              book.rating = cachedBook.rating;
            }
            
            if (cachedBook.coverUrl && !book.coverUrl) {
              book.coverUrl = cachedBook.coverUrl;
            }
            
            log(`Enhanced book "${book.title}" with cached data`, 'books');
            
            // Return the enhanced book
            return book;
          }
          
          // Step 2: Get enhanced rating (tries cache -> amazon -> local DB -> estimate)
          if (!book.rating) {
            try {
              const enhancedRating = await bookCacheService.getEnhancedRating(book.title, book.author, book.isbn);
              if (enhancedRating) {
                book.rating = enhancedRating;
                log(`Enhanced rating for "${book.title}": ${enhancedRating}`, 'books');
              }
            } catch (error) {
              // Fallback to local database
              const verifiedRating = getPopularBookRating(book.title, book.author);
              if (verifiedRating) {
                book.rating = verifiedRating;
                log(`Using verified rating from database for "${book.title}": ${verifiedRating}`, 'books');
              } else {
                // If no rating is available, use estimated rating
                book.rating = getEstimatedBookRating(book.title, book.author);
                log(`Using estimated rating for "${book.title}": ${book.rating}`, 'books');
              }
            }
          }
          
          // Step 3: Always get enhanced summary from OpenAI for better descriptions
          try {
            // Always attempt to get an OpenAI enhanced summary for better quality descriptions
            const enhancedSummary = await bookCacheService.getEnhancedSummary(
              book.title, 
              book.author,
              book.summary
            );
            
            if (enhancedSummary) {
              book.summary = enhancedSummary;
              log(`Enhanced summary for "${book.title}"`, 'books');
            }
          } catch (error) {
            log(`Failed to enhance summary for "${book.title}": ${error instanceof Error ? error.message : String(error)}`, 'books');
          }
          
          // Step 4: Cache this book for future use to reduce API calls
          try {
            await bookCacheService.cacheBook({
              title: book.title,
              author: book.author,
              isbn: book.isbn,
              coverUrl: book.coverUrl,
              rating: book.rating,
              summary: book.summary,
              source: 'google',
              metadata: {
                publisher: book.publisher,
                categories: book.categories
              },
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days for Google Books data
            });
            log(`Cached book data for "${book.title}"`, 'books');
          } catch (error) {
            log(`Failed to cache book data for "${book.title}": ${error instanceof Error ? error.message : String(error)}`, 'books');
          }
          
          return book;
        })
      );
      
      return enhancedBooks;
    }

    // Fallback to Open Library API
    // Check if we can make an Open Library API request
    if (!rateLimiter.isAllowed('open-library')) {
      log(`Rate limit reached for Open Library API, skipping fallback search for "${title}"`, 'books');
      return [];
    }
    
    const openLibraryUrl = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=5`;
    const openLibraryResponse = await axios.get<OpenLibraryResponse>(openLibraryUrl);
    
    // Increment the rate limiter counter for Open Library API
    rateLimiter.increment('open-library');
    
    if (openLibraryResponse.data.docs && openLibraryResponse.data.docs.length > 0) {
      log(`Found ${openLibraryResponse.data.docs.length} OpenLibrary results for "${title}"`, 'books');
      
      // Map Open Library results
      const books = openLibraryResponse.data.docs.map(doc => ({
        title: doc.title || 'Unknown Title',
        author: doc.author_name ? doc.author_name.join(', ') : 'Unknown Author',
        isbn: doc.isbn ? doc.isbn[0] : '',
        coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : '',
        summary: '',
        rating: '',  // Will be enhanced with rating
        publisher: doc.publisher ? doc.publisher[0] : '',
        categories: [],
        // Include the detected book title for debugging
        detectedFrom: title
      }));
      
      // Process books with the same enhancement pipeline as for Google Books
      const enhancedBooks = await Promise.all(
        books.map(async (book: BookObject) => {
          // Using the same enhancement process as above
          // Step 1: Check for cached enhanced data for this book
          const cachedBook = await storage.findBookInCache(book.title, book.author);
          
          if (cachedBook) {
            // Use cached data for book details that may be missing or could be improved
            if (cachedBook.summary) {
              book.summary = cachedBook.summary;
            }
            
            if (cachedBook.rating) {
              book.rating = cachedBook.rating;
            }
            
            if (cachedBook.coverUrl && !book.coverUrl) {
              book.coverUrl = cachedBook.coverUrl;
            }
            
            log(`Enhanced book "${book.title}" with cached data`, 'books');
            
            // Return the enhanced book
            return book;
          }
          
          // Step 2: Get enhanced rating
          try {
            const enhancedRating = await bookCacheService.getEnhancedRating(book.title, book.author, book.isbn);
            if (enhancedRating) {
              book.rating = enhancedRating;
              log(`Enhanced rating for "${book.title}": ${enhancedRating}`, 'books');
            }
          } catch (error) {
            // Fallback to local database
            const verifiedRating = getPopularBookRating(book.title, book.author);
            if (verifiedRating) {
              book.rating = verifiedRating;
              log(`Using verified rating from database for "${book.title}": ${verifiedRating}`, 'books');
            } else {
              // If no rating is available, use estimated rating
              book.rating = getEstimatedBookRating(book.title, book.author);
              log(`Using estimated rating for "${book.title}": ${book.rating}`, 'books');
            }
          }
          
          // Step 3: Get enhanced summary with improved 3-4 sentence format
          try {
            const enhancedSummary = await bookCacheService.getEnhancedSummary(
              book.title, 
              book.author,
              book.summary
            );
            
            if (enhancedSummary) {
              book.summary = enhancedSummary;
              log(`Enhanced summary for "${book.title}"`, 'books');
            }
          } catch (error) {
            log(`Failed to enhance summary for "${book.title}": ${error instanceof Error ? error.message : String(error)}`, 'books');
          }
          
          // Step 4: Cache this book for future use
          try {
            await bookCacheService.cacheBook({
              title: book.title,
              author: book.author,
              isbn: book.isbn,
              coverUrl: book.coverUrl,
              rating: book.rating,
              summary: book.summary,
              source: 'open-library',
              metadata: {
                publisher: book.publisher,
                categories: book.categories
              },
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days for Open Library data
            });
            log(`Cached book data for "${book.title}"`, 'books');
          } catch (error) {
            log(`Failed to cache book data for "${book.title}": ${error instanceof Error ? error.message : String(error)}`, 'books');
          }
          
          return book;
        })
      );
      
      return enhancedBooks;
    }
    
    log(`No results found for "${title}"`, 'books');
    return [];
  } catch (error) {
    log(`Error searching for books: ${error instanceof Error ? error.message : String(error)}`, 'books');
    return [];
  }
}

// Helper function to normalize book titles for comparison
const normalizeBookTitle = (title: string): string => {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')    // Normalize whitespace
    .trim();
};

export async function getRecommendations(
  books: any[],
  preferences: any
): Promise<any[]> {
  try {
    // CRITICAL: We will ONLY use the books that were detected in the image
    // No external recommendations will be added at all
    log(`ONLY using ${books.length} detected books for recommendations: ${books.map(b => b.title).join(', ')}`, 'books');
    log(`Using preferences: ${JSON.stringify(preferences)}`, 'books');
    
    // Get user's preferred genres
    const preferredGenres = preferences.genres || [];
    
    // Create a map of books the user has already read (if Goodreads data exists)
    // We'll use a robust matching approach using normalized titles
    const alreadyReadBooks: { normalizedTitle: string, originalTitle: string }[] = [];
    if (preferences.goodreadsData && Array.isArray(preferences.goodreadsData)) {
      preferences.goodreadsData.forEach((entry: any) => {
        if (entry["Title"] && entry["My Rating"] && parseInt(entry["My Rating"]) > 0) {
          // Store both the original title and a normalized version for flexible matching
          alreadyReadBooks.push({
            normalizedTitle: normalizeBookTitle(entry["Title"]),
            originalTitle: entry["Title"]
          });
        }
      });
      log(`Found ${alreadyReadBooks.length} books the user has already read in Goodreads data`, 'books');
    }
    
    // Separate books into two categories: new books and already read books
    let newBooks: any[] = [];
    let alreadyReadBooks2: any[] = [];
    
    if (alreadyReadBooks.length > 0) {
      books.forEach(book => {
        const normalizedBookTitle = normalizeBookTitle(book.title);
        
        // Check if this book title matches (or is contained in) any of the user's read books
        const matchingTitle = alreadyReadBooks.find(readBook => {
          return normalizedBookTitle.includes(readBook.normalizedTitle) || 
                 readBook.normalizedTitle.includes(normalizedBookTitle);
        });
        
        // If we found a match, this book has been read already
        if (matchingTitle) {
          log(`Identified "${book.title}" as user has already read "${matchingTitle.originalTitle}"`, 'books');
          // Mark this book as already read and add to already read list
          alreadyReadBooks2.push({
            ...book,
            alreadyRead: true,
            originalReadTitle: matchingTitle.originalTitle
          });
        } else {
          // This is a new book, add to new books list
          newBooks.push(book);
        }
      });
      
      log(`Separated ${alreadyReadBooks2.length} books the user has already read from ${newBooks.length} new books`, 'books');
    } else {
      // No Goodreads data available, all books are new
      newBooks = books;
    }

    // *** EXPLICITLY TRY OPENAI FIRST ***
    // This code will attempt to use OpenAI to generate intelligent book recommendations
    // If successful, it will return them immediately, skipping the traditional algorithm
    console.log(`OPENAI_API_KEY is ${process.env.OPENAI_API_KEY ? 'available' : 'not available'}`);
    
    if (process.env.OPENAI_API_KEY) {
      // Use OpenAI when the API key is available
      try {
        // Log that we're using OpenAI
        console.log(`>>> ATTEMPTING TO USE OPENAI for book recommendations with ${newBooks.length} books`);
        
        // Call OpenAI for recommendations
        const aiRecommendations = await getOpenAIRecommendations(newBooks, preferences);
        
        if (aiRecommendations && aiRecommendations.length > 0) {
          console.log(`>>> SUCCESS! OPENAI returned ${aiRecommendations.length} recommendations`);
          
          // Format OpenAI recommendations for our system
          const formattedRecommendations = aiRecommendations.map(book => {
            return {
              title: book.title,
              author: book.author,
              coverUrl: book.coverUrl || '',
              summary: book.summary || 'No summary available',
              rating: book.rating || '',
              isbn: book.isbn || '',
              categories: book.categories || [],
              score: (book as any).matchScore || 0,
              matchReason: (book as any).matchReason || '',
              alreadyRead: false,
              isBookRecommendation: true,
              fromAI: true // Mark these as AI recommendations
            };
          });
          
          // If we have already read books, add them too
          if (alreadyReadBooks2.length > 0) {
            // Score the already read books
            const scoredReadBooks = alreadyReadBooks2.map(book => {
              return {
                ...book,
                score: 50, // Default score for books already read
                alreadyRead: true,
                isBookYouveRead: true
              };
            });
            
            // Add already read books to the recommendations
            console.log(`>>> RETURNING ${formattedRecommendations.length} AI-powered recs + ${scoredReadBooks.length} read books`);
            return [...formattedRecommendations, ...scoredReadBooks];
          }
          
          console.log(`>>> RETURNING ${formattedRecommendations.length} AI-powered recommendations ONLY`);
          return formattedRecommendations;
        } else {
          console.log('>>> OpenAI returned EMPTY recommendations, falling back to traditional algorithm');
        }
      } catch (error) {
        // Log detailed error for debugging
        console.error(`>>> OPENAI ERROR: ${error instanceof Error ? error.message : String(error)}`);
        console.log('>>> Falling back to traditional algorithm due to error');
      }
    } else {
      console.log('>>> OpenAI API key NOT AVAILABLE, using traditional algorithm');
    }
    
    // Fallback: Use traditional algorithm if OpenAI failed or is not available
    log(`Using traditional algorithm for book recommendations`, 'books');
    
    // Function to score books based on preferences
    const scoreBook = (book: any) => {
      // Start with a base score based on rating (if available)
      let score = book.rating ? parseFloat(book.rating) : 0;
      
      // Make sure categories exist
      if (!book.categories || !Array.isArray(book.categories)) {
        book.categories = [];
      }
      
      // Add 10 points for each direct genre match with user preferences
      for (const category of book.categories) {
        if (!category) continue;
        
        for (const preferredGenre of preferredGenres) {
          if (category.toLowerCase().includes(preferredGenre.toLowerCase())) {
            score += 10;
            log(`${book.title} matches preferred genre ${preferredGenre}, +10 points`, 'books');
          }
        }
      }
      
      // Check Goodreads data to boost scores for authors the user likes
      if (preferences.goodreadsData && Array.isArray(preferences.goodreadsData)) {
        const normalizedBookAuthor = (book.author || '').toLowerCase();
        
        // Count how many highly-rated books (4-5 stars) the user has read by this author
        let authorMatchCount = 0;
        
        preferences.goodreadsData.forEach((entry: any) => {
          const normalizedGoodreadsAuthor = (entry['Author'] || '').toLowerCase();
          const rating = parseInt(entry['My Rating'] || '0');
          
          if (rating >= 4 && normalizedGoodreadsAuthor.includes(normalizedBookAuthor) || 
              normalizedBookAuthor.includes(normalizedGoodreadsAuthor)) {
            authorMatchCount++;
          }
        });
        
        if (authorMatchCount > 0) {
          // Give a bonus of 5 points per highly-rated book by the same author (up to 20 points)
          const authorBonus = Math.min(authorMatchCount * 5, 20);
          score += authorBonus;
          log(`${book.title} is by ${book.author} who the user likes, +${authorBonus} points`, 'books');
        }
      }
      
      // Return the final score (rounded to 1 decimal place for consistency)
      return Math.round(score * 10) / 10;
    };
    
    // Score all new books
    const scoredBooks = newBooks.map(book => {
      return {
        ...book,
        score: scoreBook(book)
      };
    });
    
    // Sort by score (descending)
    const sortedBooks = scoredBooks.sort((a, b) => b.score - a.score);
    
    return sortedBooks;
  } catch (error) {
    log(`Error getting recommendations: ${error instanceof Error ? error.message : String(error)}`, 'books');
    return [];
  }
}

// Import storage for database access
import { storage } from './storage';