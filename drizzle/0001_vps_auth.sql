CREATE TABLE sessions (id TEXT PRIMARY KEY, owner TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX idx_sessions_expires ON sessions(expires);
CREATE TABLE auth_attempts (key TEXT PRIMARY KEY, window INTEGER NOT NULL, count INTEGER NOT NULL);
