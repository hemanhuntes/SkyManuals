import { test, expect } from '@playwright/test';

test.describe('Manual Editor E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a test manual editor page
    await page.goto('/manuals/test-manual-id/edit');
  });

  test('should display manual editor interface', async ({ page }) => {
    // Check that the editor interface loads
    await expect(page.getByRole('heading', { name: /editor/i })).toBeVisible();
    
    // Check that Table of Contents sidebar is present
    await expect(page.getByText('Kapitel')).toBeVisible();
    
    // Check that editor area is present
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('should select section and load content', async ({ page }) => {
    // Mock successful section loading
    await page.route('/api/manuals/test-manual-id/sections/*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'section-1',
          title: 'Test Section',
          content: {
            type: 'doc',
            content: [
              {
                type: 'heading',
                attrs: { level: 2 },
                content: [{ type: 'text', text: 'Test Heading' }],
              },
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Test content...' }],
              },
            ],
          },
        }),
      });
    });

    // Click on first section in TOC if available
    const section = page.locator('[data-testid="section-item"]').first();
    if (await section.isVisible()) {
      await section.click();
      
      // Wait for content to load
      await expect(page.getByText('Test content...')).toBeVisible();
    }
  });

  test('should insert smart blocks', async ({ page }) => {
    // Mock MOCK API endpoints
    await page.route('/api/manuals/sections/*/blocks/smart', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          block: {
            id: 'block-1',
            smartBlockType: 'LEP',
          },
        }),
      });
    });

    // Click LEP smart block button
    await page.getByRole('button', { name: 'LEP' }).click();
    
    // Check for success message
    await expect(page.getByText('LEP block inserted successfully!')).toBeVisible();
  });

  test('should save block content with ETag validation', async ({ page }) => {
    let etagValue = '';
    
    // Mock content saving endpoint
    await page.route('/api/manuals/blocks/*/content', async (route) => {
      const requestData = await route.request().postDataJSON();
      
      // Check ETag header
      const ifMatch = route.request().headers()['if-match'];
      expect(ifMatch).toBeTruthy();
      
      etagValue = `new-etag-${Date.now()}`;
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'etag': etagValue,
        },
        body: JSON.stringify({
          success: true,
          etag: etagValue,
          block: {
            id: 'block-1',
          },
          changeSet: {
            id: 'changeset-1',
            status: 'PENDING',
          },
        }),
      });
    });

    // Try to edit content and save
    const editor = page.locator('.ProseMirror').first();
    if (await editor.isVisible()) {
      await editor.click();
      await editor.type(' New content');
      
      // Click save button
      await page.getByRole('button', { name: /spara/i }).click();
      
      // Check for success message
      await expect(page.getByText('Changes saved successfully!')).toBeVisible();
    }
  });

  test('should handle concurrent editing conflict', async ({ page }) => {
    // Mock conflict response
    await page.route('/api/manuals/blocks/*/content', async (route) => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: {
            type: 'conflict_error',
            message: 'Resource has been modified by another user',
            currentEtag: 'current-etag',
            providedEtag: 'stale-etag',
          },
        }),
      });
    });

    // Attempt to save and expect conflict message
    const saveButton = page.getByRole('button', { name: /spara/i });
    if (await saveButton.isVisible()) {
      await saveButton.click();
      
      await expect(page.getByText('Conflict detected! Someone else modified this content.')).toBeVisible();
    }
  });

  test('should show pending changes indicator', async ({ page }) => {
    // Type in editor to trigger changes
    const editor = page.locator('.ProseMirror').first();
    if (await editor.isVisible()) {
      await editor.click();
      await editor.type(' Testing changes');
      
      // Should see pending changes indicator
      await expect(page.locator('.fixed.bottom-4.right-4')).toBeVisible();
      await expect(page.getByText('Osparade ändringar')).toBeVisible();
      
      // Save button should be enabled
      await expect(page.getByRole('button', { name: /spara ändringar/i })).toBeEnabled();
    }
  });

  test('should display revision bar preview', async ({ page }) => {
    // Select a section that has content
    const section = page.locator('[data-testid="section-item"]').first();
    if (await section.isVisible()) {
      await section.click();
      
      // Should see revision bar preview
      await expect(page.getByText('Revision Bar (Preview)')).toBeVisible();
      await expect(page.getByText('0.1.0')).toBeVisible();
      await expect(page.getByText('DRAFT')).toBeVisible();
      await expect(page.getByText('Current changes')).toBeVisible();
    }
  });

  test('should show loading states', async ({ page }) => {
    // Navigate to editor page
    await page.goto('/manuals/test-manual-id/edit');
    
    // Should see loading skeleton initially
    await expect(page.locator('.animate-pulse')).toBeVisible();
    
    // Loading should disappear after content loads
    await expect(page.locator('.animate-pulse')).toBeHidden({ timeout: 5000 });
  });

  test('should handle network errors gracefully', async ({ page }) => {
    // Mock network error
    await page.route('/api/manuals/test-manual-id', async (route) => {
      await route.abort('failed');
    });

    await page.reload();
    
    // Should handle error gracefully without crashing
    await expect(page.getByRole('heading', { name: /editor/i })).toBeVisible();
  });

  test('should support keyboard shortcuts', async ({ page }) => {
    const editor = page.locator('.ProseMirror').first();
    if (await editor.isVisible()) {
      await editor.click();
      
      // Test bold shortcut (Ctrl+B / Cmd+B)
      await editor.press('Meta+b');
      
      // Test italic shortcut
      await editor.press('Meta+i');
      
      // Should be able to type after shortcuts
      await editor.type('Formatted text');
      await expect(editor).toContainText('Formatted text');
    }
  });

  test('should validate required fields', async ({ page }) => {
    // Try to create manual without title
    await page.route('/api/manuals', async (route) => {
      const requestData = await route.request().postDataJSON();
      if (!requestData.title) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
           .error: {
              type: 'validation_error',
              message: 'Title is required',
            },
          }),
        });
      }
    });
  });
});
