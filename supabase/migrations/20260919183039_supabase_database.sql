-- Private schema: access only through the trusted Node backend, never the Data API.
CREATE SCHEMA IF NOT EXISTS eldevo;
REVOKE ALL ON SCHEMA eldevo FROM PUBLIC;
CREATE TABLE eldevo.users (
  id text PRIMARY KEY, name text NOT NULL, email text UNIQUE NOT NULL,
  password text NOT NULL, role text NOT NULL CHECK (role IN ('client','publisher','admin')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')), created_at text NOT NULL
);
CREATE TABLE eldevo.sessions (
  token text PRIMARY KEY, user_id text NOT NULL REFERENCES eldevo.users(id), csrf text NOT NULL, expires bigint NOT NULL
);
CREATE INDEX sessions_user ON eldevo.sessions(user_id);
CREATE INDEX sessions_expiry ON eldevo.sessions(expires);
CREATE TABLE eldevo.records (
  id text PRIMARY KEY, kind text NOT NULL, owner text NOT NULL, body text NOT NULL CHECK (jsonb_typeof(body::jsonb) = 'object'), created_at text NOT NULL
);
CREATE INDEX records_kind ON eldevo.records(kind, owner);
CREATE TABLE eldevo.ledger (
  id text PRIMARY KEY, user_id text NOT NULL, available bigint NOT NULL, held bigint NOT NULL,
  label text NOT NULL, reference text NOT NULL, unique_key text UNIQUE NOT NULL, created_at text NOT NULL
);
CREATE INDEX ledger_user ON eldevo.ledger(user_id);
CREATE TABLE eldevo.audit (
  id text PRIMARY KEY, actor text NOT NULL, action text NOT NULL, target text NOT NULL, detail text NOT NULL, created_at text NOT NULL
);
CREATE TABLE eldevo.resets (
  token text PRIMARY KEY, user_id text NOT NULL REFERENCES eldevo.users(id), expires bigint NOT NULL
);
CREATE INDEX resets_user ON eldevo.resets(user_id);
CREATE TABLE eldevo.limits (key text PRIMARY KEY, count integer NOT NULL, expires bigint NOT NULL);
CREATE INDEX limits_expiry ON eldevo.limits(expires);
ALTER TABLE eldevo.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE eldevo.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE eldevo.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE eldevo.ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE eldevo.audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE eldevo.resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE eldevo.limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA eldevo FROM PUBLIC;
-- No anon/authenticated policies: this application uses server-side sessions.
-- The migration owner connects from the backend and has owner privileges.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON SCHEMA eldevo FROM anon;
    REVOKE ALL ON ALL TABLES IN SCHEMA eldevo FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SCHEMA eldevo FROM authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA eldevo FROM authenticated;
  END IF;
END $$;
