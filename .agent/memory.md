# Agent Memory

## 2026-05-30 初期状態

- 研究用アプリは、認証なし・IndexedDB保存の検証対象アプリとして育てる。
- 最初の研究対象は、Playwright MCPによるクリック探索から仕様化、スモークテスト実装、実行、修復までのサイクルである。
- QA知見、品質評価、Playwright実装・修復の知見は `qa-knowledge/` に蓄積する。
- OpenCode Zenキーがない場合、agent-tickはドライランとして状態遷移とログ作成のみを行う。

## v04 design note

The research app now treats IndexedDB as the primary validation datastore. Tests should use reset URLs such as `/?reset=1&scenario=default` to avoid state leakage. Durable QA knowledge belongs in `qa-knowledge/`, not in the browser database.

## 2026-05-30T13:32:59.862Z REVIEW_PR

- Status: success
- Dry run: true
- Next phase: RUN_PR_CHECKS
- Cycle: cycle-0001
- Current PR: none
- Repair attempts: 0/3
- PR review attempts: 0/3
