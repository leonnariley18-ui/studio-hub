# How multiple apps share one Supabase project

A Supabase project is really just one Postgres database plus some services
bolted on (Auth, an auto-generated REST API, Edge Functions, Storage).
Nothing about it says "one app per project" — that's just the default
mental model most tutorials give you. The actual isolation boundary you
want is **schema**, not project.

**Schemas are namespaces inside one database.** Postgres ships with `public`
by default, but you can create as many as you like — `create schema
yourapp;`. Tables in different schemas can have the same name and never
collide: `appone.bills` and `apptwo.bills` are two completely different
tables. Each app gets its own schema and never references another app's.

## Three things you have to get right for this to actually be safe

1. **Exposed schemas** (Settings → API). Supabase's REST API only serves
   schemas you explicitly list there. Add your new schema, and configure
   your client (`supabase-js`) with `db: { schema: 'yourschema' }` so every
   query is scoped to it automatically.

2. **RLS policies, scoped per schema.** Row Level Security policies belong
   to a table, not the project — so a policy on `appone.bills` has zero
   effect on `apptwo.data`. As long as you only ever write policies for your
   own schema's tables and never touch `grant`/`revoke` on anything outside
   it, you can't accidentally loosen or break another app's access.

3. **localStorage session collisions, if both apps share an origin.** This
   one isn't a database issue — it's a browser one. `supabase-js` stores the
   auth session in `localStorage` under a key derived from the project ref
   by default. If both apps are hosted on the same domain (e.g. two GitHub
   Pages sites under one account), they'll both reach for the same key and
   silently overwrite each other's login. Fix: give each app's client an
   explicit, different `storageKey` in its auth config.

## What you get in exchange

One Supabase project (one bill, one set of API keys, one dashboard) safely
hosting as many independent apps as you want, each in its own schema, each
with its own tables and RLS, invisible to the others.

## The one discipline to hold onto across every future app

**Never run a migration, grant, or revoke against anything outside your own
schema.** If a script ever needs to touch `public.*` or another schema by
name, stop and ask why before running it.
