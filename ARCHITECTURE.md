# LtrMgr — アーキテクチャ概要

## プロジェクト概要

LtrMgr（Literature Manager）は、学術文献・特許・テキストブックなどを管理するWebアプリケーション。  
PDF／Markdownファイルのアップロード、書誌情報の管理、手書き注釈、メモ、タグ・コレクション分類などの機能を持つ。

- **バックエンド**: FastAPI + SQLite（aiosqlite）、ポート8000
- **フロントエンド**: React + Vite + TypeScript、ビルド後はバックエンドがSPAとして配信
- **外部アクセス**: code-serverのリバースプロキシ経由（`/proxy/8000/`）でトンネル提供

---

## バックエンド構造

```
backend/app/
├── main.py          ← FastAPIアプリ本体。ルーター登録・CORS・SPA配信
├── config.py        ← 環境設定（アップロードディレクトリ、DEV_MODEなど）
├── database.py      ← SQLAlchemy非同期セッション。起動時にinit_db()でテーブル作成
├── models.py        ← ORM定義（User, Document, Citation, PDFFile, Tag, Note, Collection, AppSetting）
├── schemas.py       ← Pydantic I/Oスキーマ
├── auth.py          ← JWT認証。DEV_MODEではget_current_userがダミーユーザーを返す
└── routers/
    ├── auth.py      ← /api/auth/login, /register
    ├── documents.py ← /api/documents CRUD、重複チェック、DOIルックアップ
    ├── files.py     ← /api/documents/{id}/files 以下（アップロード・閲覧・ダウンロード・削除・DOI自動取得・MD編集）
    ├── notes.py     ← /api/documents/{id}/notes CRUD
    ├── tags.py      ← /api/tags CRUD
    ├── collections.py ← /api/collections、コレクションへの文献追加・削除
    ├── export.py    ← /api/export（BibTeX・RIS形式）
    ├── import_.py   ← /api/import（BibTeX・RISファイルの一括登録）
    └── settings.py  ← /api/settings（PDF保存先・リネームテンプレート）
└── services/
    ├── pdf_parser.py  ← PyMuPDFによるテキスト抽出・DOI検出
    ├── doi_lookup.py  ← CrossRef APIによるDOI検索・書誌情報取得・OA-PDF URL取得
    └── bib_parser.py  ← BibTeX・RISファイルのパーサー
```

### ファイルエンドポイント（files.py）の詳細

ファイルは `PDFFile` レコードごとに独自の `file_id` を持つ。1つの文献に複数のファイルを添付可能。

| エンドポイント | 役割 |
|---|---|
| `POST /api/documents/{id}/files` | PDF または .md ファイルをアップロード。PDF の場合はDOI自動検出・書誌情報取得を試みる |
| `POST /api/documents/{id}/files/fetch` | DOIからOA-PDFを自動ダウンロード |
| `GET  /api/documents/{id}/files/{file_id}/view` | ファイル本体をインラインで返す（ビューア用） |
| `GET  /api/documents/{id}/files/{file_id}/download` | ファイル本体をダウンロード添付として返す |
| `GET  /api/documents/{id}/files/{file_id}/content` | テキスト内容を返す（Markdownはファイル本文、PDFはテキスト抽出結果） |
| `PATCH /api/documents/{id}/files/{file_id}/content` | Markdownファイルの内容を上書き保存（ブラウザ内編集用） |
| `DELETE /api/documents/{id}/files/{file_id}` | ファイルレコードおよびディスク上のファイルを削除 |

### PDFリネームテンプレート

アップロード時、`AppSetting` に保存された `pdf_rename_template`（例: `{first_author}_{year}_{title}.pdf`）を使ってファイル名を自動整形する。`pdf_save_dir` が設定されていればそのディレクトリに保存。

---

## フロントエンド構造

