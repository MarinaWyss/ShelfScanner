import axios from 'axios';
import { log } from './vite';

interface VisionRequest {
  requests: {
    image: {
      content: string;
    };
    features: {
      type: string;
      maxResults: number;
    }[];
  }[];
}

interface VisionResponse {
  responses: {
    labelAnnotations?: {
      description: string;
      score: number;
    }[];
    textAnnotations?: {
      description: string;
    }[];
    logoAnnotations?: {
      description: string;
      score: number;
    }[];
    fullTextAnnotation?: {
      text: string;
    };
    error?: {
      message: string;
    };
  }[];
}

export async function analyzeImage(base64Image: string): Promise<any> {
  try {
    const apiKey = process.env.GOOGLE_VISION_API_KEY;
    if (!apiKey) {
      throw new Error('Google Vision API key is not configured');
    }
    
    console.log("Using Google Vision API with key configured");

    // Remove data URL prefix if present
    const imageContent = base64Image.replace(/^data:image\/\w+;base64,/, '');
    
    const visionRequest: VisionRequest = {
      requests: [
        {
          image: {
            content: imageContent,
          },
          features: [
            {
              type: 'TEXT_DETECTION',
              maxResults: 20,
            },
            {
              type: 'LABEL_DETECTION',
              maxResults: 20,
            },
          ],
        },
      ],
    };

    const response = await axios.post<VisionResponse>(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      visionRequest
    );

    const visionResponse = response.data.responses[0];
    
    if (visionResponse.error) {
      throw new Error(`Vision API error: ${visionResponse.error.message}`);
    }

    // Extract text that might represent book titles or authors
    let extractedText = '';
    if (visionResponse.fullTextAnnotation) {
      extractedText = visionResponse.fullTextAnnotation.text;
    } else if (visionResponse.textAnnotations && visionResponse.textAnnotations.length > 0) {
      extractedText = visionResponse.textAnnotations[0].description;
    }

    // Check if labels indicate it's a book
    const isBookshelf = visionResponse.labelAnnotations?.some(
      label => label.description.toLowerCase().includes('book') || 
               label.description.toLowerCase().includes('shelf') ||
               label.description.toLowerCase().includes('library')
    );

    return {
      isBookshelf,
      text: extractedText,
      labels: visionResponse.labelAnnotations || [],
    };
  } catch (error) {
    log(`Error analyzing image: ${error instanceof Error ? error.message : String(error)}`, 'vision');
    throw error;
  }
}
