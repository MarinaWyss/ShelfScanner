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
    if (!file) return;

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
        
        toast({
          title: "Goodreads data imported",
          description: `Successfully imported ${parsedData.length} books from your Goodreads library`,
        });
      } catch (error) {
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

  // Simple CSV parser for Goodreads data
  const parseGoodreadsCSV = (csvText: string): any[] => {
    const lines = csvText.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    
    const result = [];
    
    // Only keep essential data for top rated books (max 100 entries)
    const maxEntries = 100;
    let entryCount = 0;
    
    for (let i = 1; i < lines.length && entryCount < maxEntries; i++) {
      if (!lines[i].trim()) continue;
      
      const values = lines[i].split(',');
      // Skip entries without rating or with low ratings
      const ratingIndex = headers.indexOf('My Rating');
      if (ratingIndex >= 0) {
        const rating = parseInt(values[ratingIndex] || '0');
        if (rating < 3) continue; // Only keep books rated 3 or higher
      }
      
      // Only store essential fields
      const essentialFields = ['Title', 'Author', 'My Rating', 'Bookshelves'];
      const entry: Record<string, string> = {};
      
      essentialFields.forEach(field => {
        const index = headers.indexOf(field);
        if (index >= 0) {
          entry[field] = values[index] ? values[index].trim() : '';
        }
      });
      
      if (Object.keys(entry).length > 0) {
        result.push(entry);
        entryCount++;
      }
    }
    
    console.log(`Processed ${entryCount} books from Goodreads data`);
    return result;
  };

  // Extract authors from Goodreads data
  const extractAuthors = (data: any[]): string[] => {
    const authors = data
      .filter(item => item['Author'] && item['My Rating'] && parseInt(item['My Rating']) >= 4)
      .map(item => item['Author']);
    
    // Use array methods to get unique values
    const uniqueAuthors = authors.filter((author, index) => 
      authors.indexOf(author) === index
    );
    
    return uniqueAuthors.slice(0, 10); // Return top 10 unique authors
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
    
    // Direct matches
    for (const genre of allGenres) {
      if (shelf.includes(genre.toLowerCase())) {
        return genre;
      }
    }
    
    // Common mappings
    if (shelf.includes('ya') || shelf.includes('young-adult')) return 'Young Adult';
    if (shelf.includes('sci-fi')) return 'Science Fiction';
    if (shelf.includes('scifi')) return 'Science Fiction';
    if (shelf.includes('biograph')) return 'Biography';
    if (shelf.includes('historic')) return 'History';
    if (shelf.includes('classic')) return 'Classics';
    if (shelf.includes('comic') || shelf.includes('graphic')) return 'Comics';
    if (shelf.includes('business') || shelf.includes('finance')) return 'Business';
    if (shelf.includes('tech') || shelf.includes('science')) return 'Science';
    
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
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4 text-foreground">Tell us about your reading preferences</h3>

        {/* Goodreads Import */}
        <Card className="p-4 mb-6 border-slate-700 bg-slate-800">
          <div className="flex flex-col">
            <Label className="block text-sm font-medium text-foreground mb-2">
              Import your Goodreads library (Optional)
            </Label>
            
            <p className="text-sm text-muted-foreground mb-3">
              Upload your Goodreads export to quickly set your preferences based on your reading history.
            </p>
            
            <div className="flex items-center">
              <div className="relative cursor-pointer">
                <Button 
                  variant="outline" 
                  disabled={uploading}
                  className="border-slate-600 text-foreground hover:bg-slate-700"
                  onClick={() => {
                    // Find the input element and trigger a click
                    const fileInput = document.getElementById('goodreads-csv-upload');
                    if (fileInput) {
                      fileInput.click();
                    }
                  }}
                >
                  {uploading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Processing...
                    </>
                  ) : (
                    <>
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
                        className="h-4 w-4 mr-2"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      Upload Goodreads CSV
                    </>
                  )}
                </Button>
                <input 
                  id="goodreads-csv-upload"
                  type="file" 
                  className="sr-only" 
                  accept=".csv" 
                  onChange={handleGoodreadsUpload}
                  disabled={uploading}
                />
              </div>
              
              {goodreadsData && (
                <span className="ml-3 text-sm text-green-400 flex items-center">
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
                    className="h-4 w-4 mr-1"
                  >
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  Imported {goodreadsData.length} books
                </span>
              )}
            </div>

            <div className="mt-2 text-xs text-muted-foreground">
              <p><a href="https://www.goodreads.com/review/import" className="text-primary underline" target="_blank" rel="noopener noreferrer">Export your Goodreads library</a> by going to "Import and Export" in your account settings</p>
            </div>
          </div>
        </Card>

        {/* Genres */}
        <div className="mb-6">
          <Label className="block text-sm font-medium text-foreground mb-2">
            What genres do you enjoy?
          </Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {allGenres.map(genre => (
              <button
                key={genre}
                type="button"
                onClick={() => toggleGenre(genre)}
                className={`px-3 py-2 border rounded-md text-sm font-medium transition-colors ${
                  selectedGenres.includes(genre)
                    ? 'bg-primary/20 text-primary border-primary/40'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
              >
                {genre}
              </button>
            ))}
          </div>
        </div>

        {/* Favorite Authors */}
        <div>
          <Label className="block text-sm font-medium text-foreground mb-2">
            Any favorite authors? (Optional)
          </Label>
          <div className="flex">
            <input
              type="text"
              value={newAuthor}
              onChange={e => setNewAuthor(e.target.value)}
              placeholder="Enter author name"
              className="flex-1 px-3 py-2 border bg-slate-800 border-slate-700 text-foreground rounded-l-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
            <button
              type="button"
              onClick={addAuthor}
              disabled={!newAuthor.trim()}
              className="bg-primary text-white px-4 py-2 rounded-r-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>
          
          {authors.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {authors.map(author => (
                <div key={author} className="bg-slate-700 text-slate-200 px-3 py-1 rounded-full text-sm flex items-center">
                  {author}
                  <button
                    type="button"
                    onClick={() => removeAuthor(author)}
                    className="ml-2 text-slate-400 hover:text-slate-200"
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
      </div>
      
      <div className="flex justify-end">
        <Button 
          onClick={handleSubmit}
          disabled={isLoading || selectedGenres.length === 0}
          className="bg-primary hover:bg-primary/90"
        >
          {isLoading ? 'Saving...' : 'Continue'}
        </Button>
      </div>
    </div>
  );
}
