import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

interface BookInput {
  title: string;
  author: string;
  categories?: string[];
  rating?: string;
}

interface UserPreferences {
  genres: string[];
  authors: string[];
  goodreadsData: any[];
}

interface ApiResponse {
  success: boolean;
  message?: string;
  books?: any[];
  preferences?: UserPreferences;
  recommendations?: any[];
  count?: number;
  error?: string;
}

export default function TestRecommendations() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [booksInput, setBooksInput] = useState<string>('[\n  {\n    "title": "To Kill a Mockingbird",\n    "author": "Harper Lee",\n    "categories": ["Fiction", "Classic"],\n    "rating": "4.5"\n  },\n  {\n    "title": "1984",\n    "author": "George Orwell",\n    "categories": ["Fiction", "Dystopian"],\n    "rating": "4.7"\n  },\n  {\n    "title": "The Great Gatsby",\n    "author": "F. Scott Fitzgerald",\n    "categories": ["Fiction", "Classic"],\n    "rating": "4.2"\n  }\n]');
  const [preferencesInput, setPreferencesInput] = useState<string>('{\n  "genres": ["Fiction", "Science Fiction", "Mystery"],\n  "authors": ["Stephen King", "Agatha Christie"],\n  "goodreadsData": []\n}');
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [activeTab, setActiveTab] = useState("input");

  const handleSubmit = async () => {
    try {
      setLoading(true);
      
      // Parse inputs
      let books: BookInput[];
      let preferences: UserPreferences;
      
      try {
        books = JSON.parse(booksInput);
        preferences = JSON.parse(preferencesInput);
      } catch (error) {
        toast({
          title: "Invalid JSON",
          description: "Please check your input format",
          variant: "destructive"
        });
        setLoading(false);
        return;
      }
      
      // Call the API
      const response = await fetch("/api/test/recommendations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          books,
          preferences,
        }),
      });
      
      const data = await response.json();
      setResponse(data);
      setActiveTab("response");
      
      if (data.success) {
        toast({
          title: "Recommendations Generated",
          description: `Found ${data.count} recommendations`,
        });
      } else {
        toast({
          title: "Error",
          description: data.message || "Something went wrong",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to process request",
        variant: "destructive"
      });
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };
  
  const clearResponse = () => {
    setResponse(null);
    setActiveTab("input");
  };

  return (
    <div className="container py-10">
      <h1 className="text-3xl font-bold mb-6">OpenAI Recommendations Test Page</h1>
      <p className="text-muted-foreground mb-6">
        This page allows you to test the OpenAI book recommendations API directly.
        Input book data and user preferences to see the recommendations.
      </p>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="input">Input</TabsTrigger>
          <TabsTrigger value="response" disabled={!response}>Response</TabsTrigger>
          <TabsTrigger value="raw" disabled={!response}>Raw JSON</TabsTrigger>
        </TabsList>
        
        <TabsContent value="input">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Books (JSON)</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea 
                  className="font-mono h-[400px]" 
                  value={booksInput} 
                  onChange={e => setBooksInput(e.target.value)}
                  placeholder="Enter books as JSON array"
                />
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>User Preferences (JSON)</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea 
                  className="font-mono h-[400px]" 
                  value={preferencesInput} 
                  onChange={e => setPreferencesInput(e.target.value)}
                  placeholder="Enter user preferences as JSON object"
                />
              </CardContent>
            </Card>
          </div>
          
          <div className="mt-6">
            <Button 
              onClick={handleSubmit} 
              disabled={loading}
              className="mr-2"
            >
              {loading ? "Processing..." : "Generate Recommendations"}
            </Button>
            {response && (
              <Button 
                variant="outline" 
                onClick={clearResponse}
              >
                Clear Response
              </Button>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="response">
          {response && response.success && (
            <Card>
              <CardHeader>
                <CardTitle>Recommendations ({response.count})</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Author</TableHead>
                      <TableHead>Categories</TableHead>
                      <TableHead>Match Reason</TableHead>
                      <TableHead className="text-right">Match Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {response.recommendations?.map((book, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{book.title}</TableCell>
                        <TableCell>{book.author}</TableCell>
                        <TableCell>{book.categories?.join(", ") || "—"}</TableCell>
                        <TableCell>{book.matchReason || "—"}</TableCell>
                        <TableCell className="text-right">
                          {book.matchScore !== undefined ? book.matchScore : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
          
          {response && !response.success && (
            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="text-destructive">Error</CardTitle>
              </CardHeader>
              <CardContent>
                <p>{response.message || "Unknown error occurred"}</p>
                {response.error && (
                  <pre className="bg-muted p-2 rounded mt-2 text-sm overflow-auto">
                    {response.error}
                  </pre>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        <TabsContent value="raw">
          {response && (
            <Card>
              <CardHeader>
                <CardTitle>Raw API Response</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted p-4 rounded overflow-auto h-[500px] text-sm">
                  {JSON.stringify(response, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}