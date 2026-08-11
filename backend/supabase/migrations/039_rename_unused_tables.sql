-- 039_rename_unused_tables.sql
-- Rename tables no longer written to after the evaluations simplification.
-- Data is preserved — tables are just marked as retired.

ALTER TABLE IF EXISTS wiki_snapshots RENAME TO _unused_wiki_snapshots;
ALTER TABLE IF EXISTS wiki_pattern_snapshots RENAME TO _unused_wiki_pattern_snapshots;
