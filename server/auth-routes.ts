/**
 * Authentication routes
 * Handles device ID verification and optional Google authentication
 */

import { Router, Request, Response } from 'express';
import { storage } from './storage';
import { log } from './vite';

const router = Router();

// Check for an active session
router.get('/check-session', (req: Request, res: Response) => {
  // For now, we're only implementing device ID persistence
  // Later, we'll check for Google auth session here too
  return res.status(200).json(null);
});

// Get the current device ID
router.get('/device-id', (req: Request, res: Response) => {
  return res.status(200).json({ deviceId: req.deviceId });
});

// Endpoint that will be used for Google OAuth login in the future
router.get('/google', (req: Request, res: Response) => {
  // For now, return a placeholder response
  res.status(200).json({ 
    message: 'Google authentication will be implemented here when you deploy the app'
  });
});

// Google OAuth callback endpoint - now handles server-side verification
router.post('/google/callback', async (req: Request, res: Response) => {
  try {
    const { access_token } = req.body;
    
    if (!access_token) {
      return res.status(400).json({ message: 'Missing access token' });
    }

    // Use Google API to fetch user profile using the access token
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user info from Google');
    }

    const googleUserInfo = await response.json();
    
    // Create a session with the user info
    const userInfo = {
      id: googleUserInfo.sub,
      email: googleUserInfo.email,
      name: googleUserInfo.name,
      picture: googleUserInfo.picture
    };
    
    // In a real-world app, we would create/update the user in our database here
    
    // Set session data
    // Note: Proper session management would be added here when deployed
    // This is a simplified approach for now that doesn't require additional setup
    
    return res.status(200).json(userInfo);
  } catch (error) {
    console.error('Error in Google callback:', error);
    return res.status(500).json({ 
      message: 'Authentication failed',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Logout endpoint
router.post('/logout', (req: Request, res: Response) => {
  // For now, do nothing as we're only using device IDs
  res.status(200).json({ success: true });
});

// Migrate data from device ID to user account (for when a user logs in)
router.post('/migrate-data', async (req: Request, res: Response) => {
  try {
    const { deviceId, userId } = req.body;
    
    if (!deviceId || !userId) {
      return res.status(400).json({ message: 'Device ID and User ID are required' });
    }
    
    // Get all saved books for this device
    const savedBooks = await storage.getSavedBooksByDeviceId(deviceId);
    
    // TODO: Implement data migration when we add user accounts
    
    return res.status(200).json({ 
      message: 'Data migration will be implemented when user accounts are added',
      migratedItems: savedBooks.length
    });
  } catch (error) {
    log(`Error in data migration: ${error instanceof Error ? error.message : String(error)}`);
    return res.status(500).json({ 
      message: 'Error migrating data',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

export const authRoutes = router;