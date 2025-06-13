/* eslint-disable no-undef */
// Import using ES modules for Vercel compatibility
import 'dotenv/config';

/**
 * API handler for direct OpenAI recommendations
 * @param {import('@vercel/node').VercelRequest} req - The request object
 * @param {import('@vercel/node').VercelResponse} res - The response object
 */
export default async function handler(req, res) {
  // Add comprehensive logging for debugging
  console.log('=== DIRECT RECOMMENDATIONS API CALLED ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Headers:', req.headers);
  console.log('Query:', req.query);
  console.log('Body:', req.body);
  
  // Handle CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Import the OpenAI recommendations function
    const { getOpenAIRecommendations } = await import('../../server/openai-recommendations.js');
    const { log } = await import('../../server/simple-logger.js');

    console.log('Modules imported successfully');

    const { books, preferences } = req.body;

    if (!books || !Array.isArray(books) || books.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide a non-empty array of books"
      });
    }

    // Get device ID from cookie if available
    const deviceId = req.cookies?.deviceId || 'anonymous-user';
    
    log(`Processing direct OpenAI recommendation request with ${books.length} books`, "openai");

    // Check OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      return res.status(400).json({
        success: false,
        message: "OpenAI API key is not configured. Please add it to your environment variables."
      });
    }
    
    // Log the request details for debugging
    log(`Processing recommendation request for ${books.length} books with preferences: ${JSON.stringify(preferences || {})}`, "openai");
    
    try {
      // Get base recommendations from OpenAI
      const baseRecommendations = await getOpenAIRecommendations(books, preferences || {}, deviceId);
      
      // Make sure we received recommendations from OpenAI
      if (!baseRecommendations || baseRecommendations.length === 0) {
        // If no recommendations were returned, inform the user
        log("No recommendations returned from OpenAI", "openai");
        return res.status(404).json({
          success: false,
          message: "No book recommendations could be generated based on your scanned books. Please try scanning different books."
        });
      }

      // Enhance recommendations with descriptions if needed
      try {
        const { getOpenAIDescription } = await import('../../server/openai-descriptions.js');
        
        const enhancedRecommendations = await Promise.all(
          baseRecommendations.map(async (rec) => {
            try {
              // If the recommendation doesn't have a summary or has a short one, get it from OpenAI
              if (!rec.summary || rec.summary.length < 100) {
                const description = await getOpenAIDescription(rec.title, rec.author);
                if (description && description.length > 0) {
                  rec.summary = description;
                  log(`Enhanced "${rec.title}" with OpenAI description`, "openai");
                }
              }
              return rec;
            } catch (error) {
              log(`Error enhancing recommendation "${rec.title}": ${error instanceof Error ? error.message : String(error)}`, "openai");
              return rec; // Return original if enhancement fails
            }
          })
        );

        log(`Successfully enhanced ${enhancedRecommendations.length} recommendations`, "openai");
        return res.status(200).json(enhancedRecommendations);
      } catch (enhancementError) {
        log(`Error enhancing recommendations: ${enhancementError instanceof Error ? enhancementError.message : String(enhancementError)}`, "openai");
        // Return base recommendations if enhancement fails
        return res.status(200).json(baseRecommendations);
      }
    } catch (error) {
      log(`Error generating recommendations: ${error instanceof Error ? error.message : String(error)}`, "openai");
      return res.status(500).json({
        success: false,
        message: "Failed to generate recommendations",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  } catch (error) {
    console.error('Direct recommendations API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
} 