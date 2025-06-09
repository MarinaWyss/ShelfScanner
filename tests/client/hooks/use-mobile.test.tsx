import { renderHook, act } from '@testing-library/react';
import { vi, beforeEach } from 'vitest';
import { useIsMobile } from '../../../client/src/hooks/use-mobile';

// Mock window.matchMedia
const mockMatchMedia = (matches: boolean) => {
  return {
    matches,
    media: '(max-width: 767px)',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
};

// Mock window object
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((_query) => mockMatchMedia(false)),
});

Object.defineProperty(window, 'innerWidth', {
  writable: true,
  configurable: true,
  value: 1024,
});

describe('useIsMobile', () => {
  beforeEach(() => {
    // Reset window.innerWidth to desktop size
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });
  });

  test('should return false for desktop screen sizes', () => {
    // Mock desktop width
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  test('should return true for mobile screen sizes', () => {
    // Mock mobile width
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 400,
    });

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  test('should return true for exactly 767px (mobile breakpoint)', () => {
    // 768px is the breakpoint, so 767px should be mobile
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 767,
    });

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  test('should return false for exactly 768px (desktop breakpoint)', () => {
    // 768px should be desktop
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 768,
    });

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  test('should respond to window resize events', () => {
    let mediaQueryCallback: (() => void) | null = null;
    const mockAddEventListener = vi.fn((event, callback) => {
      if (event === 'change') {
        mediaQueryCallback = callback;
      }
    });

    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      media: '(max-width: 767px)',
      addEventListener: mockAddEventListener,
      removeEventListener: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    // Start with desktop
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    // Simulate resize to mobile
    act(() => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 400,
      });
      
      // Trigger the media query change callback
      if (mediaQueryCallback) {
        mediaQueryCallback();
      }
    });

    expect(result.current).toBe(true);
  });

  test('should cleanup event listeners on unmount', () => {
    const mockRemoveEventListener = vi.fn();
    
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      media: '(max-width: 767px)',
      addEventListener: vi.fn(),
      removeEventListener: mockRemoveEventListener,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { unmount } = renderHook(() => useIsMobile());
    
    unmount();
    
    expect(mockRemoveEventListener).toHaveBeenCalled();
  });

  test('should handle undefined initial state correctly', () => {
    const { result } = renderHook(() => useIsMobile());
    
    // The hook should always return a boolean, never undefined
    expect(typeof result.current).toBe('boolean');
  });

  test('should use correct mobile breakpoint (768px)', () => {
    // Test various sizes around the breakpoint
    const testCases = [
      { width: 320, expected: true },   // Mobile
      { width: 480, expected: true },   // Mobile
      { width: 767, expected: true },   // Mobile (just under breakpoint)
      { width: 768, expected: false },  // Desktop (at breakpoint)
      { width: 1024, expected: false }, // Desktop
      { width: 1920, expected: false }, // Desktop
    ];

    testCases.forEach(({ width, expected }) => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: width,
      });

      const { result } = renderHook(() => useIsMobile());
      expect(result.current).toBe(expected);
    });
  });
}); 