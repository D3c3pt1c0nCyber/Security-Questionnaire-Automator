# Changelog

All notable changes to the Security Questionnaire Dashboard are documented here.
Versioning follows **Semantic Versioning**: `MAJOR.MINOR.PATCH`

- **MAJOR** – breaking changes or full architectural overhauls
- **MINOR** – new features, backwards compatible
- **PATCH** – bug fixes, small improvements

---

## [2.0.0] – 2026-03-13

### Major – Background Job System & UX Overhaul

#### New Features
- **Background jobs** – Batch processing and HECVAT migration now run in the background and survive tab navigation; job state tracked server-side in an in-memory `jobs` Map
- **Job badge** – Pulsing badge in sidebar shows number of active jobs; clickable and routes to the relevant tab (Batch or Migration)
- **Task bar visibility** – Batch progress bar only shows when NOT on the Batch tab; hides when you're already viewing that tab
- **Idle timeout** – Auto-logout after 5 minutes of inactivity with a 1-minute countdown warning toast and "Stay logged in" button
- **KB caching** – Knowledge base loaded once and cached for 5 minutes; cache invalidated on any save-to-bank action
- **Per-row Save to Bank** – Each row in batch results has its own Save button to push individual answers to the answer bank
- **Job management endpoints** – `GET /api/jobs`, `GET /api/jobs/:id`, `DELETE /api/jobs/:id`, `DELETE /api/jobs`

#### Bug Fixes
- **Fix: `bankRelPath()` infinite recursion** – Was calling itself recursively; fixed to use `path.relative()`
- **Fix: Model constant self-reference** – `MODEL_OPUS`/`MODEL_SONNET`/`MODEL_HAIKU` were referencing undefined variables; set to correct model ID strings
- **Fix: "Too many requests" during batch** – Rate limiter (was 60/min) hit by job polling; raised to 600/min and polling skips non-404 errors instead of aborting
- **Fix: Stale job badge** – Badge showed "1 job running" with no active job; fixed with 30-minute auto-expiry, cancel-on-reset, and stale localStorage cleanup on page load
- **Fix: Batch progress stuck at 0%** – `pollJob` was updating the DOM but not calling `gtUpdate()`; fixed to keep task bar in sync
- **Fix: Windows server restart** – `pkill` not available on Windows; replaced with `taskkill /PID` command

---

## [1.4.1] – prior

### Patch – Code Cleanup & Admin UI

- Cleaned up dead code
- Fixed admin UI layout
- Minor stability improvements

---

## [1.4.0] – prior

### Minor – Multi-Format Questionnaire Support

- Added support for Excel (`.xlsx`/`.xls`), CSV, PDF, Word (`.docx`), JSON, and plain text uploads
- Original file format preserved in exported output
- DOCX table parsing for structured questionnaires

---

## [1.3.0] – prior

### Minor – Editable Results, Export Fixes & Auth

- Results table is now editable (inline answer editing before export)
- Fixed Excel export to always append AI columns without overwriting original data
- Fixed file download auth error (download endpoint exempted from session auth)
- Improved results table layout

---

## [1.2.0] – prior

### Minor – Authentication & Rate Limiting

- Added optional session-based login with configurable password via `.env`
- Added `express-rate-limit` (60 req/min default)
- Added JQL injection protection for Jira search
- Added Content Security Policy headers

---

## [1.1.0] – prior

### Minor – Product-Scoped Knowledge Base & UI Improvements

- Product-scoped knowledge base (`products/<name>/`) with per-product answer overrides
- Multi-format document parsing (PDF, DOCX, Markdown)
- Reorganized project structure
- Various UI improvements

---

## [1.0.0] – initial

### Initial Release

- Security Questionnaire Automator Dashboard (Node.js + Express)
- Batch processing via Claude API
- HECVAT migration tool
- Chat assistant for one-off questions
- Jira/Confluence integration
- Answer bank (file-based knowledge base)
- Excel output with AI answers
