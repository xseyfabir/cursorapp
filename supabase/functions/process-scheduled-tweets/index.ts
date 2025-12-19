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
): Promise<string> {
  const { data, error } = await supabase
    .from("twitter_accounts")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .single();

  if (error) {
    throw new Error(error.message || "Failed to load Twitter credentials");
  }

  const accessToken = (data as any)?.access_token as string | undefined;
  const refreshToken = (data as any)?.refresh_token as string | null | undefined;
  const expiresAt = (data as any)?.expires_at as string | null | undefined;

  if (!accessToken) {
    throw new Error("Twitter account not connected for this user.");
  }

  const shouldRefresh = Boolean(options?.forceRefresh) || isNearExpiry(expiresAt ?? null);
  if (!shouldRefresh) return accessToken;

  if (!refreshToken) {
    throw new Error("Twitter refresh_token missing. Please reconnect your Twitter account.");
  }

  const refreshed = await refreshAccessToken(refreshToken);
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
    throw new Error(updateError.message || "Failed to persist refreshed Twitter tokens");
  }

  return refreshed.access_token;
}

async function postTweet(accessToken: string, text: string) {
  const response = await fetch(TWITTER_TWEETS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const raw = await response.text();
    let msg = raw || `Twitter API error ${response.status}`;
    try {
      const parsed = JSON.parse(raw);
      msg = parsed?.detail || parsed?.error || msg;
    } catch {
      // ignore
    }
    return { ok: false as const, status: response.status, error: msg };
  }

  return { ok: true as const, status: response.status };
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(`[${new Date().toISOString()}] process-scheduled-tweets: Missing environment variables`);
    return jsonResponse(
      {
        error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Edge Function environment.",
      },
      { status: 500 },
    );
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

        try {
          let accessToken = await getValidTwitterToken(supabase, userId);
          let postResult = await postTweet(accessToken, text);

          // If token was revoked/invalid but not yet expired, force-refresh and retry once.
          if (!postResult.ok && postResult.status === 401) {
            console.log(`[${now}] process-scheduled-tweets: Tweet ${tweetId} got 401, attempting token refresh and retry`);
            try {
              accessToken = await getValidTwitterToken(supabase, userId, { forceRefresh: true });
              postResult = await postTweet(accessToken, text);
            } catch (refreshErr: any) {
              console.error(`[${now}] process-scheduled-tweets: Token refresh failed for tweet ${tweetId} - ${refreshErr?.message}`);
              // fall through
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


