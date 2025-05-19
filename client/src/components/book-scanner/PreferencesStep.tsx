import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface PreferencesStepProps {
  preferences: {
    genres: string[];
    readingFrequency: string;
    authors: string[];
  };
  onSubmit: (preferences: {
    genres: string[];
    readingFrequency: string;
    authors: string[];
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
  "History"
];

const readingFrequencies = [
  "Daily",
  "Weekly",
  "Monthly",
  "Occasionally"
];

export default function PreferencesStep({ preferences, onSubmit, isLoading }: PreferencesStepProps) {
  const [selectedGenres, setSelectedGenres] = useState<string[]>(preferences.genres || []);
  const [selectedFrequency, setSelectedFrequency] = useState<string>(preferences.readingFrequency || '');
  const [authors, setAuthors] = useState<string[]>(preferences.authors || []);
  const [newAuthor, setNewAuthor] = useState<string>('');

  useEffect(() => {
    setSelectedGenres(preferences.genres || []);
    setSelectedFrequency(preferences.readingFrequency || '');
    setAuthors(preferences.authors || []);
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

  const handleSubmit = () => {
    onSubmit({
      genres: selectedGenres,
      readingFrequency: selectedFrequency,
      authors
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Tell us about your reading preferences</h3>

        {/* Genres */}
        <div className="mb-6">
          <Label className="block text-sm font-medium text-neutral-700 mb-2">
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
                    ? 'bg-primary-100 text-primary-700 border-primary-300'
                    : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'
                }`}
              >
                {genre}
              </button>
            ))}
          </div>
        </div>

        {/* Reading Frequency */}
        <div className="mb-6">
          <Label className="block text-sm font-medium text-neutral-700 mb-2">
            How often do you read?
          </Label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {readingFrequencies.map(frequency => (
              <button
                key={frequency}
                type="button"
                onClick={() => setSelectedFrequency(frequency)}
                className={`px-3 py-2 border rounded-md text-sm font-medium transition-colors ${
                  selectedFrequency === frequency
                    ? 'bg-primary-100 text-primary-700 border-primary-300'
                    : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'
                }`}
              >
                {frequency}
              </button>
            ))}
          </div>
        </div>

        {/* Favorite Authors */}
        <div>
          <Label className="block text-sm font-medium text-neutral-700 mb-2">
            Any favorite authors? (Optional)
          </Label>
          <div className="flex">
            <input
              type="text"
              value={newAuthor}
              onChange={e => setNewAuthor(e.target.value)}
              placeholder="Enter author name"
              className="flex-1 px-3 py-2 border border-neutral-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            <button
              type="button"
              onClick={addAuthor}
              disabled={!newAuthor.trim()}
              className="bg-primary-600 text-white px-4 py-2 rounded-r-md hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>
          
          {authors.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {authors.map(author => (
                <div key={author} className="bg-neutral-100 text-neutral-800 px-3 py-1 rounded-full text-sm flex items-center">
                  {author}
                  <button
                    type="button"
                    onClick={() => removeAuthor(author)}
                    className="ml-2 text-neutral-500 hover:text-neutral-700"
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
          disabled={isLoading || selectedGenres.length === 0 || !selectedFrequency}
        >
          {isLoading ? 'Saving...' : 'Continue'}
        </Button>
      </div>
    </div>
  );
}
