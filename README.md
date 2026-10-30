# B Agro Field Reports

Employees submit daily farm reports from their phones. Office staff enter and amend reports for
all farms, supervisors review their farm, and admins see the consolidated summaries.

Built with **Next.js 16** and **Postgres on Supabase**. Hosted on **Vercel**.

## Run it locally

```bash
npm install
cp .env.example .env      # then fill in the Supabase connection strings (see the file)
npm run db:migrate        # creates the tables (safe to re-run)
npm run db:seed           # farms, blocks, activities, starter accounts (safe to re-run)
npm run dev
```

Open http://localhost:3000.

### Starter accounts

| Name | PIN | Role |
|---|---|---|
| `Admin` | 1234 | Admin |
| `Office Clerk` | 3333 | Office |
| `Chetu Supervisor` / `Chetu Reporter` | 2222 / 1111 | Supervisor / Reporter for Chetu |
| `Gawi`, `Telli`, `Ephrata`, `Kamisse`, `Shakis` + ` Supervisor` / ` Reporter` | 1111 | Supervisor / Reporter for that farm |

**Change these PINs in Users before real use.**

### Roles

| Role | Farms | Submit reports | Amend reports | Dashboard + review | Approve | Manage users |
|---|---|---|---|---|---|---|
| Reporter | own farm | ✓ | – | – | – | – |
| Office | all farms | ✓ | ✓ (any farm) | – | – | – |
| Supervisor | own farm | ✓ | – | ✓ (verify / reject) | – | – |
| Admin | all farms | ✓ | ✓ | ✓ | ✓ | ✓ |

## What each person sees

- **Submit report** has three forms:
  - 🌱 *Daily work*
  - ⚖️ *Coffee weighing*
  - 💵 *Expenses*

  If the signal drops, reports wait on the phone and send themselves later. A report sent twice is saved once.
- **My reports**: the reports you sent, with status and any rejection note.
- **All reports** (Office, Admin): every farm's reports, filterable, with **✏️ Amend**. Amending sends the
  report back for review, and the old version is kept in `submission_edits`.
- **Dashboard** (Supervisor, Admin): choose a farm (or all farms) and an Ethiopian month.
  - Operations summary in the Chetu Excel layout, coffee harvest with running total, expenses by type.
  - **Download CSV** opens in Excel.
- **Review** (Supervisor, Admin): verify, approve, reject with a reason, or reopen.
- **Users** (Admin): add employees, set PINs, deactivate.

## Deploy on Vercel

1. In Vercel, click **Add New → Project** and import the GitHub repo. The framework is detected as Next.js.
2. Under **Environment Variables**, add:
   - `DATABASE_URL`: the Supabase **Transaction pooler** string (port 6543)
   - `SESSION_SECRET`: a long random string (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
3. Click **Deploy**.

`vercel.json` runs the app in Dublin (`dub1`), next to the Supabase project in eu-west-1 (Ireland), so
database round trips stay short. If you move the database, change the region to match.

Schema changes: add a new file `db/migrations/00N_name.sql` and run `npm run db:migrate` locally
(it uses `DIRECT_URL`). Already-applied files are skipped.

### Farm blocks

| Farm | Blocks |
|---|---|
| Gawi | A–F (6) |
| Telli | A–E (5) |
| Chetu | A, B, B1, C, D, E, F, G (8) |
| Ephrata | A–J (10) |
| Kamisse | A–D (4) |
| Shakis | A–G (7) |

Each farm also has **Block Less & Admin** for costs that don't belong to one block.

To change blocks, edit the `Blocks` list in `src/lib/seed-data.json`, then run
`npm run db:sync-blocks -- --dry` to preview and `npm run db:sync-blocks` to apply. Blocks that
already have reports are never deleted; the script lists them so you can rename or merge them by hand.
Hectares can be added as `"AreaHa": 34` on a block in the list, or in Supabase's Table Editor.

## Database notes

- **Security:** row-level security is on for every table with no policies, so Supabase's public API keys
  can't read or change anything. The app connects directly with the database password.
- **Connections** (`src/lib/db.ts`): the connection uses Supabase's transaction pooler with `prepare: false`
  and `max_pipeline: 1`. Pipelined queries stalled through the pooler during testing, so keep this setting.
- **Backups:** Supabase takes daily backups (with longer retention and point-in-time recovery on paid plans).
  You can also export at any time with `pg_dump` using `DIRECT_URL`.
- **Units:** some units in `src/lib/seed-data.json` are best guesses. Edit the `activities` table in
  Supabase's Table Editor to fix them.

## Code map

```
db/migrations/           SQL schema, applied in order by scripts/migrate.mjs
scripts/                 migrate.mjs, seed.mjs
src/
  app/
    login/                 sign-in page
    (app)/report/          report forms (new reports)
    (app)/my-reports/      a user's own reports
    (app)/reports/         all reports + amend (Office, Admin)
    (app)/admin/           dashboard, review/, users/
    api/reports/           receives new reports (also the offline queue); [id] = amend
    api/export/            CSV download of the dashboard table
    actions.ts             server actions: login/logout, review, users
  components/ReportForms.tsx   the three forms, saved drafts, phone outbox, amend mode
  lib/
    db.ts            Postgres connection (postgres.js)
    auth.ts          name + PIN login, signed session cookie, role checks
    reports.ts       saving, amending, listing, review rules
    summaries.ts     dashboard tables (SQL) and CSV
    ethiopian.ts     Ethiopian calendar
    seed-data.json   farms, blocks, activities, starter accounts, expense types
```