```
frontend/src/
├── main.tsx          ← Reactエントリポイント
├── App.tsx           ← HashRouter ルーティング定義
├── api/
│   ├── client.ts     ← axiosインスタンス。baseURLをページパスから動的解決（プロキシ対応）
│   ├── auth.ts       ← 認証API
│   ├── documents.ts  ← 文献CRUD・ファイル操作 API
│   ├── notes.ts      ← メモAPI
│   ├── tags.ts       ← タグAPI
│   ├── collections.ts ← コレクションAPI
│   ├── export.ts     ← エクスポートAPI
│   ├── import_.ts    ← インポートAPI
│   └── settings.ts   ← 設定API
├── store/
│   ├── auth.ts           ← Zustandによる認証状態管理
│   ├── conferenceMode.ts ← コンファレンスモード（表示切替）
│   └── deadZone.ts       ← タッチ不感領域設定の永続化（localStorage）
├── types/
│   ├── index.ts              ← 全共通型定義（DocumentSummary, DocumentDetail, Citation等）
│   └── katex-auto-render.d.ts ← katex/dist/contrib/auto-render の型宣言
├── utils/
│   └── mathPreprocess.ts ← delimiterなしの生LaTeX命令に $...$ / $$...$$ を補完する前処理
├── components/
│   ├── Layout.tsx             ← ナビゲーション付きページラッパー
│   ├── DocumentCard.tsx       ← 文献一覧の1カード。ReadStatus切替ボタン・要旨モーダル・PDF/MDリンク
│   ├── DocumentDetailContent.tsx ← 文献詳細UI本体（DocumentDetailPageとDocumentDetailModalで共用）
│   ├── DocumentDetailModal.tsx   ← 一覧ページからモーダルで文献詳細を表示するラッパー
│   ├── MarkdownViewer.tsx     ← .mdファイルをインラインで表示。KaTeX auto-renderで数式レンダリング
│   ├── PdfMarkupViewer.tsx    ← PDFインラインプレビュー（詳細ページ埋め込み用）
│   ├── NoteEditor.tsx         ← メモの追加・編集・削除UI
│   ├── NotesPanel.tsx         ← NoteEditorを包むスライドパネル（PdfMarkupPage・MarkdownViewPageで共用）
│   ├── DeadZonePanel.tsx      ← タッチ不感領域（画面端）の設定パネル。タブレット保持時の誤タッチ防止
│   ├── FilterPanel.tsx        ← 文献一覧のフィルタパネル
│   ├── TagBadge.tsx           ← タグ表示バッジ
│   ├── TagsModal.tsx          ← タグ管理モーダル（一覧ページから開く）
│   ├── SettingsModal.tsx      ← 設定モーダル（インポート・エクスポート・PDF保存先等）
│   └── CitationFormatter.tsx  ← 引用形式フォーマッタ（APA・MLA等）
└── pages/
    ├── DocumentListPage.tsx   ← 文献一覧。フィルタ・ページネーション・一括操作・モーダル詳細
    ├── DocumentDetailPage.tsx ← 文献詳細ページ（DocumentDetailContentを使用）
    ├── DocumentFormPage.tsx   ← 文献新規登録・編集フォーム
    ├── PdfMarkupPage.tsx      ← 別タブで開くPDFビューア（ペン・消しゴム・ズーム・パン・DeadZone）
    ├── MarkdownViewPage.tsx   ← 別タブで開くMarkdownビューア（数式対応・編集・フォントサイズ・DeadZone）
    ├── TagsPage.tsx           ← タグ管理
    ├── SettingsPage.tsx       ← アプリ設定
    ├── LoginPage.tsx          ← ログイン
    └── RegisterPage.tsx       ← ユーザー登録
```

---

## ルーティング（App.tsx）

| パス | コンポーネント | 概要 |
|---|---|---|
| `/login` | LoginPage | 認証不要 |
| `/register` | RegisterPage | 認証不要 |
| `/documents` | DocumentListPage | 文献一覧 |
| `/documents/new` | DocumentFormPage | 新規登録 |
| `/documents/:id` | DocumentDetailPage | 文献詳細 |
| `/documents/:id/edit` | DocumentFormPage | 編集 |
| `/documents/:id/markup/:fileId` | PdfMarkupPage | PDF注釈ビューア（別タブ） |
| `/documents/:id/markdown/:fileId` | MarkdownViewPage | Markdownビューア（別タブ） |
| `/tags` | TagsPage | タグ管理 |
| `/settings` | SettingsPage | 設定 |

