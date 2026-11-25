import { elements, state, PAPER_SIZES } from "./state.js";

let isComposing = false;
let pendingRender = false;
let compositionRenderPending = false;

export function getPageSize() {
    return PAPER_SIZES[state.currentSettings.paper] || PAPER_SIZES.A4;
}

export function getPageCapacity() {
    const chars = Math.max(1, Number(state.currentSettings.charsPerLine) || 40);
    const lines = Math.max(1, Number(state.currentSettings.linesPerPage) || 30);
    return chars * lines;
}

export function splitIntoPages(content) {
    const characters = [...content];
    const capacity = getPageCapacity();
    const pages = [];

    for (let i = 0; i < characters.length; i += capacity) {
        pages.push(characters.slice(i, i + capacity).join(""));
    }

    return pages.length ? pages : [""];
}

export function getPageStyle() {
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

function getEditorText(editor) {
    return editor.innerText
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/\n$/, "");
}

export function getCurrentContentFromPages() {
    return [
        ...elements.editorPages.querySelectorAll(".page-editor"),
    ].map(getEditorText).join("");
}

export function updateCharacterCount() {
    elements.characterCount.textContent =
        `${[...state.currentContent].length.toLocaleString()}文字`;

    const pages = elements.editorPages.querySelectorAll(".page");
    elements.pageInfo.textContent = `${pages.length} ページ`;
}

function getSelectionOffset(editor) {
    const selection = window.getSelection();

    if (!selection || !selection.rangeCount) return 0;

    const range = selection.getRangeAt(0);

    if (!editor.contains(range.startContainer)) return 0;

    const before = range.cloneRange();
    before.selectNodeContents(editor);
    before.setEnd(range.startContainer, range.startOffset);

    const temp = document.createElement("div");
    temp.appendChild(before.cloneContents());

    const text = temp.innerText
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/\n$/, "");

    return [...text].length;
}

function getGlobalSelectionOffset(editor) {
    const editors = [
        ...elements.editorPages.querySelectorAll(".page-editor"),
    ];

    let offset = 0;

    for (const item of editors) {
        if (item === editor) {
            return offset + getSelectionOffset(editor);
        }

        offset += [...getEditorText(item)].length;
    }

    return offset;
}

export function selectAllText() {
    const editors = [
        ...elements.editorPages.querySelectorAll(".page-editor"),
    ];

    if (editors.length === 0) return;

    const first = editors[0];
    const last = editors[editors.length - 1];

    first.focus();

    const range = document.createRange();
    range.setStart(first, 0);
    range.setEnd(last, last.childNodes.length);

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}


export function focusEditorAt(globalOffset) {
    const editors = [
        ...elements.editorPages.querySelectorAll(".page-editor"),
    ];

    let remaining = Math.max(0, globalOffset);

    for (let i = 0; i < editors.length; i++) {
        const editor = editors[i];
        const text = getEditorText(editor);
        const length = [...text].length;

        if (remaining <= length || i === editors.length - 1) {
            const target = Math.min(remaining, length);

            editor.focus();

            const paragraphs = [...editor.children];
            let position = 0;

            for (let p = 0; p < paragraphs.length; p++) {
                const paragraph = paragraphs[p];
                const nodes = [];

                const walker = document.createTreeWalker(
                    paragraph,
                    NodeFilter.SHOW_TEXT
                );

                let node;

                while ((node = walker.nextNode())) {
                    nodes.push(node);
                }

                const paragraphLength = nodes.reduce(
                    (sum, item) => sum + [...item.textContent].length,
                    0
                );

                if (target <= position + paragraphLength) {
                    let local = target - position;

                    for (const current of nodes) {
                        const chars = [...current.textContent];

                        if (local <= chars.length) {
                            const utf16 = chars
                                .slice(0, local)
                                .join("")
                                .length;

                            const range = document.createRange();
                            range.setStart(current, utf16);
                            range.collapse(true);

                            const selection = window.getSelection();
                            selection.removeAllRanges();
                            selection.addRange(range);
                            return;
                        }

                        local -= chars.length;
                    }

                    const range = document.createRange();
                    range.selectNodeContents(paragraph);
                    range.collapse(false);

                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(range);
                    return;
                }

                position += paragraphLength;

                if (p < paragraphs.length - 1) {
                    if (target === position) {
                        const next = paragraphs[p + 1];
                        const range = document.createRange();

                        range.setStart(next, 0);
                        range.collapse(true);

                        const selection = window.getSelection();
                        selection.removeAllRanges();
                        selection.addRange(range);
                        return;
                    }

                    position++;
                }
            }

            const range = document.createRange();
            range.selectNodeContents(editor);
            range.collapse(false);

            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            return;
        }

        remaining -= length;
    }
}

