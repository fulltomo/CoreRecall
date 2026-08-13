# Core Recall

端末内で完結する Anki 風の間隔反復フラッシュカード PWA。ビルド不要・依存ゼロ。
デザインは `stitch_local_anki_ios_pwa/core_recall/DESIGN.md` のトークンとモックに準拠。

## 起動

```bash
python3 -m http.server 8080   # 任意の静的サーバでよい
# → http://localhost:8080  （iOS Safari では「ホーム画面に追加」でスタンドアロン起動）
```

Service Worker のキャッシュを使うため、ファイルを更新したら `sw.js` の `CACHE` を上げる。

## テスト

```bash
node test.cjs   # FSRS スケジューラと CSV パーサの自己チェック
```

## 構成

| ファイル | 役割 |
|---|---|
| `index.html` | 全画面のマークアップ + SVG アイコンスプライト |
| `app.css` | DESIGN.md のトークン（ライト / ダーク） |
| `core.js` | 純粋ロジック：FSRS-5、間隔表記、CSV/TSV パース |
| `app.js` | 状態・描画・イベント |
| `sw.js` | オフライン用キャッシュ |

## 仕様メモ

- **スケジューラ**: FSRS-5（既定重み）。「もう一度」は 1 分後に再出題、それ以外は目標保持率（既定 90%）から間隔を算出。
- **保存**: `localStorage` の単一 JSON。端末外へは一切送信しない。
- **バックアップ**: 設定から JSON 出力 / 復元。7 日出力がないとホームに警告バナー。
- **インポート**: CSV / TSV（1 列目=表, 2 列目=裏）。ファイル名がデッキ名になる。ヘッダ行は自動でスキップ。
- **キーボード**: `Space`/`Enter` めくる・普通、`1`〜`4` 評価、`Esc` 終了。
