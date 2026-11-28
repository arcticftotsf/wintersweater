
import { elements, state, DEFAULT_SETTINGS } from "./state.js";
import { request } from "./api.js";

import {
    renderPages,
    getCurrentContentFromPages,
} from "./editor.js";

import { fillSettingsForm } from "./settings.js";

export function setSaveStatus(message) {
    elements.saveStatus.textContent = message;
}


// 未保存の変更があることを記録する（自動保存はしない）
export function scheduleSave() {
    state.isDirty = true;
    setSaveStatus("未保存");
}

let savePromise = null;

// 未保存の変更があれば保存する。保存不要または成功なら true
export async function saveIfDirty() {
    if (!state.isDirty) return true;
    return saveDocument();
}

async function saveOnce() {
    const id = state.currentDocumentId;

    state.isSaving = true;
    setSaveStatus("保存中...");

    // 保存中に入力された変更を見落とさないよう、先にフラグを下ろす
    state.isDirty = false;

    try {
        state.currentContent = getCurrentContentFromPages();

        await request(`/api/documents/${id}`, {
            method: "PUT",
            body: JSON.stringify({
                title: elements.titleInput.value.trim() || "無題",
                content: state.currentContent,
                settings: state.currentSettings,
            }),
        });
    } catch (error) {
        console.error(error);
        state.isDirty = true;
        setSaveStatus("保存失敗");
        state.isSaving = false;
        return false;
    }

    state.isSaving = false;
    setSaveStatus(state.isDirty ? "未保存" : "保存済み");

    try {
        await loadDocuments();
    } catch (error) {
        console.error(error);
    }

    return true;
}

// 保存する。成功したら true。保存中に呼ばれたらその完了を待つ
export async function saveDocument() {
    if (state.currentDocumentId === null) return true;

    if (savePromise) {
        state.saveAgain = true;
        return savePromise;
    }

    savePromise = (async () => {
        let ok;

        do {
            state.saveAgain = false;
            ok = await saveOnce();
        } while (ok && state.saveAgain);

        return ok;
    })().finally(() => {
        savePromise = null;
    });

    return savePromise;
}

export async function loadDocuments() {
    const documents = await request("/api/documents");

    elements.documentList.replaceChildren();

    documents.forEach(doc => {
        const li = document.createElement("li");
        li.className = "document-item";
        li.classList.toggle("active", doc.id === state.currentDocumentId);

        const openButton = document.createElement("button");
        openButton.type = "button";
        openButton.className = "document-open-button";
        openButton.textContent = doc.title;
        openButton.title = doc.title;

        openButton.addEventListener("click", async () => {
            try {
                await openDocument(doc.id);
            } catch (error) {
                console.error(error);
                setSaveStatus(`読み込み失敗: ${error.message}`);
            }
        });

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "document-delete-button";
        deleteButton.textContent = "削除";
        deleteButton.title = `${doc.title}をゴミ箱に移動`;

        deleteButton.addEventListener("click", () => {
            deleteDocument(doc.id, doc.title);
        });

        li.append(openButton, deleteButton);
        elements.documentList.appendChild(li);
    });

    return documents;
}

export async function openDocument(id) {
    if (id === state.currentDocumentId) return;

    // 未保存の変更は、切り替える前に必ず保存する
    if (!(await saveIfDirty())) {
        throw new Error(
            "未保存の変更を保存できなかったため、切り替えを中止しました"
        );
    }

    const doc = await request(`/api/documents/${id}`);

    state.currentDocumentId = doc.id;
    state.currentContent = doc.content || "";
    state.currentSettings = {
        ...DEFAULT_SETTINGS,
        ...(doc.settings || {}),
    };

    state.isDirty = false;
    state.currentSearchPosition = 0;

    elements.titleInput.disabled = false;
    elements.titleInput.value = doc.title;

    renderPages();
    document.querySelector(".editor-area")?.scrollTo(0, 0);
    fillSettingsForm();
    setSaveStatus("保存済み");

    await loadDocuments();
}

export function clearEditor() {
    state.isDirty = false;
    state.currentDocumentId = null;
    state.currentContent = "";
    state.currentSettings = { ...DEFAULT_SETTINGS };

    elements.titleInput.value = "";
    elements.titleInput.disabled = true;

    renderPages();
    fillSettingsForm();

    setSaveStatus("原稿がありません");
}

export async function createDocument() {
    try {
        if (!(await saveIfDirty())) {
            setSaveStatus("保存に失敗したため、新規作成を中止しました");
            return;
        }

        setSaveStatus("新規原稿を作成中...");

        const doc = await request("/api/documents", {
            method: "POST",
            body: JSON.stringify({ title: "新しい原稿" }),
        });

        await openDocument(doc.id);

        elements.editorPages.querySelector(".page-editor")?.focus();

        setSaveStatus("作成完了");
    } catch (error) {
        console.error("createDocument failed:", error);
        setSaveStatus(`作成失敗: ${error.message}`);
    }
}

