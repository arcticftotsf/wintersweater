export const elements = {
    editorPages: document.getElementById("pages"),
    titleInput: document.getElementById("document-title"),
    documentList: document.getElementById("document-list"),
    saveStatus: document.getElementById("save-status"),
    characterCount: document.getElementById("character-count"),
    pageInfo: document.getElementById("page-info"),
};

// export const API_BASE_URL = "http://127.0.0.1:8000";

const apiConfig = await fetch("/config/api.json").then(response => {
    if (!response.ok) {
        throw new Error("API設定ファイルを読み込めませんでした");
    }
    return response.json();
});

const isTauri = Boolean(window.__TAURI_INTERNALS__);

export const API_BASE_URL = isTauri
    ? apiConfig.desktop.baseUrl
    : apiConfig.development.baseUrl;


export const DEFAULT_SETTINGS = {
    paper: "A4",
    charsPerLine: 40,
    linesPerPage: 30,
    marginTop: 25.4,
    marginBottom: 25.4,
    marginLeft: 20,
    marginRight: 20,
    fontSize: 10.5,
    showPageNumber: true,
    pageNumberStart: 1,
};

export const PAPER_SIZES = {
    A4: { width: 210, height: 297 },
    B5: { width: 182, height: 257 },
    A5: { width: 148, height: 210 },
};

export const state = {
    currentDocumentId: null,
    currentContent: "",
    currentSettings: { ...DEFAULT_SETTINGS },
    isDirty: false,
    isSaving: false,
    saveAgain: false,
    currentSearchPosition: 0,
};