import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BookOpen, Star } from "lucide-react";

export function OpenAIDemo() {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  const { data: bookDetails, isLoading, isError, error } = useQuery({
    queryKey: ['/api/demo/openai-book', title, author],
    queryFn: () => 
      fetch(`/api/demo/openai-book?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}`)
        .then(res => res.json()),
    enabled: submitted && title.length > 0 && author.length > 0
  });

  return (
    <div className="container py-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">OpenAI Book Information Demo</h1>
      <p className="text-gray-600 mb-6">
        This demo showcases how we use OpenAI to provide high-quality book information without relying on expensive third-party APIs.
      </p>

      <form onSubmit={handleSubmit} className="mb-8">
        <div className="flex flex-col gap-4 md:flex-row">
          <div className="flex-1">
            <label htmlFor="title" className="block text-sm font-medium mb-1">
              Book Title
            </label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., To Kill a Mockingbird"
              required
            />
          </div>
          <div className="flex-1">
            <label htmlFor="author" className="block text-sm font-medium mb-1">
              Author
            </label>
            <Input
              id="author"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="e.g., Harper Lee"
              required
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={!title || !author}>
              Get Book Info
            </Button>
          </div>
        </div>
      </form>

      {isLoading && (
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      )}

      {isError && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : "Failed to fetch book information"}
          </AlertDescription>
        </Alert>
      )}

      {bookDetails && !isLoading && (
        <Card>
          <CardHeader>
            <CardTitle>{bookDetails.title}</CardTitle>
            <CardDescription>by {bookDetails.author}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-500" />
              <span className="font-medium">{bookDetails.rating}/5.0</span>
              <span className="text-sm text-gray-500">Rating from OpenAI</span>
            </div>
            
            <Separator />
            
            <div>
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="h-5 w-5 text-blue-500" />
                <h3 className="font-medium">Summary</h3>
              </div>
              <p className="text-gray-700">{bookDetails.summary}</p>
            </div>
          </CardContent>
          <CardFooter className="text-sm text-gray-500">
            Generated directly by OpenAI at {new Date(bookDetails.timestamp).toLocaleString()}
          </CardFooter>
        </Card>
      )}

      <div className="mt-8 p-4 bg-gray-50 rounded-lg">
        <h2 className="text-xl font-semibold mb-3">How It Works</h2>
        <ol className="list-decimal list-inside space-y-2">
          <li>We use OpenAI's powerful model to generate book ratings based on its knowledge</li>
          <li>The summary is created using the same model, with instructions to keep it concise</li>
          <li>Results are cached in our database to minimize API usage</li>
          <li>This approach eliminates the need for expensive specialized book APIs</li>
        </ol>
      </div>
    </div>
  );
}

export default OpenAIDemo;