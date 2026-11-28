import { elements, state, PAPER_SIZES } from "./state.js";

let isComposing = false;
let pendingRender = false;
let pageRenderFrame = null;
let outsideClickListenerInstalled = false;
let selectionListenerInstalled = false;
let pageScaleObserver = null;

export function getPageSize() {
    return PAPER_SIZES[state.currentSettings.paper] || PAPER_SIZES.A4;
}

function updatePageScale() {
    const editorArea = document.querySelector(".editor-area");
    const toolbar = document.querySelector(".editor-toolbar");

    if (!editorArea || !toolbar) return;

    const paper = getPageSize();
    const styles = getComputedStyle(editorArea);

    const availableWidth =
        editorArea.clientWidth -
        parseFloat(styles.paddingLeft) -
        parseFloat(styles.paddingRight);

    const availableHeight =
        editorArea.clientHeight -
        parseFloat(styles.paddingTop) -
        parseFloat(styles.paddingBottom) -
        toolbar.offsetHeight -
        parseFloat(getComputedStyle(toolbar).marginBottom);

    const pageWidth = paper.width * 96 / 25.4;
    const pageHeight = paper.height * 96 / 25.4;

    // エリアが非表示・極端に小さいときは計算しない
    if (availableWidth > 0 && availableHeight > 0) {
        const raw = Math.min(
            1,
            availableWidth / pageWidth,
            availableHeight / pageHeight
        );

        // 端数で1px見切れないよう、少し小さめに切り捨てる
        const scale = Math.max(0.1, Math.floor(raw * 1000) / 1000 - 0.002);

        elements.editorPages.style.zoom = String(scale);
    }

    if (!pageScaleObserver && window.ResizeObserver) {
        pageScaleObserver = new ResizeObserver(updatePageScale);
        pageScaleObserver.observe(editorArea);
    }
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
    const settings = state.currentSettings;

    const chars = Math.max(1, Number(settings.charsPerLine) || 40);
    const lines = Math.max(1, Number(settings.linesPerPage) || 30);

    const contentHeight =
        paper.height - settings.marginTop - settings.marginBottom;

    const contentWidth =
        paper.width - settings.marginLeft - settings.marginRight;

    const fontSizeMm = settings.fontSize * 25.4 / 72;

    const charSpacing = chars > 1
        ? (contentHeight - fontSizeMm * chars) / (chars - 1)
        : 0;

    const columnPitch = contentWidth / lines;

    const style = document.createElement("style");

    style.textContent = `
        .page {
            width: ${paper.width}mm;
            height: ${paper.height}mm;
            --margin-top: ${settings.marginTop}mm;
            --margin-bottom: ${settings.marginBottom}mm;
            --margin-left: ${settings.marginLeft}mm;
            --margin-right: ${settings.marginRight}mm;
            --font-size: ${settings.fontSize}pt;
            --char-spacing: ${charSpacing}mm;
            --column-pitch: ${columnPitch}mm;
        }

        @media print {
            @page {
                size: ${paper.width}mm ${paper.height}mm;
                margin: 0;
            }
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
    const total = [...state.currentContent].length;
    const selection = window.getSelection();

    const editors = [
        ...elements.editorPages.querySelectorAll(".page-editor"),
    ];

    let selected = 0;

    if (selection && selection.rangeCount > 0 && editors.length > 0) {
        const range = selection.getRangeAt(0);
        const first = editors[0];
        const last = editors[editors.length - 1];

        const isEntireDocumentSelected =
            range.startContainer === first &&
            range.startOffset === 0 &&
            range.endContainer === last &&
            range.endOffset === last.childNodes.length;

        selected = isEntireDocumentSelected
            ? total
            : [...selection.toString()].length;
    }

    elements.characterCount.textContent =
        selected > 0
            ? `${total.toLocaleString()}文字（選択中：${selected.toLocaleString()}文字）`
            : `${total.toLocaleString()}文字`;

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

            editor.focus({ preventScroll: true });

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

function getGlobalCaretOffset() {
    const selection = window.getSelection();

    if (!selection || !selection.focusNode) return 0;

    const editors = [
        ...elements.editorPages.querySelectorAll(".page-editor"),
    ];

    const focusNode = selection.focusNode;
    const focusOffset = selection.focusOffset;

    let globalOffset = 0;

    for (const editor of editors) {
        if (editor.contains(focusNode) || editor === focusNode) {
            const paragraphs = [...editor.children];
            let localOffset = 0;

            for (let i = 0; i < paragraphs.length; i++) {
                const paragraph = paragraphs[i];

                if (
                    paragraph.contains(focusNode) ||
                    paragraph === focusNode
                ) {
                    const range = document.createRange();
                    range.selectNodeContents(paragraph);

                    try {
                        range.setEnd(focusNode, focusOffset);
                    } catch {
                        return globalOffset + localOffset;
                    }

                    localOffset += [...range.toString()].length;
                    return globalOffset + localOffset;
                }

                localOffset += [...paragraph.textContent].length;

                if (i < paragraphs.length - 1) {
                    localOffset++;
                }
            }

            return globalOffset + localOffset;
        }

        globalOffset += [...getEditorText(editor)].length;
    }

    return globalOffset;
}

// function handleEditorInput(event) {
//     const editor = event.currentTarget;

//     state.currentContent = getCurrentContentFromPages();
//     updateCharacterCount();

//     // if (state.currentDocumentId !== null) {
//     //     setSaveStatus("未保存");
//     // }
//     document.dispatchEvent(
//         new CustomEvent("editor-content-changed")
//     );

//     const requiredPages = splitIntoPages(state.currentContent);

//     const currentPages = [
//         ...elements.editorPages.querySelectorAll(".page-editor"),
//     ].map(getEditorText);

//     // ページ数だけでなく、各ページの文章の配分も比較する
//     pendingRender =
//         requiredPages.length !== currentPages.length ||
//         requiredPages.some(
//             (pageText, index) => pageText !== currentPages[index]
//         );

//     document.dispatchEvent(
//         new CustomEvent("editor-content-changed")
//     );
// }

function updatePendingRender() {
    const requiredPages = splitIntoPages(state.currentContent);

    const currentPages = [
        ...elements.editorPages.querySelectorAll(".page-editor"),
    ].map(getEditorText);

    pendingRender =
        requiredPages.length !== currentPages.length ||
        requiredPages.some(
            (pageText, index) => pageText !== currentPages[index]
        );
}

function schedulePageRender() {
    if (isComposing || !pendingRender) return;

    if (pageRenderFrame !== null) {
        cancelAnimationFrame(pageRenderFrame);
    }

    pageRenderFrame = requestAnimationFrame(() => {
        pageRenderFrame = null;

        if (isComposing || !pendingRender) return;

        const hasEditorFocus =
            elements.editorPages.contains(document.activeElement);

        const caretOffset = hasEditorFocus
            ? getGlobalCaretOffset()
            : null;

        state.currentContent = getCurrentContentFromPages();
        pendingRender = false;

        renderPages(caretOffset);
    });
}


function handleEditorInput(event) {
    state.currentContent = getCurrentContentFromPages();
    updateCharacterCount();

    updatePendingRender();

    document.dispatchEvent(
        new CustomEvent("editor-content-changed")
    );

    if (!isComposing) {
        schedulePageRender();
    }
}


function handleCompositionStart() {
    isComposing = true;
}

function handleCompositionEnd(event) {
    isComposing = false;

    state.currentContent = getCurrentContentFromPages();
    updateCharacterCount();

    updatePendingRender();

    document.dispatchEvent(
        new CustomEvent("editor-content-changed")
    );

    schedulePageRender();
}

function handleEditorKeydown(event) {
    const editor = event.currentTarget;

    // 文書全体を選択する
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        selectAllText();
        return;
    }

    const pageIndex = Number(editor.dataset.pageIndex);
    const selection = window.getSelection();

    if (!selection || !selection.isCollapsed) return;

    const editors = [
        ...elements.editorPages.querySelectorAll(".page-editor"),
    ];

    // 前ページの先頭にいるとき、前ページ末尾へ移動
    if (event.key === "ArrowLeft" && pageIndex > 0) {
        const offset = getSelectionOffset(editor);

        if (offset === 0) {
            event.preventDefault();

            focusEditorAt(
                editors.slice(0, pageIndex)
                    .reduce(
                        (sum, item) => sum + [...getEditorText(item)].length,
                        0
                    )
            );
        }
    }

    // 次ページの末尾にいるとき、次ページ先頭へ移動
    if (event.key === "ArrowRight" && pageIndex < editors.length - 1) {
        const offset = getSelectionOffset(editor);
        const length = [...getEditorText(editor)].length;

        if (offset === length) {
            event.preventDefault();

            const globalOffset = editors
                .slice(0, pageIndex + 1)
                .reduce(
                    (sum, item) => sum + [...getEditorText(item)].length,
                    0
                );

            focusEditorAt(globalOffset);
        }
    }
}

function handlePaste(event) {
    event.preventDefault();

    const text = event.clipboardData?.getData("text/plain") ?? "";
    document.execCommand("insertText", false, text);
}

// キャレットが表示領域の外にあるときだけ、必要最小限スクロールする
function revealCaret() {
    const area = document.querySelector(".editor-area");
    const selection = window.getSelection();

    if (!area || !selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0).cloneRange();
    let rect = range.getClientRects()[0] || range.getBoundingClientRect();

    const isEmptyRect = !rect ||
        (rect.width === 0 && rect.height === 0 &&
         rect.top === 0 && rect.left === 0);

    if (isEmptyRect) {
        const node = range.startContainer;
        const element = node.nodeType === Node.ELEMENT_NODE
            ? node
            : node.parentElement;
        rect = element?.getBoundingClientRect();
    }

    if (!rect) return;

    const bounds = area.getBoundingClientRect();
    const margin = 24;

    if (rect.top < bounds.top + margin) {
        area.scrollTop -= bounds.top + margin - rect.top;
    } else if (rect.bottom > bounds.bottom - margin) {
        area.scrollTop += rect.bottom - (bounds.bottom - margin);
    }

    if (rect.left < bounds.left + margin) {
        area.scrollLeft -= bounds.left + margin - rect.left;
    } else if (rect.right > bounds.right - margin) {
        area.scrollLeft += rect.right - (bounds.right - margin);
    }
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

    if (!outsideClickListenerInstalled) {
    document.addEventListener(
        "pointerdown",
        handleEditorDocumentPointerDown,
        true
    );

    outsideClickListenerInstalled = true;
}

    const hadEditorFocus =
        document.activeElement?.classList?.contains("page-editor");

    // 再描画でDOMが空になるとスクロール位置が0に戻るので退避する
    const scrollArea = document.querySelector(".editor-area");
    const savedScrollTop = scrollArea ? scrollArea.scrollTop : 0;
    const savedScrollLeft = scrollArea ? scrollArea.scrollLeft : 0;

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

        if (!selectionListenerInstalled) {
            document.addEventListener("selectionchange", updateCharacterCount);
            selectionListenerInstalled = true;
        }

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
    updatePageScale();

    // スクロール位置を復元
    if (scrollArea) {
        scrollArea.scrollTop = savedScrollTop;
        scrollArea.scrollLeft = savedScrollLeft;
    }

    if (focusOffset !== null || hadEditorFocus) {
        focusEditorAt(focusOffset ?? globalOffset);
        revealCaret();
    }
}

function handleEditorPagesFocusOut(event) {
    if (!pendingRender) return;

    // 別ページへの移動では再描画しない
    if (event.relatedTarget?.closest?.(".page-editor")) return;

    schedulePageRender();
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

    let startPoint = null;
    let endPoint = null;
    let startEditor = null;

    for (const editor of editors) {
        const length = [...getEditorText(editor)].length;

        if (!startPoint && globalStart < pageOffset + length) {
            startPoint = locate(editor, globalStart - pageOffset);
            startEditor = editor;
        }

        if (
            !endPoint &&
            globalEnd > pageOffset &&
            globalEnd <= pageOffset + length
        ) {
            endPoint = locate(editor, globalEnd - pageOffset);
        }

        pageOffset += length;
    }

    if (!startPoint || !endPoint) return false;

    const range = document.createRange();
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.offset);

    startEditor.focus({ preventScroll: true });

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    revealCaret();

    return true;
}

function handleEditorDocumentPointerDown(event) {
    if (!pendingRender || isComposing) return;

    const activeEditor = document.activeElement;

    if (!activeEditor?.classList?.contains("page-editor")) {
        return;
    }

    const target = event.target?.nodeType === Node.ELEMENT_NODE
        ? event.target
        : event.target?.parentElement;

    // 別ページの本文をクリックした場合は何もしない
    if (target?.closest?.(".page-editor")) {
        return;
    }

    activeEditor.blur();
    schedulePageRender();
}

export function replaceTextRange(globalStart, globalEnd, replacement) {
    // globalStart / globalEnd はコードポイント単位
    const characters = [...getCurrentContentFromPages()];

    state.currentContent =
        characters.slice(0, globalStart).join("") +
        replacement +
        characters.slice(globalEnd).join("");

    renderPages(globalStart + [...replacement].length);

    document.dispatchEvent(
        new CustomEvent("editor-content-changed")
    );

    return true;
}