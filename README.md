# SentinelX — Phase 1 scaffold

This is the starting skeleton for the audit platform, built from our planning
session. It's not a finished app yet — it's the foundation: database schema,
project structure, and the first two real pieces (site switcher, dashboard)
wired to the data model we designed.

## What's here

- `supabase/schema.sql` — the full phase 1 database schema: organizations,
  clients, sites, companies, site-scoped roles, versioned templates,
  inspections, observations, assets with statutory cert tracking, incidents,
  and an audit log. Row Level Security is enabled on every table (see the
  note at the bottom of the file — policies need to be written before real
  client data goes in).
- `app/` — Next.js pages (App Router)
- `components/SiteSwitcher.jsx` — the site dropdown we designed, scoping
  everything a user sees to the sites they're approved for
- `lib/supabaseClient.js` — connects the app to your Supabase project

## Setting it up (step by step)

1. **Create a free Supabase project** at supabase.com — this is your database,
   auth, and file storage in one place.
2. **Run the schema**: open the SQL Editor in your Supabase dashboard, paste
   in the contents of `supabase/schema.sql`, and run it. This creates every
   table we designed. Then also paste in and run `supabase/auth_trigger.sql`
   — this keeps your `users` table in sync whenever someone registers.
3. **Get your API keys**: in Supabase, go to Project Settings → API. Copy the
   "Project URL" and the "anon public" key.
4. **Create a `.env.local` file** in this project's root folder with:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your-project-url-here
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   ```
   Never commit this file or share these values publicly.
5. **Install dependencies**: `npm install`
6. **Run it locally**: `npm run dev`, then open `http://localhost:3000/dashboard`

## What's built vs. what's next

Built: schema, login, self-registration, manager/admin approval queue,
shared nav/route guard shell, and now the **template builder**:
- `/templates` — list of your templates
- `/templates/new` — build one: name, category, and checklist items with
  mixed answer types (pass/fail/na, rating, multiple choice, free text),
  a severity weight per item, an optional category tag (this is what will
  let "top 5 issues" roll up across different templates later), and a
  per-item failure workflow (none / assign action / requires sign-off)

Saving a template writes to three tables in one go: `templates`, its
`template_items`, and a `template_versions` snapshot (version 1) — this is
what protects past inspections from silently changing if you edit the
template later.

Still to build, in the order we discussed: org/client/site/company
management screens, running an inspection against a template, observation
assignment and close-out, asset register with statutory cert tracking, and
the real dashboard charts wired to live data.

Bring this project back into our chat whenever you're ready for the next
piece — I'll build directly on what's here rather than starting over.

## Important before any real client data goes in

The RLS policies in `schema.sql` are placeholders. They must be replaced
with real site/company-scoped rules (examples are commented at the bottom
of the file) before this handles anything beyond your own testing — this is
what actually enforces that Client A can never see Client B's data.
