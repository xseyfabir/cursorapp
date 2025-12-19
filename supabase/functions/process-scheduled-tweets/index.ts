import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TWITTER_TOKEN_ENDPOINT = "https://api.twitter.com/2/oauth2/token";
const TWITTER_TWEETS_ENDPOINT = "https://api.twitter.com/2/tweets";

const EXPIRY_SKEW_MS = 5 * 60 * 1000; // refresh if expiring within 5 minutes
const BATCH_SIZE = 50;
const MAX_BATCHES_PER_RUN = 10; // safety cap

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

function truncateErrorMessage(msg: string) {
  return msg.length > 500 ? msg.slice(0, 500) : msg;
}

function isNearExpiry(expiresAtIso: string | null) {
  if (!expiresAtIso) return true;
  const expiresAtMs = Date.parse(expiresAtIso);
  if (Number.isNaN(expiresAtMs)) return true;
  return Date.now() >= expiresAtMs - EXPIRY_SKEW_MS;
}

async function refreshAccessToken(refreshToken: string) {
  const clientId = Deno.env.get("TWITTER_CLIENT_ID");
  const clientSecret = Deno.env.get("TWITTER_CLIENT_SECRET");

  if (!clientId) {
    throw new Error("Twitter OAuth is not configured. Missing TWITTER_CLIENT_ID.");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  // If a secret exists, use HTTP Basic. If not, assume public client (PKCE-only).
  if (clientSecret) {
    headers.Authorization = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
  }

  const res = await fetch(TWITTER_TOKEN_ENDPOINT, {
    method: "POST",
    headers,
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    let msg = raw || `Twitter token refresh failed (${res.status})`;
    try {
      const parsed = JSON.parse(raw);
      msg = parsed.error_description || parsed.error || msg;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  const json = JSON.parse(raw) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!json.access_token) {
    throw new Error("Twitter refresh response missing access_token");
  }

  const expiresAt =
    typeof json.expires_in === "number"
      ? new Date(Date.now() + json.expires_in * 1000).toISOString()
      : null;

  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? null,
    expires_at: expiresAt,
  };
}

async function getValidTwitterToken(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  options?: { forceRefresh?: boolean },
  logPrefix?: string,
): Promise<string> {
  console.log(`${logPrefix || ""}Getting Twitter token for user ${userId}${options?.forceRefresh ? " (force refresh)" : ""}`);
  
  const { data, error } = await supabase
    .from("twitter_accounts")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .single();

  if (error) {
    console.error(`${logPrefix || ""}Failed to load Twitter credentials for user ${userId}:`, error.message);
    throw new Error(error.message || "Failed to load Twitter credentials");
  }

  const accessToken = (data as any)?.access_token as string | undefined;
  const refreshToken = (data as any)?.refresh_token as string | null | undefined;
  const expiresAt = (data as any)?.expires_at as string | null | undefined;

  if (!accessToken) {
    console.error(`${logPrefix || ""}No access token found for user ${userId}`);
    throw new Error("Twitter account not connected for this user.");
  }

  console.log(`${logPrefix || ""}Token found for user ${userId}, expires_at: ${expiresAt || "null"}`);
  const shouldRefresh = Boolean(options?.forceRefresh) || isNearExpiry(expiresAt ?? null);
  
  if (!shouldRefresh) {
    console.log(`${logPrefix || ""}Using existing token (not expired)`);
    return accessToken;
  }

  console.log(`${logPrefix || ""}Token needs refresh (expired or force refresh requested)`);
  if (!refreshToken) {
    console.error(`${logPrefix || ""}No refresh token available for user ${userId}`);
    throw new Error("Twitter refresh_token missing. Please reconnect your Twitter account.");
  }

  console.log(`${logPrefix || ""}Refreshing token for user ${userId}`);
  const refreshed = await refreshAccessToken(refreshToken);
  console.log(`${logPrefix || ""}Token refreshed successfully, new expires_at: ${refreshed.expires_at || "null"}`);
  
  const nextRefreshToken = refreshed.refresh_token || refreshToken;

  const { error: updateError } = await supabase
    .from("twitter_accounts")
    .update({
      access_token: refreshed.access_token,
      refresh_token: nextRefreshToken,
      expires_at: refreshed.expires_at,
    })
    .eq("user_id", userId);

  if (updateError) {
    console.error(`${logPrefix || ""}Failed to persist refreshed token:`, updateError.message);
    throw new Error(updateError.message || "Failed to persist refreshed Twitter tokens");
  }

  console.log(`${logPrefix || ""}Refreshed token persisted to database`);
  return refreshed.access_token;
}

async function postTweet(accessToken: string, text: string, tweetId?: string, logPrefix?: string) {
  console.log(`${logPrefix || ""}Posting tweet to Twitter API${tweetId ? ` (tweet ID: ${tweetId})` : ""}`);
  console.log(`${logPrefix || ""}Request headers: Content-Type: application/json, Authorization: Bearer ${accessToken.substring(0, 20)}...`);
  
  const response = await fetch(TWITTER_TWEETS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ text }),
  });

  const raw = await response.text();
  
  if (!response.ok) {
    let msg = raw || `Twitter API error ${response.status}`;
    let errorData = null;
    
    try {
      errorData = JSON.parse(raw);
      msg = errorData?.detail || errorData?.error || errorData?.errors?.[0]?.message || msg;
    } catch {
      // ignore parse errors
    }
    
    console.error(`${logPrefix || ""}Twitter API error for tweet ${tweetId || "unknown"}:`, {
      status: response.status,
      statusText: response.statusText,
      errorData: errorData,
      rawResponse: raw.substring(0, 500), // Limit log size
    });
    
    return { ok: false as const, status: response.status, error: msg, errorData };
  }

  let responseData = null;
  try {
    responseData = JSON.parse(raw);
  } catch {
    // ignore parse errors for success responses
  }
  
  console.log(`${logPrefix || ""}Tweet posted successfully${tweetId ? ` (tweet ID: ${tweetId})` : ""}:`, {
    status: response.status,
    responseData: responseData,
  });
  
  return { ok: true as const, status: response.status, data: responseData };
}

