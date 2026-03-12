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
const BANK_ROOT = path.resolve(__dirname, '..', 'data', 'answer-bank');
const OUTPUT_DIR = path.resolve(__dirname, '..', 'data', 'output');
const UPLOAD_DIR = path.resolve(__dirname, 'uploads');

// Atlassian Config (from .env)
let ATLASSIAN_BASE = process.env.ATLASSIAN_BASE || '';
let ATLASSIAN_EMAIL = process.env.ATLASSIAN_EMAIL || '';
let ATLASSIAN_TOKEN = process.env.ATLASSIAN_TOKEN || '';
let ATLASSIAN_AUTH = (ATLASSIAN_EMAIL && ATLASSIAN_TOKEN)
  ? Buffer.from(`${ATLASSIAN_EMAIL}:${ATLASSIAN_TOKEN}`).toString('base64')
  : '';
let JIRA_PROJECT = process.env.JIRA_PROJECT || 'ISC';

// Ensure dirs exist
[OUTPUT_DIR, UPLOAD_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// In-memory session store for migration target files (for format-preserving export)
const migrationSessions = new Map();

// Function to update Atlassian credentials
function setAtlassianCredentials(base, email, token) {
  ATLASSIAN_BASE = base;
  ATLASSIAN_EMAIL = email;
  ATLASSIAN_TOKEN = token;
  ATLASSIAN_AUTH = (email && token) ? Buffer.from(`${email}:${token}`).toString('base64') : '';
}

// Multer for file uploads
const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50mb' }));

// --- API Routes ---

// Unified Atlassian Authentication (Confluence + Jira)
app.post('/api/atlassian/auth', (req, res) => {
  const { base, email, token, project } = req.body;
  if (!base || !email || !token) {
    return res.status(400).json({ error: 'Instance URL, email, and API token are required' });
  }

  const cleanBase = base.replace(/\/wiki\/?$/, '').replace(/\/+$/, '');
  const testAuth = Buffer.from(`${email}:${token}`).toString('base64');

  // Test both Confluence and Jira in parallel
  let confluenceOk = false, jiraOk = false, confMsg = '', jiraMsg = '';
  let done = 0;

  function finish() {
    done++;
    if (done < 2) return;
    if (!confluenceOk && !jiraOk) {
      return res.status(401).json({ error: 'Authentication failed for both Confluence and Jira. Check your credentials.' });
    }
    setAtlassianCredentials(cleanBase, email, token);
    if (project) JIRA_PROJECT = project.toUpperCase();
    const parts = [];
    if (confluenceOk) parts.push('Confluence');
    if (jiraOk) parts.push('Jira');
    res.json({ success: true, message: `Connected to ${parts.join(' & ')}`, confluence: confluenceOk, jira: jiraOk, project: JIRA_PROJECT });
  }

  // Test Confluence
  const confReq = https.request({
    hostname: new URL(cleanBase).hostname,
    path: '/wiki/rest/api/space?limit=1',
    method: 'GET',
    headers: { 'Authorization': `Basic ${testAuth}`, 'Accept': 'application/json' }
  }, (r) => {
    r.on('data', () => {});
    r.on('end', () => { confluenceOk = r.statusCode === 200; confMsg = r.statusCode === 200 ? 'OK' : `Status ${r.statusCode}`; finish(); });
  });
  confReq.on('error', () => { confMsg = 'Connection failed'; finish(); });
  confReq.end();

  // Test Jira
  const jiraReq = https.request({
    hostname: new URL(cleanBase).hostname,
    path: '/rest/api/3/myself',
    method: 'GET',
    headers: { 'Authorization': `Basic ${testAuth}`, 'Content-Type': 'application/json' }
  }, (r) => {
    r.on('data', () => {});
    r.on('end', () => { jiraOk = r.statusCode === 200; jiraMsg = r.statusCode === 200 ? 'OK' : `Status ${r.statusCode}`; finish(); });
  });
  jiraReq.on('error', () => { jiraMsg = 'Connection failed'; finish(); });
  jiraReq.end();
});

// Get/set project key
app.get('/api/atlassian/project', (req, res) => {
  res.json({ project: JIRA_PROJECT });
});

app.post('/api/atlassian/project', (req, res) => {
  const { project } = req.body;
  if (!project) return res.status(400).json({ error: 'Project key is required' });
  JIRA_PROJECT = project.toUpperCase();
  res.json({ success: true, project: JIRA_PROJECT });
});

// Test Claude API key
app.post('/api/test-api-key', (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'API key is required' });

  const body = JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] });
  const options = {
    hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body) }
  };

  const apiReq = https.request(options, (apiRes) => {
    let data = '';
    apiRes.on('data', chunk => { data += chunk; });
    apiRes.on('end', () => {
      if (apiRes.statusCode === 200) {
        try { const d = JSON.parse(data); res.json({ success: true, model: d.model || 'Claude' }); }
        catch { res.json({ success: true, model: 'Claude' }); }
      } else {
        let errMsg = `API returned status ${apiRes.statusCode}`;
        try { const d = JSON.parse(data); errMsg = d.error?.message || errMsg; } catch {}
        res.status(apiRes.statusCode).json({ error: errMsg });
      }
    });
  });
  apiReq.on('error', (err) => res.status(500).json({ error: err.message }));
  apiReq.setTimeout(10000, () => { apiReq.destroy(); res.status(504).json({ error: 'Connection timed out' }); });
  apiReq.write(body);
  apiReq.end();
});

// Get available products
app.get('/api/products', (req, res) => {
  const productsDir = path.join(BANK_ROOT, 'products');
  try {
    const entries = fs.readdirSync(productsDir, { withFileTypes: true });
    const products = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('TEMPLATE') && !e.name.startsWith('_archived_'))
      .map(e => e.name)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    res.json(products);
  } catch {
    res.json([]);
  }
});