ルーターはHashRouter（`#/...`）を使用。code-serverプロキシ経由のSPA配信と相性が良い。  
PDFビューアとMarkdownビューアのルートは `:fileId` を含む（1文献に複数ファイルを持てるため）。

---

## コンポーネント依存関係

```
DocumentListPage
  ├── DocumentCard（各文献）
  │     ├── TagBadge
  │     └── ReadStatus 切替ボタン
  ├── DocumentDetailModal（クリック時のモーダル詳細）
  │     └── DocumentDetailContent
  ├── TagsModal
  └── SettingsModal

DocumentDetailPage
  └── DocumentDetailContent
        ├── TagBadge
        ├── CitationFormatter
        ├── NoteEditor
        ├── PdfMarkupViewer（インラインPDFプレビュー）
        └── MarkdownViewer（インラインMarkdownプレビュー）

PdfMarkupPage（別タブ）
  ├── NotesPanel
  │     └── NoteEditor
  └── DeadZonePanel

MarkdownViewPage（別タブ）
  ├── MarkdownViewer
  ├── NotesPanel
  │     └── NoteEditor
  └── DeadZonePanel
```

**DocumentDetailContent** は `DocumentDetailPage`（フルページ）と `DocumentDetailModal`（一覧上のモーダル）の両方で使われる共通コンポーネント。「新規Markdownを作成」ボタンで空の `.md` ファイルを即時作成し、ファイル行の下にインラインエディタ（`textarea`）を展開する。保存後は `PATCH /content` で書き込み、別タブで開くリンクには `?edit=1` を付与して自動編集モードで起動できる。

**NotesPanel** は `PdfMarkupPage` と `MarkdownViewPage` の両方で使われる共通コンポーネント。`docId` を受け取り、内部でノートAPIを管理する。

**MarkdownViewer** は `DocumentDetailContent`（インライン）と `MarkdownViewPage`（別タブ）の両方で使われる。数式レンダリングは `remark-math`/`rehype-katex` を使わず、`renderMathInElement`（KaTeX auto-render）をReactMarkdown描画後のDOMに直接適用する方式を採用（remark-mathが`$...$`を消費してしまう問題を回避するため）。

**DeadZonePanel** は `PdfMarkupPage` と `MarkdownViewPage` で使われる。タブレットを手で持つ際に画面端を指が触れても描画・スクロール操作が発生しないよう、不感領域（px幅）を左右上下それぞれ設定できる。設定は `localStorage` に保存。

---

## PDFビューア（PdfMarkupPage）の主要実装

### ズーム
- `style.zoom` をDOMに直接書き込む（`transform: scale` と異なりレイアウトに影響し、スクロール領域が自然に拡大する）
- Ctrl+Wheel: ネイティブイベントリスナー → `applyVisualScale()` でDOM直接更新 → 300ms デバウンス後に `setScale()` でReact状態同期
- ピンチ: TouchEventで2点間距離を計測 → 同様にDOM直接更新 → 指を離した時に状態同期
- ツールバー ＋/－ボタン: `setScale()` → `useLayoutEffect` → `applyVisualScale()`

### パン（スクロール）
- トラックパッド: `overflow: auto` によるブラウザ標準スクロール
- タッチ: PointerEventのonDown時に `{ x, y, scrollLeft, scrollTop }` を記録し、onMoveで `scrollLeft`/`scrollTop` を直接書き込む（横・縦の2D追従）
- スクロールコンテナに `touchAction: 'none'` を設定し、不感領域のタッチを含む全タッチをJSで管理（OS側のジェスチャー処理を抑制し、Apple Pencilイベントのブロックを防ぐ）
- DeadZoneが設定されている場合、不感領域内のPointerEventは描画・パン操作ともに無視する

