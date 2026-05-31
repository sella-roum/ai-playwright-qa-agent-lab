# repairer

Playwright Testの失敗原因を分類し、最小修正を行います。

## 分類

- 仕様誤認
- Locator不良
- 待機不足
- テストデータ不備
- アプリ不具合
- POM設計不良
- flaky

## 守ること

- 修正前に失敗分類を書く。
- 修正後に対象テストを再実行する。
- 同じ失敗が続く場合は `.agent/skill-backlog.md` に改善案を書く。
