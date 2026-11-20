const editorPages = document.getElementById("pages");
const titleInput = document.getElementById("document-title");
const documentList = document.getElementById("document-list");
const saveStatus = document.getElementById("save-status");
const characterCount = document.getElementById("character-count");
const pageInfo = document.getElementById("page-info");

const API_BASE_URL = "http://127.0.0.1:8000";

const DEFAULT_SETTINGS = {
    paper: "A4",
    charsPerLine: 40,
    linesPerPage: 30,
    marginTop: 20,
    marginBottom: 20,
    marginLeft: 20,
    marginRight: 20,
    fontSize: 10.5,
    showPageNumber: true,
    pageNumberStart: 1,
};

const PAPER_SIZES = {
    A4: { width: 210, height: 297 },
    B5: { width: 182, height: 257 },
    A5: { width: 148, height: 210 },
};

let currentDocumentId = null;
let currentContent = "";
let currentSettings = { ...DEFAULT_SETTINGS };
let saveTimer = null;
let isSaving = false;
let saveAgain = false;
let currentSearchPosition = 0;

async function request(url, options = {}) {
    const response = await fetch(`${API_BASE_URL}${url}`, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });

    if (!response.ok) {
        let message = `HTTP error: ${response.status}`;

        try {
            const body = await response.json();
            message = body.detail || message;
        } catch {
            // Ignore invalid response body.
        }

        throw new Error(message);
    }

    if (response.status === 204) return null;
    return response.json();
}

function setSaveStatus(message) {
    saveStatus.textContent = message;
}

function updateCharacterCount() {
    characterCount.textContent =
        `${[...currentContent].length.toLocaleString()}文字`;
}

function getPageSize() {
    return PAPER_SIZES[currentSettings.paper] || PAPER_SIZES.A4;
}

function getPageCapacity() {
    const chars = Math.max(1, Number(currentSettings.charsPerLine) || 40);
    const lines = Math.max(1, Number(currentSettings.linesPerPage) || 30);
    return chars * lines;
}

function splitIntoPages(content) {
    const characters = [...content];
    const capacity = getPageCapacity();
    const pages = [];

    for (let i = 0; i < characters.length; i += capacity) {
        pages.push(characters.slice(i, i + capacity).join(""));
    }

    if (pages.length === 0) {
        pages.push("");
    }

    return pages;
}

function getPageStyle() {
    const paper = getPageSize();

    const style = document.createElement("style");
    style.textContent = `
        .page {
            width: ${paper.width}mm;
            height: ${paper.height}mm;
        }
    `;

    return style;
}

function renderPages(focusOffset = null) {
    const oldFocus = document.activeElement;
    const hadEditorFocus = oldFocus?.classList?.contains("page-editor");

    const pages = splitIntoPages(currentContent);
    const capacity = getPageCapacity();
    const paper = getPageSize();

    editorPages.replaceChildren();

    const pageStyle = getPageStyle();
    editorPages.appendChild(pageStyle);

    let globalOffset = 0;
    let focusPage = 0;
    let focusPosition = 0;

    pages.forEach((pageText, index) => {
        const page = document.createElement("div");
        page.className = "page";

        page.style.setProperty(
            "--margin-top",
            `${currentSettings.marginTop}mm`
        );
        page.style.setProperty(
            "--margin-bottom",
            `${currentSettings.marginBottom}mm`
        );
        page.style.setProperty(
            "--margin-left",
            `${currentSettings.marginLeft}mm`
        );
        page.style.setProperty(
            "--margin-right",
            `${currentSettings.marginRight}mm`
        );
        page.style.setProperty(
            "--font-size",
            `${currentSettings.fontSize}pt`
        );

        const contentArea = document.createElement("div");
        contentArea.className = "page-content";

        const textarea = document.createElement("textarea");
        textarea.className = "page-editor";
        textarea.value = pageText;
        textarea.spellcheck = false;
        textarea.setAttribute(
            "aria-label",
            `${index + 1}ページ目の本文`
        );

        const pageStart = globalOffset;
        const pageEnd = pageStart + [...pageText].length;

        if (
            focusOffset !== null &&
            focusOffset >= pageStart &&
            (focusOffset <= pageEnd || index === pages.length - 1)
        ) {
            focusPage = index;
            focusPosition = Math.min(
                [...pageText].length,
                Math.max(0, focusOffset - pageStart)
            );
        }

        textarea.addEventListener("input", () => {
            const selection = textarea.selectionStart;
            const pageIndex = Number(textarea.dataset.pageIndex);

            const allTextareas = [
                ...editorPages.querySelectorAll(".page-editor")
            ];

            let offset = 0;

            for (let i = 0; i < pageIndex; i++) {
                offset += [...allTextareas[i].value].length;
            }

            offset += selection;

            currentContent = allTextareas
                .map(item => item.value)
                .join("");

            renderPages(offset);
            updateCharacterCount();
            scheduleSave();

            focusEditorAt(offset);
        });

        textarea.addEventListener("keydown", handleEditorKeydown);
        textarea.dataset.pageIndex = String(index);

        contentArea.appendChild(textarea);
        page.appendChild(contentArea);

        if (currentSettings.showPageNumber) {
            const pageNumber = document.createElement("div");
            pageNumber.className = "page-number";
            pageNumber.textContent =
                String(Number(currentSettings.pageNumberStart) + index);
            page.appendChild(pageNumber);
        }

        editorPages.appendChild(page);

        globalOffset += [...pageText].length;
    });

    pageInfo.textContent = `${pages.length} ページ`;
    updateCharacterCount();

    if (focusOffset !== null || hadEditorFocus) {
        focusEditorAt(
            focusOffset !== null
                ? focusOffset
                : globalOffset
        );
    }
}

