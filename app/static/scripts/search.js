import { state } from "./state.js";
import {
    getCurrentContentFromPages,
    selectTextRange,
    replaceTextRange,
} from "./editor.js";

function getSearchInput() {
    return document.getElementById("search-input");
}

function getReplaceInput() {
    return document.getElementById("replace-input");
}

function setSearchStatus(message) {
    document.getElementById("search-status").textContent = message;
}

export function findNext(reverse = false) {
    const keyword = getSearchInput().value;

    if (!keyword) {
        setSearchStatus("検索文字列を入力してください");
        return;
    }

    const content = getCurrentContentFromPages();
    let index;

    if (reverse) {
        index = content.lastIndexOf(
            keyword,
            Math.max(0, state.currentSearchPosition - 1)
        );

        if (index < 0) {
            index = content.lastIndexOf(keyword);
        }
    } else {
        index = content.indexOf(keyword, state.currentSearchPosition);

        if (index < 0) {
            index = content.indexOf(keyword);
        }
    }

    if (index < 0) {
        setSearchStatus("見つかりません");
        return;
    }

    state.currentSearchPosition = reverse
        ? index
        : index + keyword.length;

    selectTextRange(index, index + keyword.length);
    setSearchStatus("見つかりました");
}

export function replaceOne() {
    const keyword = getSearchInput().value;
    const replacement = getReplaceInput().value;

    if (!keyword) {
        setSearchStatus("検索文字列を入力してください");
        return;
    }

    const content = getCurrentContentFromPages();
    const index = content.indexOf(keyword, state.currentSearchPosition);

    if (index < 0) {
        setSearchStatus("置換対象が見つかりませんでした");
        state.currentSearchPosition = 0;
        return;
    }

    replaceTextRange(index, index + keyword.length, replacement);

    state.currentSearchPosition = index + replacement.length;
    setSearchStatus("1件置換しました");
}

export function replaceAll() {
    const keyword = getSearchInput().value;
    const replacement = getReplaceInput().value;

    if (!keyword) {
        setSearchStatus("検索文字列を入力してください");
        return;
    }

    const content = getCurrentContentFromPages();
    const matches = content.split(keyword).length - 1;

    if (matches === 0) {
        setSearchStatus("見つかりません");
        return;
    }

    state.currentContent = content.split(keyword).join(replacement);
    state.currentSearchPosition = 0;

    document.dispatchEvent(
        new CustomEvent("editor-content-changed")
    );

    setSearchStatus(`${matches}件置換しました`);
}