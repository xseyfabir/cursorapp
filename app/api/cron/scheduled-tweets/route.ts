import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase/serverClient";
import { getValidTwitterToken } from "@/lib/twitter/getValidTwitterToken";

const CRON_SECRET = process.env.CRON_SECRET;
// NOTE: NEXT_PUBLIC_* env vars are readable server-side too. We allow this ONLY
// to support the manual "Run Scheduled Tweets" dashboard testing button.
const PUBLIC_CRON_SECRET = process.env.NEXT_PUBLIC_CRON_SECRET;

export async function GET(request: NextRequest) {
  // Check authorization for cron requests
  // Vercel cron jobs set the x-vercel-cron header to "1"
  const vercelCronHeader = request.headers.get("x-vercel-cron");
  const isVercelCron = vercelCronHeader === "1";
  
  // For non-Vercel calls, require an auth secret if configured.
  // Accept either CRON_SECRET (server-only) or NEXT_PUBLIC_CRON_SECRET (testing-only).
  const allowedSecrets = Array.from(
    new Set([CRON_SECRET, PUBLIC_CRON_SECRET].filter(Boolean))
  ) as string[];

  if (allowedSecrets.length > 0 && !isVercelCron) {
    const authHeader = request.headers.get("authorization");
    const querySecret = request.nextUrl.searchParams.get("secret");
    
    const isAuthorized =
      allowedSecrets.some((s) => authHeader === `Bearer ${s}`) ||
      allowedSecrets.some((s) => querySecret === s);
    
    if (!isAuthorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const now = new Date().toISOString();
    const results: Array<{ id: string; status: string; error?: string }> = [];

    // On Hobby plan, cron may run infrequently. Process ALL due tweets in batches
    // so nothing scheduled earlier in the day is missed.
    const batchSize = 100;
    const maxBatches = 50; // safety cap: at most 5,000 tweets per run

    for (let batch = 0; batch < maxBatches; batch++) {
      const { data: dueTweets, error: fetchError } = await serverClient
        .from("scheduled_tweets")
        .select("id,user_id,text,scheduled_at,status")
        .lte("scheduled_at", now)
        .eq("status", "pending")
        .order("scheduled_at", { ascending: true })
        .limit(batchSize);

      if (fetchError) {
        return NextResponse.json(
          { error: "Failed to fetch scheduled tweets", details: fetchError.message },
          { status: 500 }
        );
      }

      if (!dueTweets || dueTweets.length === 0) {
        break;
      }

      for (const tweet of dueTweets) {
        try {
          let accessToken: string;
          try {
            accessToken = await getValidTwitterToken(tweet.user_id);
          } catch (e: any) {
            await markFailed(
              serverClient,
              tweet.id,
              e?.message || "No Twitter account connected for this user."
            );
            results.push({ id: tweet.id, status: "failed_no_account" });
            continue;
          }

          let postResult = await postTweet(accessToken, tweet.text);

          // If token was revoked/invalid but not yet expired, force-refresh and retry once.
          if (!postResult.ok && postResult.status === 401) {
            try {
              accessToken = await getValidTwitterToken(tweet.user_id, { forceRefresh: true });
              postResult = await postTweet(accessToken, tweet.text);
            } catch {
              // fall through
            }
          }

          if (!postResult.ok) {
            await markFailed(
              serverClient,
              tweet.id,
              postResult.error || "Failed to post tweet"
            );
            results.push({ id: tweet.id, status: "failed_post", error: postResult.error });
            continue;
          }

          await serverClient
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
            serverClient,
            tweet.id,
            err?.message || "Unexpected error posting tweet"
          );
          results.push({ id: tweet.id, status: "failed", error: err?.message });
        }
      }

      // If we processed a partial batch, nothing else is due.
      if (dueTweets.length < batchSize) {
        break;
      }
    }

    return NextResponse.json({
      processed: results.length,
      results,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Server configuration error", details: error.message },
      { status: 500 }
    );
  }
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
        status: response.status,
        error:
          errorData?.error || errorData?.detail || `Twitter API error ${response.status}`,
      };
    }

    return { ok: true, status: response.status };
  } catch (error: any) {
    return { ok: false, status: 0, error: error?.message || "Network error" };
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


