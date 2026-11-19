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
