// Test utility functions and helpers

export const mockApiResponse = (data: any, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
  text: async () => JSON.stringify(data)
});

export const mockFormData = () => {
  const formData = new Map();
  return {
    append: (key: string, value: any) => formData.set(key, value),
    get: (key: string) => formData.get(key),
    has: (key: string) => formData.has(key),
    delete: (key: string) => formData.delete(key),
    entries: () => formData.entries(),
    keys: () => formData.keys(),
    values: () => formData.values()
  };
};

export const createMockBook = (overrides = {}) => ({
  id: 1,
  title: 'Test Book',
  author: 'Test Author',
  coverUrl: 'http://example.com/cover.jpg',
  isbn: '1234567890',
  rating: '4.5',
  summary: 'A test book for testing purposes',
  metadata: {},
  ...overrides
});

export const createMockRecommendation = (overrides = {}) => ({
  title: 'Recommended Book',
  author: 'Rec Author',
  matchScore: 85,
  matchReason: 'Based on your reading preferences',
  summary: 'A book you might enjoy',
  coverUrl: 'http://example.com/rec-cover.jpg',
  rating: '4.2',
  ...overrides
});

export const createMockPreferences = (overrides = {}) => ({
  id: 1,
  deviceId: 'test-device-123',
  userId: 1,
  genres: ['Fiction', 'Science Fiction'],
  authors: ['Isaac Asimov', 'Frank Herbert'],
  goodreadsData: null,
  ...overrides
});

export const createMockUser = (overrides = {}) => ({
  id: 1,
  username: 'testuser',
  password: 'hashedpassword',
  ...overrides
});

export const waitForAsyncOperations = () => 
  new Promise(resolve => setTimeout(resolve, 0));

export const mockImageFile = (name = 'test.jpg', size = 1024) => {
  const buffer = Buffer.alloc(size);
  return new File([buffer], name, { type: 'image/jpeg' });
};

export const mockTextFile = (name = 'test.txt', content = 'test content') => {
  return new File([content], name, { type: 'text/plain' });
};

export const createMockFileReader = (result: string) => ({
  readAsDataURL: jest.fn(),
  onload: null,
  result,
  error: null
});

export const createMockOpenAIResponse = (content: any) => ({
  choices: [
    {
      message: {
        content: typeof content === 'string' ? content : JSON.stringify(content)
      }
    }
  ],
  usage: {
    prompt_tokens: 100,
    completion_tokens: 200,
    total_tokens: 300
  }
});

export const createMockGoogleVisionResponse = (texts: string[]) => ([
  {
    textAnnotations: texts.map(text => ({
      description: text,
      boundingPoly: {
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 20 },
          { x: 0, y: 20 }
        ]
      }
    }))
  }
]);

export const mockConsoleError = () => {
  const originalError = console.error;
  const mockError = jest.fn();
  console.error = mockError;
  
  return {
    mockError,
    restore: () => {
      console.error = originalError;
    }
  };
};

export const mockConsoleLog = () => {
  const originalLog = console.log;
  const mockLog = jest.fn();
  console.log = mockLog;
  
  return {
    mockLog,
    restore: () => {
      console.log = originalLog;
    }
  };
};

export const createMockDatabase = () => {
  const _data = new Map();
  
  return {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(() => Promise.resolve([])),
          offset: jest.fn(() => Promise.resolve([])),
          orderBy: jest.fn(() => Promise.resolve([]))
        })),
        limit: jest.fn(() => Promise.resolve([])),
        orderBy: jest.fn(() => Promise.resolve([]))
      }))
    })),
    insert: jest.fn(() => ({
      values: jest.fn(() => ({
        returning: jest.fn(() => Promise.resolve([]))
      }))
    })),
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn(() => ({
          returning: jest.fn(() => Promise.resolve([]))
        }))
      }))
    })),
    delete: jest.fn(() => ({
      where: jest.fn(() => Promise.resolve([]))
    }))
  };
};

export const createMockRequest = (overrides = {}) => ({
  body: {},
  query: {},
  params: {},
  headers: {},
  method: 'GET',
  url: '/',
  ...overrides
});

export const createMockResponse = () => {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
    send: jest.fn(() => res),
    redirect: jest.fn(() => res),
    cookie: jest.fn(() => res),
    clearCookie: jest.fn(() => res),
    setHeader: jest.fn(() => res),
    end: jest.fn(() => res),
    statusCode: 200,
    headersSent: false
  };
  return res;
};

export const createMockNext = () => jest.fn();

export const setupTestEnvironment = () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
  process.env.OPENAI_API_KEY = 'test_openai_key';
  process.env.GOOGLE_VISION_API_KEY = 'test_google_key';
  process.env.ADMIN_USERNAME = 'testadmin';
  process.env.ADMIN_PASSWORD_HASH = 'test_hash';
};

export const cleanupTestEnvironment = () => {
  // Clean up any test data or mocks
  jest.clearAllMocks();
  jest.restoreAllMocks();
}; 