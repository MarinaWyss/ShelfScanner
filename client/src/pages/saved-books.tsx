import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Trash2, ChevronDown, ChevronUp } from "lucide-react";
import StarRating from "@/components/ui/star-rating";
import GoogleAdSense from "@/components/ads/GoogleAdSense";
import GoogleLoginButton from "@/components/auth/GoogleLoginButton";

interface SavedBook {
  id: number;
  title: string;
  author: string;
  coverUrl: string;
  rating: string;
  summary: string;
  savedAt: string;
}

export default function SavedBooks() {
  const [savedBooks, setSavedBooks] = useState<SavedBook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedBooks, setExpandedBooks] = useState<number[]>([]);

  // Fetch saved books when component mounts
  useEffect(() => {
    const fetchSavedBooks = async () => {
      try {
        setIsLoading(true);
        setError(null); // Clear any previous errors
        
        // Use the fetch API with credentials included
        const response = await fetch('/api/saved-books', {
          credentials: 'include',
          headers: {
            'Accept': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch books: ${response.status}`);
        }
        
        const books = await response.json();
        console.log("Retrieved saved books:", books);
        
        if (Array.isArray(books)) {
          setSavedBooks(books);
          // No error message needed for empty arrays - it's valid to have no saved books
        } else {
          console.error("Unexpected response format:", books);
          setError("Received invalid data format from server");
        }
      } catch (err) {
        console.error("Error fetching saved books:", err);
        setError("Failed to load your reading list. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchSavedBooks();
  }, []);

  // Function to remove a book from saved list
  const removeBook = async (id: number) => {
    try {
      const response = await fetch(`/api/saved-books/${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete book: ${response.status}`);
      }
      
      // Update UI by removing the deleted book
      setSavedBooks((prevBooks) => prevBooks.filter((book) => book.id !== id));
    } catch (err) {
      console.error("Error removing book:", err);
      setError("Failed to remove book. Please try again.");
    }
  };

  // Toggle the expanded state of a book description
  const toggleExpand = (id: number) => {
    setExpandedBooks(prev => 
      prev.includes(id) 
        ? prev.filter(bookId => bookId !== id) 
        : [...prev, id]
    );
  };

  // Using the centralized StarRating component instead of local implementation

  return (
    <div className="bg-gray-800 min-h-screen">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Reading List</h1>
          <Link href="/books">
            <Button variant="outline" className="border-slate-700 text-slate-200 hover:bg-slate-800">Scan More Books</Button>
          </Link>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4" role="alert">
            <p>{error}</p>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="overflow-hidden bg-slate-900 border border-slate-800 shadow-sm">
                <div className="p-4 flex">
                  <Skeleton className="w-24 h-36 rounded-md bg-slate-800" />
                  <div className="ml-4 space-y-2 flex-1">
                    <Skeleton className="h-6 w-3/4 bg-slate-800" />
                    <Skeleton className="h-4 w-1/2 bg-slate-800" />
                    <Skeleton className="h-4 w-24 bg-slate-800" />
                  </div>
                </div>
                <div className="p-4 border-t border-slate-800 space-y-2">
                  <Skeleton className="h-4 w-full bg-slate-800" />
                  <Skeleton className="h-4 w-full bg-slate-800" />
                  <Skeleton className="h-4 w-3/4 bg-slate-800" />
                </div>
              </Card>
            ))}
          </div>
        ) : savedBooks.length === 0 ? (
          <div className="text-center py-10 bg-slate-900 rounded-xl p-8 shadow-sm border border-slate-800">
            <div className="h-24 w-24 mx-auto mb-4 text-slate-500">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2 text-white">Your reading list is empty</h2>
            <p className="text-slate-400 mb-6">Save books to read later by clicking "Save for Later" on any book recommendation.</p>
            <Link href="/books">
              <Button>Scan Books Now</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {savedBooks.map((book) => (
              <Card key={book.id} className="overflow-hidden bg-gray-100 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="p-5 flex">
                  {book.coverUrl ? (
                    <div className="relative">
                      <img 
                        src={book.coverUrl?.replace('http://', 'https://') || ''} 
                        alt={book.title} 
                        className="w-24 h-36 object-cover rounded-md shadow-sm"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          // If image still fails to load after HTTPS conversion
                          if (target.src !== '') {
                            // Attempt with a different size parameter
                            const newUrl = target.src.replace('zoom=1', 'zoom=5');
                            target.src = newUrl;
                          }
                        }}
                      />
                      <div className="absolute inset-0 rounded-md shadow-inner"></div>
                    </div>
                  ) : (
                    <div className="w-24 h-36 bg-gradient-to-br from-slate-800 to-slate-700 flex items-center justify-center rounded-md shadow-sm">
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        className="h-8 w-8 text-slate-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    </div>
                  )}
                  <div className="ml-5">
                    <h3 className="font-semibold text-black line-clamp-2 text-lg">{book.title}</h3>
                    <p className="text-black text-sm mt-1">{book.author}</p>
                    
                    <div className="mt-3">
                      <StarRating rating={book.rating} />
                      
                      <div className="mt-2 flex items-center">
                        <span className="text-xs text-slate-500">
                          <span className="text-slate-600 mr-1">Date added:</span> 
                          {new Date(book.savedAt).toLocaleDateString(undefined, {
                            month: 'numeric',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="p-5 border-t border-slate-200">
                  <div className="text-sm text-black">
                    <p className={expandedBooks.includes(book.id) ? '' : 'line-clamp-3'}>
                      {book.summary}
                    </p>
                    {book.summary && book.summary.length > 240 && (
                      <button 
                        onClick={() => toggleExpand(book.id)}
                        className="mt-2 text-indigo-600 hover:text-indigo-800 text-sm flex items-center font-medium"
                      >
                        {expandedBooks.includes(book.id) ? (
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
                  <div className="mt-4 flex justify-between gap-3">
                    <a 
                      href={`https://www.amazon.com/s?k=${encodeURIComponent(book.title + ' ' + book.author)}&tag=gratitudedriv-20`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-amber-400 hover:bg-amber-500 text-black px-3 py-1.5 rounded-md text-sm font-medium flex items-center"
                    >
                      Buy on Amazon
                    </a>
                    <Button 
                      variant="outline"
                      className="border-red-900 text-red-400 hover:bg-red-950 hover:text-red-300 hover:border-red-800"
                      onClick={() => removeBook(book.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-1.5" /> Remove
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
        
        {/* Google AdSense Banner under the reading list - always display */}
        {!isLoading && (
          <div className="mt-8">
            <GoogleAdSense 
              adSize="728x90"
              adFormat="horizontal"
              style={{ height: '90px', width: '100%', maxWidth: '728px' }}
              className="mx-auto"
            />
          </div>
        )}
        
        {/* Login section at the bottom of reading list */}
        {!isLoading && (
          <div className="mt-10 bg-slate-900 rounded-xl p-8 shadow-sm border border-slate-800 text-center">
            <h3 className="text-xl font-bold text-white mb-3">Access Your Reading List Everywhere</h3>
            <p className="text-slate-400 mb-5 max-w-xl mx-auto">
              Sign in with Google to sync your reading list across all your devices and never lose your saved books.
            </p>
            <div className="flex justify-center">
              <GoogleLoginButton 
                size="lg"
                className="px-8"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}