-- schema_v11_quiz_ai.sql
-- Add AI-generated quiz question columns

ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS difficulty     VARCHAR(10);
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS explanation    TEXT;
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS why_wrong      JSONB;
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS read_topic     VARCHAR(200);
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS youtube_query  VARCHAR(200);
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS ai_generated   BOOLEAN DEFAULT FALSE;
