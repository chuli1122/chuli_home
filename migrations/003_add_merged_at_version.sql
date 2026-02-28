-- Add merged_at_version column to session_summaries
ALTER TABLE session_summaries ADD COLUMN IF NOT EXISTS merged_at_version INTEGER;

-- Backfill: existing summaries with merged_into set are considered already consumed
UPDATE session_summaries SET merged_at_version = 1 WHERE merged_into IS NOT NULL AND merged_at_version IS NULL;