### 描画
- PointerEvent APIを使用（Apple Pencil対応）
- ネイティブリスナー（React合成イベントをバイパス）でキャンバス直接操作（120Hz+）
- `getCoalescedEvents()` で高速Pencilストロークの中間点を補完
- `onDown` 時にキャンバスの `getBoundingClientRect()` を `canvasRectRef` にキャッシュし、`onMove` では再計算せずに流用（120Hzでレイアウトフラッシュを避けるため）
- 座標変換に `offsetX/Y` でなく `(clientX - rect.left) / rect.width * canvas.width / dpr` の分数式を使用（iOS Pencilがデバイスピクセルを返す問題を回避）
- コアレスドイベント全点を1つのパスにまとめてから `stroke()` を1回呼ぶ（per-segment で flush するとGPUコストが120Hz分乗算されるため）
- ストロークは `localStorage`（`markup_${fileId}`）に永続化
- 保存は `saveSignal` state 経由（ロード時の無駄な書き込みを防止）

### 不感領域（DeadZone）とApple Pencil共存
- 不感領域内でタッチが開始されると `deadZonePointerIds` に記録し、`setPointerCapture()` + `e.preventDefault()` でOSに「処理済み」を通知
- スクロールコンテナに `touchAction: 'none'` を付与することで、不感領域タッチをOSのネイティブスクロールセッションから切り離す（これがないとOS側がジェスチャー状態に入り、Apple Pencilのイベントが抑制される）
- 不感領域ビジュアルオーバーレイは `pointer-events: none`（視覚表示のみ）で、イベント処理はキャンバスの `onDown` ハンドラが行う

### ツール切り替えとref同期
- `tool`, `color`, `lineWidth` はReact state として管理（UI再描画用）
- ネイティブイベントハンドラから参照するため、`useEffect` で `toolRef`, `colorRef`, `lineWidthRef` に同期

---

## Markdownビューア（MarkdownViewPage）の主要実装

### Markdown編集
- ツールバーの編集ボタンでMarkdownテキストをそのまま編集できる（`textarea`）
- 保存時に `PATCH /api/documents/{id}/files/{file_id}/content` を呼び出してサーバー側のファイルを更新
- `?edit=1` クエリパラメータを付けて開くと自動で編集モードに入る（文献詳細の「新規Markdown作成」からインラインエディタ経由で遷移する際に使用）
- 空のMarkdownファイルも正常に編集可能（バックエンドは `text_content is None` のみ404、空文字列は正常返却）

### フォントサイズ切替
- 小・中・大・特大の4段階。`style.zoom` を `<main>` 要素に適用
- スクロール位置を保持するため、変更前の読み位置（行テキスト+オフセット）をアンカーとして記録し、変更後に復元

### DeadZone統合
- `DeadZonePanel` をツールバー上のボタンから開く
- `isInDeadZone()` でタッチ開始位置を判定し、不感領域内なら `touchstart` / `pointerdown` をキャンセル
- `touchstart` リスナーは `passive: false` で登録し、不感領域の `changedTouches` に対して `e.preventDefault()` を呼ぶことでiOSの長押しテキスト選択UIを抑制
- 不感領域タッチが活性化している間は `el.style.userSelect = 'none'` を動的に設定し、タッチ解除時に `'text'` に戻す

---

## 数式レンダリング（MarkdownViewer / MarkdownViewPage）

`remark-math` + `rehype-katex` のパイプラインを使用しない。理由：`remark-math` が `$...$` をASTノードに変換するが、`rehype-katex` のレンダリングが失敗するとテキストがDOMから消失し、auto-renderが検出できなくなるため。

代わりに：
1. `preprocessMath()` （`utils/mathPreprocess.ts`）でdelimiterのない生LaTeXコマンドに `$...$` / `$$...$$` を自動補完
2. `<ReactMarkdown>` をプラグインなしで呼び出し → `$...$` がプレーンテキストとしてDOMに出力される
3. `useEffect([content])` で `renderMathInElement(containerRef.current, ...)` を呼び出し、DOMを直接処理

`preprocessMath()` の挙動：CJKを含む行はインライン数式として各コマンドに `$...$` を付加、CJKのない行は行全体を `$$...$$` でブロック数式として扱う。

---

## API通信（client.ts）

```typescript
const apiBase = (() => {
  const path = window.location.pathname.replace(/\/+$/, '')
  return `${window.location.origin}${path}/api`
})()
```

