
import {
    state,
    DEFAULT_SETTINGS,
    PAPER_SIZES,
} from "./state.js";

import { renderPages } from "./editor.js";

const FIELD_RULES = {
    "setting-chars": {
        key: "charsPerLine",
        label: "1行の文字数",
        min: 1,
        max: 200,
        integer: true,
    },
    "setting-lines": {
        key: "linesPerPage",
        label: "1ページの行数",
        min: 1,
        max: 100,
        integer: true,
    },
    "setting-font-size": {
        key: "fontSize",
        label: "文字サイズ",
        min: 6,
        max: 40,
    },
    "setting-page-start": {
        key: "pageNumberStart",
        label: "開始ページ番号",
        min: 1,
        max: 100000,
        integer: true,
    },
    "setting-margin-top": {
        key: "marginTop",
        label: "上余白",
        min: 0,
        max: 100,
    },
    "setting-margin-bottom": {
        key: "marginBottom",
        label: "下余白",
        min: 0,
        max: 100,
    },
    "setting-margin-left": {
        key: "marginLeft",
        label: "左余白",
        min: 0,
        max: 100,
    },
    "setting-margin-right": {
        key: "marginRight",
        label: "右余白",
        min: 0,
        max: 100,
    },
};

function validateNumber(value, rule) {
    if (value.trim() === "") {
        return `${rule.label}を入力してください`;
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return `${rule.label}は数値で入力してください`;
    }

    if (number < rule.min || number > rule.max) {
        return `${rule.label}は${rule.min}～${rule.max}の範囲で入力してください`;
    }

    if (rule.integer && !Number.isInteger(number)) {
        return `${rule.label}は整数で入力してください`;
    }

    return null;
}

function validateSettings(settings) {
    for (const [id, rule] of Object.entries(FIELD_RULES)) {
        const error = validateNumber(
            String(settings[rule.key] ?? ""),
            rule
        );

        if (error) {
            return error;
        }
    }

    if (!PAPER_SIZES[settings.paper]) {
        return "用紙サイズが不正です";
    }

    if (typeof settings.showPageNumber !== "boolean") {
        return "ページ番号の設定が不正です";
    }

    // 本文領域に文字が収まるか確認する（収まらないと文字が重なる）
    const paper = PAPER_SIZES[settings.paper];
    const contentWidth =
        paper.width - settings.marginLeft - settings.marginRight;
    const contentHeight =
        paper.height - settings.marginTop - settings.marginBottom;

    if (contentWidth <= 0 || contentHeight <= 0) {
        return "余白が大きすぎて本文の領域がありません";
    }

    const fontSizeMm = settings.fontSize * 25.4 / 72;
    const maxChars = Math.floor(contentHeight / fontSizeMm);
    const maxLines = Math.floor(contentWidth / fontSizeMm);

    if (settings.charsPerLine > maxChars) {
        return `1行の文字数が多すぎます（この用紙・余白・文字サイズでは最大${maxChars}文字）`;
    }

    if (settings.linesPerPage > maxLines) {
        return `1ページの行数が多すぎます（この用紙・余白・文字サイズでは最大${maxLines}行）`;
    }

    return null;
}

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
    const settings = {
        paper: document.getElementById("setting-paper").value,

        showPageNumber:
            document.getElementById("setting-show-page-number").checked,
    };

    for (const [id, rule] of Object.entries(FIELD_RULES)) {
        settings[rule.key] = Number(
            document.getElementById(id).value
        );
    }

    return settings;
}

export function applySettings() {
    const settings = readSettingsForm();
    const error = validateSettings(settings);

    if (error) {
        alert(error);
        return;
    }

    state.currentSettings = settings;

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

    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importSettings(file) {
    if (!file) return;

    try {
        const text = await file.text();
        const data = JSON.parse(text);
        const imported = data.settings || data;

        if (
            !imported ||
            typeof imported !== "object" ||
            Array.isArray(imported)
        ) {
            throw new Error("設定データの形式が不正です");
        }

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

        const error = validateSettings(settings);

        if (error) {
            throw new Error(error);
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
