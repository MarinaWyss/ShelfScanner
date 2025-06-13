import OpenAI from "openai";
import { log } from "./simple-logger.js";
import { rateLimiter } from "./rate-limiter.js";
import { analyzeImage } from "./vision.js"; // Import Google Vision fallback

// Configure OpenAI client
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 2, // Limit retries to reduce costs
  timeout: 15000 // 15 second timeout to prevent hanging
});

// This flag allows easier turning on/off of the OpenAI API
const ENABLE_OPENAI = process.env.ENABLE_OPENAI !== "false";

/**
 * Check if the OpenAI API key is configured
 * @returns boolean indicating if the API key is available
 */
function isOpenAIConfigured(): boolean {
  const apiKey = process.env.OPENAI_API_KEY;
  return !!apiKey && apiKey.length > 5 && apiKey !== "your-api-key-here"; // Basic validation
}

/**
 * Main function to analyze a bookshelf image and identify book titles
 * Implements rate limiting and cost controls with fallback options
 */
export async function analyzeBookshelfImage(base64Image: string): Promise<{ 
  bookTitles: string[], 
  isBookshelf: boolean 
}> {
  try {
    // Check if OpenAI is enabled and configured
    if (!ENABLE_OPENAI) {
      log("OpenAI API is disabled by configuration", "vision");
      return await fallbackToGoogleVision(base64Image);
    }
    
    if (!isOpenAIConfigured()) {
      log("OpenAI API key is not properly configured", "vision");
      return await fallbackToGoogleVision(base64Image);
    }
    
    // Check rate limits before making the API call
    if (!(await rateLimiter.isAllowed('openai'))) {
      log("Rate limit reached for OpenAI API. Using fallback.", "vision");
      return await fallbackToGoogleVision(base64Image);
    }
    
    log("Processing image with OpenAI Vision API", "vision");
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: "You are a precise book identification expert specializing in reading book spines on bookshelves. Your ONLY task is to identify the exact titles of books visible in the image. Never invent or guess titles. Only include titles where you can clearly read the complete title from the spine or cover. If you're uncertain about any title, exclude it completely."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "This is a photo of a bookshelf. I need you to identify ONLY the books that are clearly visible and legible in this image. Read the text directly from the book spines or covers.\n\nYour response should be a JSON object with these fields:\n\n1. 'bookTitles': An array containing ONLY the exact titles of books you can read with 100% certainty from the image. Do not include partial or guessed titles.\n\n2. 'isBookshelf': A boolean (true) if this shows multiple books on a shelf.\n\nIMPORTANT: Do not try to be helpful by guessing titles! Only include titles that you can read directly and completely from the image. Read each spine carefully - do not include books where you can only make out a few letters. For books with series names, include the complete title as shown on the spine."
            },
            {
              type: "image_url", 
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 800
    });

    // Increment the counter for successful API calls
    await rateLimiter.increment('openai');

    // Parse the response
    const content = response.choices[0].message.content || '';
    let result;
    
    try {
      result = JSON.parse(content);
    } catch (error) {
      log(`Error parsing OpenAI response: ${error}`, "vision");
      // Fallback to Google Vision if JSON parsing fails
      return await fallbackToGoogleVision(base64Image);
    }
    
    log(`OpenAI identified ${result.bookTitles?.length || 0} books`, "vision");
    
    return {
      bookTitles: result.bookTitles || [],
      isBookshelf: result.isBookshelf || false
    };
  } catch (error) {
    log(`Error analyzing image with OpenAI: ${error instanceof Error ? error.message : String(error)}`, "vision");
    
    // Try the fallback option if OpenAI fails
    return await fallbackToGoogleVision(base64Image);
  }
}

/**
 * Fallback function using Google Vision API instead of OpenAI
 * This provides a more cost-effective option when OpenAI is unavailable
 */
async function fallbackToGoogleVision(base64Image: string): Promise<{ 
  bookTitles: string[], 
  isBookshelf: boolean 
}> {
  try {
    log("Falling back to Google Vision API for image analysis", "vision");
    
    // Check if the Google Vision fallback is rate-limited
    if (!(await rateLimiter.isAllowed('google-vision'))) {
      log("Rate limit reached for Google Vision fallback API", "vision");
      return { bookTitles: [], isBookshelf: false };
    }
    
    const visionResult = await analyzeImage(base64Image);
    await rateLimiter.increment('google-vision');
    
    // Extract potential book titles from the Google Vision text
    const text = visionResult.text || '';
    
    // Very basic extraction of potential book titles from the text
    // This is a simple implementation - book title extraction from raw text
    // would need more sophisticated NLP in a production environment
    const lines = text.split('\n').filter((line: string) => line.trim().length > 0);
    
    // Filter lines that might be book titles (more than 2 words, less than 50 chars)
    const potentialTitles = lines.filter((line: string) => {
      const words = line.trim().split(/\s+/);
      return words.length >= 2 && words.length <= 10 && line.length <= 50;
    });
    
    log(`Google Vision extracted ${potentialTitles.length} potential titles`, "vision");
    
    return {
      bookTitles: potentialTitles,
      isBookshelf: visionResult.isBookshelf || false
    };
  } catch (error) {
    log(`Error in Google Vision fallback: ${error instanceof Error ? error.message : String(error)}`, "vision");
    
    // Return empty results if all methods fail
    return {
      bookTitles: [],
      isBookshelf: false
    };
  }
}