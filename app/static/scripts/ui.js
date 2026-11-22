
import { elements } from "./state.js";

import {
    saveDocument,
    createDocument,
    scheduleSave,
    loadTrash,
    emptyTrash,
} from "./documents.js";

import {
    openSettings,
    closeSettings,
    closeMenu,
    applySettings,
    exportSettings,
    importSettings,
} from "./settings.js";

import {
    findNext,
    replaceOne,
    replaceAll,
} from "./search.js";

export function openMenu() {
    document.getElementById("menu-panel").classList.add("open");
    document.getElementById("menu-overlay").classList.add("open");
}

export function openSearch() {
    closeMenu();

    document.getElementById("search-panel").classList.add("open");
    document.getElementById("search-overlay").classList.add("open");
    document.getElementById("search-input").focus();
}

export function closeSearch() {
    document.getElementById("search-panel").classList.remove("open");
    document.getElementById("search-overlay").classList.remove("open");
}

export async function openTrash() {
    closeMenu();

    document.getElementById("trash-panel").classList.add("open");
    document.getElementById("trash-overlay").classList.add("open");

    try {
        await loadTrash();
    } catch (error) {
        console.error(error);
        alert(`ゴミ箱を読み込めませんでした: ${error.message}`);
    }
}

export function closeTrash() {
    document.getElementById("trash-panel").classList.remove("open");
    document.getElementById("trash-overlay").classList.remove("open");
}

function initializeButtons() {
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
        .addEventListener("click", () => findNext(false));

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
            window.print();
        });

    document.getElementById("open-trash-button")
        .addEventListener("click", openTrash);

    document.getElementById("close-trash-button")
        .addEventListener("click", closeTrash);

    document.getElementById("trash-overlay")
        .addEventListener("click", closeTrash);

    document.getElementById("empty-trash-button")
        .addEventListener("click", emptyTrash);

    elements.titleInput.addEventListener("input", scheduleSave);
}

function initializeShortcuts() {
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
            closeTrash();
        }
    });
}

export function initializeUI() {
    initializeButtons();
    initializeShortcuts();
    initializeVersionDisplay();
}

async function initializeVersionDisplay() {
    const element = document.getElementById("app-version");

    if (!element) return;

    try {
        const response = await fetch("/version.json");

        if (!response.ok) {
            throw new Error("バージョン情報を取得できません");
        }

        const config = await response.json();

        element.textContent = `Version ${config.version}`;
    } catch (error) {
        console.error(error);
        element.textContent = "Version 不明";
    }
}
