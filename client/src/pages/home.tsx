import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";

export default function Home() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-800 mb-1">
          Book Discovery
        </h1>
        <p className="text-neutral-500">
          Scan your bookshelf to get personalized recommendations
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center mb-6">
              <div className="bg-primary-100 text-primary-600 h-16 w-16 rounded-full mx-auto flex items-center justify-center mb-4">
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
                  className="h-8 w-8"
                >
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-neutral-800">Book Scanner</h2>
              <p className="mt-2 text-neutral-600 max-w-md mx-auto">
                Take a photo of your bookshelf and we'll identify your books to provide personalized recommendations.
              </p>
            </div>
            <div className="flex justify-center">
              <Link href="/books">
                <Button className="w-full sm:w-auto">
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
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  Start Scanning
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center mb-6">
              <div className="bg-secondary-100 text-secondary-600 h-16 w-16 rounded-full mx-auto flex items-center justify-center mb-4">
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
                  className="h-8 w-8"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <path d="M12 17h.01" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-neutral-800">How It Works</h2>
              <p className="mt-2 text-neutral-600 max-w-md mx-auto">
                Our app uses computer vision to identify books from your photos and matches them with your preferences to provide tailored recommendations.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div className="border border-neutral-200 rounded-lg p-4 text-center">
                <div className="bg-accent-100 text-accent-600 h-10 w-10 rounded-full mx-auto flex items-center justify-center mb-3">
                  <span className="font-semibold">1</span>
                </div>
                <h3 className="font-medium text-sm">Upload Photo</h3>
                <p className="text-xs text-neutral-500 mt-1">Take a photo of your bookshelf</p>
              </div>
              <div className="border border-neutral-200 rounded-lg p-4 text-center">
                <div className="bg-accent-100 text-accent-600 h-10 w-10 rounded-full mx-auto flex items-center justify-center mb-3">
                  <span className="font-semibold">2</span>
                </div>
                <h3 className="font-medium text-sm">Set Preferences</h3>
                <p className="text-xs text-neutral-500 mt-1">Tell us about your reading interests</p>
              </div>
              <div className="border border-neutral-200 rounded-lg p-4 text-center">
                <div className="bg-accent-100 text-accent-600 h-10 w-10 rounded-full mx-auto flex items-center justify-center mb-3">
                  <span className="font-semibold">3</span>
                </div>
                <h3 className="font-medium text-sm">Get Recommendations</h3>
                <p className="text-xs text-neutral-500 mt-1">Receive personalized book suggestions</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
