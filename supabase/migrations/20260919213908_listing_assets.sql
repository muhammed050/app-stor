ALTER TABLE eldevo.uploads DROP CONSTRAINT uploads_kind_check;
ALTER TABLE eldevo.uploads ADD CONSTRAINT uploads_kind_check CHECK (kind IN ('app','receipt','listing'));
