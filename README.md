# Studio Index

Leonna's personal dashboard for active apps, Claude projects, linked docs, and future-idea notes — manually curated, persisted in Supabase.

## Structure

| Path | What it is |
|------|------------|
| `index.html`, `app.js`, `styles.css` | The dashboard itself |
| `config.js` | Supabase project URL + anon key |
| `supabase-schema.sql` | One-time schema setup — run in the Supabase SQL editor |
| `fitness-hq/` | The original Fitness HQ app suite (workout logger, yoga coach, meal plans, etc.), preserved as-is, linked from the dashboard |

## One-time Supabase setup

1. Open your Supabase project's SQL editor and run `supabase-schema.sql`. This creates a `studio_hub` schema with its own `categories`, `entries`, and `linked_docs` tables — isolated from any other app sharing this project (see `SUPABASE_MULTI_APP.md` for why that's safe).
2. In **Settings → API → Data API → Exposed schemas**, add `studio_hub` to the list. The REST API only serves schemas listed there.
3. That's it — `config.js` already points at your project.

## Data model

Every entry is one of three types, each with a colored left rail on its card:

- **App/Site** — something live with a URL and status
- **Project** — a Claude canvas/spec, no live URL required
- **Future note** — just title, description, and tags; a placeholder for later

Apps and Projects can carry any number of custom key/value fields (`stack`, `last commit`, `sync source` — whatever fits) and any number of linked docs/files (repo, design doc, canvas link), shown as chips on the card. Categories are created on the fly from the entry form — nothing is pre-seeded.

## Views

- **Decorated** (default landing) — pinned entries only, tap the 🍫👑 avatar for the full ledger
- **Detailed** — grouped card grid or a flat chronological log, filterable by category

Day/night is a manual toggle (top right), independent of system theme, and applies to both views.

## Live Site
[leonnariley18-ui.github.io/studio-hub](https://leonnariley18-ui.github.io/studio-hub)
