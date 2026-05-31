# Goals

## 長期目標

AIエージェントが、研究用アプリを自分で育て、そのアプリをPlaywright MCPで探索し、仕様化、テスト設計、Playwright実装、実行、修復、学習までを自律的に回せるようにする。

## 初期目標

1. 研究用アプリの最小機能を維持する
2. 1画面をクリック探索する
3. 観測結果を仕様化する
4. スモークテストを実装する
5. Playwright Testを通す
6. 失敗原因を分類して修復する
7. 学びをmemoryとskill-backlogに残す

## v04 direction

- Keep the research app authentication-free.
- Use IndexedDB as the browser-local datastore for validation data.
- Grow the app with many QA-relevant features: CRUD, validation, search, filter, sort, pseudo roles, error injection, slow mode, and scenario datasets.
- Accumulate reusable QA, quality-evaluation, and Playwright knowledge under `qa-knowledge/`.
