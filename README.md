# AI Playwright QA Agent Lab

AIエージェントが、自分で研究用アプリを育て、Playwright MCPで画面をクリック探索し、観測結果を仕様化し、Playwright Testを実装・実行・修復し、その学びを蓄積するための実験用リポジトリです。

## 目的

このリポジトリの目的は、AIエージェントにPlaywrightを使わせるうえでの実践的な最適解を研究することです。

AIエージェントは、次のサイクルを回します。

1. 研究用アプリを小さく改善する
2. GitHub Pagesまたはローカルプレビューで画面を開く
3. Playwright MCPのクリック・入力・スナップショット系ツールで画面を探索する
4. 観測結果を仕様カタログにまとめる
5. 仕様からテスト観点を作る
6. Playwright Testコードを実装する
7. `npx playwright test` で実行する
8. 壊れたらtrace、screenshot、report、ログを確認して修正する
9. 結果を研究ログ、memory、skill-backlogへ反映する
10. PRとして成果を残す

## 重要な方針

- 画面探索前にPlaywrightコードを書かない
- Playwright MCPの観測結果を仕様化してからテストを書く
- 確認済み仕様と推測仕様を分ける
- Locatorは `getByRole`、`getByLabel`、`getByText` などを優先する
- XPathと固定waitは原則使わない
- mainへ直接pushせず、エージェント作業はPRで確認する
- 公開リポジトリ前提のため、実案件情報、会社情報、個人情報、APIキーは入れない
- 研究用アプリは認証を入れず、DBはIndexedDBを使う
- Playwright検証では `?reset=1&scenario=default` などで再現可能な初期状態を作る
- QA知見、品質評価、Playwright修復知見は `qa-knowledge/` に蓄積する

## 初期構成

```text
apps/research-app/        研究用Reactアプリ。認証なし・IndexedDB保存
qa-knowledge/             QA観点、品質評価、Playwright実装・修復の知見
specs/                    Playwright MCP探索から作った仕様
specs/observed/           探索ログ
tests/e2e/                Playwright Test
research/                 研究テーマ、結果、評価
.agent/                   エージェントの状態、記憶、学習ログ
.opencode/                OpenCode用エージェント定義とスキル
.github/workflows/        GitHub Actions
scripts/                  自律サイクル用スクリプト
```

## 研究用アプリの方針

`apps/research-app` は、AIエージェントがQAを実施するための検証対象アプリです。

- 認証は実装しません。
- 疑似ロール切替で、閲覧者・QA担当者・管理者の表示差分と操作可否を検証します。
- データはIndexedDBに保存します。
- `?reset=1&scenario=default` のようなURLで、Playwright実行時だけ再現可能なデータを投入します。
- データセットは `default`、`empty`、`large`、`validation`、`error`、`slow` を用意します。
- エラー注入と遅延注入により、異常系・待機・修復の研究ができるようにします。

## QA知見の蓄積

`qa-knowledge/` には、AIエージェントがQAやPlaywright実装を行う上で再利用できる知見を保存します。

- `qa-knowledge/app-specs/`: アプリ仕様、画面仕様、フロー仕様、IndexedDBスキーマ
- `qa-knowledge/test-design/`: QA観点、スモーク・リグレッションの方針
- `qa-knowledge/quality-evaluation/`: 品質評価scorecard
- `qa-knowledge/defects/`: 不具合、誤検知、flakyの傾向
- `qa-knowledge/playwright/`: Locator、POM、IndexedDB、trace、修復の知見

`specs/` は観測結果に基づく仕様、`research/` は実験結果、`.agent/` はAI自身の記憶として使い分けます。

## 最初に設定するもの

### 1. GitHub Secrets

公開リポジトリの `Settings > Secrets and variables > Actions` で、次を登録します。

| Secret                 |           必須 | 用途                                 |
| ---------------------- | -------------: | ------------------------------------ |
| `OPENCODE_ZEN_API_KEY` | 実運用では必須 | OpenCode ZenでAIエージェントを動かす |

