import OpenAI from "openai";
import { log } from './vite';

// Configure OpenAI client
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 2,
  timeout: 15000
});

/**
 * Test function for OpenAI integration
 * This is a simple test to verify the OpenAI API is working
 */
export async function testOpenAI(): Promise<{ success: boolean; message: string }> {
  try {
    log("Testing OpenAI connection...");
    
    // Make a simple request to OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that responds with only 'Success!' to verify the API is working."
        },
        {
          role: "user",
          content: "Please respond with 'Success!' to verify the API is working."
        }
      ],
      max_tokens: 10
    });
    
    const result = response.choices[0].message.content?.trim() || "";
    log("OpenAI response:", result);
    
    return {
      success: true,
      message: `OpenAI test successful: ${result}`
    };
  } catch (error) {
    log("OpenAI test error:", error);
    return {
      success: false,
      message: `OpenAI test failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}