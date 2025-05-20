import { useEffect, useRef } from 'react';

interface BookAdUnitProps {
  className?: string;
  index?: number;
}

export default function BookAdUnit({ className = '', index = 1 }: BookAdUnitProps) {
  const adContainerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    // This would normally initialize the actual ad from your ad network
    // For demonstration, we'll just style it to look like a book recommendation
    
    if (adContainerRef.current) {
      // Add any ad initialization code here (would connect to your ad network in production)
    }
  }, []);
  
  return (
    <div 
      ref={adContainerRef}
      className={`bg-white border border-amber-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow ${className}`}
    >
      <div className="p-4 flex">
        <div className="w-24 h-36 bg-amber-100 flex items-center justify-center rounded-md border border-amber-200">
          <div className="text-amber-600 text-xs font-medium text-center p-2">
            Sponsored
          </div>
        </div>
        <div className="ml-4">
          <div className="font-semibold text-neutral-800 mb-1">
            Discover Your Next Favorite Book
          </div>
          <p className="text-neutral-500 text-sm">
            Sponsored recommendation
          </p>
          
          <div className="mt-2 flex">
            <span className="bg-amber-100 text-amber-800 text-xs font-medium px-2 py-0.5 rounded">
              Sponsored
            </span>
          </div>
        </div>
      </div>
      <div className="p-4 border-t border-neutral-200">
        <p className="text-sm text-neutral-600 mb-2">
          Find books tailored to your interests with premium book subscription services.
        </p>
        <a 
          href="https://www.amazon.com/kindle-dbs/fd/prime-pr?tag=shelfscannerapp-20"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-amber-400 hover:bg-amber-500 text-black px-3 py-1 rounded text-sm font-medium flex items-center justify-center w-full"
        >
          <svg 
            className="w-4 h-4 mr-1" 
            viewBox="0 0 24 24" 
            fill="currentColor"
          >
            <path d="M22.555,13.662c-1.4.114-2.7.281-4.127.414s-2.86.293-4.32.293c-2.309,0-4.618-.146-6.918-.556l-.055-.01a.64.64,0,0,0-.37.061.7.7,0,0,0-.3.308.715.715,0,0,0,.339.894,25.793,25.793,0,0,0,8.506,2.791c.361.051.723.1,1.085.135l.021,0a.707.707,0,0,0,.784-.575.718.718,0,0,0-.564-.844,20.562,20.562,0,0,1-5.674-1.931.786.786,0,0,1,.338-1.5,30.413,30.413,0,0,1,3.951.415c2.411.331,4.823.683,7.281.858l.037,0a.7.7,0,0,0,.755-.6A.715.715,0,0,0,22.555,13.662Z" />
            <path d="M8.962,16.17a.7.7,0,0,0-1,.005C6.538,17.6,5.52,18.788,5.051,20.7a.716.716,0,0,0,.463.9.7.7,0,0,0,.9-.459C6.9,19.417,7.779,18.385,9.04,17.212l.084-.078A.714.714,0,0,0,8.962,16.17Z" />
            <path d="M15.956,16.6a.717.717,0,0,0-1.011.1c-1.6,1.99-3.025,3.834-4.668,5.229a.708.708,0,0,0-.139.989.7.7,0,0,0,.992.145c1.752-1.494,3.255-3.428,4.922-5.495A.715.715,0,0,0,15.956,16.6Z" />
          </svg>
          Try Kindle Unlimited
        </a>
      </div>
    </div>
  );
}