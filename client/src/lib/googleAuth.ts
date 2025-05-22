/**
 * Google Authentication helper functions
 * Uses Google's JavaScript API for authentication
 */

import { gapi } from 'gapi-script';

// User info returned after successful authentication
export interface GoogleUser {
  id: string;
  email: string;
  name: string;
  picture: string;
}

// Initialize the Google API client
export function initializeGoogleAuth(callback?: () => void): void {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
  
  gapi.load('client:auth2', () => {
    gapi.client
      .init({
        clientId,
        scope: 'email profile',
      })
      .then(() => {
        // Listen for sign-in state changes
        const auth2 = gapi.auth2.getAuthInstance();
        
        // Check if user is already signed in
        if (auth2.isSignedIn.get()) {
          console.log('User is already signed in');
        }
        
        // Call the callback function if provided
        if (callback) {
          callback();
        }
      })
      .catch((error: any) => {
        console.error('Error initializing Google Auth:', error);
      });
  });
}

// Sign in with Google
export function signInWithGoogle(): Promise<GoogleUser | null> {
  return new Promise((resolve, reject) => {
    try {
      const auth2 = gapi.auth2.getAuthInstance();
      
      auth2.signIn()
        .then((googleUser) => {
          const profile = googleUser.getBasicProfile();
          const user = {
            id: profile.getId(),
            email: profile.getEmail(),
            name: profile.getName(),
            picture: profile.getImageUrl()
          };
          
          resolve(user);
        })
        .catch((error) => {
          console.error('Google sign in error:', error);
          reject(error);
        });
    } catch (error) {
      console.error('Error accessing Google Auth instance:', error);
      reject(error);
    }
  });
}

// Sign out from Google
export function signOutFromGoogle(): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const auth2 = gapi.auth2.getAuthInstance();
      
      auth2.signOut()
        .then(() => {
          console.log('User signed out from Google');
          resolve();
        })
        .catch((error) => {
          console.error('Google sign out error:', error);
          reject(error);
        });
    } catch (error) {
      console.error('Error accessing Google Auth instance:', error);
      reject(error);
    }
  });
}

// Check if user is signed in
export function isSignedInWithGoogle(): boolean {
  try {
    const auth2 = gapi.auth2.getAuthInstance();
    return auth2.isSignedIn.get();
  } catch (error) {
    console.error('Error checking if user is signed in:', error);
    return false;
  }
}

// Get current user info if signed in
export function getCurrentGoogleUser(): GoogleUser | null {
  try {
    const auth2 = gapi.auth2.getAuthInstance();
    
    if (auth2.isSignedIn.get()) {
      const googleUser = auth2.currentUser.get();
      const profile = googleUser.getBasicProfile();
      
      return {
        id: profile.getId(),
        email: profile.getEmail(),
        name: profile.getName(),
        picture: profile.getImageUrl()
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}