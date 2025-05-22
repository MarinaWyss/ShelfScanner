import React, { useEffect, useRef, useState } from 'react';
import { useIsMobile } from '../../hooks/use-mobile';

// App IDs from your Google AdMob account
// These will be used when migrating to React Native
const appIds = {
  // Your actual App IDs (stored as environment secrets)
  android: 'ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY', // Replace with your actual Android App ID
  ios: 'ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY', // Replace with your actual iOS App ID
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
      
      // Create ad content safely without innerHTML
      const adContent = document.createElement('div');
      
      const container = document.createElement('div');
      
      const titleDiv = document.createElement('div');
      titleDiv.style.fontWeight = 'bold';
      titleDiv.style.marginBottom = '2px';
      titleDiv.textContent = 'Google AdMob Banner';
      
      const idDiv = document.createElement('div');
      idDiv.style.fontSize = '10px';
      idDiv.textContent = getAdUnitId('banner', platform);
      
      container.appendChild(titleDiv);
      container.appendChild(idDiv);
      adContent.appendChild(container);
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
        
        // Add content to the overlay safely without innerHTML
        const container = document.createElement('div');
        container.style.background = '#444';
        container.style.padding = '20px';
        container.style.borderRadius = '10px';
        container.style.textAlign = 'center';
        container.style.maxWidth = '80%';
        
        const title = document.createElement('h2');
        title.style.marginTop = '0';
        title.style.color = 'white';
        title.textContent = 'Interstitial Ad';
        
        const description = document.createElement('p');
        description.textContent = `This is a placeholder for an AdMob interstitial ad that will appear on ${platform}.`;
        
        const idInfo = document.createElement('p');
        idInfo.style.fontSize = '12px';
        idInfo.style.color = '#ccc';
        idInfo.textContent = `Ad Unit ID: ${getAdUnitId('interstitial', platform)}`;
        
        const closeBtn = document.createElement('button');
        closeBtn.id = 'close-ad-btn';
        closeBtn.style.background = '#2196F3';
        closeBtn.style.border = 'none';
        closeBtn.style.color = 'white';
        closeBtn.style.padding = '8px 16px';
        closeBtn.style.marginTop = '16px';
        closeBtn.style.borderRadius = '4px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.textContent = 'Close Ad (3)';
        
        container.appendChild(title);
        container.appendChild(description);
        container.appendChild(idInfo);
        container.appendChild(closeBtn);
        overlay.appendChild(container);
        
        document.body.appendChild(overlay);
        
        // Add a countdown to the close button
        const closeBtnElement = document.getElementById('close-ad-btn');
        let countdown = 3;
        
        const countdownInterval = setInterval(() => {
          countdown--;
          if (closeBtnElement) {
            closeBtnElement.textContent = `Close Ad (${countdown})`;
          }
          
          if (countdown <= 0) {
            clearInterval(countdownInterval);
            if (closeBtnElement) {
              closeBtnElement.textContent = 'Close Ad';
            }
          }
        }, 1000);
        
        // Add click event to close button
        if (closeBtnElement) {
          closeBtnElement.addEventListener('click', () => {
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
        
        // Add content to the overlay safely without innerHTML
        const container = document.createElement('div');
        container.style.background = '#444';
        container.style.padding = '20px';
        container.style.borderRadius = '10px';
        container.style.textAlign = 'center';
        container.style.maxWidth = '80%';
        
        const title = document.createElement('h2');
        title.style.marginTop = '0';
        title.style.color = 'white';
        title.textContent = 'Rewarded Ad';
        
        const description = document.createElement('p');
        description.textContent = `This is a placeholder for an AdMob rewarded ad that will appear on ${platform}.`;
        
        const idInfo = document.createElement('p');
        idInfo.style.fontSize = '12px';
        idInfo.style.color = '#ccc';
        idInfo.textContent = `Ad Unit ID: ${getAdUnitId('rewarded', platform)}`;
        
        const rewardContainer = document.createElement('div');
        rewardContainer.style.margin = '16px 0';
        
        const rewardLabel = document.createElement('p');
        rewardLabel.textContent = 'Watch to receive:';
        
        const rewardAmount = document.createElement('p');
        rewardAmount.style.fontSize = '18px';
        rewardAmount.style.fontWeight = 'bold';
        rewardAmount.style.color = 'gold';
        rewardAmount.textContent = '10 Coins';
        
        rewardContainer.appendChild(rewardLabel);
        rewardContainer.appendChild(rewardAmount);
        
        const watchBtn = document.createElement('button');
        watchBtn.id = 'watch-ad-btn';
        watchBtn.style.background = '#4CAF50';
        watchBtn.style.border = 'none';
        watchBtn.style.color = 'white';
        watchBtn.style.padding = '8px 16px';
        watchBtn.style.marginTop = '8px';
        watchBtn.style.borderRadius = '4px';
        watchBtn.style.cursor = 'pointer';
        watchBtn.textContent = 'Watch Ad (5)';
        
        const skipBtn = document.createElement('button');
        skipBtn.id = 'skip-ad-btn';
        skipBtn.style.background = '#F44336';
        skipBtn.style.border = 'none';
        skipBtn.style.color = 'white';
        skipBtn.style.padding = '8px 16px';
        skipBtn.style.marginTop = '8px';
        skipBtn.style.marginLeft = '8px';
        skipBtn.style.borderRadius = '4px';
        skipBtn.style.cursor = 'pointer';
        skipBtn.textContent = 'Skip (No Reward)';
        
        container.appendChild(title);
        container.appendChild(description);
        container.appendChild(idInfo);
        container.appendChild(rewardContainer);
        container.appendChild(watchBtn);
        container.appendChild(skipBtn);
        overlay.appendChild(container);
        
        document.body.appendChild(overlay);
        
        // Add a countdown to the watch button
        const watchBtnElement = document.getElementById('watch-ad-btn');
        const skipBtnElement = document.getElementById('skip-ad-btn');
        let countdown = 5;
        
        const countdownInterval = setInterval(() => {
          countdown--;
          if (watchBtnElement) {
            watchBtnElement.textContent = `Watch Ad (${countdown})`;
          }
          
          if (countdown <= 0) {
            clearInterval(countdownInterval);
            if (watchBtnElement) {
              watchBtnElement.textContent = 'Collect Reward';
            }
          }
        }, 1000);
        
        // Add click event to watch button
        if (watchBtnElement) {
          watchBtnElement.addEventListener('click', () => {
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
        if (skipBtnElement) {
          skipBtnElement.addEventListener('click', () => {
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
  // Disabled AdMob initialization since we're using AdSense for web
  return;
}

export default {
  AdMobBanner,
  useInterstitialAd,
  useRewardedAd,
  initializeAdMob,
};