`OPENCODE_ZEN_API_KEY` がない場合、`agent-tick` はドライランとして動きます。リポジトリ構成や状態遷移だけ確認できます。OpenCode Zenを使ってAI作業を実行する場合は必須です。

### 2. GitHub Repository Variables

モデルIDは廃止・更新される可能性があるため、コードや `opencode.json` には固定しません。GitHubのRepository Variablesで管理します。

最低限、次を登録してください。

| Variable              | 必須 | 用途                                                               |
| --------------------- | ---: | ------------------------------------------------------------------ |
| `AGENT_MODEL_DEFAULT` | 必須 | Agent別モデルが未設定の場合に使う既定モデル                        |
| `AGENT_AUTO_MERGE`    | 推奨 | 初期値は `0`。安定後に `1` を検討                                  |
| `OPENCODE_CLI`        | 任意 | OpenCode CLIの実行コマンド。未設定時は `npx -y opencode-ai@latest` |

必要に応じて、Agent別にモデルを分けられます。未設定の場合は `AGENT_MODEL_DEFAULT` を使います。

| Variable                        | 対象Agent                 |
| ------------------------------- | ------------------------- |
| `AGENT_MODEL_RESEARCH_DIRECTOR` | 研究統括                  |
| `AGENT_MODEL_APP_BUILDER`       | アプリ実装                |
| `AGENT_MODEL_BROWSER_EXPLORER`  | Playwright MCP探索        |
| `AGENT_MODEL_SPEC_WRITER`       | 仕様化                    |
| `AGENT_MODEL_TEST_DESIGNER`     | テスト設計                |
| `AGENT_MODEL_TEST_WRITER`       | Playwright実装            |
| `AGENT_MODEL_REPAIRER`          | 修復                      |
| `AGENT_MODEL_REVIEWER`          | レビュー                  |
| `AGENT_MODEL_LEARNER`           | 学習ログ更新              |
| `AGENT_MODEL_KNOWLEDGE_UPDATER` | 外部情報更新              |
| `AGENT_MODEL_TEST_RUNNER`       | テスト実行確認            |
| `AGENT_MODEL_TEST_DATA_MANAGER` | IndexedDBテストデータ管理 |
| `AGENT_MODEL_QUALITY_EVALUATOR` | 品質評価                  |

OpenCode Zenを実行する場合、`AGENT_MODEL_DEFAULT` または対象Agentの `AGENT_MODEL_*` が未設定だと、エージェントは停止します。未設定時にコード上の既定モデルへフォールバックする仕組みは意図的に入れていません。

`OPENCODE_CLI` は通常は未設定で問題ありません。未設定時は `npx -y opencode-ai@latest` を使います。OpenCode CLIのパッケージ名や実行方法が変わった場合だけ、Repository Variablesで差し替えてください。

### 3. GitHub Pages

`Settings > Pages` で、Sourceを `GitHub Actions` にします。

### 4. Actionsの権限

`Settings > Actions > General` で、Workflow permissionsを次のようにします。

- `Read and write permissions`
- `Allow GitHub Actions to create and approve pull requests` を有効化

## ローカルでの起動

```bash
npm ci
npm run dev:research-app
```

別ターミナルでPlaywrightを実行します。

```bash
npx playwright install --with-deps chromium
npm run test:e2e
```

## エージェントtickを手動で試す

OpenCode Zenのキーがない場合はドライランです。

```bash
npm run agent:tick
```

`RUN_PLAYWRIGHT` フェーズでPlaywrightが失敗した場合は、workflowを単純失敗にせず、次のフェーズを `REPAIR_IF_FAILED` に進めます。

OpenCode Zenを使う場合は、環境変数を設定します。

```bash
export OPENCODE_ZEN_API_KEY=your_key
export AGENT_MODEL_DEFAULT=your_opencode_model_id
export AGENT_DRY_RUN=0
export AGENT_ENABLE_OPENCODE=1
npm run agent:tick
```

