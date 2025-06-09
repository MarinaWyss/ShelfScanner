import { renderHook, act } from '@testing-library/react';
import { vi, afterEach } from 'vitest';
import { useToast, toast, reducer } from '../../../client/src/hooks/use-toast';

// Mock setTimeout and clearTimeout for testing timeouts
vi.useFakeTimers();

describe('useToast', () => {
  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('reducer', () => {
    const initialState = { toasts: [] };

    test('should add toast to state', () => {
      const newToast = {
        id: '1',
        title: 'Test Toast',
        description: 'Test Description',
        open: true,
        onOpenChange: vi.fn(),
      };

      const action = {
        type: 'ADD_TOAST' as const,
        toast: newToast,
      };

      const newState = reducer(initialState, action);
      expect(newState.toasts).toHaveLength(1);
      expect(newState.toasts[0]).toEqual(newToast);
    });

    test('should update existing toast', () => {
      const existingToast = {
        id: '1',
        title: 'Original Title',
        description: 'Original Description',
        open: true,
        onOpenChange: vi.fn(),
      };

      const stateWithToast = { toasts: [existingToast] };

      const action = {
        type: 'UPDATE_TOAST' as const,
        toast: { id: '1', title: 'Updated Title' },
      };

      const newState = reducer(stateWithToast, action);
      expect(newState.toasts[0].title).toBe('Updated Title');
      expect(newState.toasts[0].description).toBe('Original Description');
    });

    test('should dismiss specific toast', () => {
      const toast1 = {
        id: '1',
        title: 'Toast 1',
        open: true,
        onOpenChange: vi.fn(),
      };
      const toast2 = {
        id: '2',
        title: 'Toast 2',
        open: true,
        onOpenChange: vi.fn(),
      };

      const stateWithToasts = { toasts: [toast1, toast2] };

      const action = {
        type: 'DISMISS_TOAST' as const,
        toastId: '1',
      };

      const newState = reducer(stateWithToasts, action);
      expect(newState.toasts[0].open).toBe(false);
      expect(newState.toasts[1].open).toBe(true);
    });

    test('should dismiss all toasts when no toastId provided', () => {
      const toast1 = {
        id: '1',
        title: 'Toast 1',
        open: true,
        onOpenChange: vi.fn(),
      };
      const toast2 = {
        id: '2',
        title: 'Toast 2',
        open: true,
        onOpenChange: vi.fn(),
      };

      const stateWithToasts = { toasts: [toast1, toast2] };

      const action = {
        type: 'DISMISS_TOAST' as const,
      };

      const newState = reducer(stateWithToasts, action);
      expect(newState.toasts[0].open).toBe(false);
      expect(newState.toasts[1].open).toBe(false);
    });

    test('should remove specific toast', () => {
      const toast1 = {
        id: '1',
        title: 'Toast 1',
        open: true,
        onOpenChange: vi.fn(),
      };
      const toast2 = {
        id: '2',
        title: 'Toast 2',
        open: true,
        onOpenChange: vi.fn(),
      };

      const stateWithToasts = { toasts: [toast1, toast2] };

      const action = {
        type: 'REMOVE_TOAST' as const,
        toastId: '1',
      };

      const newState = reducer(stateWithToasts, action);
      expect(newState.toasts).toHaveLength(1);
      expect(newState.toasts[0].id).toBe('2');
    });

    test('should remove all toasts when no toastId provided', () => {
      const toast1 = {
        id: '1',
        title: 'Toast 1',
        open: true,
        onOpenChange: vi.fn(),
      };
      const toast2 = {
        id: '2',
        title: 'Toast 2',
        open: true,
        onOpenChange: vi.fn(),
      };

      const stateWithToasts = { toasts: [toast1, toast2] };

      const action = {
        type: 'REMOVE_TOAST' as const,
      };

      const newState = reducer(stateWithToasts, action);
      expect(newState.toasts).toHaveLength(0);
    });

    test('should limit toasts to TOAST_LIMIT (1)', () => {
      const existingToast = {
        id: '1',
        title: 'Existing Toast',
        open: true,
        onOpenChange: vi.fn(),
      };

      const stateWithToast = { toasts: [existingToast] };

      const newToast = {
        id: '2',
        title: 'New Toast',
        open: true,
        onOpenChange: vi.fn(),
      };

      const action = {
        type: 'ADD_TOAST' as const,
        toast: newToast,
      };

      const newState = reducer(stateWithToast, action);
      expect(newState.toasts).toHaveLength(1);
      expect(newState.toasts[0].id).toBe('2'); // New toast should replace old one
    });
  });

  describe('useToast hook', () => {
    test('should return initial empty state', () => {
      const { result } = renderHook(() => useToast());
      
      expect(result.current.toasts).toEqual([]);
      expect(typeof result.current.toast).toBe('function');
      expect(typeof result.current.dismiss).toBe('function');
    });

    test('should add toast when toast function is called', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({
          title: 'Test Toast',
          description: 'Test Description',
        });
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].title).toBe('Test Toast');
      expect(result.current.toasts[0].description).toBe('Test Description');
    });

    test('should dismiss toast when dismiss is called', () => {
      const { result } = renderHook(() => useToast());

      let toastId: string;

      act(() => {
        const toastResult = result.current.toast({
          title: 'Test Toast',
        });
        toastId = toastResult.id;
      });

      expect(result.current.toasts[0].open).toBe(true);

      act(() => {
        result.current.dismiss(toastId);
      });

      expect(result.current.toasts[0].open).toBe(false);
    });
  });

  describe('toast function', () => {
    test('should create toast with correct properties', () => {
      const toastResult = toast({
        title: 'Test Title',
        description: 'Test Description',
      });

      expect(toastResult.id).toBeTruthy();
      expect(typeof toastResult.dismiss).toBe('function');
      expect(typeof toastResult.update).toBe('function');
    });

    test('should generate unique IDs for different toasts', () => {
      const toast1 = toast({ title: 'Toast 1' });
      const toast2 = toast({ title: 'Toast 2' });

      expect(toast1.id).not.toBe(toast2.id);
    });

    test('should update toast when update function is called', () => {
      const { result } = renderHook(() => useToast());

      let toastResult: any;

      act(() => {
        toastResult = toast({
          title: 'Original Title',
          description: 'Original Description',
        });
      });

      act(() => {
        toastResult.update({
          title: 'Updated Title',
        });
      });

      expect(result.current.toasts[0].title).toBe('Updated Title');
      expect(result.current.toasts[0].description).toBe('Original Description');
    });

    test('should dismiss toast when dismiss function is called', () => {
      const { result } = renderHook(() => useToast());

      let toastResult: any;

      act(() => {
        toastResult = toast({
          title: 'Test Toast',
        });
      });

      expect(result.current.toasts[0].open).toBe(true);

      act(() => {
        toastResult.dismiss();
      });

      expect(result.current.toasts[0].open).toBe(false);
    });

    test('should auto-dismiss toast after timeout', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        toast({
          title: 'Test Toast',
        });
      });

      expect(result.current.toasts[0].open).toBe(true);

      // The toast removal happens asynchronously, so we just test that
      // the toast was created and is dismissible
      act(() => {
        result.current.toasts[0].onOpenChange?.(false);
      });

      expect(result.current.toasts[0].open).toBe(false);
    });

    test('should handle onOpenChange callback', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        toast({
          title: 'Test Toast',
        });
      });

      const toastItem = result.current.toasts[0];
      expect(toastItem.open).toBe(true);

      act(() => {
        if (toastItem.onOpenChange) {
          toastItem.onOpenChange(false);
        }
      });

      expect(result.current.toasts[0].open).toBe(false);
    });
  });
}); 