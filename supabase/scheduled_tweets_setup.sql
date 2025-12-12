-- Scheduled Tweets Table Setup and Verification
-- Run this in your Supabase SQL Editor

-- 1) Create table
CREATE TABLE IF NOT EXISTS scheduled_tweets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL CHECK (char_length(text) <= 280),
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT DEFAULT 'pending',
  posted_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2) Enable Row Level Security
ALTER TABLE scheduled_tweets ENABLE ROW LEVEL SECURITY;

-- 3) Drop existing policies (if any) to recreate
DROP POLICY IF EXISTS "Users can view own scheduled tweets" ON scheduled_tweets;
DROP POLICY IF EXISTS "Users can insert own scheduled tweets" ON scheduled_tweets;
DROP POLICY IF EXISTS "Users can update own scheduled tweets" ON scheduled_tweets;
DROP POLICY IF EXISTS "Users can delete own scheduled tweets" ON scheduled_tweets;

-- 4) Create RLS policies
CREATE POLICY "Users can view own scheduled tweets" ON scheduled_tweets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scheduled tweets" ON scheduled_tweets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own scheduled tweets" ON scheduled_tweets
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own scheduled tweets" ON scheduled_tweets
  FOR DELETE USING (auth.uid() = user_id);

-- 5) Verification checks
SELECT 
  'Table exists' AS check_item,
  CASE WHEN EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'scheduled_tweets'
  ) THEN '✓' ELSE '✗' END AS status
UNION ALL
SELECT 
  'RLS enabled',
  CASE WHEN EXISTS (
    SELECT FROM pg_tables 
    WHERE schemaname = 'public' AND tablename = 'scheduled_tweets' AND rowsecurity = true
  ) THEN '✓' ELSE '✗' END
UNION ALL
SELECT 
  'Policies exist',
  CASE WHEN (
    SELECT COUNT(*) FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'scheduled_tweets'
  ) >= 4 THEN '✓' ELSE '✗' END;


