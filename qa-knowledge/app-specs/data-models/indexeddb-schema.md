# IndexedDB Schema

## DB

- Name: `qa-scenario-lab-db`
- Purpose: 研究用アプリの検証データをブラウザ内に保持する
- Persistence: ブラウザ単位。Playwright検証では `?reset=1` または設定画面の初期化で再投入する

## Stores

### scenarios

テストシナリオの一覧、詳細、作成、編集、削除を検証するためのデータです。

主な項目:

- `id`
- `title`
- `area`
- `status`
- `priority`
- `owner`
- `updatedAt`
- `description`
- `risk`
- `tags`
- `steps`
- `expectedResult`

### runRecords

PlaywrightやAIエージェントのQA実行結果をアプリ上で検証するためのデータです。

主な項目:

- `id`
- `scenarioId`
- `assignee`
- `result`
- `note`
- `createdAt`

### knowledgeItems

アプリ内に表示するQA知見の種データです。永続的な研究知見は、このストアではなく `qa-knowledge/` に保存します。

### settings

疑似ロール、データセット、遅延注入、エラー注入の状態を保持します。
