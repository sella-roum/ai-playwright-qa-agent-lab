# QA Knowledge Base

このディレクトリは、AIエージェントがQAを実施するうえで得た知見を蓄積する場所です。
アプリの検証用データはIndexedDBに置きますが、QA知見、Playwright知見、品質評価の判断材料はGitHub上のMarkdownとして残します。

## 基本方針

- アプリ仕様は `qa-knowledge/app-specs/` に整理します。
- テスト設計の観点は `qa-knowledge/test-design/` に整理します。
- 品質評価の基準は `qa-knowledge/quality-evaluation/` に整理します。
- 不具合や誤検知、flakyの傾向は `qa-knowledge/defects/` に整理します。
- Playwright実装・修復の知見は `qa-knowledge/playwright/` に整理します。
- 確認済みの事実と推測は必ず分けます。
- 直接 `SKILL.md` を書き換えず、まず `.agent/skill-backlog.md` に改善案を残します。
