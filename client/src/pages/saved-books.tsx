import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Star, StarHalf, Trash2 } from "lucide-react";

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

  // Fetch saved books when component mounts
  useEffect(() => {
    const fetchSavedBooks = async () => {
      try {
        setIsLoading(true);
        
        // Set consistent deviceId cookie with longer expiration
        const deviceId = "device_1747757269918_qk38pmaz8";
        document.cookie = `deviceId=${deviceId}; path=/; max-age=31536000; SameSite=Lax`;
        console.log("Setting device ID:", deviceId);
        
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
        } else {
          console.error("Unexpected response format:", books);
          setError("Received invalid data format from server");
        }
      } catch (err) {
        console.error("Error fetching saved books:", err);
        setError("Failed to load your saved books. Please try again later.");
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

  // Function to render star ratings directly - same logic as RecommendationsStep
  const renderStarRating = (rating: string) => {
    const numRating = parseFloat(rating);
    const fullStars = Math.floor(numRating);
    const hasHalfStar = numRating % 1 >= 0.5;
    
    return (
      <div className="flex items-center">
        <div className="flex text-yellow-400">
          {/* Render each full star */}
          {Array.from({ length: fullStars }).map((_, i) => (
            <Star key={`star-${i}`} className="h-4 w-4 fill-current" />
          ))}
          
          {/* Render half star if needed */}
          {hasHalfStar && <StarHalf className="h-4 w-4 fill-current" />}
          
          {/* Render empty stars to fill the rest */}
          {Array.from({ length: 5 - (fullStars + (hasHalfStar ? 1 : 0)) }).map((_, i) => (
            <Star key={`empty-${i}`} className="h-4 w-4 text-gray-700" />
          ))}
        </div>
        <span className="text-sm ml-2 text-slate-400 whitespace-nowrap">
          {numRating.toFixed(1)}
        </span>
      </div>
    );
  };

  return (
    <div className="bg-black min-h-screen">
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
              <Card key={book.id} className="overflow-hidden bg-slate-900 border border-slate-800 shadow-sm hover:shadow-md transition-shadow">
                <div className="p-5 flex">
                  {book.coverUrl ? (
                    <div className="relative">
                      <img 
                        src={book.coverUrl} 
                        alt={book.title} 
                        className="w-24 h-36 object-cover rounded-md shadow-sm" 
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
                    <h3 className="font-semibold text-white line-clamp-2 text-lg">{book.title}</h3>
                    <p className="text-slate-400 text-sm mt-1">{book.author}</p>
                    
                    <div className="mt-3">
                      {renderStarRating(book.rating)}
                      
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
                <div className="p-5 border-t border-slate-800">
                  <p className="text-sm text-slate-300 line-clamp-3">{book.summary}</p>
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
      </div>
    </div>
  );
}