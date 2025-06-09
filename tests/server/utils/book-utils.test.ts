import { getEstimatedBookRating } from '../../../server/utils/book-utils';

describe('Book Utils', () => {
  describe('getEstimatedBookRating', () => {
    test('should return known ratings for popular books', () => {
      // Test exact matches
      expect(getEstimatedBookRating('Atomic Habits', 'James Clear')).toBe('4.8');
      expect(getEstimatedBookRating('Dune', 'Frank Herbert')).toBe('4.7');
      expect(getEstimatedBookRating('1984', 'George Orwell')).toBe('4.7');
      expect(getEstimatedBookRating('The Alchemist', 'Paulo Coelho')).toBe('4.7');
    });

    test('should handle case variations in titles and authors', () => {
      // Test case insensitive matching
      expect(getEstimatedBookRating('ATOMIC HABITS', 'JAMES CLEAR')).toBe('4.8');
      expect(getEstimatedBookRating('atomic habits', 'james clear')).toBe('4.8');
      expect(getEstimatedBookRating('Atomic habits', 'James clear')).toBe('4.8');
      
      // Test with extra whitespace
      expect(getEstimatedBookRating(' Dune ', ' Frank Herbert ')).toBe('4.7');
    });

    test('should handle partial matches correctly', () => {
      // Test partial title matches
      expect(getEstimatedBookRating('This is how you lose the time war', 'Amal El-Mohtar')).toBe('4.5');
      expect(getEstimatedBookRating('This is how you lose the time war', 'Max Gladstone')).toBe('4.5');
      
      // Test author partial matches
      expect(getEstimatedBookRating('The Psychology of Money', 'Morgan')).toBe('4.7');
    });

    test('should generate consistent ratings for same input', () => {
      const title = 'Unknown Book Title';
      const author = 'Unknown Author';
      
      const rating1 = getEstimatedBookRating(title, author);
      const rating2 = getEstimatedBookRating(title, author);
      const rating3 = getEstimatedBookRating(title, author);
      
      expect(rating1).toBe(rating2);
      expect(rating2).toBe(rating3);
    });

    test('should return ratings between 3.0 and 4.9 for unknown books', () => {
      const unknownBooks = [
        ['Random Book Title', 'Random Author'],
        ['Another Book', 'Another Author'],
        ['Test Book', 'Test Author'],
        ['Fiction Novel', 'Some Writer'],
        ['Technical Manual', 'Expert Author']
      ];

      unknownBooks.forEach(([title, author]) => {
        const rating = parseFloat(getEstimatedBookRating(title, author));
        expect(rating).toBeGreaterThanOrEqual(3.0);
        expect(rating).toBeLessThanOrEqual(4.9);
      });
    });

    test('should generate different ratings for different books', () => {
      const rating1 = getEstimatedBookRating('Book One', 'Author One');
      const rating2 = getEstimatedBookRating('Book Two', 'Author Two');
      const rating3 = getEstimatedBookRating('Completely Different', 'Different Author');
      
      // While we can't guarantee they'll all be different due to hash collisions,
      // at least some should be different
      const ratings = [rating1, rating2, rating3];
      const uniqueRatings = new Set(ratings);
      expect(uniqueRatings.size).toBeGreaterThan(1);
    });

    test('should return valid decimal format', () => {
      const rating = getEstimatedBookRating('Test Book', 'Test Author');
      
      // Should be a valid number string with one decimal place
      expect(rating).toMatch(/^\d\.\d$/);
      expect(parseFloat(rating)).not.toBeNaN();
    });

    test('should handle empty strings gracefully', () => {
      const rating = getEstimatedBookRating('', '');
      expect(rating).toMatch(/^\d\.\d$/);
      expect(parseFloat(rating)).toBeGreaterThanOrEqual(3.0);
      expect(parseFloat(rating)).toBeLessThanOrEqual(4.9);
    });

    test('should handle special characters in titles and authors', () => {
      const rating1 = getEstimatedBookRating('Book: A Story!', 'Author & Co.');
      const rating2 = getEstimatedBookRating('Book (Revised)', 'Dr. Author');
      
      expect(rating1).toMatch(/^\d\.\d$/);
      expect(rating2).toMatch(/^\d\.\d$/);
    });

    test('should prefer popular book ratings over generated ones', () => {
      // Test that popular books always return their known rating
      // regardless of what the hash algorithm would generate
      const popularBookRating = getEstimatedBookRating('Sapiens', 'Yuval Noah Harari');
      expect(popularBookRating).toBe('4.7');
      
      // Test multiple times to ensure consistency
      for (let i = 0; i < 10; i++) {
        expect(getEstimatedBookRating('Thinking, Fast and Slow', 'Daniel Kahneman')).toBe('4.6');
      }
    });
  });
}); 