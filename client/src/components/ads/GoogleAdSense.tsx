import { useEffect, useRef, useState } from 'react';

interface GoogleAdSenseProps {
  adSlot?: string;
  adFormat?: 'auto' | 'rectangle' | 'horizontal' | 'vertical';
  adSize?: string;
  style?: React.CSSProperties;
  className?: string;
  responsive?: boolean;
}

declare global {
  interface Window {
    adsbygoogle: any[];
  }
}

// Get the publisher ID from environment variables
// Using import.meta.env for Vite's environment variables
const publisherId = import.meta.env.ADSENSE_PUBLISHER_ID || 'ca-pub-1234567890123456';

export default function GoogleAdSense({ 
  adSlot = '1234567890', 
  adFormat = 'auto',
  adSize,
  style = {}, 
  className = '',
  responsive = true
}: GoogleAdSenseProps) {
  const adRef = useRef<HTMLDivElement>(null);
  const [adLoaded, setAdLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Function to load the AdSense script if it's not already loaded
    const loadAdSenseScript = () => {
      const existingScript = document.getElementById('google-adsense-script');
      if (!existingScript) {
        const script = document.createElement('script');
        script.id = 'google-adsense-script';
        script.async = true;
        script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${publisherId}`;
        script.crossOrigin = 'anonymous';
        script.onload = () => {
          console.log('Google AdSense script loaded');
          initializeAd();
        };
        script.onerror = (err) => {
          console.error('Error loading Google AdSense script:', err);
          setError('Failed to load AdSense script');
        };
        document.head.appendChild(script);
      } else {
        // If script already exists, just initialize the ad
        initializeAd();
      }
    };

    // Function to initialize the ad after script is loaded
    const initializeAd = () => {
      try {
        if (typeof window.adsbygoogle !== 'undefined' && adRef.current) {
          // Push the ad to AdSense
          (window.adsbygoogle = window.adsbygoogle || []).push({});
          setAdLoaded(true);
        }
      } catch (err) {
        console.error('Error initializing AdSense ad:', err);
        setError('Failed to initialize ad');
      }
    };

    // Load the AdSense script
    loadAdSenseScript();

    // Cleanup function for component unmounting
    return () => {
      // Any cleanup if needed
    };
  }, [adSlot]);

  // Base style for the ad container
  const containerStyle = {
    overflow: 'hidden',
    ...style
  };

  return (
    <div className={`ad-container ${className}`} ref={adRef}>
      {error ? (
        <div className="ad-error bg-gray-100 border border-gray-300 rounded text-xs text-center p-3 h-full flex items-center justify-center">
          <p className="text-gray-500">{process.env.NODE_ENV === 'development' ? `Ad error: ${error}` : 'Advertisement'}</p>
        </div>
      ) : (
        <ins
          className="adsbygoogle"
          style={{
            display: 'block',
            textAlign: 'center',
            ...containerStyle
          }}
          data-ad-client={publisherId}
          data-ad-slot={adSlot}
          data-ad-format={adFormat}
          data-ad-size={adSize}
          data-full-width-responsive={responsive ? 'true' : 'false'}
        />
      )}
    </div>
  );
}