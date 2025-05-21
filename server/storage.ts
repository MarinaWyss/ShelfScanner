import { 
  users, type User, type InsertUser,
  preferences, type Preference, type InsertPreference,
  books, type Book, type InsertBook,
  recommendations, type Recommendation, type InsertRecommendation,
  savedBooks, type SavedBook, type InsertSavedBook,
  bookCache, type BookCache, type InsertBookCache
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, or, sql, lte, gte } from "drizzle-orm";

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
  
  // Books methods
  getBooksByUserId(userId: number): Promise<Book[]>;
  createBook(book: InsertBook): Promise<Book>;
  
  // Recommendations methods
  getRecommendationsByUserId(userId: number): Promise<Recommendation[]>;
  createRecommendation(recommendation: InsertRecommendation): Promise<Recommendation>;
  
  // Saved Books methods
  getSavedBooksByDeviceId(deviceId: string): Promise<SavedBook[]>;
  createSavedBook(savedBook: InsertSavedBook): Promise<SavedBook>;
  deleteSavedBook(id: number): Promise<boolean>;
  
  // Book Cache methods
  findBookInCache(title: string, author: string): Promise<BookCache | undefined>;
  findBookByISBN(isbn: string): Promise<BookCache | undefined>;
  cacheBook(bookData: InsertBookCache): Promise<BookCache>;
  getRecentlyAddedBooks(limit?: number): Promise<BookCache[]>;
}

