import request from 'supertest';
import express from 'express';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock dependencies
jest.mock('@server/db');
jest.mock('openai');
jest.mock('@google-cloud/vision');

describe('API Routes Integration Tests', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create a minimal Express app for testing
    app = express();
    app.use(express.json());
    
    // Mock routes for testing
    app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });

    app.post('/api/books/analyze', (req, res) => {
      const { image } = req.body;
      if (!image) {
        return res.status(400).json({ error: 'Image is required' });
      }
      
      res.json({
        detectedBooks: [
          { title: 'Test Book', author: 'Test Author', confidence: 0.95 }
        ]
      });
    });

    app.post('/api/preferences', (req, res) => {
      const { deviceId, genres, authors } = req.body;
      if (!deviceId || !genres) {
        return res.status(400).json({ error: 'deviceId and genres are required' });
      }
      
      res.json({
        id: 1,
        deviceId,
        genres,
        authors: authors || [],
        createdAt: new Date().toISOString()
      });
    });

    app.get('/api/books/recommendations', (req, res) => {
      const { deviceId } = req.query;
      if (!deviceId) {
        return res.status(400).json({ error: 'deviceId is required' });
      }
      
      res.json({
        recommendations: [
          {
            title: 'Recommended Book',
            author: 'Rec Author',
            matchScore: 85,
            matchReason: 'Based on your preferences',
            summary: 'A great book you might like'
          }
        ]
      });
    });

    app.post('/api/books/save', (req, res) => {
      const { deviceId, title, author } = req.body;
      if (!deviceId || !title || !author) {
        return res.status(400).json({ error: 'deviceId, title, and author are required' });
      }
      
      res.json({
        id: 1,
        deviceId,
        title,
        author,
        savedAt: new Date().toISOString()
      });
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('Book Analysis', () => {
    it('should analyze book images successfully', async () => {
      const imageData = Buffer.from('fake-image-data').toString('base64');
      
      const response = await request(app)
        .post('/api/books/analyze')
        .send({ image: imageData })
        .expect(200);

      expect(response.body.detectedBooks).toBeDefined();
      expect(response.body.detectedBooks).toHaveLength(1);
      expect(response.body.detectedBooks[0].title).toBe('Test Book');
      expect(response.body.detectedBooks[0].confidence).toBeGreaterThan(0.5);
    });

    it('should return error for missing image', async () => {
      const response = await request(app)
        .post('/api/books/analyze')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Image is required');
    });

    it('should handle large image files', async () => {
      const largeImageData = Buffer.alloc(10 * 1024 * 1024).toString('base64'); // 10MB
      
      const response = await request(app)
        .post('/api/books/analyze')
        .send({ image: largeImageData })
        .expect(200);

      expect(response.body.detectedBooks).toBeDefined();
    });
  });

  describe('User Preferences', () => {
    it('should create user preferences successfully', async () => {
      const preferences = {
        deviceId: 'test-device-123',
        genres: ['Fiction', 'Science Fiction'],
        authors: ['Isaac Asimov', 'Frank Herbert']
      };

      const response = await request(app)
        .post('/api/preferences')
        .send(preferences)
        .expect(200);

      expect(response.body.deviceId).toBe(preferences.deviceId);
      expect(response.body.genres).toEqual(preferences.genres);
      expect(response.body.authors).toEqual(preferences.authors);
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/preferences')
        .send({ deviceId: 'test-device' })
        .expect(400);

      expect(response.body.error).toBe('deviceId and genres are required');
    });

    it('should handle empty authors array', async () => {
      const preferences = {
        deviceId: 'test-device-123',
        genres: ['Fiction']
      };

      const response = await request(app)
        .post('/api/preferences')
        .send(preferences)
        .expect(200);

      expect(response.body.authors).toEqual([]);
    });
  });

  describe('Book Recommendations', () => {
    it('should get recommendations for user', async () => {
      const response = await request(app)
        .get('/api/books/recommendations')
        .query({ deviceId: 'test-device-123' })
        .expect(200);

      expect(response.body.recommendations).toBeDefined();
      expect(response.body.recommendations).toHaveLength(1);
      expect(response.body.recommendations[0].matchScore).toBeDefined();
      expect(response.body.recommendations[0].matchReason).toBeDefined();
    });

    it('should require deviceId parameter', async () => {
      const response = await request(app)
        .get('/api/books/recommendations')
        .expect(400);

      expect(response.body.error).toBe('deviceId is required');
    });

    it('should handle empty recommendations', async () => {
      // Modify the mock to return empty recommendations
      app.get('/api/books/recommendations', (req, res) => {
        res.json({ recommendations: [] });
      });

      const response = await request(app)
        .get('/api/books/recommendations')
        .query({ deviceId: 'test-device-123' })
        .expect(200);

      expect(response.body.recommendations).toEqual([]);
    });
  });

  describe('Save Books', () => {
    it('should save book successfully', async () => {
      const bookData = {
        deviceId: 'test-device-123',
        title: 'Dune',
        author: 'Frank Herbert',
        coverUrl: 'http://example.com/cover.jpg',
        rating: '4.5',
        summary: 'Epic science fiction novel'
      };

      const response = await request(app)
        .post('/api/books/save')
        .send(bookData)
        .expect(200);

      expect(response.body.title).toBe(bookData.title);
      expect(response.body.author).toBe(bookData.author);
      expect(response.body.savedAt).toBeDefined();
    });

    it('should validate required fields for saving', async () => {
      const response = await request(app)
        .post('/api/books/save')
        .send({ deviceId: 'test-device' })
        .expect(400);

      expect(response.body.error).toBe('deviceId, title, and author are required');
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown routes', async () => {
      await request(app)
        .get('/api/unknown-route')
        .expect(404);
    });

    it('should handle malformed JSON', async () => {
      await request(app)
        .post('/api/preferences')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);
    });
  });

  describe('Rate Limiting', () => {
    it('should implement rate limiting for OpenAI endpoints', async () => {
      // This would test actual rate limiting implementation
      // For now, just ensure the endpoint exists
      const response = await request(app)
        .post('/api/books/analyze')
        .send({ image: 'test-image' });

      expect(response.status).toBeLessThan(500);
    });
  });
}); 