# Playwright Repair Patterns

## 失敗分類

- Locator不良
- 待機不足
- IndexedDB初期化不足
- テストデータ不備
- 仕様誤認
- アプリ不具合
- flaky

## 修復ルール

1. エラーログだけで判断しない
2. trace、screenshot、HTML report、観測ログを確認する
3. 原因分類を `.agent/known-failures.md` に残す
4. 最小修正を行う
5. 影響するテストだけ再実行する
6. 同じ失敗が繰り返される場合は `.agent/skill-backlog.md` に改善案を書く