ページのパスを基準にAPIベースURLを解決する。これにより、`https://example.com/proxy/8000/` のようなサブパス配信下でも正しくAPIにアクセスできる。

配列クエリパラメータ（`tag_ids` など）は `URLSearchParams` で同一キーを複数回 `append` する形式でシリアライズ（FastAPIのデフォルト形式に対応）。

---

## 認証

- JWTトークンをlocalStorageに保存
- `DEV_MODE = true`（`App.tsx`）に設定すると全ルートがログイン不要でアクセス可能
- バックエンドの `config.py` にも `dev_mode` フラグがあり、`get_current_user` がダミーユーザーを返す
- 401レスポンス時はaxiosインターセプターがトークンを削除して `/login` へリダイレクト

---

## データモデル（models.py）

| モデル | テーブル | 概要 |
|---|---|---|
| `User` | `users` | メール・パスワード（bcryptハッシュ）。文献・タグ・コレクションのオーナー |
| `Document` | `documents` | 文献本体。タイプ（academic/patent/abstract/textbook）・読書状態（unread/reading/read） |
| `Citation` | `citations` | 書誌情報（著者・誌名・DOI・特許番号など）。Documentと1対1 |
| `PDFFile` | `pdf_files` | アップロードされたPDF/MDファイル。Documentと多対1（1文献に複数ファイル可） |
| `Note` | `notes` | 文献ごとのメモ。Documentと多対1 |
| `Tag` | `tags` | タグ（名前・色）。DocumentとN対M（中間テーブル `document_tag`） |
| `Collection` | `collections` | コレクション（フォルダ相当）。DocumentとN対M（中間テーブル `collection_document`） |
| `AppSetting` | `app_settings` | アプリ設定のキーバリューストア（PDF保存先・リネームテンプレートなど） |

---

## 主要な設計上の決定事項

| 決定 | 理由 |
|---|---|
| HashRouter採用 | code-serverプロキシ経由でのSPA配信時、サーバー側のルート解決が不要 |
| CSS `zoom` でのスケール適用 | `transform: scale` はレイアウトに影響しないためスクロール領域が広がらない |
| PointerEventのネイティブリスナー | React合成イベントはpassiveで120Hzに追従できない |
| `saveSignal` でlocalStorage書き込みを制御 | ロード時に `setStrokeCount` が `saveSignal` を増やさないよう分離 |
| `NotesPanel` コンポーネント化 | `PdfMarkupPage` と `MarkdownViewPage` で全く同一のパネルを使用するため |
| `DocumentDetailContent` コンポーネント化 | フルページ（DocumentDetailPage）とモーダル（DocumentDetailModal）で同一UIを共用するため |
| `MarkdownViewer` を `MarkdownViewPage` 内で再利用 | フェッチ・数式レンダリングロジックの重複を排除 |
| `preprocessMath()` によるLaTeX前処理 | delimiterなしの生LaTeXコマンドをKaTeX auto-renderが認識できる形式に変換するため |
| DeadZone機能 | タブレットを手で持ちながら操作する際、端を誤タッチしてもキャンバスへの描画やスクロールが起きないようにするため |
| PDFFileに独自file_idを付与 | 1文献に複数のPDF/MDファイルを添付できる設計。ルートも `:fileId` を含む |
| スクロールコンテナに `touchAction: 'none'` | DeadZone内のタッチをOSのネイティブジェスチャーセッションから切り離すことで、Apple Pencilイベントが抑制されるのを防ぐ |
| モーダルに `height: 100%`（`100dvh` でなく）| Safari で `html { zoom: N }` のとき `dvh` がズームされたICBに合わせてスケールされず、モバイル全画面モーダルの上部がビューポート外に押し出されるバグを回避するため |
| フォントサイズを `App.tsx` の `useEffect` で起動時適用 | ページリロード後もlocalStorageの設定が反映されるよう、SettingsModalとの二重管理で永続化 |
| 新規Markdown作成時にオプティミスティック更新 | `uploadPDF` 完了後に `qc.setQueryData` でキャッシュを即時更新し、refetch完了を待たずにインラインエディタを表示するため |
