# Dependency security update reports

Dependabot security update PRで発生した対応、影響、テスト結果、学びを記録します。

## 記録テンプレート

```md
## YYYY-MM-DD Dependabot security update

- PR:
- 対象パッケージ:
- 脆弱性:
- 更新前:
- 更新後:
- 影響範囲:
- 実行した確認:
- Playwrightへの影響:
- QA知見:
- 次回以降の注意:
```

## v14 auto-merge experiment

v14 adds a dedicated Dependabot auto-merge workflow for security updates. The AI agent PR cycle remains separate.

Expected behavior:

1. Dependabot opens a security update PR.
2. The dedicated workflow checks Dependabot metadata.
3. If the update is not semver-major, the workflow requests GitHub auto-merge.
4. Branch protection keeps the PR unmerged until `PR Check / quality-check` succeeds.
5. If the update is semver-major, the workflow comments on the PR and leaves it for human review.

Observation points for future research:

- Whether Dependabot metadata is populated as expected for security updates.
- Whether semver-major updates are correctly excluded from auto-merge.
- Whether the full quality gate catches dependency-related behavior changes.
- Whether dependency updates create new Playwright or IndexedDB test stability issues.
