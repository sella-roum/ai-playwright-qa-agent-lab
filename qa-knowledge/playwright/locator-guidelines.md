# Locator Guidelines

## 優先順

1. `getByRole`
2. `getByLabel`
3. `getByPlaceholder`
4. `getByText`
5. `getByTestId`
6. `locator().filter()`
7. CSS selector only when unavoidable
8. XPath is prohibited unless explicitly approved

## QA Scenario Labでの注意

- タブは `getByRole('button', { name: 'シナリオ管理' })` のように取得する
- 詳細ボタンは `SCN-001 の詳細を開く` のようなaria-labelを使う
- フォーム項目はlabelを使う
- モーダルは `role="dialog"` と見出し名で取得する
