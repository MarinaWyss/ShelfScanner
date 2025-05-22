import React, { createContext, useContext, useState, useEffect } from 'react';
import { getDeviceId, syncDeviceIdCookie } from '@/lib/deviceId';

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

// Provider component
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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

  // Login with Google
  const loginWithGoogle = () => {
    // Redirect to Google OAuth endpoint
    window.location.href = '/api/auth/google';
  };

  // Logout function
  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
    } catch (error) {
      console.error('Error logging out:', error);
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

// Custom hook for using the auth context
export const useAuth = () => useContext(AuthContext);