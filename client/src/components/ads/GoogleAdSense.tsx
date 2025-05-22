import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

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

// Will store the publisher ID once fetched
let publisherId = '';

// Function to fetch the AdSense publisher ID
async function fetchPublisherId() {
  if (publisherId) return publisherId;
  
  try {
    const response = await axios.get('/api/config/ads');
    if (response.data && response.data.adsense && response.data.adsense.publisherId) {
      publisherId = response.data.adsense.publisherId;
      console.log('AdSense publisher ID fetched successfully');
    } else {
      console.error('Failed to fetch AdSense publisher ID - data format incorrect');
    }
  } catch (error) {
    console.error('Error fetching AdSense publisher ID:', error);
  }
  
  return publisherId || 'ca-pub-1234567890123456';
}

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
    let isMounted = true;
    
    // Function to load the AdSense script if it's not already loaded
    const loadAdSenseScript = async () => {
      // First fetch the publisher ID if not already fetched
      const pubId = await fetchPublisherId();
      
      if (!isMounted) return;
      
      const existingScript = document.getElementById('google-adsense-script');
      if (!existingScript) {
        const script = document.createElement('script');
        script.id = 'google-adsense-script';
        script.async = true;
        script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${pubId}`;
        script.crossOrigin = 'anonymous';
        script.onload = () => {
          if (!isMounted) return;
          console.log('Google AdSense script loaded successfully');
          initializeAd();
        };
        script.onerror = (err) => {
          if (!isMounted) return;
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
          console.log('AdSense ad initialized');
        }
      } catch (err) {
        if (!isMounted) return;
        console.error('Error initializing AdSense ad:', err);
        setError('Failed to initialize ad');
      }
    };

    // Load the AdSense script
    loadAdSenseScript();

    // Cleanup function for component unmounting
    return () => {
      isMounted = false;
    };
  }, [adSlot]);

  // Base style for the ad container
  const containerStyle = {
    overflow: 'hidden',
    ...style
  };

  // In development mode, we'll show a placeholder instead of real ads
  // This helps with testing the UI layout without needing to load actual ads
  if (import.meta.env.MODE === 'development') {
    return (
      <div 
        className={`ad-container ${className} bg-gray-100 border border-gray-200 flex items-center justify-center`} 
        style={{
          minHeight: adSize === '728x90' ? '90px' : adSize === '300x250' ? '250px' : '100px',
          ...containerStyle
        }}
      >
        <div className="text-center p-2">
          <p className="text-gray-500 text-sm">Advertisement</p>
          <p className="text-xs text-gray-400">({adSize || adFormat} ad will appear here)</p>
          <p className="text-xs text-gray-400 mt-1">Publisher ID: {publisherId || 'loading...'}</p>
        </div>
      </div>
    );
  }

  // In production, return the actual AdSense component
  return (
    <div className={`ad-container ${className}`} ref={adRef}>
      {error ? (
        <div className="ad-error bg-gray-100 border border-gray-300 rounded text-xs text-center p-3 h-full flex items-center justify-center">
          <p className="text-gray-500">Advertisement</p>
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