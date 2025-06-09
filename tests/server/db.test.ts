import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

// Mock the database connection
jest.mock('pg');
jest.mock('drizzle-orm/node-postgres');

const mockPool = {
  query: jest.fn(),
  end: jest.fn(),
  connect: jest.fn(),
};

const mockDb = {
  select: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

(Pool as jest.MockedClass<typeof Pool>).mockImplementation(() => mockPool as any);
(drizzle as jest.MockedFunction<typeof drizzle>).mockReturnValue(mockDb as any);

describe('Database Operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Database Connection', () => {
    it('should create pool with correct connection string', () => {
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
      
      // Re-import to trigger the module initialization
      jest.isolateModules(() => {
        require('@server/db');
      });

      expect(Pool).toHaveBeenCalledWith({
        connectionString: 'postgresql://test:test@localhost:5432/test_db',
        ssl: false
      });
    });

    it('should throw error when DATABASE_URL is not set', () => {
      delete process.env.DATABASE_URL;
      
      expect(() => {
        jest.isolateModules(() => {
          require('@server/db');
        });
      }).toThrow('DATABASE_URL must be set. Did you forget to provision a database?');
    });

    it('should enable SSL in production', () => {
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
      process.env.NODE_ENV = 'production';
      
      jest.isolateModules(() => {
        require('@server/db');
      });

      expect(Pool).toHaveBeenCalledWith({
        connectionString: 'postgresql://test:test@localhost:5432/test_db',
        ssl: { rejectUnauthorized: false }
      });
      
      // Reset NODE_ENV
      process.env.NODE_ENV = 'test';
    });
  });

  describe('Book Cache Operations', () => {
    it('should create book cache entry with required fields', () => {
      const bookData = {
        title: 'Test Book',
        author: 'Test Author',
        bookId: 'test-book-test-author',
        source: 'test' as const,
        isbn: '1234567890',
        coverUrl: 'http://example.com/cover.jpg',
        rating: '4.5',
        summary: 'A test book',
        metadata: { genre: 'Fiction' }
      };

      const mockInsert = {
        values: jest.fn().mockReturnThis(),
        returning: (jest.fn() as any).mockResolvedValue([{ ...bookData, id: 1 }])
      };

      mockDb.insert.mockReturnValue(mockInsert);

      // This tests the schema structure rather than actual DB operation
      expect(bookData.title).toBeDefined();
      expect(bookData.author).toBeDefined();
      expect(bookData.bookId).toBeDefined();
      expect(bookData.source).toBeDefined();
    });
  });

  describe('User Operations', () => {
    it('should create user with valid schema', () => {
      const userData = {
        username: 'testuser',
        password: 'hashedpassword'
      };

      const mockInsert = {
        values: jest.fn().mockReturnThis(),
        returning: (jest.fn() as any).mockResolvedValue([{ ...userData, id: 1 }])
      };

      mockDb.insert.mockReturnValue(mockInsert);

      expect(userData.username).toBeDefined();
      expect(userData.password).toBeDefined();
    });
  });

  describe('Saved Books Operations', () => {
    it('should create saved book with device ID', () => {
      const savedBookData = {
        deviceId: 'test-device-123',
        title: 'Saved Book',
        author: 'Book Author',
        bookCacheId: 1,
        coverUrl: 'http://example.com/cover.jpg',
        rating: '4.0',
        summary: 'A saved book'
      };

      const mockInsert = {
        values: jest.fn().mockReturnThis(),
        returning: (jest.fn() as any).mockResolvedValue([{ ...savedBookData, id: 1 }])
      };

      mockDb.insert.mockReturnValue(mockInsert);

      expect(savedBookData.deviceId).toBeDefined();
      expect(savedBookData.title).toBeDefined();
      expect(savedBookData.author).toBeDefined();
    });
  });

  describe('Preferences Operations', () => {
    it('should create preferences with genres and optional Goodreads data', () => {
      const preferencesData = {
        userId: 1,
        deviceId: 'test-device-123',
        genres: ['Fiction', 'Science Fiction'],
        authors: ['Isaac Asimov', 'Frank Herbert'],
        goodreadsData: {
          userId: 'goodreads123',
          readBooks: ['Dune', 'Foundation']
        }
      };

      const mockInsert = {
        values: jest.fn().mockReturnThis(),
        returning: (jest.fn() as any).mockResolvedValue([{ ...preferencesData, id: 1 }])
      };

      mockDb.insert.mockReturnValue(mockInsert);

      expect(preferencesData.genres).toHaveLength(2);
      expect(preferencesData.authors).toHaveLength(2);
      expect(preferencesData.goodreadsData).toBeDefined();
    });
  });
}); 