/**
 * Supabase Edge Function: process-scheduled-tweets
 * 
 * This function processes scheduled tweets and posts them to X (Twitter).
 * 
 * AUTHENTICATION:
 * - JWT authentication is DISABLED (verify_jwt: false in deno.json)
 * - NO Authorization header is required or checked
 * - Authentication is handled ONLY via CRON_SECRET query parameter
 * - Uses SUPABASE_SERVICE_ROLE_KEY to bypass RLS (no user context needed)
 * 
 * USAGE:
 * - Called by Vercel cron jobs and client-side triggers
 * - Must include ?secret=<CRON_SECRET> in the URL
 * - No JWT token or Authorization header needed
 */
Deno.serve(async (req) => {
  console.log(`[${new Date().toISOString()}] process-scheduled-tweets: ${req.method} request received`);

  if (req.method === "GET") {
    return jsonResponse({ ok: true, message: "process-scheduled-tweets is running" });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method Not Allowed" }, { status: 405 });
  }

  // Validate secret from query parameter (ONLY authorization method - JWT is disabled)
  // NO JWT validation, NO Authorization header, NO supabase.auth.getUser()
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  const expectedSecret = Deno.env.get("CRON_SECRET");

  if (!secret || !expectedSecret || secret !== expectedSecret) {
    console.log(`[${new Date().toISOString()}] process-scheduled-tweets: Unauthorized - secret missing or mismatch`);
    return jsonResponse({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify all required Edge Function secrets are set
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const twitterClientId = Deno.env.get("TWITTER_CLIENT_ID");
  const twitterClientSecret = Deno.env.get("TWITTER_CLIENT_SECRET");

  console.log(`[${new Date().toISOString()}] process-scheduled-tweets: Checking environment variables`);
  console.log(`[${new Date().toISOString()}] process-scheduled-tweets: SUPABASE_URL: ${supabaseUrl ? "✓ set" : "✗ missing"}`);
  console.log(`[${new Date().toISOString()}] process-scheduled-tweets: SUPABASE_SERVICE_ROLE_KEY: ${serviceRoleKey ? "✓ set" : "✗ missing"}`);
  console.log(`[${new Date().toISOString()}] process-scheduled-tweets: TWITTER_CLIENT_ID: ${twitterClientId ? "✓ set" : "✗ missing"}`);
  console.log(`[${new Date().toISOString()}] process-scheduled-tweets: TWITTER_CLIENT_SECRET: ${twitterClientSecret ? "✓ set" : "✗ missing"}`);

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(`[${new Date().toISOString()}] process-scheduled-tweets: Missing required environment variables`);
    return jsonResponse(
      {
        error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Edge Function environment.",
      },
      { status: 500 },
    );
  }

  if (!twitterClientId) {
    console.warn(`[${new Date().toISOString()}] process-scheduled-tweets: WARNING - TWITTER_CLIENT_ID not set, token refresh may fail`);
  }

  // Create Supabase client with service role key (bypasses RLS, no JWT required)
  // Authentication is handled by CRON_SECRET query parameter, not JWT
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const now = new Date().toISOString();
  console.log(`[${now}] process-scheduled-tweets: Starting processing run`);
  console.log(`[${now}] process-scheduled-tweets: Current time (UTC): ${now}`);
  const results: Array<{ id: string; status: string; error?: string }> = [];

  try {
    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
      // Query scheduled tweets where scheduled_at <= now() and status = 'pending'
      // No JWT/auth required - using service role key with RLS bypass
      // No extra filters (user_id, platform, deleted_at) - querying all due tweets
      const { data: dueTweets, error: fetchError } = await supabase
        .from("scheduled_tweets")
        .select("*")
        .eq("status", "pending")
        .lte("scheduled_at", now)
        .order("scheduled_at", { ascending: true })
        .limit(BATCH_SIZE);

      if (fetchError) {
        console.error(`[${now}] process-scheduled-tweets: Failed to fetch tweets - ${fetchError.message}`);
        return jsonResponse(
          { error: "Failed to fetch scheduled tweets", details: fetchError.message },
          { status: 500 },
        );
      }

      console.log(`[${now}] process-scheduled-tweets: Query returned ${dueTweets?.length || 0} tweets`);
      if (dueTweets && dueTweets.length > 0) {
        console.log(`[${now}] process-scheduled-tweets: Returned tweets:`, JSON.stringify(dueTweets.map(t => ({
          id: t.id,
          user_id: t.user_id,
          scheduled_at: t.scheduled_at,
          status: t.status,
          text_preview: t.text?.substring(0, 50) + '...'
        })), null, 2));
      }

      if (!dueTweets || dueTweets.length === 0) {
        if (batch === 0) {
          console.log(`[${now}] process-scheduled-tweets: No due tweets found`);
        }
        break;
      }

      console.log(`[${now}] process-scheduled-tweets: Batch ${batch + 1} - Found ${dueTweets.length} due tweets`);

      for (const tweet of dueTweets as any[]) {
        const tweetId = String(tweet.id);
        const userId = String(tweet.user_id);
        const text = String(tweet.text ?? "");

        console.log(`[${now}] process-scheduled-tweets: Processing tweet ID ${tweetId} for user ${userId}`);
        const logPrefix = `[${now}] process-scheduled-tweets: Tweet ${tweetId}:`;

        try {
          // Step 1: Get valid Twitter token
          console.log(`${logPrefix} Step 1 - Retrieving Twitter token`);
          let accessToken = await getValidTwitterToken(supabase, userId, undefined, logPrefix);
          
          if (!accessToken || accessToken.trim().length === 0) {
            throw new Error("Access token is empty or invalid");
          }
          
          // Log token (first 20 chars for security, full length for debugging)
          console.log(`${logPrefix} Access token retrieved: ${accessToken.substring(0, 20)}... (length: ${accessToken.length})`);
          console.log(`Access token for tweet ${tweetId}: ${accessToken}`);

          // Step 2: Post tweet to Twitter API
          console.log(`${logPrefix} Step 2 - Posting tweet to Twitter API`);
          let postResult = await postTweet(accessToken, text, tweetId, logPrefix);

          // Step 3: If 401, retry with token refresh
          if (!postResult.ok && postResult.status === 401) {
            console.log(`${logPrefix} Step 3 - Got 401 Unauthorized, attempting token refresh and retry`);
            try {
              console.log(`${logPrefix} Refreshing token and retrying...`);
              accessToken = await getValidTwitterToken(supabase, userId, { forceRefresh: true }, logPrefix);
              
              if (!accessToken || accessToken.trim().length === 0) {
                throw new Error("Refreshed access token is empty or invalid");
              }
              
              console.log(`${logPrefix} Retry - Access token after refresh: ${accessToken.substring(0, 20)}... (length: ${accessToken.length})`);
              console.log(`Access token for tweet ${tweetId} (after refresh): ${accessToken}`);
              
              console.log(`${logPrefix} Retry - Posting tweet to Twitter API`);
              postResult = await postTweet(accessToken, text, tweetId, logPrefix);
            } catch (refreshErr: any) {
              console.error(`${logPrefix} Token refresh failed:`, refreshErr?.message);
              console.error(`${logPrefix} Refresh error details:`, refreshErr);
              // fall through to handle the error
            }
          }

          if (!postResult.ok) {
            const message = truncateErrorMessage(postResult.error || "Failed to post tweet");
            console.error(`[${now}] process-scheduled-tweets: Tweet ${tweetId} failed - ${message}`);
            await supabase
              .from("scheduled_tweets")
              .update({
                status: "failed",
                posted_at: null,
                error_message: message,
              })
              .eq("id", tweetId);

            results.push({ id: tweetId, status: "failed", error: message });
            continue;
          }

          console.log(`[${now}] process-scheduled-tweets: Tweet ${tweetId} posted successfully`);
          await supabase
            .from("scheduled_tweets")
            .update({
              status: "posted",
              posted_at: new Date().toISOString(),
              error_message: null,
            })
            .eq("id", tweetId);

          results.push({ id: tweetId, status: "posted" });
        } catch (err: any) {
          const message = truncateErrorMessage(err?.message || "Unexpected error posting tweet");
          console.error(`[${now}] process-scheduled-tweets: Tweet ${tweetId} error - ${message}`);
          await supabase
            .from("scheduled_tweets")
            .update({
              status: "failed",
              posted_at: null,
              error_message: message,
            })
            .eq("id", tweetId);

          results.push({ id: tweetId, status: "failed", error: message });
        }
      }

      if (dueTweets.length < BATCH_SIZE) break;
    }

    console.log(`[${now}] process-scheduled-tweets: Completed - Processed ${results.length} tweets`);
    return jsonResponse({
      processed: results.length,
      results,
      now: now,
    });
  } catch (err: any) {
    console.error(`[${now}] process-scheduled-tweets: Unexpected error - ${err?.message}`);
    return jsonResponse(
      { error: "Unexpected error running scheduled tweet processor", details: err?.message },
      { status: 500 },
    );
  }
});


