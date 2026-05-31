import { expect, test } from '@playwright/test';

test.describe('QA Scenario Lab smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?reset=1&scenario=default');
    await expect(page.getByRole('heading', { name: 'QA Scenario Lab' })).toBeVisible();
  });

  test('IndexedDBの初期データを使って一覧検索、詳細モーダル、実行結果登録を確認できる', async ({ page }) => {
    await expect(page.getByText('DB: IndexedDB')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'テストケース一覧' })).toBeVisible();

    await page.getByLabel('検索キーワード', { exact: true }).fill('詳細');
    await expect(page.getByRole('cell', { name: 'SCN-003', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'SCN-001', exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'SCN-003 の詳細を開く' }).click();
    await expect(page.getByRole('dialog', { name: '詳細モーダルを表示できる' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '期待結果', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '詳細モーダルを閉じる' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByRole('button', { name: '実行結果' }).click();
    await page.getByRole('button', { name: '登録' }).click();
    await expect(page.getByRole('alert')).toContainText('担当者は必須です');
    await expect(page.getByRole('alert')).toContainText('実行メモは必須です');

    await page.getByLabel('対象シナリオ', { exact: true }).selectOption('SCN-003');
    await page.getByLabel('担当者', { exact: true }).fill('QA Agent');
    await page.getByLabel('実行結果', { exact: true }).selectOption('Passed');
    await page.getByLabel('実行メモ', { exact: true }).fill('IndexedDB保存のスモークテスト実行');
    await page.getByRole('button', { name: '登録' }).click();
    await expect(page.getByRole('status').filter({ hasText: '実行結果をIndexedDBに登録しました' })).toBeVisible();
    await expect(page.getByText('SCN-003 / QA Agent / IndexedDB保存のスモークテスト実行')).toBeVisible();
  });

  test('疑似ロールが閲覧者の場合は更新系操作が無効になる', async ({ page }) => {
    await page.getByRole('button', { name: '検証設定' }).click();
    await page.getByLabel('疑似ロール', { exact: true }).selectOption('閲覧者');
    await page.getByRole('button', { name: 'シナリオ管理' }).click();

    await expect(page.getByRole('button', { name: 'SCN-001 を編集する' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'SCN-001 を削除する' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '作成' })).toBeDisabled();
  });
});
