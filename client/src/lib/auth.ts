/**
 * Authentication utilities
 * Handles Google authentication and session management
 */

import { TokenResponse } from '@react-oauth/google';

// Define user info type returned from Google Auth
export interface GoogleUserInfo {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

// Process Google token response and extract user info
export async function processGoogleToken(tokenResponse: TokenResponse): Promise<GoogleUserInfo> {
  try {
    // Send the token to our backend to verify and get user info
    const response = await fetch('/api/auth/google/callback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        access_token: tokenResponse.access_token,
        token_type: tokenResponse.token_type 
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to authenticate with Google');
    }

    return await response.json();
  } catch (error) {
    console.error('Error processing Google token:', error);
    throw error;
  }
}

// Create a new user session by merging device data
export async function mergeDeviceData(deviceId: string, userId: string): Promise<void> {
  try {
    await fetch('/api/auth/migrate-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ deviceId, userId }),
    });
  } catch (error) {
    console.error('Error migrating data:', error);
  }
}