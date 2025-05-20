import { useEffect, useRef } from 'react';

interface AdBannerProps {
  adSlot?: string;
  adFormat?: 'horizontal' | 'rectangle' | 'vertical' | 'native';
  className?: string;
}

export default function AdBanner({ 
  adSlot = 'top-banner', 
  adFormat = 'horizontal',
  className = ''
}: AdBannerProps) {
  const adContainerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    // This would normally load the actual ad script
    // In a real implementation, you would load the ad network's script and initialize it
    
    // Example for Google AdSense (commented out, would be uncommented in production)
    /*
    if (window.adsbygoogle && adContainerRef.current) {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {
        console.error('Ad error:', e);
      }
    }
    */
    
    // For demonstration purposes, we'll just set a background color and message
    if (adContainerRef.current) {
      const adElement = adContainerRef.current;
      
      // Setup demo ad appearance
      adElement.style.backgroundColor = '#f0f0f0';
      adElement.style.border = '1px solid #ddd';
      adElement.style.display = 'flex';
      adElement.style.alignItems = 'center';
      adElement.style.justifyContent = 'center';
      adElement.style.color = '#666';
      adElement.style.fontWeight = '500';
      adElement.style.fontSize = '14px';
      
      // Set size based on format
      if (adFormat === 'horizontal') {
        adElement.style.height = '90px';
        adElement.style.width = '100%';
        adElement.innerText = 'Advertisement Banner (728x90)';
      } else if (adFormat === 'rectangle') {
        adElement.style.height = '250px';
        adElement.style.width = '300px';
        adElement.innerText = 'Advertisement (300x250)';
      } else if (adFormat === 'vertical') {
        adElement.style.height = '600px';
        adElement.style.width = '160px';
        adElement.innerText = 'Advertisement (160x600)';
      } else if (adFormat === 'native') {
        adElement.style.height = 'auto';
        adElement.style.width = '100%';
        adElement.style.padding = '12px';
        adElement.innerText = 'Native Advertisement';
      }
    }
    
    return () => {
      // Cleanup if needed
    };
  }, [adFormat, adSlot]);
  
  return (
    <div 
      ref={adContainerRef}
      id={`ad-container-${adSlot}`}
      className={`ad-container ${className}`}
      data-ad-slot={adSlot}
      data-ad-format={adFormat}
    >
      {/* Ad will be inserted here by script */}
    </div>
  );
}