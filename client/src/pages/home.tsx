import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";

export default function Home() {
  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-6xl mx-auto">
      <div className="mb-10 max-w-3xl">
        <h1 className="text-4xl font-bold text-gray-900 mb-3">
          AI bookshelf scanner and book recommender
        </h1>
        <p className="text-xl text-gray-600 mb-6">
          Find the perfect book for you.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/books">
            <Button className="bg-violet-600 hover:bg-violet-700 text-white font-medium">
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
      </div>

      <div className="my-12">
        <Card className="border border-gray-200 bg-white shadow-sm overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-start">
              <div className="bg-violet-50 text-violet-300 h-10 w-10 rounded-full flex items-center justify-center mr-4 shrink-0">
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
                  className="h-5 w-5"
                >
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">AI Book Discovery</h2>
                <p className="text-gray-600 mt-1">
                  Take a photo of an entire bookshelf at stores, the library, or a friend's house, and we'll help you figure out which ones you'll like!
                </p>
                <Link href="/books" className="flex items-center text-black hover:text-gray-800 font-medium text-sm mt-3">
                  <span>Start scanning</span>
                  <svg className="ml-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-16">
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-5">
            <div className="flex items-center mb-3">
              <div className="bg-amber-100 text-amber-600 h-8 w-8 rounded-full flex items-center justify-center mr-3">
                <span className="font-semibold">1</span>
              </div>
              <h3 className="font-medium text-gray-900">Upload Photo</h3>
            </div>
            <p className="text-sm text-gray-600">Take a photo of an entire bookshelf and our AI will identify each book.</p>
          </div>
          
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-5">
            <div className="flex items-center mb-3">
              <div className="bg-amber-100 text-amber-600 h-8 w-8 rounded-full flex items-center justify-center mr-3">
                <span className="font-semibold">2</span>
              </div>
              <h3 className="font-medium text-gray-900">Set Preferences</h3>
            </div>
            <p className="text-sm text-gray-600">Tell us about your reading interests and preferences to improve recommendations.</p>
          </div>
          
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-5">
            <div className="flex items-center mb-3">
              <div className="bg-amber-100 text-amber-600 h-8 w-8 rounded-full flex items-center justify-center mr-3">
                <span className="font-semibold">3</span>
              </div>
              <h3 className="font-medium text-gray-900">Find Matching Books</h3>
            </div>
            <p className="text-sm text-gray-600">Discover which books best match your taste with our AI-powered recommendations.</p>
          </div>
        </div>
      </div>

      <div className="mt-16 text-center">
        <div className="inline-flex justify-center items-center bg-violet-50 text-violet-300 h-12 w-12 rounded-full mb-4">
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
            className="h-6 w-6"
          >
            <path d="M12 3v12"></path>
            <path d="m8 11 4 4 4-4"></path>
            <path d="M8 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4"></path>
          </svg>
        </div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-3">Start Using ShelfScanner Today</h2>
        <p className="text-gray-600 max-w-xl mx-auto mb-6">
          Never miss a great book again. Our app helps you quickly find books that match your unique reading preferences even in a crowded bookshelf.
        </p>
        <Link href="/books" onClick={() => window.scrollTo(0, 0)}>
          <Button className="bg-violet-600 hover:bg-violet-700 text-white font-medium">
            Get Started Now
          </Button>
        </Link>
      </div>
      
      {/* Footer with Privacy Policy, Terms, and Technical Implementation */}
      <div className="mt-20 pt-6 border-t border-gray-200">
        <div className="flex flex-col md:flex-row justify-center items-center text-xs text-gray-500 space-y-2 md:space-y-0 md:space-x-6">
          <span>© {new Date().getFullYear()} ShelfScanner. All rights reserved.</span>
          <Link href="/privacy-policy">
            <span className="hover:text-violet-600 transition-colors">Privacy Policy</span>
          </Link>
          <Link href="/terms-conditions">
            <span className="hover:text-violet-600 transition-colors">Terms & Conditions</span>
          </Link>
          <Link href="/tech-implementation">
            <span className="hover:text-violet-600 transition-colors">Technical Details</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
