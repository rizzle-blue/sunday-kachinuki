# Sunday Kachinuki

A small, mobile-first Team-3 kachinuki game for one court. Participants redeem
an invite, reveal a deterministic Battle Card, enter the lobby, and rotate
through a lightweight survivor loop. One host also records points and hansoku.

## Privacy boundary

This repository is public and intentionally contains synthetic fixtures only.
Never commit a real roster, real invite codes, host credentials, database
passwords, Turnstile secret keys, Supabase secret/service-role keys, or exported
participant data.

Keep production roster SQL outside the repository, for example at
`.private/seed.production.sql`, and apply it directly to the dedicated Sunday
Supabase project. The path is ignored by Git.

## Local development

Requirements: Bun 1.3.14, Docker, and the Supabase CLI dependency installed by
`bun install`.

```bash
bun install --frozen-lockfile
bun run db:start
bun run db:reset
bun run dev
```

The synthetic invite used by the browser fixture is `one_demo`.

Run the verification suites with:

```bash
bun run test
bun run test:db
bun run test:e2e
bun run check
```

`bun run check` uses the isolated local Supabase publishable configuration.
`bun run build` is the hosted build and intentionally requires the Vercel
environment variables listed below.

## Dedicated Supabase deployment

Create a new Supabase project used only by this app, then review and apply the
migrations:

```bash
bunx supabase login
bunx supabase link --project-ref <SUNDAY_PROJECT_REF>
bunx supabase db push --dry-run
bunx supabase db push
```

Do not use `--include-seed` for production: the tracked `supabase/seed.sql` is
synthetic. Apply the private production roster separately after reviewing its
exact target project.

Enable anonymous sign-ins and invisible Turnstile in the dedicated project.
Create the host email/password user manually, then register its Auth UUID:

```sql
insert into sunday_private.operators(auth_subject_id, role)
values ('<HOST_AUTH_UUID>', 'host_recorder');
```

## Vercel

Import this repository as a standalone Vercel project. Leave the framework and
output directory on automatic detection, and use `bun run build`.

Configure these Preview and Production variables:

```text
SUNDAY_SUPABASE_PROJECT_REF
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_TURNSTILE_SITE_KEY
```

The server/browser URL and publishable-key pairs must match. Never configure a
service-role or secret key in Vercel.
