/* eslint-disable no-undef */
// Import using ES modules for Vercel compatibility
import 'dotenv/config';

/**
 * API handler for analyzing bookshelf images
 * @param {import('@vercel/node').VercelRequest} req - The request object
 * @param {import('@vercel/node').VercelResponse} res - The response object
 */
export default async function handler(req, res) {
  // Add comprehensive logging for debugging
  console.log('=== BOOKS ANALYZE API CALLED ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Headers:', req.headers);
  console.log('Query:', req.query);
  console.log('Content-Type:', req.headers['content-type']);
  
  // Handle CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    console.log('Invalid method:', req.method);
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    console.log('Starting POST request processing...');
    
    // Import modules dynamically to avoid issues with module resolution
    const formidable = await import('formidable');
    const fs = await import('fs/promises');
    const { storage } = await import('../../server/storage.js');
    const { analyzeBookshelfImage } = await import('../../server/openai-vision.js');
    const { searchBooksByTitle } = await import('../../server/books.js');
    
    console.log('Modules imported successfully');

    // Check for environment variables
    if (!process.env.DATABASE_URL) {
      console.error('Missing required environment variable: DATABASE_URL');
      return res.status(500).json({
        message: 'Server configuration error: Database connection not available',
        error: 'DATABASE_URL environment variable is missing'
      });
    }

    if (!process.env.OPENAI_API_KEY && !process.env.GOOGLE_VISION_API_KEY) {
      console.error('Missing required API keys: Both OpenAI and Google Vision keys are missing');
      return res.status(500).json({
        message: 'Server configuration error: Image analysis service not available',
        error: 'API keys for image processing are missing'
      });
    }

    // Parse multipart form data
    const form = formidable.default({
      maxFileSize: 5 * 1024 * 1024, // 5MB
      keepExtensions: true,
    });

    // Use the promise-based parsing approach for formidable
    const parseResult = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) {
          reject(err);
        } else {
          resolve({ fields, files });
        }
      });
    });
    
    console.log('Form parse result:', parseResult);
    const { fields, files } = parseResult;
    console.log('Form parsed successfully, files:', Object.keys(files));
    
    const file = files.image;
    if (!file) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    const imageFile = Array.isArray(file) ? file[0] : file;
    const buffer = await fs.default.readFile(imageFile.filepath);
    
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(413).json({ message: 'Image file is too large. Please upload an image smaller than 5MB.' });
    }

    const base64Image = buffer.toString('base64');
    console.log('Image converted to base64, length:', base64Image.length);

    // Analyze with OpenAI Vision
    const visionAnalysis = await analyzeBookshelfImage(base64Image);
    console.log('Vision analysis completed:', visionAnalysis);

    if (!visionAnalysis.isBookshelf) {
      return res.status(200).json({
        books: [],
        bookTitles: [],
        message: "The image doesn't appear to be a bookshelf. Please upload a photo of books on a shelf.",
      });
    }

    const bookTitles = visionAnalysis.bookTitles;
    if (bookTitles.length === 0) {
      return res.status(200).json({
        books: [],
        bookTitles: [],
        message: 'No books could be clearly identified in the image. Try taking a clearer photo with better lighting and make sure book titles are visible.',
      });
    }

    console.log('Book titles detected:', bookTitles);

    // Fetch user preferences using device ID (optional)
    let preferences = null;
    try {
      const deviceId = req.query.deviceId || req.cookies?.deviceId;
      
      if (deviceId) {
        preferences = await storage.getPreferencesByDeviceId(deviceId);
        console.log('Retrieved preferences for deviceId:', deviceId);
      } else {
        console.log('No device ID found, proceeding without preferences');
      }

      // Look up each detected title
      const detectedBooks = [];
      for (const title of bookTitles) {
        try {
          const results = await searchBooksByTitle(title);
          if (!results || results.length === 0) continue;

          const titleLower = title.toLowerCase();
          const bestMatch = results.reduce((best, current) => {
            const similarityCurrent = calculateSimilarity(titleLower, (current.title || '').toLowerCase());
            const similarityBest = best ? calculateSimilarity(titleLower, (best.title || '').toLowerCase()) : 0;
            return similarityCurrent > similarityBest ? current : best;
          }, null);

          if (bestMatch && calculateSimilarity(titleLower, bestMatch.title.toLowerCase()) > 0.6) {
            detectedBooks.push(bestMatch);
          }
        } catch (bookError) {
          console.log('Error searching for book:', title, bookError.message);
        }
      }

      if (detectedBooks.length === 0) {
        return res.status(200).json({
          books: [],
          bookTitles,
          message: "We identified some book titles, but couldn't find detailed information for them. Try taking a clearer photo with better lighting.",
        });
      }

      // Score books against user preferences
      const rankedBooks = detectedBooks.map((book) => {
        let matchScore = 0;
        if (preferences) {
          if (preferences.genres && book.categories) {
            for (const genre of preferences.genres) {
              if (book.categories.some((cat) => cat?.toLowerCase().includes(genre.toLowerCase()))) {
                matchScore += 3;
              }
            }
          }
          if (preferences.authors && book.author) {
            for (const author of preferences.authors) {
              if (book.author.toLowerCase().includes(author.toLowerCase())) {
                matchScore += 5;
              }
            }
          }
          if (preferences.goodreadsData && Array.isArray(preferences.goodreadsData)) {
            for (const entry of preferences.goodreadsData) {
              if (entry['Title'] && entry['Title'].toLowerCase() === book.title.toLowerCase()) {
                const rating = entry['My Rating'] ? parseInt(entry['My Rating']) : 0;
                matchScore += rating >= 4 ? 8 : rating;
              }
            }
          }
        }
        return { ...book, matchScore };
      }).sort((a, b) => b.matchScore - a.matchScore);

      const booksFoundString = rankedBooks.map((b) => b.title).join(', ');

      return res.status(200).json({
        books: rankedBooks,
        bookTitles,
        booksFound: booksFoundString,
        message: `Found ${rankedBooks.length} books in your photo: ${booksFoundString}. These have been ranked based on your preferences.`,
      });

    } catch (dbError) {
      console.error('Database error:', dbError);
      return res.status(500).json({
        message: 'Database error while processing preferences or book data',
        error: dbError instanceof Error ? dbError.message : String(dbError),
      });
    }

  } catch (error) {
    console.error('Books analyze API error:', error);
    
    // Provide more specific error messages for common issues
    if (error.message && error.message.includes('memory')) {
      return res.status(500).json({
        message: 'Server ran out of memory while processing the image',
        error: 'Try uploading a smaller image or reducing the image resolution',
      });
    }
    
    return res.status(500).json({
      message: 'Error analyzing bookshelf image',
      error: error instanceof Error ? error.message : String(error),
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

/**
 * Calculate similarity between two strings
 */
function calculateSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1, str2) {
  const matrix = [];
  for (let i = 0; i <= str1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= str2.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= str1.length; i++) {
    for (let j = 1; j <= str2.length; j++) {
      const cost = str1.charAt(i - 1) === str2.charAt(j - 1) ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost, // substitution
      );
    }
  }
  return matrix[str1.length][str2.length];
} 