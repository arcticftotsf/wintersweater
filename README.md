# wintersweater
A simple vertical writing novel editor

## 技術構成

-   Python 3.12 / FastAPI
-   SQLite
-   HTML / CSS / JavaScript
-   Docker Compose

## 起動

WSL2 Ubuntuで実行:

``` bash
docker compose up -d --build
```

ブラウザで http://localhost:8000 を開く。

## 停止・ログ確認

``` bash
docker compose down
docker compose logs -f wintersweater
```

## データ保存先

SQLiteデータベースは `data/` 以下に保存する。

原稿データを含むため、DBファイルや `data/` はGitにコミットしないこと。

## 開発メモ

開発方針、現在の実装状況、未解決事項は [CHARTER.md](CHARTER.md) を参照。
