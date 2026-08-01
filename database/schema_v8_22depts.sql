-- ============================================================
-- schema_v8_22depts.sql
-- Expand to 4 Faculties + 22 Departments (production-ready)
-- Safe to re-run: all statements use ON CONFLICT DO NOTHING.
-- Apply with:
--   psql -d maranatha_risk_db -f schema_v8_22depts.sql
-- ============================================================

-- ── 1. Insert all 4 Faculties ─────────────────────────────────
INSERT INTO faculties (name, code) VALUES
    ('Faculty of Natural and Applied Sciences',          'FNAS'),
    ('Faculty of Arts, Management and Social Sciences',  'FAMSS'),
    ('Faculty of Basic Medical Sciences',                'FBMS'),
    ('Faculty of Environmental Sciences',                'FES')
ON CONFLICT (name) DO NOTHING;

-- Fix legacy FOE faculty code if it exists
UPDATE faculties SET name = 'Faculty of Environmental Sciences', code = 'FES'
    WHERE code = 'FOE' AND NOT EXISTS (SELECT 1 FROM faculties WHERE code = 'FES');
-- If FES already existed, just remove the stale FOE entry
DELETE FROM faculties WHERE code = 'FOE';

-- ── 2. Insert all 22 Departments ──────────────────────────────
-- FNAS (9 departments)
INSERT INTO departments (name, code) VALUES
    ('Computer Science',        'CSC'),
    ('Software Engineering',    'SEN'),
    ('Cybersecurity',           'CYB'),
    ('Computer Engineering',    'CPE'),
    ('Mathematics',             'MTH'),
    ('Biochemistry',            'BCH'),
    ('Information Technology',  'INF'),
    ('Industrial Chemistry',    'ICH'),
    ('Physics and Electronics', 'PHY')
ON CONFLICT (name) DO NOTHING;

-- FAMSS (6 departments)
INSERT INTO departments (name, code) VALUES
    ('Economics',                            'ECO'),
    ('Accounting',                           'ACC'),
    ('Business Administration',              'BUS'),
    ('Criminology and Security Studies',     'CSS'),
    ('English and Communication',            'ENG'),
    ('History and International Relations',  'HIS')
ON CONFLICT (name) DO NOTHING;

-- FBMS (4 departments)
INSERT INTO departments (name, code) VALUES
    ('Nursing',                        'NRS'),
    ('Doctor of Physiotherapy',        'PHT'),
    ('Public Health',                  'PBH'),
    ('Health Information Management',  'HIM')
ON CONFLICT (name) DO NOTHING;

-- FES (3 departments)
INSERT INTO departments (name, code) VALUES
    ('Architecture',        'ARC'),
    ('Quantity Surveying',  'QUS'),
    ('Estate Management',   'EST')
ON CONFLICT (name) DO NOTHING;

-- Fix legacy SWE code if it exists
UPDATE departments SET code = 'SEN'
    WHERE code = 'SWE';

-- ── 3. Link departments to their faculties ────────────────────
-- FNAS
UPDATE departments SET faculty_id = (SELECT id FROM faculties WHERE code = 'FNAS')
    WHERE code IN ('CSC', 'SEN', 'CYB', 'CPE', 'MTH', 'BCH', 'INF', 'ICH', 'PHY')
    AND (faculty_id IS NULL OR faculty_id != (SELECT id FROM faculties WHERE code = 'FNAS'));

-- FAMSS
UPDATE departments SET faculty_id = (SELECT id FROM faculties WHERE code = 'FAMSS')
    WHERE code IN ('ECO', 'ACC', 'BUS', 'CSS', 'ENG', 'HIS')
    AND (faculty_id IS NULL OR faculty_id != (SELECT id FROM faculties WHERE code = 'FAMSS'));

-- FBMS
UPDATE departments SET faculty_id = (SELECT id FROM faculties WHERE code = 'FBMS')
    WHERE code IN ('NRS', 'PHT', 'PBH', 'HIM')
    AND (faculty_id IS NULL OR faculty_id != (SELECT id FROM faculties WHERE code = 'FBMS'));

-- FES
UPDATE departments SET faculty_id = (SELECT id FROM faculties WHERE code = 'FES')
    WHERE code IN ('ARC', 'QUS', 'EST')
    AND (faculty_id IS NULL OR faculty_id != (SELECT id FROM faculties WHERE code = 'FES'));
