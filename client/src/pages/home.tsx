import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";

export default function Home() {
  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-6xl mx-auto">
      <div className="mb-10 max-w-3xl">
        <h1 className="text-4xl font-bold text-gray-900 mb-3">
          The AI workspace that works for you.
        </h1>
        <p className="text-xl text-gray-600 mb-6">
          One place where readers find every answer, automate the busywork, and get book recommendations done.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/books">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white font-medium">
              Get ShelfScanner free
            </Button>
          </Link>
          <Link href="/reading-list">
            <Button variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-50">
              View reading list
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-12">
        <Card className="border border-gray-200 bg-white shadow-sm overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-start mb-4">
              <div className="bg-red-50 text-red-600 h-10 w-10 rounded-full flex items-center justify-center mr-4 shrink-0">
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
                  Take a photo of any bookshelf and get personalized recommendations instantly.
                </p>
              </div>
            </div>
            <Link href="/books" className="flex items-center text-blue-600 hover:text-blue-700 font-medium text-sm mt-3">
              <span>Start scanning</span>
              <svg className="ml-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </CardContent>
        </Card>

        <Card className="border border-gray-200 bg-white shadow-sm overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-start mb-4">
              <div className="bg-blue-50 text-blue-600 h-10 w-10 rounded-full flex items-center justify-center mr-4 shrink-0">
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
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <path d="M12 17h.01" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">AI-Enhanced Descriptions</h2>
                <p className="text-gray-600 mt-1">
                  Get more detailed and personalized book summaries powered by OpenAI.
                </p>
              </div>
            </div>
            <Link href="/books" className="flex items-center text-blue-600 hover:text-blue-700 font-medium text-sm mt-3">
              <span>Explore books</span>
              <svg className="ml-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="mt-16">
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-5">
            <div className="flex items-center mb-3">
              <div className="bg-blue-100 text-blue-600 h-8 w-8 rounded-full flex items-center justify-center mr-3">
                <span className="font-semibold">1</span>
              </div>
              <h3 className="font-medium text-gray-900">Upload Photo</h3>
            </div>
            <p className="text-sm text-gray-600">Take a photo of an entire bookshelf and our AI will identify each book.</p>
          </div>
          
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-5">
            <div className="flex items-center mb-3">
              <div className="bg-blue-100 text-blue-600 h-8 w-8 rounded-full flex items-center justify-center mr-3">
                <span className="font-semibold">2</span>
              </div>
              <h3 className="font-medium text-gray-900">Set Preferences</h3>
            </div>
            <p className="text-sm text-gray-600">Tell us about your reading interests and preferences to improve recommendations.</p>
          </div>
          
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-5">
            <div className="flex items-center mb-3">
              <div className="bg-blue-100 text-blue-600 h-8 w-8 rounded-full flex items-center justify-center mr-3">
                <span className="font-semibold">3</span>
              </div>
              <h3 className="font-medium text-gray-900">Find Matching Books</h3>
            </div>
            <p className="text-sm text-gray-600">Discover which books best match your taste with our AI-powered recommendations.</p>
          </div>
        </div>
      </div>

      <div className="mt-16 text-center">
        <div className="inline-flex justify-center items-center bg-blue-50 text-blue-600 h-12 w-12 rounded-full mb-4">
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
          <Button className="bg-blue-600 hover:bg-blue-700 text-white font-medium">
            Get Started Now
          </Button>
        </Link>
      </div>
    </div>
  );
}