function focusEditorAt(globalOffset) {
    const textareas = [
        ...editorPages.querySelectorAll(".page-editor")
    ];

    let remaining = Math.max(0, globalOffset);

    for (let i = 0; i < textareas.length; i++) {
        const length = [...textareas[i].value].length;

        if (remaining <= length || i === textareas.length - 1) {
            const textarea = textareas[i];
            const position = Math.min(remaining, textarea.value.length);

            textarea.focus();
            textarea.setSelectionRange(position, position);
            return;
        }

        remaining -= length;
    }
}

function handleEditorKeydown(event) {
    const textarea = event.currentTarget;
    const pageIndex = Number(textarea.dataset.pageIndex);

    if (event.key === "ArrowLeft" && textarea.selectionStart === 0 &&
        textarea.selectionEnd === 0 && pageIndex > 0) {
        event.preventDefault();
        const previous = editorPages.querySelectorAll(".page-editor")[pageIndex - 1];
        previous.focus();
        previous.setSelectionRange(previous.value.length, previous.value.length);
    }

    if (event.key === "ArrowRight" &&
        textarea.selectionStart === textarea.value.length &&
        textarea.selectionEnd === textarea.value.length) {
        const next = editorPages.querySelectorAll(".page-editor")[pageIndex + 1];

        if (next) {
            event.preventDefault();
            next.focus();
            next.setSelectionRange(0, 0);
        }
    }
}

function getCurrentContentFromPages() {
    return [...editorPages.querySelectorAll(".page-editor")]
        .map(textarea => textarea.value)
        .join("");
}

function scheduleSave() {
    setSaveStatus("未保存");

    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDocument, 1200);
}

async function saveDocument() {
    if (currentDocumentId === null) return;

    if (isSaving) {
        saveAgain = true;
        return;
    }

    clearTimeout(saveTimer);

    isSaving = true;
    setSaveStatus("保存中...");

    try {
        currentContent = getCurrentContentFromPages();

        await request(`/api/documents/${currentDocumentId}`, {
            method: "PUT",
            body: JSON.stringify({
                title: titleInput.value.trim() || "無題",
                content: currentContent,
                settings: currentSettings,
            }),
        });

        setSaveStatus("保存済み");
        await loadDocuments();
    } catch (error) {
        console.error(error);
        setSaveStatus("保存失敗");
    } finally {
        isSaving = false;

        if (saveAgain) {
            saveAgain = false;
            saveDocument();
        }
    }
}

async function loadDocuments() {
    const documents = await request("/api/documents");
    documentList.replaceChildren();

    documents.forEach(doc => {
        const li = document.createElement("li");
        li.className = "document-item";
        li.classList.toggle("active", doc.id === currentDocumentId);

        // 原稿を開くボタン
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

        // 削除ボタン
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "document-delete-button";
        deleteButton.textContent = "削除";
        deleteButton.title = `${doc.title}を削除`;

        deleteButton.addEventListener("click", () => {
            deleteDocument(doc.id, doc.title);
        });

        li.append(openButton, deleteButton);
        documentList.appendChild(li);
    });
}

