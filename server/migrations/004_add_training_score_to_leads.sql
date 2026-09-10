-- Add trainingScore so Lead Details can store Training Score next to trainingDate.
-- If you get "Duplicate column name 'trainingScore'", the column already exists; ignore.

ALTER TABLE leads ADD COLUMN trainingScore VARCHAR(32) NULL;
