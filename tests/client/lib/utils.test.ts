import { cn } from '../../../client/src/lib/utils';

describe('Utils', () => {
  describe('cn', () => {
    test('should merge simple class names', () => {
      expect(cn('class1', 'class2')).toBe('class1 class2');
      expect(cn('bg-red-500', 'text-white')).toBe('bg-red-500 text-white');
    });

    test('should handle empty inputs', () => {
      expect(cn()).toBe('');
      expect(cn('')).toBe('');
      expect(cn('', '')).toBe('');
    });

    test('should handle undefined and null inputs', () => {
      expect(cn(undefined)).toBe('');
      expect(cn(null)).toBe('');
      expect(cn('class1', undefined, 'class2')).toBe('class1 class2');
      expect(cn('class1', null, 'class2')).toBe('class1 class2');
    });

    test('should handle conditional classes', () => {
      const isTrue = true;
      const isFalse = false;
      const nullValue = null;
      const undefinedValue = undefined;
      
      expect(cn('base', isTrue && 'conditional')).toBe('base conditional');
      expect(cn('base', isFalse && 'conditional')).toBe('base');
      expect(cn('base', nullValue && 'conditional')).toBe('base');
      expect(cn('base', undefinedValue && 'conditional')).toBe('base');
    });

    test('should handle arrays of classes', () => {
      expect(cn(['class1', 'class2'])).toBe('class1 class2');
      expect(cn(['class1', 'class2'], 'class3')).toBe('class1 class2 class3');
      const shouldInclude = false;
      expect(cn(['class1', shouldInclude && 'class2', 'class3'])).toBe('class1 class3');
    });

    test('should handle objects with boolean values', () => {
      expect(cn({ 'class1': true, 'class2': false })).toBe('class1');
      expect(cn({ 'class1': true, 'class2': true })).toBe('class1 class2');
      expect(cn('base', { 'conditional': true })).toBe('base conditional');
      expect(cn('base', { 'conditional': false })).toBe('base');
    });

    test('should merge conflicting Tailwind classes correctly', () => {
      // twMerge should handle conflicting Tailwind classes
      expect(cn('px-2', 'px-4')).toBe('px-4');
      expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500');
      expect(cn('text-sm', 'text-lg')).toBe('text-lg');
    });

    test('should handle complex combinations', () => {
      const result = cn(
        'base-class',
        ['array-class1', 'array-class2'],
        { 'conditional-true': true, 'conditional-false': false },
        undefined,
        'final-class'
      );
      expect(result).toBe('base-class array-class1 array-class2 conditional-true final-class');
    });

    test('should handle Tailwind modifiers correctly', () => {
      expect(cn('hover:bg-red-500', 'focus:bg-blue-500')).toBe('hover:bg-red-500 focus:bg-blue-500');
      expect(cn('sm:text-sm', 'md:text-md', 'lg:text-lg')).toBe('sm:text-sm md:text-md lg:text-lg');
    });

      test('should handle identical classes (may or may not deduplicate depending on twMerge)', () => {
    // twMerge may or may not deduplicate identical classes
    const result1 = cn('class1', 'class1');
    expect(result1).toContain('class1');
    
    const result2 = cn('class1', 'class2', 'class1');
    expect(result2).toContain('class1');
    expect(result2).toContain('class2');
  });

    test('should handle responsive and state variants with conflicts', () => {
      // Test that twMerge properly handles responsive variants
      expect(cn('p-2', 'sm:p-4', 'p-6')).toBe('sm:p-4 p-6');
      expect(cn('bg-red-500', 'hover:bg-red-500', 'bg-blue-500')).toBe('hover:bg-red-500 bg-blue-500');
    });

    test('should preserve custom CSS classes that are not Tailwind', () => {
      expect(cn('custom-class', 'another-custom')).toBe('custom-class another-custom');
      expect(cn('bg-red-500', 'my-custom-bg')).toBe('bg-red-500 my-custom-bg');
    });
  });
}); 