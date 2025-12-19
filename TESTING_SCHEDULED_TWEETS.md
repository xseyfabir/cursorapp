# Testing Scheduled Tweets

## Step 1: Reset Failed Tweets

Run the SQL script to reset any failed tweets back to pending:

```sql
-- Run in Supabase SQL Editor
UPDATE scheduled_tweets
SET 
  status = 'pending',
  error_message = NULL,
  posted_at = NULL
WHERE status = 'failed';
```

Or use the provided script: `supabase/reset_failed_tweets.sql`

## Step 2: Schedule a Test Tweet

1. Go to the schedule tweet page
2. Create a tweet scheduled for 1-2 minutes in the future
3. Ensure the tweet has `status = 'pending'` in the database

## Step 3: Manually Call the Edge Function

Once the scheduled time has passed, call the Edge Function manually:

```bash
# Replace with your actual values
curl -X POST \
  "https://vgdycmpevjiyfjrbskxf.functions.supabase.co/process-scheduled-tweets?secret=YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -H "apikey: YOUR_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY"
```

Or use the Vercel API route:

```bash
curl -X POST https://your-vercel-app.vercel.app/api/trigger-scheduled-tweets
```

## Step 4: Check Logs

1. **Supabase Edge Function Logs:**
   - Go to Supabase Dashboard > Edge Functions > process-scheduled-tweets > Logs
   - Look for:
     - `Now: [timestamp]` - Current time used in query
     - `Due tweets: [...]` - Tweets returned by the query
     - `Query error: [...]` - Any query errors
     - `Access token for tweet [id]: [token]` - Token used for posting
     - `Tweet posted successfully` or error messages

2. **Expected Log Output:**
   ```
   Now: 2024-01-01T12:00:00.000Z
   Due tweets: [{"id":"...","user_id":"...","scheduled_at":"...","status":"pending",...}]
   [timestamp] process-scheduled-tweets: Query returned 1 tweets
   [timestamp] Tweet abc123: Step 1 - Retrieving Twitter token
   Access token for tweet abc123: eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
   [timestamp] Tweet abc123: Step 2 - Posting tweet to Twitter API
   [timestamp] Tweet abc123: Tweet posted successfully
   ```

## Step 5: Verify Results

1. Check the dashboard - the tweet should show `status = 'posted'`
2. Check Twitter/X - the tweet should appear on the connected account
3. Check the database - `posted_at` should be set

## Troubleshooting

### Query Returns 0 Tweets

- Check that `status = 'pending'` (not 'scheduled' or 'failed')
- Check that `scheduled_at <= now()` (tweet is actually due)
- Check the `Now:` log to see what timestamp is being used
- Verify timezone - `scheduled_at` should be in UTC

### Token Errors

- Check that `TWITTER_CLIENT_ID` and `TWITTER_CLIENT_SECRET` are set in Edge Function secrets
- Check that the user has a connected Twitter account in `twitter_accounts` table
- Check logs for "Failed to get Twitter token" errors

### Twitter API Errors

- Check the full error response in logs
- Verify the access token is valid (check token expiry)
- Check Twitter API rate limits
- Verify the tweet text is valid (280 chars max, no invalid characters)