// function handleEditorInput(event) {
//     const editor = event.currentTarget;

//     state.currentContent = getCurrentContentFromPages();
//     updateCharacterCount();

//     const pages = splitIntoPages(state.currentContent);
//     const currentEditors = [
//         ...elements.editorPages.querySelectorAll(".page-editor"),
//     ];

//     const needsRender =
//         pages.length !== currentEditors.length ||
//         currentEditors.some(
//             item => [...getEditorText(item)].length > getPageCapacity()
//         );

//     if (needsRender) {
//         pendingRender = true;
//     }

//     document.dispatchEvent(
//         new CustomEvent("editor-content-changed")
//     );
// }

function handleEditorInput(event) {
    const editor = event.currentTarget;

    state.currentContent = getCurrentContentFromPages();
    updateCharacterCount();

    const pages = splitIntoPages(state.currentContent);
    const currentEditors = [
        ...elements.editorPages.querySelectorAll(".page-editor"),
    ];

    const requiredPageCount = pages.length;
    const currentPageCount = currentEditors.length;

    // 入力中は既存のエディタDOMを再構築しない
    if (requiredPageCount > currentPageCount) {
        pendingRender = true;
    } else if (requiredPageCount < currentPageCount) {
        pendingRender = true;
    }

    document.dispatchEvent(
        new CustomEvent("editor-content-changed")
    );
}


function handleCompositionStart() {
    isComposing = true;
}

function handleCompositionEnd(event) {
    isComposing = false;

    state.currentContent = getCurrentContentFromPages();
    updateCharacterCount();

    document.dispatchEvent(
        new CustomEvent("editor-content-changed")
    );
}

function handleEditorKeydown(event) {
    const editor = event.currentTarget;
    const pageIndex = Number(editor.dataset.pageIndex);
    const selection = window.getSelection();

    if (!selection || !selection.isCollapsed) return;

    const editors = [
        ...elements.editorPages.querySelectorAll(".page-editor"),
    ];

    if (event.key === "ArrowLeft" && pageIndex > 0) {
        const offset = getSelectionOffset(editor);

        if (offset === 0) {
            event.preventDefault();
            focusEditorAt(
                editors.slice(0, pageIndex)
                    .reduce((sum, item) => sum + [...getEditorText(item)].length, 0)
            );
        }
    }

    if (event.key === "ArrowRight" && pageIndex < editors.length - 1) {
        const offset = getSelectionOffset(editor);
        const length = [...getEditorText(editor)].length;

        if (offset === length) {
            event.preventDefault();

            const globalOffset = editors
                .slice(0, pageIndex + 1)
                .reduce((sum, item) => sum + [...getEditorText(item)].length, 0);

            focusEditorAt(globalOffset);
        }
    }
}

// function handleEditorKeyup(event) {
//     if (!pendingRender || isComposing) return;

//     const editor = event.currentTarget;

//     requestAnimationFrame(() => {
//         if (isComposing || !pendingRender) return;

//         const offset = getGlobalSelectionOffset(editor);
//         pendingRender = false;
//         state.currentContent = getCurrentContentFromPages();
//         renderPages(offset);
//     });
// }

function handlePaste(event) {
    event.preventDefault();

    const text = event.clipboardData?.getData("text/plain") ?? "";
    document.execCommand("insertText", false, text);
}

