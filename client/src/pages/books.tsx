import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import PreferencesStep from "@/components/book-scanner/PreferencesStep";
import UploadStep from "@/components/book-scanner/UploadStep";
import RecommendationsStep from "@/components/book-scanner/RecommendationsStep";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Book = {
  id?: number;
  title: string;
  author: string;
  coverUrl: string;
  isbn?: string;
  metadata?: any;
};

type Recommendation = {
  id?: number;
  title: string;
  author: string;
  coverUrl: string;
  rating: string;
  summary: string;
};

type Preference = {
  genres: string[];
  readingFrequency: string;
  authors: string[];
};

export default function Books() {
  const [currentStep, setCurrentStep] = useState(1);
  const [userPreferences, setUserPreferences] = useState<Preference>({
    genres: [],
    readingFrequency: '',
    authors: []
  });
  const [detectedBooks, setDetectedBooks] = useState<Book[]>([]);
  const [bookImageBase64, setBookImageBase64] = useState<string>('');
  const { toast } = useToast();

  // Fetch existing preferences if any
  const { data: existingPreferences } = useQuery({
    queryKey: ['/api/preferences'],
    onSuccess: (data) => {
      if (data) {
        setUserPreferences({
          genres: data.genres || [],
          readingFrequency: data.readingFrequency || '',
          authors: data.authors || []
        });
      }
    }
  });

  // Save preferences
  const savePreferencesMutation = useMutation({
    mutationFn: async (preferences: Preference) => {
      const response = await apiRequest('POST', '/api/preferences', preferences);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/preferences'] });
      nextStep();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to save preferences: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive"
      });
    }
  });

  // Save detected books
  const saveBooksMutation = useMutation({
    mutationFn: async (books: Book[]) => {
      const response = await apiRequest('POST', '/api/books', books);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/books'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to save books: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive"
      });
    }
  });

  // Generate recommendations
  const recommendationsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/recommendations', {});
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/recommendations'] });
      nextStep();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to generate recommendations: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive"
      });
    }
  });

  // Fetch recommendations
  const { data: recommendations, isLoading: recommendationsLoading } = useQuery<Recommendation[]>({
    queryKey: ['/api/recommendations'],
    enabled: currentStep === 3,
  });

  const handlePreferencesSubmit = (preferences: Preference) => {
    setUserPreferences(preferences);
    savePreferencesMutation.mutate(preferences);
  };

  const handleBooksDetected = (books: Book[], imageBase64: string) => {
    setDetectedBooks(books);
    setBookImageBase64(imageBase64);
    saveBooksMutation.mutate(books);
    recommendationsMutation.mutate();
  };

  const nextStep = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-800 mb-1">Book Scanner</h1>
        <p className="text-neutral-500">
          Scan books to get personalized recommendations
        </p>
      </div>

      {/* Progress Bar */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center mb-6">
            <div className="flex-1">
              <div className="relative">
                <div className="h-1 bg-neutral-200 rounded-full w-full"></div>
                <div 
                  className="absolute inset-y-0 left-0 bg-primary-600 rounded-full"
                  style={{ width: `${(currentStep / 3) * 100}%` }}
                ></div>
              </div>
              <div className="flex justify-between mt-2">
                <span className={`text-sm ${currentStep >= 1 ? 'text-primary-600 font-medium' : 'text-neutral-500'}`}>
                  Preferences
                </span>
                <span className={`text-sm ${currentStep >= 2 ? 'text-primary-600 font-medium' : 'text-neutral-500'}`}>
                  Book Upload
                </span>
                <span className={`text-sm ${currentStep >= 3 ? 'text-primary-600 font-medium' : 'text-neutral-500'}`}>
                  Recommendations
                </span>
              </div>
            </div>
          </div>

          {/* Step 1: Preferences */}
          {currentStep === 1 && (
            <PreferencesStep 
              preferences={userPreferences}
              onSubmit={handlePreferencesSubmit}
              isLoading={savePreferencesMutation.isPending}
            />
          )}

          {/* Step 2: Book Upload */}
          {currentStep === 2 && (
            <UploadStep 
              onBooksDetected={handleBooksDetected}
              detectedBooks={detectedBooks}
            />
          )}

          {/* Step 3: Recommendations */}
          {currentStep === 3 && (
            <RecommendationsStep 
              recommendations={recommendations || []}
              isLoading={recommendationsLoading}
            />
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-8">
            <button 
              onClick={prevStep}
              disabled={currentStep === 1}
              className={`px-4 py-2 border border-neutral-300 rounded-md text-sm font-medium ${
                currentStep === 1 
                  ? 'text-neutral-400 cursor-not-allowed' 
                  : 'text-neutral-700 hover:bg-neutral-50 transition-colors'
              }`}
            >
              Back
            </button>
            {currentStep === 1 && (
              <button 
                onClick={() => savePreferencesMutation.mutate(userPreferences)}
                disabled={savePreferencesMutation.isPending || userPreferences.genres.length === 0 || !userPreferences.readingFrequency}
                className={`px-4 py-2 bg-primary-600 text-white rounded-md text-sm font-medium ${
                  savePreferencesMutation.isPending || userPreferences.genres.length === 0 || !userPreferences.readingFrequency
                    ? 'opacity-70 cursor-not-allowed' 
                    : 'hover:bg-primary-700 transition-colors'
                }`}
              >
                {savePreferencesMutation.isPending ? 'Saving...' : 'Continue'}
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
