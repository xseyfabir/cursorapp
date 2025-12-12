import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Server not configured: missing Supabase service role env vars" },
      { status: 500 }
    );
  }

  // Check authorization for cron requests
  // Vercel cron jobs set the x-vercel-cron header to "1"
  const vercelCronHeader = request.headers.get("x-vercel-cron");
  const isVercelCron = vercelCronHeader === "1";
  
  // If CRON_SECRET is set, require it for non-Vercel cron requests
  if (CRON_SECRET && !isVercelCron) {
    const authHeader = request.headers.get("authorization");
    const querySecret = request.nextUrl.searchParams.get("secret");
    
    const isAuthorized = 
      authHeader === `Bearer ${CRON_SECRET}` ||
      querySecret === CRON_SECRET;
    
    if (!isAuthorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = createSupabaseAdminClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const now = new Date().toISOString();

  const { data: dueTweets, error: fetchError } = await supabase
    .from("scheduled_tweets")
    .select("*")
    .lte("scheduled_at", now)
    .eq("status", "pending")
    .limit(20);

  if (fetchError) {
    return NextResponse.json(
      { error: "Failed to fetch scheduled tweets", details: fetchError.message },
      { status: 500 }
    );
  }

  const results = [];

  for (const tweet of dueTweets ?? []) {
    try {
      const { data: account, error: accountError } = await supabase
        .from("twitter_accounts")
        .select("access_token")
        .eq("user_id", tweet.user_id)
        .single();

      if (accountError || !account?.access_token) {
        await markFailed(
          supabase,
          tweet.id,
          "No Twitter account connected for this user."
        );
        results.push({ id: tweet.id, status: "failed_no_account" });
        continue;
      }

      const postResult = await postTweet(account.access_token, tweet.text);

      if (!postResult.ok) {
        await markFailed(
          supabase,
          tweet.id,
          postResult.error || "Failed to post tweet"
        );
        results.push({ id: tweet.id, status: "failed_post", error: postResult.error });
        continue;
      }

      await supabase
        .from("scheduled_tweets")
        .update({
          status: "posted",
          posted_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", tweet.id);

      results.push({ id: tweet.id, status: "posted" });
    } catch (err: any) {
      await markFailed(
        supabase,
        tweet.id,
        err?.message || "Unexpected error posting tweet"
      );
      results.push({ id: tweet.id, status: "failed", error: err?.message });
    }
  }

  return NextResponse.json({
    processed: results.length,
    results,
  });
}

async function postTweet(accessToken: string, text: string) {
  try {
    const response = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      return {
        ok: false,
        error:
          errorData?.error || errorData?.detail || `Twitter API error ${response.status}`,
      };
    }

    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error?.message || "Network error" };
  }
}

async function markFailed(supabase: any, id: string, error: string) {
  await supabase
    .from("scheduled_tweets")
    .update({
      status: "failed",
      error_message: error.slice(0, 500),
    })
    .eq("id", id);
}


