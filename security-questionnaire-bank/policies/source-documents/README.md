# Source Documents

Drop your full policy documents here. Claude Code can read these directly
when answering questionnaires.

## Supported Formats
- PDF (.pdf)
- Word (.docx)
- Excel (.xlsx)
- Text / Markdown (.txt, .md)
- PowerPoint (.pptx)

## Naming Convention
Use descriptive names so Claude Code can find the right document:
- `Information-Security-Policy-v3.2.pdf`
- `Incident-Response-Plan-2025.docx`
- `Data-Classification-Standard.pdf`
- `SOC2-Type-II-Report-2025.pdf`
- `Acceptable-Use-Policy.pdf`
- `Business-Continuity-Plan.docx`
- `Vendor-Risk-Management-Policy.pdf`
- `Employee-Handbook-Security-Section.pdf`
- `Network-Architecture-Diagram.pdf`
- `Encryption-Standard.pdf`

## How It Works
- The summary files in `policies/` (e.g., `information-security-policy.md`) capture
  the key points for quick lookups
- The full documents here serve as the **source of truth** when deeper detail is needed
- Claude Code will read the relevant source document when a summary doesn't have
  enough detail to answer a questionnaire question
