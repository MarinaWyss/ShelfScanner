import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDeviceId, clearDeviceId } from '../../../client/src/lib/deviceId';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Mock uuid
vi.mock('uuid', () => ({
  v4: () => 'test-uuid-1234-5678-abcd'
}));

describe('Device ID Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getDeviceId', () => {
    it('should return existing device ID from localStorage', () => {
      const existingId = 'existing-device-id-123';
      localStorageMock.getItem.mockReturnValue(existingId);

      const result = getDeviceId();

      expect(result).toBe(existingId);
      expect(localStorageMock.getItem).toHaveBeenCalledWith('book_app_device_id');
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });

    it('should generate new device ID when none exists', () => {
      localStorageMock.getItem.mockReturnValue(null);

      const result = getDeviceId();

      expect(result).toBe('test-uuid-1234-5678-abcd');
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'book_app_device_id',
        'test-uuid-1234-5678-abcd'
      );
    });

    it('should handle null return from localStorage', () => {
      localStorageMock.getItem.mockReturnValue(null);

      const result = getDeviceId();

      expect(result).toBe('test-uuid-1234-5678-abcd');
      expect(localStorageMock.getItem).toHaveBeenCalledWith('book_app_device_id');
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'book_app_device_id',
        'test-uuid-1234-5678-abcd'
      );
    });
  });

  describe('clearDeviceId', () => {
    it('should remove device ID from localStorage', () => {
      clearDeviceId();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('book_app_device_id');
    });

    it('should work even when no existing data', () => {
      localStorageMock.getItem.mockReturnValue(null);

      clearDeviceId();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('book_app_device_id');
    });
  });

  describe('Integration tests', () => {
    it('should handle complete workflow: generate -> clear', () => {
      // Start with no device ID
      localStorageMock.getItem.mockReturnValue(null);

      // Generate device ID
      const deviceId = getDeviceId();
      expect(deviceId).toBe('test-uuid-1234-5678-abcd');

      // Clear everything
      clearDeviceId();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('book_app_device_id');
    });

    it('should consistently return same ID if it exists', () => {
      const testId = 'consistent-test-id';
      localStorageMock.getItem.mockReturnValue(testId);

      const result1 = getDeviceId();
      const result2 = getDeviceId();

      expect(result1).toBe(testId);
      expect(result2).toBe(testId);
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });
  });
}); 