# NyayaSetu — Supabase setup guide (Prompt 15)

This is the honest path from today's contracts-only state to a live backend.
Until every step below is done, the app runs in local demo mode and every
cloud operation returns `not_configured` — that is the correct behavior, not
a bug. No step here puts a secret into the frontend.

## 0. What you need

- A Supabase project (https://supabase.com → New project). Note the
  **Project URL** and the **anon public key** (Project Settings → API).
- The **service-role key** stays in the Supabase dashboard / server only.
  It is NEVER added to `.env.local`, `.env.example`, or any file in `src/`.
  An automated test (`prompt15Supabase.test.ts` → secret-leak checks) fails
  the suite if a secret value ever lands in source or `dist/`.

## 1. Apply the database schema

Review first — the money files:

- `supabase/migrations/0001_nyayasetu_foundation.sql` — tables
  (profiles, cases, case_members, documents, extracted_facts,
  confirmed_facts, action_plans, action_items, timeline_events,
  ai_proposals), every private table with a `user_id` owner column, plus
  Row-Level Security policies so a user can only read/write their own rows.
- `supabase/migrations/0002_nyayasetu_storage.sql` — the PRIVATE
  `nyayasetu-private` bucket (public = false) plus storage policies pinning
  each object key's `<user_id>` segment to `auth.uid()`.

Apply with the Supabase CLI (reproducible, reviewable — never ad hoc):

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

No CLI? Dashboard → SQL Editor → New query → paste
`supabase/migrations/0001_nyayasetu_foundation.sql`, Run; repeat for
`0002_nyayasetu_storage.sql`. Both files are required: 0001 alone leaves
you without the private bucket (verified live: tables present, bucket
missing, uploads impossible until 0002 is applied).

Verify in the dashboard (Table Editor → each table → Policies): every
private table shows owner-only policies filtering on
`auth.uid() = user_id`, and the storage bucket shows Public = OFF.

## 2. Enable email magic-link auth

Authentication → Providers → Email → enable **Magic Link**
(addresses enter via the app's "Your account" panel; NyayaSetu never stores
passwords). Under Authentication → URL Configuration, add your app URL
(e.g. `http://localhost:3000`, plus your production domain later) to
Redirect URLs so the emailed link returns to the app.

## 3. Connect the frontend (public values only)

```bash
cp .env.example .env.local
```

Set in `.env.local`:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

Then `npm run dev`. The header pill flips from "Local demo mode" to
"Signed in via Supabase" only after a verified session exists — never
before. With env absent, everything falls back to `not_configured` demo
behavior with no crash.

## 4. What is deliberately NOT included yet

- **Local demo data migration**: existing browser-only cases are never
  auto-uploaded. A future prompt must add explicit per-case consent with a
  clear "this data will now leave your browser" notice first.
- **Cloud sync of the case workspace**: `caseEngine` is still the local
  store; the Supabase adapter (`src/backend/supabase/backendAdapter.ts`)
  is wired for auth/session/ownership/CRUD but the UI keeps using local
  data until a sync layer exists. Signed-in users are told demo cases
  stay in the browser.
- **Live Gemini**: the provider boundary stays unavailable with no live
  calls; document text is never sent anywhere.
- **Service-role usage**: no server component exists yet, so no
  service-role key exists anywhere in this workflow. If a server piece is
  added later, its key lives in server env only.

## 5. Going live checklist

1. `supabase db push` applied cleanly on the real project.
2. RLS verified per table in the dashboard (see RLS summary in the
   Prompt 15 report).
3. Bucket `nyayasetu-private` shows Public OFF.
4. Magic link email arrives and signs in; wrong-user row reads return
   "record not found", never data.
5. `npm test -- --run`, `npm run typecheck`, `npm run lint`,
   `npm run build` all green, including the dist secret-grep test.

## 6. Verify the live backend (no dashboard clicking required)

With `.env.local` in place, run the anonymous smoke test:

```bash
node scripts/verify-supabase-live.mjs
```

It prints PASS/FAIL per check (reachable, RLS hides rows, inserts
rejected, bucket not listable) and exits non-zero on any failure. It never
creates users and never prints credential values.

Authenticated checks (insert → read-back → cross-user denial → delete) live
in `src/__tests__/prompt16Final.test.ts` behind a gate — they need a real
throwaway user, so they skip by default:

```bash
SUPABASE_LIVE=1 SUPABASE_URL=https://your-project.supabase.co \
  SUPABASE_ANON_KEY=your-public-anon-key \
  SUPABASE_TEST_EMAIL=throwaway@example.in \
  SUPABASE_TEST_PASSWORD=throwaway-password \
  npm test -- --run -t "live RLS"
```

Notes from live verification: the project's email validator rejects
reserved/fake domains (`example.com`, `.invalid`), so the throwaway users
need either a real inbox you control, "Confirm email" temporarily OFF
(Auth → Providers → Email), or dashboard-created auto-confirmed users
(Authentication → Users → Add user → Auto Confirm). Delete throwaway users
afterwards (dashboard only — no service key exists in this repo).

## 7. Deploy the AI Edge Function (optional, server-side only)

```bash
supabase functions deploy ai-explain
supabase secrets set GEMINI_API_KEY=your-real-gemini-key
```

The key is a server secret — it never appears in any committed file or the
browser bundle. Until deployed, AI features keep returning the honest
"unavailable" state and nothing breaks.
