import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Trash2, ChevronDown, ChevronUp } from "lucide-react";
import StarRating from "@/components/ui/star-rating";
import DonationButton from "@/components/ui/DonationButton";
import DonationModal from "@/components/ui/DonationModal";

import AffiliateDisclosure from "@/components/ui/affiliate-disclosure";

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
  const [isLoading, setIsLoading] = useState(true);
  const [savedBooks, setSavedBooks] = useState<SavedBook[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedBooks, setExpandedBooks] = useState<number[]>([]);
  const [_deviceId, setDeviceId] = useState<string | null>(null);
  const [donationModalOpen, setDonationModalOpen] = useState(false);

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
        
        const data = await response.json();
        
        if (data && data.books && Array.isArray(data.books)) {
          setSavedBooks(data.books);
          setDeviceId(data.deviceId);
        } else {
          setSavedBooks([]);
        }
      } catch (err) {
        console.log("Error fetching saved books:", err);
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
      // Get deviceId from cookies
      const deviceId = document.cookie
        .split('; ')
        .find(row => row.startsWith('deviceId='))
        ?.split('=')[1];
        
      const response = await fetch(`/api/saved-books?bookId=${id}&deviceId=${deviceId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete book: ${response.status}`);
      }
      
      // Update UI by removing the deleted book
      setSavedBooks((prevBooks) => prevBooks.filter((book) => book.id !== id));
    } catch (err) {
      console.log("Error removing book:", err);
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
    <div className="bg-background min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Reading List</h1>
          <Link href="/books">
            <Button variant="outline" className="border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Scan More Books</Button>
          </Link>
        </div>

        {/* Affiliate Disclosure - only show when books are present */}
        {!isLoading && savedBooks.length > 0 && <AffiliateDisclosure />}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-md mb-6" role="alert">
            <p>{error}</p>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="overflow-hidden bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="p-4 flex">
                  <Skeleton className="w-24 h-36 rounded-md bg-gray-100 dark:bg-gray-700" />
                  <div className="ml-4 space-y-2 flex-1">
                    <Skeleton className="h-6 w-3/4 bg-gray-100 dark:bg-gray-700" />
                    <Skeleton className="h-4 w-1/2 bg-gray-100 dark:bg-gray-700" />
                    <Skeleton className="h-4 w-24 bg-gray-100 dark:bg-gray-700" />
                  </div>
                </div>
                <div className="p-4 border-t border-gray-100 dark:border-gray-700 space-y-2">
                  <Skeleton className="h-4 w-full bg-gray-100 dark:bg-gray-700" />
                  <Skeleton className="h-4 w-full bg-gray-100 dark:bg-gray-700" />
                  <Skeleton className="h-4 w-3/4 bg-gray-100 dark:bg-gray-700" />
                </div>
              </Card>
            ))}
          </div>
        ) : savedBooks.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 dark:bg-gray-800 rounded-lg p-8 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="h-20 w-20 mx-auto mb-4 text-gray-400 dark:text-gray-500">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">Your reading list is empty</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-6">Save books to read later by clicking "Save for Later" on any book recommendation.</p>
            <Link href="/books">
              <Button className="bg-violet-600 hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500 text-white">Scan Books Now</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {savedBooks.map((book) => (
              <Card key={book.id} className="overflow-hidden bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
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
                    <div className="w-24 h-36 bg-gray-100 dark:bg-gray-700 flex items-center justify-center rounded-md shadow-sm">
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        className="h-8 w-8 text-gray-400 dark:text-gray-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    </div>
                  )}
                  <div className="ml-5 flex-1">
                    <h3 className="font-medium text-gray-900 dark:text-white line-clamp-2 text-lg">{book.title}</h3>
                    <p className="text-gray-600 dark:text-gray-300 text-sm mt-1">{book.author}</p>
                    
                    <div className="mt-3">
                      <StarRating rating={book.rating} />
                      
                      <div className="mt-2 flex items-center">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          <span className="text-gray-600 dark:text-gray-400 mr-1">Date added:</span> 
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
                <div className="p-5 border-t border-gray-100 dark:border-gray-700">
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    <p className={expandedBooks.includes(book.id) ? '' : 'line-clamp-3'}>
                      {book.summary}
                    </p>
                    {book.summary && book.summary.length > 240 && (
                      <button 
                        onClick={() => toggleExpand(book.id)}
                        className="mt-2 text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 text-sm flex items-center font-medium"
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
                      className="bg-amber-400 hover:bg-amber-500 text-black px-3 py-1.5 rounded-md text-sm font-medium flex items-center dark:bg-amber-500 dark:hover:bg-amber-400"
                    >
                      Buy on Amazon
                    </a>
                    <Button 
                      variant="outline"
                      className="border-red-200 dark:border-red-800/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-300 hover:border-red-300 dark:hover:border-red-700"
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
        
        {/* Donation Section - Show when books are present */}
        {!isLoading && savedBooks.length > 0 && (
          <div className="mt-12 bg-gradient-to-br from-pink-50 to-purple-50 dark:from-pink-900/20 dark:to-purple-900/20 rounded-xl p-8 text-center border border-pink-200 dark:border-pink-800">
            <div className="max-w-md mx-auto">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Love ShelfScanner? 💖
              </h3>
              <p className="text-gray-600 dark:text-gray-300 text-sm mb-6 leading-relaxed">
                Help us keep your reading list growing! Your support keeps our book recommendations 
                flowing and ShelfScanner free for everyone.
              </p>
              <DonationButton 
                onClick={() => setDonationModalOpen(true)} 
                variant="default"
                className="mx-auto"
              />
            </div>
          </div>
        )}
      </div>
      
      {/* Donation Modal */}
      <DonationModal 
        isOpen={donationModalOpen} 
        onClose={() => setDonationModalOpen(false)} 
      />
    </div>
  );
}