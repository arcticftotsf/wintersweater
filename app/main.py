import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from contextlib import contextmanager

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
            ORDER BY updated_at DESC
        """).fetchall()

    return [dict(row) for row in rows]


@app.post("/api/documents")
def create_document(data: DocumentCreate):
    now = datetime.now(timezone.utc).isoformat()
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
        row = conn.execute(
            "SELECT * FROM documents WHERE id = ?",
            (document_id,)
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Document not found")

    return parse_document(row)


@app.put("/api/documents/{document_id}")
def update_document(document_id: int, data: DocumentUpdate):
    now = datetime.now(timezone.utc).isoformat()

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


@app.delete("/api/documents/{document_id}")
def delete_document(document_id: int):
    with get_db() as conn:
        cursor = conn.execute(
            "DELETE FROM documents WHERE id = ?",
            (document_id,)
        )

        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Document not found")

    return {"success": True}


app.mount(
    "/",
    StaticFiles(directory="app/static", html=True),
    name="static",
)