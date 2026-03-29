/**
 * WooCSV Fixer — WooCommerce CSV Repair Engine
 * Runs entirely in the browser. No server needed.
 * MIT License — https://github.com/iamsh1v/woocommerce-csv-fixer
 */

const JUNK_ATTR_VALUES = new Set([
    "packaging", "composition", "generic name", "manufacturer",
    "dosage form", "indication", "country of origin", "equivalent brand",
]);

function slugify(text) {
    return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function isJunkAttrValue(val) {
    return JUNK_ATTR_VALUES.has(val.trim().toLowerCase());
}

function parsePipeValues(val) {
    if (!val) return [];
    return val.split("|").map(v => v.trim()).filter(Boolean);
}

/**
 * Parse CSV text into an array of objects with headers as keys.
 * Handles quoted fields with commas and newlines.
 */
function parseCSV(text) {
    const rows = [];
    let headers = [];
    let current = "";
    let inQuotes = false;
    let fields = [];
    let rowIndex = 0;

    for (let i = 0; i <= text.length; i++) {
        const ch = text[i];

        if (inQuotes) {
            if (ch === '"' && text[i + 1] === '"') {
                current += '"';
                i++;
            } else if (ch === '"') {
                inQuotes = false;
            } else if (ch === undefined) {
                fields.push(current);
                current = "";
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === "," ) {
                fields.push(current);
                current = "";
            } else if (ch === "\n" || ch === "\r" || ch === undefined) {
                if (ch === "\r" && text[i + 1] === "\n") i++;
                fields.push(current);
                current = "";

                if (fields.length > 1 || fields[0] !== "") {
                    if (rowIndex === 0) {
                        headers = fields.map(f => f.trim());
                    } else {
                        const row = {};
                        for (let j = 0; j < headers.length; j++) {
                            row[headers[j]] = fields[j] || "";
                        }
                        rows.push(row);
                    }
                    rowIndex++;
                }
                fields = [];
            } else {
                current += ch;
            }
        }
    }

    return { headers, rows };
}

/**
 * Convert rows back to CSV text.
 */
function toCSV(headers, rows) {
    const escape = (val) => {
        val = String(val ?? "");
        if (val.includes(",") || val.includes('"') || val.includes("\n")) {
            return '"' + val.replace(/"/g, '""') + '"';
        }
        return val;
    };

    let out = headers.map(escape).join(",") + "\n";
    for (const row of rows) {
        out += headers.map(h => escape(row[h])).join(",") + "\n";
    }
    return out;
}

/**
 * Find attribute column groups in the headers.
 */
function findAttrGroups(headers) {
    const groups = [];
    let i = 1;
    while (true) {
        const nameCol = `Attribute ${i} name`;
        const valCol = `Attribute ${i} value(s)`;
        const visCol = `Attribute ${i} visible`;
        const globCol = `Attribute ${i} global`;
        if (headers.includes(nameCol)) {
            groups.push({ name: nameCol, values: valCol, visible: visCol, global: globCol, index: i });
            i++;
        } else break;
    }
    return groups;
}

/**
 * Analyze a WooCommerce CSV and return detected issues.
 */
function analyze(csvText) {
    const { headers, rows } = parseCSV(csvText);
    if (rows.length === 0) return { error: "CSV is empty", issues: [], stats: {} };

    const attrGroups = findAttrGroups(headers);
    const variables = rows.filter(r => r.Type === "variable");
    const variations = rows.filter(r => r.Type === "variation");
    const simples = rows.filter(r => r.Type !== "variable" && r.Type !== "variation");

    const issues = [];
    const stats = {
        total_rows: rows.length,
        variables: variables.length,
        variations: variations.length,
        simples: simples.length,
    };

    // Issue 1: Duplicate SKUs
    let dupSku = 0;
    for (const v of variations) {
        if (v.SKU && v.SKU === v.Parent) dupSku++;
    }
    if (dupSku > 0) issues.push({
        id: "duplicate_sku", label: "Duplicate SKUs", severity: "error",
        description: `${dupSku} variations share their parent's SKU`, count: dupSku,
    });

    // Issue 2: Empty variation attributes
    let emptyAttr = 0;
    for (const v of variations) {
        if (!attrGroups.some(ag => (v[ag.name] || "").trim())) emptyAttr++;
    }
    if (emptyAttr > 0) issues.push({
        id: "empty_variation_attrs", label: "Missing Variation Attributes", severity: "error",
        description: `${emptyAttr} variations have no attribute values`, count: emptyAttr,
    });

    // Issue 7: Junk variation values
    let junkVar = 0;
    for (const v of variations) {
        for (const ag of attrGroups) {
            const val = (v[ag.values] || "").trim();
            if (val && isJunkAttrValue(val)) { junkVar++; break; }
        }
    }
    if (junkVar > 0) issues.push({
        id: "junk_variations", label: "Junk Variations", severity: "error",
        description: `${junkVar} variations have metadata values (Packaging, Composition) instead of real options`, count: junkVar,
    });

    // Issue 8: Junk values in parent attributes
    let junkParent = 0;
    for (const v of variables) {
        for (const ag of attrGroups) {
            const parts = parsePipeValues(v[ag.values]);
            if (parts.some(isJunkAttrValue)) { junkParent++; break; }
        }
    }
    if (junkParent > 0) issues.push({
        id: "junk_parent_attrs", label: "Junk Values in Parent Attributes", severity: "error",
        description: `${junkParent} variable products have metadata mixed into attribute values`, count: junkParent,
    });

    // Issue 3: Misordered variations
    let misordered = 0;
    let lastParent = null;
    for (const r of rows) {
        if (r.Type === "variable") lastParent = r.SKU;
        else if (r.Type === "variation" && r.Parent !== lastParent) misordered++;
    }
    if (misordered > 0) issues.push({
        id: "misorder", label: "Unordered Variations", severity: "warning",
        description: `${misordered} variations not grouped after their parent`, count: misordered,
    });

    // Issue 4: Missing required fields
    let missingFields = 0;
    for (const r of rows) {
        if (!(r["Tax status"] || "").trim()) missingFields++;
        else if (!(r["In stock?"] || "").trim()) missingFields++;
        else if (!(r.Published || "").trim()) missingFields++;
    }
    if (missingFields > 0) issues.push({
        id: "missing_fields", label: "Missing Required Fields", severity: "warning",
        description: `${missingFields} rows missing Tax status, In stock, or Published`, count: missingFields,
    });

    // Issue 5: Variable parents with price
    let parentPrice = variables.filter(r => (r["Regular price"] || "").trim()).length;
    if (parentPrice > 0) issues.push({
        id: "parent_price", label: "Variable Products With Price", severity: "warning",
        description: `${parentPrice} variable products have a price set (should be empty)`, count: parentPrice,
    });

    // Issue 6: Variations with name
    let namedVar = variations.filter(r => (r.Name || "").trim()).length;
    if (namedVar > 0) issues.push({
        id: "variation_name", label: "Variations With Name", severity: "warning",
        description: `${namedVar} variations have a name (should be empty)`, count: namedVar,
    });

    return { issues, stats, headers };
}

/**
 * Fix all detected issues. Returns { csv, summary }.
 */
function fix(csvText) {
    const { headers, rows } = parseCSV(csvText);
    if (rows.length === 0) return { csv: csvText, summary: ["CSV is empty, nothing to fix."] };

    const attrGroups = findAttrGroups(headers);

    // Pre-analyze for summary counts
    const analysis = analyze(csvText);
    const issueCounts = {};
    for (const issue of analysis.issues) issueCounts[issue.id] = issue.count;

    // Fix 7: Remove junk variations
    let junkRemoved = 0;
    let cleanRows = [];
    for (const r of rows) {
        if (r.Type === "variation") {
            let isJunk = false;
            for (const ag of attrGroups) {
                const val = (r[ag.values] || "").trim();
                if (val && isJunkAttrValue(val)) { isJunk = true; break; }
            }
            if (isJunk) { junkRemoved++; continue; }
        }
        cleanRows.push(r);
    }

    // Fix 8: Clean junk from parent attributes
    let junkParentCleaned = 0;
    for (const r of cleanRows) {
        if (r.Type === "variable") {
            for (const ag of attrGroups) {
                const parts = parsePipeValues(r[ag.values]);
                const clean = parts.filter(p => !isJunkAttrValue(p));
                if (clean.length < parts.length) {
                    r[ag.values] = clean.join(" | ");
                    junkParentCleaned++;
                }
            }
        }
    }

    // Build parent map
    const parentMap = {};
    for (const r of cleanRows) {
        if (r.Type === "variable") parentMap[r.SKU] = r;
    }

    // Find variation attribute per parent
    const parentVarAttr = {};
    for (const [sku, row] of Object.entries(parentMap)) {
        for (const ag of attrGroups) {
            const parts = parsePipeValues(row[ag.values]);
            if (parts.length > 1) {
                parentVarAttr[sku] = { group: ag, values: parts, attrName: row[ag.name] };
                break;
            }
        }
    }

    // Fix variations
    const variationCounters = {};
    for (const r of cleanRows) {
        if (r.Type !== "variation") continue;
        const parentSku = r.Parent || "";
        const idx = variationCounters[parentSku] || 0;
        variationCounters[parentSku] = idx + 1;

        // Fix 1: Duplicate SKU
        if (r.SKU === parentSku && parentSku) {
            const info = parentVarAttr[parentSku];
            if (info && idx < info.values.length) {
                r.SKU = `${parentSku}-${slugify(info.values[idx])}`;
            } else {
                r.SKU = `${parentSku}-${idx + 1}`;
            }
        }

        // Fix 2: Empty attributes
        const hasAttr = attrGroups.some(ag => (r[ag.name] || "").trim());
        if (!hasAttr && parentVarAttr[parentSku]) {
            const info = parentVarAttr[parentSku];
            if (idx < info.values.length) {
                r[info.group.name] = info.attrName;
                r[info.group.values] = info.values[idx];
                r[info.group.visible] = "1";
                r[info.group.global] = "0";
            }
        }

        // Fix 6: Clear variation name
        if ((r.Name || "").trim()) r.Name = "";
    }

    // Fix 4: Missing required fields
    let fieldFixes = 0;
    for (const r of cleanRows) {
        if (!(r["Tax status"] || "").trim()) { r["Tax status"] = "taxable"; fieldFixes++; }
        if (!(r["In stock?"] || "").trim()) { r["In stock?"] = "1"; fieldFixes++; }
        if (!(r.Published || "").trim()) { r.Published = "1"; fieldFixes++; }
        if ("Is featured?" in r && !(r["Is featured?"] || "").trim()) r["Is featured?"] = "0";
        if ("Visibility in catalog" in r && !(r["Visibility in catalog"] || "").trim()) r["Visibility in catalog"] = "visible";
    }

    // Fix 5: Clear price on variable parents
    for (const r of cleanRows) {
        if (r.Type === "variable" && (r["Regular price"] || "").trim()) {
            r["Regular price"] = "";
            if ("Sale price" in r) r["Sale price"] = "";
        }
    }

    // Fix 3: Reorder — group variations after parent
    const parentVariations = {};
    for (const r of cleanRows) {
        if (r.Type === "variation") {
            const p = r.Parent || "";
            if (!parentVariations[p]) parentVariations[p] = [];
            parentVariations[p].push(r);
        }
    }

    const ordered = [];
    const seenParents = new Set();
    for (const r of cleanRows) {
        if (r.Type === "variation") continue;
        ordered.push(r);
        if (r.Type === "variable") {
            seenParents.add(r.SKU);
            if (parentVariations[r.SKU]) ordered.push(...parentVariations[r.SKU]);
        }
    }
    for (const [psku, vars] of Object.entries(parentVariations)) {
        if (!seenParents.has(psku)) ordered.push(...vars);
    }

    // Summary
    const summary = [];
    if (junkRemoved) summary.push(`Removed ${junkRemoved} junk variations (Packaging, Composition, etc.)`);
    if (junkParentCleaned) summary.push(`Cleaned junk values from ${junkParentCleaned} parent attributes`);
    if (issueCounts.duplicate_sku) summary.push(`Fixed ${issueCounts.duplicate_sku} duplicate variation SKUs`);
    if (issueCounts.empty_variation_attrs) summary.push(`Fixed ${issueCounts.empty_variation_attrs} empty variation attributes`);
    if (issueCounts.variation_name) summary.push(`Cleared ${issueCounts.variation_name} variation names`);
    if (issueCounts.parent_price) summary.push(`Cleared price on ${issueCounts.parent_price} variable products`);
    if (fieldFixes) summary.push(`Filled ${fieldFixes} missing required fields`);
    summary.push("Reordered variations after their parents");

    if (summary.length === 1 && !junkRemoved && !junkParentCleaned) {
        summary.unshift("No major issues found");
    }

    return { csv: toCSV(headers, ordered), summary };
}

// Export for use in app.js
window.WooFixer = { analyze, fix };
