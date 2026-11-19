import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

DB_PATH = os.getenv("DATABASE_PATH", "data/wintersweater.db")

app = FastAPI(title="Wintersweater")


def get_db():
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


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


class DocumentCreate(BaseModel):
    title: str = "新しい原稿"


class DocumentUpdate(BaseModel):
    title: str
    content: str


@app.on_event("startup")
def startup():
    init_db()


@app.get("/api/documents")
def list_documents():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, title, updated_at FROM documents ORDER BY updated_at DESC"
        ).fetchall()
    return [dict(row) for row in rows]


@app.post("/api/documents")
def create_document(data: DocumentCreate):
    now = datetime.now(timezone.utc).isoformat()

    with get_db() as conn:
        cursor = conn.execute(
            "INSERT INTO documents (title, content, updated_at) VALUES (?, '', ?)",
            (data.title, now),
        )
        document_id = cursor.lastrowid

    return {"id": document_id, "title": data.title, "content": ""}


@app.get("/api/documents/{document_id}")
def get_document(document_id: int):
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM documents WHERE id = ?", (document_id,)
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Document not found")

    return dict(row)


@app.put("/api/documents/{document_id}")
def update_document(document_id: int, data: DocumentUpdate):
    now = datetime.now(timezone.utc).isoformat()

    with get_db() as conn:
        cursor = conn.execute(
            """
            UPDATE documents
            SET title = ?, content = ?, updated_at = ?
            WHERE id = ?
            """,
            (data.title, data.content, now, document_id),
        )

        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Document not found")

    return {"success": True, "updated_at": now}


@app.delete("/api/documents/{document_id}")
def delete_document(document_id: int):
    with get_db() as conn:
        cursor = conn.execute(
            "DELETE FROM documents WHERE id = ?", (document_id,)
        )

        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Document not found")

    return {"success": True}


app.mount("/", StaticFiles(directory="app/static", html=True), name="static")