## 手動コマンド

`Agent Tick` workflowは、手動実行時に次のコマンドを選べます。

| command             | 内容                                                           |
| ------------------- | -------------------------------------------------------------- |
| `run-next`          | 現在のフェーズを1つ進めます                                    |
| `pause`             | 自律実行を一時停止します                                       |
| `resume`            | 自律実行を再開します                                           |
| `refresh-knowledge` | Playwright、Playwright MCP、OpenCodeなどの外部情報を更新します |
| `summarize`         | 現在の状態を `.agent/latest-status.md` に出力します            |

## サイクル管理と修復上限

`.agent/state.json` では、研究サイクルと修復回数を管理します。

- `cycle_id` は `CREATE_PR` フェーズ完了時に `cycle-0001` から `cycle-0002` のように進みます。
- `repair_attempts` は、Playwright Testが失敗するたびに増えます。
- `max_repair_attempts` に達した場合、同じ修復を繰り返さず `REVIEW_QA_OUTPUT` へ進み、`blocked_until_user_review` を `true` にします。
- Playwright Testが成功した場合、`repair_attempts` は0に戻ります。

## GitHub Actionsでの動き

`Agent Tick` workflowは、10分ごとに起動します。

- `agent/autonomous-research` ブランチを作成または更新します
- `.agent/state.json` のフェーズを1つ進めます
- OpenCode CLIを `--version` で事前確認します
- OpenCode Zenが設定されていれば、フェーズに応じたAI作業を実行します
- 変更があればPRを作成または更新します
- 証跡をartifactとして保存します

## 初期MVPの限界

このリポジトリは、最初に動かすための土台です。以下は意図的に最小限にしています。

- OpenCode CLIは、`Agent Tick` workflow内で `npx -y opencode-ai@latest --version` 相当の確認をしてから使います。
- OpenCode CLIの実行コマンドは、必要に応じてRepository Variable `OPENCODE_CLI` で変更できます。未設定時は `npx -y opencode-ai@latest` です。
- OpenCodeのモデルIDはコードや `opencode.json` には固定せず、`AGENT_MODEL_DEFAULT` またはAgent別の `AGENT_MODEL_*` Repository Variablesで管理します。
- AIの自動作業は安全のため1tickにつき1フェーズだけです。
- PR作成は `agent/autonomous-research` ブランチに集約します。
- GitHub Pagesへの公開はmainに反映されたアプリに対して行います。
- `EXPLORE_WITH_BROWSER` フェーズでは、GitHub PagesではなくActions内のローカルVite previewを起動し、`PLAYWRIGHT_TARGET_URL` をAIに渡して探索させます。
- 依存関係は `package-lock.json` を含め、Actionsでは `npm ci` を使います。

## 最初の研究テーマ

`Research 001` として、AI QA Agentが次を達成できるかを検証します。

- IndexedDBを使う研究用アプリの一覧・登録・QA知見画面を探索する
- 観測結果を仕様カタログにする
- スモークテストを書く
- Playwright Testを実行する
- 失敗時に原因分類と修正を行う
- 学びをmemory、skill-backlog、qa-knowledgeに残す

## v06: PRレビューゲートと安全な待機制御

v06では、v05のPR集中運用をさらに安全側へ寄せています。

### AIレビュー結果をマージ条件に含める

`REVIEW_PR` は `quality-evaluator` が担当し、`research/scorecards/pr-review.md` を作成します。
このファイルには、必ず次の機械判定用の行を含めます。

```text
merge_allowed: true
```

`npm run quality:check` が通っても、`merge_allowed: true` がない場合は `MERGE_PR` に進みません。
`merge_allowed: false` または判定行が存在しない場合は、`FIX_PR_REVIEW` または人間レビュー待ちへ戻ります。

### 人間レビュー待ち

