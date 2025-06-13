import { useState, useEffect, ChangeEvent, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

interface PreferencesStepProps {
  preferences: {
    genres: string[];
    authors: string[];
    goodreadsData?: any;
  };
  onSubmit: (preferences: {
    genres: string[];
    authors: string[];
    goodreadsData?: any;
  }) => void;
  isLoading: boolean;
}

const allGenres = [
  "Fiction", 
  "Non-Fiction", 
  "Business", 
  "Design", 
  "Self-Help", 
  "Science",
  "Mystery", 
  "Romance", 
  "Fantasy", 
  "Science Fiction",
  "Biography", 
  "History",
  "Young Adult",
  "Thriller",
  "Horror",
  "Poetry",
  "Classics",
  "Comics"
];

export default function PreferencesStep({ preferences, onSubmit, isLoading }: PreferencesStepProps) {
  const [selectedGenres, setSelectedGenres] = useState<string[]>(preferences.genres || []);
  const [authors, setAuthors] = useState<string[]>(preferences.authors || []);
  const [newAuthor, setNewAuthor] = useState<string>('');
  const [goodreadsData, setGoodreadsData] = useState<any>(preferences.goodreadsData || null);
  const [uploading, setUploading] = useState<boolean>(false);

  useEffect(() => {
    setSelectedGenres(preferences.genres || []);
    setAuthors(preferences.authors || []);
    setGoodreadsData(preferences.goodreadsData || null);
  }, [preferences]);

  const toggleGenre = (genre: string) => {
    if (selectedGenres.includes(genre)) {
      setSelectedGenres(selectedGenres.filter(g => g !== genre));
    } else {
      setSelectedGenres([...selectedGenres, genre]);
    }
  };

  const addAuthor = () => {
    if (newAuthor.trim() && !authors.includes(newAuthor.trim())) {
      setAuthors([...authors, newAuthor.trim()]);
      setNewAuthor('');
    }
  };

  const removeAuthor = (author: string) => {
    setAuthors(authors.filter(a => a !== author));
  };

  const handleGoodreadsUpload = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {return;}

    // Check if it's a CSV file
    if (!file.name.endsWith('.csv')) {
      toast({
        title: "Invalid file type",
        description: "Please upload a CSV file exported from Goodreads",
        variant: "destructive"
      });
      return;
    }

    setUploading(true);

    // Read file as text
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const csvText = event.target?.result as string;
        const parsedData = parseGoodreadsCSV(csvText);
        
        // Extract favorite authors and genres from Goodreads data
        const goodreadsAuthors = extractAuthors(parsedData);
        const goodreadsGenres = extractGenres(parsedData);
        
        // Update states with extracted data
        setAuthors(prev => {
          // Create a combined array with all authors (previous and new)
          const allAuthors = [...prev, ...goodreadsAuthors];
          // Filter to only keep unique values
          return allAuthors.filter((author, index) => 
            allAuthors.indexOf(author) === index
          );
        });
        
        setSelectedGenres(prev => {
          // Create a combined array with all genres (previous and new)
          const allGenres = [...prev, ...goodreadsGenres];
          // Filter to only keep unique values
          return allGenres.filter((genre, index) => 
            allGenres.indexOf(genre) === index
          );
        });
        
        // Store the raw parsed data
        setGoodreadsData(parsedData);
      } catch {
        toast({
          title: "Import failed",
          description: "Failed to parse Goodreads CSV file. Please ensure it's a valid export.",
          variant: "destructive"
        });
      } finally {
        setUploading(false);
      }
    };
    
    reader.onerror = () => {
      toast({
        title: "Import failed",
        description: "Failed to read the file. Please try again.",
        variant: "destructive"
      });
      setUploading(false);
    };
    
    reader.readAsText(file);
  }, []);

  // Advanced CSV parser for Goodreads data
  const parseGoodreadsCSV = (csvText: string): any[] => {
    try {
      // Split into lines, being careful with Windows/Unix line endings
      const lines = csvText.split(/\r?\n/);
      if (lines.length === 0) {return [];}
      
      // Extract headers from first line
      const headerLine = lines[0];
      const headers = parseCSVLine(headerLine);
      
      const result = [];
      
      // Track indices for fields we care about to avoid repeatedly searching
      const titleIndex = headers.indexOf('Title');
      const authorIndex = headers.indexOf('Author');
      const ratingIndex = headers.indexOf('My Rating');
      const bookshelvesIndex = headers.indexOf('Bookshelves');
      
      // Process all lines (except header)
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) {continue;}
        
        // Parse this line, handling quotes and commas properly
        const values = parseCSVLine(lines[i]);
        if (values.length < headers.length) {continue;} // Malformed line
        
        // Create an entry with just the fields we need
        const entry: Record<string, string> = {};
        
        if (titleIndex >= 0 && titleIndex < values.length) {
          entry['Title'] = values[titleIndex].trim();
        }
        
        if (authorIndex >= 0 && authorIndex < values.length) {
          entry['Author'] = values[authorIndex].trim();
        }
        
        if (ratingIndex >= 0 && ratingIndex < values.length) {
          entry['My Rating'] = values[ratingIndex].trim();
        }
        
        if (bookshelvesIndex >= 0 && bookshelvesIndex < values.length) {
          entry['Bookshelves'] = values[bookshelvesIndex].trim();
        }
        
        if (entry['Title']) { // Only require a title to include the book
          result.push(entry);
        }
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`Processed ${result.length} books from Goodreads data`);
      }
      return result;
    } catch (error) {
              if (process.env.NODE_ENV === 'development') {
          console.log("Error parsing CSV:", error);
        }
      return [];
    }
  };
  
  // Helper function to properly parse a CSV line with quoted values
  const parseCSVLine = (line: string): string[] => {
    const values = [];
    let inQuote = false;
    let currentValue = '';
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        // Toggle quote state, but check if it's an escaped quote
        if (i + 1 < line.length && line[i + 1] === '"') {
          // This is an escaped quote inside a quoted field
          currentValue += '"';
          i++; // Skip the next quote
        } else {
          // Toggle quote state
          inQuote = !inQuote;
        }
      } else if (char === ',' && !inQuote) {
        // End of value
        values.push(currentValue);
        currentValue = '';
      } else {
        // Regular character
        currentValue += char;
      }
    }
    
    // Add the last value
    values.push(currentValue);
    
    return values;
  };

  // Extract authors from Goodreads data using a weighted approach
  const extractAuthors = (data: any[]): string[] => {
    // Create a map to track author statistics
    const authorStats: Record<string, { count: number; totalRating: number; avgRating: number }> = {};
    
    // Process each book in the data
    data.forEach(item => {
      const author = item['Author'];
      const rating = item['My Rating'] ? parseInt(item['My Rating']) : 0;
      
      if (author) {
        // Initialize if this is the first book by this author
        if (!authorStats[author]) {
          authorStats[author] = { count: 0, totalRating: 0, avgRating: 0 };
        }
        
        // Increment count and add rating
        authorStats[author].count += 1;
        authorStats[author].totalRating += rating;
        
        // Calculate average rating
        authorStats[author].avgRating = authorStats[author].totalRating / authorStats[author].count;
      }
    });
    
    // Convert to array for sorting
    const authors = Object.keys(authorStats).map(author => ({
      name: author,
      count: authorStats[author].count,
      avgRating: authorStats[author].avgRating,
      // Calculate a score that weights both quantity read and quality of ratings
      // This formula prioritizes authors with multiple highly-rated books
      score: authorStats[author].count * (authorStats[author].avgRating / 5) * 10
    }));
    
    // Sort by score (highest first)
    authors.sort((a, b) => b.score - a.score);
    
    // Only include authors with at least one book rated 4+ or multiple books
    const qualifiedAuthors = authors.filter(author => 
      author.avgRating >= 4 || author.count >= 2
    );
    
    if (process.env.NODE_ENV === 'development') {
      console.log("Top authors from Goodreads:", qualifiedAuthors.slice(0, 10));
    }
    
    // Return names of top 10 authors
    return qualifiedAuthors.slice(0, 10).map(author => author.name);
  };

  // Extract genres from Goodreads data
  const extractGenres = (data: any[]): string[] => {
    const genreMap: Record<string, number> = {};
    
    data.forEach(item => {
      if (item['Bookshelves'] && item['My Rating'] && parseInt(item['My Rating']) >= 4) {
        // Split the bookshelves string into individual shelves
        let shelves: string[] = [];
        if (typeof item['Bookshelves'] === 'string') {
          shelves = item['Bookshelves'].split(';').map((s: string) => s.trim());
        }
        
        // Process each shelf
        shelves.forEach((shelf: string) => {
          // Convert shelf names to match our genre list
          const genre = mapShelfToGenre(shelf);
          if (genre && allGenres.includes(genre)) {
            genreMap[genre] = (genreMap[genre] || 0) + 1;
          }
        });
      }
    });
    
    // Sort genres by frequency and return top 5
    const sortedGenres = Object.keys(genreMap).sort(
      (a, b) => (genreMap[b] || 0) - (genreMap[a] || 0)
    );
    
    return sortedGenres.slice(0, 5); // Return top 5 genres
  };

  // Map Goodreads shelves to our genre list
  const mapShelfToGenre = (shelf: string): string | null => {
    shelf = shelf.toLowerCase();
    
    // Handle Science Fiction first to avoid confusion with Science
    if (shelf.includes('sci-fi') || shelf.includes('scifi') || shelf.includes('science-fiction') || shelf.includes('science_fiction')) {
      return 'Science Fiction';
    }
    
    // Direct matches
    for (const genre of allGenres) {
      if (shelf.includes(genre.toLowerCase())) {
        return genre;
      }
    }
    
    // Common mappings (put Science after Science Fiction check)
    if (shelf.includes('ya') || shelf.includes('young-adult')) {return 'Young Adult';}
    if (shelf.includes('biograph')) {return 'Biography';}
    if (shelf.includes('historic')) {return 'History';}
    if (shelf.includes('classic')) {return 'Classics';}
    if (shelf.includes('comic') || shelf.includes('graphic')) {return 'Comics';}
    if (shelf.includes('business') || shelf.includes('finance')) {return 'Business';}
    
    // Be more specific about Science - only match pure science terms, not science fiction
    if (shelf === 'science' || shelf.includes('physics') || shelf.includes('chemistry') || 
        shelf.includes('biology') || shelf.includes('mathematics') || shelf.includes('technology') ||
        shelf === 'tech' || shelf.includes('engineering') || shelf.includes('popular-science') ||
        shelf.includes('popular_science')) {
      return 'Science';
    }
    
    return null;
  };

  const handleSubmit = () => {
    onSubmit({
      genres: selectedGenres,
      authors,
      goodreadsData
    });
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Tell us about your reading preferences</h2>
        <p className="text-gray-600 dark:text-gray-300">Select genres that interest you to help us provide better recommendations.</p>
      </div>

      <div className="mb-8">
        <Label className="block mb-2 font-medium text-gray-900 dark:text-white">Select your favorite genres</Label>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {allGenres.map((genre) => (
            <button
              key={genre}
              type="button"
              onClick={() => toggleGenre(genre)}
              className={`h-10 px-4 text-sm border rounded-md text-left transition-colors ${
                selectedGenres.includes(genre)
                  ? 'bg-violet-100 border-violet-300 text-violet-900 dark:bg-violet-900 dark:border-violet-700 dark:text-violet-100'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {genre}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-8">
        <Label htmlFor="author-input" className="block mb-2 font-medium text-gray-900 dark:text-white">Add favorite authors (optional)</Label>
        <div className="flex gap-3">
          <input
            id="author-input"
            type="text"
            value={newAuthor}
            onChange={(e) => setNewAuthor(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addAuthor()}
            className="flex-1 h-10 px-3 border border-gray-200 dark:border-gray-700 rounded-md text-gray-900 dark:text-white bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            placeholder="Type an author's name"
          />
          <Button
            type="button"
            onClick={addAuthor}
            variant="outline"
            className="border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
          >
            Add
          </Button>
        </div>
        
        {authors.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {authors.map(author => (
              <div key={author} className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-3 py-1 rounded-full text-sm flex items-center">
                {author}
                <button
                  type="button"
                  onClick={() => removeAuthor(author)}
                  className="ml-2 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"
                >
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    width="16" 
                    height="16" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    className="h-3 w-3"
                  >
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      
      <div className="mb-8">
        <Card className="p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
          <div className="mb-2">
            <h3 className="font-medium text-gray-900 dark:text-white mb-1">Import your Goodreads library (Optional)</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">Upload your Goodreads export to quickly set your preferences based on your reading history.</p>
          </div>
          <div className="mt-3">
            <label className="inline-block">
              <span className="sr-only">Choose file</span>
              <input 
                type="file" 
                accept=".csv"
                onChange={handleGoodreadsUpload}
                className="block w-full text-sm text-gray-500 dark:text-gray-400
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-md file:border-0
                  file:text-sm file:font-medium
                  file:bg-violet-50 file:text-violet-700
                  dark:file:bg-violet-900/30 dark:file:text-violet-300
                  hover:file:bg-violet-100 dark:hover:file:bg-violet-800/30"
              />
            </label>
            {uploading && <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Processing your file...</p>}
            {goodreadsData && <p className="mt-2 text-sm text-violet-600 dark:text-violet-400">✓ Goodreads data imported successfully!</p>}
          </div>
        </Card>
      </div>
      
      <div className="flex justify-end">
        <Button 
          onClick={handleSubmit}
          disabled={isLoading || selectedGenres.length === 0}
          className="bg-violet-600 hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500 text-white"
        >
          {isLoading ? 'Saving...' : 'Continue'}
        </Button>
      </div>
    </div>
  );
}
