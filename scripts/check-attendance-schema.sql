-- Check attendance table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'attendance'
ORDER BY ordinal_position;

-- Check if cast_id column exists
SELECT EXISTS (
  SELECT FROM information_schema.columns
  WHERE table_name = 'attendance' AND column_name = 'cast_id'
) as has_cast_id;

-- Check if cast_name column exists
SELECT EXISTS (
  SELECT FROM information_schema.columns
  WHERE table_name = 'attendance' AND column_name = 'cast_name'
) as has_cast_name;

-- Sample data to see what's actually being used
SELECT id, cast_id, cast_name, date, store_id
FROM attendance
LIMIT 5;
