require('dotenv').config();
const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3456;

// Config
const BANK_ROOT = path.resolve(__dirname, '..', '..', 'security-questionnaire-bank');
const OUTPUT_DIR = path.resolve(__dirname, '..', 'output');
const UPLOAD_DIR = path.resolve(__dirname, 'uploads');

// Atlassian Config (from .env)
const ATLASSIAN_BASE = process.env.ATLASSIAN_BASE || '';
const ATLASSIAN_EMAIL = process.env.ATLASSIAN_EMAIL || '';
const ATLASSIAN_TOKEN = process.env.ATLASSIAN_TOKEN || '';
const ATLASSIAN_AUTH = (ATLASSIAN_EMAIL && ATLASSIAN_TOKEN)
  ? Buffer.from(`${ATLASSIAN_EMAIL}:${ATLASSIAN_TOKEN}`).toString('base64')
  : '';

// Ensure dirs exist
[OUTPUT_DIR, UPLOAD_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// In-memory session store for migration target files (for format-preserving export)
const migrationSessions = new Map();

// Multer for file uploads
const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50mb' }));

// --- API Routes ---

// Get available products
app.get('/api/products', (req, res) => {
  const productsDir = path.join(BANK_ROOT, 'products');
  try {
    const entries = fs.readdirSync(productsDir, { withFileTypes: true });
    const products = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('TEMPLATE'))
      .map(e => e.name);
    res.json(products);
  } catch {
    res.json([]);
  }
});

// Get available frameworks
app.get('/api/frameworks', (req, res) => {
  const frameworksDir = path.join(BANK_ROOT, 'frameworks');
  try {
    const entries = fs.readdirSync(frameworksDir, { withFileTypes: true });
    const frameworks = entries.filter(e => e.isDirectory()).map(e => e.name);
    res.json(frameworks);
  } catch {
    res.json([]);
  }
});

// --- File parsing for multiple formats ---

async function parseUploadedFile(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();

  switch (ext) {
    case '.xlsx':
    case '.xls': {
      const workbook = XLSX.readFile(filePath);
      const sheets = workbook.SheetNames.map(name => {
        const sheet = workbook.Sheets[name];
        const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        const columns = data.length > 0 ? Object.keys(data[0]) : [];
        return { name, columns, rowCount: data.length, preview: data.slice(0, 5), data };
      });
      return { type: 'spreadsheet', sheets };
    }

    case '.csv': {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const workbook = XLSX.read(raw, { type: 'string' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      const columns = data.length > 0 ? Object.keys(data[0]) : [];
      return {
        type: 'spreadsheet',
        sheets: [{ name: 'Sheet1', columns, rowCount: data.length, preview: data.slice(0, 5), data }]
      };
    }

    case '.pdf': {
      const pdfParse = require('pdf-parse');
      const buffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(buffer);
      return {
        type: 'document',
        text: pdfData.text,
        pageCount: pdfData.numpages,
        preview: pdfData.text.substring(0, 1000)
      };
    }

    case '.docx': {
      // Basic docx parsing — extract text from XML
      const AdmZip = require('adm-zip');
      try {
        const zip = new AdmZip(filePath);
        const content = zip.readAsText('word/document.xml');
        const text = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        return { type: 'document', text, preview: text.substring(0, 1000) };
      } catch {
        return { type: 'document', text: '', preview: '', error: 'Could not parse .docx file' };
      }
    }

    case '.json': {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      const text = JSON.stringify(parsed, null, 2);
      return { type: 'document', text, preview: text.substring(0, 1000), json: parsed };
    }

    case '.txt':
    case '.md': {
      const text = fs.readFileSync(filePath, 'utf-8');
      return { type: 'document', text, preview: text.substring(0, 1000) };
    }

    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}

// Upload and parse file (any supported format)
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const parsed = await parseUploadedFile(req.file.path, req.file.originalname);
    res.json({
      fileName: req.file.originalname,
      filePath: req.file.path,
      fileType: path.extname(req.file.originalname).toLowerCase(),
      ...parsed
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to parse file: ' + err.message });
  }
});

// Upload multiple files for chat context
app.post('/api/upload-multi', upload.array('files', 10), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const results = [];
  for (const file of req.files) {
    try {
      const parsed = await parseUploadedFile(file.path, file.originalname);
      results.push({
        fileName: file.originalname,
        filePath: file.path,
        fileType: path.extname(file.originalname).toLowerCase(),
        ...parsed
      });
    } catch (err) {
      results.push({
        fileName: file.originalname,
        error: err.message
      });
    }
  }
  res.json(results);
});

// --- Chat endpoint ---
app.post('/api/chat', async (req, res) => {
  const { messages, apiKey, model, product, attachedFiles } = req.body;

  if (!apiKey) return res.status(400).json({ error: 'Anthropic API key required' });

  // Set SSE headers for streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const knowledgeBase = loadKnowledgeBase(product);

    // Build file context from attached files
    let fileContext = '';
    if (attachedFiles && attachedFiles.length > 0) {
      fileContext = '\n\n=== ATTACHED FILES ===\n';
      for (const f of attachedFiles) {
        if (f.text) {
          fileContext += `\n--- ${f.fileName} ---\n${f.text.substring(0, 50000)}\n`;
        } else if (f.sheets) {
          for (const sheet of f.sheets) {
            const workbook = XLSX.readFile(f.filePath);
            const sheetData = workbook.Sheets[sheet.name];
            const rows = XLSX.utils.sheet_to_json(sheetData, { defval: '' });
            fileContext += `\n--- ${f.fileName} [${sheet.name}] (${rows.length} rows) ---\n`;
            fileContext += JSON.stringify(rows.slice(0, 50), null, 2) + '\n';
            if (rows.length > 50) fileContext += `... and ${rows.length - 50} more rows\n`;
          }
        }
      }
    }

    // Extract the latest user message for Confluence/Jira search
    const latestMsg = messages[messages.length - 1]?.content || '';

    // Search Confluence and Jira in parallel based on user's question
    res.write(`data: ${JSON.stringify({ type: 'status', message: 'Searching Confluence & Jira...' })}\n\n`);

    const [confluenceResults, jiraResults] = await Promise.all([
      searchConfluence(latestMsg, 5),
      searchJira(`project = ISC AND text ~ "${latestMsg.replace(/"/g, '\\"').substring(0, 100)}" ORDER BY updated DESC`, 5)
        .catch(() => searchJira('project = ISC ORDER BY updated DESC', 5))
    ]);

    let confluenceContext = '';
    if (confluenceResults.length > 0) {
      confluenceContext = '\n\n=== CONFLUENCE PAGES (Live from lmsportal.atlassian.net) ===\n';
      confluenceContext += confluenceResults.map(r =>
        `\n--- ${r.title} (${r.space}) ---\nURL: ${r.url}\n${r.excerpt}`
      ).join('\n');
    }

    let jiraContext = '';
    if (jiraResults.length > 0) {
      jiraContext = '\n\n=== JIRA TICKETS (ISC Project - Live) ===\n';
      jiraContext += jiraResults.map(r =>
        `\n--- ${r.key}: ${r.summary} ---\nStatus: ${r.status} | Assignee: ${r.assignee} | Priority: ${r.priority}\nUpdated: ${r.updated}\n${r.description}`
      ).join('\n');
    }

    res.write(`data: ${JSON.stringify({ type: 'status', message: `Found ${confluenceResults.length} Confluence pages, ${jiraResults.length} Jira tickets` })}\n\n`);

    // Send source metadata for UI
    res.write(`data: ${JSON.stringify({
      type: 'sources',
      confluence: confluenceResults.map(r => ({ title: r.title, space: r.space, url: r.url })),
      jira: jiraResults.map(r => ({ key: r.key, summary: r.summary, status: r.status })),
      localBank: true
    })}\n\n`);

    const systemPrompt = `You are a security questionnaire expert assistant for Vector Solutions. You have access to FOUR live data sources:

1. LOCAL SECURITY ANSWER BANK - Organization's Q&A pairs organized by 21 security categories (access-control, encryption, incident-response, etc.), product-specific overrides for SafeLMS/TargetSolutions, policy summaries, past completed questionnaires, and framework responses
2. CONFLUENCE - Live pages from lmsportal.atlassian.net with official security policies, product documentation, and procedures
3. JIRA - Live ISC project tickets tracking security questionnaire work for clients
4. ATTACHED FILES - Any files the user uploads for analysis

CRITICAL INSTRUCTIONS FOR ANSWERING:
- When the local answer bank has a Q&A pair that matches (even with placeholder text like "[Your answer here]"), use the QUESTION as a guide for what to answer, then pull the ACTUAL answer from Confluence pages, policies, or your security knowledge
- Product overrides take priority: if answering about SafeLMS, check products/SafeLMS/overrides/ first
- The categories/ folder defines the 21 security domains — use these to categorize and structure your answers
- The glossary defines standard terminology — use it consistently
- Past questionnaires and framework responses contain real answers from previous completions — reuse and adapt them
- When multiple sources have information, COMBINE them into a comprehensive answer

HOW TO ANSWER:
1. Check the local answer bank categories for matching Q&A pairs
2. Check product overrides if a specific product is selected
3. Enrich with Confluence policy content (the most authoritative source)
4. Reference Jira tickets for context on past client questionnaires
5. If no source has a clear answer, draft a professional answer based on industry best practices and mark it as [NEEDS REVIEW]

Your role is to:
- Answer security questionnaire questions comprehensively using ALL available sources
- Help draft, review, and improve questionnaire responses
- Explain security concepts referencing actual company policies
- Analyze uploaded questionnaires and suggest answers from the bank
- Compare responses across frameworks (HECVAT, SIG, custom)
- Reference specific Jira tickets and Confluence pages by name

Be professional, thorough, and precise. Always provide substantive answers, not just references.

RESPONSE STYLE:
- Give DIRECT answers first, then explain. Don't start with "Based on..." or "According to..." — just answer the question.
- If asked "Do you encrypt data at rest?" answer "Yes. We encrypt all data at rest using AES-256..." not "Based on our policies, we..."
- Keep answers concise but complete. No filler text.
- Use bullet points for multi-part answers.
- Bold key facts and values.
- Use markdown headers (##) to organize long answers into sections.
- For questionnaire answers, format as: the direct answer first, then supporting details.
- When listing multiple items, use clean bullet points with bold labels.
- Include specific technical details (versions, algorithms, tools) when available.

IMPORTANT: At the END of every response, you MUST include a "Sources" section listing where your information came from. Use this exact format:

---
**Sources:**
- [Source type] Source name or title
- [Source type] Source name or title

Source types: [Confluence], [Local KB], [Jira], [Policy], [General Knowledge]
Example:
---
**Sources:**
- [Confluence] PS - Personnel Security Policy (FED space)
- [Local KB] categories/encryption.md
- [Jira] ISC-53: Advent Health questionnaire

LOCAL KNOWLEDGE BASE:
${knowledgeBase.substring(0, 100000)}
${confluenceContext}
${jiraContext}
${fileContext}`;

    const selectedModel = model || 'claude-opus-4-20250514';
    const maxTok = selectedModel.includes('haiku') ? 8192 : selectedModel.includes('opus') ? 32000 : 50000;
    const body = JSON.stringify({
      model: selectedModel,
      max_tokens: maxTok,
      stream: true,
      system: systemPrompt,
      messages: messages
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const apiReq = https.request(options, (apiRes) => {
      let buffer = '';

      apiRes.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              res.write('data: {"type":"done"}\n\n');
              return;
            }
            try {
              const event = JSON.parse(data);
              if (event.type === 'content_block_delta' && event.delta?.text) {
                res.write(`data: ${JSON.stringify({ type: 'text', text: event.delta.text })}\n\n`);
              } else if (event.type === 'message_stop') {
                res.write('data: {"type":"done"}\n\n');
              } else if (event.type === 'error') {
                res.write(`data: ${JSON.stringify({ type: 'error', message: event.error?.message || 'API error' })}\n\n`);
              }
            } catch { /* skip malformed */ }
          }
        }
      });

      apiRes.on('end', () => {
        res.write('data: {"type":"done"}\n\n');
        res.end();
      });

      apiRes.on('error', (err) => {
        res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
        res.end();
      });
    });

    apiReq.on('error', (err) => {
      res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
      res.end();
    });

    apiReq.setTimeout(120000, () => {
      apiReq.destroy();
      res.write('data: {"type":"error","message":"Request timed out"}\n\n');
      res.end();
    });

    apiReq.write(body);
    apiReq.end();

  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

