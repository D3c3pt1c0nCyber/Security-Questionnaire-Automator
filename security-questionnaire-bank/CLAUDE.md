# Security Questionnaire Knowledge Base

## Purpose
This project is a security questionnaire data bank. It stores canonical answers,
policies, and past questionnaire responses to help efficiently and accurately
answer new security questionnaires. It supports **multiple products** — each
product can have its own answers that override the organization-wide defaults.

## How to Use

### Answering a New Questionnaire
When asked to answer a security questionnaire, **always ask which product** and
**which framework** (HECVAT, SIG, or custom) if the user doesn't specify.
Then follow this lookup order:

1. Read the incoming questionnaire from `imports/` or as provided by the user
2. **Identify the product** (e.g., SafeLMS, TargetSolutions) and **client** if known
3. Check `clients/[client].md` for client-specific context (industry, concerns, preferences)
4. Read the product profile at `products/[ProductName]/profile.md` for context
4. For each question, use this **answer priority chain**:
   - **First:** Check `products/[ProductName]/overrides/` for a product-specific answer
   - **Then:** Fall back to `categories/` for the org-wide default answer
   - **Enrich:** Use `products/[ProductName]/profile.md` to fill in product-specific details (hosting, compliance certs, architecture, etc.)
5. Cross-reference with `policies/` for accuracy and policy alignment
6. **Supplement with Confluence/JIRA** — if a local answer is missing, incomplete, or
   marked [REVIEW NEEDED], search Confluence for policy docs and JIRA for security
   tickets/evidence using the Atlassian MCP tools
7. **Check prior framework responses** — if answering a HECVAT, check the matching version
   folder (e.g., `frameworks/HECVAT/v4/completed/`) for previously answered HECVATs for the
   same product; same for SIG (e.g., `frameworks/SIG/2026/completed/Core/`).
   Also check the template in `templates/` to understand the expected question structure
8. Check `past-questionnaires/` and `products/[ProductName]/questionnaires/` for tone and detail level
9. Draft answers using the best matching prior responses
10. **Use `glossary.md`** for consistent terminology across all answers
11. **Check `review-schedule.md`** — warn if any referenced category is overdue for review
12. Flag any answer that may be outdated or needs human review with **[REVIEW NEEDED]**
13. Never fabricate compliance claims or certifications

### After Completing a Questionnaire
- Add any new Q&A pairs to the appropriate `categories/` file (org-wide answers)
- Add product-specific answers to `products/[ProductName]/overrides/` (if they differ from org-wide)
- **File the completed questionnaire by type:**
  - HECVAT v4 → `frameworks/HECVAT/v4/completed/YYYY-MM-DD-[Product]-HECVAT-v4.ext`
  - HECVAT v3 Full → `frameworks/HECVAT/v3/completed/Full/YYYY-MM-DD-[Product]-HECVAT-Full.ext`
  - HECVAT v3 Lite → `frameworks/HECVAT/v3/completed/Lite/YYYY-MM-DD-[Product]-HECVAT-Lite.ext`
  - SIG Core → `frameworks/SIG/[year]/completed/Core/YYYY-MM-DD-[Product]-SIG-Core.ext`
  - SIG Lite → `frameworks/SIG/[year]/completed/Lite/YYYY-MM-DD-[Product]-SIG-Lite.ext`
  - Other → `products/[ProductName]/questionnaires/`
- Update `policies/` if new policy details were provided during review
- **Save Confluence/JIRA findings locally** — if answers were sourced from Confluence or JIRA,
  add them to the appropriate local files so future sessions don't need to re-query
- **Update `changelog.md`** — log what was added/changed with date, product, and source
- **Update client profile** — add the questionnaire to the client's history in `clients/`

### Importing Existing Questionnaires
- Place files (PDF, Excel, Word, CSV, text) in the `imports/` folder
- Tell Claude Code which product the questionnaire is for
- Claude Code will parse and distribute answers:
  - Org-wide answers → `categories/`
  - Product-specific answers → `products/[ProductName]/overrides/`
- Move the original file to `products/[ProductName]/questionnaires/` after import

### Adding a New Product
1. Copy `products/TEMPLATE-new-product/` and rename to the product name
2. Fill in `profile.md` with the product's details
3. Add override files in `overrides/` only for domains that differ from org-wide answers

## Directory Structure

