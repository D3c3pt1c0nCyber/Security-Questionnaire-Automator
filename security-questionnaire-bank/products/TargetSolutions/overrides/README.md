# TargetSolutions — Answer Overrides

This folder contains product-specific answers that **override** the generic
answers in `categories/`.

## How It Works
When answering a questionnaire for TargetSolutions:
1. Claude Code first checks `products/TargetSolutions/overrides/` for a product-specific answer
2. If no override exists, it falls back to the generic answer in `categories/`
3. Product details from `products/TargetSolutions/profile.md` are used to fill in specifics

## File Naming
Use the same filenames as `categories/` so overrides are easy to match:
- `encryption.md` — TargetSolutions-specific encryption answers
- `compliance.md` — TargetSolutions-specific compliance answers
- etc.

Only create override files for domains where TargetSolutions differs from the org-wide answer.
