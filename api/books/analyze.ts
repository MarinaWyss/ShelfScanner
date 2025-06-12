import 'dotenv/config';
import { VercelRequest, VercelResponse } from '@vercel/node';
import formidable from 'formidable';
import fs from 'node:fs/promises';

// Re-use existing server-side helpers so we don't duplicate business logic
import { analyzeBookshelfImage } from '../../server/openai-vision';
import { searchBooksByTitle } from '../../server/books';
import { storage } from '../../server/storage';

// Disable the default body parser so we can handle multipart/form-data ourselves
export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper function to calculate similarity between two strings
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) {return 1.0;}

  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
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

// Parse the incoming `multipart/form-data` request and return the image buffer
async function parseMultipart(req: VercelRequest): Promise<Buffer | undefined> {
  const form = formidable({ 
    maxFileSize: 5 * 1024 * 1024, // 5 MB cap
    keepExtensions: true,
    // Use memory storage for serverless compatibility
    fileWriteStreamHandler: () => {
      const chunks: Buffer[] = [];
      let fileSize = 0;
      
      const writable = new (require('stream').Writable)({
        write(chunk: Buffer, _encoding: string, callback: Function) {
          chunks.push(chunk);
          fileSize += chunk.length;
          callback();
        }
      });

      writable.data = () => {
        return Buffer.concat(chunks, fileSize);
      };

      return writable;
    }
  });

  return new Promise((resolve, reject) => {
    form.parse(req, async (err: any, _fields: any, files: any) => {
      if (err) {return reject(err);}

      const file = files.image as any;
      if (!file) {return resolve(undefined);}

      const picked = Array.isArray(file) ? file[0] : file;
      
      try {
        // Get buffer directly from the stream instead of reading from filesystem
        if (picked._writeStream && typeof picked._writeStream.data === 'function') {
          resolve(picked._writeStream.data());
        } else if (picked.filepath) {
          // Fallback to original method if needed
          const data = await fs.readFile(picked.filepath);
          resolve(data);
        } else {
          resolve(undefined);
        }
      } catch (readErr) {
        reject(readErr);
      }
    });
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Basic CORS headers – mirrors other API routes
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
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

    const buffer = await parseMultipart(req);
    if (!buffer) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(413).json({ message: 'Image file is too large. Please upload an image smaller than 5MB.' });
    }

    const base64Image = buffer.toString('base64');

    // Analyse with OpenAI Vision (with Google Vision fallback)
    const visionAnalysis = await analyzeBookshelfImage(base64Image);

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

    // Fetch user preferences (legacy single-user implementation – userId = 1)
    try {
      const preferences = await storage.getPreferencesByUserId(1);

      // Look up each detected title via our existing search helper
      const detectedBooks: any[] = [];
      for (const title of bookTitles) {
        const results = await searchBooksByTitle(title);
        if (!results || results.length === 0) {continue;}

        const titleLower = title.toLowerCase();
        const bestMatch = results.reduce((best: any, current: any) => {
          const similarityCurrent = calculateSimilarity(titleLower, (current.title || '').toLowerCase());
          const similarityBest = best ? calculateSimilarity(titleLower, (best.title || '').toLowerCase()) : 0;
          return similarityCurrent > similarityBest ? current : best;
        }, null as any);

        if (bestMatch && calculateSimilarity(titleLower, bestMatch.title.toLowerCase()) > 0.6) {
          detectedBooks.push(bestMatch);
        }
      }

      if (detectedBooks.length === 0) {
        return res.status(200).json({
          books: [],
          bookTitles,
          message: "We identified some book titles, but couldn't find detailed information for them. Try taking a clearer photo with better lighting.",
        });
      }

      // Score books against user preferences – simplified from Express implementation
      const rankedBooks = detectedBooks.map((book) => {
        let matchScore = 0;
        if (preferences) {
          if (preferences.genres && book.categories) {
            for (const genre of preferences.genres) {
              if (book.categories.some((cat: string) => cat?.toLowerCase().includes(genre.toLowerCase()))) {
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
              // Exact title match – award points based on user rating
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
  } catch (error: any) {
    console.error('Error processing image:', error);
    
    // Provide more specific error messages for common issues
    if (error.message && error.message.includes('memory')) {
      return res.status(500).json({
        message: 'Server ran out of memory while processing the image',
        error: 'Try uploading a smaller image or reducing the image resolution',
      });
    }

    if (error.message && error.message.includes('ENOENT')) {
      return res.status(500).json({
        message: 'File processing error in serverless environment',
        error: 'Image file could not be read. This is likely a serverless environment limitation.',
      });
    }
    
    return res.status(500).json({
      message: 'Error processing image',
      error: error?.message || String(error),
    });
  }
} 