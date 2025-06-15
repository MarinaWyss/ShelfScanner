import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import PreferencesStep from "@/components/book-scanner/PreferencesStep";
import UploadStep from "@/components/book-scanner/UploadStep";
import RecommendationsStep from "@/components/book-scanner/RecommendationsStep";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useDevice } from "@/contexts/DeviceContext";
import { Button } from "@/components/ui/button";

type Book = {
  id?: number;
  title: string;
  author: string;
  coverUrl: string;
  isbn?: string;
  metadata?: Record<string, unknown>;
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
  goodreadsData?: Record<string, unknown> | unknown[] | null;
};

export default function Books() {
  const [currentStep, setCurrentStep] = useState(1);
  const [userPreferences, setUserPreferences] = useState<Preference>({
    genres: [],
    authors: [],
    goodreadsData: null
  });
  const [detectedBooks, setDetectedBooks] = useState<Book[]>([]);
  const [currentRecommendations, setCurrentRecommendations] = useState<Recommendation[]>([]);
  const { toast } = useToast();

  // Get device ID from context
  const { deviceId, isLoading: deviceLoading } = useDevice();

  // Fetch existing preferences if any
  const { data: existingPreferences, isLoading: _preferencesLoading, error: _preferencesError, refetch: _refetchPreferences } = useQuery<{preferences: Preference}>({
    queryKey: ['/api/preferences', deviceId],
    queryFn: async () => {
      console.log('Fetching preferences for device ID:', deviceId);
      const response = await fetch(`/api/preferences?deviceId=${deviceId}`, {
        credentials: 'include'
      });
      if (!response.ok) {
        if (response.status === 404) {
          console.log('No existing preferences found');
          return { preferences: null };
        }
        throw new Error('Failed to fetch preferences');
      }
      const data = await response.json();
      console.log('Preferences fetched:', data);
      return data;
    },
    staleTime: 30000,
    enabled: !deviceLoading && !!deviceId, // Only run query when device ID is available
    retry: 1, // Retry once if it fails
    refetchOnWindowFocus: true, // Refetch when window gains focus (user returns to tab)
    refetchOnMount: true // Always refetch when component mounts
  });
  
  // Use effect to set preferences when they're loaded
  // This prevents the React state update during render issue
  useEffect(() => {
    if (existingPreferences?.preferences) {
      console.log('Setting user preferences from API:', existingPreferences.preferences);
      setUserPreferences({
        genres: existingPreferences.preferences.genres || [],
        authors: existingPreferences.preferences.authors || [],
        goodreadsData: existingPreferences.preferences.goodreadsData || null
      });
    }
  }, [existingPreferences]);

  // Save preferences
  const savePreferencesMutation = useMutation({
    mutationFn: async (preferences: Preference) => {
      console.log('Saving preferences for device ID:', deviceId, preferences);
      const response = await apiRequest('POST', `/api/preferences?deviceId=${deviceId}`, preferences);
      const result = await response.json();
      console.log('Preferences saved:', result);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/preferences', deviceId] });
      toast({
        title: "Success",
        description: "Your preferences have been saved!",
      });
      nextStep();
    },
    onError: (error) => {
      console.error('Error saving preferences:', error);
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

  // Generate recommendations using direct OpenAI integration for high-quality descriptions
  const recommendationsMutation = useMutation({
    mutationFn: async () => {
      if (!detectedBooks || detectedBooks.length === 0) {
        // If no books were detected, don't make the API call at all
        console.log("No books to send for recommendations");
        return [];
      }
      
      // Use the existing userPreferences from state
      // This includes genres, authors, and goodreadsData that were collected in the preferences step
      
      // Include the detected books and preferences in the request
      console.log("Sending books for OpenAI recommendations:", detectedBooks.length);
      const response = await apiRequest('POST', '/api/direct/recommendations', {
        books: detectedBooks,
        preferences: userPreferences
      });
      const data = await response.json();
      
      
      setCurrentRecommendations(data);
      
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
      console.log("Recommendation error details:", error);
      
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


  const handlePreferencesSubmit = (preferences: Preference) => {
    setUserPreferences(preferences);
    savePreferencesMutation.mutate(preferences);
  };

  const handleBooksDetected = (books: Book[], _imageBase64: string) => {
    console.log("Books detected:", books.length, "books");
    if (books && books.length > 0) {
      setDetectedBooks(books);
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

  const previousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Book Scanner</h1>
        <p className="text-gray-600 dark:text-gray-300 text-lg">
          Scan books to get personalized recommendations
        </p>
      </div>

      {/* Progress Bar */}
      <Card className="mb-8 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
        <CardContent className="p-4">
          <div className="w-full max-w-4xl mx-auto">
            <div className="flex justify-between items-center relative">
              {/* Progress Bar Line */}
              <div className="absolute top-1/2 transform -translate-y-1/2 h-0.5 bg-gray-200 dark:bg-gray-700 w-full"></div>
              <div className="absolute top-1/2 transform -translate-y-1/2 h-0.5 bg-violet-600 dark:bg-violet-500" style={{ width: `${((currentStep - 1) / 2) * 100}%` }}></div>

              {/* Steps */}
              <div className={`relative flex items-center justify-center w-10 h-10 rounded-full z-10 cursor-pointer transition-colors ${
                currentStep >= 1 
                  ? 'bg-violet-600 dark:bg-violet-500 text-white' 
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
              }`}
              onClick={() => setCurrentStep(1)}
              >
                1
              </div>
              <div className={`relative flex items-center justify-center w-10 h-10 rounded-full z-10 cursor-pointer transition-colors ${
                currentStep >= 2 
                  ? 'bg-violet-600 dark:bg-violet-500 text-white' 
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
              }`}
              onClick={() => currentStep >= 2 ? setCurrentStep(2) : null}
              >
                2
              </div>
              <div className={`relative flex items-center justify-center w-10 h-10 rounded-full z-10 cursor-pointer transition-colors ${
                currentStep >= 3 
                  ? 'bg-violet-600 dark:bg-violet-500 text-white' 
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
              }`}
              onClick={() => currentStep >= 3 ? setCurrentStep(3) : null}
              >
                3
              </div>
            </div>
            
            <div className="flex justify-between items-center mt-2 text-xs text-gray-600 dark:text-gray-300">
              <div className="text-center w-10">Preferences</div>
              <div className={`text-center w-10 ${currentStep >= 2 ? 'text-gray-900 dark:text-gray-200' : ''}`}>Book Upload</div>
              <div className={`text-center w-10 ${currentStep >= 3 ? 'text-gray-900 dark:text-gray-200' : ''}`}>Recommendations</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step Content */}
      <Card className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
        <CardContent className="p-6">
          {currentStep === 1 && (
            <PreferencesStep
              preferences={userPreferences}
              onSubmit={handlePreferencesSubmit}
              isLoading={savePreferencesMutation.isPending}
            />
          )}
          {currentStep === 2 && (
            <div>
              <UploadStep
                onBooksDetected={handleBooksDetected}
                detectedBooks={detectedBooks}
                onGetRecommendations={() => {
                  if (detectedBooks.length > 0) {
                    recommendationsMutation.mutate();
                  } else {
                    toast({
                      title: "No books selected",
                      description: "Please scan some books before getting recommendations.",
                      variant: "destructive"
                    });
                  }
                }}
                isLoading={recommendationsMutation.isPending}
              />
              {/* Back button for step 2 */}
              <div className="flex justify-start mt-6">
                <Button
                  variant="outline"
                  onClick={previousStep}
                  className="flex items-center gap-2"
                >
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className="h-4 w-4" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to Preferences
                </Button>
              </div>
            </div>
          )}
          {currentStep === 3 && (
            <div>
              <RecommendationsStep
                recommendations={currentRecommendations}
              />
              {/* Back button for step 3 */}
              <div className="flex justify-start mt-6">
                <Button
                  variant="outline"
                  onClick={previousStep}
                  className="flex items-center gap-2"
                >
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className="h-4 w-4" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to Book Upload
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
