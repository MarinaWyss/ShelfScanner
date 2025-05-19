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