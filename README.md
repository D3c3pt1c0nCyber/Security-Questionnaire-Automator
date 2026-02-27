# Security Questionnaire Automator

A comprehensive solution for automating security questionnaire workflows using AI-powered matching, Jira integration, and Confluence connectivity.

## Features

### 🎯 Core Capabilities
- **Chat Assistant**: Intelligent Q&A powered by Claude AI with Confluence, Jira, and local knowledge base search
- **Batch Processing**: Process multiple questionnaires at once
- **HECVAT Migration**: Automatically migrate security questionnaire answers between framework versions using AI verification
- **Answer Bank**: Centralized repository of reusable security questionnaire answers
- **Jira Integration**: View and manage security questionnaire tickets with calendar and kanban views
- **Import Tool**: Upload and organize past questionnaires and policies
- **Excel Support**: Full support for Excel, CSV, PDF, Word, JSON, and text files

### 🤖 AI Features
- Question matching and answer migration with confidence scoring
- Intelligent answer adaptation across framework versions
- Confluence and Jira search integration
- Multi-model support (Claude Opus 4, Sonnet 4, Haiku 4.5)

## Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn
- Anthropic API key (Claude)
- Atlassian credentials (Jira/Confluence) - optional

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd "Claude Code"
   ```

2. **Install Dashboard Dependencies**
   ```bash
   cd n8n-workflows/dashboard
   npm install
   ```

3. **Configure Environment**
   ```bash
   cp .env.example .env
   ```

4. **Edit `.env` with your credentials:**
   ```env
   # Atlassian / Jira / Confluence
   ATLASSIAN_BASE=https://your-instance.atlassian.net
   ATLASSIAN_EMAIL=your-email@company.com
   ATLASSIAN_TOKEN=your-atlassian-api-token

   # Server
   PORT=3456
   ```

### Running the Dashboard

From the `n8n-workflows/dashboard` directory:

```bash
npm start
```

Access the dashboard at: `http://localhost:3456`

## Project Structure

```
├── n8n-workflows/
│   ├── dashboard/
│   │   ├── server.js              # Express backend
│   │   ├── public/
│   │   │   └── index.html         # UI (Chat, Batch, Import, HECVAT, Jira)
│   │   ├── package.json
│   │   ├── .env.example
│   │   └── uploads/               # Temporary file uploads
│   ├── output/                    # Generated export files
│   └── security-questionnaire-workflow.json  # n8n workflow definition
│
├── security-questionnaire-bank/   # Answer bank repository
│   └── [Categories and answers]
│
└── README.md
```

## Configuration

### API Keys

**For Claude AI (Required for Chat/Batch/Migration):**
- Get your API key from [Anthropic Console](https://console.anthropic.com)
- Set it in the dashboard UI or via environment variable

**For Jira/Confluence (Optional):**
- Generate API token from Atlassian: https://id.atlassian.com/manage/api-tokens
- Add credentials to `.env` file in dashboard directory

## Usage Guide

### Chat Assistant
- Ask security questions to get instant answers from your knowledge base
- Searches Confluence, Jira, and local answer bank
- Can attach files for context

### HECVAT Migration
1. Select source questionnaire (old framework)
2. Select target questionnaire (new framework)
3. Click "Start Migration"
4. Review AI-matched answers with confidence scores
5. Download migrated Excel file with filled answers

### Answer Bank
- Organize answers by category and product
- Use in chat for quick reference
- Reference in batch processing

### Jira Integration
- View tickets in calendar or kanban view
- Filter by assignee, type, and status
- See ticket details with comments

## Technology Stack

- **Backend**: Node.js + Express
- **Frontend**: Vanilla JavaScript
- **AI**: Anthropic Claude API
- **Database**: File-based (Excel, JSON, Markdown)
- **File Processing**: XLSX, PDF-Parse, Multer
- **Integration**: Jira API, Confluence API

## API Endpoints

### Chat & Migration
- `POST /api/upload` - Upload files
- `POST /api/chat` - Send chat message
- `POST /api/migrate` - Start HECVAT migration (SSE stream)
- `POST /api/migrate/export` - Export migrated questionnaire
- `GET /api/download/:file` - Download generated files

### Jira Integration
- `GET /api/jira/calendar` - Calendar view data
- `GET /api/jira/board` - Kanban board data
- `GET /api/jira/tickets` - List tickets with filters

### Products & Bank
- `GET /api/products` - List products
- `GET /api/bank/categories` - List answer categories
- `POST /api/bank/save` - Save answer to bank

## Security Considerations

⚠️ **Important:**
- Never commit `.env` files or API keys to version control
- The `.gitignore` file is configured to exclude sensitive files
- Always use environment variables for credentials
- Keep API tokens rotated and secure
- For production, use proper secrets management (e.g., AWS Secrets Manager)

## Troubleshooting

### Port Already in Use
```bash
# Check what's using port 3456
lsof -i :3456

# Use a different port
PORT=3457 npm start
```

### Excel File Permissions Error
- Files are automatically made editable during migration
- If you get read-only errors, ensure the output directory has write permissions

### HECVAT Migration Not Working
- Verify Anthropic API key is set
- Check that both source and target files are valid Excel
- Ensure questions are properly formatted with ID and question columns

### Jira Connection Issues
- Verify Atlassian instance URL is correct
- Check API token hasn't expired
- Ensure user has access to the project

## Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## License

[Add your license here]

## Support

For issues, questions, or suggestions, please open a GitHub issue.

---

**Last Updated**: February 2026
**Version**: 1.0.0
