# Client Profiles

Store client-specific context that affects how you answer their questionnaires.
Different clients care about different things — some are HIPAA-focused, some want
FedRAMP, some are in higher ed (HECVAT), etc.

## Why This Matters
- A healthcare client needs HIPAA-focused language
- A university needs FERPA/HECVAT alignment
- A financial client needs SOX/PCI emphasis
- Knowing the client's industry helps tailor tone and detail level

## File Format
Create one file per client: `client-name.md`

```markdown
# [Client Name]

## Industry
[e.g., Higher Education, Healthcare, Financial Services, Government]

## Key Concerns
[What they care most about — e.g., HIPAA compliance, data residency, FERPA]

## Required Frameworks
[e.g., HECVAT Full, SIG Core, custom questionnaire]

## Products Evaluated
[Which of our products they're assessing]

## Special Requirements
[Any unique requirements — e.g., US-only data residency, specific encryption needs]

## Contact
[Client security contact, if known]

## History
- [Date] — [What questionnaire was completed]
```

## Examples
- `acme-university.md`
- `bigbank-financial.md`
- `county-fire-department.md`
