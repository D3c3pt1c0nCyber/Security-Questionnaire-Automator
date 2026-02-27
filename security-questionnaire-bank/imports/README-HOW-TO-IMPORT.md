# How to Import Existing Questionnaires

## Step 1: Place Files Here
Drop your existing questionnaire files into this `imports/` folder. Supported formats:
- Excel (.xlsx, .xls)
- PDF (.pdf)
- Word (.docx)
- CSV (.csv)
- Text (.txt, .md)

## Step 2: Ask Claude Code to Process
Open Claude Code in the `security-questionnaire-bank/` directory and say:

```
Parse the questionnaire in imports/[filename] and add the Q&A pairs
to the appropriate category files. Then move the original to past-questionnaires/.
```

Or to bulk-import multiple files:

```
Process all files in imports/ — extract Q&A pairs into the matching
category files and move originals to past-questionnaires/.
```

## Step 3: Review
After import, review the updated category files to ensure answers are accurate
and properly categorized. Ask Claude Code to flag anything marked [REVIEW NEEDED].

## Tips
- Name your files descriptively: `2025-client-name-questionnaire.xlsx`
- If a file has company-specific context, mention it when asking Claude Code to import
- You can ask Claude Code to deduplicate answers after importing multiple files
