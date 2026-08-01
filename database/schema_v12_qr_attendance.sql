-- schema_v12_qr_attendance.sql
-- Add QR attendance fields to attendance_records

ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS latitude          DOUBLE PRECISION;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS longitude         DOUBLE PRECISION;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS location_verified BOOLEAN;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS scan_method       VARCHAR(10);
