# ShelfScanner Testing Guide

This document provides comprehensive information about testing in the ShelfScanner application.

## Overview

ShelfScanner uses a multi-layered testing approach with different tools for different types of tests:

- **Unit Tests (Server)**: Jest for server-side TypeScript code
- **Unit Tests (Client)**: Vitest for React components and client-side code
- **Integration Tests**: Supertest for API endpoint testing
- **End-to-End Tests**: Playwright for full application flow testing
- **Manual Tests**: Existing test scripts for specific functionality

## Test Structure

```
tests/
├── setup/                  # Test configuration and setup files
│   ├── server.setup.ts    # Jest setup for server tests
│   └── client.setup.ts    # Vitest setup for client tests
├── server/                # Server-side tests
│   ├── db.test.ts         # Database operations tests
│   ├── api-routes.test.ts # API endpoint tests
│   └── openai-service.test.ts # OpenAI integration tests
├── client/                # Client-side tests
│   └── components/        # React component tests
├── e2e/                   # End-to-end tests
│   └── basic-flow.spec.ts # Main application flow tests
├── utils/                 # Test utilities and helpers
│   └── test-helpers.ts    # Shared test utilities
└── [existing files]       # Legacy test scripts
```

## Running Tests

### All Tests
```bash
npm run test:all           # Run all test suites
```

### Server Tests
```bash
npm run test:server        # Run Jest server tests
npm run test:server -- --watch  # Watch mode
npm run test:server -- --coverage  # With coverage
```

### Client Tests
```bash
npm run test:client        # Run Vitest client tests
npm run test:client -- --watch  # Watch mode
npm run test:client -- --coverage  # With coverage
```

### End-to-End Tests
```bash
npm run test:e2e           # Run Playwright e2e tests
npm run test:e2e -- --headed  # Run with browser visible
npm run test:e2e -- --debug   # Debug mode
```

### Interactive Testing
```bash
npm run test:ui            # Launch Vitest UI for interactive testing
```

## Test Configuration Files

### Jest Configuration (`jest.config.server.js`)
- Configured for Node.js environment
- TypeScript support with ts-jest
- Mocks for external services (OpenAI, Google Vision)
- Coverage reporting

### Vitest Configuration (`vitest.config.client.ts`)
- Configured for jsdom environment (browser simulation)
- React Testing Library integration
- Mock setup for browser APIs

### Playwright Configuration (`playwright.config.ts`)
- Multiple browser testing (Chrome, Firefox, Safari)
- Mobile device testing
- Automatic server startup for tests

## Writing Tests

### Server-Side Unit Tests

```typescript
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

describe('Book Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a book', async () => {
    // Test implementation
    expect(result).toBeDefined();
  });
});
```

### Client-Side Component Tests

```typescript
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Component from './Component';

describe('Component', () => {
  it('renders correctly', () => {
    render(<Component />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });
});
```

### API Integration Tests

```typescript
import request from 'supertest';
import app from '../server/app';

describe('API Endpoints', () => {
  it('should handle POST /api/books', async () => {
    const response = await request(app)
      .post('/api/books')
      .send({ title: 'Test Book' })
      .expect(200);
    
    expect(response.body.title).toBe('Test Book');
  });
});
```

### End-to-End Tests

```typescript
import { test, expect } from '@playwright/test';

test('user can upload and analyze books', async ({ page }) => {
  await page.goto('/books');
  
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles('test-bookshelf.jpg');
  
  await expect(page.getByText('Books detected')).toBeVisible();
});
```

## Testing Patterns

### Mocking External Services

The application mocks external APIs during testing:

```typescript
// OpenAI mocking
jest.mock('openai', () => ({
  OpenAI: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue(mockResponse)
      }
    }
  }))
}));

// Google Vision mocking
jest.mock('@google-cloud/vision', () => ({
  ImageAnnotatorClient: jest.fn().mockImplementation(() => ({
    textDetection: jest.fn().mockResolvedValue(mockVisionResponse)
  }))
}));
```

### Database Testing

Database operations are tested with mocked Drizzle ORM:

```typescript
const mockDb = {
  select: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  delete: jest.fn()
};

jest.mock('drizzle-orm/node-postgres', () => ({
  drizzle: jest.fn().mockReturnValue(mockDb)
}));
```

### React Component Testing

React components are tested with React Testing Library:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Test user interactions
await userEvent.click(screen.getByRole('button'));
await userEvent.upload(fileInput, file);

