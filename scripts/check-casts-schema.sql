-- Check casts table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'casts'
ORDER BY ordinal_position;

-- Check if password column exists
SELECT EXISTS (
  SELECT FROM information_schema.columns
  WHERE table_name = 'casts' AND column_name = 'password'
) as has_password;

-- Check if password2 column exists
SELECT EXISTS (
  SELECT FROM information_schema.columns
  WHERE table_name = 'casts' AND column_name = 'password2'
) as has_password2;

-- Sample data to see what's actually being used
SELECT id, name, twitter, password, instagram, password2
FROM casts
LIMIT 5;
