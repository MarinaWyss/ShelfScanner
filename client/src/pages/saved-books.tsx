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
        const response = await fetch('/api/saved-books');
        
        if (!response.ok) {
          throw new Error(`Failed to fetch books: ${response.status}`);
        }
        
        const books = await response.json();
        setSavedBooks(books);
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
        <span className="text-sm ml-1 text-slate-600">{numRating.toFixed(1)}</span>
      </div>
    );
  };

  return (
    <div className="bg-slate-100 min-h-screen">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Reading List</h1>
          <Link href="/books">
            <Button variant="outline">Scan More Books</Button>
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
              <Card key={i} className="overflow-hidden bg-white shadow-sm">
                <div className="p-4 flex">
                  <Skeleton className="w-24 h-36 rounded-md" />
                  <div className="ml-4 space-y-2 flex-1">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
                <div className="p-4 border-t border-slate-200 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </Card>
            ))}
          </div>
        ) : savedBooks.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-xl p-8 shadow-sm">
            <div className="h-24 w-24 mx-auto mb-4 text-slate-300">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2 text-slate-800">Your reading list is empty</h2>
            <p className="text-slate-600 mb-6">Save books to read later by clicking "Save for Later" on any book recommendation.</p>
            <Link href="/books">
              <Button>Scan Books Now</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {savedBooks.map((book) => (
              <Card key={book.id} className="overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow">
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
                    <div className="w-24 h-36 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center rounded-md shadow-sm">
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
                    <h3 className="font-semibold text-slate-800 line-clamp-2 text-lg">{book.title}</h3>
                    <p className="text-slate-500 text-sm mt-1">{book.author}</p>
                    
                    <div className="mt-3 flex items-center">
                      {book.rating && renderRating(book.rating)}
                      <span className="ml-auto text-xs text-slate-500">
                        {new Date(book.savedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="p-5 border-t border-slate-200">
                  <p className="text-sm text-slate-600 line-clamp-3">{book.summary}</p>
                  <div className="mt-4 flex justify-between gap-3">
                    <a 
                      href={`https://www.amazon.com/s?k=${encodeURIComponent(book.title + ' ' + book.author)}&tag=gratitudedriv-20`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-amber-400 hover:bg-amber-500 text-black px-3 py-1.5 rounded-md text-sm font-medium flex items-center"
                    >
                      <svg 
                        className="w-4 h-4 mr-1.5" 
                        viewBox="0 0 24 24" 
                        fill="currentColor"
                      >
                        <path d="M22.555,13.662c-1.4.114-2.7.281-4.127.414s-2.86.293-4.32.293c-2.309,0-4.618-.146-6.918-.556l-.055-.01a.64.64,0,0,0-.37.061.7.7,0,0,0-.3.308.715.715,0,0,0,.339.894,25.793,25.793,0,0,0,8.506,2.791c.361.051.723.1,1.085.135l.021,0a.707.707,0,0,0,.784-.575.718.718,0,0,0-.564-.844,20.562,20.562,0,0,1-5.674-1.931.786.786,0,0,1,.338-1.5,30.413,30.413,0,0,1,3.951.415c2.411.331,4.823.683,7.281.858l.037,0a.7.7,0,0,0,.755-.6A.715.715,0,0,0,22.555,13.662Z" />
                        <path d="M8.962,16.17a.7.7,0,0,0-1,.005C6.538,17.6,5.52,18.788,5.051,20.7a.716.716,0,0,0,.463.9.7.7,0,0,0,.9-.459C6.9,19.417,7.779,18.385,9.04,17.212l.084-.078A.714.714,0,0,0,8.962,16.17Z" />
                      </svg>
                      Buy on Amazon
                    </a>
                    <Button 
                      variant="outline"
                      className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300"
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