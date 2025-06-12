/* eslint-disable no-undef */
// Import using CommonJS require for Vercel compatibility
require('dotenv/config');
require('@vercel/node'); // Import but don't assign to variables
const { storage } = require('../server/storage');
const { insertPreferenceSchema } = require('../shared/schema');
const { v4: uuidv4 } = require('uuid');
const { logDeviceOperation } = require('../server/utils/safe-logger');
const { log } = require('../server/simple-logger');

/**
 * API handler for preferences
 * @param {import('@vercel/node').VercelRequest} req - The request object
 * @param {import('@vercel/node').VercelResponse} res - The response object
 */
module.exports = async function handler(req, res) {
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
      // Get preferences for this device
      logDeviceOperation('Getting preferences', deviceId);
      const preferences = await storage.getPreferencesByDeviceId(deviceId);
      
      if (!preferences) {
        return res.status(404).json({ message: 'Preferences not found' });
      }
      
      return res.status(200).json(preferences);
    }
    
    if (req.method === 'POST') {
      // For backward compatibility we still include userId but use deviceId as primary identifier
      const userId = 1;
      
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
      
      logDeviceOperation('Saved preferences', deviceId);
      
      return res.status(201).json(preferences);
    }
    
    return res.status(405).json({ message: 'Method not allowed' });
  } catch (error) {
    log(`Error handling preferences: ${error instanceof Error ? error.message : String(error)}`, 'api-error');
    return res.status(500).json({ 
      message: 'Error handling preferences',
      error: error instanceof Error ? error.message : String(error)
    });
  }
}; 