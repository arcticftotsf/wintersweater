# Wintersweater 開発憲章・引き継ぎメモ

最終更新: 2026-11-19

このファイルは、次回AIに開発を引き継ぐための作業記録です。次回は最初にこのファイルと現在のソースコードを確認し、記載内容と実装が食い違っていないか確認してください。

## 1. プロジェクトの目的

Wintersweaterは、小説執筆に特化した縦書きエディタです。

目指す方向: - Wordのようなページ単位の編集体験 -
小説ごとに用紙・文字数・行数などの組版設定を保持 -
SQLiteによる原稿と設定の保存 -
JSON形式で設定をエクスポート・インポート -
検索・置換、自動保存、印刷・PDF出力 -
将来的には禁則処理、ルビ、傍点、日本語フォントを考慮したPDF出力

過度に多機能なワープロではなく、小説を書くために必要な機能に絞る。

## 2. 技術構成

-   Python 3.12
-   FastAPI
-   SQLite（Python標準の sqlite3）
-   HTML / CSS / Vanilla JavaScript
-   Docker Compose
-   開発環境: Windows上のVS Code + WSL2 Ubuntu 24.04
-   CSSの `writing-mode: vertical-rl` で縦書き表示

React、Next.js、Node.jsは使用しない方針。必要性が明確にならない限り依存を増やさない。

## 3. リポジトリと開発環境

-   GitHub: https://github.com/arcticftotsf/wintersweater
-   プロジェクトディレクトリ: `~/src/wintersweater`
-   Docker EngineはWSL2 Ubuntu内にインストール済み
-   `docker run hello-world` は成功済み
-   Docker Desktopは今回の構成では必須ではない
-   Python仮想環境 `.venv` をプロジェクト直下に作成済み

基本コマンド:

``` bash
cd ~/src/wintersweater
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 wintersweater
```

ソースコードだけを変更した場合は、通常 `app/`
がコンテナにマウントされているため、`docker compose restart wintersweater`
または自動リロードで反映できる。requirements.txt、Dockerfile、compose.yamlを変更した場合は再ビルドが必要。

## 4. デバッグ環境についての重要事項

開発用compose.yamlでは、debugpyを使ってVS
Codeからコンテナに接続する構成を作っている。

-   アプリ: ポート8000
-   debugpy: ポート5678
-   VS CodeのAttach設定: `.vscode/launch.json`
-   Python Debugger拡張を使用
-   debugpy起動時のFrozen Modules警告対策として
    `python -Xfrozen_modules=off -m debugpy` を使用する案内をした

**現在、Webアプリにアクセスできなくなった原因として最初に確認すべき点:**

compose.yamlのcommandに `--wait-for-client`
が残っている可能性が高い。この指定があると、VS
Codeのデバッガーが5678番ポートに接続するまでUvicornが起動しない。そのため、コンテナが起動中に見えても
`http://localhost:8000` にアクセスできないことがある。

通常の開発では、まず `--wait-for-client`
を外す。debugpy自体は起動しておき、VS
Codeから必要なときにAttachする方式にする。起動待ちが必要な場合だけ一時的に指定する。

次回は、いきなりコードを変更せず、次の順で確認する。

``` bash
docker compose ps
docker compose logs --tail=100 wintersweater
```

必要に応じて、compose.yamlのcommand、ポート公開、コンテナ内のプロセスを確認する。原因を特定してから修正する。

## 5. 現在のファイル構成

概ね次の構成。

``` text
wintersweater/
├── app/
│   ├── main.py
│   └── static/
│       ├── index.html
│       ├── style.css
│       └── app.js
├── data/
├── requirements.txt
├── Dockerfile
├── compose.yaml
├── .gitignore
└── README.md
```

実際のファイル構成は次回作業時に確認すること。

## 6. 2026-11-19に行った作業

### 既存の初期版

当初はA4相当の白い領域に縦書きtextareaを1つ表示し、原稿をSQLiteに保存する構成だった。

FastAPIには以下のAPIがある。 - `GET /api/documents` -
`POST /api/documents` - `GET /api/documents/{document_id}` -
`PUT /api/documents/{document_id}` -
`DELETE /api/documents/{document_id}`

初期DBのdocumentsテーブル: - id - title - content - updated_at

### 今回提示した変更

次のファイルを全面置き換えするコードを提示した。ユーザーがすべて反映したか、正常に動作したかは未確認。

-   `app/main.py`
    -   documentsテーブルにsettingsカラムを追加するマイグレーション
    -   設定をJSON文字列としてSQLiteに保存
    -   原稿取得時にデフォルト設定とマージ
-   `app/static/index.html`
    -   ハンバーガーメニュー
    -   原稿設定パネル
    -   検索・置換パネル
    -   JSON設定の入出力ボタン
    -   印刷・PDF出力ボタン
