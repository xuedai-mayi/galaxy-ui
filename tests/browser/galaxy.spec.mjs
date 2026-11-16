import { test, expect } from '@playwright/test';

async function search(page, query) {
  await page.getByLabel('搜索模型', { exact: true }).click();
  await page.getByRole('textbox', { name: '搜索并定位模型星' }).fill(query);
}

test('layouts, search, selection, zoom, pause and fullscreen work together', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const frame = page.locator('.galaxy-frame');
  await expect(frame).toHaveAttribute('data-model-count', '6895');
  for (const name of ['功能星环', '领域星系', '功能星环']) {
    await page.getByRole('button', { name, exact: true }).click();
  }
  await expect(frame).toHaveAttribute('data-taxonomy', 'function');
  await search(page, 'demo-01-0001');
  await page.getByRole('textbox').press('Enter');
  await expect(frame).toHaveAttribute('data-selected-model', 'demo-01-0001');
  await expect(page.getByRole('complementary', { name: '模型详情' })).toBeVisible();
  await page.getByRole('button', { name: '领域星系', exact: true }).click();
  await expect(frame).toHaveAttribute('data-selected-model', 'demo-01-0001');
  await page.getByRole('button', { name: '关闭模型详情', exact: true }).click();
  await page.getByRole('button', { name: '暂停动效', exact: true }).click();
  await expect(page.getByRole('button', { name: '开启动效', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '恢复星图全景', exact: true }).click();
  await expect(page.getByLabel('星图缩放比例')).toHaveText('100%');
  await page.getByRole('button', { name: '放大星图', exact: true }).click();
  await expect(page.getByLabel('星图缩放比例')).not.toHaveText('100%');
  await page.getByRole('button', { name: '隐藏标签', exact: true }).click();
  await expect(page.getByRole('button', { name: '显示标签', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '展开星图', exact: true }).click();
  await expect(page.locator('.galaxy-expanded')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.galaxy-expanded')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('dataset replacement clears selection, search and grouping; empty data recovers', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tests/fixtures/dataset.html');
  await search(page, 'First record');
  await page.getByRole('textbox').press('Enter');
  await expect(page.getByLabel('Selection callback')).toHaveText('first');
  await search(page, 'First');
  await page.getByRole('button', { name: 'Replace dataset', exact: true }).click();
  await expect(page.locator('.galaxy-frame')).toHaveAttribute('data-selected-model', '');
  await expect(page.getByLabel('Selection callback')).toHaveText('none');
  await expect(page.getByRole('textbox')).toHaveValue('');
  await expect(page.getByRole('button', { name: '全部星系', exact: true })).toHaveClass('active');
  await expect(page.getByRole('complementary')).toHaveCount(0);
  await page.getByRole('textbox').fill('Second record');
  await page.getByRole('textbox').press('Enter');
  await expect(page.getByLabel('Selection callback')).toHaveText('second');
  await page.getByRole('button', { name: '功能星环', exact: true }).click();
  await page.getByRole('button', { name: 'Empty dataset', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('暂无记录。');
  await expect(page.getByLabel('Selection callback')).toHaveText('none');
  await page.getByRole('button', { name: 'Restore dataset', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.galaxy-frame')).toHaveAttribute('data-taxonomy', 'function');
  await search(page, 'First record');
  await page.getByRole('textbox').press('Enter');
  await expect(page.getByLabel('Selection callback')).toHaveText('first');
  expect(errors).toEqual([]);
});

test('mobile layout, reduced motion and stacked details', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '开启动效', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '功能星环', exact: true }).click();
  await expect(page.locator('.galaxy-frame')).toHaveAttribute('data-taxonomy', 'function');
  await search(page, 'demo-02-0001');
  await page.getByRole('textbox').press('Enter');
  await expect(page.getByRole('complementary')).toBeVisible();
  await expect(page.locator('.galaxy-detail-rail')).toHaveCSS('position', 'static');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('invalid JSON data reports an error instead of starting the renderer', async ({ page }) => {
  await page.route('**/models.json', route => route.fulfill({ json: [] }));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('无法加载星图');
  await expect(page.locator('.galaxy-star-canvas')).toHaveCount(0);
});
