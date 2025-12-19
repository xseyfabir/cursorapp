-- Verify Twitter tokens for users with pending scheduled tweets
-- Run this in your Supabase SQL Editor to check token status

-- Check users with pending tweets and their token status
SELECT 
  st.id as tweet_id,
  st.user_id,
  st.text,
  st.scheduled_at,
  st.status as tweet_status,
  ta.access_token IS NOT NULL as has_access_token,
  ta.refresh_token IS NOT NULL as has_refresh_token,
  ta.expires_at,
  CASE 
    WHEN ta.expires_at IS NULL THEN 'No expiry date'
    WHEN ta.expires_at > NOW() THEN 'Valid (not expired)'
    ELSE 'Expired'
  END as token_status,
  ta.created_at as token_created_at
FROM scheduled_tweets st
LEFT JOIN twitter_accounts ta ON st.user_id = ta.user_id
WHERE st.status = 'pending'
ORDER BY st.scheduled_at ASC;

-- Summary: Count of pending tweets by token status
SELECT 
  CASE 
    WHEN ta.access_token IS NULL THEN 'No access token'
    WHEN ta.refresh_token IS NULL THEN 'No refresh token'
    WHEN ta.expires_at IS NULL THEN 'No expiry date'
    WHEN ta.expires_at > NOW() THEN 'Token valid'
    ELSE 'Token expired'
  END as token_status,
  COUNT(*) as pending_tweets_count
FROM scheduled_tweets st
LEFT JOIN twitter_accounts ta ON st.user_id = ta.user_id
WHERE st.status = 'pending'
GROUP BY 
  CASE 
    WHEN ta.access_token IS NULL THEN 'No access token'
    WHEN ta.refresh_token IS NULL THEN 'No refresh token'
    WHEN ta.expires_at IS NULL THEN 'No expiry date'
    WHEN ta.expires_at > NOW() THEN 'Token valid'
    ELSE 'Token expired'
  END;
