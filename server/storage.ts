import { 
  users, type User, type InsertUser,
  preferences, type Preference, type InsertPreference,
  savedBooks, type SavedBook, type InsertSavedBook,
  bookCache, type BookCache, type InsertBookCache,
  type Recommendation // Now just an interface, not a table
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, or, sql, lte, gte } from "drizzle-orm";
import { log } from "./vite";

// Storage interface
export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Preferences methods
  getPreferencesByUserId(userId: number): Promise<Preference | undefined>;
  getPreferencesByDeviceId(deviceId: string): Promise<Preference | undefined>;
  createPreference(preference: InsertPreference): Promise<Preference>;
  updatePreference(id: number, preference: Partial<InsertPreference>): Promise<Preference | undefined>;
  
  // Books methods have been removed in favor of using book_cache
  
  // NOTE: Recommendations are now ephemeral (generated on-demand)
  // Recommendation methods have been removed from the storage interface
  
  // Saved Books methods
  getSavedBooksByDeviceId(deviceId: string): Promise<SavedBook[]>;
  createSavedBook(savedBook: InsertSavedBook): Promise<SavedBook>;
  updateSavedBook(id: number, updates: Partial<InsertSavedBook>): Promise<SavedBook | undefined>;
  deleteSavedBook(id: number): Promise<boolean>;
  
  // Book Cache methods
  findBookInCache(title: string, author: string): Promise<BookCache | undefined>;
  findBookByISBN(isbn: string): Promise<BookCache | undefined>;
  getBookCacheById(id: number): Promise<BookCache | undefined>;
  cacheBook(bookData: InsertBookCache): Promise<BookCache>;
  getRecentlyAddedBooks(limit?: number): Promise<BookCache[]>;
}

// Database storage implementation
export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  // Preferences methods
  async getPreferencesByUserId(userId: number): Promise<Preference | undefined> {
    const [preference] = await db.select().from(preferences).where(eq(preferences.userId, userId));
    return preference || undefined;
  }
  
  async getPreferencesByDeviceId(deviceId: string): Promise<Preference | undefined> {
    const [preference] = await db.select().from(preferences).where(eq(preferences.deviceId, deviceId));
    return preference || undefined;
  }

  async createPreference(insertPreference: InsertPreference): Promise<Preference> {
    const [preference] = await db
      .insert(preferences)
      .values(insertPreference)
      .returning();
    return preference;
  }

  async updatePreference(id: number, partialPreference: Partial<InsertPreference>): Promise<Preference | undefined> {
    const [updatedPreference] = await db
      .update(preferences)
      .set(partialPreference)
      .where(eq(preferences.id, id))
      .returning();
    return updatedPreference || undefined;
  }

  // Books methods have been removed in favor of book_cache

  // NOTE: Recommendations are now ephemeral (generated on-demand)
  // We've removed all database-related recommendation methods

  // Saved Books methods
  async getSavedBooksByDeviceId(deviceId: string): Promise<SavedBook[]> {
    return db.select().from(savedBooks).where(eq(savedBooks.deviceId, deviceId));
  }

  async createSavedBook(insertSavedBook: InsertSavedBook): Promise<SavedBook> {
    const [savedBook] = await db
      .insert(savedBooks)
      .values(insertSavedBook)
      .returning();
    return savedBook;
  }

  async updateSavedBook(id: number, updates: Partial<InsertSavedBook>): Promise<SavedBook | undefined> {
    try {
      const [updatedBook] = await db
        .update(savedBooks)
        .set(updates)
        .where(eq(savedBooks.id, id))
        .returning();
      
      if (updatedBook) {
        log(`Updated saved book: "${updatedBook.title}" by ${updatedBook.author}`, 'storage');
      }
      
      return updatedBook || undefined;
    } catch (error) {
      log(`Error updating saved book: ${error instanceof Error ? error.message : String(error)}`, 'storage');
      return undefined;
    }
  }

  async deleteSavedBook(id: number): Promise<boolean> {
    const result = await db.delete(savedBooks).where(eq(savedBooks.id, id));
    return !!result;
  }

  // Book Cache methods
  async findBookInCache(title: string, author: string): Promise<BookCache | undefined> {
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

  async findBookByISBN(isbn: string): Promise<BookCache | undefined> {
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
  
  async getBookCacheById(id: number): Promise<BookCache | undefined> {
    try {
      const [book] = await db.select().from(bookCache).where(eq(bookCache.id, id));
      
      if (book) {
        log(`Book cache retrieved for ID ${id}`, 'cache');
      } else {
        log(`No book cache found for ID ${id}`, 'cache');
      }
      
      return book;
    } catch (error) {
      log(`Error getting book cache by ID: ${error instanceof Error ? error.message : String(error)}`, 'cache');
      return undefined;
    }
  }

  async cacheBook(bookData: InsertBookCache): Promise<BookCache> {
    try {
      // Generate a unique bookId from ISBN or title+author
      let bookId = '';
      if (bookData.isbn) {
        // Use ISBN directly if available
        bookId = `isbn_${bookData.isbn.replace(/[^0-9X]/g, '')}`;
      } else {
        // Create a normalized ID from title and author
        const normalizedTitle = bookData.title.toLowerCase().trim();
        const normalizedAuthor = bookData.author.toLowerCase().trim();
        bookId = `book_${normalizedTitle.replace(/[^a-z0-9]/g, '_')}_${normalizedAuthor.replace(/[^a-z0-9]/g, '_')}`;
      }
      
      // Add bookId to the data
      const bookDataWithId = {
        ...bookData,
        bookId
      };
      
      // Check if book already exists by bookId
      const [existingBook] = await db.select().from(bookCache).where(eq(bookCache.bookId, bookId));
      
      if (existingBook) {
        // Update the existing book
        log(`Updating existing cache entry for "${bookData.title}" (ID: ${bookId})`, 'cache');
        const [updatedBook] = await db
          .update(bookCache)
          .set({
            isbn: bookData.isbn || existingBook.isbn,
            coverUrl: bookData.coverUrl || existingBook.coverUrl,
            rating: bookData.rating || existingBook.rating,
            summary: bookData.summary || existingBook.summary,
            source: bookData.source || existingBook.source,
            metadata: bookData.metadata || existingBook.metadata,
            expiresAt: bookData.expiresAt || existingBook.expiresAt,
            cachedAt: new Date() // Update the cached timestamp
          })
          .where(eq(bookCache.id, existingBook.id))
          .returning();
        
        return updatedBook;
      } else {
        // Insert new book
        log(`Creating new cache entry for "${bookData.title}" (ID: ${bookId})`, 'cache');
        const [book] = await db
          .insert(bookCache)
          .values(bookDataWithId)
          .returning();
        
        return book;
      }
    } catch (error) {
      log(`Error caching book: ${error instanceof Error ? error.message : String(error)}`, 'cache');
      throw error;
    }
  }

  async getRecentlyAddedBooks(limit: number = 10): Promise<BookCache[]> {
    try {
      return db.select()
        .from(bookCache)
        .orderBy(desc(bookCache.cachedAt))
        .limit(limit);
    } catch (error) {
      log(`Error getting recently added books: ${error instanceof Error ? error.message : String(error)}`, 'cache');
      return [];
    }
  }
}

// Export a singleton instance of DatabaseStorage
export const storage = new DatabaseStorage();