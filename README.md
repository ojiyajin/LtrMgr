# LtrMgr — Literature Manager

学術文献・特許・テキストブックを管理するWebアプリケーション。  
PDF / Markdown ファイルのアップロード、書誌情報管理、タブレットでの手書き注釈、タグ・コレクション分類などの機能を持つ。

> **開発中 (Work in Progress)**  
> 動作確認は macOS + iPad (Apple Pencil) + Safari / Chrome で行っています。  
> 未実装・未修正の機能については後述の「既知の制限」を参照してください。

---

## 機能一覧

### 文献管理
- PDF / Markdown ファイルのアップロード（1文献に複数ファイル添付可）
- DOI 入力による書誌情報の自動取得（CrossRef API）
- 文献タイプ分類：学術文献 / 特許 / 学会要旨 / 学習用テキスト
- 読書状態管理：未読 / 読書中 / 読了
- タグ・コレクションによる分類

### 一覧・検索
- フリーワード検索・タイプ/ステータス/タグ/コレクションでのフィルタ
- 長押し（タッチ）またはロングクリックで複数選択モードに切り替え
- 選択した文献への一括操作：コレクション追加、タグトグル、引用コピー、ダウンロード、エクスポート、ファイルリネーム

### 引用・エクスポート
- BibTeX / RIS 形式でエクスポート
- BibTeX / RIS ファイルからの一括インポート
- 引用文字列のコピー（APA・MLA ほか数スタイル）

### PDF ビューア（タブレット対応）
- ページ単位表示、ピンチ / Ctrl+Wheel ズーム、パン（スクロール）
- Apple Pencil によるペン・消しゴム描画（線幅・色選択対応）
- ストロークは localStorage に自動保存・復元
- タッチ不感領域（Dead Zone）設定：タブレットを手で持った際の誤タッチを防ぐ

### Markdown ビューア
- KaTeX による数式レンダリング対応
- インライン編集（textarea）+ サーバーへの即時保存
- フォントサイズ 4 段階切替
- タッチ不感領域設定

### メモ
- 文献ごとのメモ追加・編集・削除（PDF/Markdown ビューアのサイドパネルからも操作可能）

### PDF ファイルリネーム
- テンプレート（例: `{first_author}_{year}_{title}.pdf`）によるファイル名自動生成
- ファイル詳細から手動リネーム（手動リネーム済みファイルは一括リネームの対象外）

---

## 既知の制限（開発中）

| 項目 | 状況 |
|---|---|
| 引用スタイルの種類が少ない | 現在 APA・MLA など数スタイルのみ対応。IEEE・Chicago・Vancouver 等は未実装 |
| DOI からの PDF 自動ダウンロード | Unpaywall / OpenAccess PDF のダウンロードが正常に動作しないケースが多い。現在調査中 |
| Apple Pencil 不感領域の挙動 | 一部の iOS バージョンで描画開始が遅延・失敗することが稀にある（継続修正中） |

---

## 技術スタック

| 層 | 技術 |
|---|---|
| バックエンド | Python 3.11+, FastAPI, SQLite (aiosqlite), SQLAlchemy 2.0 |
| フロントエンド | React 18, TypeScript, Vite, React Query, Zustand |
| PDF 解析 | PyMuPDF |
| 数式レンダリング | KaTeX (auto-render) |
| 外部アクセス | Cloudflare Tunnel (`cloudflared`) |

---

## セットアップ

### 必要なもの
- Python 3.11 以上
- Node.js 18 以上
- `cloudflared`（外部アクセスが必要な場合）

### 起動方法

```bash
# フロントエンドをビルドして起動（初回または更新時）
./start.sh --build

# ビルド済みの場合はそのまま起動
./start.sh
```

起動後、Cloudflare Tunnel の URL が表示されます。ブラウザでアクセスしてください。

ローカルのみで使用する場合は `http://localhost:8000` にアクセスしてください。

### 開発時（フロントエンド Hot Reload）

```bash
# ターミナル 1: バックエンド
cd backend
venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# ターミナル 2: フロントエンド
cd frontend
npm install
npm run dev
```

フロントエンドは `http://localhost:5173` で起動します（バックエンドへのプロキシ設定済み）。

### DEV MODE（認証スキップ）

`frontend/src/App.tsx` の `DEV_MODE = true` に設定するとログインなしで全機能にアクセスできます。  
バックエンドも `backend/app/config.py` の `dev_mode` を合わせて設定してください。

---

## ディレクトリ構成

```
LtrMgr/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI エントリポイント
│   │   ├── models.py        # ORM モデル
│   │   ├── schemas.py       # Pydantic スキーマ
│   │   ├── routers/         # API ルーター
│   │   └── services/        # PDF パーサー・DOI 取得・Bib パーサー
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/             # Axios API クライアント
│   │   ├── components/      # 共通コンポーネント
│   │   ├── pages/           # ページコンポーネント
│   │   ├── store/           # Zustand ストア
│   │   └── styles/          # グローバル CSS
│   └── package.json
├── start.sh                 # 起動スクリプト
└── ARCHITECTURE.md          # 詳細アーキテクチャドキュメント
```

詳細は [ARCHITECTURE.md](ARCHITECTURE.md) を参照してください。

---

## ライセンス

MIT
