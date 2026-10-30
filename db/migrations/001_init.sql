-- B Agro Field Reports: initial schema (Postgres / Supabase).
-- Applied by `npm run db:migrate`. Each migration file runs once, in a transaction.

CREATE TABLE farms (
  id             text PRIMARY KEY,
  name_en        text NOT NULL,
  name_am        text NOT NULL DEFAULT '',
  annual_plan_kg double precision NOT NULL DEFAULT 0,
  sort           integer NOT NULL DEFAULT 0
);

CREATE TABLE blocks (
  id       integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  farm_id  text NOT NULL REFERENCES farms(id),
  name     text NOT NULL,
  area_ha  double precision,
  sort     integer NOT NULL DEFAULT 0,
  UNIQUE (farm_id, name)
);

CREATE TABLE activities (
  code         text PRIMARY KEY,
  category_en  text NOT NULL,
  category_am  text NOT NULL DEFAULT '',
  name_en      text NOT NULL,
  name_am      text NOT NULL DEFAULT '',
  unit         text NOT NULL DEFAULT '',
  active       boolean NOT NULL DEFAULT true,
  sort         integer NOT NULL DEFAULT 0
);

CREATE TABLE users (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL,
  role        text NOT NULL CHECK (role IN ('Reporter', 'Office', 'Supervisor', 'Admin')),
  farm_id     text REFERENCES farms(id),   -- NULL = all farms
  pin_hash    text NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_name_unique ON users (lower(name));

CREATE TABLE submissions (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id    text NOT NULL UNIQUE,       -- set by the phone; stops double saves on weak signal
  kind         text NOT NULL CHECK (kind IN ('ops', 'harvest', 'expense')),
  report_date  date NOT NULL,
  farm_id      text NOT NULL REFERENCES farms(id),
  user_id      integer NOT NULL REFERENCES users(id),
  remarks      text NOT NULL DEFAULT '',
  weighers     text NOT NULL DEFAULT '',
  status       text NOT NULL DEFAULT 'Submitted' CHECK (status IN ('Submitted', 'Verified', 'Approved', 'Rejected')),
  reviewed_by  integer REFERENCES users(id),
  reviewed_at  timestamptz,
  review_note  text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  amended_by   integer REFERENCES users(id),
  amended_at   timestamptz
);
CREATE INDEX submissions_kind_date ON submissions (kind, report_date, farm_id);
CREATE INDEX submissions_user ON submissions (user_id, report_date);

CREATE TABLE ops_lines (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submission_id  integer NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  block          text NOT NULL,
  activity_code  text NOT NULL,
  activity_name  text NOT NULL,
  unit           text NOT NULL DEFAULT '',
  norm   double precision,
  plan   double precision,
  actual double precision,
  labor  double precision,
  birr   double precision
);
CREATE INDEX ops_lines_submission ON ops_lines (submission_id);

CREATE TABLE harvest_lines (
  id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submission_id   integer NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  block           text NOT NULL,
  picked_kg       double precision,
  delivered_kg    double precision,
  deduction_birr  double precision
);
CREATE INDEX harvest_lines_submission ON harvest_lines (submission_id);

CREATE TABLE expense_lines (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submission_id  integer NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  category       text NOT NULL,
  description    text NOT NULL DEFAULT '',
  amount_birr    double precision NOT NULL
);
CREATE INDEX expense_lines_submission ON expense_lines (submission_id);

-- Every amendment keeps a copy of the report as it was before the change.
CREATE TABLE submission_edits (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submission_id  integer NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  edited_by      integer NOT NULL REFERENCES users(id),
  edited_at      timestamptz NOT NULL DEFAULT now(),
  before_json    jsonb NOT NULL
);
CREATE INDEX submission_edits_submission ON submission_edits (submission_id);

-- Security: the app connects directly as the database owner, which bypasses RLS.
-- Turning RLS on with no policies blocks Supabase's public REST API (anon/authenticated keys)
-- from reading or changing these tables.
ALTER TABLE farms            ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocks           ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities       ENABLE ROW LEVEL SECURITY;
ALTER TABLE users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_lines        ENABLE ROW LEVEL SECURITY;
ALTER TABLE harvest_lines    ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_lines    ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_edits ENABLE ROW LEVEL SECURITY;
