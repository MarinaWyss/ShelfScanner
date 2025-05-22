/**
 * Device ID management utilities
 * Handles creation, storage and retrieval of device IDs
 * for persistent user identification across sessions
 */

import { v4 as uuidv4 } from 'uuid';

const DEVICE_ID_KEY = 'book_app_device_id';
const DEVICE_ID_COOKIE = 'deviceId';

/**
 * Get the current device ID from localStorage,
 * or generate a new one if not present
 */
export function getDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  
  // If no device ID exists, generate one and save it
  if (!deviceId) {
    deviceId = uuidv4();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
    console.log('Generated new device ID:', deviceId);
  }
  
  return deviceId;
}

/**
 * Ensure the device ID is set as a cookie
 * This will be called on app initialization
 */
export function syncDeviceIdCookie(): void {
  const deviceId = getDeviceId();
  
  // Check if cookie already contains this device ID
  if (!document.cookie.includes(`${DEVICE_ID_COOKIE}=${deviceId}`)) {
    // Set cookie with 1 year expiration
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    
    document.cookie = `${DEVICE_ID_COOKIE}=${deviceId}; expires=${expiryDate.toUTCString()}; path=/; SameSite=Strict`;
    console.log('Device ID synced to cookie');
  }
}

/**
 * Clear the device ID (used for testing or user logout)
 */
export function clearDeviceId(): void {
  localStorage.removeItem(DEVICE_ID_KEY);
  document.cookie = `${DEVICE_ID_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
}