```
security-questionnaire-bank/
├── CLAUDE.md                       # This file — project instructions
├── categories/                     # Org-wide default Q&A pairs by security domain
│   ├── access-control.md
│   ├── api-security.md
│   ├── audit.md
│   ├── business-continuity.md
│   ├── cicd-pipeline-security.md
│   ├── cloud-security.md
│   ├── compliance.md
│   ├── container-security.md
│   ├── data-protection.md
│   ├── encryption.md
│   ├── incident-response.md
│   ├── infrastructure.md
│   ├── legal-regulatory.md
│   ├── network-security.md
│   ├── penetration-testing.md
│   ├── privacy.md
│   ├── risk-management.md
│   ├── sdlc.md
│   ├── training-awareness.md
│   ├── vendor-management.md
│   └── vulnerability-management.md
├── products/                       # Product-specific profiles and overrides
│   ├── TEMPLATE-new-product/       # Copy this to create a new product
│   ├── SafeLMS/
│   │   ├── profile.md              # Product details, hosting, certs, architecture
│   │   ├── overrides/              # Answers that differ from org-wide defaults
│   │   └── questionnaires/         # Completed questionnaires for this product
│   └── TargetSolutions/
│       ├── profile.md
│       ├── overrides/
│       └── questionnaires/
├── policies/                       # Source-of-truth policy documents
│   ├── information-security-policy.md    # Summary / key points
│   ├── acceptable-use-policy.md
│   ├── data-classification-policy.md
│   ├── incident-response-plan.md
│   ├── business-continuity-plan.md
│   ├── change-management-policy.md
│   ├── vendor-management-policy.md
│   └── source-documents/                # Full policy docs (PDF, Word, etc.)
│       ├── Information-Security-Policy.pdf
│       ├── Incident-Response-Plan.docx
│       └── ... (drop actual files here)
├── frameworks/                     # Standard questionnaire frameworks
│   ├── HECVAT/
│   │   ├── v4/                     # Latest — unified (Full+Lite+On-Prem merged)
│   │   │   ├── templates/          # HECVAT v4 template (download from EDUCAUSE)
│   │   │   └── completed/          # Answered HECVAT v4 by product & date
│   │   └── v3/                     # Previous — separate Full, Lite, Triage
│   │       ├── templates/          # ✅ Full v3.06, Lite v2.11, Triage v2.10
│   │       └── completed/
│   │           ├── Full/
│   │           └── Lite/
│   └── SIG/                        # Versioned by year
│       ├── 2026/
│       │   ├── templates/{Core,Lite}/
│       │   └── completed/{Core,Lite}/
│       └── 2025/
│           ├── templates/{Core,Lite}/
│           └── completed/{Core,Lite}/
├── clients/                       # Client profiles (industry, concerns, history)
├── glossary.md                    # Standard security terms and acronyms
├── changelog.md                   # Log of all answer updates
├── review-schedule.md             # When each category needs review
├── past-questionnaires/            # Org-level completed questionnaires (non-framework)
└── imports/                        # Drop incoming questionnaires here
```

## Answer Priority Chain (Critical)
```
clients/[client].md                        ← Client context (industry, concerns)
         ↓ informs tone and focus
products/[Product]/overrides/[domain].md   ← Product-specific (highest priority)
         ↓ if not found
categories/[domain].md                     ← Org-wide default
         ↓ enriched by
products/[Product]/profile.md              ← Product details (hosting, certs, etc.)
         ↓ validated against
policies/*.md                              ← Policy summaries (quick lookup)
policies/source-documents/                 ← Full policy docs (deep detail)
         ↓ supplemented by
frameworks/[HECVAT|SIG]/                   ← Prior framework responses + templates
Confluence (via MCP)                       ← Live documentation & policy pages
JIRA (via MCP)                             ← Security tickets, compliance tasks
         ↓ quality checks
glossary.md                                ← Consistent terminology
review-schedule.md                         ← Staleness warnings
changelog.md                               ← Updated after every session
```

## Confluence & JIRA Integration (MCP)
An Atlassian MCP server is configured connecting to `lmsportal.atlassian.net`.
Use it as a **supplemental source** when answering questionnaires.

### When to Query Confluence
- When a local answer in `categories/` or `overrides/` is missing or marked [REVIEW NEEDED]
- When a question asks about specific policies, procedures, or documentation
- When you need the latest version of a policy or architecture document
- Search Confluence spaces for: security policies, architecture docs, compliance pages,
  product documentation, SOC 2 evidence, incident response procedures

### When to Query JIRA
- When a question asks about vulnerability remediation timelines or SLAs
- When you need evidence of security processes (pentest tickets, audit findings)
- When a question asks about change management or release processes
- Search JIRA projects for: security issues, compliance tasks, audit findings,
  vulnerability tickets, change requests

### How to Use
- Use the Atlassian MCP tools to search Confluence pages and JIRA issues
- Search by relevant keywords from the questionnaire question
- When Confluence/JIRA provides a better or more current answer than the local files,
  use the live data and suggest updating the local file afterward
- Always cite the Confluence page or JIRA ticket as the **Source** in the Q&A format

### Source Citation Format
When an answer comes from Confluence or JIRA, cite it as:
```
**Source:** Confluence — "[Page Title]" (Space: [SPACE-KEY])
**Source:** JIRA — [TICKET-KEY] "[Ticket Summary]"
```

## Q&A Format Convention
All category and override files use this format for consistency and searchability:

```markdown
## Q: [Question text]
**A:** [Answer text]
**Last Updated:** [YYYY-MM-DD]
**Source:** [Policy reference or past questionnaire]
**Tags:** [comma-separated keywords]
```

## Search Tips
- Use keyword search across `categories/` to find relevant answers
- Search by tags for cross-cutting topics
- Check multiple category files — some questions span domains
- When searching for a product, always check `products/[ProductName]/overrides/` first
