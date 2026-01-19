# Reporting Hub Starter (Azure App)

A clean starter kit for standing up a **Reporting Hub** app that exposes database tables and schemas in a single UI, with **editable tables** as the first milestone.

## Intent
You want a fresh app that:
- Exposes **all tables and schema** directly in the UI.
- Lets users **view, edit, and manipulate data** in one place.
- Starts with **editable tables first**.
- Evolves later into a platform that **pulls/fills data** (pipelines, workflows, integrations).

## Core Principles
- **Database-first UI**: every table should be visible via metadata, not hard-coded routes.
- **Schema-aware**: field types, constraints, and relationships should drive UI behavior.
- **Safe edits**: start with row-level edits + audit logs; add workflows later.
- **Separation**: this is a fresh app, separate from existing tab app.

## Proposed App Shape (Phase 1)
1. **Table Registry**
   - Single registry endpoint to list tables and columns.
   - Backed by DB metadata queries or a curated registry table.
2. **Table Explorer**
   - View, filter, sort, and paginate rows.
   - Inline edit + save per row.
3. **Audit Trail**
   - Record change history (who/what/when).

## Starter Files in This Folder
- `config/app.config.json` → app metadata and connection placeholders (no secrets).
- `db/example-table.sql` → single-table example aligned with the starter API functions.

## Suggested Azure Build (High Level)
- **Backend**: Node/Express or .NET Minimal API
- **Database**: Azure SQL (initially) with metadata + audit tables
- **Frontend**: React (Fluent UI) or Blazor for rapid table UIs
- **Auth**: Entra ID (Azure AD) with role-based access

## Real DB Starter (Single Table)
This starter includes a **real DB example** for a single table (`dbo.ReportingHubItems`) so you can start small and validate editable rows first.

You can swap the table name or extend columns later, but this gives you a live, low-scale base to prove out the editable table UI first.

## Next Steps
1. Validate the metadata strategy: **live schema discovery** vs **registry table**.
2. Pick the thin backend stack (Express vs .NET) for CRUD endpoints.