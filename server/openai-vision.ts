import OpenAI from "openai";
import { log } from "./vite";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function analyzeBookshelfImage(base64Image: string): Promise<{ 
  bookTitles: string[], 
  isBookshelf: boolean 
}> {
  try {
    log("Processing image with OpenAI Vision API", "vision");
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: "You are a book identification expert. Analyze this image and identify ONLY the specific book titles you can clearly see. Extract the EXACT titles as they appear - don't abbreviate or modify them. If a book spine is partially visible or text is blurry, only include it if you're CERTAIN about the title. The image may contain individual books or bookshelves. Return ONLY the titles you're 100% confident about."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Please carefully identify all book titles visible in this image. Read each spine or cover exactly as written. Return your response in JSON format with 'bookTitles' as an array of strings containing only the complete, accurate book titles, and 'isBookshelf' as a boolean indicating if this is a collection of books. Be meticulous and only include titles you can fully and clearly read."
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

    // Parse the response
    const content = response.choices[0].message.content || '';
    let result;
    
    try {
      result = JSON.parse(content);
    } catch (error) {
      log(`Error parsing OpenAI response: ${error}`, "vision");
      // Fallback with empty results
      return {
        bookTitles: [],
        isBookshelf: false
      };
    }
    
    log(`OpenAI identified ${result.bookTitles?.length || 0} books`, "vision");
    
    return {
      bookTitles: result.bookTitles || [],
      isBookshelf: result.isBookshelf || false
    };
  } catch (error) {
    log(`Error analyzing image with OpenAI: ${error instanceof Error ? error.message : String(error)}`, "vision");
    
    // Return empty results in case of error
    return {
      bookTitles: [],
      isBookshelf: false
    };
  }
}