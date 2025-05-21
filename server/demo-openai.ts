import OpenAI from "openai";
import { log } from "./vite";

// Configure OpenAI client
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 2,
  timeout: 15000
});

/**
 * Simple function to demonstrate OpenAI is working
 * and providing book ratings directly from its knowledge
 */
export async function getOpenAIBookRating(title: string, author: string): Promise<string> {
  try {
    log(`Getting direct OpenAI rating for "${title}" by ${author}`, 'demo');
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
      messages: [
        {
          role: "system",
          content: "You are a literary expert providing book ratings. Respond ONLY with a single number between 1.0 and 5.0 with one decimal place - nothing else. For example: 4.5"
        },
        {
          role: "user",
          content: `Rate the book "${title}" by ${author}" on a 5-star scale. Respond with ONLY a number between an integer between 1.0 and 5.0.`
        }
      ],
      max_tokens: 5,
      temperature: 0.3
    });
    
    const ratingText = response.choices[0].message.content?.trim() || '3.5';
    log(`OpenAI rating for "${title}": ${ratingText}`, 'demo');
    
    return ratingText;
  } catch (error) {
    log(`Error getting direct OpenAI rating: ${error}`, 'demo');
    return '3.5';
  }
}

/**
 * Simple function to demonstrate OpenAI is providing book summaries
 * directly from its knowledge
 */
export async function getOpenAIBookSummary(title: string, author: string): Promise<string> {
  try {
    log(`Getting direct OpenAI summary for "${title}" by ${author}`, 'demo');
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
      messages: [
        {
          role: "system",
          content: "You are a literary expert providing engaging book summaries. Craft a concise 3-4 sentence summary that captures the essence of the book, its main themes, and what makes it notable. Focus on being informative yet brief."
        },
        {
          role: "user",
          content: `Summarize the book "${title}" by ${author}" in 3-4 sentences. Be engaging and highlight what makes this book special.`
        }
      ],
      max_tokens: 150,
      temperature: 0.6
    });
    
    const summary = response.choices[0].message.content?.trim() || '';
    log(`OpenAI summary for "${title}": ${summary}`, 'demo');
    
    return summary;
  } catch (error) {
    log(`Error getting direct OpenAI summary: ${error}`, 'demo');
    return '';
  }
}