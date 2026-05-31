# Agent Rules

- 公開リポジトリに置けない情報を扱わない。
- mainへ直接pushしない。
- 画面探索前にPlaywrightコードを書かない。
- 観測できた事実と推測を分ける。
- XPathと固定waitは原則使わない。
- Playwright Test失敗時は、ログだけでなくtrace、screenshot、reportを確認する。
- 同じ分類の失敗が2回以上発生した場合、skill-backlogに改善案を書く。
- 連続失敗が上限に達した場合、自律修復を止めて人間レビュー待ちにする。