// Process questionnaire with Claude API (existing endpoint)
app.post('/api/process', async (req, res) => {
  const { filePath, sheetName, questionColumn, idColumn, product, apiKey } = req.body;

  if (!apiKey) return res.status(400).json({ error: 'Anthropic API key required' });
  if (!filePath) return res.status(400).json({ error: 'No file specified' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  try {
    sendEvent('progress', { step: 'Reading questionnaire...', percent: 5 });
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[sheetName || workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    sendEvent('progress', { step: 'Loading answer bank...', percent: 15 });
    const knowledgeBase = loadKnowledgeBase(product);

    const questions = rows.map((row, idx) => ({
      index: idx,
      id: idColumn ? row[idColumn] : `Q${idx + 1}`,
      question: questionColumn ? row[questionColumn] : Object.values(row)[1] || '',
      originalData: row
    })).filter(q => q.question.trim().length > 0);

    sendEvent('progress', { step: `Found ${questions.length} questions`, percent: 20 });

    const batchSize = 10;
    const allAnswers = [];
    const totalBatches = Math.ceil(questions.length / batchSize);

    for (let i = 0; i < questions.length; i += batchSize) {
      const batchNum = Math.floor(i / batchSize) + 1;
      const batch = questions.slice(i, i + batchSize);
      const percent = 20 + Math.round((batchNum / totalBatches) * 65);

      sendEvent('progress', {
        step: `Processing batch ${batchNum}/${totalBatches} (questions ${i + 1}-${Math.min(i + batchSize, questions.length)})...`,
        percent
      });

      const answers = await callClaudeAPI(apiKey, batch, knowledgeBase, product);
      allAnswers.push(...answers);

      sendEvent('batch_complete', { batchNum, totalBatches, answers });
    }

    sendEvent('progress', { step: 'Writing output file...', percent: 90 });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outputName = `completed-questionnaire-${timestamp}.xlsx`;
    const outputPath = path.join(OUTPUT_DIR, outputName);
    writeOutputExcel(allAnswers, outputPath);

    sendEvent('complete', {
      outputFile: outputName,
      totalQuestions: questions.length,
      highConfidence: allAnswers.filter(a => a.confidence === 'high').length,
      mediumConfidence: allAnswers.filter(a => a.confidence === 'medium').length,
      lowConfidence: allAnswers.filter(a => a.confidence === 'low').length,
      answers: allAnswers
    });

  } catch (err) {
    sendEvent('error', { message: err.message });
  }

  res.end();
});

// Download completed file
app.get('/api/download/:filename', (req, res) => {
  const safeName = path.basename(req.params.filename);
  const filePath = path.join(OUTPUT_DIR, safeName);
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// --- Save processed questionnaire results to answer bank ---
app.post('/api/process/save-to-bank', (req, res) => {
  const { answers, framework, version, product, fileName } = req.body;
  if (!answers || !answers.length) {
    return res.status(400).json({ error: 'No answers to save' });
  }
  try {
    const today = new Date().toISOString().slice(0, 10);
    const prod = product || 'general';
    let targetPath;

    if (framework && version) {
      // Save to framework completed folder
      const fwDir = path.join(BANK_ROOT, 'frameworks', framework, version, 'completed');
      if (!fs.existsSync(fwDir)) fs.mkdirSync(fwDir, { recursive: true });
      targetPath = path.join(fwDir, `${today}-${prod}-${framework}-${version}.md`);
    } else if (framework) {
      // Framework specified but no version
      const fwDir = path.join(BANK_ROOT, 'frameworks', framework);
      // Find first version folder
      const versions = fs.existsSync(fwDir) ? fs.readdirSync(fwDir).filter(f => fs.statSync(path.join(fwDir, f)).isDirectory() && f !== 'templates') : [];
      const verDir = versions.length > 0 ? path.join(fwDir, versions[0], 'completed') : path.join(fwDir, 'completed');
      if (!fs.existsSync(verDir)) fs.mkdirSync(verDir, { recursive: true });
      targetPath = path.join(verDir, `${today}-${prod}-${framework}.md`);
    } else {
      // No framework — save to product questionnaires or past-questionnaires
      if (prod !== 'general') {
        const prodDir = path.join(BANK_ROOT, 'products', prod, 'questionnaires');
        if (!fs.existsSync(prodDir)) fs.mkdirSync(prodDir, { recursive: true });
        targetPath = path.join(prodDir, `${today}-${prod}-questionnaire.md`);
      } else {
        const pqDir = path.join(BANK_ROOT, 'past-questionnaires');
        if (!fs.existsSync(pqDir)) fs.mkdirSync(pqDir, { recursive: true });
        targetPath = path.join(pqDir, `${today}-questionnaire.md`);
      }
    }

    // Format answers as markdown
    const header = `# Completed Questionnaire — ${prod}${framework ? ' (' + framework + (version ? ' ' + version : '') + ')' : ''}\n**Date:** ${today}\n**Source:** ${fileName || 'Batch process'}\n**Total Questions:** ${answers.length}\n\n---\n`;
    const markdown = answers.map(a => {
      return [
        `\n## Q: ${a.question || ''}`,
        `**A:** ${a.answer || ''}`,
        `**Confidence:** ${a.confidence || 'unknown'}`,
        `**Source:** ${a.source || 'Claude AI'}`,
        `**Last Updated:** ${today}`,
        `**Tags:** ${framework || 'questionnaire'}`,
        ''
      ].join('\n');
    }).join('\n');

    fs.writeFileSync(targetPath, header + markdown);

    // Update changelog
    const changelogPath = path.join(BANK_ROOT, 'changelog.md');
    const changeEntry = `\n## ${today} - Batch Process Save\n- **Action:** Saved ${answers.length} answered questions\n- **Product:** ${prod}\n- **Framework:** ${framework || 'Custom'}${version ? ' ' + version : ''}\n- **Destination:** ${path.relative(BANK_ROOT, targetPath).replace(/\\/g, '/')}\n- **Source:** ${fileName || 'Batch process'}\n`;
    if (fs.existsSync(changelogPath)) {
      const existing = fs.readFileSync(changelogPath, 'utf-8');
      fs.writeFileSync(changelogPath, existing + changeEntry);
    }

    res.json({
      success: true,
      path: path.relative(BANK_ROOT, targetPath).replace(/\\/g, '/'),
      entriesSaved: answers.length
    });
  } catch (err) {
    res.status(500).json({ error: 'Save failed: ' + err.message });
  }
});

// --- Atlassian API Helpers ---

function atlassianRequest(urlPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, ATLASSIAN_BASE);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Authorization': `Basic ${ATLASSIAN_AUTH}`,
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ error: 'Failed to parse response' }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Atlassian request timeout')); });
    req.end();
  });
}

async function searchConfluence(query, limit = 5) {
  try {
    const cql = encodeURIComponent(`siteSearch ~ "${query}"`);
    const data = await atlassianRequest(`/wiki/rest/api/content/search?cql=${cql}&limit=${limit}&expand=body.view`);
    if (data.results) {
      return data.results.map(r => ({
        title: r.title,
        space: r._expandable?.space?.split('/')?.pop() || '',
        url: `${ATLASSIAN_BASE}/wiki${r._links?.webui || ''}`,
        excerpt: (r.body?.view?.value || '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 1500)
      }));
    }
    return [];
  } catch (err) {
    console.error('Confluence search error:', err.message);
    return [];
  }
}

async function getConfluencePage(pageId) {
  try {
    const data = await atlassianRequest(`/wiki/rest/api/content/${pageId}?expand=body.storage`);
    const text = (data.body?.storage?.value || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return { title: data.title, text: text.substring(0, 10000) };
  } catch (err) {
    return { title: 'Error', text: err.message };
  }
}

async function searchJira(query, limit = 10) {
  try {
    const jql = encodeURIComponent(query);
    const data = await atlassianRequest(`/rest/api/3/search/jql?jql=${jql}&maxResults=${limit}&fields=summary,status,assignee,priority,description,updated`);
    if (data.issues) {
      return data.issues.map(issue => ({
        key: issue.key,
        summary: issue.fields?.summary || '',
        status: issue.fields?.status?.name || '',
        assignee: issue.fields?.assignee?.displayName || 'Unassigned',
        priority: issue.fields?.priority?.name || '',
        updated: issue.fields?.updated || '',
        description: (issue.fields?.description?.content || [])
          .map(block => (block.content || []).map(c => c.text || '').join(''))
          .join('\n')
          .substring(0, 500)
      }));
    }
    return [];
  } catch (err) {
    console.error('Jira search error:', err.message);
    return [];
  }
}

// API endpoints for Confluence/Jira search from the UI
app.get('/api/confluence/search', async (req, res) => {
  const results = await searchConfluence(req.query.q || '', parseInt(req.query.limit) || 5);
  res.json(results);
});

app.get('/api/jira/search', async (req, res) => {
  const results = await searchJira(req.query.jql || 'project = ISC ORDER BY updated DESC', parseInt(req.query.limit) || 10);
  res.json(results);
});

// --- Jira single ticket detail ---
app.get('/api/jira/ticket/:key', async (req, res) => {
  try {
    const jql = encodeURIComponent(`key = ${req.params.key}`);
    const data = await atlassianRequest(
      `/rest/api/3/search/jql?jql=${jql}&maxResults=1&fields=summary,status,assignee,reporter,priority,duedate,created,updated,description,comment`
    );
    const issue = data.issues?.[0];
    if (!issue) return res.json({ error: 'Not found' });
    const desc = (issue.fields?.description?.content || [])
      .map(block => (block.content || []).map(c => c.text || '').join(''))
      .join('\n');
    const comments = (issue.fields?.comment?.comments || []).slice(-5).map(c => ({
      author: c.author?.displayName || 'Unknown',
      date: c.created?.slice(0, 10) || '',
      body: (c.body?.content || []).map(b => (b.content || []).map(x => x.text || '').join('')).join('\n')
    }));
    res.json({
      key: issue.key,
      summary: issue.fields?.summary || '',
      status: issue.fields?.status?.name || '',
      statusCategory: issue.fields?.status?.statusCategory?.key || '',
      assignee: issue.fields?.assignee?.displayName || 'Unassigned',
      reporter: issue.fields?.reporter?.displayName || '',
      priority: issue.fields?.priority?.name || '',
      duedate: issue.fields?.duedate || null,
      created: issue.fields?.created || '',
      updated: issue.fields?.updated || '',
      description: desc,
      comments,
      url: `${ATLASSIAN_BASE}/browse/${issue.key}`
    });
  } catch (err) {
    res.json({ error: err.message });
  }
});

// --- Jira statuses endpoint ---
app.get('/api/jira/statuses', async (req, res) => {
  try {
    const jqlEnc = encodeURIComponent('project = ISC ORDER BY updated DESC');
    const data = await atlassianRequest(
      `/rest/api/3/search/jql?jql=${jqlEnc}&maxResults=50&fields=status`
    );
    const statuses = new Map();
    (data.issues || []).forEach(i => {
      const name = i.fields?.status?.name;
      if (name && !statuses.has(name)) statuses.set(name, i.fields?.status?.statusCategory?.key || 'new');
    });
    res.json([...statuses.entries()].map(([name, cat]) => ({ name, category: cat })).sort((a, b) => a.name.localeCompare(b.name)));
  } catch { res.json([]); }
});

// --- Jira issue types endpoint ---
app.get('/api/jira/issuetypes', async (req, res) => {
  try {
    const jqlEnc = encodeURIComponent('project = ISC ORDER BY updated DESC');
    const data = await atlassianRequest(
      `/rest/api/3/search/jql?jql=${jqlEnc}&maxResults=50&fields=issuetype`
    );
    const types = new Set();
    (data.issues || []).forEach(i => {
      const t = i.fields?.issuetype?.name;
      if (t) types.add(t);
    });
    res.json([...types].sort());
  } catch { res.json([]); }
});

// --- Jira Kanban board endpoint ---
app.get('/api/jira/board', async (req, res) => {
  const assignee = req.query.assignee || '';
  const issueType = req.query.issueType || '';
  const status = req.query.status || 'all';
  let jql = 'project = ISC';
  if (assignee) jql += ` AND assignee = "${assignee}"`;
  if (issueType) jql += ` AND issuetype = "${issueType}"`;
  if (status !== 'all') jql += ` AND status = "${status}"`;
  jql += ' ORDER BY rank ASC, updated DESC';
  try {
    const jqlEnc = encodeURIComponent(jql);
    const data = await atlassianRequest(
      `/rest/api/3/search/jql?jql=${jqlEnc}&maxResults=50&fields=summary,status,assignee,priority,duedate,created,updated,labels,issuetype`
    );
    const columns = { backlog: [], assigned: [], inprogress: [], done: [] };
    (data.issues || []).forEach(issue => {
      const statusName = (issue.fields?.status?.name || '').toLowerCase();
      const statusCat = issue.fields?.status?.statusCategory?.key || 'new';
      const ticket = {
        key: issue.key,
        summary: issue.fields?.summary || '',
        status: issue.fields?.status?.name || '',
        statusCategory: statusCat,
        assignee: issue.fields?.assignee?.displayName || 'Unassigned',
        assigneeInitials: (issue.fields?.assignee?.displayName || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase(),
        priority: issue.fields?.priority?.name || '',
        duedate: issue.fields?.duedate || null,
        created: issue.fields?.created || '',
        updated: issue.fields?.updated || '',
        labels: issue.fields?.labels || [],
        issueType: issue.fields?.issuetype?.name || '',
        url: `${ATLASSIAN_BASE}/browse/${issue.key}`
      };
      if (statusCat === 'done') columns.done.push(ticket);
      else if (statusCat === 'indeterminate' || /progress|assigned|review/i.test(statusName)) columns.inprogress.push(ticket);
      else if (/selected|dev|ready/i.test(statusName)) columns.assigned.push(ticket);
      else columns.backlog.push(ticket);
    });
    res.json(columns);
  } catch (err) {
    res.json({ backlog: [], assigned: [], inprogress: [], done: [], error: err.message });
  }
});

// --- Jira assignees endpoint ---
app.get('/api/jira/assignees', async (req, res) => {
  try {
    const jqlEnc = encodeURIComponent('project = ISC ORDER BY updated DESC');
    const data = await atlassianRequest(
      `/rest/api/3/search/jql?jql=${jqlEnc}&maxResults=50&fields=assignee`
    );
    const names = new Set();
    (data.issues || []).forEach(i => {
      const n = i.fields?.assignee?.displayName;
      if (n) names.add(n);
    });
    res.json([...names].sort());
  } catch { res.json([]); }
});

// --- Jira tickets list endpoint ---
app.get('/api/jira/tickets', async (req, res) => {
  const status = req.query.status || 'all';
  const assignee = req.query.assignee || '';
  const issueType = req.query.issueType || '';
  const limit = parseInt(req.query.limit) || 30;
  let jql = 'project = ISC';
  if (status === 'open') jql += ' AND statusCategory != Done';
  else if (status === 'done') jql += ' AND statusCategory = Done';
  else if (status && status !== 'all') jql += ` AND status = "${status}"`;
  if (assignee) jql += ` AND assignee = "${assignee}"`;
  if (issueType) jql += ` AND issuetype = "${issueType}"`;
  jql += ' ORDER BY updated DESC';
  try {
    const jqlEnc = encodeURIComponent(jql);
    const data = await atlassianRequest(
      `/rest/api/3/search/jql?jql=${jqlEnc}&maxResults=${limit}&fields=summary,status,assignee,priority,duedate,created,updated`
    );
    const tickets = (data.issues || []).map(issue => ({
      key: issue.key,
      summary: issue.fields?.summary || '',
      status: issue.fields?.status?.name || '',
      statusCategory: issue.fields?.status?.statusCategory?.key || '',
      assignee: issue.fields?.assignee?.displayName || 'Unassigned',
      priority: issue.fields?.priority?.name || '',
      duedate: issue.fields?.duedate || null,
      created: issue.fields?.created || '',
      updated: issue.fields?.updated || '',
      url: `${ATLASSIAN_BASE}/browse/${issue.key}`
    }));
    res.json(tickets);
  } catch (err) {
    res.json([]);
  }
});

// --- Jira Calendar endpoint ---
app.get('/api/jira/calendar', async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7); // YYYY-MM
  const field = req.query.field || 'duedate'; // duedate or created
  const [year, mon] = month.split('-').map(Number);
  const startDate = `${month}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const endDate = `${month}-${lastDay}`;

  let jql;
  if (field === 'duedate') {
    jql = `project = ISC AND duedate >= "${startDate}" AND duedate <= "${endDate}" ORDER BY duedate ASC`;
  } else {
    jql = `project = ISC AND created >= "${startDate}" AND created <= "${endDate}" ORDER BY created ASC`;
  }

  try {
    const jqlEnc = encodeURIComponent(jql);
    const data = await atlassianRequest(
      `/rest/api/3/search/jql?jql=${jqlEnc}&maxResults=100&fields=summary,status,assignee,priority,duedate,created,updated,issuetype`
    );
    const tickets = (data.issues || []).map(issue => ({
      key: issue.key,
      summary: issue.fields?.summary || '',
      status: issue.fields?.status?.name || '',
      statusCategory: issue.fields?.status?.statusCategory?.key || '',
      assignee: issue.fields?.assignee?.displayName || 'Unassigned',
      priority: issue.fields?.priority?.name || '',
      issueType: issue.fields?.issuetype?.name || '',
      duedate: issue.fields?.duedate || null,
      created: issue.fields?.created || '',
      updated: issue.fields?.updated || '',
      date: field === 'duedate'
        ? (issue.fields?.duedate || issue.fields?.created?.slice(0, 10))
        : issue.fields?.created?.slice(0, 10)
    }));
    res.json({ month, field, tickets });
  } catch (err) {
    // Fallback: fetch by created if duedate query fails
    try {
      const fallbackJql = encodeURIComponent(
        `project = ISC AND created >= "${startDate}" AND created <= "${endDate}" ORDER BY created ASC`
      );
      const data = await atlassianRequest(
        `/rest/api/3/search/jql?jql=${fallbackJql}&maxResults=100&fields=summary,status,assignee,priority,duedate,created,updated,issuetype`
      );
      const tickets = (data.issues || []).map(issue => ({
        key: issue.key,
        summary: issue.fields?.summary || '',
        status: issue.fields?.status?.name || '',
        statusCategory: issue.fields?.status?.statusCategory?.key || '',
        assignee: issue.fields?.assignee?.displayName || 'Unassigned',
        priority: issue.fields?.priority?.name || '',
        issueType: issue.fields?.issuetype?.name || '',
        duedate: issue.fields?.duedate || null,
        created: issue.fields?.created || '',
        updated: issue.fields?.updated || '',
        date: issue.fields?.created?.slice(0, 10)
      }));
      res.json({ month, field: 'created', tickets });
    } catch (err2) {
      res.json({ month, field, tickets: [], error: err2.message });
    }
  }
});

// --- Answer Bank Import endpoints ---

// List categories
app.get('/api/bank/categories', (req, res) => {
  const catDir = path.join(BANK_ROOT, 'categories');
  try {
    const files = fs.readdirSync(catDir)
      .filter(f => f.endsWith('.md') && !f.startsWith('README'))
      .map(f => ({ name: f.replace('.md', ''), file: f }));
    res.json(files);
  } catch { res.json([]); }
});

// List frameworks with versions
app.get('/api/bank/frameworks', (req, res) => {
  const fwDir = path.join(BANK_ROOT, 'frameworks');
  try {
    const frameworks = [];
    const entries = fs.readdirSync(fwDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const versions = fs.readdirSync(path.join(fwDir, entry.name), { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name);
      frameworks.push({ name: entry.name, versions });
    }
    res.json(frameworks);
  } catch { res.json([]); }
});

// Import original file directly to answer bank (no conversion)
app.post('/api/bank/import-file', (req, res) => {
  const { type, category, product, framework, version, filePath, fileName } = req.body;
  if (!filePath || !fileName) {
    return res.status(400).json({ error: 'No file to import' });
  }
  try {
    const today = new Date().toISOString().slice(0, 10);
    const ext = path.extname(fileName).toLowerCase();
    let targetPath;

    switch (type) {
      case 'framework': {
        const fwDir = path.join(BANK_ROOT, 'frameworks', framework, version, 'completed');
        if (!fs.existsSync(fwDir)) fs.mkdirSync(fwDir, { recursive: true });
        const prod = product || 'general';
        targetPath = path.join(fwDir, `${today}-${prod}-${framework}${ext}`);
        break;
      }
      case 'product-override': {
        const prodDir = path.join(BANK_ROOT, 'products', product, 'questionnaires');
        if (!fs.existsSync(prodDir)) fs.mkdirSync(prodDir, { recursive: true });
        targetPath = path.join(prodDir, `${today}-${product}-questionnaire${ext}`);
        break;
      }
      case 'policy': {
        const polDir = path.join(BANK_ROOT, 'policies', 'source-documents');
        if (!fs.existsSync(polDir)) fs.mkdirSync(polDir, { recursive: true });
        targetPath = path.join(polDir, fileName);
        break;
      }
      case 'category':
      default: {
        const pqDir = path.join(BANK_ROOT, 'past-questionnaires');
        if (!fs.existsSync(pqDir)) fs.mkdirSync(pqDir, { recursive: true });
        targetPath = path.join(pqDir, `${today}-${fileName}`);
        break;
      }
    }

    // Copy the original file
    fs.copyFileSync(filePath, targetPath);

    // Update changelog
    const changelogPath = path.join(BANK_ROOT, 'changelog.md');
    const changeEntry = `\n## ${today} - File Import\n- **Action:** Imported original file\n- **Type:** ${type}\n- **Destination:** ${path.relative(BANK_ROOT, targetPath).replace(/\\/g, '/')}\n- **Source:** ${fileName}\n`;
    if (fs.existsSync(changelogPath)) {
      const existing = fs.readFileSync(changelogPath, 'utf-8');
      fs.writeFileSync(changelogPath, existing + changeEntry);
    }

    res.json({
      success: true,
      path: path.relative(BANK_ROOT, targetPath).replace(/\\/g, '/'),
      fileName: path.basename(targetPath)
    });
  } catch (err) {
    res.status(500).json({ error: 'Import failed: ' + err.message });
  }
});

// Import to answer bank (legacy - converts to markdown)
app.post('/api/bank/import', (req, res) => {
  const { type, category, product, framework, version, fileName, entries } = req.body;

  if (!entries || entries.length === 0) {
    return res.status(400).json({ error: 'No entries to import' });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    let targetPath;
    let mode = 'append'; // append or create

    switch (type) {
      case 'category':
        targetPath = path.join(BANK_ROOT, 'categories', `${category}.md`);
        break;
      case 'product-override':
        targetPath = path.join(BANK_ROOT, 'products', product, 'overrides', `${category}.md`);
        // Ensure overrides dir exists
        const overridesDir = path.join(BANK_ROOT, 'products', product, 'overrides');
        if (!fs.existsSync(overridesDir)) fs.mkdirSync(overridesDir, { recursive: true });
        break;
      case 'policy':
        const policyName = (category || 'imported-policy').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
        targetPath = path.join(BANK_ROOT, 'policies', `${policyName}.md`);
        mode = 'create';
        break;
      case 'framework':
        const fwDir = path.join(BANK_ROOT, 'frameworks', framework, version, 'completed');
        if (!fs.existsSync(fwDir)) fs.mkdirSync(fwDir, { recursive: true });
        const fwProduct = product || 'general';
        targetPath = path.join(fwDir, `${today}-${fwProduct}-${framework}.md`);
        mode = 'create';
        break;
      default:
        return res.status(400).json({ error: 'Invalid import type' });
    }

    // Format entries as markdown
    const markdown = entries.map(e => {
      return [
        `\n## Q: ${e.question}`,
        `**A:** ${e.answer}`,
        `**Last Updated:** ${today}`,
        `**Source:** Imported from ${fileName || 'dashboard'}`,
        `**Tags:** ${e.tags || category || ''}`,
        ''
      ].join('\n');
    }).join('\n');

    if (mode === 'append' && fs.existsSync(targetPath)) {
      fs.appendFileSync(targetPath, '\n' + markdown);
    } else {
      // For new files or create mode, add a header
      const header = `# ${type === 'policy' ? (category || 'Imported Policy') : (category || framework)} - Imported ${today}\n\n`;
      fs.writeFileSync(targetPath, header + markdown);
    }

    // Update changelog
    const changelogPath = path.join(BANK_ROOT, 'changelog.md');
    const changeEntry = `\n## ${today} - Import\n- **Action:** Imported ${entries.length} Q&A entries\n- **Type:** ${type}\n- **Destination:** ${path.relative(BANK_ROOT, targetPath).replace(/\\/g, '/')}\n- **Source:** ${fileName || 'Dashboard import'}\n`;
    if (fs.existsSync(changelogPath)) {
      const existing = fs.readFileSync(changelogPath, 'utf-8');
      fs.writeFileSync(changelogPath, existing + changeEntry);
    }

    res.json({
      success: true,
      path: path.relative(BANK_ROOT, targetPath).replace(/\\/g, '/'),
      entriesImported: entries.length,
      mode
    });

  } catch (err) {
    res.status(500).json({ error: 'Import failed: ' + err.message });
  }
});

// --- Framework Migration endpoint ---
app.post('/api/migrate', upload.fields([{ name: 'sourceFile' }, { name: 'targetFile' }]), async (req, res) => {
  const apiKey = req.body.apiKey;
  if (!apiKey) return res.status(400).json({ error: 'API key required' });
  if (!req.files?.sourceFile?.[0] || !req.files?.targetFile?.[0]) {
    return res.status(400).json({ error: 'Both source and target files required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  try {
    // Parse source file
    sendEvent('progress', { step: 'Parsing source file...', percent: 5 });
    const sourceQuestions = extractQuestionsFromExcel(req.files.sourceFile[0].path, req.files.sourceFile[0].originalname);

    // Parse target file
    sendEvent('progress', { step: 'Parsing target file...', percent: 15 });
    const targetQuestions = extractQuestionsFromExcel(req.files.targetFile[0].path, req.files.targetFile[0].originalname);

    sendEvent('progress', { step: `Found ${sourceQuestions.length} source questions, ${targetQuestions.length} target questions`, percent: 20 });

    // Batch match using Claude API
    const batchSize = 15;
    const allMappings = [];
    const totalBatches = Math.ceil(targetQuestions.length / batchSize);

    for (let i = 0; i < targetQuestions.length; i += batchSize) {
      const batchNum = Math.floor(i / batchSize) + 1;
      const batch = targetQuestions.slice(i, i + batchSize);
      const percent = 20 + Math.round((batchNum / totalBatches) * 70);

      sendEvent('progress', {
        step: `Matching batch ${batchNum}/${totalBatches} (questions ${i + 1}-${Math.min(i + batchSize, targetQuestions.length)})...`,
        percent
      });

      const mappings = await matchQuestions(apiKey, sourceQuestions, batch);
      allMappings.push(...mappings);

      sendEvent('batch', { batchNum, totalBatches, count: mappings.length });
    }

    sendEvent('progress', { step: 'Migration mapping complete!', percent: 100 });

    // Save target file path for format-preserving export
    const sessionId = Date.now().toString() + Math.random().toString(36).slice(2);
    migrationSessions.set(sessionId, {
      targetFilePath: req.files.targetFile[0].path,
      targetFileName: req.files.targetFile[0].originalname,
      created: Date.now()
    });
    // Clean up sessions older than 2 hours
    for (const [id, sess] of migrationSessions) {
      if (Date.now() - sess.created > 7200000) migrationSessions.delete(id);
    }

    sendEvent('complete', {
      sourceCount: sourceQuestions.length,
      targetCount: targetQuestions.length,
      mappedCount: allMappings.filter(m => m.matchConfidence !== 'none').length,
      unmappedCount: allMappings.filter(m => m.matchConfidence === 'none').length,
      mappings: allMappings,
      sessionId
    });

  } catch (err) {
    sendEvent('error', { message: err.message });
  }
  res.end();
});

// Export migrated questionnaire (format-preserving: fills answers into the original target file)
app.post('/api/migrate/export', (req, res) => {
  const { mappings, sessionId } = req.body;
  if (!mappings || mappings.length === 0) return res.status(400).json({ error: 'No mappings' });

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    // Use original target file for format preservation
    if (sessionId && migrationSessions.has(sessionId)) {
      const session = migrationSessions.get(sessionId);
      if (fs.existsSync(session.targetFilePath)) {
        const wb = XLSX.readFile(session.targetFilePath, { cellStyles: true, cellNF: true, cellDates: true });

        // Remove any Excel protection/read-only restrictions
        wb.Workbook = wb.Workbook || {};
        wb.Workbook.WBProps = wb.Workbook.WBProps || {};
        wb.Workbook.WBProps.filterPrivacy = false;
        delete wb.Workbook.WBProps.protect; // Remove workbook protection

        // Remove sheet protection
        for (const sheetName of wb.SheetNames) {
          const sheet = wb.Sheets[sheetName];
          if (sheet) {
            delete sheet['!protect']; // Remove sheet protection
            // Remove cell-level protection settings
            for (const cellRef in sheet) {
              if (cellRef.startsWith('!')) continue;
              if (sheet[cellRef] && typeof sheet[cellRef] === 'object') {
                delete sheet[cellRef].protection;
              }
            }
          }
        }

        fillAnswersInWorkbook(wb, mappings);
        const origExt = path.extname(session.targetFileName) || '.xlsx';
        const baseName = path.basename(session.targetFileName, origExt);
        const outputName = `${baseName}-migrated-${timestamp}${origExt}`;
        const outputPath = path.join(OUTPUT_DIR, outputName);
        XLSX.writeFile(wb, outputPath, { cellStyles: true });
        return res.json({ success: true, file: outputName });
      }
    }

    // Fallback: summary export if original file is no longer available
    const data = mappings.map(m => ({
      'Target ID': m.targetId || '',
      'Target Question': m.targetQuestion || '',
      'Migrated Answer': m.migratedAnswer || '',
      'Source ID': m.sourceId || '',
      'Source Question': m.sourceQuestion || '',
      'Original Answer': m.sourceAnswer || '',
      'Match Confidence': m.matchConfidence || 'none',
      'Needs Review': m.matchConfidence !== 'high' ? 'YES' : 'NO',
      'Notes': m.notes || ''
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 12 }, { wch: 50 }, { wch: 60 }, { wch: 12 },
      { wch: 50 }, { wch: 60 }, { wch: 14 }, { wch: 12 }, { wch: 30 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Migration');
    const outputName = `migration-${timestamp}.xlsx`;
    const outputPath = path.join(OUTPUT_DIR, outputName);
    XLSX.writeFile(wb, outputPath);
    res.json({ success: true, file: outputName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fill migrated answers into the original workbook cells (preserves all other formatting/data)
function fillAnswersInWorkbook(wb, mappings) {
  const answerById = {};
  const answerByQ = {};
  for (const m of mappings) {
    if (m.migratedAnswer) {
      if (m.targetId) answerById[String(m.targetId).trim()] = m.migratedAnswer;
      if (m.targetQuestion) answerByQ[m.targetQuestion.trim().toLowerCase()] = m.migratedAnswer;
    }
  }

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet['!ref']) continue;

    const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (raw.length < 2) continue;

    // Find header row — first row containing a question/answer keyword
    let headerRowIdx = 0;
    for (let i = 0; i < Math.min(raw.length, 10); i++) {
      if (raw[i].some(c => String(c).match(/question|answer|response|control|requirement/i))) {
        headerRowIdx = i;
        break;
      }
    }
    const headers = raw[headerRowIdx].map(h => String(h || ''));

    const idColIdx = headers.findIndex(h => /^(id|#|ref|number|index|section|control.?id)/i.test(h));
    const qColIdx = headers.findIndex(h => /question|requirement|control|description|query|item/i.test(h));
    const aColIdx = headers.findIndex(h => /answer|response|reply|vendor|assessment/i.test(h));

    if (aColIdx < 0) continue; // No answer column found in this sheet

    for (let rowIdx = headerRowIdx + 1; rowIdx < raw.length; rowIdx++) {
      const row = raw[rowIdx];
      const rowId = idColIdx >= 0 ? String(row[idColIdx] || '').trim() : '';
      const rowQ = qColIdx >= 0 ? String(row[qColIdx] || '').trim() : '';

      let answer = null;
      if (rowId && answerById[rowId]) {
        answer = answerById[rowId];
      } else if (rowQ && answerByQ[rowQ.toLowerCase()]) {
        answer = answerByQ[rowQ.toLowerCase()];
      }

      if (answer !== null) {
        const cellAddr = XLSX.utils.encode_cell({ c: aColIdx, r: rowIdx });
        if (!sheet[cellAddr]) sheet[cellAddr] = {};
        sheet[cellAddr].v = answer;
        sheet[cellAddr].t = 's';
        delete sheet[cellAddr].f; // remove any formula
        delete sheet[cellAddr].w; // remove cached formatted value
      }
    }
  }
}

function extractQuestionsFromExcel(filePath, originalName) {
  const workbook = XLSX.readFile(filePath);
  const questions = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (rows.length === 0) continue;

    const cols = Object.keys(rows[0]);
    // Find question and answer columns (common patterns in HECVAT/SIG)
    const qCol = cols.find(c => /question|requirement|control|description|query|item/i.test(c))
      || cols.find(c => /q\d|text|content/i.test(c))
      || cols[1] || cols[0];
    const idCol = cols.find(c => /^(id|#|ref|number|index|section|control.?id)/i.test(c)) || cols[0];
    const aCol = cols.find(c => /answer|response|reply|vendor|assessment/i.test(c)) || null;

    for (const row of rows) {
      const q = String(row[qCol] || '').trim();
      if (q.length > 10 && !/^(section|category|domain|header)/i.test(q)) {
        questions.push({
          id: String(row[idCol] || ''),
          question: q,
          answer: aCol ? String(row[aCol] || '').trim() : '',
          sheet: sheetName
        });
      }
    }
  }
  return questions;
}

function matchQuestions(apiKey, sourceQuestions, targetBatch) {
  return new Promise((resolve, reject) => {
    const sourceList = sourceQuestions.map(q => `[${q.id}] Q: ${q.question}\nA: ${q.answer || '(no answer)'}`).join('\n\n');
    const targetList = targetBatch.map(q => `[${q.id}] ${q.question}`).join('\n');

    const prompt = `You are a security questionnaire migration expert. Match each TARGET question to the best matching SOURCE question. Transfer the original answer from the source and adapt it slightly if needed for the target question.

SOURCE QUESTIONS & ANSWERS (old framework):
${sourceList}

TARGET QUESTIONS (new framework):
${targetList}

For each target question, find the best matching source question and return a JSON array:
[{
  "targetId": "target question ID",
  "targetQuestion": "target question text",
  "sourceId": "matching source ID or null if no match",
  "sourceQuestion": "matching source question or null",
  "sourceAnswer": "the answer from source to transfer",
  "migratedAnswer": "the answer adapted for the target question (may need slight rewording)",
  "matchConfidence": "high|medium|low|none",
  "notes": "brief note on why this match was chosen, or what changed between versions"
}]

RULES:
- "high" = questions are essentially the same, just reworded
- "medium" = questions cover the same topic but scope/focus differs
- "low" = loosely related, answer may need significant editing
- "none" = no matching source question found
- If the source has an answer, transfer it (adapting wording if needed)
- If source answer is empty, set migratedAnswer to "" and note it needs completion

Respond ONLY with the JSON array.`;

    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 50000,
      messages: [{ role: 'user', content: prompt }]
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (apiRes) => {
      let data = '';
      apiRes.on('data', chunk => { data += chunk; });
      apiRes.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.error) { reject(new Error(response.error.message)); return; }
          const text = response.content?.map(c => c.text || '').join('') || '';
          const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
          if (jsonMatch) {
            resolve(JSON.parse(jsonMatch[0]));
          } else {
            // Return unmapped entries
            resolve(targetBatch.map(q => ({
              targetId: q.id, targetQuestion: q.question,
              sourceId: null, sourceQuestion: null, sourceAnswer: '',
              migratedAnswer: '', matchConfidence: 'none', notes: 'Could not parse mapping'
            })));
          }
        } catch (err) {
          resolve(targetBatch.map(q => ({
            targetId: q.id, targetQuestion: q.question,
            sourceId: null, sourceQuestion: null, sourceAnswer: '',
            migratedAnswer: '', matchConfidence: 'none', notes: 'Parse error: ' + err.message
          })));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

// --- Helper Functions ---

function readMarkdownFiles(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...readMarkdownFiles(fullPath));
      } else if (entry.name.endsWith('.md') && !entry.name.startsWith('README')) {
        try {
          results.push({
            file: path.relative(BANK_ROOT, fullPath).replace(/\\/g, '/'),
            content: fs.readFileSync(fullPath, 'utf-8')
          });
        } catch { /* skip */ }
      } else if (/\.(xlsx|xls|csv)$/i.test(entry.name)) {
        // Parse Excel/CSV files to extract Q&A content
        try {
          const workbook = XLSX.readFile(fullPath);
          let excelContent = `[Excel: ${entry.name}]\n`;
          for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
            if (rows.length === 0) continue;
            const cols = Object.keys(rows[0]);
            const qCol = cols.find(c => /question|requirement|control|description|query|item/i.test(c)) || cols[1] || cols[0];
            const aCol = cols.find(c => /answer|response|reply|vendor|assessment/i.test(c));
            const idCol = cols.find(c => /^(id|#|ref|number|index|section)/i.test(c)) || cols[0];
            // Extract up to 100 rows of Q&A content
            const extracted = rows.slice(0, 100).filter(r => String(r[qCol] || '').trim().length > 5);
            if (extracted.length > 0) {
              excelContent += `Sheet: ${sheetName} (${extracted.length} questions)\n`;
              extracted.forEach(r => {
                excelContent += `[${r[idCol] || ''}] Q: ${String(r[qCol] || '').trim()}\n`;
                if (aCol && r[aCol]) excelContent += `A: ${String(r[aCol]).trim()}\n`;
              });
            }
          }
          if (excelContent.length > 50) {
            results.push({
              file: path.relative(BANK_ROOT, fullPath).replace(/\\/g, '/'),
              content: excelContent.substring(0, 30000) // Cap at 30k chars per file
            });
          }
        } catch { /* skip unreadable Excel */ }
      } else if (/\.(txt)$/i.test(entry.name)) {
        try {
          const text = fs.readFileSync(fullPath, 'utf-8');
          if (text.trim().length > 10) {
            results.push({ file: path.relative(BANK_ROOT, fullPath).replace(/\\/g, '/'), content: text.substring(0, 20000) });
          }
        } catch { /* skip */ }
      } else if (/\.(json)$/i.test(entry.name)) {
        try {
          const raw = fs.readFileSync(fullPath, 'utf-8');
          const parsed = JSON.parse(raw);
          const text = JSON.stringify(parsed, null, 2);
          if (text.length > 10) {
            results.push({ file: path.relative(BANK_ROOT, fullPath).replace(/\\/g, '/'), content: `[JSON: ${entry.name}]\n${text.substring(0, 20000)}` });
          }
        } catch { /* skip */ }
      } else if (/\.(docx)$/i.test(entry.name)) {
        try {
          const AdmZip = require('adm-zip');
          const zip = new AdmZip(fullPath);
          const content = zip.readAsText('word/document.xml');
          const text = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          if (text.length > 20) {
            results.push({ file: path.relative(BANK_ROOT, fullPath).replace(/\\/g, '/'), content: `[Word: ${entry.name}]\n${text.substring(0, 20000)}` });
          }
        } catch { /* skip */ }
      } else if (/\.(pdf)$/i.test(entry.name)) {
        // PDF parsing is async — skip in sync function, PDFs handled via file upload instead
      }
    }
  } catch { /* skip */ }
  return results;
}

function loadKnowledgeBase(product) {
  const categories = readMarkdownFiles(path.join(BANK_ROOT, 'categories'));
  const policies = readMarkdownFiles(path.join(BANK_ROOT, 'policies'));
  const products = product
    ? readMarkdownFiles(path.join(BANK_ROOT, 'products', product))
    : readMarkdownFiles(path.join(BANK_ROOT, 'products'));
  const pastQuestionnaires = readMarkdownFiles(path.join(BANK_ROOT, 'past-questionnaires'));
  const frameworks = readMarkdownFiles(path.join(BANK_ROOT, 'frameworks'));
  const clients = readMarkdownFiles(path.join(BANK_ROOT, 'clients'));
  const imports = readMarkdownFiles(path.join(BANK_ROOT, 'imports'));

  let glossary = '';
  try { glossary = fs.readFileSync(path.join(BANK_ROOT, 'glossary.md'), 'utf-8'); } catch { }

  return [
    '=== CATEGORY ANSWERS (Organization-wide Q&A) ===',
    '(Note: Answers marked [Your answer here] are placeholders — use Confluence or your knowledge to draft real answers)',
    ...categories.map(f => `\n--- ${f.file} ---\n${f.content}`),
    '\n=== POLICIES ===',
    ...policies.map(f => `\n--- ${f.file} ---\n${f.content}`),
    '\n=== PRODUCT DETAILS & OVERRIDES ===',
    ...products.map(f => `\n--- ${f.file} ---\n${f.content}`),
    '\n=== PAST COMPLETED QUESTIONNAIRES ===',
    ...pastQuestionnaires.map(f => `\n--- ${f.file} ---\n${f.content}`),
    '\n=== FRAMEWORK RESPONSES ===',
    ...frameworks.map(f => `\n--- ${f.file} ---\n${f.content}`),
    '\n=== CLIENT CONTEXT ===',
    ...clients.map(f => `\n--- ${f.file} ---\n${f.content}`),
    '\n=== IMPORTS ===',
    ...imports.map(f => `\n--- ${f.file} ---\n${f.content}`),
    '\n=== GLOSSARY ===',
    glossary
  ].join('\n');
}

function callClaudeAPI(apiKey, questions, knowledgeBase, product) {
  return new Promise((resolve, reject) => {
    const prompt = `You are a security questionnaire answering assistant. Using the knowledge base below, answer each question accurately and professionally.

PRIORITY ORDER FOR ANSWERS:
1. Product-specific overrides for ${product || 'any product'} (highest priority)
2. Organization-wide category answers
3. Policy documents
4. Your security knowledge (only if no answer exists in the bank)

RULES:
- If the answer bank has a matching Q&A, use that answer (adapt wording if needed)
- If no match exists, draft a professional answer based on the policies and mark it as [NEEDS REVIEW]
- Keep answers concise but complete
- Use the glossary for consistent terminology
- Return a JSON array with objects: {"id": "...", "question": "...", "answer": "...", "source": "...", "confidence": "high|medium|low"}

KNOWLEDGE BASE:
${knowledgeBase.substring(0, 180000)}

QUESTIONS TO ANSWER:
${questions.map(q => `[${q.id}] ${q.question}`).join('\n')}

Respond ONLY with the JSON array, no other text.`;

    const body = JSON.stringify({
      model: 'claude-opus-4-20250514',
      max_tokens: 32000,
      messages: [{ role: 'user', content: prompt }]
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.error) {
            reject(new Error(response.error.message || 'Claude API error'));
            return;
          }
          const text = response.content?.map(c => c.text || '').join('') || '';
          const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
          if (jsonMatch) {
            resolve(JSON.parse(jsonMatch[0]));
          } else {
            reject(new Error('Could not parse Claude response as JSON'));
          }
        } catch (err) {
          reject(new Error('Failed to parse API response: ' + err.message));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error('API request timed out'));
    });
    req.write(body);
    req.end();
  });
}

function writeOutputExcel(answers, outputPath) {
  const data = answers.map(a => ({
    'Question ID': a.id || '',
    'Question': a.question || '',
    'Answer': a.answer || '',
    'Source': a.source || '',
    'Confidence': a.confidence || 'low',
    'Needs Review': a.confidence === 'low' ? 'YES' : 'NO'
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    { wch: 14 }, { wch: 60 }, { wch: 80 }, { wch: 30 }, { wch: 12 }, { wch: 14 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Answers');
  XLSX.writeFile(wb, outputPath);
}

// --- Save corrected answer to bank ---
app.post('/api/bank/save-answer', (req, res) => {
  const { question, answer, category, product, source } = req.body;
  if (!question || !answer) return res.status(400).json({ error: 'Question and answer required' });

  try {
    const today = new Date().toISOString().slice(0, 10);
    const cat = category || 'general';

    // Determine target file
    let targetPath;
    if (product && product !== '') {
      const overridesDir = path.join(BANK_ROOT, 'products', product, 'overrides');
      if (!fs.existsSync(overridesDir)) fs.mkdirSync(overridesDir, { recursive: true });
      targetPath = path.join(overridesDir, `${cat}.md`);
    } else {
      targetPath = path.join(BANK_ROOT, 'categories', `${cat}.md`);
    }

    const entry = [
      '',
      `## Q: ${question}`,
      `**A:** ${answer}`,
      `**Last Updated:** ${today}`,
      `**Source:** ${source || 'Chat correction via dashboard'}`,
      `**Tags:** ${cat}`,
      ''
    ].join('\n');

    if (fs.existsSync(targetPath)) {
      fs.appendFileSync(targetPath, '\n' + entry);
    } else {
      fs.writeFileSync(targetPath, `# ${cat}\n` + entry);
    }

    // Log to changelog
    const changelogPath = path.join(BANK_ROOT, 'changelog.md');
    const changeEntry = `\n## ${today} - Chat Save\n- **Action:** Saved corrected answer from chat\n- **Question:** ${question.substring(0, 80)}...\n- **Destination:** ${path.relative(BANK_ROOT, targetPath).replace(/\\/g, '/')}\n`;
    if (fs.existsSync(changelogPath)) {
      fs.appendFileSync(changelogPath, changeEntry);
    }

    res.json({
      success: true,
      path: path.relative(BANK_ROOT, targetPath).replace(/\\/g, '/'),
      message: `Saved to ${path.relative(BANK_ROOT, targetPath).replace(/\\/g, '/')}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Debug: check what the knowledge base loads
app.get('/api/debug/bank-stats', (req, res) => {
  const categories = readMarkdownFiles(path.join(BANK_ROOT, 'categories'));
  const policies = readMarkdownFiles(path.join(BANK_ROOT, 'policies'));
  const products = readMarkdownFiles(path.join(BANK_ROOT, 'products'));
  const pastQ = readMarkdownFiles(path.join(BANK_ROOT, 'past-questionnaires'));
  const frameworks = readMarkdownFiles(path.join(BANK_ROOT, 'frameworks'));
  const clients = readMarkdownFiles(path.join(BANK_ROOT, 'clients'));
  const imports = readMarkdownFiles(path.join(BANK_ROOT, 'imports'));
  const kb = loadKnowledgeBase('');
  res.json({
    files: { categories: categories.length, policies: policies.length, products: products.length, pastQuestionnaires: pastQ.length, frameworks: frameworks.length, clients: clients.length, imports: imports.length },
    totalFiles: categories.length + policies.length + products.length + pastQ.length + frameworks.length + clients.length + imports.length,
    knowledgeBaseChars: kb.length,
    fileList: [...categories, ...policies, ...products, ...pastQ, ...frameworks, ...clients, ...imports].map(f => f.file)
  });
});

app.listen(PORT, () => {
  console.log(`\n  Security Questionnaire Dashboard`);
  console.log(`  ================================`);
  console.log(`  Running at: http://localhost:${PORT}`);
  console.log(`  Answer Bank: ${BANK_ROOT}`);
  console.log(`  Output Dir:  ${OUTPUT_DIR}\n`);
});
