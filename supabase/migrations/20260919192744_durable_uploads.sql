CREATE TABLE eldevo.uploads (
  id text PRIMARY KEY, owner text NOT NULL REFERENCES eldevo.users(id),
  name text NOT NULL, kind text NOT NULL CHECK(kind IN ('app','receipt')),
  size integer NOT NULL CHECK(size > 0 AND size <= 134217728),
  completed boolean NOT NULL DEFAULT false, expires bigint NOT NULL
);
CREATE INDEX uploads_owner ON eldevo.uploads(owner);
CREATE INDEX uploads_expires ON eldevo.uploads(expires) WHERE NOT completed;
CREATE TABLE eldevo.upload_parts (
  upload_id text NOT NULL REFERENCES eldevo.uploads(id) ON DELETE CASCADE,
  part integer NOT NULL CHECK(part >= 0 AND part < 64),
  content bytea NOT NULL CHECK(octet_length(content) <= 2097152),
  PRIMARY KEY(upload_id,part)
);
ALTER TABLE eldevo.uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE eldevo.upload_parts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON eldevo.uploads, eldevo.upload_parts FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON eldevo.uploads, eldevo.upload_parts FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON eldevo.uploads, eldevo.upload_parts FROM authenticated;
  END IF;
END $$;
