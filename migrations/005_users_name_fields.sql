-- Replace computed 'name' column with explicit second_last_name
ALTER TABLE users
  DROP COLUMN name,
  ADD COLUMN second_last_name VARCHAR(100) DEFAULT NULL AFTER last_name;
