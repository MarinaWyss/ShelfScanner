import { getMatchQualityLabel, getMatchQualityClass } from '../../../server/utils/match-quality-utils';

describe('Match Quality Utils', () => {
  describe('getMatchQualityLabel', () => {
    test('should return "Great match" for scores >= 90', () => {
      expect(getMatchQualityLabel(90)).toBe('Great match');
      expect(getMatchQualityLabel(95)).toBe('Great match');
      expect(getMatchQualityLabel(100)).toBe('Great match');
    });

    test('should return "Good match" for scores >= 76 and < 90', () => {
      expect(getMatchQualityLabel(76)).toBe('Good match');
      expect(getMatchQualityLabel(80)).toBe('Good match');
      expect(getMatchQualityLabel(89)).toBe('Good match');
    });

    test('should return "Fair match" for scores >= 60 and < 76', () => {
      expect(getMatchQualityLabel(60)).toBe('Fair match');
      expect(getMatchQualityLabel(65)).toBe('Fair match');
      expect(getMatchQualityLabel(75)).toBe('Fair match');
    });

    test('should return empty string for scores < 60', () => {
      expect(getMatchQualityLabel(59)).toBe('');
      expect(getMatchQualityLabel(50)).toBe('');
      expect(getMatchQualityLabel(0)).toBe('');
      expect(getMatchQualityLabel(30)).toBe('');
    });

    test('should return empty string for undefined scores', () => {
      expect(getMatchQualityLabel(undefined)).toBe('');
    });

    test('should handle edge cases and decimal scores', () => {
      expect(getMatchQualityLabel(89.9)).toBe('Good match');
      expect(getMatchQualityLabel(90.1)).toBe('Great match');
      expect(getMatchQualityLabel(75.9)).toBe('Fair match');
      expect(getMatchQualityLabel(76.1)).toBe('Good match');
      expect(getMatchQualityLabel(59.9)).toBe('');
      expect(getMatchQualityLabel(60.1)).toBe('Fair match');
    });

    test('should handle negative scores', () => {
      expect(getMatchQualityLabel(-1)).toBe('');
      expect(getMatchQualityLabel(-10)).toBe('');
    });

    test('should handle very high scores', () => {
      expect(getMatchQualityLabel(120)).toBe('Great match');
      expect(getMatchQualityLabel(999)).toBe('Great match');
    });
  });

  describe('getMatchQualityClass', () => {
    test('should return green classes for scores >= 90', () => {
      expect(getMatchQualityClass(90)).toBe('bg-green-100 text-green-800');
      expect(getMatchQualityClass(95)).toBe('bg-green-100 text-green-800');
      expect(getMatchQualityClass(100)).toBe('bg-green-100 text-green-800');
    });

    test('should return blue classes for scores >= 76 and < 90', () => {
      expect(getMatchQualityClass(76)).toBe('bg-blue-100 text-blue-800');
      expect(getMatchQualityClass(80)).toBe('bg-blue-100 text-blue-800');
      expect(getMatchQualityClass(89)).toBe('bg-blue-100 text-blue-800');
    });

    test('should return yellow classes for scores >= 60 and < 76', () => {
      expect(getMatchQualityClass(60)).toBe('bg-yellow-100 text-yellow-800');
      expect(getMatchQualityClass(65)).toBe('bg-yellow-100 text-yellow-800');
      expect(getMatchQualityClass(75)).toBe('bg-yellow-100 text-yellow-800');
    });

    test('should return empty string for scores < 60', () => {
      expect(getMatchQualityClass(59)).toBe('');
      expect(getMatchQualityClass(50)).toBe('');
      expect(getMatchQualityClass(0)).toBe('');
      expect(getMatchQualityClass(30)).toBe('');
    });

    test('should return empty string for undefined scores', () => {
      expect(getMatchQualityClass(undefined)).toBe('');
    });

    test('should handle edge cases and decimal scores', () => {
      expect(getMatchQualityClass(89.9)).toBe('bg-blue-100 text-blue-800');
      expect(getMatchQualityClass(90.1)).toBe('bg-green-100 text-green-800');
      expect(getMatchQualityClass(75.9)).toBe('bg-yellow-100 text-yellow-800');
      expect(getMatchQualityClass(76.1)).toBe('bg-blue-100 text-blue-800');
      expect(getMatchQualityClass(59.9)).toBe('');
      expect(getMatchQualityClass(60.1)).toBe('bg-yellow-100 text-yellow-800');
    });

    test('should handle negative scores', () => {
      expect(getMatchQualityClass(-1)).toBe('');
      expect(getMatchQualityClass(-10)).toBe('');
    });

    test('should handle very high scores', () => {
      expect(getMatchQualityClass(120)).toBe('bg-green-100 text-green-800');
      expect(getMatchQualityClass(999)).toBe('bg-green-100 text-green-800');
    });
  });

  describe('Integration tests', () => {
    test('should have consistent thresholds between label and class functions', () => {
      // Test boundary conditions to ensure both functions use same thresholds
      const testScores = [59, 60, 75, 76, 89, 90, 100];
      
      testScores.forEach(score => {
        const label = getMatchQualityLabel(score);
        const cssClass = getMatchQualityClass(score);
        
        // If there's a label, there should be a CSS class, and vice versa
        if (label === '') {
          expect(cssClass).toBe('');
        } else {
          expect(cssClass).not.toBe('');
        }
      });
    });

    test('should map labels to correct CSS classes', () => {
      // Great match -> green
      expect(getMatchQualityLabel(95)).toBe('Great match');
      expect(getMatchQualityClass(95)).toBe('bg-green-100 text-green-800');
      
      // Good match -> blue
      expect(getMatchQualityLabel(80)).toBe('Good match');
      expect(getMatchQualityClass(80)).toBe('bg-blue-100 text-blue-800');
      
      // Fair match -> yellow
      expect(getMatchQualityLabel(65)).toBe('Fair match');
      expect(getMatchQualityClass(65)).toBe('bg-yellow-100 text-yellow-800');
      
      // No match -> no class
      expect(getMatchQualityLabel(50)).toBe('');
      expect(getMatchQualityClass(50)).toBe('');
    });
  });
}); 