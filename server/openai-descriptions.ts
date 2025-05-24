import OpenAI from "openai";
import { log } from './vite';
import { rateLimiter } from './rate-limiter';

// Configure OpenAI client
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 2,
  timeout: 15000
});

// In-memory cache to reduce API calls and improve performance
const descriptionCache = new Map<string, string>();
const matchReasonCache = new Map<string, string>();

// Predefined descriptions for commonly requested books
const PREDEFINED_DESCRIPTIONS: Record<string, string> = {
  "creativity, inc.|ed catmull": "In 'Creativity, Inc.', Pixar co-founder Ed Catmull shares invaluable insights into building and sustaining a creative culture. Drawing from his experience leading one of the world's most innovative animation studios, Catmull reveals the principles that foster originality, candid communication, and fearless problem-solving. The book masterfully balances business wisdom with inspiring stories from Pixar's journey.",
  "how to day trade for a living|andrew aziz": "Andrew Aziz's 'How to Day Trade for a Living' offers a practical roadmap for aspiring day traders. The book methodically breaks down complex trading concepts into digestible strategies, covering essential topics from technical analysis to risk management. What distinguishes this guide is its emphasis on psychological discipline and realistic expectations for navigating the demanding world of day trading.",
  "the rise and fall of communism|archie brown": "Archie Brown's 'The Rise and Fall of Communism' presents a comprehensive examination of communism as both ideology and political system. With meticulous research and nuanced analysis, Brown traces communism's evolution from theoretical concept to governing framework across different countries and eras. The book excels in explaining how revolutionary idealism transformed into authoritarian reality.",
  "the night circus|erin morgenstern": "Erin Morgenstern's 'The Night Circus' weaves an enchanting tale of magic, competition, and forbidden love set within a mysterious circus that only appears at night. The novel's lush, atmospheric prose creates a dreamlike world where reality blends seamlessly with illusion. Beyond its captivating narrative, the book explores themes of fate versus free will, the nature of creativity, and the price of ambition."
};

/**
 * Generate a fresh book description using OpenAI
 * This ensures we always use AI-generated descriptions instead of Google Books
 * 
 * @param title Book title
 * @param author Book author
 * @returns A concise OpenAI-generated book description
 */
export async function getOpenAIDescription(title: string, author: string): Promise<string> {
  try {
    log(`Generating fresh OpenAI description for "${title}" by ${author}`, 'openai');
    
    // Check if OpenAI is configured
    if (!process.env.OPENAI_API_KEY) {
      log('OpenAI API key not configured for description generation', 'openai');
      return "No description available";
    }
    
    // Check rate limits
    if (!rateLimiter.isAllowed('openai')) {
      log('Rate limit reached for OpenAI, skipping description generation', 'openai');
      return "Description temporarily unavailable";
    }
    
    // Generate a high-quality description using OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Using the latest model
      messages: [
        {
          role: "system",
          content: `You are a literary expert tasked with creating concise, informative book descriptions.
          Create descriptions that highlight the book's themes, plot, and significance in 3-4 sentences.
          Focus on what makes the book interesting and valuable to readers.
          Avoid marketing language, spoilers, or excessively long descriptions.`
        },
        {
          role: "user",
          content: `Please provide a concise 3-4 sentence description for the book "${title}" by ${author}.
          Focus on themes, plot elements, and what makes this book special.
          Keep your response under 150 words and avoid marketing language.
          Only return the description text with no additional commentary.`
        }
      ],
      max_tokens: 250,
      temperature: 0.7
    });
    
    // Increment the rate limiter counter
    rateLimiter.increment('openai');
    
    // Extract and return the description
    const description = response.choices[0].message.content?.trim() || "No description available";
    log(`Generated OpenAI description for "${title}" (${description.length} chars)`, 'openai');
    
    return description;
  } catch (error) {
    log(`Error generating OpenAI description: ${error instanceof Error ? error.message : String(error)}`, 'openai');
    return "Description unavailable";
  }
}

/**
 * Generate a personalized match reason using OpenAI
 * Explains why a specific book matches the user's preferences
 * 
 * @param title Book title
 * @param author Book author
 * @param userPreferences User preferences (genres, authors, etc.)
 * @returns A personalized match reason
 */
export async function getOpenAIMatchReason(
  title: string, 
  author: string, 
  userPreferences: { genres?: string[], authors?: string[] }
): Promise<string> {
  try {
    log(`Generating match reason for "${title}" by ${author}`, 'openai');
    
    // Check if OpenAI is configured
    if (!process.env.OPENAI_API_KEY) {
      log('OpenAI API key not configured for match reason generation', 'openai');
      return "This book matches your reading preferences.";
    }
    
    // Check rate limits
    if (!rateLimiter.isAllowed('openai')) {
      log('Rate limit reached for OpenAI, skipping match reason generation', 'openai');
      return "This book aligns with your reading interests.";
    }
    
    // Format user preferences for the prompt
    const genres = userPreferences.genres?.join(', ') || 'various genres';
    const authors = userPreferences.authors?.join(', ') || 'various authors';
    
    // Generate a personalized match reason using OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Using the latest model
      messages: [
        {
          role: "system",
          content: `You are a literary recommendation expert that explains why books match a reader's preferences.
          Create personalized explanations written in second person (using "you" and "your").
          Be specific about why the book matches their interests based on genre, themes, or writing style.
          Keep explanations concise (2-3 sentences) and focused on what makes this a good match.`
        },
        {
          role: "user",
          content: `Write a personalized explanation of why the book "${title}" by ${author} would appeal to a reader who enjoys ${genres} and authors like ${authors}.
          Write in second person (using "you" and "your").
          Be specific about why this book matches their interests.
          Keep your response under 100 words and focus only on the match reason.`
        }
      ],
      max_tokens: 150,
      temperature: 0.7
    });
    
    // Increment the rate limiter counter
    rateLimiter.increment('openai');
    
    // Extract and return the match reason
    const matchReason = response.choices[0].message.content?.trim() || 
      "This book aligns with your reading preferences based on its themes and style.";
    
    log(`Generated match reason for "${title}" (${matchReason.length} chars)`, 'openai');
    
    return matchReason;
  } catch (error) {
    log(`Error generating match reason: ${error instanceof Error ? error.message : String(error)}`, 'openai');
    return "This book appears to align with your reading preferences.";
  }
}