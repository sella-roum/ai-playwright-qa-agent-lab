# Research 001: AI QA Agent v0.1

## 目的

AIエージェントが、研究用アプリをPlaywright MCPでクリック探索し、観測結果から仕様を作成し、Playwright Testを実装・実行・修復できるかを検証する。

## 対象画面

- テストケース一覧
- 詳細モーダル
- 実行結果登録フォーム

## 成功条件

- `specs/observed/` に探索ログがある
- `specs/screens/` または `specs/flows/` に仕様カタログがある
- `tests/e2e/generated/` または `tests/e2e/smoke/` にPlaywright Testがある
- `npx playwright test` が実行済みである
- 失敗時に原因分類が残っている
- `.agent/memory.md` が更新されている
