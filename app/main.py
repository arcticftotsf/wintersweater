
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from contextlib import contextmanager

from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

DB_PATH = os.getenv("DATABASE_PATH", "/data/wintersweater.db")

DEFAULT_SETTINGS = {
    "paper": "A4",
    "charsPerLine": 40,
    "linesPerPage": 30,
    "marginTop": 20,
    "marginBottom": 20,
    "marginLeft": 20,
    "marginRight": 20,
    "fontSize": 10.5,
    "showPageNumber": True,
    "pageNumberStart": 1,
}

app = FastAPI(title="Wintersweater")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def now_utc():
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def get_db():
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL
            )
        """)

        columns = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(documents)")
        }

        if "settings" not in columns:
            conn.execute("""
                ALTER TABLE documents
                ADD COLUMN settings TEXT NOT NULL DEFAULT '{}'
            """)

        if "deleted_at" not in columns:
            conn.execute("""
                ALTER TABLE documents
                ADD COLUMN deleted_at TEXT DEFAULT NULL
            """)


def parse_document(row):
    result = dict(row)

    try:
        settings = json.loads(result.get("settings") or "{}")
    except (json.JSONDecodeError, TypeError):
        settings = {}

    result["settings"] = {
        **DEFAULT_SETTINGS,
        **settings,
    }
    return result


def get_active_document(conn, document_id):
    row = conn.execute("""
        SELECT *
        FROM documents
        WHERE id = ? AND deleted_at IS NULL
    """, (document_id,)).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Document not found")

    return row


class DocumentCreate(BaseModel):
    title: str = "新しい原稿"


class DocumentUpdate(BaseModel):
    title: str
    content: str
    settings: dict = Field(default_factory=dict)


@app.on_event("startup")
def startup():
    init_db()


@app.get("/api/documents")
def list_documents():
    with get_db() as conn:
        rows = conn.execute("""
            SELECT id, title, updated_at
            FROM documents
            WHERE deleted_at IS NULL
            ORDER BY updated_at DESC
        """).fetchall()

    return [dict(row) for row in rows]


@app.post("/api/documents")
def create_document(data: DocumentCreate):
    now = now_utc()
    settings_json = json.dumps(DEFAULT_SETTINGS, ensure_ascii=False)

    with get_db() as conn:
        cursor = conn.execute("""
            INSERT INTO documents
                (title, content, updated_at, settings)
            VALUES (?, '', ?, ?)
        """, (data.title, now, settings_json))

        document_id = cursor.lastrowid

        row = conn.execute(
            "SELECT * FROM documents WHERE id = ?",
            (document_id,)
        ).fetchone()

    return parse_document(row)


@app.get("/api/documents/{document_id}")
def get_document(document_id: int):
    with get_db() as conn:
        row = get_active_document(conn, document_id)

    return parse_document(row)


@app.put("/api/documents/{document_id}")
def update_document(document_id: int, data: DocumentUpdate):
    now = now_utc()

    settings = {
        **DEFAULT_SETTINGS,
        **data.settings,
    }

    settings_json = json.dumps(settings, ensure_ascii=False)

    with get_db() as conn:
        cursor = conn.execute("""
            UPDATE documents
            SET title = ?,
                content = ?,
                settings = ?,
                updated_at = ?
            WHERE id = ?
              AND deleted_at IS NULL
        """, (
            data.title,
            data.content,
            settings_json,
            now,
            document_id,
        ))

        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Document not found")

    return {
        "success": True,
        "updated_at": now,
    }


# 原稿をゴミ箱へ移動
@app.delete("/api/documents/{document_id}")
def delete_document(document_id: int):
    now = now_utc()

    with get_db() as conn:
        cursor = conn.execute("""
            UPDATE documents
            SET deleted_at = ?
            WHERE id = ?
              AND deleted_at IS NULL
        """, (now, document_id))

        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Document not found")

    return {"success": True}


# ゴミ箱の一覧
@app.get("/api/trash")
def list_trash():
    with get_db() as conn:
        rows = conn.execute("""
            SELECT id, title, updated_at, deleted_at
            FROM documents
            WHERE deleted_at IS NOT NULL
            ORDER BY deleted_at DESC
        """).fetchall()

    return [dict(row) for row in rows]


# ゴミ箱から復元
@app.post("/api/documents/{document_id}/restore")
def restore_document(document_id: int):
    now = now_utc()

    with get_db() as conn:
        cursor = conn.execute("""
            UPDATE documents
            SET deleted_at = NULL,
                updated_at = ?
            WHERE id = ?
              AND deleted_at IS NOT NULL
        """, (now, document_id))

        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Trash item not found")

    return {"success": True}


# ゴミ箱内の原稿を完全削除
@app.delete("/api/trash/{document_id}")
def permanently_delete_document(document_id: int):
    with get_db() as conn:
        cursor = conn.execute("""
            DELETE FROM documents
            WHERE id = ?
              AND deleted_at IS NOT NULL
        """, (document_id,))

        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Trash item not found")

    return {"success": True}


# ゴミ箱を空にする
@app.delete("/api/trash")
def empty_trash():
    with get_db() as conn:
        cursor = conn.execute("""
            DELETE FROM documents
            WHERE deleted_at IS NOT NULL
        """)

    return {
        "success": True,
        "deleted_count": cursor.rowcount,
    }


app.mount(
    "/",
    StaticFiles(directory="app/static", html=True),
    name="static",
)
