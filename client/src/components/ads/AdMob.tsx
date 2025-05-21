import React, { useEffect, useRef, useState } from 'react';
import { useIsMobile } from '../../hooks/use-mobile';

// App IDs - these will be fetched from the server API
const defaultAppIds = {
  android: 'ca-app-pub-0000000000000000~0000000000',
  ios: 'ca-app-pub-0000000000000000~0000000000'
};

// Define your ad unit IDs here
// Using test IDs for development and placeholders for production
// Production ad units will need to be created in your AdMob account
const adUnitIds = {
  // Test IDs for development - these are Google's official test IDs
  test: {
    banner: {
      android: 'ca-app-pub-3940256099942544/6300978111',
      ios: 'ca-app-pub-3940256099942544/2934735716'
    },
    interstitial: {
      android: 'ca-app-pub-3940256099942544/1033173712',
      ios: 'ca-app-pub-3940256099942544/4411468910'
    },
    rewarded: {
      android: 'ca-app-pub-3940256099942544/5224354917',
      ios: 'ca-app-pub-3940256099942544/1712485313'
    }
  },
  // Production IDs - placeholders until specific ad units are created
  // These will need to be updated with actual ad unit IDs once created in AdMob
  prod: {
    banner: {
      android: 'banner-ad-unit-id-for-android', // Replace when creating ad units
      ios: 'banner-ad-unit-id-for-ios' // Replace when creating ad units
    },
    interstitial: {
      android: 'interstitial-ad-unit-id-for-android', // Replace when creating ad units
      ios: 'interstitial-ad-unit-id-for-ios' // Replace when creating ad units
    },
    rewarded: {
      android: 'rewarded-ad-unit-id-for-android', // Replace when creating ad units
      ios: 'rewarded-ad-unit-id-for-ios' // Replace when creating ad units
    }
  }
};

// Use test IDs for development, production IDs for production
const isDev = import.meta.env.DEV;
const getAdUnitId = (adType: 'banner' | 'interstitial' | 'rewarded', platform: 'android' | 'ios') => {
  const envIds = isDev ? adUnitIds.test : adUnitIds.prod;
  return envIds[adType][platform];
};

// Define banner sizes that match Google AdMob options
const BannerSizes = {
  BANNER: { width: 320, height: 50 },            // Standard banner
  LARGE_BANNER: { width: 320, height: 100 },     // Large banner
  MEDIUM_RECTANGLE: { width: 300, height: 250 }, // IAB medium rectangle
  FULL_BANNER: { width: 468, height: 60 },       // IAB full-size banner
  LEADERBOARD: { width: 728, height: 90 },       // IAB leaderboard
  ADAPTIVE_BANNER: { width: '100%', height: 'auto' } // Adaptive banner
};

// Interface for banner props
interface AdMobBannerProps {
  size?: keyof typeof BannerSizes;
  className?: string;
  platform?: 'android' | 'ios';
  position?: 'top' | 'bottom';
}

// This component is a placeholder for the mobile implementation
// It simulates how the actual AdMob banner will look when implemented in React Native
export function AdMobBanner({ 
  size = 'BANNER', 
  className = '',
  platform = 'android',
  position = 'bottom'
}: AdMobBannerProps) {
  const isMobile = useIsMobile();
  const adContainerRef = useRef<HTMLDivElement>(null);
  const [adError, setAdError] = useState<string | null>(null);
  
  // Choose appropriate size based on device
  const sizeKey = (!isMobile && size === 'BANNER') ? 'LEADERBOARD' : size;
  const adSize = BannerSizes[sizeKey];

  useEffect(() => {
    // This is just a placeholder simulation
    // In the actual React Native implementation, you would:
    // 1. Import BannerAd and BannerAdSize from react-native-google-mobile-ads
    // 2. Use the actual component with proper ad unit IDs
    
    if (adContainerRef.current) {
      const adElement = adContainerRef.current;
      
      // Simulate ad appearance in development
      adElement.style.backgroundColor = '#f0f0f0';
      adElement.style.border = '1px solid #ddd';
      adElement.style.display = 'flex';
      adElement.style.alignItems = 'center';
      adElement.style.justifyContent = 'center';
      adElement.style.color = '#666';
      adElement.style.fontWeight = '500';
      adElement.style.fontSize = '12px';
      
      // Add platform indicator
      const platformIndicator = document.createElement('div');
      platformIndicator.style.position = 'absolute';
      platformIndicator.style.top = '2px';
      platformIndicator.style.right = '4px';
      platformIndicator.style.fontSize = '10px';
      platformIndicator.style.color = '#999';
      platformIndicator.textContent = platform.toUpperCase();
      adElement.appendChild(platformIndicator);
      
      // Create ad content
      const adContent = document.createElement('div');
      adContent.innerHTML = `
        <div>
          <div style="font-weight: bold; margin-bottom: 2px;">
            Google AdMob Banner
          </div>
          <div style="font-size: 10px;">
            ${getAdUnitId('banner', platform)}
          </div>
        </div>
      `;
      adElement.appendChild(adContent);
    }
    
    return () => {
      // Cleanup if needed
    };
  }, [size, platform]);

  const containerStyle = {
    width: adSize.width,
    height: adSize.height,
    overflow: 'hidden',
    display: 'block',
    margin: '0 auto',
    position: 'relative' as const,
  };

  return (
    <div 
      ref={adContainerRef}
      className={`ad-container ${className}`} 
      style={containerStyle}
      data-ad-type="banner"
      data-ad-platform={platform}
      data-ad-position={position}
    >
      {/* AdMob banner will be inserted here when migrated to React Native */}
    </div>
  );
}