`blocked_until_user_review: true` の場合、通常の10分tickでは作業を進めません。
再開する場合は、手動workflowで `command=resume` を実行してください。

### 自動マージOFF時の待機

`AGENT_AUTO_MERGE` が無効な場合、PRが品質ゲートを通過しても自動マージは行いません。
その場合は `WAITING_FOR_MANUAL_MERGE` に入り、PRが人間によってmergeされるまで待機します。
待機中はPRへ小さなコミットを積まないよう、永続ファイルの更新を抑制します。

### push前品質ゲート

agent branchへpushする前の品質ゲートは、必ず `npm run quality:check` を実行します。
この確認は切り替え不可です。`format:check`、`lint`、`typecheck`、`test:unit`、`lint:repo`、`build`、`test:e2e` のすべてが通らない限り、agent branchへpushしません。

GitHub Actions上では、事前に `npx playwright install --with-deps chromium` を実行しているため、push前にもPlaywright E2Eまで含めて確認します。品質ゲートを軽量化・省略する環境変数は用意していません。

## v07: push前品質ゲートのfull固定

v07では、push前品質ゲートの切り替え機能を削除しました。agent branchへpushする前は、常に `npm run quality:check` を実行します。`fast` や `skip` のような軽量・省略モードはありません。

### PRの流れ

```text
CREATE_PR
  → REVIEW_PR
  → RUN_PR_CHECKS
  → FIX_PR_REVIEW
  → RUN_PR_CHECKS
  → MERGE_PR
  → WAITING_FOR_MANUAL_MERGE
  → CLEANUP_BRANCH
  → IDLE
```

### GitHub側の推奨設定

`main` にはBranch protectionを設定し、少なくとも次を有効にしてください。

- Require a pull request before merging
- Require status checks to pass before merging
- Required status check: `PR Check / quality-check`
- Require conversation resolution before merging
- Pull Requests設定の `Automatically delete head branches`

自動マージは既定では無効です。最初は人間がmergeを確認し、安定後に手動workflowの `auto_merge=true` またはRepository Variablesの `AGENT_AUTO_MERGE=1` を使ってください。

## v08: full品質ゲートを維持した同一workflow内修復

v08では、push前full品質ゲートを維持したまま、壊れた途中状態をpushせずに修復できるようにしました。

- `IMPLEMENT_APP`、`IMPLEMENT_PLAYWRIGHT`、`RUN_PLAYWRIGHT`、`REPAIR_IF_FAILED`、`FIX_PR_REVIEW`、`RUN_PR_CHECKS` では、同一workflow内で `npm run quality:check` を実行します。
- 品質ゲートが失敗した場合、AI repairerが同一workflow内で修復し、再度 `npm run quality:check` を実行します。
- `max_inline_quality_repair_attempts` の上限を超えても品質ゲートが通らない場合、そのブランチ更新はpushされません。
- `scripts/commit-agent-branch.sh` でも、push直前に必ず `npm run quality:check` を再実行します。
- これにより、壊れたテスト・壊れたアプリ・壊れた設定をGitHubへpushしない方針を保ったまま、自律修復サイクルを回せます。
- GitHub Pagesのbuildでは `GITHUB_PAGES=1` を渡し、リポジトリ配下のPages URLでもasset pathが崩れないようにしています。

重要な方針として、品質ゲートを軽量化・省略するモードはありません。AIエージェントは、pushする前に必ずformat、lint、typecheck、unit test、repo validation、build、Playwright E2Eをすべて通す必要があります。

## v09: 安全なPRレビュー判定とブロック状態の保存

v09では、自動マージに近い運用で誤判定が起きないよう、PRレビューゲートと状態管理を安全側へ寄せています。

### PRレビューゲート

`research/scorecards/pr-review.md` の初期値は、必ず `merge_allowed: false` です。AIの `quality-evaluator` が現在のサイクルと現在のPRをレビューした場合だけ、次の形式でマージ許可を出せます。

