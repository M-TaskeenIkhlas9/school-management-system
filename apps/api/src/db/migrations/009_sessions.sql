-- M4: end a user's sessions when their password is reset or on request.
-- Tokens carry the version they were issued with; bumping it invalidates them all.
ALTER TABLE users ADD COLUMN session_version INT NOT NULL DEFAULT 0 AFTER is_active;
ALTER TABLE audit_log ADD INDEX idx_audit_created (created_at);
