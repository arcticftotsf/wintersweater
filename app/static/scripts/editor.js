import { elements, state, PAPER_SIZES } from "./state.js";

let isComposing = false;
let pendingRender = false;

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

    const before = document.createRange();
    before.selectNodeContents(editor);
    before.setEnd(range.startContainer, range.startOffset);

    return [...before.toString()].length;
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

            const walker = document.createTreeWalker(
                editor,
                NodeFilter.SHOW_TEXT
            );

            let node;
            let position = 0;

            while ((node = walker.nextNode())) {
                const nodeLength = [...node.textContent].length;

                if (target <= position + nodeLength) {
                    const local = target - position;
                    const utf16Offset = [...node.textContent]
                        .slice(0, local)
                        .join("")
                        .length;

                    const range = document.createRange();
                    range.setStart(node, utf16Offset);
                    range.collapse(true);

                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(range);
                    return;
                }

                position += nodeLength;
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
//     const offset = getGlobalSelectionOffset(editor);

//     state.currentContent = getCurrentContentFromPages();
//     updateCharacterCount();

//     const pages = splitIntoPages(state.currentContent);
//     const currentEditors = [
//         ...elements.editorPages.querySelectorAll(".page-editor"),
//     ];

//     const needsRender =
//         pages.length !== currentEditors.length ||
//         currentEditors.some(item => [...getEditorText(item)].length > getPageCapacity());

//     if (needsRender) {
//         if (isComposing) {
//             pendingRender = true;
//         } else {
//             renderPages(offset);
//         }
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

    const needsRender =
        pages.length !== currentEditors.length ||
        currentEditors.some(
            item => [...getEditorText(item)].length > getPageCapacity()
        );

    if (needsRender) {
        if (isComposing || event.isComposing) {
            pendingRender = true;
        } else {
            const offset = getGlobalSelectionOffset(editor);
            renderPages(offset);
        }
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

    if (pendingRender) {
        pendingRender = false;

        const offset = getGlobalSelectionOffset(event.currentTarget);

        // IME確定直後にDOMを破棄しない
        requestAnimationFrame(() => {
            if (document.activeElement?.classList?.contains("page-editor")) {
                renderPages(offset);
            }
        });
    }

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

function handlePaste(event) {
    event.preventDefault();

    const text = event.clipboardData?.getData("text/plain") ?? "";
    document.execCommand("insertText", false, text);
}

export function renderPages(focusOffset = null) {
    const hadEditorFocus =
        document.activeElement?.classList?.contains("page-editor");

    const pages = splitIntoPages(state.currentContent);

    elements.editorPages.replaceChildren();
    elements.editorPages.appendChild(getPageStyle());

    let globalOffset = 0;

    pages.forEach((pageText, index) => {
        const page = document.createElement("div");
        page.className = "page";

        page.style.setProperty("--margin-top", `${state.currentSettings.marginTop}mm`);
        page.style.setProperty("--margin-bottom", `${state.currentSettings.marginBottom}mm`);
        page.style.setProperty("--margin-left", `${state.currentSettings.marginLeft}mm`);
        page.style.setProperty("--margin-right", `${state.currentSettings.marginRight}mm`);
        page.style.setProperty("--font-size", `${state.currentSettings.fontSize}pt`);

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
        editor.textContent = pageText;

        editor.addEventListener("input", handleEditorInput);
        editor.addEventListener("keydown", handleEditorKeydown);
        editor.addEventListener("compositionstart", handleCompositionStart);
        editor.addEventListener("compositionend", handleCompositionEnd);
        editor.addEventListener("paste", handlePaste);

        contentArea.appendChild(editor);
        page.appendChild(contentArea);

        if (state.currentSettings.showPageNumber) {
            const pageNumber = document.createElement("div");
            pageNumber.className = "page-number";
            pageNumber.textContent =
                String(Number(state.currentSettings.pageNumberStart) + index);

            page.appendChild(pageNumber);
        }

        elements.editorPages.appendChild(page);
        globalOffset += [...pageText].length;
    });

    updateCharacterCount();

    if (focusOffset !== null || hadEditorFocus) {
        focusEditorAt(focusOffset ?? globalOffset);
    }
}

export function selectTextRange(globalStart, globalEnd) {
    const editors = [
        ...elements.editorPages.querySelectorAll(".page-editor"),
    ];

    let offset = 0;

    for (const editor of editors) {
        const text = getEditorText(editor);
        const length = [...text].length;

        if (globalStart >= offset && globalEnd <= offset + length) {
            const localStart = globalStart - offset;
            const localEnd = globalEnd - offset;

            const walker = document.createTreeWalker(
                editor,
                NodeFilter.SHOW_TEXT
            );

            const nodes = [];
            let node;

            while ((node = walker.nextNode())) {
                nodes.push(node);
            }

            const locate = target => {
                let position = 0;

                for (const current of nodes) {
                    const nodeLength = [...current.textContent].length;

                    if (target <= position + nodeLength) {
                        const local = target - position;
                        const utf16 = [...current.textContent]
                            .slice(0, local)
                            .join("")
                            .length;

                        return { node: current, offset: utf16 };
                    }

                    position += nodeLength;
                }

                const last = nodes[nodes.length - 1];

                return last
                    ? { node: last, offset: last.textContent.length }
                    : null;
            };

            const start = locate(localStart);
            const end = locate(localEnd);

            if (!start || !end) return false;

            const range = document.createRange();
            range.setStart(start.node, start.offset);
            range.setEnd(end.node, end.offset);

            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);

            editor.focus();
            return true;
        }

        offset += length;
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