// Test async operations
await waitFor(() => {
  expect(screen.getByText('Success')).toBeInTheDocument();
});
```

## Test Coverage

### Server Tests Cover:
- Database operations and schema validation
- API route handlers and middleware
- OpenAI service integration
- Google Vision API integration
- Rate limiting functionality
- Error handling and validation
- Authentication and authorization

### Client Tests Cover:
- React component rendering
- User interactions (clicks, form submissions)
- File upload functionality
- API integration from client
- State management
- Responsive design elements

### E2E Tests Cover:
- Complete user workflows
- Cross-browser compatibility
- Mobile responsiveness
- Performance characteristics
- Accessibility features
- Local storage persistence

## Continuous Integration

The test suite is designed to run in CI/CD environments:

### GitHub Actions Example:
```yaml
- name: Run Tests
  run: |
    npm run test:server
    npm run test:client
    npm run test:e2e
```

### Environment Variables for Testing:
```bash
NODE_ENV=test
DATABASE_URL=postgresql://test:test@localhost:5432/test_db
OPENAI_API_KEY=test_key
GOOGLE_VISION_API_KEY=test_key
```

## Test Data Management

### Mock Data Factories:
The `tests/utils/test-helpers.ts` file provides factory functions for creating test data:

```typescript
import { createMockBook, createMockRecommendation } from '../utils/test-helpers';

const testBook = createMockBook({ title: 'Custom Title' });
const testRec = createMockRecommendation({ matchScore: 95 });
```

### Database Seeding:
For integration tests that need database state:

```typescript
beforeEach(async () => {
  await seedTestDatabase();
});

afterEach(async () => {
  await cleanupTestDatabase();
});
```

## Debugging Tests

### Server Test Debugging:
```bash
# Run with debugging
npm run test:server -- --detectOpenHandles --forceExit

# Run specific test file
npm run test:server -- db.test.ts

# Run tests matching pattern
npm run test:server -- --testNamePattern="should create book"
```

### Client Test Debugging:
```bash
# Run with UI
npm run test:ui

# Run specific test
npm run test:client -- UploadStep.test.tsx

# Debug mode
npm run test:client -- --inspect-brk
```

### E2E Test Debugging:
```bash
# Run with browser visible
npm run test:e2e -- --headed

# Debug mode (interactive)
npm run test:e2e -- --debug

# Run specific test
npm run test:e2e -- basic-flow.spec.ts
```

## Performance Testing

### Load Testing:
```typescript
test('should handle multiple concurrent uploads', async () => {
  const uploads = Array(10).fill(null).map(() => 
    uploadFile(testImage)
  );
  
  const results = await Promise.all(uploads);
  expect(results.every(r => r.success)).toBe(true);
});
```

### Memory Leak Detection:
```bash
npm run test:server -- --detectLeaks
```

## Best Practices

### 1. Test Organization
- Group related tests with `describe` blocks
- Use descriptive test names that explain the expected behavior
- Follow the AAA pattern (Arrange, Act, Assert)

### 2. Mocking Strategy
- Mock external dependencies at the module level
- Use factory functions for creating test data
- Reset mocks between tests

### 3. Async Testing
- Always use `await` for async operations in tests
- Use `waitFor` for testing async UI updates
- Set appropriate timeouts for slow operations

### 4. Test Data
- Use meaningful test data that represents real scenarios
- Avoid hardcoding values; use constants or factories
- Clean up test data after each test

### 5. Error Testing
- Test both success and failure scenarios
- Verify error messages and status codes
- Test edge cases and boundary conditions

## Troubleshooting

### Common Issues:

1. **Tests timing out**
   - Increase timeout values in configuration
   - Check for unresolved promises
   - Ensure proper cleanup in afterEach hooks

2. **Mock not working**
   - Verify mock is declared before import
   - Check mock implementation matches actual API
   - Clear mocks between tests

3. **React component tests failing**
   - Ensure proper test environment setup
   - Check for missing providers (QueryClient, etc.)
   - Verify async operations complete before assertions

4. **E2E tests flaky**
   - Add proper wait conditions
   - Use stable selectors
   - Increase timeouts for slow operations

### Getting Help:
- Check test output for specific error messages
- Use debugging tools (`console.log`, debugger, browser dev tools)
- Run tests in isolation to identify problematic tests
- Check CI logs for environment-specific issues
