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

Deno.serve(async (req) => {
  if (req.method === "GET") {
    return jsonResponse({ ok: true, message: "process-scheduled-tweets is running" });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method Not Allowed" }, { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      {
        error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Edge Function environment.",
      },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const nowIso = new Date().toISOString();
  const results: Array<{ id: string; status: string; error?: string }> = [];

  try {
    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
      const { data: dueTweets, error: fetchError } = await supabase
        .from("scheduled_tweets")
        .select("id,user_id,text,scheduled_at,status")
        .eq("status", "pending")
        .lte("scheduled_at", nowIso)
        .order("scheduled_at", { ascending: true })
        .limit(BATCH_SIZE);

      if (fetchError) {
        return jsonResponse(
          { error: "Failed to fetch scheduled tweets", details: fetchError.message },
          { status: 500 },
        );
      }

      if (!dueTweets || dueTweets.length === 0) break;

      for (const tweet of dueTweets as any[]) {
        const tweetId = String(tweet.id);
        const userId = String(tweet.user_id);
        const text = String(tweet.text ?? "");

        try {
          let accessToken = await getValidTwitterToken(supabase, userId);
          let postResult = await postTweet(accessToken, text);

          // If token was revoked/invalid but not yet expired, force-refresh and retry once.
          if (!postResult.ok && postResult.status === 401) {
            try {
              accessToken = await getValidTwitterToken(supabase, userId, { forceRefresh: true });
              postResult = await postTweet(accessToken, text);
            } catch {
              // fall through
            }
          }

          if (!postResult.ok) {
            const message = truncateErrorMessage(postResult.error || "Failed to post tweet");
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

    return jsonResponse({
      processed: results.length,
      results,
      now: nowIso,
    });
  } catch (err: any) {
    return jsonResponse(
      { error: "Unexpected error running scheduled tweet processor", details: err?.message },
      { status: 500 },
    );
  }
});


