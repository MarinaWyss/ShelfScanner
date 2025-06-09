import { test, expect } from '@playwright/test';

test.describe('Simple E2E Tests', () => {
  test('should be able to visit google', async ({ page }) => {
    await page.goto('https://google.com');
    await expect(page).toHaveTitle(/Google/);
  });

  test('should handle basic interactions', async ({ page }) => {
    await page.goto('https://example.com');
    await expect(page.getByText('Example Domain')).toBeVisible();
  });
}); 