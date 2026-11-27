import {
    initializeDocuments,
    // scheduleSave,
} from "./scripts/documents.js";

import {
    initializeUI,
} from "./scripts/ui.js";

// アプリケーション初期化
async function initialize() {
    initializeUI();
    await initializeDocuments();

    console.log("Wintersweater initialized");
}

// 初期化実行
initialize().catch(error => {
    console.error("Initialization failed:", error);

    const status = document.getElementById("save-status");

    if (status) {
        status.textContent = "読み込み失敗";
    }
});