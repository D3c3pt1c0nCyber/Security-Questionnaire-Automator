# Security Questionnaire Automator

AI-powered tool for automating security questionnaire workflows with product-scoped answer banks, Jira/Confluence integration, and HECVAT migration.

## Features

- **Chat Assistant** - AI Q&A powered by Claude with Confluence, Jira, and local knowledge base search
- **Batch Processing** - Process entire questionnaire spreadsheets with AI-generated answers
- **HECVAT/SIG Migration** - Migrate answers between framework versions with confidence scoring
- **Product-Scoped Answer Bank** - Answers isolated per product (SafeLMS, Convergence, etc.) with shared policies
- **Jira Integration** - Calendar and kanban views for security questionnaire tickets
- **Import Tool** - Upload past questionnaires and policies to build your knowledge base
- **Multi-Format Support** - Excel, CSV, PDF, Word, PowerPoint, JSON, Text, HTML, XML, RTF

## Live Demo

**https://security-questionnaire-automator.onrender.com**

## Quick Start

### Prerequisites
- Node.js 18+
- Anthropic API key ([console.anthropic.com](https://console.anthropic.com/settings/keys))
- Atlassian credentials (optional, for Jira/Confluence)

### Installation

```bash
git clone https://github.com/D3c3pt1c0nCyber/Security-Questionnaire-Automator.git
cd Security-Questionnaire-Automator/app
npm install
```

### Configure Environment

Create `app/.env`:

```env
ATLASSIAN_BASE=https://your-instance.atlassian.net
ATLASSIAN_EMAIL=your-email@company.com
ATLASSIAN_TOKEN=your-atlassian-api-token
```

### Create Data Directories

```bash
mkdir -p ../data/answer-bank/{categories,policies,products,past-questionnaires,frameworks,clients,imports}
mkdir -p ../data/output
```

### Run

```bash
node server.js
```

Open `http://localhost:3456`

### First-Time Setup

1. **Admin > Authentication** — Enter your Atlassian URL, email, API token, and Jira project key
2. **Admin > Authentication** — Enter your Claude API key
3. **Admin > Products** — Add your products (e.g., SafeLMS, Convergence, TargetSolutions)
4. **Admin > Frameworks** — Add framework versions (HECVAT 4.1.2, SIG Full, etc.)
5. **Import** — Upload existing questionnaires and policy documents to build your answer bank

## Project Structure

```
├── app/
│   ├── server.js              # Express backend (API, AI, file processing)
│   ├── public/
│   │   └── index.html         # Single-file UI (Chat, Batch, Jira, Import, HECVAT, Admin)
│   ├── package.json
│   └── .env                   # Credentials (not committed)
│
├── data/
│   ├── answer-bank/           # Knowledge base (not committed)
│   │   ├── categories/        # Organization-wide Q&A (shared across all products)
│   │   ├── policies/          # Policy documents (shared across all products)
│   │   ├── products/          # Product-specific answers (isolated per product)
│   │   ├── past-questionnaires/
│   │   ├── frameworks/        # Completed HECVAT/SIG files
│   │   ├── clients/
│   │   └── imports/
│   └── output/                # Generated exports
│
└── workflows/
    └── security-questionnaire-workflow.json
```

## How Product Scoping Works

When a product is selected, the AI only sees:
- **Product-specific files** from `products/{name}/` (highest priority)
- **General/shared files** from `categories/` and `policies/` (applies to all products)
- **Product-matched files** from `frameworks/`, `imports/`, etc. (matched by filename)

Files belonging to other products are **excluded entirely** - SafeLMS answers never bleed into Convergence.

## Admin Settings

The Admin panel has six tabs:

| Tab | Description |
|-----|-------------|
| **Authentication** | Atlassian (Confluence + Jira) credentials and Claude API key |
| **Answer Quality** | Default model, confidence threshold, citation and search toggles |
| **Products** | Add/remove products that appear in all dropdowns |
| **Frameworks** | Add/remove framework versions (HECVAT, SIG, custom) |
| **Status** | Live connection status for Server, Confluence, Jira, Answer Bank, Claude API |
| **Answer Bank** | Knowledge base stats (file counts by category) and file browser |

## Technology Stack

- **Backend**: Node.js, Express
- **Frontend**: Vanilla JS (single-file)
- **AI**: Claude API (Anthropic)
- **File Processing**: xlsx, pdf-parse, adm-zip (DOCX/PPTX)
- **Integration**: Atlassian REST API (Jira + Confluence)

## Security

- `.env` files are excluded via `.gitignore`
- API keys are stored in browser `localStorage` and never logged
- Answer bank data stays local and is not committed to the repo
- All uploads are processed server-side in a temp directory
