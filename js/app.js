let currentCSVText = null;
let currentFileName = null;

function show(id) { document.getElementById(id).style.display = ""; }
function hide(id) { document.getElementById(id).style.display = "none"; }

function showError(msg) {
    hide("loading");
    document.getElementById("errorText").textContent = msg;
    show("error");
}

function resetAll() {
    hide("error"); hide("loading"); hide("results"); hide("success");
    show("uploadSection");
    currentCSVText = null;
    currentFileName = null;
    document.getElementById("fileInput").value = "";
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

// Drag & drop
const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");

dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("dragover"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".csv")) {
        handleFile(file);
    } else {
        showError("Please drop a CSV file.");
    }
});
fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

function handleFile(file) {
    currentFileName = file.name;
    hide("error"); hide("results"); hide("success");
    hide("uploadSection");
    show("loading");
    document.getElementById("loadingText").textContent = `Analyzing ${file.name}...`;

    const reader = new FileReader();
    reader.onload = (e) => {
        // Strip BOM
        let text = e.target.result;
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        currentCSVText = text;

        // Use setTimeout so loading UI renders before heavy work
        setTimeout(() => analyzeCSV(text), 50);
    };
    reader.onerror = () => showError("Failed to read file.");
    reader.readAsText(file);
}

function analyzeCSV(text) {
    try {
        const result = window.WooFixer.analyze(text);

        if (result.error) {
            showError(result.error);
            return;
        }

        hide("loading");

        // Stats
        document.getElementById("statTotal").textContent = result.stats.total_rows.toLocaleString();
        document.getElementById("statVars").textContent = result.stats.variables.toLocaleString();
        document.getElementById("statVariations").textContent = result.stats.variations.toLocaleString();
        document.getElementById("statSimple").textContent = result.stats.simples.toLocaleString();

        // File name
        document.getElementById("fileName").textContent = currentFileName;

        // Issues
        const list = document.getElementById("issuesList");
        list.innerHTML = "";

        if (result.issues.length === 0) {
            list.innerHTML = '<div class="no-issues">No issues found — CSV looks clean!</div>';
            document.getElementById("fixBtn").textContent = "Download As-Is";
        } else {
            for (const issue of result.issues) {
                const item = document.createElement("div");
                item.className = "issue-item";
                const iconSvg = issue.severity === "error"
                    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
                    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
                item.innerHTML = `
                    <div class="issue-icon ${issue.severity}">${iconSvg}</div>
                    <div class="issue-text">
                        <div class="issue-label">${escapeHtml(issue.label)}</div>
                        <div class="issue-desc">${escapeHtml(issue.description)}</div>
                    </div>
                    <div class="issue-count">${issue.count.toLocaleString()}</div>
                `;
                list.appendChild(item);
            }
        }

        show("results");
    } catch (e) {
        showError("Failed to analyze CSV: " + e.message);
    }
}

function handleFix() {
    if (!currentCSVText) { showError("No file loaded."); return; }

    const btn = document.getElementById("fixBtn");
    btn.disabled = true;
    btn.textContent = "Fixing...";

    // setTimeout so UI updates
    setTimeout(() => {
        try {
            const { csv, summary } = window.WooFixer.fix(currentCSVText);

            // Trigger download
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            const baseName = currentFileName.replace(/\.csv$/i, "");
            a.href = url;
            a.download = `${baseName}-fixed.csv`;
            a.click();
            URL.revokeObjectURL(url);

            // Show summary
            hide("results");
            const summaryEl = document.getElementById("fixSummary");
            summaryEl.innerHTML = "";
            for (const s of summary) {
                const item = document.createElement("div");
                item.className = "fix-summary-item";
                item.textContent = s;
                summaryEl.appendChild(item);
            }
            show("success");
        } catch (e) {
            showError("Fix failed: " + e.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/></svg> Fix & Download`;
        }
    }, 50);
}

function handleReset() { resetAll(); }