// Memory storage implementation
export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private preferences: Map<number, Preference>;
  private books: Map<number, Book>;
  private recommendations: Map<number, Recommendation>;
  private savedBooks: Map<number, SavedBook>;
  private userIdCounter: number;
  private preferenceIdCounter: number;
  private bookIdCounter: number;
  private recommendationIdCounter: number;
  private savedBookIdCounter: number;

  constructor() {
    this.users = new Map();
    this.preferences = new Map();
    this.books = new Map();
    this.recommendations = new Map();
    this.savedBooks = new Map();
    this.userIdCounter = 1;
    this.preferenceIdCounter = 1;
    this.bookIdCounter = 1;
    this.recommendationIdCounter = 1;
    this.savedBookIdCounter = 1;
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userIdCounter++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Preferences methods
  async getPreferencesByUserId(userId: number): Promise<Preference | undefined> {
    return Array.from(this.preferences.values()).find(
      (preference) => preference.userId === userId,
    );
  }
  
  async getPreferencesByDeviceId(deviceId: string): Promise<Preference | undefined> {
    return Array.from(this.preferences.values()).find(
      (preference) => preference.deviceId === deviceId,
    );
  }

  async createPreference(insertPreference: InsertPreference): Promise<Preference> {
    const id = this.preferenceIdCounter++;
    // Ensure all required fields are present
    const preference: Preference = { 
      ...insertPreference, 
      id,
      deviceId: insertPreference.deviceId || null,
      authors: insertPreference.authors || null,
      goodreadsData: insertPreference.goodreadsData || null
    };
    this.preferences.set(id, preference);
    return preference;
  }

  async updatePreference(id: number, partialPreference: Partial<InsertPreference>): Promise<Preference | undefined> {
    const preference = this.preferences.get(id);
    if (!preference) return undefined;
    
    const updatedPreference: Preference = { ...preference, ...partialPreference };
    this.preferences.set(id, updatedPreference);
    return updatedPreference;
  }

  // Books methods
  async getBooksByUserId(userId: number): Promise<Book[]> {
    return Array.from(this.books.values()).filter(
      (book) => book.userId === userId,
    );
  }

  async createBook(insertBook: InsertBook): Promise<Book> {
    const id = this.bookIdCounter++;
    const book: Book = { 
      ...insertBook, 
      id,
      author: insertBook.author || null,
      isbn: insertBook.isbn || null,
      coverUrl: insertBook.coverUrl || null,
      metadata: insertBook.metadata || null
    };
    this.books.set(id, book);
    return book;
  }

  // Recommendations methods
  async getRecommendationsByUserId(userId: number): Promise<Recommendation[]> {
    return Array.from(this.recommendations.values()).filter(
      (recommendation) => recommendation.userId === userId,
    );
  }

  // Clear all recommendations for a user before adding new ones
  async clearRecommendationsByUserId(userId: number): Promise<void> {
    // Find all recommendations for this user and remove them
    const toDelete: number[] = [];
    
    this.recommendations.forEach((recommendation, id) => {
      if (recommendation.userId === userId) {
        toDelete.push(id);
      }
    });
    
    // Delete all found recommendations
    for (const id of toDelete) {
      this.recommendations.delete(id);
    }
  }

  async createRecommendation(insertRecommendation: InsertRecommendation): Promise<Recommendation> {
    const id = this.recommendationIdCounter++;
    const recommendation: Recommendation = { 
      ...insertRecommendation, 
      id,
      coverUrl: insertRecommendation.coverUrl || null,
      rating: insertRecommendation.rating || null,
      summary: insertRecommendation.summary || null
    };
    this.recommendations.set(id, recommendation);
    return recommendation;
  }

  // Saved Books methods
  async getSavedBooksByDeviceId(deviceId: string): Promise<SavedBook[]> {
    return Array.from(this.savedBooks.values()).filter(
      (savedBook) => savedBook.deviceId === deviceId
    );
  }

  async createSavedBook(insertSavedBook: InsertSavedBook): Promise<SavedBook> {
    const id = this.savedBookIdCounter++;
    const now = new Date();
    const savedBook: SavedBook = {
      ...insertSavedBook,
      id,
      coverUrl: insertSavedBook.coverUrl || null,
      rating: insertSavedBook.rating || null,
      summary: insertSavedBook.summary || null,
      savedAt: now
    };
    this.savedBooks.set(id, savedBook);
    return savedBook;
  }

  async deleteSavedBook(id: number): Promise<boolean> {
    return this.savedBooks.delete(id);
  }
  
  // Book Cache methods for MemStorage
  async findBookInCache(title: string, author: string): Promise<BookCache | undefined> {
    // Memory storage doesn't implement book cache - this would be implemented in DatabaseStorage
    return undefined;
  }

  async findBookByISBN(isbn: string): Promise<BookCache | undefined> {
    // Memory storage doesn't implement book cache - this would be implemented in DatabaseStorage
    return undefined;
  }

  async cacheBook(bookData: InsertBookCache): Promise<BookCache> {
    // Memory storage doesn't implement book cache - this would be implemented in DatabaseStorage
    throw new Error("Book caching not implemented in memory storage");
  }

  async getRecentlyAddedBooks(limit: number = 10): Promise<BookCache[]> {
    // Memory storage doesn't implement book cache - this would be implemented in DatabaseStorage
    return [];
  }
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

  // Books methods
  async getBooksByUserId(userId: number): Promise<Book[]> {
    return db.select().from(books).where(eq(books.userId, userId));
  }

  async createBook(insertBook: InsertBook): Promise<Book> {
    const [book] = await db
      .insert(books)
      .values(insertBook)
      .returning();
    return book;
  }

  // Recommendations methods
  async getRecommendationsByUserId(userId: number): Promise<Recommendation[]> {
    return db.select().from(recommendations).where(eq(recommendations.userId, userId));
  }

  async createRecommendation(insertRecommendation: InsertRecommendation): Promise<Recommendation> {
    const [recommendation] = await db
      .insert(recommendations)
      .values(insertRecommendation)
      .returning();
    return recommendation;
  }

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

  async deleteSavedBook(id: number): Promise<boolean> {
    const result = await db.delete(savedBooks).where(eq(savedBooks.id, id));
    return result.count > 0;
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

      return partialMatch;
    } catch (error) {
      console.error(`Error finding book in cache: ${error}`);
      return undefined;
    }
  }

  async findBookByISBN(isbn: string): Promise<BookCache | undefined> {
    if (!isbn || isbn.length < 10) return undefined;

    const [book] = await db.select().from(bookCache).where(
      and(
        eq(bookCache.isbn, isbn),
        gte(bookCache.expiresAt, new Date()) // Not expired
      )
    );

    return book;
  }

  async cacheBook(bookData: InsertBookCache): Promise<BookCache> {
    const [book] = await db
      .insert(bookCache)
      .values(bookData)
      .returning();
    return book;
  }

  async getRecentlyAddedBooks(limit: number = 10): Promise<BookCache[]> {
    return db.select()
      .from(bookCache)
      .orderBy(desc(bookCache.cachedAt))
      .limit(limit);
  }
}

// Export a singleton instance of DatabaseStorage
export const storage = new DatabaseStorage();
