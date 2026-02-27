# [Product Name] — Answer Overrides

This folder contains product-specific answers that **override** the generic
answers in `categories/`.

## How It Works
1. Claude Code checks `products/[Product Name]/overrides/` first
2. Falls back to `categories/` for anything not overridden
3. Uses `products/[Product Name]/profile.md` for product-specific details

## File Naming
Use the same filenames as `categories/`:
- `encryption.md`, `access-control.md`, `compliance.md`, etc.

Only create files for domains where this product differs from org-wide answers.
