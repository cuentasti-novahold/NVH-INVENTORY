import { test, expect } from '@playwright/test';

test('home page loads without errors', async ({ page }) => {
  const response = await page.goto('/');
  expect(response, 'response should exist').not.toBeNull();
  expect(response!.ok(), `status was ${response!.status()}`).toBe(true);

  const body = page.locator('body');
  await expect(body).toBeAttached();
});
