-- schema_v10_admin_whitelist.sql
-- Admin whitelist table for gating admin registration

CREATE TABLE IF NOT EXISTS admin_whitelist (
    id            SERIAL PRIMARY KEY,
    staff_id      VARCHAR(30) NOT NULL UNIQUE,
    admin_level   VARCHAR(20) NOT NULL CHECK (admin_level IN ('dap', 'dean', 'hod')),
    email         VARCHAR(150),
    full_name     VARCHAR(150),
    faculty_id    INTEGER REFERENCES faculties(id),
    department_id INTEGER REFERENCES departments(id),
    whitelisted_by UUID REFERENCES users(id),
    is_used       BOOLEAN DEFAULT FALSE,
    expires_at    TIMESTAMP,
    created_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_whitelist_staff_id ON admin_whitelist(staff_id);
CREATE INDEX IF NOT EXISTS idx_admin_whitelist_level ON admin_whitelist(admin_level);