// Interface for interstitial ad props
interface AdMobInterstitialProps {
  platform?: 'android' | 'ios';
  onAdDismissed?: () => void;
  onAdLoaded?: () => void;
}

// This hook is a placeholder for the actual implementation in React Native
export function useInterstitialAd({ 
  platform = 'android',
  onAdDismissed,
  onAdLoaded 
}: AdMobInterstitialProps = {}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    // In the actual React Native implementation:
    // 1. Import InterstitialAd from react-native-google-mobile-ads
    // 2. Create and load the ad
    // 3. Set up event listeners for loaded, closed, etc.
    
    console.log(`[AdMob Placeholder] Loading interstitial ad for ${platform}...`);
    console.log(`[AdMob Placeholder] Ad unit ID: ${getAdUnitId('interstitial', platform)}`);
    
    // Simulate ad loading
    const timer = setTimeout(() => {
      setLoaded(true);
      console.log('[AdMob Placeholder] Interstitial ad loaded');
      onAdLoaded && onAdLoaded();
    }, 1000);
    
    return () => {
      clearTimeout(timer);
    };
  }, [platform, onAdLoaded]);
  
  const showAd = async () => {
    if (loaded) {
      try {
        console.log('[AdMob Placeholder] Showing interstitial ad');
        
        // Simulate ad display and closure
        // Create a fullscreen overlay to simulate the ad
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        overlay.style.zIndex = '9999';
        overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.color = 'white';
        
        // Add content to the overlay
        overlay.innerHTML = `
          <div style="background: #444; padding: 20px; border-radius: 10px; text-align: center; max-width: 80%;">
            <h2 style="margin-top: 0; color: white;">Interstitial Ad</h2>
            <p>This is a placeholder for an AdMob interstitial ad that will appear on ${platform}.</p>
            <p style="font-size: 12px; color: #ccc;">Ad Unit ID: ${getAdUnitId('interstitial', platform)}</p>
            <button id="close-ad-btn" style="background: #2196F3; border: none; color: white; padding: 8px 16px; margin-top: 16px; border-radius: 4px; cursor: pointer;">
              Close Ad (3)
            </button>
          </div>
        `;
        
        document.body.appendChild(overlay);
        
        // Add a countdown to the close button
        const closeBtn = document.getElementById('close-ad-btn');
        let countdown = 3;
        
        const countdownInterval = setInterval(() => {
          countdown--;
          if (closeBtn) {
            closeBtn.textContent = `Close Ad (${countdown})`;
          }
          
          if (countdown <= 0) {
            clearInterval(countdownInterval);
            if (closeBtn) {
              closeBtn.textContent = 'Close Ad';
            }
          }
        }, 1000);
        
        // Add click event to close button
        if (closeBtn) {
          closeBtn.addEventListener('click', () => {
            if (countdown <= 0) {
              document.body.removeChild(overlay);
              setLoaded(false);
              console.log('[AdMob Placeholder] Interstitial ad closed');
              onAdDismissed && onAdDismissed();
              
              // Load another ad
              setTimeout(() => {
                setLoaded(true);
                console.log('[AdMob Placeholder] New interstitial ad loaded');
                onAdLoaded && onAdLoaded();
              }, 1000);
            }
          });
        }
        
        return true;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error('[AdMob Placeholder] Error showing interstitial ad:', errorMessage);
        setError(errorMessage);
        return false;
      }
    } else {
      console.warn('[AdMob Placeholder] Interstitial ad not loaded yet');
      return false;
    }
  };
  
  return {
    isLoaded: loaded,
    error,
    showAd,
  };
}

// Interface for rewarded ad props
interface AdMobRewardedProps {
  platform?: 'android' | 'ios';
  onRewarded?: (type: string, amount: number) => void;
  onAdDismissed?: () => void;
  onAdLoaded?: () => void;
}