```text
- cycle_id: cycle-0001
- pr_number: 12
- reviewed_at: 2026-05-30T00:00:00.000Z
- merge_allowed: true
```

`merge_allowed: true` があっても、`cycle_id` または `pr_number` が現在の `.agent/state.json` と一致しない場合は、古いレビュー結果として扱い、マージには進みません。

### マージ後のcleanup PR抑制

`WAITING_FOR_MANUAL_MERGE` 中にPRがmerge済みであることを検知した場合、その場でサイクルを完了し、次の `cycle_id` に進めて `IDLE` へ戻します。これにより、merge後にcleanupだけの追加PRが作られにくくなります。

### 品質ゲート失敗時のブロック状態

同一workflow内の修復上限を超えても `npm run quality:check` が通らない場合、壊れた作業ツリーをそのままpushしません。代わりに、壊れた差分を戻したうえで、`.agent/blockers/` に人間レビュー用のブロック記録を残し、`.agent/state.json` を `blocked_until_user_review: true` にします。

これにより、壊れたアプリや壊れたテストはpushせず、次回tickで同じ失敗を繰り返さないための停止状態だけを保存できます。

### 証跡の扱い

`.agent/runs/` と `.agent/mcp-output/` の詳細ログは、原則としてGitHub Actions artifactに保存します。リポジトリには、仕様、scorecard、QA知見、Playwright知見、ブロック記録など、後から読む価値が高い成果物を中心に残します。

## v10: 手動マージ待機の初回保存とPRブロック記録の強化

v10では、ライブラリは引き続き最新利用方針を維持しつつ、PR運用の状態管理を補強しています。

### WAITING_FOR_MANUAL_MERGE の保存方針

`MERGE_PR` から `WAITING_FOR_MANUAL_MERGE` に初めて進んだときは、その状態を1回だけagent branchへcommitします。これにより、次回tickで `MERGE_PR` を繰り返さず、PRがmergeされるまで待機できます。

一方で、HEAD上の `.agent/state.json` もすでに `WAITING_FOR_MANUAL_MERGE` の場合は、待機中の小さなcommitを作らないようにします。

```text
MERGE_PR
  → WAITING_FOR_MANUAL_MERGE   初回だけcommit
  → WAITING_FOR_MANUAL_MERGE   以後はcommitせず待機
```

### PRレビュー上限到達時のブロック記録

PRレビューゲートやPR品質ゲートが繰り返し失敗し、`max_pr_review_attempts` に到達した場合も、`.agent/blockers/` に人間レビュー用の記録を残します。

ブロック記録には、対象cycle、PR番号、試行回数、ゲート判定内容、stdout/stderrを保存します。これにより、`blocked_until_user_review: true` で止まった理由をGitHub上から追えるようにしています。

## v11: 自動マージ時の最終状態pushとブランチ再作成防止

v11では、`AGENT_AUTO_MERGE=1` のときに、PRが即時mergeされてagent branchが削除されたあと、待機状態のcommitによってbranchが再作成される問題を避けるため、自動マージの実行順序を変更しています。

### 自動マージ時の流れ

自動マージが有効な場合、`MERGE_PR` フェーズではすぐに `gh pr merge` を実行しません。まず、PRに入る `.agent/state.json` を次サイクル開始可能な `IDLE` 状態へ整えます。

```text
MERGE_PR
  → final IDLE state を作成
  → agent branchへpush
  → push後に gh pr merge --auto --delete-branch を実行
```

この順序により、PRがmergeされたmainブランチに `MERGE_PR` や `WAITING_FOR_MANUAL_MERGE` のような一時フェーズが残りにくくなります。

### runtime auto-merge file

`MERGE_PR` フェーズでは、同一workflow内だけで使う `.agent/runtime-auto-merge.json` を作成します。このファイルは `.gitignore` 対象であり、リポジトリにはcommitしません。

