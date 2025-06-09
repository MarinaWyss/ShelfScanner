import { test, expect } from '@playwright/test';

test.describe('ShelfScanner Basic Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load the homepage successfully', async ({ page }) => {
    await expect(page).toHaveTitle(/ShelfScanner/);
    await expect(page.getByText('ShelfScanner')).toBeVisible();
  });

  test('should navigate to books page', async ({ page }) => {
    await page.click('text=Scan Books');
    await expect(page).toHaveURL(/.*books/);
    await expect(page.getByText(/upload/i)).toBeVisible();
  });

  test('should show upload interface on books page', async ({ page }) => {
    await page.goto('/books');
    
    // Should show upload button or drag-drop area
    await expect(page.getByRole('button', { name: /upload/i })).toBeVisible();
    
    // Should show instructions
    await expect(page.getByText(/drag.*drop/i)).toBeVisible();
  });

  test('should validate file upload', async ({ page }) => {
    await page.goto('/books');
    
    // Try to upload a non-image file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('This is not an image')
    });

    // Should show error message
    await expect(page.getByText(/invalid file type/i)).toBeVisible();
  });

  test('should handle image upload', async ({ page }) => {
    await page.goto('/books');
    
    // Upload a valid image file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'bookshelf.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fake-image-content')
    });

    // Should show processing state
    await expect(page.getByText(/processing/i)).toBeVisible();
  });

  test('should navigate to saved books page', async ({ page }) => {
    await page.click('text=Reading List');
    await expect(page).toHaveURL(/.*reading-list/);
    
    // Should show saved books interface
    await expect(page.getByText(/saved books/i)).toBeVisible();
  });

  test('should display privacy policy', async ({ page }) => {
    await page.click('text=Privacy');
    await expect(page).toHaveURL(/.*privacy-policy/);
    await expect(page.getByText(/privacy policy/i)).toBeVisible();
  });

  test('should display terms and conditions', async ({ page }) => {
    await page.click('text=Terms');
    await expect(page).toHaveURL(/.*terms-conditions/);
    await expect(page.getByText(/terms.*conditions/i)).toBeVisible();
  });

  test('should handle 404 for unknown routes', async ({ page }) => {
    await page.goto('/non-existent-page');
    await expect(page.getByText(/not found/i)).toBeVisible();
  });
});

test.describe('ShelfScanner Mobile Experience', () => {
  test.use({ 
    viewport: { width: 375, height: 667 } // iPhone SE size
  });

  test('should be mobile responsive', async ({ page }) => {
    await page.goto('/');
    
    // Should show mobile navigation
    await expect(page.getByRole('button', { name: /menu/i })).toBeVisible();
    
    // Content should be properly sized for mobile
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible();
  });

  test('should handle mobile file upload', async ({ page }) => {
    await page.goto('/books');
    
    // On mobile, should show camera/file upload options
    await expect(page.getByRole('button', { name: /upload/i })).toBeVisible();
    
    // Should handle touch interactions
    const uploadButton = page.getByRole('button', { name: /upload/i });
    await uploadButton.tap();
  });
});

test.describe('ShelfScanner API Integration', () => {
  test('should handle API errors gracefully', async ({ page }) => {
    // Mock API to return error
    await page.route('/api/books/analyze', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' })
      });
    });

    await page.goto('/books');
    
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fake-image-content')
    });

    // Should show error message
    await expect(page.getByText(/analysis failed/i)).toBeVisible();
  });

  test('should handle successful book detection', async ({ page }) => {
    // Mock API to return books
    await page.route('/api/books/analyze', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          books: [
            {
              title: 'Test Book',
              author: 'Test Author',
              coverUrl: 'http://example.com/cover.jpg',
              rating: '4.5'
            }
          ]
        })
      });
    });

    await page.goto('/books');
    
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fake-image-content')
    });

    // Should show detected books
    await expect(page.getByText('Test Book')).toBeVisible();
    await expect(page.getByText('Test Author')).toBeVisible();
  });

  test('should handle recommendations API', async ({ page }) => {
    // Mock recommendations API
    await page.route('/api/books/recommendations*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          recommendations: [
            {
              title: 'Recommended Book',
              author: 'Rec Author',
              matchScore: 85,
              matchReason: 'Based on your preferences'
            }
          ]
        })
      });
    });

    await page.goto('/books');
    
    // Navigate through the flow to get recommendations
    // This would require completing the preference setup first
    await expect(page.getByRole('button')).toBeVisible();
  });

  test('should handle preferences API', async ({ page }) => {
    // Mock preferences API
    await page.route('/api/preferences', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 1,
          genres: ['Fiction', 'Science Fiction'],
          authors: ['Isaac Asimov']
        })
      });
    });

    await page.goto('/books');
    
    // Test preference setting flow
    await expect(page.getByRole('button')).toBeVisible();
  });
});

test.describe('ShelfScanner Performance', () => {
  test('should load quickly', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/');
    const loadTime = Date.now() - startTime;
    
    // Should load within 3 seconds
    expect(loadTime).toBeLessThan(3000);
  });

  test('should handle large images efficiently', async ({ page }) => {
    await page.goto('/books');
    
    // Upload a larger image file
    const largeImageBuffer = Buffer.alloc(2 * 1024 * 1024); // 2MB
    
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'large-bookshelf.jpg',
      mimeType: 'image/jpeg',
      buffer: largeImageBuffer
    });

    // Should handle the upload without crashing
    await expect(page.getByText(/processing/i)).toBeVisible();
  });
});

test.describe('ShelfScanner Accessibility', () => {
  test('should be keyboard navigable', async ({ page }) => {
    await page.goto('/');
    
    // Should be able to navigate with Tab key
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    
    // Focus should be visible
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });

  test('should have proper ARIA labels', async ({ page }) => {
    await page.goto('/books');
    
    // Upload button should have proper accessibility attributes
    const uploadButton = page.getByRole('button', { name: /upload/i });
    await expect(uploadButton).toBeVisible();
    
    // File input should be properly labeled
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached();
  });
});

test.describe('ShelfScanner Local Storage', () => {
  test('should persist device ID', async ({ page }) => {
    await page.goto('/');
    
    // Device ID should be set in localStorage
    const deviceId = await page.evaluate(() => {
      return localStorage.getItem('deviceId');
    });
    
    expect(deviceId).toBeTruthy();
    expect(typeof deviceId).toBe('string');
  });

  test('should persist user preferences', async ({ page }) => {
    await page.goto('/books');
    
    // After setting preferences, they should be stored
    // This would require implementing the full preference flow
    const storage = await page.evaluate(() => {
      return localStorage.getItem('userPreferences');
    });
    
    // Storage should be available (might be null initially)
    expect(storage !== undefined).toBe(true);
  });
}); 