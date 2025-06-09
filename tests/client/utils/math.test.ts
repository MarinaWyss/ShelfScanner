import { describe, it, expect } from 'vitest';

// Simple utility functions to test
export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}

// Tests
describe('Math Utils', () => {
  it('should add two numbers correctly', () => {
    expect(add(2, 3)).toBe(5);
    expect(add(-1, 1)).toBe(0);
    expect(add(0, 0)).toBe(0);
  });

  it('should multiply two numbers correctly', () => {
    expect(multiply(3, 4)).toBe(12);
    expect(multiply(-2, 3)).toBe(-6);
    expect(multiply(0, 5)).toBe(0);
  });

  it('should handle edge cases', () => {
    expect(add(0.1, 0.2)).toBeCloseTo(0.3);
    expect(multiply(0.1, 0.2)).toBeCloseTo(0.02);
  });
}); 