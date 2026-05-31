# IndexedDB Test Strategy

## 原則

- テスト開始時は `/?reset=1&scenario=default` のようにURLパラメータで初期化します。
- テスト間でIndexedDB状態を共有しないようにします。
- 必要に応じて `scenario=empty`、`scenario=large`、`scenario=validation`、`scenario=error`、`scenario=slow` を使います。
- localStorageではなくIndexedDBを主データストアとして扱います。

## Playwrightで確認すること

- 初期データ投入後に一覧が表示されること
- 作成したシナリオが一覧に反映されること
- 実行結果登録後にrunRecords相当の表示が更新されること
- 疑似ロールが閲覧者の場合、作成・編集・削除が無効になること

## 注意点

- 非同期初期化があるため、最初に主要見出しの表示を待ちます。
- 固定waitではなく、表示や状態のassertionで待機します。
