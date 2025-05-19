import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, StarHalf } from "lucide-react";

interface Recommendation {
  id?: number;
  title: string;
  author: string;
  coverUrl: string;
  rating: string;
  summary: string;
}

interface RecommendationsStepProps {
  recommendations: Recommendation[];
  isLoading: boolean;
}

export default function RecommendationsStep({ recommendations, isLoading }: RecommendationsStepProps) {
  // Function to render star ratings
  const renderRating = (rating: string) => {
    const numRating = parseFloat(rating);
    const fullStars = Math.floor(numRating);
    const hasHalfStar = numRating % 1 >= 0.5;
    
    return (
      <div className="flex items-center">
        <div className="flex text-yellow-400">
          {[...Array(fullStars)].map((_, i) => (
            <Star key={i} className="h-4 w-4 fill-current" />
          ))}
          {hasHalfStar && <StarHalf className="h-4 w-4 fill-current" />}
        </div>
        <span className="text-sm ml-1 text-neutral-600">{numRating.toFixed(1)}</span>
      </div>
    );
  };

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Your Personalized Recommendations</h3>
      
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-sm">
              <div className="p-4 flex">
                <Skeleton className="w-24 h-36 rounded-md" />
                <div className="ml-4 space-y-2 flex-1">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
              <div className="p-4 border-t border-neutral-200 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      )}
      
      {!isLoading && recommendations.length === 0 && (
        <div className="text-center py-10">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="24" 
            height="24" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            className="h-12 w-12 text-neutral-400 mx-auto mb-4"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </svg>
          <p className="text-neutral-600 mb-4">
            No recommendations available yet. Try scanning some books first!
          </p>
          <Button onClick={() => window.location.reload()}>Start Over</Button>
        </div>
      )}
      
      {!isLoading && recommendations.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {recommendations.map((book, index) => (
            <div 
              key={index} 
              className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="p-4 flex">
                {book.coverUrl ? (
                  <img 
                    src={book.coverUrl} 
                    alt={book.title} 
                    className="w-24 h-36 object-cover rounded-md" 
                  />
                ) : (
                  <div className="w-24 h-36 bg-neutral-100 flex items-center justify-center rounded-md">
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      width="24" 
                      height="24" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="2" 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      className="h-8 w-8 text-neutral-400"
                    >
                      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                    </svg>
                  </div>
                )}
                <div className="ml-4">
                  <h4 className="font-semibold text-neutral-800 line-clamp-2">{book.title}</h4>
                  <p className="text-neutral-500 text-sm">{book.author}</p>
                  
                  <div className="mt-2">
                    {renderRating(book.rating)}
                  </div>
                </div>
              </div>
              <div className="p-4 border-t border-neutral-200">
                <p className="text-sm text-neutral-600 line-clamp-3">{book.summary}</p>
                <div className="mt-3 flex justify-between">
                  <button className="text-primary-600 hover:text-primary-700 text-sm font-medium">
                    Add to List
                  </button>
                  <button className="text-neutral-600 hover:text-neutral-800 text-sm">
                    View Details
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
