import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";

export default function Home() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground mb-1">
          ShelfScanner: Find Your Next Great Read
        </h1>
        <p className="text-muted-foreground">
          Take photos of books at stores or libraries to discover which ones match your reading preferences
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card className="border-slate-700 bg-slate-800 shadow-lg">
          <CardContent className="pt-6">
            <div className="text-center mb-6">
              <div className="bg-primary/20 text-primary h-16 w-16 rounded-full mx-auto flex items-center justify-center mb-4">
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
              <h2 className="text-xl font-semibold text-foreground">Bookstore & Library Assistant</h2>
              <p className="mt-2 text-muted-foreground max-w-md mx-auto">
                Take photos of entire bookshelves at stores or libraries and we'll identify which books best match your reading preferences.
              </p>
            </div>
            <div className="flex justify-center">
              <Link href="/books">
                <Button className="w-full sm:w-auto bg-primary hover:bg-primary/90">
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

        <Card className="border-slate-700 bg-slate-800 shadow-lg">
          <CardContent className="pt-6">
            <div className="text-center mb-6">
              <div className="bg-secondary/20 text-secondary h-16 w-16 rounded-full mx-auto flex items-center justify-center mb-4">
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
              <h2 className="text-xl font-semibold text-foreground">How It Works</h2>
              <p className="mt-2 text-muted-foreground max-w-md mx-auto">
                Take a photo of entire bookshelves at stores or libraries, and our app identifies the books and ranks them based on how well they match your reading preferences.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div className="border border-slate-700 bg-slate-900 rounded-lg p-4 text-center">
                <div className="bg-accent/20 text-accent h-10 w-10 rounded-full mx-auto flex items-center justify-center mb-3">
                  <span className="font-semibold">1</span>
                </div>
                <h3 className="font-medium text-sm text-foreground">Upload Photo</h3>
                <p className="text-xs text-muted-foreground mt-1">Take a photo of books at a store or library</p>
              </div>
              <div className="border border-slate-700 bg-slate-900 rounded-lg p-4 text-center">
                <div className="bg-accent/20 text-accent h-10 w-10 rounded-full mx-auto flex items-center justify-center mb-3">
                  <span className="font-semibold">2</span>
                </div>
                <h3 className="font-medium text-sm text-foreground">Set Preferences</h3>
                <p className="text-xs text-muted-foreground mt-1">Tell us about your reading interests</p>
              </div>
              <div className="border border-slate-700 bg-slate-900 rounded-lg p-4 text-center">
                <div className="bg-accent/20 text-accent h-10 w-10 rounded-full mx-auto flex items-center justify-center mb-3">
                  <span className="font-semibold">3</span>
                </div>
                <h3 className="font-medium text-sm text-foreground">Find Matching Books</h3>
                <p className="text-xs text-muted-foreground mt-1">Discover which books best match your taste</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-700 bg-slate-800 shadow-lg">
          <CardContent className="pt-6">
            <div className="text-center mb-6">
              <div className="bg-accent/20 text-accent h-16 w-16 rounded-full mx-auto flex items-center justify-center mb-4">
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
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-foreground">Import Your Goodreads Library</h2>
              <p className="mt-2 text-muted-foreground max-w-md mx-auto">
                Already have a Goodreads account? Import your reading history to get even more accurate recommendations.
              </p>
            </div>
            <div className="flex justify-center">
              <Button variant="outline" className="w-full sm:w-auto border-slate-600 text-white hover:bg-slate-700">
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
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
