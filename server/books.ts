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
    // Try Google Books API first
    const googleBooksUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(title)}&maxResults=5`;
    const googleResponse = await axios.get(googleBooksUrl);
    
    if (googleResponse.data.items && googleResponse.data.items.length > 0) {
      return googleResponse.data.items.map((item: BookResponse) => ({
        title: item.volumeInfo?.title || 'Unknown Title',
        author: item.volumeInfo?.authors ? item.volumeInfo.authors.join(', ') : 'Unknown Author',
        isbn: item.volumeInfo?.industryIdentifiers?.find(id => id.type === 'ISBN_13')?.identifier || '',
        coverUrl: item.volumeInfo?.imageLinks?.thumbnail || '',
        summary: item.volumeInfo?.description || '',
        rating: item.volumeInfo?.averageRating || 0,
        publisher: item.volumeInfo?.publisher || '',
      }));
    }

    // Fallback to Open Library API
    const openLibraryUrl = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=5`;
    const openLibraryResponse = await axios.get<OpenLibraryResponse>(openLibraryUrl);
    
    if (openLibraryResponse.data.docs && openLibraryResponse.data.docs.length > 0) {
      return openLibraryResponse.data.docs.map(doc => ({
        title: doc.title || 'Unknown Title',
        author: doc.author_name ? doc.author_name.join(', ') : 'Unknown Author',
        isbn: doc.isbn ? doc.isbn[0] : '',
        coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : '',
        summary: '',
        rating: 0,
        publisher: doc.publisher ? doc.publisher[0] : '',
      }));
    }

    return [];
  } catch (error) {
    log(`Error searching for books: ${error instanceof Error ? error.message : String(error)}`, 'books');
    return [];
  }
}

export async function getRecommendations(
  titles: string[], 
  genres: string[], 
  readingFrequency: string
): Promise<any[]> {
  try {
    // Combine titles with genres for better search results
    const searchTerms = [...titles, ...genres];
    const query = searchTerms.join(' OR ');
    
    // Get recommendations from Google Books API
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=10`;
    const response = await axios.get(url);
    
    if (response.data.items && response.data.items.length > 0) {
      return response.data.items.map((item: BookResponse) => ({
        title: item.volumeInfo?.title || 'Unknown Title',
        author: item.volumeInfo?.authors ? item.volumeInfo.authors.join(', ') : 'Unknown Author',
        coverUrl: item.volumeInfo?.imageLinks?.thumbnail || '',
        summary: item.volumeInfo?.description || 'No summary available',
        rating: item.volumeInfo?.averageRating || 0,
      }));
    }
    
    return [];
  } catch (error) {
    log(`Error getting recommendations: ${error instanceof Error ? error.message : String(error)}`, 'books');
    return [];
  }
}
