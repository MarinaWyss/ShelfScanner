import React, { createContext, useContext, useState, useEffect } from 'react';
import { getDeviceId, syncDeviceIdCookie } from '@/lib/deviceId';
import { 
  initializeGoogleAuth, 
  signInWithGoogle, 
  signOutFromGoogle, 
  getCurrentGoogleUser, 
  isSignedInWithGoogle,
  type GoogleUser
} from '@/lib/googleAuth';

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
  const [googleInitialized, setGoogleInitialized] = useState(false);

  // Initialize Google Auth on mount
  useEffect(() => {
    // Initialize Google Auth API
    initializeGoogleAuth(() => {
      setGoogleInitialized(true);
      
      // Check if user is already signed in with Google
      if (isSignedInWithGoogle()) {
        const googleUser = getCurrentGoogleUser();
        if (googleUser) {
          setUser({
            id: googleUser.id,
            name: googleUser.name,
            email: googleUser.email,
            picture: googleUser.picture,
            isGoogleAccount: true
          });
        }
      }
      
      setIsLoading(false);
    });
    
    // Get device ID and sync with cookie
    const currentDeviceId = getDeviceId();
    setDeviceId(currentDeviceId);
    syncDeviceIdCookie();
  }, []);

  // Login with Google
  const loginWithGoogle = async () => {
    if (!googleInitialized) {
      console.error('Google Auth is not initialized yet');
      return;
    }
    
    try {
      setIsLoading(true);
      const googleUser = await signInWithGoogle();
      
      if (googleUser) {
        // Set user in state
        setUser({
          id: googleUser.id,
          name: googleUser.name,
          email: googleUser.email,
          picture: googleUser.picture,
          isGoogleAccount: true
        });
        
        // Merge data from device to user account
        // This would be implemented in a real app
      }
    } catch (error) {
      console.error('Error during Google login:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Logout function
  const logout = async () => {
    try {
      setIsLoading(true);
      
      if (user?.isGoogleAccount) {
        await signOutFromGoogle();
      }
      
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

// Custom hook for using the auth context
export const useAuth = () => useContext(AuthContext);