// This hook is a placeholder for the actual implementation in React Native
export function useRewardedAd({
  platform = 'android',
  onRewarded,
  onAdDismissed,
  onAdLoaded
}: AdMobRewardedProps = {}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    // In the actual React Native implementation:
    // 1. Import RewardedAd from react-native-google-mobile-ads
    // 2. Create and load the ad
    // 3. Set up event listeners for loaded, earned reward, etc.
    
    console.log(`[AdMob Placeholder] Loading rewarded ad for ${platform}...`);
    console.log(`[AdMob Placeholder] Ad unit ID: ${getAdUnitId('rewarded', platform)}`);
    
    // Simulate ad loading
    const timer = setTimeout(() => {
      setLoaded(true);
      console.log('[AdMob Placeholder] Rewarded ad loaded');
      onAdLoaded && onAdLoaded();
    }, 1500);
    
    return () => {
      clearTimeout(timer);
    };
  }, [platform, onAdLoaded]);
  
  const showAd = async () => {
    if (loaded) {
      try {
        console.log('[AdMob Placeholder] Showing rewarded ad');
        
        // Simulate ad display, user interaction, and reward
        // Create a fullscreen overlay to simulate the ad
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        overlay.style.zIndex = '9999';
        overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.color = 'white';
        
        // Add content to the overlay
        overlay.innerHTML = `
          <div style="background: #444; padding: 20px; border-radius: 10px; text-align: center; max-width: 80%;">
            <h2 style="margin-top: 0; color: white;">Rewarded Ad</h2>
            <p>This is a placeholder for an AdMob rewarded ad that will appear on ${platform}.</p>
            <p style="font-size: 12px; color: #ccc;">Ad Unit ID: ${getAdUnitId('rewarded', platform)}</p>
            <div style="margin: 16px 0;">
              <p>Watch to receive:</p>
              <p style="font-size: 18px; font-weight: bold; color: gold;">10 Coins</p>
            </div>
            <button id="watch-ad-btn" style="background: #4CAF50; border: none; color: white; padding: 8px 16px; margin-top: 8px; border-radius: 4px; cursor: pointer;">
              Watch Ad (5)
            </button>
            <button id="skip-ad-btn" style="background: #F44336; border: none; color: white; padding: 8px 16px; margin-top: 8px; margin-left: 8px; border-radius: 4px; cursor: pointer;">
              Skip (No Reward)
            </button>
          </div>
        `;
        
        document.body.appendChild(overlay);
        
        // Add a countdown to the watch button
        const watchBtn = document.getElementById('watch-ad-btn');
        const skipBtn = document.getElementById('skip-ad-btn');
        let countdown = 5;
        
        const countdownInterval = setInterval(() => {
          countdown--;
          if (watchBtn) {
            watchBtn.textContent = `Watch Ad (${countdown})`;
          }
          
          if (countdown <= 0) {
            clearInterval(countdownInterval);
            if (watchBtn) {
              watchBtn.textContent = 'Collect Reward';
            }
          }
        }, 1000);
        
        // Add click event to watch button
        if (watchBtn) {
          watchBtn.addEventListener('click', () => {
            if (countdown <= 0) {
              // User gets the reward
              onRewarded && onRewarded('coins', 10);
              console.log('[AdMob Placeholder] User earned reward: 10 coins');
              
              document.body.removeChild(overlay);
              setLoaded(false);
              console.log('[AdMob Placeholder] Rewarded ad closed');
              onAdDismissed && onAdDismissed();
              
              // Load another ad
              setTimeout(() => {
                setLoaded(true);
                console.log('[AdMob Placeholder] New rewarded ad loaded');
                onAdLoaded && onAdLoaded();
              }, 1500);
            }
          });
        }
        
        // Add click event to skip button
        if (skipBtn) {
          skipBtn.addEventListener('click', () => {
            console.log('[AdMob Placeholder] User skipped the rewarded ad (no reward given)');
            document.body.removeChild(overlay);
            setLoaded(false);
            onAdDismissed && onAdDismissed();
            
            // Load another ad
            setTimeout(() => {
              setLoaded(true);
              onAdLoaded && onAdLoaded();
            }, 1500);
          });
        }
        
        return true;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error('[AdMob Placeholder] Error showing rewarded ad:', errorMessage);
        setError(errorMessage);
        return false;
      }
    } else {
      console.warn('[AdMob Placeholder] Rewarded ad not loaded yet');
      return false;
    }
  };
  
  return {
    isLoaded: loaded,
    error,
    showAd,
  };
}

// Helper function to initialize the Google AdMob SDK
// This is a placeholder that will be replaced with actual initialization code
// when migrating to React Native
export function initializeAdMob() {
  console.log('[AdMob Placeholder] Initializing AdMob...');
  console.log('[AdMob Placeholder] Note: Full implementation will be available after React Native migration');
  console.log('[AdMob Placeholder] Android Banner ID:', getAdUnitId('banner', 'android'));
  console.log('[AdMob Placeholder] iOS Banner ID:', getAdUnitId('banner', 'ios'));
}

export default {
  AdMobBanner,
  useInterstitialAd,
  useRewardedAd,
  initializeAdMob,
};