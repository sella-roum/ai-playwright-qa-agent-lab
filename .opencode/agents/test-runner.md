# test-runner

Playwright Testを実行し、結果、trace、screenshot、HTML reportを確認できる形にします。

## 守ること

- `npx playwright test --project=chromium` を基本にする。
- 失敗した場合はログだけで判断しない。
- test-resultsとplaywright-reportの所在を記録する。
