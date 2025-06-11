import 'dotenv/config';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { storage } from '../server/storage';
import { insertPreferenceSchema } from '../shared/schema';
import { v4 as uuidv4 } from 'uuid';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Extract device ID from cookies or generate new one
    let deviceId = req.cookies?.deviceId;
    
    if (!deviceId) {
      deviceId = uuidv4();
      // Set cookie
      res.setHeader('Set-Cookie', `deviceId=${deviceId}; Path=/; Max-Age=${365 * 24 * 60 * 60}; SameSite=Strict; ${process.env.NODE_ENV === 'production' ? 'Secure;' : ''}`);
    }

    if (req.method === 'GET') {
      // Get user preferences
      const preferences = await storage.getPreferencesByDeviceId(deviceId);
      
      if (!preferences) {
        return res.status(404).json({ message: 'Preferences not found' });
      }
      
      return res.status(200).json(preferences);
    }
    
    if (req.method === 'POST') {
      // Save user preferences
      const userId = 1; // For backward compatibility
      
      // Validate request body
      const validatedData = insertPreferenceSchema.parse({
        ...req.body,
        userId,
        deviceId
      });
      
      // Check if preferences already exist for this specific device
      const existingPreferences = await storage.getPreferencesByDeviceId(deviceId);
      
      let preferences;
      if (existingPreferences) {
        // Update existing preferences
        preferences = await storage.updatePreference(existingPreferences.id, validatedData);
      } else {
        // Create brand new preferences for this device
        preferences = await storage.createPreference(validatedData);
      }
      
      return res.status(201).json(preferences);
    }
    
    return res.status(405).json({ message: 'Method not allowed' });
  } catch (error) {
    console.error('Error in preferences API:', error);
    return res.status(500).json({ 
      message: 'Error handling preferences',
      error: error instanceof Error ? error.message : String(error)
    });
  }
} 