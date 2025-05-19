import { 
  users, type User, type InsertUser,
  preferences, type Preference, type InsertPreference,
  books, type Book, type InsertBook,
  recommendations, type Recommendation, type InsertRecommendation
} from "@shared/schema";

// Storage interface
export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Preferences methods
  getPreferencesByUserId(userId: number): Promise<Preference | undefined>;
  createPreference(preference: InsertPreference): Promise<Preference>;
  updatePreference(id: number, preference: Partial<InsertPreference>): Promise<Preference | undefined>;
  
  // Books methods
  getBooksByUserId(userId: number): Promise<Book[]>;
  createBook(book: InsertBook): Promise<Book>;
  
  // Recommendations methods
  getRecommendationsByUserId(userId: number): Promise<Recommendation[]>;
  createRecommendation(recommendation: InsertRecommendation): Promise<Recommendation>;
}

// Memory storage implementation
export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private preferences: Map<number, Preference>;
  private books: Map<number, Book>;
  private recommendations: Map<number, Recommendation>;
  private userIdCounter: number;
  private preferenceIdCounter: number;
  private bookIdCounter: number;
  private recommendationIdCounter: number;

  constructor() {
    this.users = new Map();
    this.preferences = new Map();
    this.books = new Map();
    this.recommendations = new Map();
    this.userIdCounter = 1;
    this.preferenceIdCounter = 1;
    this.bookIdCounter = 1;
    this.recommendationIdCounter = 1;
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

  async createPreference(insertPreference: InsertPreference): Promise<Preference> {
    const id = this.preferenceIdCounter++;
    const preference: Preference = { ...insertPreference, id };
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
    const book: Book = { ...insertBook, id };
    this.books.set(id, book);
    return book;
  }

  // Recommendations methods
  async getRecommendationsByUserId(userId: number): Promise<Recommendation[]> {
    return Array.from(this.recommendations.values()).filter(
      (recommendation) => recommendation.userId === userId,
    );
  }

  async createRecommendation(insertRecommendation: InsertRecommendation): Promise<Recommendation> {
    const id = this.recommendationIdCounter++;
    const recommendation: Recommendation = { ...insertRecommendation, id };
    this.recommendations.set(id, recommendation);
    return recommendation;
  }
}

// Export a singleton instance of MemStorage
export const storage = new MemStorage();
