# CI Setup Design Specification

## Overview

Core Recall (`anki-pwa`) リポジトリに対し、コードの品質維持と回帰防止を自動化するための CI (Continuous Integration) 環境を GitHub Actions で構築します。

## Target Requirements

1. **GitHub Actions ワークフロー**: `.github/workflows/ci.yml`
2. **トリガー条件**:
   - `main` ブランチへの `push`
   - `main` ブランチ宛ての `pull_request`
3. **環境マトリックス**:
   - Node.js LTS バージョン: `18.x`, `20.x`, `22.x`
   - OS: `ubuntu-latest`
4. **テスト & リントの実行**:
   - 既存ユニットテストの実行 (`node test.cjs`)
   - JS / CSS / HTML の構文・スタイルリント実行 (`ESLint`, `Stylelint`, `HTMLHint`)

## File Changes & Components

### 1. `package.json` & `package-lock.json`
- `devDependencies` として以下を導入:
  - `eslint`: JavaScript リント
  - `globals`: ESLint 用グローバル定義
  - `stylelint`, `stylelint-config-standard`: CSS リント
  - `htmlhint`: HTML リント
- `scripts`:
  - `"test": "node test.cjs && npm run lint"`
  - `"test:unit": "node test.cjs"`
  - `"lint": "npm run lint:js && npm run lint:css && npm run lint:html"`
  - `"lint:js": "eslint ."`
  - `"lint:css": "stylelint app.css"`
  - `"lint:html": "htmlhint index.html"`

### 2. リント設定ファイル
- `eslint.config.mjs` (Flat Config):
  - ES2022+ 対応
  - ブラウザ環境 (`window`, `document`, `localStorage`, `navigator`, `ServiceWorker` など) および Node.js 環境 (`test.cjs`) のグローバル変数を許容
  - モジュール非使用のレガシースクリプト構造 (`core.js`, `app.js`) に配慮
- `.stylelintrc.json`:
  - `stylelint-config-standard` をベースに `color-mix()` や CSS カスタムプロパティをサポート
- `.htmlhintrc`:
  - HTML5 基準のタグ・属性チェックルール

### 3. `.github/workflows/ci.yml`
- GitHub Actions 定義:
  ```yaml
  name: CI

  on:
    push:
      branches: [ main ]
    pull_request:
      branches: [ main ]

  jobs:
    test:
      runs-on: ubuntu-latest
      strategy:
        matrix:
          node-version: [18.x, 20.x, 22.x]
      steps:
        - uses: actions/checkout@v4
        - name: Use Node.js ${{ matrix.node-version }}
          uses: actions/setup-node@v4
          with:
            node-version: ${{ matrix.node-version }}
            cache: 'npm'
        - run: npm ci
        - run: npm test
  ```

## Verification Plan

1. ローカルで `npm install` 実行後に `npm test` を実行し、全テストおよびリントが通過することを確認
2. リントルールが期待通り機能し、問題のあるコードを正しく検出することを確認
3. 設定ファイルをコミットし、CI ワークフロー定義が妥当であることを確認
