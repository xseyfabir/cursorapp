-- Twitter Accounts Table Setup and Verification
-- Run this in your Supabase SQL Editor

-- 1) Create table
CREATE TABLE IF NOT EXISTS twitter_accounts (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2) Enable Row Level Security
ALTER TABLE twitter_accounts ENABLE ROW LEVEL SECURITY;

-- 3) Drop existing policies (if any) to recreate
DROP POLICY IF EXISTS "Users can view own twitter accounts" ON twitter_accounts;
DROP POLICY IF EXISTS "Users can insert own twitter accounts" ON twitter_accounts;
DROP POLICY IF EXISTS "Users can update own twitter accounts" ON twitter_accounts;
DROP POLICY IF EXISTS "Users can delete own twitter accounts" ON twitter_accounts;

-- 4) Create RLS policies
CREATE POLICY "Users can view own twitter accounts" ON twitter_accounts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own twitter accounts" ON twitter_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own twitter accounts" ON twitter_accounts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own twitter accounts" ON twitter_accounts
  FOR DELETE USING (auth.uid() = user_id);

-- 5) Verification checks
SELECT 
  'Table exists' AS check_item,
  CASE WHEN EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'twitter_accounts'
  ) THEN '✓' ELSE '✗' END AS status
UNION ALL
SELECT 
  'RLS enabled',
  CASE WHEN EXISTS (
    SELECT FROM pg_tables 
    WHERE schemaname = 'public' AND tablename = 'twitter_accounts' AND rowsecurity = true
  ) THEN '✓' ELSE '✗' END
UNION ALL
SELECT 
  'Policies exist',
  CASE WHEN (
    SELECT COUNT(*) FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'twitter_accounts'
  ) >= 4 THEN '✓' ELSE '✗' END;


