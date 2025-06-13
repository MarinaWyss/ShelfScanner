import { insertUserSchema, insertPreferenceSchema, insertBookCacheSchema, insertSavedBookSchema } from '../../shared/schema';
import type { InsertUser, InsertPreference, InsertBookCache, InsertSavedBook } from '../../shared/schema';

describe('Schema Validation', () => {
  describe('insertUserSchema', () => {
    test('should validate valid user data', () => {
      const validUser = {
        username: 'testuser',
        password: 'testpassword',
      };

      const result: InsertUser = insertUserSchema.parse(validUser);
      expect((result as any).username).toBe('testuser');
      expect((result as any).password).toBe('testpassword');
    });

    test('should reject user data without username', () => {
      const invalidUser = {
        password: 'testpassword',
      };

      expect(() => insertUserSchema.parse(invalidUser)).toThrow();
    });

    test('should reject user data without password', () => {
      const invalidUser = {
        username: 'testuser',
      };

      expect(() => insertUserSchema.parse(invalidUser)).toThrow();
    });

    test('should reject empty username', () => {
      const invalidUser = {
        username: '',
        password: 'testpassword',
      };

      expect(() => insertUserSchema.parse(invalidUser)).toThrow();
    });

    test('should reject empty password', () => {
      const invalidUser = {
        username: 'testuser',
        password: '',
      };

      expect(() => insertUserSchema.parse(invalidUser)).toThrow();
    });
  });

  describe('insertPreferenceSchema', () => {
    test('should validate valid preference data', () => {
      const validPreference = {
        deviceId: 'device123',
        genres: ['fiction', 'mystery'],
        authors: ['Author One', 'Author Two'],
        goodreadsData: { userId: 123, books: [] },
      };

      const result: InsertPreference = insertPreferenceSchema.parse(validPreference);
      expect((result as any).deviceId).toBe('device123');
      expect((result as any).genres).toEqual(['fiction', 'mystery']);
    });

    test('should validate preference data without optional fields', () => {
      const validPreference = {
        deviceId: 'device123',
        genres: ['fiction'],
      };

      const result: InsertPreference = insertPreferenceSchema.parse(validPreference);
      expect((result as any).deviceId).toBe('device123');
      expect((result as any).genres).toEqual(['fiction']);
    });

    test('should reject preference data without deviceId', () => {
      const invalidPreference = {
        genres: ['fiction'],
      };

      expect(() => insertPreferenceSchema.parse(invalidPreference)).toThrow();
    });

    test('should reject preference data without genres', () => {
      const invalidPreference = {
        deviceId: 'device123',
      };

      expect(() => insertPreferenceSchema.parse(invalidPreference)).toThrow();
    });

    test('should validate with empty authors array', () => {
      const validPreference = {
        deviceId: 'device123',
        genres: ['fiction'],
        authors: [],
      };

      const result: InsertPreference = insertPreferenceSchema.parse(validPreference);
      expect((result as any).deviceId).toBe('device123');
      expect((result as any).authors).toEqual([]);
    });
  });

  describe('insertBookCacheSchema', () => {
    test('should validate valid book cache data', () => {
      const validBook = {
        title: 'Test Book',
        author: 'Test Author',
        isbn: '9781234567890',
        bookId: 'test-book-test-author',
        coverUrl: 'https://example.com/cover.jpg',
        rating: '4.5',
        summary: 'A test book summary',
        source: 'google',
        metadata: { pages: 300 },
        expiresAt: new Date(),
      };

      const result: InsertBookCache = insertBookCacheSchema.parse(validBook);
      expect((result as any).title).toBe('Test Book');
      expect((result as any).source).toBe('google');
    });

    test('should validate book cache data with only required fields', () => {
      const validBook = {
        title: 'Test Book',
        author: 'Test Author',
        bookId: 'test-book-test-author',
        source: 'amazon',
      };

      const result: InsertBookCache = insertBookCacheSchema.parse(validBook);
      expect((result as any).title).toBe('Test Book');
      expect((result as any).source).toBe('amazon');
    });

    test('should reject book cache data without title', () => {
      const invalidBook = {
        author: 'Test Author',
        bookId: 'test-book-test-author',
        source: 'google',
      };

      expect(() => insertBookCacheSchema.parse(invalidBook)).toThrow();
    });

    test('should reject book cache data without author', () => {
      const invalidBook = {
        title: 'Test Book',
        bookId: 'test-book-test-author',
        source: 'google',
      };

      expect(() => insertBookCacheSchema.parse(invalidBook)).toThrow();
    });

    test('should reject book cache data without bookId', () => {
      const invalidBook = {
        title: 'Test Book',
        author: 'Test Author',
        source: 'google',
      };

      expect(() => insertBookCacheSchema.parse(invalidBook)).toThrow();
    });

    test('should reject book cache data without source', () => {
      const invalidBook = {
        title: 'Test Book',
        author: 'Test Author',
        bookId: 'test-book-test-author',
      };

      expect(() => insertBookCacheSchema.parse(invalidBook)).toThrow();
    });

    test('should handle different valid sources', () => {
      const sources = ['google', 'amazon', 'openai'];
      
      sources.forEach(source => {
        const validBook = {
          title: 'Test Book',
          author: 'Test Author',
          bookId: 'test-book-test-author',
          source,
        };

        const result: InsertBookCache = insertBookCacheSchema.parse(validBook);
        expect((result as any).source).toBe(source);
      });
    });
  });

  describe('insertSavedBookSchema', () => {
    test('should validate valid saved book data', () => {
      const validSavedBook = {
        deviceId: 'device123',
        bookCacheId: 1,
        title: 'Test Book',
        author: 'Test Author',
        coverUrl: 'https://example.com/cover.jpg',
        rating: '4.5',
        summary: 'A test book summary',
      };

      const result: InsertSavedBook = insertSavedBookSchema.parse(validSavedBook);
      expect((result as any).deviceId).toBe('device123');
      expect((result as any).title).toBe('Test Book');
    });

    test('should validate saved book data with only required fields', () => {
      const validSavedBook = {
        deviceId: 'device123',
        title: 'Test Book',
        author: 'Test Author',
      };

      const result: InsertSavedBook = insertSavedBookSchema.parse(validSavedBook);
      expect((result as any).deviceId).toBe('device123');
      expect((result as any).title).toBe('Test Book');
    });

    test('should reject saved book data without deviceId', () => {
      const invalidSavedBook = {
        title: 'Test Book',
        author: 'Test Author',
      };

      expect(() => insertSavedBookSchema.parse(invalidSavedBook)).toThrow();
    });

    test('should reject saved book data without title', () => {
      const invalidSavedBook = {
        deviceId: 'device123',
        author: 'Test Author',
      };

      expect(() => insertSavedBookSchema.parse(invalidSavedBook)).toThrow();
    });

    test('should reject saved book data without author', () => {
      const invalidSavedBook = {
        deviceId: 'device123',
        title: 'Test Book',
      };

      expect(() => insertSavedBookSchema.parse(invalidSavedBook)).toThrow();
    });

    test('should handle null values for optional fields', () => {
      const validSavedBook = {
        deviceId: 'device123',
        title: 'Test Book',
        author: 'Test Author',
        coverUrl: null,
        rating: null,
        summary: null,
      };

      const result: InsertSavedBook = insertSavedBookSchema.parse(validSavedBook);
      expect((result as any).deviceId).toBe('device123');
      expect((result as any).title).toBe('Test Book');
    });
  });

  describe('Type inference', () => {
    test('should infer correct types from schemas', () => {
      // This test mainly checks that TypeScript compilation works correctly
      const user: InsertUser = insertUserSchema.parse({
        username: 'test',
        password: 'password',
      });
      
      expect(typeof (user as any).username).toBe('string');
      expect(typeof (user as any).password).toBe('string');

      const preference: InsertPreference = insertPreferenceSchema.parse({
        userId: 1,
        genres: ['fiction'],
      });
      
      expect(typeof (preference as any).userId).toBe('number');
      expect(Array.isArray((preference as any).genres)).toBe(true);

      const bookCache: InsertBookCache = insertBookCacheSchema.parse({
        title: 'Test',
        author: 'Author',
        bookId: 'test-id',
        source: 'google',
      });
      
      expect(typeof (bookCache as any).title).toBe('string');
      expect(typeof (bookCache as any).source).toBe('string');

      const savedBook: InsertSavedBook = insertSavedBookSchema.parse({
        deviceId: 'device123',
        title: 'Test',
        author: 'Author',
      });
      
      expect(typeof (savedBook as any).deviceId).toBe('string');
      expect(typeof (savedBook as any).title).toBe('string');
    });
  });
}); 