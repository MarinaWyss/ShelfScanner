/* eslint-disable no-undef */
// Import using ES modules for Vercel compatibility
import 'dotenv/config';
import { v4 as uuidv4 } from 'uuid';

/**
 * API handler for preferences
 * @param {Request} request - The request object
 */
export default async function handler(request) {
  // Add comprehensive logging for debugging
  console.log('=== PREFERENCES API CALLED ===');
  console.log('Method:', request.method);
  console.log('URL:', request.url);
  console.log('Headers:', Object.fromEntries(request.headers.entries()));
  
  // Handle CORS
  const headers = {
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version',
    'Content-Type': 'application/json'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers });
  }

  try {
    // Dynamic imports for server modules
    const { storage } = await import('../server/storage.js');
    const { insertPreferenceSchema } = await import('../shared/schema.js');
    const { logDeviceOperation } = await import('../server/utils/safe-logger.js');
    const { log } = await import('../server/simple-logger.js');

    // Parse request body for POST/PUT requests
    let body = null;
    if (request.method === 'POST' || request.method === 'PUT') {
      try {
        body = await request.json();
        console.log('Request body:', body);
      } catch (error) {
        console.error('Failed to parse request body:', error);
        return new Response(
          JSON.stringify({ error: 'Invalid JSON in request body' }),
          { status: 400, headers }
        );
      }
    }

    // Extract device ID from cookies or body
    const cookieHeader = request.headers.get('cookie') || '';
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map(c => {
        const [key, value] = c.trim().split('=');
        return [key, value];
      }).filter(([key]) => key)
    );
    
    const deviceId = body?.deviceId || cookies.deviceId;
    console.log('Device ID:', deviceId);

    if (request.method === 'GET') {
      if (!deviceId) {
        console.log('No device ID provided for GET request');
        return new Response(
          JSON.stringify({ preferences: [] }),
          { status: 200, headers }
        );
      }

      try {
        const preferences = await storage.getPreferencesByDeviceId(deviceId);
        console.log('Retrieved preferences:', preferences);
        
        await logDeviceOperation(deviceId, 'get_preferences', { 
          count: preferences.length 
        });
        
        return new Response(
          JSON.stringify({ preferences }),
          { status: 200, headers }
        );
      } catch (error) {
        console.error('Error retrieving preferences:', error);
        await logDeviceOperation(deviceId, 'get_preferences_error', { 
          error: error.message 
        });
        
        return new Response(
          JSON.stringify({ error: 'Failed to retrieve preferences' }),
          { status: 500, headers }
        );
      }
    }

    if (request.method === 'POST') {
      if (!body) {
        return new Response(
          JSON.stringify({ error: 'Request body is required' }),
          { status: 400, headers }
        );
      }

      // Validate the request body
      try {
        const validatedData = insertPreferenceSchema.parse(body);
        console.log('Validated preference data:', validatedData);

        // Generate ID if not provided
        if (!validatedData.id) {
          validatedData.id = uuidv4();
        }

        // Ensure device ID is set
        if (!validatedData.deviceId && deviceId) {
          validatedData.deviceId = deviceId;
        }

        if (!validatedData.deviceId) {
          return new Response(
            JSON.stringify({ error: 'Device ID is required' }),
            { status: 400, headers }
          );
        }

        const savedPreference = await storage.savePreference(validatedData);
        console.log('Saved preference:', savedPreference);
        
        await logDeviceOperation(validatedData.deviceId, 'save_preference', {
          preferenceId: savedPreference.id,
          type: validatedData.type
        });
        
        log.info('Preference saved successfully', {
          deviceId: validatedData.deviceId,
          preferenceId: savedPreference.id,
          type: validatedData.type
        });

        return new Response(
          JSON.stringify({ 
            message: 'Preference saved successfully', 
            preference: savedPreference 
          }),
          { status: 201, headers }
        );
      } catch (validationError) {
        console.error('Validation error:', validationError);
        
        if (deviceId) {
          await logDeviceOperation(deviceId, 'save_preference_validation_error', {
            error: validationError.message
          });
        }
        
        return new Response(
          JSON.stringify({ 
            error: 'Validation failed', 
            details: validationError.message 
          }),
          { status: 400, headers }
        );
      }
    }

    // Method not allowed
    return new Response(
      JSON.stringify({ error: `Method ${request.method} not allowed` }),
      { status: 405, headers }
    );

  } catch (error) {
    console.error('Unexpected error in preferences API:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      }),
      { status: 500, headers }
    );
  }
} 