# wintersweater

A simple vertical writing novel editor

## 技術構成

- Python 3.12 / FastAPI
- SQLite
- HTML / CSS / JavaScript
- Tauri v2
- Rust
- Docker Compose

## 起動

### APIサーバー

WSL2 Ubuntuで実行:

```bash
docker compose up -d --build
```

ブラウザで http://localhost:8000 を開く。

### デスクトップアプリ（開発用）

APIサーバーを起動した状態で、別のターミナルからプロジェクトのルートディレクトリで実行:

```bash
cargo tauri dev
```

Tauriのウィンドウが起動する。

※ 開発時はDocker ComposeによるAPIサーバーとTauriアプリをそれぞれ起動する必要がある。

## 停止・ログ確認

APIサーバーの停止:

```bash
docker compose down
```

APIサーバーのログ確認:

```bash
docker compose logs -f wintersweater
```

Tauriアプリはウィンドウを閉じるか、起動したターミナルで `Ctrl+C` を押して停止する。

## データ保存先

SQLiteデータベースは `data/` 以下に保存する。

原稿データを含むため、DBファイルや `data/` はGitにコミットしないこと。

## 開発メモ

開発方針、現在の実装状況、未解決事項は [CHARTER.md](CHARTER.md) を参照。
