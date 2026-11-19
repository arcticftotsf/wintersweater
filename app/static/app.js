const editor = document.getElementById("editor");
const titleInput = document.getElementById("document-title");
const documentList = document.getElementById("document-list");
const saveStatus = document.getElementById("save-status");
const characterCount = document.getElementById("character-count");

let currentDocumentId = null;
let saveTimer = null;

async function request(url, options = {}) {
    const response = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });

    if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
    }

    return response.json();
}

function updateCharacterCount() {
    characterCount.textContent =
        `${[...editor.value].length.toLocaleString()}文字`;
}

function setSaveStatus(message) {
    saveStatus.textContent = message;
}

async function loadDocuments() {
    const documents = await request("/api/documents");

    documentList.innerHTML = "";

    documents.forEach((doc) => {
        const li = document.createElement("li");
        li.textContent = doc.title;
        li.classList.toggle("active", doc.id === currentDocumentId);

        li.addEventListener("click", () => openDocument(doc.id));

        documentList.appendChild(li);
    });
}

async function openDocument(id) {
    const doc = await request(`/api/documents/${id}`);

    currentDocumentId = doc.id;
    titleInput.value = doc.title;
    editor.value = doc.content;

    updateCharacterCount();
    setSaveStatus("保存済み");

    await loadDocuments();
}

async function saveDocument() {
    if (currentDocumentId === null) return;

    setSaveStatus("保存中...");

    try {
        await request(`/api/documents/${currentDocumentId}`, {
            method: "PUT",
            body: JSON.stringify({
                title: titleInput.value || "無題",
                content: editor.value,
            }),
        });

        setSaveStatus("保存済み");
        await loadDocuments();
    } catch (error) {
        console.error(error);
        setSaveStatus("保存失敗");
    }
}

async function createDocument() {
    const doc = await request("/api/documents", {
        method: "POST",
        body: JSON.stringify({ title: "新しい原稿" }),
    });

    await openDocument(doc.id);
    editor.focus();
}

function scheduleSave() {
    setSaveStatus("未保存");

    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDocument, 1500);
}

editor.addEventListener("input", () => {
    updateCharacterCount();
    scheduleSave();
});

titleInput.addEventListener("input", scheduleSave);

document.getElementById("save-button")
    .addEventListener("click", saveDocument);

document.getElementById("new-button")
    .addEventListener("click", createDocument);

async function initialize() {
    await loadDocuments();

    const documents = await request("/api/documents");

    if (documents.length > 0) {
        await openDocument(documents[0].id);
    } else {
        await createDocument();
    }
}

initialize().catch(console.error);

const searchInput = document.getElementById("search-input");
const replaceInput = document.getElementById("replace-input");
const searchStatus = document.getElementById("search-status");

function findNext(reverse = false) {
    const keyword = searchInput.value;

    if (!keyword) {
        searchStatus.textContent = "検索文字列を入力してください";
        return false;
    }

    const content = editor.value;
    const start = reverse
        ? editor.selectionStart - 1
        : editor.selectionEnd;

    let index;

    if (reverse) {
        index = content.lastIndexOf(keyword, start);
        if (index === -1) {
            index = content.lastIndexOf(keyword);
        }
    } else {
        index = content.indexOf(keyword, start);
        if (index === -1) {
            index = content.indexOf(keyword);
        }
    }

    if (index === -1) {
        searchStatus.textContent = "見つかりません";
        return false;
    }

    editor.focus();
    editor.setSelectionRange(index, index + keyword.length);

    searchStatus.textContent = "見つかりました";
    return true;
}

document.getElementById("find-next")
    .addEventListener("click", () => findNext());

document.getElementById("find-prev")
    .addEventListener("click", () => findNext(true));

document.getElementById("replace-one")
    .addEventListener("click", () => {
        const keyword = searchInput.value;

        if (!keyword) return;

        const selected = editor.value.slice(
            editor.selectionStart,
            editor.selectionEnd
        );

        if (selected !== keyword) {
            if (!findNext()) return;
        }

        const start = editor.selectionStart;
        const end = editor.selectionEnd;

        editor.setRangeText(
            replaceInput.value,
            start,
            end,
            "end"
        );

        updateCharacterCount();
        scheduleSave();
        findNext();
    });

document.getElementById("replace-all")
    .addEventListener("click", () => {
        const keyword = searchInput.value;

        if (!keyword) return;

        const matches = editor.value.split(keyword).length - 1;

        if (matches === 0) {
            searchStatus.textContent = "見つかりません";
            return;
        }

        editor.value = editor.value.split(keyword)
            .join(replaceInput.value);

        updateCharacterCount();
        scheduleSave();

        searchStatus.textContent = `${matches}件置換しました`;
    });

searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        findNext(event.shiftKey);
    }
});

// Keyboard shortcuts
document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();

    if ((event.ctrlKey || event.metaKey) && key === "s") {
        event.preventDefault();
        saveDocument();
    }

    if ((event.ctrlKey || event.metaKey) && key === "f") {
        event.preventDefault();
        searchInput.focus();
        searchInput.select();
    }

    if (event.key === "Escape") {
        if (document.activeElement === searchInput ||
            document.activeElement === replaceInput) {
            searchInput.value = "";
            replaceInput.value = "";
            searchStatus.textContent = "";
            editor.focus();
        }
    }
});