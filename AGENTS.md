<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project Rules & Reference Application Safety Guidelines

## Reference Application Safety Rule
The original PillBills website (`https://app.pillbills.com/`) is **STRICTLY READ-ONLY** and serves **ONLY** as a reference application.

### Permitted Reference Actions (Browser inspection only):
- Opening the site
- Logging in with authorized demo credentials when necessary
- Navigating and scrolling
- Searching and filtering
- Opening tabs and inspecting UI
- Opening forms / modals to inspect fields and structure
- Observing workflows, layouts, and system behaviors

### Strictly Prohibited Actions (No State-Changing or Write Actions):
DO NOT under any circumstances:
- Create, edit, or delete records
- Save or submit sales or purchases
- Process returns or exchanges
- Record payments or vouchers
- Modify inventory, customers, or suppliers
- Import data or restore backups
- Change settings or subscription/licensing settings
- Perform destructive actions or intentionally change/corrupt data

### Escalation:
- If a workflow cannot be understood without committing a transaction or modifying the original application, **STOP and ask the user** before doing it.

## Independent Workspace & Data Isolation
- All implementation, database writes, testing, seed data, and experiments must happen **ONLY** within this independent project: `C:\Users\Lakshit\Desktop\gher\pillbills`.
- Use **ONLY** this project's own PostgreSQL database and synthetic/test data.
- **NEVER** use the original PillBills application's database as the backend for this project.

## Preserving Existing Functionality
- Before making substantial changes, inspect the existing project and preserve working functionality from Milestones 1–3.
