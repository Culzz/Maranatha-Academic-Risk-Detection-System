-- Schema v15 — Material tags, quiz theory support, anti-cheating
-- All columns are nullable/defaulted for backward compatibility.

ALTER TABLE course_materials ADD COLUMN IF NOT EXISTS file_size BIGINT;
ALTER TABLE course_materials ADD COLUMN IF NOT EXISTS week_number INTEGER;
ALTER TABLE course_materials ADD COLUMN IF NOT EXISTS topic_tag VARCHAR(100);

ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS topic_tag VARCHAR(100);

ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS model_answer TEXT;
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS question_type VARCHAR(20) DEFAULT 'mcq';

ALTER TABLE quiz_behavioural_profiles ADD COLUMN IF NOT EXISTS tab_switch_count INTEGER DEFAULT 0;
