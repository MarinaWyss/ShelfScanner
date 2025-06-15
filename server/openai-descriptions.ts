import OpenAI from "openai";
import { log } from './simple-logger.js';
import { rateLimiter } from './rate-limiter.js';

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
    // Create a cache key
    const cacheKey = `${title}|${author}`.toLowerCase();
    
    // Check if we have this description cached in memory
    if (descriptionCache.has(cacheKey)) {
      const cachedDescription = descriptionCache.get(cacheKey);
      log(`Using cached description for "${title}" by ${author}`, 'openai');
      return cachedDescription!;
    }
    
    // Check if we have a predefined description
    if (PREDEFINED_DESCRIPTIONS[cacheKey]) {
      const predefinedDescription = PREDEFINED_DESCRIPTIONS[cacheKey];
      descriptionCache.set(cacheKey, predefinedDescription); // Cache it for future use
      log(`Using predefined description for "${title}" by ${author}`, 'openai');
      return predefinedDescription;
    }
    
    log(`Generating fresh OpenAI description for "${title}" by ${author}`, 'openai');
    
    // Check if OpenAI is configured
    if (!process.env.OPENAI_API_KEY) {
      log('OpenAI API key not configured for description generation', 'openai');
      return "No description available";
    }
    
    // Check rate limits and atomically increment if allowed
    if (!(await rateLimiter.checkAndIncrement('openai'))) {
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
    
    // Extract and return the description
    const description = response.choices[0].message.content?.trim() || "No description available";
    log(`Generated OpenAI description for "${title}" (${description.length} chars)`, 'openai');
    
    // Cache the description for future use
    descriptionCache.set(cacheKey, description);
    
    return description;
  } catch (error) {
    // Check if this is a rate limit error from the API itself
    if (error instanceof Error && (
      error.message.includes('rate limit') || 
      error.message.includes('429') ||
      error.message.includes('too many requests') ||
      error.message.includes('quota exceeded')
    )) {
      log(`OpenAI API rate limit error: ${error.message}`, 'openai');
      return "Description temporarily unavailable due to rate limits";
    }
    
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
// Predefined match reasons for popular books
const PREDEFINED_MATCH_REASONS: Record<string, string> = {
  "creativity, inc.|ed catmull|business,creativity": "This book directly addresses your interest in business and creativity, offering valuable insights into fostering innovation from Pixar's co-founder.",
  "how to day trade for a living|andrew aziz|business,finance": "This practical guide matches your interest in business and finance, providing actionable trading strategies and psychological insights.",
  "the night circus|erin morgenstern|fantasy,fiction": "This magical realism masterpiece aligns perfectly with your interest in fantasy fiction, offering an enchanting world of competition and illusion.",
  "creativity, inc.|ed catmull|": "This insightful book offers valuable perspectives on creative leadership and innovation from Pixar's co-founder, with lessons that apply across many fields.",
  "how to day trade for a living|andrew aziz|": "This practical guide provides clear, actionable strategies for day trading, suitable for both beginners and those looking to refine their trading approach.",
  "the night circus|erin morgenstern|": "This enchanting novel creates a captivating world of magic and competition, with beautiful prose and intricate storytelling that appeals to readers who enjoy immersive fiction."
};

export async function getOpenAIMatchReason(
  title: string, 
  author: string, 
  userPreferences: { genres?: string[], authors?: string[] }
): Promise<string> {
  try {
    // Create a simpler preference key for matching
    const preferencesKey = userPreferences.genres?.join(',').toLowerCase() || '';
    
    // Create a cache key for the match reason
    const cacheKey = `${title}|${author}|${preferencesKey}`.toLowerCase();
    
    // Check if we have this match reason cached in memory
    if (matchReasonCache.has(cacheKey)) {
      const cachedReason = matchReasonCache.get(cacheKey);
      log(`Using cached match reason for "${title}" by ${author}`, 'openai');
      return cachedReason!;
    }
    
    // Check if we have a predefined match reason
    if (PREDEFINED_MATCH_REASONS[cacheKey]) {
      const predefinedReason = PREDEFINED_MATCH_REASONS[cacheKey];
      matchReasonCache.set(cacheKey, predefinedReason); // Cache it for future use
      log(`Using predefined match reason for "${title}" by ${author}`, 'openai');
      return predefinedReason;
    }
    
    log(`Generating match reason for "${title}" by ${author}`, 'openai');
    
    // Check if OpenAI is configured
    if (!process.env.OPENAI_API_KEY) {
      log('OpenAI API key not configured for match reason generation', 'openai');
      return "This book matches your reading preferences.";
    }
    
    // Check rate limits and atomically increment if allowed
    if (!(await rateLimiter.checkAndIncrement('openai'))) {
      log('Rate limit reached for OpenAI, skipping match reason generation', 'openai');
      return "This book aligns with your reading interests.";
    }
    
    // Format user preferences for the prompt
    const genresList = userPreferences.genres?.join(', ') || 'various genres';
    const authorsList = userPreferences.authors?.join(', ') || 'various authors';
    
    // Generate a personalized match reason using OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Using the latest model
      messages: [
        {
          role: "system",
          content: `You are a literary recommendation expert who provides short, precise explanations for book matches.
          
          CRITICAL INSTRUCTIONS:
          1. ONLY mention genres and authors the user EXPLICITLY listed in their preferences
          2. Do NOT make assumptions about what else they might like based on their preferences
          3. Do NOT suggest connections between genres that aren't directly related
          4. Use ONLY 1-2 short sentences focused on DIRECT connections
          5. Be factual and avoid flowery language or excessive enthusiasm`
        },
        {
          role: "user",
          content: `Why would the book "${title}" by ${author} appeal to someone who enjoys ${genresList} and authors like ${authorsList}?
          
          Write in second person (using "you" and "your").
          Make ONLY direct connections to the user's stated preferences.
          Do NOT assume interests they haven't explicitly mentioned.
          Keep your response under 40 words - be extremely concise.`
        }
      ],
      max_tokens: 60,
      temperature: 0.6
    });
    
    // Extract and return the match reason
    const matchReason = response.choices[0].message.content?.trim() || 
      "This book aligns with your reading preferences based on its themes and style.";
    
    log(`Generated match reason for "${title}" (${matchReason.length} chars)`, 'openai');
    
    // Cache the match reason for future use
    matchReasonCache.set(cacheKey, matchReason);
    
    return matchReason;
  } catch (error) {
    // Check if this is a rate limit error from the API itself
    if (error instanceof Error && (
      error.message.includes('rate limit') || 
      error.message.includes('429') ||
      error.message.includes('too many requests') ||
      error.message.includes('quota exceeded')
    )) {
      log(`OpenAI API rate limit error: ${error.message}`, 'openai');
      return "This book aligns with your reading preferences (rate limit reached).";
    }
    
    log(`Error generating match reason: ${error instanceof Error ? error.message : String(error)}`, 'openai');
    return "This book appears to align with your reading preferences.";
  }
}