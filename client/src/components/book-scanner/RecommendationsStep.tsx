import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import StarRating from "@/components/ui/star-rating";
import GoogleAdSense from "@/components/ads/GoogleAdSense";
import AffiliateDisclosure from "@/components/ui/affiliate-disclosure";
import { ChevronDown, ChevronUp } from "lucide-react";

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
  const [savingBookIds, setSavingBookIds] = useState<number[]>([]);
  const [savedBookIds, setSavedBookIds] = useState<number[]>([]);
  const [expandedBooks, setExpandedBooks] = useState<number[]>([]);
  const { toast } = useToast();
  
  // Toggle expanded state of a book description
  const toggleExpand = (id: number) => {
    setExpandedBooks(prev => 
      prev.includes(id) 
        ? prev.filter(bookId => bookId !== id) 
        : [...prev, id]
    );
  };

  // Fetch saved books when component mounts to know which books are already saved
  useEffect(() => {
    const fetchSavedBooks = async () => {
      try {
        const response = await fetch('/api/saved-books');
        if (!response.ok) {
          throw new Error('Failed to fetch saved books');
        }
        const savedBooks = await response.json();
        
        // Create a map of title+author -> unique ID for recommendations
        const titleAuthorToId = new Map();
        recommendations.forEach((rec, index) => {
          const key = `${rec.title}-${rec.author}`;
          titleAuthorToId.set(key, index);
        });
        
        // Check which of the current recommendations are already saved
        // We use the title+author composite key instead of just the ID
        const alreadySavedIds: number[] = [];
        savedBooks.forEach((saved: {title: string, author: string}) => {
          const key = `${saved.title}-${saved.author}`;
          if (titleAuthorToId.has(key)) {
            alreadySavedIds.push(titleAuthorToId.get(key));
          }
        });
        
        setSavedBookIds(alreadySavedIds);
      } catch (error) {
        console.error("Error fetching saved books:", error);
      }
    };

    if (recommendations.length > 0) {
      fetchSavedBooks();
    }
  }, [recommendations]);

  // Function to toggle saving/removing a book from the reading list
  const toggleBookSave = async (book: Recommendation, index: number) => {
    const isCurrentlySaved = savedBookIds.includes(index);
    
    try {
      // Add book ID to loading state
      setSavingBookIds(prev => [...prev, index]);
      
      if (isCurrentlySaved) {
        // Remove book from saved list
        // First, get all saved books to find the correct ID
        const response = await fetch('/api/saved-books');
        if (!response.ok) {
          throw new Error('Failed to fetch saved books');
        }
        const savedBooks = await response.json();
        
        // Find the saved book that matches this recommendation
        const savedBook = savedBooks.find((saved: any) => 
          saved.title === book.title && saved.author === book.author
        );
        
        if (savedBook) {
          // Delete the book using its ID
          await apiRequest('DELETE', `/api/saved-books/${savedBook.id}`);
          
          // Remove from saved books state
          setSavedBookIds(prev => prev.filter(id => id !== index));
          
          // Show success message
          toast({
            title: "Book removed",
            description: `${book.title} has been removed from your reading list`,
            variant: "default",
          });
        }
      } else {
        // Save book to the list
        await apiRequest(
          'POST',
          '/api/saved-books',
          {
            title: book.title,
            author: book.author,
            coverUrl: book.coverUrl,
            rating: book.rating,
            summary: book.summary || 'No summary available'
          }
        );
        
        // Add to saved books state
        setSavedBookIds(prev => [...prev, index]);
        
        // Show success message with link to reading list
        toast({
          title: "Book saved",
          description: (
            <div>
              {`${book.title} has been added to your reading list. `}
              <a 
                href="/reading-list" 
                className="font-medium text-primary hover:underline"
                onClick={(e) => {
                  e.preventDefault();
                  window.location.href = "/reading-list";
                }}
              >
                View reading list
              </a>
            </div>
          ),
          variant: "default",
        });
      }
    } catch (error) {
      console.error("Error toggling book save:", error);
      toast({
        title: "Error",
        description: `Failed to ${isCurrentlySaved ? 'remove' : 'save'} book. Please try again.`,
        variant: "destructive",
      });
    } finally {
      // Remove book ID from loading state
      setSavingBookIds(prev => prev.filter(id => id !== index));
    }
  };

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
  
  // Function to render star ratings using our shared StarRating component
  const renderRating = (rating: string) => {
    // Handle potential empty or invalid ratings
    if (!rating || isNaN(parseFloat(rating))) {
      return <span className="text-sm text-neutral-500">No rating available</span>;
    }
    
    return (
      <StarRating 
        rating={rating} 
        starSize={4} 
        showNumeric={true} 
        className="text-neutral-600" 
      />
    );
  };

  return (
    <div className="pb-12">
      {/* Google AdSense Banner at the Top */}
      <div className="mb-6">
        <GoogleAdSense 
          adSlot="1234567890"
          adSize="728x90"
          adFormat="horizontal"
          style={{ height: '90px', width: '100%', maxWidth: '728px' }}
          className="mx-auto"
        />
      </div>

      {/* Affiliate Disclosure */}
      <AffiliateDisclosure />
      
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
        <div className="space-y-12">
          {/* New recommendations section */}
          <div>
            <h3 className="text-xl font-semibold mb-4 text-primary-700">Recommended for You</h3>
            <div className="grid grid-cols-1 gap-6">
              {recommendations
                .filter(book => !isBookAlreadyRead(book))
                .slice(0, 3)
                .map((book, index) => (
                <div 
                  key={index} 
                  className="bg-gray-100 border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="md:flex">
                    <div className="p-5 flex md:flex-col md:items-center md:w-1/4 md:border-r border-slate-200">
                      {book.coverUrl ? (
                        <div className="relative">
                          <img 
                            src={book.coverUrl} 
                            alt={book.title}
                            className="w-24 h-36 md:w-32 md:h-48 object-cover rounded-md shadow-sm"
                            onError={(e) => {
                              // If image fails to load, replace with a secure proxy URL or fallback
                              const target = e.target as HTMLImageElement;
                              // Try using a CORS proxy if the original URL fails
                              if (target.src === book.coverUrl) {
                                // Create a fallback URL that uses HTTPS
                                const fallbackUrl = book.coverUrl.replace('http://', 'https://');
                                target.src = fallbackUrl;
                              }
                            }}
                          />
                          <div className="absolute inset-0 rounded-md shadow-inner"></div>
                        </div>
                      ) : (
                        <div className="w-24 h-36 md:w-32 md:h-48 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center rounded-md shadow-sm">
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
                            className="h-8 w-8 text-slate-400"
                          >
                            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                          </svg>
                        </div>
                      )}
                      
                      <div className="ml-5 md:ml-0 md:mt-4 md:text-center md:w-full flex flex-col md:items-center">
                        <div className="mt-3 flex items-center">
                          {renderRating(book.rating)}
                        </div>
                        
                        {book.matchScore !== undefined && (
                          <span className="mt-2 bg-green-100 text-green-800 text-xs font-medium px-2 py-0.5 rounded">
                            {book.matchScore > 8 ? "Perfect match!" : 
                             book.matchScore > 5 ? "Great match" : 
                             book.matchScore > 3 ? "Good match" : "Possible match"}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="md:w-3/4 flex flex-col">
                      <div className="p-5 pb-3">
                        <h4 className="font-semibold text-black text-xl mb-1">{book.title}</h4>
                        <p className="text-black text-sm mb-3">by {book.author}</p>
                        <div className="text-sm text-black">
                          <p className={expandedBooks.includes(index) ? '' : 'line-clamp-3'}>
                            {book.summary}
                          </p>
                          {book.summary && book.summary.length > 240 && (
                            <button 
                              onClick={() => toggleExpand(index)}
                              className="mt-2 text-indigo-600 hover:text-indigo-800 text-sm flex items-center font-medium"
                            >
                              {expandedBooks.includes(index) ? (
                                <>
                                  <ChevronUp className="h-4 w-4 mr-1" /> 
                                  Read Less
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="h-4 w-4 mr-1" /> 
                                  Read More
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                      
                      <div className="mt-auto p-5 pt-3 border-t border-slate-200">
                        <div className="flex justify-between gap-3">
                          <button 
                            className={`
                              ${savedBookIds.includes(index) 
                                ? 'bg-indigo-100 border border-indigo-300 text-indigo-700 hover:bg-indigo-200' 
                                : 'bg-white border border-slate-300 hover:bg-slate-50 text-slate-800'} 
                              text-sm font-medium flex items-center px-3 py-1.5 rounded-md ${savingBookIds.includes(index) ? 'opacity-50 cursor-not-allowed' : ''}
                            `}
                            onClick={() => toggleBookSave(book, index)}
                            disabled={savingBookIds.includes(index)}
                          >
                            {savingBookIds.includes(index) ? (
                              <svg className="animate-spin h-4 w-4 mr-1.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                            ) : (
                              <svg 
                                xmlns="http://www.w3.org/2000/svg" 
                                className="h-4 w-4 mr-1.5" 
                                fill={savedBookIds.includes(index) ? "currentColor" : "none"}
                                viewBox="0 0 24 24" 
                                stroke="currentColor"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 3H7a2 2 0 0 0-2 2v16l7-3 7 3V5a2 2 0 0 0-2-2z" />
                              </svg>
                            )}
                            {savedBookIds.includes(index) ? 'Saved to List' : 'Save for Later'}
                          </button>
                          <a 
                            href={`https://www.amazon.com/s?k=${encodeURIComponent(book.title + ' ' + book.author)}&tag=gratitudedriv-20`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-amber-400 hover:bg-amber-500 text-black px-3 py-1.5 rounded-md text-sm font-medium"
                          >
                            Buy on Amazon
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Google AdSense Banner at the bottom of recommendations */}
          <div className="my-8">
            <GoogleAdSense 
              adSlot="3456789012"
              adSize="728x90"
              adFormat="horizontal"
              style={{ height: '90px', width: '100%', maxWidth: '728px' }}
              className="mx-auto"
            />
          </div>
          
          {/* Books you've already read section - with proper spacing */}
          {recommendations.some(book => isBookAlreadyRead(book)) && (
            <div className="mt-8 pt-6 border-t border-slate-200">
              <div>
                <h3 className="text-xl font-semibold mb-4 text-purple-700">Books You've Already Read</h3>
                <p className="text-slate-400 mb-4">
                  We found these books in your photo that match your reading history from Goodreads.
                </p>
                <div className="grid grid-cols-1 gap-6">
                  {recommendations
                    .filter(book => isBookAlreadyRead(book))
                    .map((book, index) => {
                      // Calculate a unique index for books you've already read
                      const alreadyReadIndex = recommendations.length + index;
                      
                      return (
                        <div 
                          key={index} 
                          className="bg-gray-100 border border-purple-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                        >
                          <div className="md:flex">
                            <div className="p-5 flex md:flex-col md:items-center md:w-1/4 md:border-r border-slate-200">
                              {book.coverUrl ? (
                                <div className="relative">
                                  <img 
                                    src={book.coverUrl} 
                                    alt={book.title}
                                    className="w-24 h-36 md:w-32 md:h-48 object-cover rounded-md shadow-sm"
                                    onError={(e) => {
                                      // If image fails to load, replace with a secure proxy URL or fallback
                                      const target = e.target as HTMLImageElement;
                                      // Try using a CORS proxy if the original URL fails
                                      if (target.src === book.coverUrl) {
                                        // Create a fallback URL that uses HTTPS
                                        const fallbackUrl = book.coverUrl.replace('http://', 'https://');
                                        target.src = fallbackUrl;
                                      }
                                    }}
                                  />
                                  <div className="absolute inset-0 rounded-md shadow-inner"></div>
                                </div>
                              ) : (
                                <div className="w-24 h-36 md:w-32 md:h-48 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center rounded-md shadow-sm">
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
                                    className="h-8 w-8 text-slate-400"
                                  >
                                    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                                  </svg>
                                </div>
                              )}
                              
                              <div className="ml-5 md:ml-0 md:mt-4 md:text-center md:w-full flex flex-col md:items-center">
                                <div className="mt-3 flex items-center">
                                  {renderRating(book.rating)}
                                </div>
                                
                                <div className="mt-2 bg-purple-100 text-purple-800 text-xs font-medium px-2 py-0.5 rounded">
                                  Already Read
                                </div>
                              </div>
                            </div>
                            
                            <div className="md:w-3/4 flex flex-col">
                              <div className="p-5 pb-3">
                                <h4 className="font-semibold text-black text-xl mb-1">{book.title}</h4>
                                <p className="text-black text-sm mb-3">by {book.author}</p>
                                <div className="text-sm text-black">
                                  <p className={expandedBooks.includes(alreadyReadIndex) ? '' : 'line-clamp-3'}>
                                    {book.summary}
                                  </p>
                                  {book.summary && book.summary.length > 240 && (
                                    <button 
                                      onClick={() => toggleExpand(alreadyReadIndex)}
                                      className="mt-2 text-indigo-600 hover:text-indigo-800 text-sm flex items-center font-medium"
                                    >
                                      {expandedBooks.includes(alreadyReadIndex) ? (
                                        <>
                                          <ChevronUp className="h-4 w-4 mr-1" /> 
                                          Read Less
                                        </>
                                      ) : (
                                        <>
                                          <ChevronDown className="h-4 w-4 mr-1" /> 
                                          Read More
                                        </>
                                      )}
                                    </button>
                                  )}
                                </div>
                              </div>
                              
                              <div className="mt-auto p-5 pt-3 border-t border-slate-200">
                                <div className="flex justify-between gap-3">
                                  <button 
                                    className={`
                                      ${savedBookIds.includes(alreadyReadIndex) 
                                        ? 'bg-indigo-100 border border-indigo-300 text-indigo-700 hover:bg-indigo-200' 
                                        : 'bg-white border border-slate-300 hover:bg-slate-50 text-slate-800'} 
                                      text-sm font-medium flex items-center px-3 py-1 rounded ${savingBookIds.includes(alreadyReadIndex) ? 'opacity-50 cursor-not-allowed' : ''}
                                    `}
                                    onClick={() => toggleBookSave(book, alreadyReadIndex)}
                                    disabled={savingBookIds.includes(alreadyReadIndex)}
                                  >
                                    {savingBookIds.includes(alreadyReadIndex) ? (
                                      <svg className="animate-spin h-4 w-4 mr-1.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                      </svg>
                                    ) : (
                                      <svg 
                                        xmlns="http://www.w3.org/2000/svg" 
                                        className="h-4 w-4 mr-1.5" 
                                        fill={savedBookIds.includes(alreadyReadIndex) ? "currentColor" : "none"}
                                        viewBox="0 0 24 24" 
                                        stroke="currentColor"
                                      >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 3H7a2 2 0 0 0-2 2v16l7-3 7 3V5a2 2 0 0 0-2-2z" />
                                      </svg>
                                    )}
                                    {savedBookIds.includes(alreadyReadIndex) ? 'Saved to List' : 'Save for Later'}
                                  </button>
                                  <a 
                                    href={`https://www.amazon.com/s?k=${encodeURIComponent(book.title + ' ' + book.author)}&tag=gratitudedriv-20`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="bg-amber-400 hover:bg-amber-500 text-black px-3 py-1 rounded text-sm font-medium"
                                  >
                                    Buy on Amazon
                                  </a>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}