`commit-agent-branch.sh` は、full品質ゲートを通してfinal IDLE stateをpushしたあと、このruntime fileを読んで対象PRをauto mergeします。これにより、自動マージ時の余計な待機PRやbranch再作成を抑制します。

### 手動マージ時の挙動

`AGENT_AUTO_MERGE` が無効な場合の挙動はv12で変更しています。現在は、手動マージ時もPRに入る `.agent/state.json` を次サイクル開始可能な `IDLE` 状態へ整え、PRが開いている間は新規サイクルを開始せず静かに待機します。

## v12: 手動マージ時もmainへ一時フェーズを残さない

v12では、自動マージだけでなく手動マージでも、PRがmergeされたmainブランチに `WAITING_FOR_MANUAL_MERGE` のような一時フェーズが入らないようにしています。

### 手動マージ時の流れ

`AGENT_AUTO_MERGE` が無効な場合でも、`MERGE_PR` フェーズではPRに入る `.agent/state.json` を次サイクル開始可能な `IDLE` 状態へ整えます。

```text
MERGE_PR
  → final IDLE state を作成
  → agent branchへpush
  → PRは人間の手動merge待ち
```

これにより、人間がPRをmergeしても、mainには次のサイクルを開始できる安全な状態が入ります。

### 既存PRが開いている間の待機

agent branch上のstateが `IDLE` で、既存agent PRがすでに品質ゲートとPRレビューを通過している場合、10分tickは新しい研究サイクルを始めません。PRがmergeされるまで、永続ファイルを更新せずに待機します。

`workflow_dispatch` で `auto_merge=true` を指定した場合は、すでに手動マージ待ちになっているPRに対しても `gh pr merge --auto --delete-branch` を送信できます。

この設計により、手動マージ運用でもPRへ小さな待機commitを積まず、mainにも一時的な実行フェーズを残しにくくしています。

## v13: Dependabotによる脆弱性対応

v13では、依存関係の脆弱性が公開された場合にDependabot security update PRを作成するため、`.github/dependabot.yml` を追加しています。

### 基本方針

通常のversion update PRは作成しません。通常の最新版追従までDependabotに任せると、AIエージェントの1サイクル1PR運用と衝突しやすいためです。

```text
通常version update:
  Dependabotでは抑制
  必要に応じてAIエージェントの研究Issueで対応

security update:
  DependabotがPR化
  full品質ゲートを必須にする
```

### Dependabot設定

`.github/dependabot.yml` では、npm ecosystemを対象にし、`open-pull-requests-limit: 0` で通常のversion update PRを止めています。一方で、Dependabot security updatesは別枠で動作するため、脆弱性対応PRは作成されます。

security update PRは、patch/minorとmajorでグループを分けています。

```text
npm-security-patch-and-minor:
  patch / minor のsecurity update

npm-security-major:
  major のsecurity update
```

### GitHub側で有効化するもの

リポジトリ作成後、GitHub側で次を有効にしてください。

```text
Settings
  → Security / Advanced Security
    → Dependency graph
    → Dependabot alerts
    → Dependabot security updates
```

public repositoryでは一部設定が常時有効、または変更不可になっている場合があります。

### Dependabot PRの扱い

Dependabot PRも、mainに入る前に必ずfull品質ゲートを通します。

```text
Dependabot security update PR
  → Dependabot Auto Merge が対象PRか確認
  → major update でなければ auto-merge を予約
  → PR Check / quality-check が成功
  → squash merge
  → branch削除
```

通常のAIエージェントPRとは別に、`.github/workflows/dependabot-auto-merge.yml` でDependabot専用の自動マージを扱います。

このworkflowは `pull_request_target` で動きますが、PRブランチのコードをcheckoutせず、repository codeも実行しません。権限のあるworkflowでは、Dependabot metadataの確認と `gh pr merge --auto --delete-branch` の予約だけを行います。実際の品質確認は、別workflowの `PR Check / quality-check` が行います。

major updateは自動マージしません。Dependabot metadataの `update-type` が `version-update:semver-major` の場合は、PRへコメントを残し、人間レビュー待ちにします。

