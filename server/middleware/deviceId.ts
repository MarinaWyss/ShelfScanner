/**
 * Device ID middleware
 * Ensures all requests have a valid device ID
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { log } from './vite';

// Cookie name for storing device ID
const DEVICE_ID_COOKIE = 'deviceId';
// Cookie expiration (1 year)
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000;

/**
 * Middleware to ensure all requests have a valid device ID
 * If no device ID is present in cookies, generate one
 */
export function ensureDeviceId(req: Request, res: Response, next: NextFunction) {
  let deviceId = req.cookies[DEVICE_ID_COOKIE];
  
  // If no device ID in cookies, check if it was sent in the header
  if (!deviceId) {
    deviceId = req.header('X-Device-ID');
  }
  
  // If still no device ID, generate a new one
  if (!deviceId) {
    deviceId = uuidv4();
    
    // Set as cookie with 1 year expiration
    res.cookie(DEVICE_ID_COOKIE, deviceId, {
      maxAge: COOKIE_MAX_AGE,
      httpOnly: false, // Changed to false to allow client-side access
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production'
    });
    
    log(`Generated new device ID: ${deviceId}`);
  } else {
    // Always update the cookie to ensure it doesn't expire
    // This prevents issues with cookie expiration across devices
    res.cookie(DEVICE_ID_COOKIE, deviceId, {
      maxAge: COOKIE_MAX_AGE,
      httpOnly: false, // Changed to false to allow client-side access
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production'
    });
  }
  
  // Add deviceId to request object for easy access in routes
  req.deviceId = deviceId;
  
  next();
}

// Add deviceId to Express Request interface
declare global {
  namespace Express {
    interface Request {
      deviceId?: string;
    }
  }
}