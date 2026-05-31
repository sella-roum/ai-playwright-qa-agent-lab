# Dependency security update policy

## 目的

このリポジトリでは、通常の最新版追従はAIエージェントの研究サイクルで扱い、脆弱性が公開された依存関係の更新はDependabotで検知・PR化します。

## 基本方針

- Dependabotの通常version update PRは作成しません。
- Dependabot security update PRのみを作成対象にします。
- Dependabot PRも、mainへ入る前に必ずfull品質ゲートを通します。
- full品質ゲートは、format / lint / typecheck / unit test / repo validation / build / Playwright E2Eを含みます。
- security update PRで得た知見は、必要に応じてこのファイル、`qa-knowledge/playwright/`、`research/reports/` に追記します。

## PR運用

Dependabotが作成したPRは、通常のagent PRとは別系統の依存関係更新PRとして扱います。

優先順位は次の通りです。

1. Critical / High のDependabot security update PR
2. AI agentの既存PR
3. Medium / Low のDependabot security update PR
4. 通常の研究サイクル

## 確認観点

Dependabot PRでは、最低限次を確認します。

- `npm ci` が通ること
- `npm run quality:check` が通ること
- Playwright E2Eが通ること
- 研究用アプリの主要導線が壊れていないこと
- Playwright / Vite / React / TypeScript / ESLintなど、開発基盤の挙動が変わっていないこと
- 破壊的変更がある場合は、`research/reports/` に影響を書き残すこと

## 自動マージについて

Dependabot security update PRの自動マージは、full品質ゲートの安定を確認してから段階的に有効化します。

初期運用では、人間がPR内容とCI結果を確認してからマージします。

## Dependabot security update auto-merge policy

Dependabot security update PR is handled by `.github/workflows/dependabot-auto-merge.yml`.

The workflow may request GitHub auto-merge only when all of the following are true:

- The PR author is `dependabot[bot]`.
- The PR is not a draft.
- The PR has the `security` label.
- Dependabot metadata does not classify the update as `version-update:semver-major`.
- The protected branch requirements, especially `PR Check / quality-check`, pass.

The privileged workflow must not checkout or execute the PR branch. It only reads Dependabot metadata and requests auto-merge. The full quality gate is executed by the normal PR Check workflow.

Major security updates require human review because they may include breaking changes in app behavior, Playwright behavior, lint/typecheck behavior, or test execution semantics.

## Agent PRとの分離

Dependabot PRは `security` / `dependencies` / `dependabot` ラベルで管理し、AIエージェントが作成するPRとは別扱いにします。
AIエージェントの同時PR制限は `agent:owned` ラベル付きPRだけを対象にします。
そのため、Dependabot security update PRが開いていても、`agent:owned` PRがなければAIエージェントの研究サイクルは開始できます。
