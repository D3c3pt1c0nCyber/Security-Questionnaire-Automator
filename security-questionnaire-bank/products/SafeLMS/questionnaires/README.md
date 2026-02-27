# SafeLMS — Completed Questionnaires

Answered questionnaires for SafeLMS are stored here after processing.

## Naming Convention
`YYYY-MM-DD-client-name-description.ext`

Examples:
- `2026-02-26-acme-corp-vendor-security-assessment.xlsx`
- `2026-03-15-bigbank-due-diligence.pdf`
- `2026-04-01-techco-safelms-security-review.docx`

## Flow
1. New questionnaire dropped in `imports/`
2. Claude Code answers it using the knowledge base
3. Completed file moved here automatically
