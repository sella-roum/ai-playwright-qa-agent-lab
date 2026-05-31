# Security policy

## Supported scope

This repository is an experimental public repository for researching AI-assisted QA workflows with Playwright.

Do not store customer information, company confidential information, personal data, API tokens, or production credentials in this repository.

## Dependency vulnerability handling

Dependency vulnerabilities are handled through GitHub Dependabot alerts and Dependabot security update pull requests.

Security update pull requests must pass the full quality gate before being merged:

```bash
npm run quality:check
```

The full quality gate includes formatting, linting, type checking, unit tests, repository validation, build, and Playwright E2E tests.

## Reporting vulnerabilities

If you find a vulnerability in this experimental repository, please create a GitHub issue if the details can be public. If the details are sensitive, do not include secrets or private data in the issue body.
