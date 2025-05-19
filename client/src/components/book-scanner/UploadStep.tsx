import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { LoaderPinwheel } from "lucide-react";

interface Book {
  id?: number;
  title: string;
  author: string;
  coverUrl: string;
  isbn?: string;
  metadata?: any;
}

interface UploadStepProps {
  onBooksDetected: (books: Book[], imageBase64: string) => void;
  detectedBooks: Book[];
}

export default function UploadStep({ onBooksDetected, detectedBooks }: UploadStepProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string>("");
  const { toast } = useToast();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload an image smaller than 5MB",
        variant: "destructive",
      });
      return;
    }

    // Check file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      // Read file as base64
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Image = event.target?.result as string;
        setUploadedImage(base64Image);
        setIsUploading(false);
        await processImage(base64Image);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      setIsUploading(false);
      toast({
        title: "Upload failed",
        description: `Error uploading image: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
    }
  };

  const processImage = async (base64Image: string) => {
    setIsProcessing(true);

    try {
      // Create form data
      const formData = new FormData();
      // Get the raw base64 data without the prefix
      const base64Data = base64Image.split(',')[1] || base64Image;
      
      // Create a blob from the base64 data
      const byteCharacters = atob(base64Data);
      const byteArrays = [];
      
      for (let i = 0; i < byteCharacters.length; i += 512) {
        const slice = byteCharacters.slice(i, i + 512);
        const byteNumbers = new Array(slice.length);
        
        for (let j = 0; j < slice.length; j++) {
          byteNumbers[j] = slice.charCodeAt(j);
        }
        
        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
      }
      
      const blob = new Blob(byteArrays, { type: 'image/jpeg' });
      formData.append("image", blob);

      // Send to backend
      const response = await fetch("/api/books/analyze", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to analyze image");
      }

      const data = await response.json();

      if (data.books && data.books.length > 0) {
        onBooksDetected(data.books, base64Image);
        toast({
          title: "Books detected!",
          description: `Found ${data.books.length} books in your image`,
        });
      } else {
        toast({
          title: "No books detected",
          description: "We couldn't identify any books in your image. Please try a clearer photo.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Analysis failed",
        description: `Error analyzing image: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      
      // Check file size and type as in handleFileChange
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please upload an image smaller than 5MB",
          variant: "destructive",
        });
        return;
      }

      if (!file.type.startsWith("image/")) {
        toast({
          title: "Invalid file type",
          description: "Please upload an image file",
          variant: "destructive",
        });
        return;
      }

      setIsUploading(true);

      try {
        const reader = new FileReader();
        reader.onload = async (event) => {
          const base64Image = event.target?.result as string;
          setUploadedImage(base64Image);
          setIsUploading(false);
          await processImage(base64Image);
        };
        reader.readAsDataURL(file);
      } catch (error) {
        setIsUploading(false);
        toast({
          title: "Upload failed",
          description: `Error uploading image: ${error instanceof Error ? error.message : String(error)}`,
          variant: "destructive",
        });
      }
    }
  };

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Upload a photo of your bookshelf</h3>
      
      <div 
        className={`border-2 border-dashed border-slate-600 rounded-lg p-6 text-center ${
          isUploading || isProcessing ? 'bg-slate-800' : ''
        }`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {!uploadedImage && !isUploading && !isProcessing && (
          <div>
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
              className="h-12 w-12 text-slate-400 mx-auto mb-4"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" x2="12" y1="3" y2="15" />
            </svg>
            <p className="text-slate-400 mb-4">
              Drag and drop a photo of your bookshelf here, or click to browse
            </p>
            <div className="relative cursor-pointer">
              <Button 
                className="bg-primary hover:bg-primary/90 text-white"
                onClick={() => {
                  // Find the input element and trigger a click
                  const fileInput = document.getElementById('photo-upload');
                  if (fileInput) {
                    fileInput.click();
                  }
                }}
              >
                Upload Photo
              </Button>
              <input 
                id="photo-upload"
                type="file" 
                className="sr-only" 
                accept="image/*" 
                onChange={handleFileChange}
              />
            </div>
          </div>
        )}
        
        {uploadedImage && !isProcessing && !isUploading && (
          <div>
            <img 
              src={uploadedImage} 
              alt="Uploaded bookshelf" 
              className="max-h-64 mx-auto mb-4 rounded-md"
            />
            <div className="flex justify-center gap-4">
              <Button variant="outline" onClick={() => setUploadedImage("")}>
                Try Another Photo
              </Button>
              {detectedBooks.length === 0 && (
                <Button onClick={() => processImage(uploadedImage)}>
                  Analyze Again
                </Button>
              )}
            </div>
          </div>
        )}
        
        {(isUploading || isProcessing) && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <LoaderPinwheel className="h-10 w-10 animate-spin text-primary-600" />
            </div>
            <p className="text-neutral-600">
              {isUploading ? "Uploading your image..." : "Analyzing your books..."}
            </p>
          </div>
        )}
      </div>
      
      {detectedBooks.length > 0 && (
        <div className="mt-6">
          <h4 className="font-medium mb-3">Detected Books</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {detectedBooks.map((book, index) => (
              <div key={index} className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden shadow-lg">
                {book.coverUrl ? (
                  <img 
                    src={book.coverUrl} 
                    alt={book.title} 
                    className="w-full h-40 object-cover" 
                  />
                ) : (
                  <div className="w-full h-40 bg-slate-700 flex items-center justify-center">
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
                      className="h-10 w-10 text-slate-400"
                    >
                      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                    </svg>
                  </div>
                )}
                <div className="p-3">
                  <p className="font-medium text-white truncate">{book.title}</p>
                  <p className="text-xs text-slate-400 truncate">{book.author}</p>
                  <p className="text-xs text-green-500 mt-1">
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
                      className="h-3 w-3 inline mr-1"
                    >
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    Processed
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
