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
          content: "You are a precise book identification expert. Your task is to identify EXACTLY which books appear in an image of a bookshelf. Read the visible text on book spines and covers extremely carefully. DO NOT make assumptions or guess books that aren't clearly visible. Only return the exact titles you can read with certainty. If text is partially visible, include only complete titles you're 100% confident about."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "This is a photo of a bookshelf. Please identify ONLY the specific books that are clearly visible. Read each book spine or cover exactly as printed. Respond with a JSON object containing:\n\n1. 'bookTitles': an array of strings with ONLY the exact book titles you can definitely identify. Be extremely precise - only include titles you can read clearly and completely.\n\n2. 'isBookshelf': a boolean (true/false) indicating if this is an image of multiple books.\n\nFor example, books that might appear in this photo include 'The Promise', 'The Rift', 'North and South', 'Mythos', 'Awe', 'Cognitive Behavioral Therapy Made Simple', 'Stranger in a Strange Land', 'Overdiagnosed', and 'Leviathan Wakes'. DO NOT include these specific examples unless you actually see them in the image. Only return titles you can read directly from the image."
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