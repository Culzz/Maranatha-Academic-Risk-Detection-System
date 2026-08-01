-- ============================================================
-- Schema Additions v3
-- Applied on top of schema_v2.sql
--
-- Changes:
--   1. Add model_version and confidence_score to risk_scores.
--      Enables version traceability across model retraining cycles.
--   2. Add audit_log table to record all sensitive system actions.
--      Covers risk profile views, intervention assignments, and
--      recomputation triggers. Supports ethical accountability
--      requirements for AI-assisted academic decision-making.
-- ============================================================

-- Add model version traceability to risk scores.
-- model_version records which pipeline version produced the score,
-- allowing comparison across retraining cycles in Chapter Five.
ALTER TABLE risk_scores
    ADD COLUMN IF NOT EXISTS model_version    VARCHAR(20)  DEFAULT '1.0.0',
    ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(5,4);

-- Audit log table.
-- Records who performed what action on which resource and when.
-- This table is append-only — no updates or deletes are permitted.
-- It supports the ethical accountability requirement of AI-assisted
-- risk systems described in the literature review (Section 2.10).
CREATE TABLE IF NOT EXISTS audit_logs (
    id             SERIAL PRIMARY KEY,
    actor_id       UUID         NOT NULL REFERENCES users(id),
    actor_role     VARCHAR(20)  NOT NULL,
    action         VARCHAR(50)  NOT NULL,
    -- action values:
    --   view_risk_profile    — lecturer or admin viewed a student risk score
    --   trigger_recompute    — manual risk recomputation requested
    --   assign_intervention  — intervention recommendation created
    --   update_intervention  — intervention status changed
    --   view_shap            — SHAP explanation retrieved
    --   bulk_enroll          — bulk CSV enrollment executed
    --   toggle_user          — user account activated or deactivated
    resource_type  VARCHAR(50)  NOT NULL,  -- student | course | intervention | system
    resource_id    VARCHAR(100),           -- UUID or integer ID of affected resource
    detail         JSONB,                  -- optional structured context
    ip_address     VARCHAR(45),            -- IPv4 or IPv6
    performed_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_actor       ON audit_logs(actor_id);
CREATE INDEX idx_audit_action      ON audit_logs(action);
CREATE INDEX idx_audit_resource    ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_performed   ON audit_logs(performed_at);
