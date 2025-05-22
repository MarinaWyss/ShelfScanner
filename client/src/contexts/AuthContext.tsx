import React, { createContext, useContext, useState, useEffect } from 'react';
import { getDeviceId, syncDeviceIdCookie } from '@/lib/deviceId';
import { GoogleOAuthProvider, useGoogleLogin, googleLogout } from '@react-oauth/google';
import { processGoogleToken, mergeDeviceData, type GoogleUserInfo } from '@/lib/auth';

// Define the User type
interface User {
  id: string;
  name?: string;
  email?: string;
  picture?: string;
  isGoogleAccount: boolean;
}

// Auth context interface
interface AuthContextType {
  user: User | null;
  deviceId: string;
  isLoading: boolean;
  loginWithGoogle: () => void;
  logout: () => void;
}

// Create context with default values
const AuthContext = createContext<AuthContextType>({
  user: null,
  deviceId: '',
  isLoading: true,
  loginWithGoogle: () => {},
  logout: () => {},
});

// Inner provider component (gets wrapped by GoogleOAuthProvider)
const AuthProviderInner: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [deviceId, setDeviceId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  // Initialize on mount
  useEffect(() => {
    // Get device ID and sync with cookie
    const currentDeviceId = getDeviceId();
    setDeviceId(currentDeviceId);
    syncDeviceIdCookie();
    
    // Check if user is already logged in via Google
    checkUserSession();
  }, []);

  // Check if user has an active session
  const checkUserSession = async () => {
    try {
      const response = await fetch('/api/auth/check-session');
      
      if (response.ok) {
        const userData = await response.json();
        if (userData) {
          setUser({
            id: userData.id,
            name: userData.name,
            email: userData.email,
            picture: userData.picture,
            isGoogleAccount: true
          });
        }
      }
    } catch (error) {
      console.error('Error checking user session:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Setup Google login using the react-oauth library
  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        setIsLoading(true);
        console.log("Google login successful", tokenResponse);
        
        // For now, create a simplified user without backend validation
        // This allows the app to work in development mode
        setUser({
          id: `google-user-${Date.now()}`,
          name: "Google User",
          email: "user@example.com",
          picture: "https://via.placeholder.com/150",
          isGoogleAccount: true
        });
        
      } catch (error) {
        console.error('Error during Google login:', error);
      } finally {
        setIsLoading(false);
      }
    },
    onError: (error) => {
      console.error('Google login error:', error);
      setIsLoading(false);
    },
    flow: 'implicit',
  });

  // Login with Google
  const loginWithGoogle = () => {
    setIsLoading(true);
    googleLogin();
  };

  // Logout function
  const logout = async () => {
    try {
      setIsLoading(true);
      await fetch('/api/auth/logout', { method: 'POST' });
      googleLogout();
      setUser(null);
    } catch (error) {
      console.error('Error logging out:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        deviceId,
        isLoading,
        loginWithGoogle,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// Main provider component that wraps with Google OAuth provider
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
  
  return (
    <GoogleOAuthProvider clientId={clientId}>
      <AuthProviderInner>{children}</AuthProviderInner>
    </GoogleOAuthProvider>
  );
};

// Custom hook for using the auth context
export const useAuth = () => useContext(AuthContext);