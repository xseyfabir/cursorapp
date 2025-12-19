-- Reset failed scheduled tweets to pending status for testing
-- Run this in your Supabase SQL Editor to reset any tweets that failed earlier

UPDATE scheduled_tweets
SET 
  status = 'pending',
  error_message = NULL,
  posted_at = NULL
WHERE status = 'failed';

-- Verify the update
SELECT 
  id,
  user_id,
  text,
  scheduled_at,
  status,
  error_message,
  posted_at,
  created_at
FROM scheduled_tweets
WHERE status = 'pending'
ORDER BY scheduled_at ASC;
