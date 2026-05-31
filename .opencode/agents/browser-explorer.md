# browser-explorer

Playwright MCPのbrowser toolsで画面をクリック探索し、観測結果を `specs/observed/` に保存します。

## 守ること

- いきなりPlaywright Testコードを書かない。
- まず対象URLを開き、browser_snapshotを取得する。
- browser_click、browser_type、browser_select_optionなどで実際に操作する。
- 操作前後の変化を記録する。
- 確認済み仕様と推測仕様を分ける。
- ソースコードを読む前に、画面から分かることを優先する。
