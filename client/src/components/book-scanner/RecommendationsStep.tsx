import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import StarRating from "@/components/ui/star-rating";

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
  matchReason?: string;
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
        
        // Find the book to remove by title and author
        const bookToRemove = savedBooks.find((saved: {title: string, author: string}) => 
          saved.title === book.title && saved.author === book.author
        );
        
        if (bookToRemove) {
          const deleteResponse = await fetch(`/api/saved-books/${bookToRemove.id}`, {
            method: 'DELETE'
          } as RequestInit);
          
          if (!deleteResponse.ok) {
            throw new Error('Failed to remove book');
          }
          
          // Update local state
          setSavedBookIds(prev => prev.filter(id => id !== index));
          
          toast({
            title: "Book removed",
            description: `"${book.title}" has been removed from your reading list.`,
            variant: "default",
          });
        }
      } else {
        // Save book to reading list
        const saveResponse = await fetch('/api/saved-books', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: book.title,
            author: book.author,
            coverUrl: book.coverUrl,
            rating: book.rating,
            summary: book.summary,
          }),
        } as RequestInit);

        if (!saveResponse.ok) {
          throw new Error('Failed to save book');
        }

        // Update local state
        setSavedBookIds(prev => [...prev, index]);
        
        toast({
          title: "Book saved!",
          description: (
            <div>
              <p className="mb-2">"{book.title}" has been added to your reading list.</p>
              <a 
                href="/reading-list" 
                className="text-purple-600 hover:text-purple-800 underline"
                onClick={() => {
                  // Close the toast when clicking the link
                  toast({ title: "", description: "", variant: "default" });
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
      if (!goodreadsBook["Title"] || !goodreadsBook["Author"]) {return false;}
      
      // Only consider books that have been read (have a rating)
      if (!goodreadsBook["My Rating"] || parseInt(goodreadsBook["My Rating"]) === 0) {return false;}
      
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
      {/* Affiliate Disclosure */}
      <div className="mb-4">
        <AffiliateDisclosure className="mb-0" />
      </div>
      
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
          {/* Check if all books have been read */}
          {recommendations.every(book => isBookAlreadyRead(book)) ? (
            <div className="text-center py-16 bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg p-8 shadow-sm border border-purple-200">
              <div className="h-20 w-20 mx-auto mb-4 text-purple-400">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-full h-full">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2 text-purple-800">You've read all these books!</h3>
              <p className="text-purple-600 mb-6">Great job! All the books we detected in your photo are already in your reading history. Try scanning a different bookshelf or ask friends for their recommendations.</p>
              <Button 
                className="bg-purple-600 hover:bg-purple-700 text-white"
                onClick={() => window.location.reload()}
              >
                Scan More Books
              </Button>
            </div>
          ) : (
            <div>
              {/* New recommendations section */}
              <div>
                <h3 className="text-xl font-semibold mb-4 text-primary-700">Recommended for You</h3>
                <div className="grid grid-cols-1 gap-6">
                  {recommendations
                    .filter(book => !isBookAlreadyRead(book) && !book.isBookYouveRead)
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
                              
                              {book.matchScore !== undefined && book.matchScore >= 60 && (
                                <span className={`mt-2 text-xs font-medium px-2 py-0.5 rounded ${
                                  book.matchScore >= 90 ? "bg-green-100 text-green-800" :
                                  book.matchScore >= 76 ? "bg-blue-100 text-blue-800" :
                                  book.matchScore >= 60 ? "bg-yellow-100 text-yellow-800" : ""
                                }`}>
                                  {book.matchScore >= 90 ? "Great match" : 
                                   book.matchScore >= 76 ? "Good match" : 
                                   book.matchScore >= 60 ? "Fair match" : ""}
                                </span>
                              )}
                            </div>
                          </div>
                          
                          <div className="md:w-3/4 flex flex-col">
                            <div className="p-5 pb-3">
                              <h4 className="font-semibold text-black text-xl mb-1">{book.title}</h4>
                              <p className="text-black text-sm mb-3">by {book.author}</p>
                              
                              {/* Display match reason in second person format only when available */}
                              {book.matchReason && book.matchReason.trim() !== "" && book.matchReason !== "using fallback algo" && (
                                <div className="mt-2 mb-3 text-sm bg-gradient-to-r from-purple-50 to-violet-50 p-3 rounded-md border border-purple-100">
                                  <p className="text-purple-800 font-medium mb-1">Why This Matches You:</p>
                                  <p className="text-purple-700">
                                    {book.matchReason.replace(/the user's/gi, "your")
                                      .replace(/user has/gi, "you have")
                                      .replace(/user likes/gi, "you like")
                                      .replace(/user enjoys/gi, "you enjoy")
                                      .replace(/user is/gi, "you are")
                                      .replace(/user will/gi, "you will")
                                      .replace(/user/gi, "you")}
                                  </p>
                                </div>
                              )}
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
                                    text-sm font-medium flex items-center px-3 py-1 rounded ${savingBookIds.includes(index) ? 'opacity-50 cursor-not-allowed' : ''}
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
                                  className="bg-amber-400 hover:bg-amber-500 text-black px-3 py-1 rounded text-sm font-medium"
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
              
              {/* Books You've Already Read section */}
              {goodreadsData && goodreadsData.length > 0 && recommendations.some(book => isBookAlreadyRead(book)) && (
                <div className="mt-12">
                  <h3 className="text-xl font-semibold mb-4 text-purple-700">Books You've Already Read</h3>
                  <p className="text-slate-400 mb-4">
                    We detected these books in your photo, but it looks like you've already read them according to your Goodreads data.
                  </p>
                  <div className="grid grid-cols-1 gap-6">
                    {recommendations
                      .filter(book => isBookAlreadyRead(book))
                      .map((book, index) => (
                        <div 
                          key={`read-${index}`} 
                          className="bg-purple-50 border border-purple-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                        >
                          <div className="md:flex">
                            <div className="p-5 flex md:flex-col md:items-center md:w-1/4 md:border-r border-purple-200">
                              {book.coverUrl ? (
                                <div className="relative">
                                  <img 
                                    src={book.coverUrl} 
                                    alt={book.title}
                                    className="w-24 h-36 md:w-32 md:h-48 object-cover rounded-md shadow-sm"
                                    onError={(e) => {
                                      const target = e.target as HTMLImageElement;
                                      if (target.src === book.coverUrl) {
                                        const fallbackUrl = book.coverUrl.replace('http://', 'https://');
                                        target.src = fallbackUrl;
                                      }
                                    }}
                                  />
                                  <div className="absolute inset-0 rounded-md shadow-inner"></div>
                                </div>
                              ) : (
                                <div className="w-24 h-36 md:w-32 md:h-48 bg-gradient-to-br from-purple-100 to-purple-200 flex items-center justify-center rounded-md shadow-sm">
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
                                    className="h-8 w-8 text-purple-400"
                                  >
                                    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                                  </svg>
                                </div>
                              )}
                              
                              <div className="ml-5 md:ml-0 md:mt-4 md:text-center md:w-full flex flex-col md:items-center">
                                <div className="mt-3 flex items-center">
                                  {renderRating(book.rating)}
                                </div>
                                <span className="mt-2 text-xs font-medium px-2 py-0.5 rounded bg-purple-200 text-purple-800">
                                  Already Read
                                </span>
                              </div>
                            </div>
                            
                            <div className="md:w-3/4 flex flex-col">
                              <div className="p-5 pb-3">
                                <h4 className="font-semibold text-black text-xl mb-1">{book.title}</h4>
                                <p className="text-black text-sm mb-3">by {book.author}</p>
                                <div className="text-sm text-black">
                                  <p className={expandedBooks.includes(index + 1000) ? '' : 'line-clamp-3'}>
                                    {book.summary}
                                  </p>
                                  {book.summary && book.summary.length > 240 && (
                                    <button 
                                      onClick={() => toggleExpand(index + 1000)}
                                      className="mt-2 text-purple-600 hover:text-purple-800 text-sm flex items-center font-medium"
                                    >
                                      {expandedBooks.includes(index + 1000) ? (
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
      )}
      

    </div>
  );
}