import { useState, useEffect } from "react";
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
  onGetRecommendations?: () => void;
  isLoading?: boolean;
}

export default function UploadStep({ onBooksDetected, detectedBooks, onGetRecommendations, isLoading = false }: UploadStepProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string>("");
  const [isMobile, setIsMobile] = useState(false);
  const { toast } = useToast();

  // Check if device is mobile on component mount
  useEffect(() => {
    const checkIfMobile = () => {
      const userAgent = navigator.userAgent;
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      setIsMobile(isMobileDevice || isTouchDevice);
    };
    
    checkIfMobile();
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {return;}

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
      <div className="mb-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Upload a photo of books</h2>
        <p className="text-gray-600 dark:text-gray-300">Take a photo of a bookshelf or book collection you want recommendations for.</p>
      </div>

      {/* Image upload area */}
      {!detectedBooks.length ? (
        <>
          <div 
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 mb-6 flex flex-col items-center justify-center text-center"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            {!isUploading && !isProcessing && !uploadedImage ? (
              <>
                <div className="h-12 w-12 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mb-4">
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
                    className="h-6 w-6 text-violet-600 dark:text-violet-400"
                  >
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7" />
                    <line x1="16" x2="22" y1="5" y2="5" />
                    <line x1="19" x2="19" y1="2" y2="8" />
                    <circle cx="9" cy="9" r="2" />
                    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium mb-2 text-gray-900 dark:text-white">Upload a photo</h3>
                <p className="text-gray-600 dark:text-gray-300 mb-4 max-w-md">
                  Drag & drop an image here, or click to browse
                </p>
                <div className="relative">
                  <Button 
                    onClick={() => document.getElementById("book-image")?.click()}
                    className="bg-violet-600 hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500 text-white"
                  >
                    Choose Image
                  </Button>
                  <input 
                    type="file" 
                    id="book-image" 
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>

                {isMobile && (
                  <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg max-w-md text-left">
                    <h4 className="font-medium text-blue-800 dark:text-blue-300 mb-2">Taking a photo of books?</h4>
                    <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1 pl-5 list-disc">
                      <li>Make sure book titles and authors are visible</li>
                      <li>Ensure good lighting to avoid shadows</li>
                      <li>Keep the camera steady for clear text</li>
                    </ul>
                  </div>
                )}
              </>
            ) : isUploading ? (
              <div className="py-12 flex flex-col items-center">
                <div className="animate-spin h-10 w-10 border-4 border-violet-600 dark:border-violet-400 border-t-transparent rounded-full mb-4"></div>
                <p className="text-gray-600 dark:text-gray-300">Uploading image...</p>
              </div>
            ) : isProcessing ? (
              <div className="py-12 flex flex-col items-center">
                <div className="animate-spin h-10 w-10 border-4 border-violet-600 dark:border-violet-400 border-t-transparent dark:border-t-transparent rounded-full mb-4"></div>
                <p className="text-violet-600 dark:text-violet-400 font-medium mb-1">Analyzing your books</p>
                <p className="text-gray-600 dark:text-gray-300">This may take a moment...</p>
              </div>
            ) : (
              <div className="relative w-full">
                <img 
                  src={uploadedImage} 
                  alt="Uploaded bookshelf" 
                  className="max-h-80 max-w-full mx-auto rounded-lg"
                />
                <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                  <div className="animate-spin h-12 w-12 border-4 border-white border-t-transparent rounded-full"></div>
                </div>
              </div>
            )}
          </div>
          
          {!isUploading && !isProcessing && !uploadedImage && (
            <div className="text-center mb-8">
              <p className="text-gray-500 dark:text-gray-400">
                <span className="font-medium">Tip:</span> Try to capture clear, well-lit images of book covers and spines
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="mb-6">
            <h3 className="font-medium text-lg text-gray-900 dark:text-white mb-2">
              Detected Books ({detectedBooks.length})
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {detectedBooks.map((book, index) => (
                <div 
                  key={index}
                  className="border rounded-lg overflow-hidden bg-white dark:bg-gray-800 shadow-sm border-gray-200 dark:border-gray-700"
                >
                  <div className="p-4 flex">
                    {book.coverUrl ? (
                      <img 
                        src={book.coverUrl} 
                        alt={book.title}
                        className="w-16 h-24 object-cover rounded"
                        onError={(e) => {
                          // If image fails to load, replace with placeholder
                          (e.target as HTMLImageElement).src = 'https://placehold.co/80x120?text=No+Cover';
                        }}
                      />
                    ) : (
                      <div className="w-16 h-24 bg-gray-100 dark:bg-gray-700 flex items-center justify-center rounded text-gray-400 dark:text-gray-500">
                        No Cover
                      </div>
                    )}
                    <div className="ml-3">
                      <h4 className="font-medium text-gray-900 dark:text-white">{book.title}</h4>
                      <p className="text-gray-600 dark:text-gray-300 text-sm">{book.author}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {onGetRecommendations && (
              <div className="mt-6 flex justify-end">
                <Button 
                  onClick={onGetRecommendations} 
                  disabled={isLoading}
                  className="bg-violet-600 hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500 text-white"
                >
                  {isLoading ? (
                    <>
                      <LoaderPinwheel className="mr-2 h-4 w-4 animate-spin" />
                      Getting recommendations...
                    </>
                  ) : (
                    'Get Recommendations'
                  )}
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