// Add a product
app.post('/api/products', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.json({ success: false, error: 'Product name is required' });
  const safeName = name.trim().replace(/[<>:"/\\|?*]/g, '');
  if (!safeName) return res.json({ success: false, error: 'Invalid product name' });
  const prodDir = path.join(BANK_ROOT, 'products', safeName);
  if (fs.existsSync(prodDir)) return res.json({ success: false, error: 'Product already exists' });
  try {
    fs.mkdirSync(prodDir, { recursive: true });
    fs.mkdirSync(path.join(prodDir, 'questionnaires'), { recursive: true });
    fs.mkdirSync(path.join(prodDir, 'overrides'), { recursive: true });
    res.json({ success: true, name: safeName });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Remove a product (directory only, preserves files by renaming)
app.delete('/api/products/:name', (req, res) => {
  const name = req.params.name;
  const prodDir = path.join(BANK_ROOT, 'products', name);
  if (!fs.existsSync(prodDir)) return res.json({ success: false, error: 'Product not found' });
  try {
    const archiveDir = path.join(BANK_ROOT, 'products', `_archived_${name}_${Date.now()}`);
    fs.renameSync(prodDir, archiveDir);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Add a framework
app.post('/api/frameworks', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.json({ success: false, error: 'Framework name is required' });
  const safeName = name.trim().replace(/[<>:"/\\|?*]/g, '');
  if (!safeName) return res.json({ success: false, error: 'Invalid framework name' });
  const fwDir = path.join(BANK_ROOT, 'frameworks', safeName);
  if (fs.existsSync(fwDir)) return res.json({ success: false, error: 'Framework already exists' });
  try {
    fs.mkdirSync(fwDir, { recursive: true });
    res.json({ success: true, name: safeName });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Remove a framework
app.delete('/api/frameworks/:name', (req, res) => {
  const name = req.params.name;
  const fwDir = path.join(BANK_ROOT, 'frameworks', name);
  if (!fs.existsSync(fwDir)) return res.json({ success: false, error: 'Framework not found' });
  try {
    const archiveDir = path.join(BANK_ROOT, 'frameworks', `_archived_${name}_${Date.now()}`);
    fs.renameSync(fwDir, archiveDir);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Add a version to a framework
app.post('/api/frameworks/:name/versions', (req, res) => {
  const name = req.params.name;
  const { version } = req.body;
  if (!version || !version.trim()) return res.json({ success: false, error: 'Version name is required' });
  const safeVer = version.trim().replace(/[<>:"/\\|?*]/g, '');
  const fwDir = path.join(BANK_ROOT, 'frameworks', name);
  if (!fs.existsSync(fwDir)) return res.json({ success: false, error: 'Framework not found' });
  const verDir = path.join(fwDir, safeVer);
  if (fs.existsSync(verDir)) return res.json({ success: false, error: 'Version already exists' });
  try {
    fs.mkdirSync(verDir, { recursive: true });
    fs.mkdirSync(path.join(verDir, 'completed'), { recursive: true });
    res.json({ success: true, version: safeVer });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Remove a version from a framework
app.delete('/api/frameworks/:name/versions/:version', (req, res) => {
  const { name, version } = req.params;
  const verDir = path.join(BANK_ROOT, 'frameworks', name, version);
  if (!fs.existsSync(verDir)) return res.json({ success: false, error: 'Version not found' });
  try {
    const archiveDir = path.join(BANK_ROOT, 'frameworks', name, `_archived_${version}_${Date.now()}`);
    fs.renameSync(verDir, archiveDir);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Get current Jira configuration status
app.get('/api/jira/status', (req, res) => {
  res.json({
    configured: !!(ATLASSIAN_BASE && ATLASSIAN_EMAIL && ATLASSIAN_TOKEN),
    base: ATLASSIAN_BASE ? ATLASSIAN_BASE.split('//')[1] || ATLASSIAN_BASE : 'Not configured',
    email: ATLASSIAN_EMAIL ? '***@***' : 'Not configured'
  });
});

// Get current Confluence configuration status
app.get('/api/confluence/status', (req, res) => {
  res.json({
    configured: !!(ATLASSIAN_BASE && ATLASSIAN_EMAIL && ATLASSIAN_TOKEN),
    baseUrl: ATLASSIAN_BASE ? `${ATLASSIAN_BASE}/wiki` : 'Not configured',
    email: ATLASSIAN_EMAIL || 'Not configured',
    enabledConfluence: !!(ATLASSIAN_BASE && ATLASSIAN_EMAIL && ATLASSIAN_TOKEN)
  });
});

// Test Confluence connection
app.post('/api/confluence/test', (req, res) => {
  if (!ATLASSIAN_BASE || !ATLASSIAN_AUTH) {
    return res.status(400).json({ error: 'Confluence not configured' });
  }

  const options = {
    hostname: new URL(ATLASSIAN_BASE).hostname,
    path: '/wiki/rest/api/space?limit=5',
    method: 'GET',
    headers: {
      'Authorization': `Basic ${ATLASSIAN_AUTH}`,
      'Accept': 'application/json'
    }
  };

  const testReq = https.request(options, (testRes) => {
    let data = '';
    testRes.on('data', chunk => { data += chunk; });
    testRes.on('end', () => {
      if (testRes.statusCode === 200) {
        try {
          const parsed = JSON.parse(data);
          const spaces = (parsed.results || []).map(s => s.name);
          res.json({ success: true, message: `Connected! Found ${spaces.length} spaces`, spaces });
        } catch {
          res.json({ success: true, message: 'Connected to Confluence' });
        }
      } else {
        res.status(testRes.statusCode).json({ error: `Confluence returned status ${testRes.statusCode}` });
      }
    });
  });

  testReq.on('error', (err) => {
    res.status(400).json({ error: `Connection failed: ${err.message}` });
  });
  testReq.end();
});

// Test Jira connection
app.post('/api/jira/test', (req, res) => {
  if (!ATLASSIAN_BASE || !ATLASSIAN_AUTH) {
    return res.status(400).json({ error: 'Jira not configured' });
  }

  const options = {
    hostname: new URL(ATLASSIAN_BASE).hostname,
    path: '/rest/api/3/myself',
    method: 'GET',
    headers: {
      'Authorization': `Basic ${ATLASSIAN_AUTH}`,
      'Content-Type': 'application/json'
    }
  };

  const testReq = https.request(options, (testRes) => {
    let data = '';
    testRes.on('data', chunk => { data += chunk; });
    testRes.on('end', () => {
      if (testRes.statusCode === 200) {
        try {
          const user = JSON.parse(data);
          res.json({ success: true, message: `Connected as ${user.displayName || user.emailAddress}` });
        } catch {
          res.json({ success: true, message: 'Connected to Jira' });
        }
      } else {
        res.status(testRes.statusCode).json({ error: `Jira returned status ${testRes.statusCode}` });
      }
    });
  });

  testReq.on('error', (err) => {
    res.status(400).json({ error: `Connection failed: ${err.message}` });
  });
  testReq.end();
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
        return { type: 'document', text: text.substring(0, 30000), preview: text.substring(0, 1000) };
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

    case '.pptx': {
      const AdmZip = require('adm-zip');
      try {
        const zip = new AdmZip(filePath);
        const entries = zip.getEntries().filter(e => /^ppt\/slides\/slide\d+\.xml$/i.test(e.entryName));
        entries.sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true }));
        const text = entries.map((e, i) => {
          const xml = e.getData().toString('utf-8');
          const clean = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          return `[Slide ${i + 1}] ${clean}`;
        }).join('\n\n');
        return { type: 'document', text: text.substring(0, 30000), preview: text.substring(0, 1000), slideCount: entries.length };
      } catch {
        return { type: 'document', text: '', preview: '', error: 'Could not parse .pptx file' };
      }
    }

    case '.html':
    case '.htm':
    case '.xml': {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const text = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return { type: 'document', text: text.substring(0, 30000), preview: text.substring(0, 1000) };
    }

    case '.rtf': {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const text = raw.replace(/\{\\[^{}]*\}/g, '').replace(/\\[a-z]+\d*\s?/gi, '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
      return { type: 'document', text: text.substring(0, 30000), preview: text.substring(0, 1000) };
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
  const { messages, apiKey, model, product, attachedFiles, searchConfluence: doConfluence = true, searchJira: doJira = true } = req.body;

  if (!apiKey) return res.status(400).json({ error: 'Anthropic API key required' });

  // Set SSE headers for streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const knowledgeBase = await loadKnowledgeBase(product);

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

    // Search Confluence and Jira in parallel based on user's question and settings
    const searchParts = [];
    if (doConfluence) searchParts.push('Confluence');
    if (doJira) searchParts.push('Jira');
    if (searchParts.length > 0) {
      res.write(`data: ${JSON.stringify({ type: 'status', message: `Searching ${searchParts.join(' & ')}...` })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ type: 'status', message: 'Searching local answer bank...' })}\n\n`);
    }

    const [confluenceResults, jiraResults] = await Promise.all([
      doConfluence ? searchConfluence(latestMsg, 5) : Promise.resolve([]),
      doJira ? searchJira(`project = ${JIRA_PROJECT} AND text ~ "${latestMsg.replace(/"/g, '\\"').substring(0, 100)}" ORDER BY updated DESC`, 5)
        .catch(() => searchJira(`project = ${JIRA_PROJECT} ORDER BY updated DESC`, 5)) : Promise.resolve([])
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

${product ? `ACTIVE PRODUCT: ${product}
You are answering questions specifically for "${product}". All product-specific answers MUST come from the ${product} section of the answer bank. Do NOT use answers belonging to other products.` : 'No specific product selected. If a question is about a specific product, only use that product\'s answers from the bank.'}

1. LOCAL SECURITY ANSWER BANK - Organization's Q&A pairs organized by security categories, product-specific answers${product ? ` (filtered to ${product})` : ''}, policy summaries, past completed questionnaires, and framework responses
2. CONFLUENCE - Live pages from lmsportal.atlassian.net with official security policies, product documentation, and procedures
3. JIRA - Live ISC project tickets tracking security questionnaire work for clients
4. ATTACHED FILES - Any files the user uploads for analysis

CRITICAL INSTRUCTIONS FOR ANSWERING:
- NEVER mix answers between products. Each product (SafeLMS, TargetSolutions, Convergence, Check It, etc.) may have different answers to the same question. Using one product's answer for another is WRONG.
- When the local answer bank has a Q&A pair that matches (even with placeholder text like "[Your answer here]"), use the QUESTION as a guide for what to answer, then pull the ACTUAL answer from Confluence pages, policies, or your security knowledge
- Product-specific answers take priority: ${product ? `check products/${product}/ first` : 'check the relevant product folder first'}
- Organization-wide answers (from categories/) are shared and can be used as fallback for any product
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

CONFLICT HANDLING:
- If multiple sources give DIFFERENT answers to the same question, explicitly surface the conflict. Example:
  > **Note: Conflicting sources detected.**
  > - Local KB (encryption.md): AES-128
  > - Confluence (Security Policy): AES-256
  > The product-specific answer takes priority. Please verify with your security team.
- Never silently pick one answer when sources disagree — always show the conflict.

INCOMPLETE DATA HANDLING:
- If the ${product || 'selected product'} has no answer bank data for a question, say so explicitly:
  > **No product-specific data found for ${product || 'this product'}.** Below is a general answer based on organization-wide policies. [NEEDS REVIEW]
- Do NOT guess or make up product-specific technical details. Flag them clearly.

MULTI-PRODUCT HANDLING:
- If the user asks about a different product than the one selected, answer for the product they asked about and note the mismatch.
- If the user asks about multiple products, give separate answers for each and clearly label them.

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
      // Handle non-200 responses (auth errors, rate limits, etc.)
      if (apiRes.statusCode !== 200) {
        let errBody = '';
        apiRes.on('data', (chunk) => { errBody += chunk.toString(); });
        apiRes.on('end', () => {
          let errMsg = `Anthropic API error (${apiRes.statusCode})`;
          try {
            const parsed = JSON.parse(errBody);
            errMsg = parsed.error?.message || parsed.message || errMsg;
          } catch {}
          res.write(`data: ${JSON.stringify({ type: 'error', message: errMsg })}\n\n`);
          res.write('data: {"type":"done"}\n\n');
          res.end();
        });
        return;
      }

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
    const knowledgeBase = await loadKnowledgeBase(product);

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

    // Second pass: search Confluence for low-confidence answers
    const lowConf = allAnswers.filter(a => a.confidence === 'low' || !a.answer);
    if (lowConf.length > 0) {
      sendEvent('progress', { step: `Searching Confluence for ${lowConf.length} uncertain answers...`, percent: 87 });
      for (let i = 0; i < lowConf.length; i += 5) {
        const batch = lowConf.slice(i, i + 5);
        const confResults = [];
        for (const a of batch) {
          const keywords = (a.question || '').replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3).slice(0, 5).join(' ');
          if (keywords) {
            const results = await searchConfluence(keywords, 3);
            if (results.length > 0) {
              confResults.push({ targetId: a.id, question: a.question, confluenceContext: results.map(r => `[${r.title}] ${r.excerpt}`).join('\n\n') });
            }
          }
        }
        if (confResults.length > 0) {
          try {
            const batchForFill = batch.map(a => ({ targetId: a.id, targetQuestion: a.question }));
            const supplemented = await fillFromSources(apiKey, batchForFill, confResults, knowledgeBase, product);
            for (const sa of supplemented) {
              const orig = allAnswers.find(a => a.id === sa.targetId);
              if (orig && sa.answer && sa.answer.trim()) {
                orig.answer = sa.answer;
                orig.confidence = sa.confidence || 'medium';
                orig.source = (orig.source || '') + (orig.source ? ' + ' : '') + (sa.source || 'Confluence');
              }
            }
          } catch (e) { console.error('Confluence supplement error:', e.message); }
        }
      }
    }

    sendEvent('progress', { step: 'Writing output file...', percent: 90 });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outputName = `completed-questionnaire-${timestamp}.xlsx`;
    const outputPath = path.join(OUTPUT_DIR, outputName);
    writeOutputExcel(allAnswers, outputPath, {
      originalFilePath: filePath,
      sheetName: sheetName || workbook.SheetNames[0],
      questionColumn,
      idColumn,
      questions
    });

    // Collect flags for data quality summary
    const flagged = allAnswers.filter(a => a.flags && a.flags.length > 0);
    const conflicts = allAnswers.filter(a => a.flags?.includes('conflict'));
    const noData = allAnswers.filter(a => a.flags?.includes('no-product-data'));
    const needsReview = allAnswers.filter(a => a.flags?.includes('needs-review') || (a.answer || '').includes('[NEEDS REVIEW]'));
    const crossProduct = allAnswers.filter(a => a.flags?.includes('cross-product'));

    if (flagged.length > 0) {
      sendEvent('progress', { step: `Data quality: ${conflicts.length} conflicts, ${noData.length} missing product data, ${needsReview.length} need review`, percent: 95 });
    }

    sendEvent('complete', {
      outputFile: outputName,
      totalQuestions: questions.length,
      highConfidence: allAnswers.filter(a => a.confidence === 'high').length,
      mediumConfidence: allAnswers.filter(a => a.confidence === 'medium').length,
      lowConfidence: allAnswers.filter(a => a.confidence === 'low').length,
      flagged: flagged.length,
      conflicts: conflicts.length,
      noProductData: noData.length,
      needsReview: needsReview.length,
      crossProduct: crossProduct.length,
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
  const results = await searchJira(req.query.jql || `project = ${JIRA_PROJECT} ORDER BY updated DESC`, parseInt(req.query.limit) || 10);
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
    const jqlEnc = encodeURIComponent(`project = ${JIRA_PROJECT} ORDER BY updated DESC`);
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
    const jqlEnc = encodeURIComponent(`project = ${JIRA_PROJECT} ORDER BY updated DESC`);
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
  let jql = `project = ${JIRA_PROJECT}`;
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
    const jqlEnc = encodeURIComponent(`project = ${JIRA_PROJECT} ORDER BY updated DESC`);
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
  let jql = `project = ${JIRA_PROJECT}`;
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
    jql = `project = ${JIRA_PROJECT} AND duedate >= "${startDate}" AND duedate <= "${endDate}" ORDER BY duedate ASC`;
  } else {
    jql = `project = ${JIRA_PROJECT} AND created >= "${startDate}" AND created <= "${endDate}" ORDER BY created ASC`;
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
        `project = ${JIRA_PROJECT} AND created >= "${startDate}" AND created <= "${endDate}" ORDER BY created ASC`
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
      if (!entry.isDirectory() || entry.name.startsWith('_archived_')) continue;
      const versions = fs.readdirSync(path.join(fwDir, entry.name), { withFileTypes: true })
        .filter(e => e.isDirectory() && !e.name.startsWith('_archived_'))
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
        if (!product) return res.status(400).json({ error: 'Product is required for product import' });
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

    // Second pass: fill unanswered questions using Confluence + answer bank
    const unanswered = allMappings.filter(m => !m.migratedAnswer || m.matchConfidence === 'none');
    if (unanswered.length > 0) {
      sendEvent('progress', { step: `Searching Confluence & answer bank for ${unanswered.length} unanswered questions...`, percent: 92 });

      const knowledgeBase = await loadKnowledgeBase('');

      // Search Confluence for unanswered questions in batches
      const confBatchSize = 5;
      for (let i = 0; i < unanswered.length; i += confBatchSize) {
        const batch = unanswered.slice(i, i + confBatchSize);
        const percent = 92 + Math.round(((i + confBatchSize) / unanswered.length) * 6);
        sendEvent('progress', { step: `Searching sources for questions ${i + 1}-${Math.min(i + confBatchSize, unanswered.length)} of ${unanswered.length}...`, percent });

        // Search Confluence for each question
        const confResults = [];
        for (const m of batch) {
          const keywords = (m.targetQuestion || '').replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3).slice(0, 5).join(' ');
          if (keywords) {
            const results = await searchConfluence(keywords, 3);
            if (results.length > 0) {
              confResults.push({ targetId: m.targetId, question: m.targetQuestion, confluenceContext: results.map(r => `[${r.title}] ${r.excerpt}`).join('\n\n') });
            }
          }
        }

        // Use Claude to draft answers from Confluence + answer bank
        if (confResults.length > 0 || knowledgeBase.length > 100) {
          try {
            const supplementAnswers = await fillFromSources(apiKey, batch, confResults, knowledgeBase, '');
            for (const sa of supplementAnswers) {
              const mapping = allMappings.find(m => m.targetId === sa.targetId);
              if (mapping && sa.answer && sa.answer.trim()) {
                mapping.migratedAnswer = sa.answer;
                mapping.matchConfidence = sa.confidence || 'low';
                mapping.sourceId = sa.source || 'Confluence/KB';
                mapping.notes = (mapping.notes || '') + ' [Supplemented from ' + (sa.source || 'Confluence/KB') + ']';
              }
            }
          } catch (e) {
            console.error('Supplement pass error:', e.message);
          }
        }
      }
    }

    const finalUnmapped = allMappings.filter(m => !m.migratedAnswer || m.matchConfidence === 'none').length;
    sendEvent('progress', { step: `Migration complete! ${allMappings.length - finalUnmapped} answered, ${finalUnmapped} need manual review`, percent: 100 });

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

function fillFromSources(apiKey, unansweredBatch, confluenceResults, knowledgeBase, product) {
  return new Promise((resolve, reject) => {
    const confContext = confluenceResults.map(cr =>
      `[Question: ${cr.question}]\nConfluence findings:\n${cr.confluenceContext}`
    ).join('\n\n---\n\n');

    const questions = unansweredBatch.map(m => `[${m.targetId}] ${m.targetQuestion}`).join('\n');

    const prompt = `You are a security questionnaire answering assistant. These questions could NOT be matched to any previous questionnaire answers. Try to answer them using the Confluence content and knowledge base below.

${product ? `ACTIVE PRODUCT: ${product}\nAll answers MUST be specific to "${product}". Do NOT use answers from other products.` : ''}

CONFLUENCE SEARCH RESULTS:
${confContext || '(No Confluence results found)'}

KNOWLEDGE BASE (answer bank, policies, past questionnaires):
${knowledgeBase.substring(0, 120000)}

QUESTIONS TO ANSWER:
${questions}

For each question, provide the best answer you can from the sources above. Return a JSON array:
[{"targetId": "...", "answer": "the answer or empty string if truly cannot answer", "source": "Confluence|Local KB|Policy|AI-drafted", "confidence": "high|medium|low"}]

RULES:
- If Confluence or the knowledge base has relevant info, use it to compose a professional answer
${product ? `- CRITICAL: Only use answers specific to ${product}. Never cross-contaminate with other products' answers.` : ''}
- Mark source as "Confluence" if the answer came primarily from Confluence pages
- Mark source as "Local KB" if from the answer bank
- Mark source as "AI-drafted" if you had to compose it from general security knowledge
- If you truly cannot answer, set answer to "" and confidence to "low"
- Keep answers professional and concise

Respond ONLY with the JSON array.`;

    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
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
            resolve([]);
          }
        } catch (err) {
          resolve([]);
        }
      });
    });

    req.on('error', () => resolve([]));
    req.setTimeout(120000, () => { req.destroy(); resolve([]); });
    req.write(body);
    req.end();
  });
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

// --- Multi-Provider AI Functions ---

// API endpoint to set AI provider
app.post('/api/ai/provider', (req, res) => {
  const { provider, apiKey, model } = req.body;
  if (!provider || !apiKey) return res.status(400).json({ error: 'Provider and API key required' });
  aiProviderConfigs[provider] = { apiKey, model: model || AI_MODELS[provider]?.default };
  res.json({ success: true, provider, model: aiProviderConfigs[provider].model });
});

// Get available providers and models
app.get('/api/ai/providers', (req, res) => {
  const configured = {};
  for (const [provider, config] of Object.entries(aiProviderConfigs)) {
    configured[provider] = { ...AI_MODELS[provider], activeModel: config.model };
  }
  res.json({ available: AI_MODELS, configured });
});

// Call AI provider based on config
async function callAIProvider(provider, model, systemPrompt, userMessages, onChunk) {
  const config = aiProviderConfigs[provider];
  if (!config) throw new Error(`AI provider ${provider} not configured`);

  switch (provider) {
    case 'claude':
      return callClaudeStreamAPI(config.apiKey, model, systemPrompt, userMessages, onChunk);
    case 'openai':
      return callOpenAIAPI(config.apiKey, model, systemPrompt, userMessages, onChunk);
    case 'gemini':
      return callGeminiAPI(config.apiKey, model, systemPrompt, userMessages, onChunk);
    case 'cohere':
      return callCohereAPI(config.apiKey, model, systemPrompt, userMessages, onChunk);
    case 'huggingface':
      return callHuggingFaceAPI(config.apiKey, model, systemPrompt, userMessages, onChunk);
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}

// Claude API call (multi-provider streaming)
async function callClaudeStreamAPI(apiKey, model, systemPrompt, userMessages, onChunk) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: userMessages
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
      res.on('data', chunk => {
        data += chunk;
        try {
          const lines = data.split('\n');
          for (let i = 0; i < lines.length - 1; i++) {
            if (lines[i].startsWith('data: ')) {
              const event = JSON.parse(lines[i].slice(6));
              if (event.type === 'content_block_delta' && event.delta?.text) {
                onChunk(event.delta.text);
              }
            }
          }
          data = lines[lines.length - 1];
        } catch (e) { }
      });
      res.on('end', () => {
        try {
          const response = JSON.parse(data.replace(/^data: /, ''));
          resolve(response.content[0]?.text || '');
        } catch (e) {
          reject(new Error('Failed to parse Claude response'));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// OpenAI API call
async function callOpenAIAPI(apiKey, model, systemPrompt, userMessages, onChunk) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      max_tokens: 4096,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        ...userMessages
      ]
    });

    const options = {
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let buffer = '';
      res.on('data', chunk => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines[lines.length - 1];
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.choices?.[0]?.delta?.content) {
                onChunk(data.choices[0].delta.content);
              }
            } catch (e) { }
          }
        }
      });
      res.on('end', () => resolve(''));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Google Gemini API call
async function callGeminiAPI(apiKey, model, systemPrompt, userMessages, onChunk) {
  return new Promise((resolve, reject) => {
    const contents = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      ...userMessages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }))
    ];

    const body = JSON.stringify({ contents });
    const encodedKey = encodeURIComponent(apiKey);

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${model}:streamGenerateContent?key=${encodedKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => {
        data += chunk.toString();
        try {
          const lines = data.split('\n');
          for (let i = 0; i < lines.length - 1; i++) {
            const json = JSON.parse(lines[i]);
            if (json.candidates?.[0]?.content?.parts?.[0]?.text) {
              onChunk(json.candidates[0].content.parts[0].text);
            }
          }
          data = lines[lines.length - 1];
        } catch (e) { }
      });
      res.on('end', () => resolve(''));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Cohere API call
async function callCohereAPI(apiKey, model, systemPrompt, userMessages, onChunk) {
  return new Promise((resolve, reject) => {
    const messages = [
      { role: 'user', message: systemPrompt },
      ...userMessages.map(m => ({
        role: m.role,
        message: m.content
      }))
    ];

    const body = JSON.stringify({
      model,
      max_tokens: 4096,
      stream: true,
      messages
    });

    const options = {
      hostname: 'api.cohere.ai',
      path: '/v1/chat',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let buffer = '';
      res.on('data', chunk => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines[lines.length - 1];
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (line) {
            try {
              const data = JSON.parse(line);
              if (data.text) onChunk(data.text);
            } catch (e) { }
          }
        }
      });
      res.on('end', () => resolve(''));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// HuggingFace API call
async function callHuggingFaceAPI(apiKey, model, systemPrompt, userMessages, onChunk) {
  return new Promise((resolve, reject) => {
    const fullPrompt = systemPrompt + '\n' + userMessages.map(m => `${m.role}: ${m.content}`).join('\n');

    const body = JSON.stringify({
      inputs: fullPrompt,
      parameters: {
        max_new_tokens: 4096,
        do_sample: true,
        temperature: 0.7
      }
    });

    const options = {
      hostname: 'api-inference.huggingface.co',
      path: `/models/${model}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => {
        data += chunk.toString();
        onChunk(chunk.toString());
      });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response[0]?.generated_text || '');
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
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
        // Mark PDF for async parsing — will be handled by parsePDFs()
        results.push({ file: path.relative(BANK_ROOT, fullPath).replace(/\\/g, '/'), content: '', _pdfPath: fullPath });
      } else if (/\.(pptx)$/i.test(entry.name)) {
        try {
          const AdmZip = require('adm-zip');
          const zip = new AdmZip(fullPath);
          let pptText = `[PowerPoint: ${entry.name}]\n`;
          const slideEntries = zip.getEntries().filter(e => /^ppt\/slides\/slide\d+\.xml$/i.test(e.entryName)).sort((a, b) => a.entryName.localeCompare(b.entryName));
          slideEntries.forEach((slide, i) => {
            const xml = slide.getData().toString('utf-8');
            const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            if (text.length > 10) pptText += `\nSlide ${i + 1}:\n${text}\n`;
          });
          if (pptText.length > 50) {
            results.push({ file: path.relative(BANK_ROOT, fullPath).replace(/\\/g, '/'), content: pptText.substring(0, 30000) });
          }
        } catch { /* skip */ }
      } else if (/\.(html?|xml)$/i.test(entry.name)) {
        try {
          const raw = fs.readFileSync(fullPath, 'utf-8');
          const text = raw.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
          if (text.length > 20) {
            const label = entry.name.endsWith('.xml') ? 'XML' : 'HTML';
            results.push({ file: path.relative(BANK_ROOT, fullPath).replace(/\\/g, '/'), content: `[${label}: ${entry.name}]\n${text.substring(0, 30000)}` });
          }
        } catch { /* skip */ }
      } else if (/\.(rtf)$/i.test(entry.name)) {
        try {
          const raw = fs.readFileSync(fullPath, 'utf-8');
          // Basic RTF text extraction: strip control words and groups
          const text = raw.replace(/\{\\[^{}]*\}/g, '').replace(/\\[a-z]+\d*\s?/gi, '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
          if (text.length > 20) {
            results.push({ file: path.relative(BANK_ROOT, fullPath).replace(/\\/g, '/'), content: `[RTF: ${entry.name}]\n${text.substring(0, 30000)}` });
          }
        } catch { /* skip */ }
      }
    }
  } catch { /* skip */ }
  return results;
}

async function parsePDFs(files) {
  const pdfParse = require('pdf-parse');
  for (const f of files) {
    if (f._pdfPath) {
      try {
        const buffer = fs.readFileSync(f._pdfPath);
        const data = await pdfParse(buffer);
        f.content = `[PDF: ${path.basename(f._pdfPath)}] (${data.numpages} pages)\n${data.text.substring(0, 30000)}`;
        delete f._pdfPath;
      } catch (e) {
        f.content = `[PDF: ${path.basename(f._pdfPath)}] (failed to parse: ${e.message})`;
        delete f._pdfPath;
      }
    }
  }
  return files;
}

async function loadKnowledgeBase(product) {
  // --- Get all known product names for scoping ---
  let allProductNames = [];
  try {
    allProductNames = fs.readdirSync(path.join(BANK_ROOT, 'products'), { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('_archived_') && d.name !== 'TEMPLATE')
      .map(d => d.name);
  } catch { }

  // Helper: split files into product-specific vs general
  // A file is product-specific if its path or filename contains a known product name
  function scopeFiles(files, activeProduct) {
    const general = [];
    const forProduct = [];
    const otherProducts = [];
    for (const f of files) {
      const filePath = (f.file || '').toLowerCase();
      let matchedProduct = null;
      for (const pName of allProductNames) {
        if (filePath.includes(pName.toLowerCase())) {
          matchedProduct = pName;
          break;
        }
      }
      if (!matchedProduct) {
        // No product name found — this is a general/shared file
        general.push(f);
      } else if (activeProduct && matchedProduct.toLowerCase() === activeProduct.toLowerCase()) {
        // Matches the active product
        forProduct.push(f);
      } else {
        // Belongs to a different product — exclude when product is selected
        otherProducts.push(f);
      }
    }
    return { general, forProduct, otherProducts };
  }

  // --- Load all shared/org-wide sources (always included) ---
  const categories = readMarkdownFiles(path.join(BANK_ROOT, 'categories'));
  const policies = readMarkdownFiles(path.join(BANK_ROOT, 'policies'));

  // --- Load sources that may contain product-specific files ---
  const allPastQ = readMarkdownFiles(path.join(BANK_ROOT, 'past-questionnaires'));
  const allFrameworks = readMarkdownFiles(path.join(BANK_ROOT, 'frameworks'));
  const allClients = readMarkdownFiles(path.join(BANK_ROOT, 'clients'));
  const allImports = readMarkdownFiles(path.join(BANK_ROOT, 'imports'));

  // Parse PDFs in all collections
  await Promise.all([
    parsePDFs(categories), parsePDFs(policies), parsePDFs(allPastQ),
    parsePDFs(allFrameworks), parsePDFs(allClients), parsePDFs(allImports)
  ]);

  let glossary = '';
  try { glossary = fs.readFileSync(path.join(BANK_ROOT, 'glossary.md'), 'utf-8'); } catch { }

  // --- Scope product-specific files ---
  const scopedPastQ = scopeFiles(allPastQ, product);
  const scopedFW = scopeFiles(allFrameworks, product);
  const scopedClients = scopeFiles(allClients, product);
  const scopedImports = scopeFiles(allImports, product);

  // Files to include: general + product-matched (exclude other products' files)
  const pastQuestionnaires = product ? [...scopedPastQ.general, ...scopedPastQ.forProduct] : allPastQ;
  const frameworks = product ? [...scopedFW.general, ...scopedFW.forProduct] : allFrameworks;
  const clients = product ? [...scopedClients.general, ...scopedClients.forProduct] : allClients;
  const imports = product ? [...scopedImports.general, ...scopedImports.forProduct] : allImports;

  // --- Product section ---
  let productSection = '';
  if (product) {
    const productFiles = readMarkdownFiles(path.join(BANK_ROOT, 'products', product));
    await parsePDFs(productFiles);
    productSection = [
      `\n=== PRODUCT: ${product} (ACTIVE PRODUCT — USE THESE ANSWERS) ===`,
      `IMPORTANT: All answers below are specific to ${product}. Use ONLY these product-specific answers. Do NOT mix in answers from other products.`,
      ...productFiles.map(f => `\n--- ${f.file} ---\n${f.content}`)
    ].join('\n');
  } else {
    // No product selected — load all but clearly label each
    const productsDir = path.join(BANK_ROOT, 'products');
    const sections = [];
    try {
      for (const pName of allProductNames) {
        const pFiles = readMarkdownFiles(path.join(productsDir, pName));
        await parsePDFs(pFiles);
        if (pFiles.length > 0) {
          sections.push(`\n--- PRODUCT: ${pName} ---`);
          sections.push(...pFiles.map(f => `\n${f.file}:\n${f.content}`));
        }
      }
    } catch { }
    productSection = [
      '\n=== ALL PRODUCTS (No specific product selected) ===',
      'WARNING: Multiple products are loaded below. Each product has its own answers. Do NOT mix answers between products. If a question is about a specific product, only use answers from that product section.',
      ...sections
    ].join('\n');
  }

  // --- Label product-matched files in shared sections ---
  const labelFile = (f) => {
    const tag = product ? ` [${product}]` : '';
    return `\n--- ${f.file}${tag} ---\n${f.content}`;
  };

  return [
    '=== CATEGORY ANSWERS (Organization-wide Q&A — applies to ALL products) ===',
    '(Note: Answers marked [Your answer here] are placeholders — use Confluence or your knowledge to draft real answers)',
    ...categories.map(f => `\n--- ${f.file} ---\n${f.content}`),
    '\n=== POLICIES (Organization-wide — applies to ALL products) ===',
    ...policies.map(f => `\n--- ${f.file} ---\n${f.content}`),
    productSection,
    '\n=== PAST COMPLETED QUESTIONNAIRES ===',
    product ? `(Showing: general + ${product}-specific files only. Other products excluded.)` : '',
    ...pastQuestionnaires.map(f => `\n--- ${f.file} ---\n${f.content}`),
    '\n=== FRAMEWORK RESPONSES ===',
    product ? `(Showing: general + ${product}-specific files only. Other products excluded.)` : '',
    ...frameworks.map(f => `\n--- ${f.file} ---\n${f.content}`),
    '\n=== CLIENT CONTEXT ===',
    product ? `(Showing: general + ${product}-specific files only. Other products excluded.)` : '',
    ...clients.map(f => `\n--- ${f.file} ---\n${f.content}`),
    '\n=== IMPORTS ===',
    product ? `(Showing: general + ${product}-specific files only. Other products excluded.)` : '',
    ...imports.map(f => `\n--- ${f.file} ---\n${f.content}`),
    '\n=== GLOSSARY ===',
    glossary
  ].join('\n');
}

function callClaudeAPI(apiKey, questions, knowledgeBase, product) {
  return new Promise((resolve, reject) => {
    const prompt = `You are a security questionnaire answering assistant. Using the knowledge base below, answer each question accurately and professionally.

${product ? `ACTIVE PRODUCT: ${product}
You are answering questions ONLY for the product "${product}". All answers MUST be specific to ${product}. Do NOT use answers from other products. If the knowledge base contains answers for multiple products, ONLY use the section labeled "PRODUCT: ${product}".` : 'No specific product selected. If a question references a specific product, answer for that product only.'}

PRIORITY ORDER FOR ANSWERS:
1. Product-specific answers for ${product || 'the relevant product'} (highest priority — NEVER use another product's answers)
2. Organization-wide category answers (shared across all products)
3. Policy documents
4. Your security knowledge (only if no answer exists in the bank)

RULES:
- CRITICAL: Never mix answers between products. Each product (SafeLMS, TargetSolutions, Convergence, etc.) has its own specific answers. Using Product A's answer for Product B is WRONG.
- If the answer bank has a matching Q&A for the selected product, use that answer (adapt wording if needed)
- Organization-wide answers (from categories/) apply to ALL products and can be used as fallback
- If no match exists, draft a professional answer based on the policies and mark it as [NEEDS REVIEW]
- Keep answers concise but complete
- Use the glossary for consistent terminology

CONFLICT HANDLING:
- If multiple sources give DIFFERENT answers to the same question, flag it: set confidence to "medium", prepend "[CONFLICTING SOURCES] " to the answer, include the best answer, and list the conflicting sources in the "source" field separated by " vs ".
- Example: if categories/encryption.md says "AES-128" but products/${product || 'X'}/overrides says "AES-256", the answer should note both and use the product-specific one as primary.

INCOMPLETE DATA HANDLING:
- If the product has NO data in the answer bank for a question, do NOT guess or use another product's answer.
- Instead, set the answer to "[NO PRODUCT DATA] " followed by a generic industry-standard answer, set confidence to "low", and set source to "AI-drafted (no ${product || 'product'} data)".
- If a question references a product feature that doesn't exist in the knowledge base, say so explicitly: "This information is not available in the ${product || 'selected product'} answer bank. [NEEDS REVIEW]"

MULTI-PRODUCT DETECTION:
- If a question explicitly mentions a product name (e.g., "Does SafeLMS support...", "For TargetSolutions..."), answer ONLY for the named product, even if a different product is selected.
- If this happens, note it in the source: "Answered for [named product] (question specifies product)"
- If the question mentions multiple products, answer for each separately.

Return a JSON array with objects: {"id": "...", "question": "...", "answer": "...", "source": "...", "confidence": "high|medium|low", "flags": []}
The "flags" array can contain: "conflict", "no-product-data", "needs-review", "cross-product" (when question references a different product than selected).

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

function writeOutputExcel(answers, outputPath, originalInfo) {
  try {
    if (originalInfo?.originalFilePath && fs.existsSync(originalInfo.originalFilePath)) {
      // Copy the original file first to preserve everything (styles, formatting, colors, borders, etc.)
      fs.copyFileSync(originalInfo.originalFilePath, outputPath);

      // Re-read the copy so we modify it in place
      const wb = XLSX.readFile(outputPath, { cellStyles: true, cellNF: true, cellDates: true });
      const targetSheet = originalInfo.sheetName || wb.SheetNames[0];
      const ws = wb.Sheets[targetSheet];
      if (!ws) throw new Error('Sheet not found');

      // Get sheet range
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

      // Read header row to find columns
      const headers = {};
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r: range.s.r, c })];
        if (cell && cell.v != null) headers[String(cell.v).trim()] = c;
      }

      // Find the question and ID columns by index
      const qColName = originalInfo.questionColumn;
      const idColName = originalInfo.idColumn;
      const qColIdx = qColName ? headers[qColName] : undefined;
      const idColIdx = idColName ? headers[idColName] : undefined;

      // Find existing answer/response column
      const ansColEntry = Object.entries(headers).find(([name]) =>
        /^(answer|response|reply|vendor.?response|assessment)/i.test(name)
      );
      const existingAnsColIdx = ansColEntry ? ansColEntry[1] : null;

      // Determine where to write AI answers: use existing answer column, or append new columns after last
      const lastCol = range.e.c;
      const aiAnsColIdx = existingAnsColIdx != null ? existingAnsColIdx : lastCol + 1;
      const aiSourceColIdx = lastCol + (existingAnsColIdx != null ? 1 : 2);
      const aiConfColIdx = lastCol + (existingAnsColIdx != null ? 2 : 3);
      const aiFlagsColIdx = lastCol + (existingAnsColIdx != null ? 3 : 4);

      // Write header labels for new columns (only if we're appending)
      if (existingAnsColIdx == null) {
        ws[XLSX.utils.encode_cell({ r: range.s.r, c: aiAnsColIdx })] = { t: 's', v: 'AI Answer' };
      }
      ws[XLSX.utils.encode_cell({ r: range.s.r, c: aiSourceColIdx })] = { t: 's', v: 'Source' };
      ws[XLSX.utils.encode_cell({ r: range.s.r, c: aiConfColIdx })] = { t: 's', v: 'Confidence' };
      ws[XLSX.utils.encode_cell({ r: range.s.r, c: aiFlagsColIdx })] = { t: 's', v: 'Flags' };

      // Build answer lookup by ID and by question text
      const answerByID = {};
      const answerByQ = {};
      for (const a of answers) {
        if (a.id) answerByID[String(a.id).trim()] = a;
        if (a.question) answerByQ[a.question.trim().toLowerCase()] = a;
      }

      // Write answers into cells row by row
      for (let r = range.s.r + 1; r <= range.e.r; r++) {
        // Get row ID
        let rowId = '';
        if (idColIdx != null) {
          const idCell = ws[XLSX.utils.encode_cell({ r, c: idColIdx })];
          if (idCell && idCell.v != null) rowId = String(idCell.v).trim();
        }

        // Get row question
        let rowQ = '';
        if (qColIdx != null) {
          const qCell = ws[XLSX.utils.encode_cell({ r, c: qColIdx })];
          if (qCell && qCell.v != null) rowQ = String(qCell.v).trim();
        }

        // Match answer
        let match = answerByID[rowId];
        if (!match && rowQ) match = answerByQ[rowQ.toLowerCase()];

        if (match) {
          // Write answer into the cell
          ws[XLSX.utils.encode_cell({ r, c: aiAnsColIdx })] = { t: 's', v: match.answer || '' };
          ws[XLSX.utils.encode_cell({ r, c: aiSourceColIdx })] = { t: 's', v: match.source || '' };
          ws[XLSX.utils.encode_cell({ r, c: aiConfColIdx })] = { t: 's', v: match.confidence || 'low' };
          ws[XLSX.utils.encode_cell({ r, c: aiFlagsColIdx })] = { t: 's', v: (match.flags || []).join(', ') };
        }
      }

      // Expand the sheet range to include new columns
      const newLastCol = Math.max(range.e.c, aiFlagsColIdx);
      ws['!ref'] = XLSX.utils.encode_range({
        s: range.s,
        e: { r: range.e.r, c: newLastCol }
      });

      // Set column widths for new columns
      if (!ws['!cols']) ws['!cols'] = [];
      while (ws['!cols'].length <= newLastCol) ws['!cols'].push({ wch: 15 });
      ws['!cols'][aiAnsColIdx] = { wch: 80 };
      ws['!cols'][aiSourceColIdx] = { wch: 30 };
      ws['!cols'][aiConfColIdx] = { wch: 12 };
      ws['!cols'][aiFlagsColIdx] = { wch: 25 };

      // Write back — the original file was already copied, so all other sheets/formatting are intact
      XLSX.writeFile(wb, outputPath);
      return;
    }
  } catch (e) {
    console.error('Original format export failed, using generic:', e.message);
  }

  // Fallback: generic export
  const data = answers.map(a => ({
    'Question ID': a.id || '',
    'Question': a.question || '',
    'Answer': a.answer || '',
    'Source': a.source || '',
    'Confidence': a.confidence || 'low',
    'Flags': (a.flags || []).join(', '),
    'Needs Review': (a.confidence === 'low' || (a.flags || []).length > 0) ? 'YES' : 'NO'
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    { wch: 14 }, { wch: 60 }, { wch: 80 }, { wch: 30 }, { wch: 12 }, { wch: 25 }, { wch: 14 }
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
app.get('/api/debug/bank-stats', async (req, res) => {
  const categories = readMarkdownFiles(path.join(BANK_ROOT, 'categories'));
  const policies = readMarkdownFiles(path.join(BANK_ROOT, 'policies'));
  const products = readMarkdownFiles(path.join(BANK_ROOT, 'products'));
  const pastQ = readMarkdownFiles(path.join(BANK_ROOT, 'past-questionnaires'));
  const frameworks = readMarkdownFiles(path.join(BANK_ROOT, 'frameworks'));
  const clients = readMarkdownFiles(path.join(BANK_ROOT, 'clients'));
  const imports = readMarkdownFiles(path.join(BANK_ROOT, 'imports'));
  const kb = await loadKnowledgeBase('');
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