export async function deleteDocument(id, title) {
    const confirmed = await window.confirm(
    `「${title}」をゴミ箱に移動しますか？`
    );

    if (!confirmed) return;

    const isCurrentDocument = id === state.currentDocumentId;

    try {
        // 開いている原稿は、最新の内容を保存してからゴミ箱へ移す
        if (isCurrentDocument && !(await saveIfDirty())) {
            setSaveStatus("保存に失敗したため、削除を中止しました");
            return;
        }

        await request(`/api/documents/${id}`, {
            method: "DELETE",
        });

        if (isCurrentDocument) {
            state.currentDocumentId = null;
            state.isDirty = false;

            const documents = await request("/api/documents");

            if (documents.length > 0) {
                await openDocument(documents[0].id);
            } else {
                clearEditor();
                await loadDocuments();
            }
        } else {
            await loadDocuments();
        }

        setSaveStatus("ゴミ箱に移動しました");
    } catch (error) {
        console.error("deleteDocument failed:", error);
        setSaveStatus(`削除失敗: ${error.message}`);
    }
}

// ゴミ箱の日時表示
function formatDeletedAt(value) {
    if (!value) return "日時不明";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString("ja-JP");
}

// ゴミ箱一覧の読み込みと描画
export async function loadTrash() {
    const list = document.getElementById("trash-list");
    const emptyTrashButton = document.getElementById("empty-trash-button");
    const items = await request("/api/trash");

    list.replaceChildren();

    // ゴミ箱が空なら完全削除ボタンを無効化
    emptyTrashButton.disabled = items.length === 0;

    if (items.length === 0) {
        const empty = document.createElement("li");
        empty.className = "trash-empty";
        empty.textContent = "ゴミ箱は空です";
        list.appendChild(empty);
        return items;
    }

    items.forEach(item => {
        const li = document.createElement("li");
        li.className = "trash-item";

        const info = document.createElement("div");
        info.className = "trash-item-info";

        const title = document.createElement("div");
        title.className = "trash-item-title";
        title.textContent = item.title;

        const deletedAt = document.createElement("div");
        deletedAt.className = "trash-item-date";
        deletedAt.textContent =
            `削除日時: ${formatDeletedAt(item.deleted_at)}`;

        info.append(title, deletedAt);

        const actions = document.createElement("div");
        actions.className = "trash-item-actions";

        const restoreButton = document.createElement("button");
        restoreButton.type = "button";
        restoreButton.textContent = "復元";
        restoreButton.addEventListener("click", () => {
            restoreDocument(item.id);
        });

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "danger-button";
        deleteButton.textContent = "完全削除";
        deleteButton.addEventListener("click", () => {
            permanentlyDeleteDocument(item.id, item.title);
        });

        actions.append(restoreButton, deleteButton);
        li.append(info, actions);
        list.appendChild(li);
    });

    return items;
}

// ゴミ箱から復元
export async function restoreDocument(id) {
    try {
        await request(`/api/documents/${id}/restore`, {
            method: "POST",
        });

        await loadTrash();
        await loadDocuments();

        setSaveStatus("原稿を復元しました");
    } catch (error) {
        console.error("restoreDocument failed:", error);
        alert(`原稿を復元できませんでした: ${error.message}`);
    }
}

// ゴミ箱内の原稿を完全削除
export async function permanentlyDeleteDocument(id, title) {
    const confirmed = await window.confirm(
        `「${title}」を完全に削除しますか？\n\nこの操作は取り消せません。`
    );

    if (!confirmed) return;

    try {
        await request(`/api/trash/${id}`, {
            method: "DELETE",
        });

        await loadTrash();
        setSaveStatus("原稿を完全削除しました");
    } catch (error) {
        console.error("permanentlyDeleteDocument failed:", error);
        alert(`原稿を完全削除できませんでした: ${error.message}`);
    }
}

// ゴミ箱を空にする
export async function emptyTrash() {
    const confirmed = await window.confirm(
        "ゴミ箱内の原稿をすべて完全に削除しますか？\n\nこの操作は取り消せません。"
    );

    if (!confirmed) return;

    try {
        const result = await request("/api/trash", {
            method: "DELETE",
        });

        await loadTrash();
        setSaveStatus(
            `${result.deleted_count}件の原稿を完全削除しました`
        );
    } catch (error) {
        console.error("emptyTrash failed:", error);
        alert(`ゴミ箱を空にできませんでした: ${error.message}`);
    }
}

export async function initializeDocuments() {
    const documents = await loadDocuments();

    if (documents.length > 0) {
        await openDocument(documents[0].id);
    } else {
        await createDocument();
    }
}
