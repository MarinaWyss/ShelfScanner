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
  // Add comprehensive logging for debugging
  console.log('=== PREFERENCES API CALLED ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Cookies:', req.cookies);
  console.log('Body:', req.body);
  console.log('Environment:', process.env.NODE_ENV);
  console.log('Database URL exists:', !!process.env.DATABASE_URL);
  
  // Handle CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    return res.status(200).end();
  }

  try {
    console.log('Starting preferences processing...');
    
    // Extract device ID from cookies or generate new one
    let deviceId = req.cookies?.deviceId;
    console.log('Initial deviceId from cookies:', deviceId);
    
    if (!deviceId) {
      deviceId = uuidv4();
      console.log('Generated new deviceId:', deviceId);
      // Set cookie
      res.setHeader('Set-Cookie', `deviceId=${deviceId}; Path=/; Max-Age=${365 * 24 * 60 * 60}; SameSite=Strict; ${process.env.NODE_ENV === 'production' ? 'Secure;' : ''}`);
    }

    console.log('Using deviceId:', deviceId);

    if (req.method === 'GET') {
      console.log('Processing GET request for preferences');
      // Get preferences for this device
      logDeviceOperation('Getting preferences', deviceId);
      
      console.log('Calling storage.getPreferencesByDeviceId...');
      const preferences = await storage.getPreferencesByDeviceId(deviceId);
      console.log('Retrieved preferences:', preferences);
      
      if (!preferences) {
        console.log('No preferences found, returning 404');
        return res.status(404).json({ message: 'Preferences not found' });
      }
      
      console.log('Returning preferences successfully');
      return res.status(200).json(preferences);
    }
    
    if (req.method === 'POST') {
      console.log('Processing POST request for preferences');
      // For backward compatibility we still include userId but use deviceId as primary identifier
      const userId = 1;
      
      console.log('Validating request body...');
      // Validate request body
      const validatedData = insertPreferenceSchema.parse({
        ...req.body,
        userId,
        deviceId
      });
      console.log('Validated data:', validatedData);
      
      console.log('Checking for existing preferences...');
      // Check if preferences already exist for this specific device
      const existingPreferences = await storage.getPreferencesByDeviceId(deviceId);
      console.log('Existing preferences:', existingPreferences);
      
      let preferences;
      if (existingPreferences) {
        console.log('Updating existing preferences...');
        // Update existing preferences
        preferences = await storage.updatePreference(existingPreferences.id, validatedData);
        console.log('Updated preferences:', preferences);
      } else {
        console.log('Creating new preferences...');
        // Create brand new preferences for this device
        preferences = await storage.createPreference(validatedData);
        console.log('Created preferences:', preferences);
      }
      
      logDeviceOperation('Saved preferences', deviceId);
      
      console.log('Returning success response');
      return res.status(201).json(preferences);
    }
    
    console.log('Method not allowed:', req.method);
    return res.status(405).json({ message: 'Method not allowed' });
  } catch (error) {
    console.error('=== ERROR IN PREFERENCES API ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('==============================');
    
    log(`Error handling preferences: ${error instanceof Error ? error.message : String(error)}`, 'api-error');
    return res.status(500).json({ 
      message: 'Error handling preferences',
      error: error instanceof Error ? error.message : String(error),
      debug: {
        type: error.constructor.name,
        stack: error.stack
      }
    });
  }
}; 