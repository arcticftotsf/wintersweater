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

export function scheduleSave() {
    setSaveStatus("未保存");

    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(saveDocument, 1200);
}

export async function saveDocument() {
    if (state.currentDocumentId === null) return;

    if (state.isSaving) {
        state.saveAgain = true;
        return;
    }

    clearTimeout(state.saveTimer);

    state.isSaving = true;
    setSaveStatus("保存中...");

    try {
        state.currentContent = getCurrentContentFromPages();

        await request(`/api/documents/${state.currentDocumentId}`, {
            method: "PUT",
            body: JSON.stringify({
                title: elements.titleInput.value.trim() || "無題",
                content: state.currentContent,
                settings: state.currentSettings,
            }),
        });

        setSaveStatus("保存済み");
        await loadDocuments();
    } catch (error) {
        console.error(error);
        setSaveStatus("保存失敗");
    } finally {
        state.isSaving = false;

        if (state.saveAgain) {
            state.saveAgain = false;
            saveDocument();
        }
    }
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
        deleteButton.title = `${doc.title}を削除`;

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

    clearTimeout(state.saveTimer);

    const doc = await request(`/api/documents/${id}`);

    state.currentDocumentId = doc.id;
    state.currentContent = doc.content || "";
    state.currentSettings = {
        ...DEFAULT_SETTINGS,
        ...(doc.settings || {}),
    };

    elements.titleInput.value = doc.title;

    renderPages();
    fillSettingsForm();
    setSaveStatus("保存済み");

    await loadDocuments();
}

export function clearEditor() {
    clearTimeout(state.saveTimer);
    state.saveTimer = null;

    state.currentDocumentId = null;
    state.currentContent = "";
    state.currentSettings = { ...DEFAULT_SETTINGS };

    elements.titleInput.value = "";

    renderPages();
    fillSettingsForm();

    setSaveStatus("原稿がありません");
}

export async function createDocument() {
    try {
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
    if (id === state.currentDocumentId && state.isSaving) {
        setSaveStatus("保存処理中です。完了後に削除してください。");
        return;
    }

    const confirmed = window.confirm(
        `「${title}」を削除しますか？\n\nこの操作は取り消せません。未保存の変更も失われます。`
    );

    if (!confirmed) return;

    const isCurrentDocument = id === state.currentDocumentId;

    try {
        if (isCurrentDocument) {
            clearTimeout(state.saveTimer);
            state.saveTimer = null;
        }

        await request(`/api/documents/${id}`, {
            method: "DELETE",
        });

        if (isCurrentDocument) {
            state.currentDocumentId = null;

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

        setSaveStatus("削除しました");
    } catch (error) {
        console.error("deleteDocument failed:", error);
        setSaveStatus(`削除失敗: ${error.message}`);
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