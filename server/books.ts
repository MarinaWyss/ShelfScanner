import axios from 'axios';
import { log } from './vite';

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

export async function searchBooksByTitle(title: string): Promise<any[]> {
  try {
    if (!title || title.trim().length < 2) {
      console.log(`Skipping search for invalid title: "${title}"`);
      return [];
    }
    
    console.log(`Searching for book: "${title}"`);
    
    // Try Google Books API first with exact title search
    const exactQuery = `intitle:"${encodeURIComponent(title.trim())}"`;
    const googleBooksUrl = `https://www.googleapis.com/books/v1/volumes?q=${exactQuery}&maxResults=5`;
    
    const googleResponse = await axios.get(googleBooksUrl);
    
    if (googleResponse.data.items && googleResponse.data.items.length > 0) {
      console.log(`Found ${googleResponse.data.items.length} results for "${title}"`);
      
      return googleResponse.data.items.map((item: BookResponse) => ({
        title: item.volumeInfo?.title || 'Unknown Title',
        author: item.volumeInfo?.authors ? item.volumeInfo.authors.join(', ') : 'Unknown Author',
        isbn: item.volumeInfo?.industryIdentifiers?.find(id => id.type === 'ISBN_13')?.identifier || '',
        coverUrl: item.volumeInfo?.imageLinks?.thumbnail || '',
        summary: item.volumeInfo?.description || '',
        rating: item.volumeInfo?.averageRating || 0,
        publisher: item.volumeInfo?.publisher || '',
        categories: item.volumeInfo?.categories || [],
        // Include the detected book title for debugging
        detectedFrom: title
      }));
    }

    // Fallback to Open Library API
    const openLibraryUrl = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=5`;
    const openLibraryResponse = await axios.get<OpenLibraryResponse>(openLibraryUrl);
    
    if (openLibraryResponse.data.docs && openLibraryResponse.data.docs.length > 0) {
      console.log(`Found ${openLibraryResponse.data.docs.length} OpenLibrary results for "${title}"`);
      
      return openLibraryResponse.data.docs.map(doc => ({
        title: doc.title || 'Unknown Title',
        author: doc.author_name ? doc.author_name.join(', ') : 'Unknown Author',
        isbn: doc.isbn ? doc.isbn[0] : '',
        coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : '',
        summary: '',
        rating: 0,
        publisher: doc.publisher ? doc.publisher[0] : '',
        categories: [],
        // Include the detected book title for debugging
        detectedFrom: title
      }));
    }
    
    console.log(`No results found for "${title}"`);
    return [];
  } catch (error) {
    log(`Error searching for books: ${error instanceof Error ? error.message : String(error)}`, 'books');
    return [];
  }
}

export async function getRecommendations(
  books: any[],
  preferences: any
): Promise<any[]> {
  try {
    console.log('Generating recommendations for books:', books);
    console.log('Based on preferences:', preferences);
    
    // Get genres from preferences
    const preferredGenres = preferences.genres || [];
    
    // IMPORTANT: Only use the books that were detected in the image
    // Score each book based on user preferences
    const scoredBooks = books.map(book => {
      // Start with a base score
      let score = 0;
      
      // Score based on genres
      if (book.categories && Array.isArray(book.categories)) {
        for (const category of book.categories) {
          for (const preferredGenre of preferredGenres) {
            if (category.toLowerCase().includes(preferredGenre.toLowerCase())) {
              score += 5;
            }
          }
        }
      }
      
      // Check Goodreads data if available
      if (preferences.goodreadsData && Array.isArray(preferences.goodreadsData)) {
        for (const entry of preferences.goodreadsData) {
          // Match by author
          if (entry["Author"] && book.author && 
              book.author.toLowerCase().includes(entry["Author"].toLowerCase())) {
            score += 2;
            
            // Bonus for highly rated books by same author
            if (entry["My Rating"] && parseInt(entry["My Rating"]) >= 4) {
              score += 3;
            }
          }
          
          // Match by title (exact match is a strong signal)
          if (entry["Title"] && entry["Title"].toLowerCase() === book.title.toLowerCase()) {
            const rating = entry["My Rating"] ? parseInt(entry["My Rating"]) : 0;
            if (rating >= 4) {
              score += 6; // Already read and liked
            } else if (rating > 0) {
              score += rating; // Score based on rating
            }
          }
          
          // Match by shelf/category
          if (entry["Bookshelves"] && book.categories) {
            const shelves = entry["Bookshelves"].split(';').map((s: string) => s.trim().toLowerCase());
            for (const shelf of shelves) {
              if (book.categories.some((category: string) => 
                category && category.toLowerCase().includes(shelf))) {
                score += 1;
                
                // Bonus for highly rated
                if (entry["My Rating"] && parseInt(entry["My Rating"]) >= 4) {
                  score += 2;
                }
              }
            }
          }
        }
      }
      
      return {
        ...book,
        score
      };
    });
    
    // Sort books by score, highest first
    scoredBooks.sort((a, b) => b.score - a.score);
    
    // Return the sorted books with proper format for recommendations
    return scoredBooks.map(book => ({
      title: book.title || 'Unknown Title',
      author: book.author || 'Unknown Author',
      coverUrl: book.coverUrl || '',
      summary: book.summary || 'No summary available',
      rating: book.rating || 0,
      matchScore: book.score,
      isbn: book.isbn,
      // Include the source that detected this book (for debugging)
      detectedFrom: book.detectedFrom
    }));
  } catch (error) {
    log(`Error getting recommendations: ${error instanceof Error ? error.message : String(error)}`, 'books');
    return [];
  }
}
