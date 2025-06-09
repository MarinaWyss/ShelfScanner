import 'dotenv/config';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.OPENAI_API_KEY = 'test-api-key';
process.env.GOOGLE_CLOUD_API_KEY = 'test-google-key'; 