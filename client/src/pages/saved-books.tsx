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
                    
                    <div className="mt-3 flex items-center">
                      {book.rating && renderRating(book.rating)}
                      <span className="ml-auto text-xs text-slate-400">
                        {new Date(book.savedAt).toLocaleDateString()}
                      </span>
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
                      <svg 
                        className="w-4 h-4 mr-1.5" 
                        viewBox="0 0 24 24" 
                        fill="currentColor"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path d="M15.93 11.9C14.58 12.87 12.43 13.38 10.97 13.38C9.11 13.38 6.95 12.63 5.5 11.47C5.35 11.35 5.5 11.17 5.67 11.25C7.36 12.23 9.35 12.83 11.42 12.83C12.86 12.83 14.46 12.48 15.92 11.73C16.15 11.6 16.35 11.83 15.93 11.9Z" />
                        <path d="M16.67 11.06C16.52 10.86 15.44 10.96 14.95 11.03C14.8 11.05 14.78 10.92 14.91 10.83C15.74 10.24 17.08 10.37 17.21 10.55C17.34 10.71 17.17 12.11 16.4 12.77C16.27 12.88 16.15 12.82 16.2 12.69C16.36 12.27 16.82 11.25 16.67 11.06Z" />
                        <path d="M14.89 7.81V7.2C14.89 7.09 14.99 7.02 15.09 7.02H17.63C17.74 7.02 17.84 7.09 17.84 7.2V7.73C17.84 7.84 17.74 7.93 17.61 8.08L16.3 10C16.81 9.97 17.36 10.06 17.81 10.34C17.93 10.42 17.96 10.53 17.97 10.64V11.28C17.97 11.39 17.85 11.53 17.72 11.46C17.05 11.07 16.15 11.02 15.43 11.42C15.31 11.48 15.19 11.38 15.19 11.27V10.67C15.19 10.55 15.2 10.33 15.33 10.14L16.9 7.81H15.09C14.98 7.81 14.89 7.73 14.89 7.81Z" />
                        <path d="M6.21 11.57H5.47C5.38 11.56 5.3 11.49 5.29 11.4L5.29 7.22C5.29 7.12 5.38 7.04 5.48 7.04H6.16C6.26 7.05 6.34 7.12 6.35 7.22V7.77H6.36C6.54 7.18 6.9 6.89 7.37 6.89C7.85 6.89 8.14 7.18 8.35 7.77C8.54 7.18 8.98 6.89 9.43 6.89C9.74 6.89 10.09 7.03 10.3 7.33C10.54 7.68 10.48 8.17 10.48 8.59V11.38C10.48 11.48 10.39 11.57 10.28 11.57H9.55C9.45 11.56 9.37 11.47 9.37 11.38L9.37 8.97C9.37 8.79 9.39 8.4 9.36 8.23C9.3 7.94 9.13 7.87 8.91 7.87C8.73 7.87 8.55 8 8.47 8.19C8.38 8.38 8.39 8.7 8.39 8.97V11.38C8.39 11.48 8.3 11.57 8.19 11.57H7.46C7.35 11.56 7.27 11.47 7.27 11.38L7.27 8.97C7.27 8.64 7.34 8.22 7.13 7.93C6.98 7.73 6.79 7.87 6.67 7.97C6.56 8.08 6.53 8.23 6.51 8.39C6.48 8.54 6.49 8.81 6.49 8.98V11.38C6.49 11.48 6.4 11.57 6.29 11.57C6.29 11.57 6.21 11.57 6.21 11.57Z" />
                        <path d="M19.19 6.86C18.24 6.86 17.66 7.57 17.66 8.55C17.66 9.51 17.99 10.46 19.16 10.46C20.1 10.46 20.69 9.76 20.69 8.76C20.69 7.76 20.15 6.86 19.19 6.86ZM19.18 7.52C19.56 7.52 19.62 8 19.62 8.34C19.62 8.67 19.6 9.79 19.18 9.79C18.77 9.79 18.75 8.87 18.75 8.51C18.75 8.15 18.78 7.52 19.18 7.52Z" />
                        <path d="M11.33 11.57H10.6C10.5 11.56 10.42 11.47 10.42 11.38L10.41 7.2C10.42 7.11 10.51 7.04 10.62 7.04H11.29C11.38 7.05 11.45 7.12 11.47 7.2V7.81H11.48C11.69 7.18 12.03 6.87 12.61 6.87C12.93 6.87 13.25 6.97 13.46 7.29C13.66 7.59 13.66 8.11 13.66 8.47V11.4C13.65 11.49 13.56 11.57 13.45 11.57H12.72C12.62 11.56 12.55 11.48 12.54 11.4V8.93C12.54 8.62 12.59 8.18 12.37 7.9C12.25 7.76 12.07 7.7 11.93 7.7C11.75 7.7 11.56 7.8 11.47 7.98C11.35 8.2 11.34 8.55 11.34 8.93V11.38C11.34 11.48 11.25 11.57 11.14 11.57H11.33" />
                        <path d="M5.04 11.57C4.96 11.55 4.9 11.48 4.9 11.4C4.9 11.39 4.9 11.39 4.9 11.39L4.91 7.2C4.92 7.11 5.01 7.04 5.11 7.04H5.88C5.99 7.05 6.07 7.14 6.07 7.24V11.38C6.07 11.48 5.98 11.57 5.88 11.57H5.04Z" />
                        <path d="M5.49 6.54C5.11 6.54 4.82 6.25 4.82 5.88C4.82 5.5 5.12 5.21 5.5 5.21C5.89 5.21 6.19 5.5 6.19 5.88C6.19 6.25 5.89 6.54 5.49 6.54Z" />
                        <path d="M12 3.5C16.41 3.5 20 6.41 20 10C20 13.59 16.41 16.5 12 16.5C7.58 16.5 4 13.59 4 10C4 6.41 7.58 3.5 12 3.5ZM12 3C7.31 3 3.5 6.14 3.5 10C3.5 13.86 7.31 17 12 17C16.69 17 20.5 13.86 20.5 10C20.5 6.14 16.69 3 12 3Z" />
                      </svg>
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