-   `app/static/style.css`
    -   ページ表示、サイドパネル、印刷用CSS
-   `app/static/app.js`
    -   文字数・行数から本文をページに分割する初期処理
    -   ページ番号
    -   原稿別設定
    -   JSON設定のインポート・エクスポート
    -   検索・置換
    -   自動保存、手動保存
    -   `window.print()`による印刷

### 初期設定

``` json
{
  "paper": "A4",
  "charsPerLine": 40,
  "linesPerPage": 30,
  "marginTop": 20,
  "marginBottom": 20,
  "marginLeft": 20,
  "marginRight": 20,
  "fontSize": 10.5,
  "showPageNumber": true,
  "pageNumberStart": 1
}
```

用紙サイズはA4・B5・A5を想定。

## 7. 現時点で未確認・未完成の点

今回提示したコードはまだ実機確認が済んでいない。完成扱いにしないこと。

特に次の問題を確認・修正する。

1.  **アクセス不能**
    -   最初にcompose.yamlの `--wait-for-client` を確認する。
    -   VS
        CodeがAttachするまでUvicornが起動しない設定になっていないか確認する。
2.  **ページ分割と実際の表示の不一致**
    -   現状は本文を `charsPerLine × linesPerPage`
        の文字数で単純分割するだけ。
    -   CSS上の実際の文字送り・列数と一致する保証はない。
    -   改行、禁則処理、段落、フォント差、文字幅を考慮していない。
    -   JavaScriptのUnicodeコードポイント数とtextareaのselectionStart/selectionEnd（UTF-16コード単位）の扱いにも注意する。
3.  **ページをまたぐ編集**
    -   ページごとにtextareaを作り直す簡易実装。
    -   入力時の再描画、カーソル位置、選択範囲、Undo/Redo、IME変換が正常か十分に検証していない。
    -   日本語IMEで入力中にDOMを作り直すと変換が途切れる可能性がある。実際に日本語入力を試験すること。
    -   本格的なページエディタでは、単一の文書モデルと編集位置を管理する設計を検討する。
4.  **保存タイミング**
    -   原稿切り替え時に、未保存の内容が残っている状態で保存タイマーを消すと、変更が失われる可能性がある。
    -   原稿切り替え前に保存完了を待つ、または変更内容を確実に保存する処理が必要。
    -   連続編集中の保存競合や、古い保存リクエストが新しい内容を上書きしないかも確認する。
5.  **イベント処理**
    -   app.jsにはページtextarea個別のinputイベントと、editorPages全体のinputイベントが両方存在する。
    -   入力処理が重複していないか整理する。前回提示時にも、末尾の委譲inputイベントを削除する案内をした。
    -   ページを再描画する処理とイベントの実行順序を確認する。
6.  **印刷・PDF**
    -   現在はブラウザの `window.print()` による初期対応。
    -   @pageの用紙サイズ、余白、改ページ、ページ番号、印刷時のtextarea表示を検証する。
    -   将来はPlaywright +
        ChromiumなどでPDFを生成し、日本語フォントを含める方式を検討する。
7.  **設定ファイル**
    -   JSONインポート時に型・範囲を厳密に検証する。
    -   不正な設定値でページが崩れないようにする。
    -   設定だけでなく、必要なら原稿本文を含むバックアップ形式も将来検討する。

## 8. DBと原稿データの取り扱い

原稿本文は個人データとして扱う。

-   `data/`、`dbdata/`、SQLiteファイルをGitにコミットしない。
-   `.gitignore`に `*.db`、`*.sqlite`、`*.sqlite3`、`data/`、`dbdata/`
    を含める。
-   `.gitignore`はすでに追跡されているファイルを自動で追跡解除しない。追跡済みなら
    `git rm --cached` で管理対象から外す。
-   DBの削除や初期化を安易に提案しない。
-   DBスキーマ変更は既存データを保持するマイグレーションにする。
-   作業前に必要ならSQLiteファイルをバックアップする。

## 9. 次回AIへの依頼事項

次回はこの憲章を読んだうえで、まずユーザーに次のように対応する。

1.  今日の作業内容と現在の実装状態を把握する。
2.  Webアプリにアクセスできない問題を、compose.yamlとログから診断する。
3.  `--wait-for-client` が原因なら通常開発時に外す。
4.  起動できたら、今回のページ分割・設定保存機能を実際に検証する。
5.  問題があれば、既存原稿を壊さない修正を行う。
6.  その後、ページ編集の設計を改善する。

ユーザーは、コード作成を細切れにせず、関連する機能をまとまった単位で提示してよいと希望している。一方で、原因調査が必要な障害では、ログを確認せずに大きな変更を重ねない。

画像は生成・表示しない。回答は日本語で、直接的かつ実用的にする。
