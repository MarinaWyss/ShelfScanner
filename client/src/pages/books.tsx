import React, { useState, useEffect } from "react";
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
  authors: string[];
  goodreadsData?: any;
};

export default function Books() {
  const [currentStep, setCurrentStep] = useState(1);
  const [userPreferences, setUserPreferences] = useState<Preference>({
    genres: [],
    authors: [],
    goodreadsData: null
  });
  const [detectedBooks, setDetectedBooks] = useState<Book[]>([]);
  const [bookImageBase64, setBookImageBase64] = useState<string>('');
  const { toast } = useToast();

  // Fetch existing preferences if any
  const { data: existingPreferences } = useQuery<Preference>({
    queryKey: ['/api/preferences'],
    staleTime: 30000
  });
  
  // Use effect to set preferences when they're loaded
  // This prevents the React state update during render issue
  useEffect(() => {
    if (existingPreferences && existingPreferences.genres) {
      setUserPreferences({
        genres: existingPreferences.genres || [],
        authors: existingPreferences.authors || [],
        goodreadsData: existingPreferences.goodreadsData || null
      });
    }
  }, [existingPreferences]);

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
      if (!detectedBooks || detectedBooks.length === 0) {
        // If no books were detected, don't make the API call at all
        console.log("No books to send for recommendations");
        return [];
      }
      
      // Include the detected books in the request
      console.log("Sending books for recommendations:", detectedBooks.length);
      const response = await apiRequest('POST', '/api/recommendations', {
        books: detectedBooks
      });
      return response.json();
    },
    onSuccess: (data) => {
      console.log("Successfully created recommendations:", data);
      queryClient.invalidateQueries({ queryKey: ['/api/recommendations'] });
      
      if (data && (Array.isArray(data) && data.length > 0)) {
        nextStep(); // Only proceed if we got actual recommendations
      } else {
        toast({
          title: "No recommendations",
          description: "We couldn't generate recommendations based on the detected books. Try another photo with more visible book spines.",
          variant: "destructive"
        });
      }
    },
    onError: (error) => {
      // Handle the error silently without showing the "No books provided" error to user
      console.error("Recommendation error details:", error);
      
      // Only show errors that are not the "No books provided" error
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes("No books provided")) {
        toast({
          title: "Error",
          description: `Failed to generate recommendations: ${errorMessage}`,
          variant: "destructive"
        });
      }
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
    console.log("Books detected:", books.length, "books");
    if (books && books.length > 0) {
      setDetectedBooks(books);
      setBookImageBase64(imageBase64);
      saveBooksMutation.mutate(books);
      
      // No longer automatically process recommendations
      // Let the user review the detected books and click the button manually
      toast({
        title: "Books detected!",
        description: `We found ${books.length} book${books.length === 1 ? '' : 's'}. Review them and click 'Get Recommendations' when ready.`,
      });
    } else {
      toast({
        title: "No books detected",
        description: "Unable to detect any books in the image. Please try another photo with clearer book spines.",
        variant: "destructive"
      });
    }
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
        <h1 className="text-2xl font-bold text-foreground mb-1">Book Scanner</h1>
        <p className="text-muted-foreground">
          Scan books to get personalized recommendations
        </p>
      </div>

      {/* Progress Bar */}
      <Card className="mb-6 border-slate-700 bg-slate-800 shadow-lg">
        <CardContent className="pt-6">
          <div className="flex items-center mb-6">
            <div className="flex-1">
              <div className="relative">
                <div className="h-1 bg-slate-700 rounded-full w-full"></div>
                <div 
                  className="absolute inset-y-0 left-0 bg-primary rounded-full"
                  style={{ width: `${(currentStep / 3) * 100}%` }}
                ></div>
              </div>
              <div className="flex justify-between mt-2">
                <span className={`text-sm ${currentStep >= 1 ? 'text-primary font-medium' : 'text-slate-400'}`}>
                  Preferences
                </span>
                <span className={`text-sm ${currentStep >= 2 ? 'text-primary font-medium' : 'text-slate-400'}`}>
                  Book Upload
                </span>
                <span className={`text-sm ${currentStep >= 3 ? 'text-primary font-medium' : 'text-slate-400'}`}>
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
              goodreadsData={userPreferences.goodreadsData}
            />
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-8">
            <button 
              onClick={prevStep}
              disabled={currentStep === 1}
              className={`px-4 py-2 border rounded-md text-sm font-medium ${
                currentStep === 1 
                  ? 'text-slate-600 border-slate-700 cursor-not-allowed' 
                  : 'text-slate-300 border-slate-600 hover:bg-slate-700 transition-colors'
              }`}
            >
              Back
            </button>
            {/* Continue button for steps 2 and 3 only - step 1 has its own button */}
            {currentStep === 2 && (
              <button 
                onClick={() => recommendationsMutation.mutate()}
                disabled={detectedBooks.length === 0 || recommendationsMutation.isPending}
                className={`px-4 py-2 bg-primary text-white rounded-md text-sm font-medium ${
                  detectedBooks.length === 0 || recommendationsMutation.isPending
                    ? 'opacity-70 cursor-not-allowed' 
                    : 'hover:bg-primary/90 transition-colors'
                }`}
              >
                {recommendationsMutation.isPending ? 'Processing...' : 'Get Recommendations'}
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
