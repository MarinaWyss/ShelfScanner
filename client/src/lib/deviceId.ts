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
    // Note: Device ID generation (client-side only, not sensitive)
    if (process.env.NODE_ENV === 'development') {
      console.log('Generated new device ID for this browser');
    }
  }
  
  return deviceId;
}

/**
 * Ensure the device ID is set as a cookie
 * This will be called on app initialization
 */
export function syncDeviceIdCookie(): void {
  const deviceId = getDeviceId();
  
  // Check for existing cookies
  const existingCookie = document.cookie
    .split('; ')
    .find(row => row.startsWith(`${DEVICE_ID_COOKIE}=`));
    
  if (existingCookie) {
    const serverDeviceId = existingCookie.split('=')[1];
    
    // If server has a different device ID, update our localStorage to match it
    if (serverDeviceId && serverDeviceId !== deviceId) {
      localStorage.setItem(DEVICE_ID_KEY, serverDeviceId);
      if (process.env.NODE_ENV === 'development') {
        console.log('Updated local device ID to match server cookie');
      }
      return;
    }
  }
  
  // If no server cookie or IDs match, set the cookie with our device ID
  const expiryDate = new Date();
  expiryDate.setFullYear(expiryDate.getFullYear() + 1);
  
  document.cookie = `${DEVICE_ID_COOKIE}=${deviceId}; expires=${expiryDate.toUTCString()}; path=/; SameSite=Strict`;
  if (process.env.NODE_ENV === 'development') {
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