import React, { createContext, useContext, useState, useEffect } from 'react';
import { getDeviceId, syncDeviceIdCookie } from '@/lib/deviceId';

// Device context interface for device ID persistence
interface DeviceContextType {
  deviceId: string;
  isLoading: boolean;
}

// Create context with default values
const DeviceContext = createContext<DeviceContextType>({
  deviceId: '',
  isLoading: true,
});

// Provider component
export const DeviceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [deviceId, setDeviceId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  // Initialize device ID on mount
  useEffect(() => {
    // Get device ID and sync with cookie
    const currentDeviceId = getDeviceId();
    setDeviceId(currentDeviceId);
    syncDeviceIdCookie();
    setIsLoading(false);
  }, []);

  return (
    <DeviceContext.Provider
      value={{
        deviceId,
        isLoading
      }}
    >
      {children}
    </DeviceContext.Provider>
  );
};

// Custom hook for using the device context
export const useDevice = () => useContext(DeviceContext);