### 知見の保存先

依存関係更新で得たQA知見は、次に保存します。

```text
qa-knowledge/dependencies/security-update-policy.md
research/reports/dependency-security-updates.md
```

Dependabot PRでPlaywright、Vite、React、TypeScript、ESLintなどの挙動差分が見つかった場合は、該当する `qa-knowledge/` にも反映してください。

## v15: Agent PRラベルによるPR分離

エージェントが対応するPRは、`agent:owned` ラベルで明示的に管理します。

- エージェントが同時に対応するPRは `agent:owned` が付いたopen PRのうち最大1本です。
- Dependabot PR、人間が作成したPR、その他の検証PRは `agent:owned` が付かない限り、エージェントの `open_pr_limit` には含めません。
- エージェントPRには、作成時に `agent:owned` と `agent:active` を付けます。
- 品質ゲートとAIレビューを通過したPRには、`agent:ready-to-merge` を付けます。
- 人間レビューが必要な場合は、`agent:blocked` を付けます。

このため、Dependabot security update PRが開いていても、エージェントは自身が管理しているPRがなければ次の研究サイクルを開始できます。
ただし、mainへのマージはすべて `PR Check / quality-check` を必須にしてください。

## v16: モデルIDの環境変数管理

v16では、モデル名をコードや `opencode.json` から削除し、GitHub Repository Variablesで管理する方針に変更しました。

- `AGENT_MODEL_DEFAULT` を必須の既定モデルとして扱います。
- Agent別に `AGENT_MODEL_RESEARCH_DIRECTOR` などを設定すると、そのAgentだけ別モデルで動かせます。
- Agent別モデルが未設定の場合は `AGENT_MODEL_DEFAULT` を使います。
- `AGENT_MODEL_DEFAULT` も未設定のままOpenCodeを実行しようとした場合は、コード上の既定モデルへフォールバックせず、安全に停止します。
- `.agent/model-scoreboard.md` もモデルIDではなく、環境変数単位で評価を記録する形式にしました。

## v17: OpenCode CLIの事前確認

v17では、`Agent Tick` workflowにOpenCode CLIの事前確認ステップを追加しています。

- `Run one agent phase` の前に `Verify OpenCode CLI` を実行します。
- `OPENCODE_CLI` Repository Variableが設定されていれば、そのコマンドで `--version` を確認します。
- `OPENCODE_CLI` が未設定の場合は、`npx -y opencode-ai@latest --version` を確認します。
- OpenCode CLIを取得できない場合は、AI作業に入る前にworkflowが失敗します。

これにより、OpenCode CLIの取得失敗や実行コマンドの変更を、`agent-tick` の途中ではなく早い段階で検出できます。

## v18: Agent Tick PR visibility and adaptive quality gates

v18 improves Agent Tick resilience and visibility without weakening main branch quality.

### Intermediate PR creation

Agent Tick now creates or updates an agent PR once a reviewable phase starts, such as planning, browser exploration, specification writing, test design, or Playwright implementation. The initial task-selection phase (`SELECT_RESEARCH_TASK`) does not create a PR unless a blocker is recorded.

If the agent times out or becomes blocked, the blocker is committed under `.agent/blockers/` and the agent PR is created or updated so that a human can review the failure.

PR body now includes the current phase, cycle ID, blocker status, consecutive failures, the latest summary, and a list of blocker files.

### Adaptive quality gates

Agent Tick uses a lightweight check (`npm run format:check`) for documentation, state, and blocker-only updates (`.agent/**`, `docs/**`, `research/**`, `qa-knowledge/**`, `*.md`).

Full quality checks (`npm run quality:check`) are required when application code, tests, scripts, package files, Playwright config, TypeScript config, or workflow files change.

The PR Check workflow remains the final full quality gate before merge. The adaptive gate is only for the agent-tick commit step. It does not weaken main branch quality.
