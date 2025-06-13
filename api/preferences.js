/* eslint-disable no-undef */
// Import using ES modules for Vercel compatibility
import 'dotenv/config';
import { v4 as uuidv4 } from 'uuid';

/**
 * API handler for preferences
 * @param {import('@vercel/node').VercelRequest} req - The request object
 * @param {import('@vercel/node').VercelResponse} res - The response object
 */
export default async function handler(req, res) {
  // Add comprehensive logging for debugging
  console.log('=== PREFERENCES API CALLED ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Headers:', req.headers);
  console.log('Query:', req.query);
  console.log('Body:', req.body);
  
  // Handle CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Import storage dynamically to avoid issues with module resolution
    const { storage } = await import('../server/storage.ts');
    const { insertPreferenceSchema } = await import('../shared/schema.ts');
    const { logDeviceOperation } = await import('../server/utils/safe-logger.ts');
    const { log } = await import('../server/simple-logger.ts');

    console.log('Modules imported successfully');

    if (req.method === 'GET') {
      try {
        const deviceId = req.query.deviceId || req.cookies?.deviceId;
        console.log('GET request for deviceId:', deviceId);
        
        if (!deviceId) {
          return res.status(400).json({ error: 'Device ID is required' });
        }

        const preferences = await storage.getPreferencesByDeviceId(deviceId);
        console.log('Retrieved preferences:', preferences);
        
        await logDeviceOperation(deviceId, 'preferences_get', { 
          found: preferences ? 'yes' : 'no',
          count: preferences ? 1 : 0 
        });
        
        return res.status(200).json({ 
          preferences: preferences || null,
          deviceId: deviceId 
        });
        
      } catch (error) {
        console.error('GET preferences error:', error);
        return res.status(500).json({ error: 'Failed to retrieve preferences' });
      }
    }

    if (req.method === 'POST') {
      try {
        console.log('POST request body:', req.body);
        
        const validation = insertPreferenceSchema.safeParse(req.body);
        
        if (!validation.success) {
          console.log('Validation failed:', validation.error);
          return res.status(400).json({ 
            error: 'Invalid request data',
            details: validation.error.errors 
          });
        }

        const preferenceData = validation.data;
        console.log('Saving preference for deviceId:', preferenceData.deviceId);
        
        // Generate preference ID
        const preferenceWithId = {
          ...preferenceData,
          id: uuidv4(),
          createdAt: new Date(),
          updatedAt: new Date()
        };

        console.log('Preference with ID:', preferenceWithId);
        
        const result = await storage.createPreference(preferenceWithId);
        console.log('Save result:', result);
        
        await logDeviceOperation(preferenceData.deviceId, 'preferences_save', { 
          success: 'yes'
        });
        
        log('Preference saved successfully', { 
          deviceId: preferenceData.deviceId
        });
        
        return res.status(200).json({ 
          success: true, 
          preference: result,
          message: 'Preference saved successfully' 
        });
        
      } catch (error) {
        console.error('POST preferences error:', error);
        
        // Try to log the device operation even on error
        try {
          const deviceId = req.body?.deviceId;
          if (deviceId) {
            await logDeviceOperation(deviceId, 'preferences_save', { 
              success: 'no',
              error: error.message 
            });
          }
        } catch (logError) {
          console.error('Failed to log error operation:', logError);
        }
        
        return res.status(500).json({ error: 'Failed to save preference' });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
    
  } catch (error) {
    console.error('Preferences API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
} 