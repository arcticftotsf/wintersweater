import {
    state,
    DEFAULT_SETTINGS,
    PAPER_SIZES,
} from "./state.js";

import { renderPages } from "./editor.js";

export function fillSettingsForm() {
    const settings = state.currentSettings;

    document.getElementById("setting-paper").value = settings.paper;
    document.getElementById("setting-chars").value = settings.charsPerLine;
    document.getElementById("setting-lines").value = settings.linesPerPage;
    document.getElementById("setting-font-size").value = settings.fontSize;
    document.getElementById("setting-page-start").value = settings.pageNumberStart;

    document.getElementById("setting-margin-top").value = settings.marginTop;
    document.getElementById("setting-margin-bottom").value = settings.marginBottom;
    document.getElementById("setting-margin-left").value = settings.marginLeft;
    document.getElementById("setting-margin-right").value = settings.marginRight;

    document.getElementById("setting-show-page-number").checked =
        settings.showPageNumber;
}

export function readSettingsForm() {
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

export function applySettings() {
    state.currentSettings = readSettingsForm();

    renderPages();

    document.dispatchEvent(
        new CustomEvent("settings-changed")
    );

    closeSettings();
}

export function exportSettings() {
    if (state.currentDocumentId === null) return;

    const data = {
        format: "wintersweater-settings",
        version: 1,
        settings: state.currentSettings,
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

export async function importSettings(file) {
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

        state.currentSettings = settings;

        fillSettingsForm();
        renderPages();

        document.dispatchEvent(
            new CustomEvent("settings-changed")
        );

        closeMenu();
        alert("設定を読み込みました");
    } catch (error) {
        alert(`設定ファイルを読み込めませんでした: ${error.message}`);
    }
}

export function openSettings() {
    fillSettingsForm();
    closeMenu();

    document.getElementById("settings-panel").classList.add("open");
    document.getElementById("settings-overlay").classList.add("open");
}

export function closeSettings() {
    document.getElementById("settings-panel").classList.remove("open");
    document.getElementById("settings-overlay").classList.remove("open");
}

export function closeMenu() {
    document.getElementById("menu-panel").classList.remove("open");
    document.getElementById("menu-overlay").classList.remove("open");
}