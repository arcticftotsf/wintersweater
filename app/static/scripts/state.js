export const elements = {
    editorPages: document.getElementById("pages"),
    titleInput: document.getElementById("document-title"),
    documentList: document.getElementById("document-list"),
    saveStatus: document.getElementById("save-status"),
    characterCount: document.getElementById("character-count"),
    pageInfo: document.getElementById("page-info"),
};

export const API_BASE_URL = "http://127.0.0.1:8000";

export const DEFAULT_SETTINGS = {
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

export const PAPER_SIZES = {
    A4: { width: 210, height: 297 },
    B5: { width: 182, height: 257 },
    A5: { width: 148, height: 210 },
};

export const state = {
    currentDocumentId: null,
    currentContent: "",
    currentSettings: { ...DEFAULT_SETTINGS },
    saveTimer: null,
    isSaving: false,
    saveAgain: false,
    currentSearchPosition: 0,
};