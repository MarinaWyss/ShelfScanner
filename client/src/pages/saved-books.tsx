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
        const response = await apiRequest<SavedBook[]>('/api/saved-books');
        setSavedBooks(response);
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
      await apiRequest(`/api/saved-books/${id}`, {
        method: 'DELETE',
      });
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
        <span className="text-sm ml-1 text-neutral-600">{numRating.toFixed(1)}</span>
      </div>
    );
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Reading List</h1>
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
            <Card key={i} className="overflow-hidden">
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
            </Card>
          ))}
        </div>
      ) : savedBooks.length === 0 ? (
        <div className="text-center py-10">
          <div className="h-24 w-24 mx-auto mb-4 text-neutral-300">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2">Your reading list is empty</h2>
          <p className="text-neutral-600 mb-6">Save books to read later by clicking "Add to List" on any book recommendation.</p>
          <Link href="/books">
            <Button>Scan Books Now</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {savedBooks.map((book) => (
            <Card key={book.id} className="overflow-hidden">
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
                      className="h-8 w-8 text-neutral-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                )}
                <div className="ml-4">
                  <h3 className="font-semibold text-neutral-800 line-clamp-2">{book.title}</h3>
                  <p className="text-neutral-500 text-sm">{book.author}</p>
                  
                  <div className="mt-2 flex items-center">
                    {book.rating && renderRating(book.rating)}
                    <span className="ml-auto text-xs text-neutral-500">
                      {new Date(book.savedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
              <div className="p-4 border-t border-neutral-200">
                <p className="text-sm text-neutral-600 line-clamp-3">{book.summary}</p>
                <div className="mt-3 flex justify-between">
                  <a 
                    href={`https://www.amazon.com/s?k=${encodeURIComponent(book.title + ' ' + book.author)}&tag=gratitudedriv-20`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-amber-400 hover:bg-amber-500 text-black px-3 py-1 rounded text-sm font-medium"
                  >
                    Buy on Amazon
                  </a>
                  <Button 
                    variant="ghost" 
                    className="text-red-600 hover:text-red-800"
                    onClick={() => removeBook(book.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> Remove
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}