export function renderPages(focusOffset = null) {

    elements.editorPages.removeEventListener(
        "focusout",
        handleEditorPagesFocusOut
    );
    elements.editorPages.addEventListener(
        "focusout",
        handleEditorPagesFocusOut
    );

    const hadEditorFocus =
        document.activeElement?.classList?.contains("page-editor");

    const pages = splitIntoPages(state.currentContent);
    const allCharacters = [...state.currentContent];

    elements.editorPages.replaceChildren();
    elements.editorPages.appendChild(getPageStyle());

    let globalOffset = 0;

    pages.forEach((pageText, index) => {
        const page = document.createElement("div");
        page.className = "page";

        page.style.setProperty(
            "--margin-top",
            `${state.currentSettings.marginTop}mm`
        );
        page.style.setProperty(
            "--margin-bottom",
            `${state.currentSettings.marginBottom}mm`
        );
        page.style.setProperty(
            "--margin-left",
            `${state.currentSettings.marginLeft}mm`
        );
        page.style.setProperty(
            "--margin-right",
            `${state.currentSettings.marginRight}mm`
        );
        page.style.setProperty(
            "--font-size",
            `${state.currentSettings.fontSize}pt`
        );

        const contentArea = document.createElement("div");
        contentArea.className = "page-content";

        const editor = document.createElement("div");
        editor.className = "page-editor";
        editor.contentEditable = "true";
        editor.setAttribute("role", "textbox");
        editor.setAttribute("aria-multiline", "true");
        editor.setAttribute("aria-label", `${index + 1}ページ目の本文`);
        editor.spellcheck = false;
        editor.dataset.pageIndex = String(index);

        const paragraphs = pageText.split("\n");

        paragraphs.forEach((paragraphText, paragraphIndex) => {
            const paragraph = document.createElement("div");
            paragraph.className = "novel-paragraph";

            // ページ先頭が前ページから続く段落か判定する
            const isContinuation =
                paragraphIndex === 0 &&
                globalOffset > 0 &&
                allCharacters[globalOffset - 1] !== "\n";

            // 会話文は字下げしない
            const isDialogue =
                paragraphText.startsWith("「") ||
                paragraphText.startsWith("『");

            // 空行も字下げしない
            const isEmpty = paragraphText.length === 0;

            if (isContinuation || isDialogue || isEmpty) {
                paragraph.classList.add("no-indent");
            }

            paragraph.textContent = paragraphText;
            editor.appendChild(paragraph);
        });

        editor.addEventListener("input", handleEditorInput);
        editor.addEventListener("keydown", handleEditorKeydown);
        // editor.addEventListener("keyup", handleEditorKeyup);
        editor.addEventListener("compositionstart", handleCompositionStart);
        editor.addEventListener("compositionend", handleCompositionEnd);
        editor.addEventListener("paste", handlePaste);

        contentArea.appendChild(editor);
        page.appendChild(contentArea);

        if (state.currentSettings.showPageNumber) {
            const pageNumber = document.createElement("div");
            pageNumber.className = "page-number";
            pageNumber.textContent =
                String(
                    Number(state.currentSettings.pageNumberStart) + index
                );

            page.appendChild(pageNumber);
        }

        elements.editorPages.appendChild(page);

        // 次ページの開始位置をコードポイント単位で更新
        globalOffset += [...pageText].length;
    });

    updateCharacterCount();

    if (focusOffset !== null || hadEditorFocus) {
        focusEditorAt(focusOffset ?? globalOffset);
    }
}

function handleEditorPagesFocusOut(event) {
    if (!pendingRender) return;

    // 別ページへの移動では再描画しない
    if (event.relatedTarget?.closest?.(".page-editor")) return;

    requestAnimationFrame(() => {
        if (elements.editorPages.contains(document.activeElement)) return;

        if (pendingRender) {
            pendingRender = false;
            state.currentContent = getCurrentContentFromPages();
            renderPages();
        }
    });
}

export function selectTextRange(globalStart, globalEnd) {
    const editors = [
        ...elements.editorPages.querySelectorAll(".page-editor"),
    ];

    let pageOffset = 0;

    function locate(editor, target) {
        const paragraphs = [...editor.children];
        let position = 0;

        for (let p = 0; p < paragraphs.length; p++) {
            const paragraph = paragraphs[p];
            const walker = document.createTreeWalker(
                paragraph,
                NodeFilter.SHOW_TEXT
            );

            const nodes = [];
            let node;

            while ((node = walker.nextNode())) {
                nodes.push(node);
            }

            const length = nodes.reduce(
                (sum, item) => sum + [...item.textContent].length,
                0
            );

            if (target <= position + length) {
                let local = target - position;

                for (const current of nodes) {
                    const chars = [...current.textContent];

                    if (local <= chars.length) {
                        return {
                            node: current,
                            offset: chars.slice(0, local).join("").length,
                        };
                    }

                    local -= chars.length;
                }

                return {
                    node: paragraph,
                    offset: paragraph.childNodes.length,
                };
            }

            position += length;

            if (p < paragraphs.length - 1) {
                position++;
            }
        }

        return null;
    }

    for (const editor of editors) {
        const length = [...getEditorText(editor)].length;

        if (
            globalStart >= pageOffset &&
            globalEnd <= pageOffset + length
        ) {
            const start = locate(editor, globalStart - pageOffset);
            const end = locate(editor, globalEnd - pageOffset);

            if (!start || !end) return false;

            const range = document.createRange();
            range.setStart(start.node, start.offset);
            range.setEnd(end.node, end.offset);

            editor.focus();

            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);

            return true;
        }

        pageOffset += length;
    }

    return false;
}

export function replaceTextRange(globalStart, globalEnd, replacement) {
    const content = getCurrentContentFromPages();

    state.currentContent =
        content.slice(0, globalStart) +
        replacement +
        content.slice(globalEnd);

    renderPages(globalStart + [...replacement].length);

    document.dispatchEvent(
        new CustomEvent("editor-content-changed")
    );

    return true;
}