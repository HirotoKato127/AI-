ALTER TABLE candidates 
ADD COLUMN IF NOT EXISTS has_chronic_disease BOOLEAN,
ADD COLUMN IF NOT EXISTS chronic_disease_detail TEXT,
ADD COLUMN IF NOT EXISTS relocation_possible BOOLEAN,
ADD COLUMN IF NOT EXISTS relocation_impossible_reason TEXT,
ADD COLUMN IF NOT EXISTS personal_concerns TEXT;
