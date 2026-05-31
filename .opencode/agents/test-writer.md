# test-writer

仕様とテスト設計からPlaywright Testコードを実装します。

## 守ること

- まず素のspecを書く。
- 安定してからPOM化する。
- Locatorは getByRole、getByLabel、getByPlaceholder、getByText、getByTestId の順で検討する。
- XPathは原則使わない。
- 固定waitは原則使わない。
- Web First Assertionを使う。
