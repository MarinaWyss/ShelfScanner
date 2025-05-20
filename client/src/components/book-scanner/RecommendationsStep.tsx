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

      {/* Top banner ad */}
      <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center shadow-sm">
        <div className="mr-4 flex-shrink-0">
          <svg className="w-10 h-10 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.555,13.662c-1.4.114-2.7.281-4.127.414s-2.86.293-4.32.293c-2.309,0-4.618-.146-6.918-.556l-.055-.01a.64.64,0,0,0-.37.061.7.7,0,0,0-.3.308.715.715,0,0,0,.339.894,25.793,25.793,0,0,0,8.506,2.791c.361.051.723.1,1.085.135l.021,0a.707.707,0,0,0,.784-.575.718.718,0,0,0-.564-.844,20.562,20.562,0,0,1-5.674-1.931.786.786,0,0,1,.338-1.5,30.413,30.413,0,0,1,3.951.415c2.411.331,4.823.683,7.281.858l.037,0a.7.7,0,0,0,.755-.6A.715.715,0,0,0,22.555,13.662Z" />
            <path d="M8.962,16.17a.7.7,0,0,0-1,.005C6.538,17.6,5.52,18.788,5.051,20.7a.716.716,0,0,0,.463.9.7.7,0,0,0,.9-.459C6.9,19.417,7.779,18.385,9.04,17.212l.084-.078A.714.714,0,0,0,8.962,16.17Z" />
            <path d="M15.956,16.6a.717.717,0,0,0-1.011.1c-1.6,1.99-3.025,3.834-4.668,5.229a.708.708,0,0,0-.139.989.7.7,0,0,0,.992.145c1.752-1.494,3.255-3.428,4.922-5.495A.715.715,0,0,0,15.956,16.6Z" />
          </svg>
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-amber-800">Amazon Kindle Unlimited</h4>
          <p className="text-sm text-amber-700">Unlimited reading access to over 1 million titles with a free trial</p>
        </div>
        <div className="ml-4">
          <a 
            href="https://www.amazon.com/kindle-dbs/fd/ku?tag=gratitudedriv-20"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-amber-400 hover:bg-amber-500 text-black px-3 py-2 rounded text-sm font-medium"
          >
            Try Free
          </a>
        </div>
      </div>
      
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
              {/* First book row */}
              {recommendations
                .filter(book => !isBookAlreadyRead(book))
                .slice(0, 3)
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
                      <a 
                        href={`https://www.amazon.com/s?k=${encodeURIComponent(book.title + ' ' + book.author)}&tag=gratitudedriv-20`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-amber-400 hover:bg-amber-500 text-black px-3 py-1 rounded text-sm font-medium flex items-center"
                      >
                        <svg 
                          className="w-4 h-4 mr-1" 
                          viewBox="0 0 24 24" 
                          fill="currentColor"
                        >
                          <path d="M22.555,13.662c-1.4.114-2.7.281-4.127.414s-2.86.293-4.32.293c-2.309,0-4.618-.146-6.918-.556l-.055-.01a.64.64,0,0,0-.37.061.7.7,0,0,0-.3.308.715.715,0,0,0,.339.894,25.793,25.793,0,0,0,8.506,2.791c.361.051.723.1,1.085.135l.021,0a.707.707,0,0,0,.784-.575.718.718,0,0,0-.564-.844,20.562,20.562,0,0,1-5.674-1.931.786.786,0,0,1,.338-1.5,30.413,30.413,0,0,1,3.951.415c2.411.331,4.823.683,7.281.858l.037,0a.7.7,0,0,0,.755-.6A.715.715,0,0,0,22.555,13.662Z" />
                          <path d="M8.962,16.17a.7.7,0,0,0-1,.005C6.538,17.6,5.52,18.788,5.051,20.7a.716.716,0,0,0,.463.9.7.7,0,0,0,.9-.459C6.9,19.417,7.779,18.385,9.04,17.212l.084-.078A.714.714,0,0,0,8.962,16.17Z" />
                          <path d="M15.956,16.6a.717.717,0,0,0-1.011.1c-1.6,1.99-3.025,3.834-4.668,5.229a.708.708,0,0,0-.139.989.7.7,0,0,0,.992.145c1.752-1.494,3.255-3.428,4.922-5.495A.715.715,0,0,0,15.956,16.6Z" />
                          <path d="M22.478,9.451c-.262-1.6-.576-3.2-1.022-4.771A.736.736,0,0,0,20.693,4.2a.7.7,0,0,0-.457.865c.416,1.493.73,3.03.967,4.567.053.344.1.689.148,1.034a.714.714,0,0,0,.8.609.7.7,0,0,0,.611-.8C22.627,10.14,22.553,9.8,22.478,9.451Z" />
                          <path d="M12.594,6.87a.7.7,0,0,0,.868-.5,28.841,28.841,0,0,0,.779-4.732.716.716,0,0,0-.725-.7.705.705,0,0,0-.7.729,27.705,27.705,0,0,1-.714,4.337A.713.713,0,0,0,12.594,6.87Z" />
                          <path d="M8.671,6.342a.7.7,0,0,0,.872.49.714.714,0,0,0,.49-.877C9.5,4.323,8.915,2.725,8.208,1.153A.712.712,0,0,0,7.324.71a.7.7,0,0,0-.444.883C7.565,3.131,8.129,4.672,8.671,6.342Z" />
                          <path d="M20.3,11.006a.7.7,0,0,0,.333-1.314A8.253,8.253,0,0,0,17.6,8.645a.708.708,0,0,0-.846.54.716.716,0,0,0,.54.851,6.792,6.792,0,0,1,2.477.836A.7.7,0,0,0,20.3,11.006Z" />
                          <path d="M17.647,10.651a.715.715,0,0,0,.382-.935A8.068,8.068,0,0,0,16.1,7.251a.715.715,0,0,0-1.007.1.705.705,0,0,0,.1,1,6.609,6.609,0,0,1,1.519,1.915A.7.7,0,0,0,17.647,10.651Z" />
                          <path d="M4.651,11.379a.707.707,0,0,0,.981.19A9.477,9.477,0,0,0,7.507,9.656a.713.713,0,0,0-.087-1,.7.7,0,0,0-1,.086,8.248,8.248,0,0,1-1.576,1.651A.716.716,0,0,0,4.651,11.379Z" />
                          <path d="M2.707,9.316a.716.716,0,0,0,.807.6,15.584,15.584,0,0,1,2.645-.3.713.713,0,0,0,.714-.716.7.7,0,0,0-.714-.714,17.058,17.058,0,0,0-2.859.325.713.713,0,0,0-.593.81Z" />
                        </svg>
                        Buy on Amazon
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Books you've already read section */}
          {recommendations.some(book => isBookAlreadyRead(book)) && (
            <div className="mt-10">
              {/* Mid-page ad banner */}
              <div className="mb-8 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 flex items-center shadow-sm">
                <div className="mr-4 flex-shrink-0">
                  <svg className="w-12 h-12 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M22.47,5.2C22,4.96,21.51,4.76,21,4.59v12.03C19.86,16.21,18.69,16,17.5,16c-1.9,0-3.78,0.54-5.5,1.58V5.48 C10.38,4.55,8.51,4,6.5,4C4.71,4,3.02,4.44,1.53,5.2C1.2,5.36,1,5.71,1,6.08v12.08c0,0.58,0.47,0.99,1,0.99 c0.16,0,0.32-0.04,0.48-0.12C3.69,18.4,5.05,18,6.5,18c2.07,0,3.98,0.82,5.5,2c1.52-1.18,3.43-2,5.5-2c1.45,0,2.81,0.4,4.02,1.04 c0.16,0.08,0.32,0.12,0.48,0.12c0.52,0,1-0.41,1-0.99V6.08C23,5.71,22.8,5.36,22.47,5.2z M10,16.62C8.86,16.21,7.69,16,6.5,16 c-1.19,0-2.36,0.21-3.5,0.62V6.71C4.11,6.24,5.28,6,6.5,6C7.7,6,8.89,6.25,10,6.72V16.62z M19,0.5l-5,5V15l5-4.5V0.5z"></path>
                  </svg>
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-blue-800">Audible Free Trial</h4>
                  <p className="text-sm text-blue-700">Try Audible Plus and get access to thousands of audiobooks and exclusive originals</p>
                </div>
                <div className="ml-4">
                  <a 
                    href="https://www.amazon.com/Audible-Free-Trial-Digital-Membership/dp/B00NB86OYE/?tag=gratitudedriv-20"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded text-sm font-medium"
                  >
                    Try Free
                  </a>
                </div>
              </div>
            
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
                        <a 
                          href={`https://www.amazon.com/s?k=${encodeURIComponent(book.title + ' ' + book.author)}&tag=gratitudedriv-20`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-amber-400 hover:bg-amber-500 text-black px-3 py-1 rounded text-sm font-medium flex items-center"
                        >
                          <svg 
                            className="w-4 h-4 mr-1" 
                            viewBox="0 0 24 24" 
                            fill="currentColor"
                          >
                            <path d="M22.555,13.662c-1.4.114-2.7.281-4.127.414s-2.86.293-4.32.293c-2.309,0-4.618-.146-6.918-.556l-.055-.01a.64.64,0,0,0-.37.061.7.7,0,0,0-.3.308.715.715,0,0,0,.339.894,25.793,25.793,0,0,0,8.506,2.791c.361.051.723.1,1.085.135l.021,0a.707.707,0,0,0,.784-.575.718.718,0,0,0-.564-.844,20.562,20.562,0,0,1-5.674-1.931.786.786,0,0,1,.338-1.5,30.413,30.413,0,0,1,3.951.415c2.411.331,4.823.683,7.281.858l.037,0a.7.7,0,0,0,.755-.6A.715.715,0,0,0,22.555,13.662Z" />
                            <path d="M8.962,16.17a.7.7,0,0,0-1,.005C6.538,17.6,5.52,18.788,5.051,20.7a.716.716,0,0,0,.463.9.7.7,0,0,0,.9-.459C6.9,19.417,7.779,18.385,9.04,17.212l.084-.078A.714.714,0,0,0,8.962,16.17Z" />
                            <path d="M15.956,16.6a.717.717,0,0,0-1.011.1c-1.6,1.99-3.025,3.834-4.668,5.229a.708.708,0,0,0-.139.989.7.7,0,0,0,.992.145c1.752-1.494,3.255-3.428,4.922-5.495A.715.715,0,0,0,15.956,16.6Z" />
                            <path d="M22.478,9.451c-.262-1.6-.576-3.2-1.022-4.771A.736.736,0,0,0,20.693,4.2a.7.7,0,0,0-.457.865c.416,1.493.73,3.03.967,4.567.053.344.1.689.148,1.034a.714.714,0,0,0,.8.609.7.7,0,0,0,.611-.8C22.627,10.14,22.553,9.8,22.478,9.451Z" />
                            <path d="M12.594,6.87a.7.7,0,0,0,.868-.5,28.841,28.841,0,0,0,.779-4.732.716.716,0,0,0-.725-.7.705.705,0,0,0-.7.729,27.705,27.705,0,0,1-.714,4.337A.713.713,0,0,0,12.594,6.87Z" />
                            <path d="M8.671,6.342a.7.7,0,0,0,.872.49.714.714,0,0,0,.49-.877C9.5,4.323,8.915,2.725,8.208,1.153A.712.712,0,0,0,7.324.71a.7.7,0,0,0-.444.883C7.565,3.131,8.129,4.672,8.671,6.342Z" />
                            <path d="M20.3,11.006a.7.7,0,0,0,.333-1.314A8.253,8.253,0,0,0,17.6,8.645a.708.708,0,0,0-.846.54.716.716,0,0,0,.54.851,6.792,6.792,0,0,1,2.477.836A.7.7,0,0,0,20.3,11.006Z" />
                            <path d="M17.647,10.651a.715.715,0,0,0,.382-.935A8.068,8.068,0,0,0,16.1,7.251a.715.715,0,0,0-1.007.1.705.705,0,0,0,.1,1,6.609,6.609,0,0,1,1.519,1.915A.7.7,0,0,0,17.647,10.651Z" />
                            <path d="M4.651,11.379a.707.707,0,0,0,.981.19A9.477,9.477,0,0,0,7.507,9.656a.713.713,0,0,0-.087-1,.7.7,0,0,0-1,.086,8.248,8.248,0,0,1-1.576,1.651A.716.716,0,0,0,4.651,11.379Z" />
                            <path d="M2.707,9.316a.716.716,0,0,0,.807.6,15.584,15.584,0,0,1,2.645-.3.713.713,0,0,0,.714-.716.7.7,0,0,0-.714-.714,17.058,17.058,0,0,0-2.859.325.713.713,0,0,0-.593.81Z" />
                          </svg>
                          Buy on Amazon
                        </a>
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
