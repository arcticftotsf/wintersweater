import os
import sys
from pathlib import Path

import uvicorn


def get_data_directory() -> Path:
    """ユーザーデータの保存先を取得する。"""

    if sys.platform == "win32":
        base = Path(
            os.environ.get(
                "APPDATA",
                Path.home() / "AppData" / "Roaming"
            )
        )
    else:
        base = Path(
            os.environ.get(
                "XDG_DATA_HOME",
                Path.home() / ".local" / "share"
            )
        )

    data_dir = base / "Wintersweater"
    data_dir.mkdir(parents=True, exist_ok=True)

    return data_dir


# Dockerなどから明示的に指定されていない場合は、
# ユーザー専用のデータディレクトリを使用する。
os.environ.setdefault(
    "DATABASE_PATH",
    str(get_data_directory() / "wintersweater.db")
)

# 環境変数を設定してからFastAPIを読み込む
from app.main import app


def main():
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8765,
        log_level="warning"
    )


if __name__ == "__main__":
    main()