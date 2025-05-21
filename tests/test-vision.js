import { analyzeBookshelfImage } from './server/openai-vision.js';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

async function testBookIdentification() {
  try {
    // Read the image file
    const imagePath = './public/test-bookshelf.jpg';
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    
    console.log('Analyzing image...');
    
    // Analyze the image using our OpenAI Vision integration
    const result = await analyzeBookshelfImage(base64Image);
    
    console.log('Analysis result:');
    console.log('Is bookshelf:', result.isBookshelf);
    console.log('Detected book titles:');
    
    if (result.bookTitles && result.bookTitles.length > 0) {
      result.bookTitles.forEach((title, index) => {
        console.log(`${index + 1}. "${title}"`);
      });
      console.log(`Total books detected: ${result.bookTitles.length}`);
    } else {
      console.log('No book titles detected');
    }
  } catch (error) {
    console.error('Error analyzing image:', error);
  }
}

testBookIdentification();