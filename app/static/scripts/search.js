import { state } from "./state.js";
import {
    getCurrentContentFromPages,
    selectTextRange,
    replaceTextRange,
    renderPages,
} from "./editor.js";

// 直前に見つけた一致の開始位置（「前へ」で同じ箇所に戻らないために使う）
let lastMatchStart = 0;

function getSearchInput() {
    return document.getElementById("search-input");
}

function getReplaceInput() {
    return document.getElementById("replace-input");
}

function setSearchStatus(message) {
    document.getElementById("search-status").textContent = message;
}

// String#indexOf などはUTF-16単位、エディタ側はコードポイント単位。
// 𠮷や絵文字を含む原稿でずれないよう変換する。
function toCodePointOffset(text, utf16Index) {
    return [...text.slice(0, utf16Index)].length;
}

function codePointLength(text) {
    return [...text].length;
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
        index = lastMatchStart > 0
            ? content.lastIndexOf(keyword, lastMatchStart - 1)
            : -1;

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

    lastMatchStart = index;
    state.currentSearchPosition = index + keyword.length;

    const start = toCodePointOffset(content, index);
    const selected = selectTextRange(
        start,
        start + codePointLength(keyword)
    );

    setSearchStatus(
        selected ? "見つかりました" : "見つかりましたが選択できませんでした"
    );
}

export function replaceOne() {
    const keyword = getSearchInput().value;
    const replacement = getReplaceInput().value;

    if (!keyword) {
        setSearchStatus("検索文字列を入力してください");
        return;
    }

    const content = getCurrentContentFromPages();
    let index = content.indexOf(keyword, state.currentSearchPosition);

    if (index < 0) {
        index = content.indexOf(keyword);
    }

    if (index < 0) {
        setSearchStatus("置換対象が見つかりませんでした");
        state.currentSearchPosition = 0;
        lastMatchStart = 0;
        return;
    }

    const start = toCodePointOffset(content, index);

    replaceTextRange(
        start,
        start + codePointLength(keyword),
        replacement
    );

    lastMatchStart = index;
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
    lastMatchStart = 0;

    // 以前は再描画していなかったため、画面にも保存内容にも反映されなかった
    renderPages();

    document.dispatchEvent(
        new CustomEvent("editor-content-changed")
    );

    setSearchStatus(`${matches}件置換しました`);
}
