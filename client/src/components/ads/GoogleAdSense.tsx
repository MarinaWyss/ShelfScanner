import { useEffect, useRef } from 'react';

interface GoogleAdSenseProps {
  adSlot: string;
  adFormat?: 'auto' | 'rectangle' | 'horizontal' | 'vertical';
  style?: React.CSSProperties;
  className?: string;
}

declare global {
  interface Window {
    adsbygoogle: any[];
  }
}

export default function GoogleAdSense({ 
  adSlot, 
  adFormat = 'auto', 
  style = {}, 
  className = ''
}: GoogleAdSenseProps) {
  const adRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      // Push ad when component mounts
      if (window.adsbygoogle && adRef.current) {
        window.adsbygoogle = window.adsbygoogle || [];
        window.adsbygoogle.push({});
      }
    } catch (error) {
      console.error('AdSense error:', error);
    }
    
    return () => {
      // Cleanup if needed
    };
  }, [adSlot]);

  return (
    <div className={`ad-container ${className}`} ref={adRef}>
      <ins
        className="adsbygoogle"
        style={{
          display: 'block',
          textAlign: 'center',
          ...style
        }}
        data-ad-client="ca-pub-XXXXXXXXXXXXXXXX" // Replace with your actual AdSense publisher ID
        data-ad-slot={adSlot}
        data-ad-format={adFormat}
        data-full-width-responsive="true"
      />
    </div>
  );
}