async function deleteDocument(id, title) {
    // 保存中の原稿は、保存完了後に削除する
    if (id === currentDocumentId && isSaving) {
        setSaveStatus("保存処理中です。完了後に削除してください。");
        return;
    }

    const confirmed = window.confirm(
        `「${title}」を削除しますか？\n\nこの操作は取り消せません。未保存の変更も失われます。`
    );

    if (!confirmed) return;

    const isCurrentDocument = id === currentDocumentId;

    try {
        // 現在開いている原稿なら自動保存を停止
        if (isCurrentDocument) {
            clearTimeout(saveTimer);
            saveTimer = null;
        }

        // APIで削除
        await request(`/api/documents/${id}`, {
            method: "DELETE",
        });

        if (isCurrentDocument) {
            currentDocumentId = null;

            const documents = await request("/api/documents");

            if (documents.length > 0) {
                // 別の原稿を開く
                await openDocument(documents[0].id);
            } else {
                // 最後の原稿なら空の編集画面にする
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

function clearEditor() {
    clearTimeout(saveTimer);
    saveTimer = null;

    currentDocumentId = null;
    currentContent = "";
    currentSettings = { ...DEFAULT_SETTINGS };

    titleInput.value = "";

    renderPages();
    fillSettingsForm();

    setSaveStatus("原稿がありません");
}

async function deleteDocument(id, title) {
    // 保存中の原稿を削除する場合は、保存完了を待つ
    if (id === currentDocumentId && isSaving) {
        setSaveStatus("保存処理中です。完了後に削除してください。");
        return;
    }

    const confirmed = window.confirm(
        `「${title}」を削除しますか？\n\n` +
        "この操作は取り消せません。未保存の変更も失われます。"
    );

    if (!confirmed) return;

    const isCurrentDocument = id === currentDocumentId;

    try {
        // 削除対象の自動保存を停止
        if (isCurrentDocument) {
            clearTimeout(saveTimer);
            saveTimer = null;
        }

        await request(`/api/documents/${id}`, {
            method: "DELETE",
        });

        if (isCurrentDocument) {
            currentDocumentId = null;

            const documents = await request("/api/documents");

            if (documents.length > 0) {
                // 最新の原稿を開く
                await openDocument(documents[0].id);
            } else {
                // 最後の原稿なら空の編集画面にする
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

function clearEditor() {
    clearTimeout(saveTimer);
    saveTimer = null;

    currentDocumentId = null;
    currentContent = "";
    currentSettings = { ...DEFAULT_SETTINGS };

    titleInput.value = "";

    renderPages();
    fillSettingsForm();

    setSaveStatus("原稿がありません");
}


async function openDocument(id) {
    if (id === currentDocumentId) return;

    clearTimeout(saveTimer);

    const doc = await request(`/api/documents/${id}`);

    currentDocumentId = doc.id;
    currentContent = doc.content || "";
    currentSettings = {
        ...DEFAULT_SETTINGS,
        ...(doc.settings || {}),
    };

    titleInput.value = doc.title;
    renderPages();
    fillSettingsForm();
    setSaveStatus("保存済み");

    await loadDocuments();
}

async function createDocument() {
    try {
        setSaveStatus("新規原稿を作成中...");

        console.log("createDocument: start");

        const doc = await request("/api/documents", {
            method: "POST",
            body: JSON.stringify({ title: "新しい原稿" }),
        });

        console.log("createDocument: API response", doc);

        await openDocument(doc.id);

        const firstEditor = editorPages.querySelector(".page-editor");
        firstEditor?.focus();

        setSaveStatus("作成完了");
    } catch (error) {
        console.error("createDocument failed:", error);
        setSaveStatus(`作成失敗: ${error.message}`);
    }
}

function fillSettingsForm() {
    document.getElementById("setting-paper").value =
        currentSettings.paper;

    document.getElementById("setting-chars").value =
        currentSettings.charsPerLine;

    document.getElementById("setting-lines").value =
        currentSettings.linesPerPage;

    document.getElementById("setting-font-size").value =
        currentSettings.fontSize;

    document.getElementById("setting-page-start").value =
        currentSettings.pageNumberStart;

    document.getElementById("setting-margin-top").value =
        currentSettings.marginTop;

    document.getElementById("setting-margin-bottom").value =
        currentSettings.marginBottom;

    document.getElementById("setting-margin-left").value =
        currentSettings.marginLeft;

    document.getElementById("setting-margin-right").value =
        currentSettings.marginRight;

    document.getElementById("setting-show-page-number").checked =
        currentSettings.showPageNumber;
}

function readSettingsForm() {
    const number = (id, fallback) => {
        const value = Number(document.getElementById(id).value);
        return Number.isFinite(value) ? value : fallback;
    };

    return {
        paper: document.getElementById("setting-paper").value,
        charsPerLine: Math.min(200, Math.max(
            1, number("setting-chars", 40)
        )),
        linesPerPage: Math.min(100, Math.max(
            1, number("setting-lines", 30)
        )),
        fontSize: Math.min(40, Math.max(
            6, number("setting-font-size", 10.5)
        )),
        pageNumberStart: Math.max(
            1, number("setting-page-start", 1)
        ),
        marginTop: Math.min(100, Math.max(
            0, number("setting-margin-top", 20)
        )),
        marginBottom: Math.min(100, Math.max(
            0, number("setting-margin-bottom", 20)
        )),
        marginLeft: Math.min(100, Math.max(
            0, number("setting-margin-left", 20)
        )),
        marginRight: Math.min(100, Math.max(
            0, number("setting-margin-right", 20)
        )),
        showPageNumber:
            document.getElementById("setting-show-page-number").checked,
    };
}

function applySettings() {
    currentSettings = readSettingsForm();

    renderPages();
    closeSettings();
    scheduleSave();
}

function openMenu() {
    document.getElementById("menu-panel").classList.add("open");
    document.getElementById("menu-overlay").classList.add("open");
}

function closeMenu() {
    document.getElementById("menu-panel").classList.remove("open");
    document.getElementById("menu-overlay").classList.remove("open");
}

function openSettings() {
    fillSettingsForm();
    closeMenu();
    document.getElementById("settings-panel").classList.add("open");
    document.getElementById("settings-overlay").classList.add("open");
}

function closeSettings() {
    document.getElementById("settings-panel").classList.remove("open");
    document.getElementById("settings-overlay").classList.remove("open");
}

function openSearch() {
    closeMenu();
    document.getElementById("search-panel").classList.add("open");
    document.getElementById("search-overlay").classList.add("open");
    document.getElementById("search-input").focus();
}

function closeSearch() {
    document.getElementById("search-panel").classList.remove("open");
    document.getElementById("search-overlay").classList.remove("open");
}

function getSearchText() {
    return getCurrentContentFromPages();
}

function findNext(reverse = false) {
    const keyword = document.getElementById("search-input").value;
    const status = document.getElementById("search-status");

    if (!keyword) {
        status.textContent = "検索文字列を入力してください";
        return;
    }

    const content = getSearchText();
    let index;

    if (reverse) {
        index = content.lastIndexOf(keyword, currentSearchPosition - 1);

        if (index < 0) {
            index = content.lastIndexOf(keyword);
        }
    } else {
        index = content.indexOf(keyword, currentSearchPosition);

        if (index < 0) {
            index = content.indexOf(keyword);
        }
    }

    if (index < 0) {
        status.textContent = "見つかりません";
        return;
    }

    currentSearchPosition = reverse
        ? index
        : index + keyword.length;

    focusEditorAt(index);

    const textareas = [
        ...editorPages.querySelectorAll(".page-editor")
    ];

    let remaining = index;

    for (const textarea of textareas) {
        const length = textarea.value.length;

        if (remaining <= length) {
            textarea.focus();
            textarea.setSelectionRange(
                remaining,
                remaining + keyword.length
            );
            break;
        }

        remaining -= length;
    }

    status.textContent = "見つかりました";
}

function replaceOne() {
    const keyword = document.getElementById("search-input").value;
    const replacement = document.getElementById("replace-input").value;
    const status = document.getElementById("search-status");

    if (!keyword) {
        status.textContent = "検索文字列を入力してください";
        return;
    }

    const active = document.activeElement;

    if (
        !active?.classList?.contains("page-editor") ||
        active.value.slice(active.selectionStart, active.selectionEnd) !== keyword
    ) {
        findNext();
        return;
    }

    const start = active.selectionStart;
    const end = active.selectionEnd;

    active.setRangeText(replacement, start, end, "end");

    const allText = getCurrentContentFromPages();
    const pageIndex = Number(active.dataset.pageIndex);

    let offset = start;

    for (let i = 0; i < pageIndex; i++) {
        offset += editorPages.querySelectorAll(".page-editor")[i].value.length;
    }

    currentContent = allText;
    renderPages(offset + replacement.length);
    scheduleSave();

    status.textContent = "1件置換しました";
}

function replaceAll() {
    const keyword = document.getElementById("search-input").value;
    const replacement = document.getElementById("replace-input").value;
    const status = document.getElementById("search-status");

    if (!keyword) {
        status.textContent = "検索文字列を入力してください";
        return;
    }

    const content = getCurrentContentFromPages();
    const matches = content.split(keyword).length - 1;

    if (matches === 0) {
        status.textContent = "見つかりません";
        return;
    }

    currentContent = content.split(keyword).join(replacement);
    renderPages();
    scheduleSave();

    status.textContent = `${matches}件置換しました`;
}

function exportSettings() {
    if (currentDocumentId === null) return;

    const data = {
        format: "wintersweater-settings",
        version: 1,
        settings: currentSettings,
    };

    const blob = new Blob(
        [JSON.stringify(data, null, 2)],
        { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "wintersweater-settings.json";
    link.click();

    URL.revokeObjectURL(url);
}

async function importSettings(file) {
    if (!file) return;

    try {
        const text = await file.text();
        const data = JSON.parse(text);

        const imported = data.settings || data;

        const allowed = [
            "paper",
            "charsPerLine",
            "linesPerPage",
            "marginTop",
            "marginBottom",
            "marginLeft",
            "marginRight",
            "fontSize",
            "showPageNumber",
            "pageNumberStart",
        ];

        const settings = { ...DEFAULT_SETTINGS };

        for (const key of allowed) {
            if (Object.hasOwn(imported, key)) {
                settings[key] = imported[key];
            }
        }

        if (!PAPER_SIZES[settings.paper]) {
            throw new Error("用紙サイズが不正です");
        }

        currentSettings = settings;
        fillSettingsForm();
        renderPages();
        scheduleSave();
        closeMenu();

        alert("設定を読み込みました");
    } catch (error) {
        alert(`設定ファイルを読み込めませんでした: ${error.message}`);
    }
}

function printDocument() {
    window.print();
}

editorPages.addEventListener("input", () => {
    currentContent = getCurrentContentFromPages();
    updateCharacterCount();
    scheduleSave();
});

titleInput.addEventListener("input", scheduleSave);

document.getElementById("save-button")
    .addEventListener("click", saveDocument);

document.getElementById("new-button")
    .addEventListener("click", createDocument);

document.getElementById("menu-button")
    .addEventListener("click", openMenu);

document.getElementById("close-menu-button")
    .addEventListener("click", closeMenu);

document.getElementById("menu-overlay")
    .addEventListener("click", closeMenu);

document.getElementById("open-settings-button")
    .addEventListener("click", openSettings);

document.getElementById("close-settings-button")
    .addEventListener("click", closeSettings);

document.getElementById("settings-overlay")
    .addEventListener("click", closeSettings);

document.getElementById("apply-settings-button")
    .addEventListener("click", applySettings);

document.getElementById("open-search-button")
    .addEventListener("click", openSearch);

document.getElementById("close-search-button")
    .addEventListener("click", closeSearch);

document.getElementById("search-overlay")
    .addEventListener("click", closeSearch);

document.getElementById("find-next")
    .addEventListener("click", () => findNext());

document.getElementById("find-prev")
    .addEventListener("click", () => findNext(true));

document.getElementById("replace-one")
    .addEventListener("click", replaceOne);

document.getElementById("replace-all")
    .addEventListener("click", replaceAll);

document.getElementById("export-settings-button")
    .addEventListener("click", exportSettings);

document.getElementById("import-settings-file")
    .addEventListener("change", event => {
        importSettings(event.target.files[0]);
        event.target.value = "";
    });

document.getElementById("print-button")
    .addEventListener("click", () => {
        closeMenu();
        printDocument();
    });

document.addEventListener("keydown", event => {
    const key = event.key.toLowerCase();

    if ((event.ctrlKey || event.metaKey) && key === "s") {
        event.preventDefault();
        saveDocument();
    }

    if ((event.ctrlKey || event.metaKey) && key === "f") {
        event.preventDefault();
        openSearch();
    }

    if (event.key === "Escape") {
        closeMenu();
        closeSettings();
        closeSearch();
    }
});

async function initialize() {
    await loadDocuments();

    const documents = await request("/api/documents");

    if (documents.length > 0) {
        await openDocument(documents[0].id);
    } else {
        await createDocument();
    }
}

initialize().catch(error => {
    console.error(error);
    setSaveStatus("読み込み失敗");
});