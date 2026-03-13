# Changelog

All notable changes to the Security Questionnaire Automator are documented here.

---

## [Unreleased] — 2026-03-13

### Bug Fixes & Cleanup — server.js

#### Dead Code Removed (~300 lines)
- **Removed 5 orphaned multi-provider AI functions** — `callClaudeStreamAPI`, `callOpenAIAPI`, `callGeminiAPI`, `callCohereAPI`, `callHuggingFaceAPI` were defined but never called anywhere after `callAIProvider` (the only dispatcher) was removed in a prior cleanup pass.
- **Removed broken `/api/ai/provider` and `/api/ai/providers` route handlers** — both referenced `AI_MODELS` and `aiProviderConfigs` globals that were never defined, meaning these endpoints would have thrown a `ReferenceError` at runtime. The entire "Multi-Provider AI Functions" block (routes + implementations) was dead weight.

#### Unused Parameters Fixed
- **`extractQuestionsFromExcel(filePath, originalName)`** — `originalName` was accepted but never used inside the function body (the workbook is read directly from `filePath`). Removed from the signature and both call sites in the `/api/migrate` route.
- **`labelFile` arrow function in `loadKnowledgeBase`** — defined as `(f) => \`\n--- ${f.file}...\`` but the actual `.map()` calls at the end of the function all used inline identical lambdas. Removed the dead declaration.
- **`category` destructure in `/api/bank/import-file`** — `category` was destructured from `req.body` but never referenced; routing uses the `type` field. Removed from the destructure.

#### Unused Route Parameters Renamed
- Renamed `req` → `_req` in 6 GET route handlers that never access the request object:
  - `GET /api/products`
  - `GET /api/frameworks`
  - `GET /api/jira/status`
  - `GET /api/confluence/status`
  - `GET /api/bank/categories`
  - `GET /api/bank/frameworks`

#### `checkSystemStatus()` Refactored
- Replaced verbose per-service `forEach(['id1','id2'], ...)` loops (updating duplicate DOM IDs across now-removed System Status tab) with a single `setBadge(id, text, cls)` helper.
- Removed the Advanced tab field population (`cfgBankPath`, `cfgOutputPath`, `cfgPort`) that referenced non-existent DOM elements after the Advanced tab was removed.

---

### UI Fixes & Improvements — public/index.html

#### Admin Tab — Dead Space Removed
- **Removed redundant page header** — the "Confluence & Jira Integration" title/description block above the sub-tabs was generic and added ~50px of wasted vertical space before the first interactive element.
- **Removed System Status tab** — duplicated the same Confluence, Jira, and Claude API status rows already present in the Connection Status card on the Authentication tab. The unique rows (Server, Answer Bank) were merged into the Connection Status card.
- **Removed Advanced tab** — contained three disabled/read-only inputs (Answer Bank Path, Output Directory, Server Port) that users cannot edit. Provided no actionable value.
- **Fixed full-width content stretch** — the admin panel's `.bi` container had `max-width:100%` (inline style) which, combined with `align-items:stretch` on the flex parent, caused content to stretch across the entire viewport with no centering. Changed to `max-width:880px`.

#### Admin Tab — Content Not Centered (Bug Fix)
- **Root cause**: `.pn.on.bp { align-items: stretch }` pins flex children to the left edge even when they have `max-width` set, because `align-items:stretch` overrides `margin:0 auto` in a flex column context.
- **Fix**: Added `align-self:center; width:100%` to the admin panel's `.bi` div. `align-self:center` overrides the parent's stretch behavior and centers the block at up to 880px wide, falling back to full-width on narrow screens.

#### Admin Tab — Restructured Sub-Tabs (6 tabs, better organized)
- **Before**: Authentication, Answer Quality, Products, Frameworks *(Connection Status and Local Answer Bank were cards buried inside Authentication)*
- **After**: Authentication | Answer Quality | Products | Frameworks | **Status** | **Answer Bank**
- Connection Status moved to its own **Status** tab — auto-calls `checkSystemStatus()` on tab open.
- Local Answer Bank moved to its own **Answer Bank** tab — auto-calls `refreshBankStats()` on tab open.
- Status and Answer Bank tabs placed last so primary config tabs (Authentication, Quality, Products, Frameworks) are first.

---

## [3bddf1a] — Multi-Format Questionnaire Support

### New Features
- **Format-preserving output** — processed questionnaires are now written back in the same format they were uploaded (Excel → Excel, CSV → CSV, DOCX → DOCX). Previously, all output was Excel regardless of input format.
- **Excel in-place answer writing** — AI-generated answers are written into the existing Response/Answer column (detected by header name pattern) rather than always appending a new column. Only metadata columns (Source, Confidence, Flags) are appended.
- **DOCX support** — question extraction via XML table parsing (`<w:tbl>`, `<w:tr>`, `<w:tc>`); answer writing replaces the response cell content while preserving cell formatting (`<w:tcPr>`).
- **CSV support** — question extraction via XLSX parser; output via `XLSX.utils.sheet_to_csv()`.
- **PDF/TXT/other formats** — text extracted via `pdf-parse` or raw read, then questions extracted by Claude from unstructured text.

### Code Additions (server.js)
- `extractQuestionsFromDocxFile(filePath)` — parses DOCX XML tables to extract Q&A rows
- `extractQuestionsFromText(apiKey, text)` — uses Claude to extract structured questions from plain text
- `writeOutputCsv(answers, outputPath, originalInfo)` — CSV output writer
- `writeOutputDocx(answers, outputPath, originalInfo)` — DOCX XML output writer
- `writeOutputFile(answers, desiredOutputPath, originalInfo, fileType)` — dispatch function routing to the correct writer by file type
- `docxGetCells(rowXml)`, `docxGetCellText(cellXml)`, `docxBuildCell(originalCellXml, text)` — DOCX XML cell helpers
- `stripTags(text)` — strips HTML tags from text (replaces inline regex)
- `bankRelPath(fullPath)` — converts absolute path to bank-relative path (replaces 19 inline `path.relative` calls)
- `buildAnswerLookup(answers)` / `matchAnswer(lookup, ...)` — consolidated answer matching by ID, question text, and row index (replaces 3 duplicate lookup blocks)
- Model constants: `MODEL_OPUS`, `MODEL_SONNET`, `MODEL_HAIKU` — replaces hardcoded model strings

### Bug Fix
- `/api/process` now passes `fileType` from the request body to the output writer, so the downloaded file matches the uploaded format. Previously the UI always sent `.xlsx`.

---

## [7f1516c] — Excel Export Fix

### Bug Fix
- **AI answers overwrote original data** — `writeOutputExcel` always appended a new "AI Answer" column. Fixed with two-pass column detection: strict pattern first (`/^(answer|response|reply|vendor.?response)/i`), then broad fallback. Answers are now written into the existing response column; only Source/Confidence/Flags are appended as new columns.

---

## [896d017] — Download Auth Fix

### Bug Fix
- **File download returned 401** — the `/api/download/:filename` route was incorrectly protected by session authentication middleware. Downloads use a signed filename token, not a session. Exempted the route from session auth.

---

## [af26cb3] — Editable Results Table

### New Feature
- Results table cells are now directly editable inline after batch processing, allowing manual corrections before saving to bank or downloading.

---
