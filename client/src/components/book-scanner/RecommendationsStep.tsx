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
  matchScore?: number;
  alreadyRead?: boolean;
  isBookRecommendation?: boolean;
  isBookYouveRead?: boolean;
  originalReadTitle?: string;
}

interface RecommendationsStepProps {
  recommendations: Recommendation[];
  isLoading: boolean;
  goodreadsData?: any[];
}

export default function RecommendationsStep({ recommendations, isLoading, goodreadsData }: RecommendationsStepProps) {
  // Function to check if a book has already been read based on Goodreads data
  const isBookAlreadyRead = (book: Recommendation): boolean => {
    if (!goodreadsData || !Array.isArray(goodreadsData) || goodreadsData.length === 0) {
      return false;
    }
    
    const bookTitle = book.title.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const bookAuthor = book.author.toLowerCase().replace(/[^\w\s]/g, '').trim();
    
    // Check if this book appears in the user's Goodreads history
    return goodreadsData.some(goodreadsBook => {
      if (!goodreadsBook["Title"] || !goodreadsBook["Author"]) return false;
      
      // Only consider books that have been read (have a rating)
      if (!goodreadsBook["My Rating"] || parseInt(goodreadsBook["My Rating"]) === 0) return false;
      
      const goodreadsTitle = goodreadsBook["Title"].toLowerCase().replace(/[^\w\s]/g, '').trim();
      const goodreadsAuthor = goodreadsBook["Author"].toLowerCase().replace(/[^\w\s]/g, '').trim();
      
      // Check for partial title match and author match
      const titleMatch = bookTitle.includes(goodreadsTitle) || goodreadsTitle.includes(bookTitle);
      const authorMatch = bookAuthor.includes(goodreadsAuthor) || goodreadsAuthor.includes(bookAuthor);
      
      // Match on title OR a combination of partial title and author
      return titleMatch || (bookTitle.length > 3 && goodreadsTitle.includes(bookTitle) && authorMatch);
    });
  };
  
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
      <h3 className="text-lg font-semibold mb-4">Book Matches Based on Your Preferences</h3>
      <p className="text-slate-400 mb-4">
        We've analyzed the books in your photo and matched them against your reading preferences.
        Here are the books that best match your taste.
      </p>
      
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
        <div className="space-y-8">
          {/* New recommendations section */}
          <div>
            <h3 className="text-lg font-semibold mb-4 text-primary-700">Recommended for You</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {recommendations
                .filter(book => !isBookAlreadyRead(book))
                .map((book, index) => (
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
                      
                      <div className="mt-2 flex items-center">
                        {renderRating(book.rating)}
                        {book.matchScore !== undefined && (
                          <span className="ml-2 bg-green-100 text-green-800 text-xs font-medium px-2 py-0.5 rounded">
                            {book.matchScore > 8 ? "Perfect match!" : 
                             book.matchScore > 5 ? "Great match" : 
                             book.matchScore > 3 ? "Good match" : "Possible match"}
                          </span>
                        )}
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
          </div>
          
          {/* Books you've already read section */}
          {recommendations.some(book => isBookAlreadyRead(book)) && (
            <div className="mt-10">
              <h3 className="text-lg font-semibold mb-4 text-purple-700">Books You've Already Read</h3>
              <p className="text-slate-400 mb-4">
                We found these books in your photo that match your reading history from Goodreads.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {recommendations
                  .filter(book => isBookAlreadyRead(book))
                  .map((book, index) => (
                  <div 
                    key={`read-${index}`} 
                    className="bg-white border border-purple-100 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
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
                        
                        <div className="mt-2 flex items-center">
                          {renderRating(book.rating)}
                          <span className="ml-2 bg-purple-100 text-purple-800 text-xs font-medium px-2 py-0.5 rounded">
                            Already Read
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="p-4 border-t border-neutral-200">
                      <p className="text-sm text-neutral-600 mb-2">
                        You read this as: <span className="font-medium">{book.originalReadTitle || book.title}</span>
                      </p>
                      <div className="mt-3 flex justify-end">
                        <button className="text-neutral-600 hover:text-neutral-800 text-sm">
                          View Details
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
