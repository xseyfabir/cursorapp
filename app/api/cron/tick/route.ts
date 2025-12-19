import { NextRequest, NextResponse } from "next/server";

/**
 * Vercel Cron endpoint that triggers the Supabase Edge Function
 * This runs daily as a failsafe (Vercel Hobby allows one cron per day)
 * The main trigger mechanism is client-side calls from dashboard/schedule pages
 */
export async function GET(request: NextRequest) {
  // Verify this is a Vercel cron request
  const authHeader = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-vercel-cron");

  // Vercel cron sends x-vercel-cron header, but we also check authorization for extra security
  if (cronHeader !== "1" && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cronSecret = process.env.CRON_SECRET;

  if (!supabaseUrl) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL");
    return NextResponse.json(
      { error: "Missing NEXT_PUBLIC_SUPABASE_URL" },
      { status: 500 }
    );
  }

  if (!cronSecret) {
    console.error("Missing CRON_SECRET");
    return NextResponse.json(
      { error: "Missing CRON_SECRET" },
      { status: 500 }
    );
  }

  // Extract project ref from Supabase URL
  // URL format: https://<project-ref>.supabase.co
  const urlMatch = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
  if (!urlMatch) {
    console.error("Invalid NEXT_PUBLIC_SUPABASE_URL format");
    return NextResponse.json(
      { error: "Invalid NEXT_PUBLIC_SUPABASE_URL format" },
      { status: 500 }
    );
  }

  const projectRef = urlMatch[1];
  const functionUrl = `https://${projectRef}.functions.supabase.co/process-scheduled-tweets?secret=${encodeURIComponent(cronSecret)}`;

  try {
    console.log(`[${new Date().toISOString()}] Vercel cron tick: Calling Edge Function`);
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[${new Date().toISOString()}] Vercel cron tick: Edge Function error - ${response.status}: ${errorText}`
      );
      return NextResponse.json(
        { error: "Edge Function call failed", status: response.status, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log(
      `[${new Date().toISOString()}] Vercel cron tick: Success - Processed ${data.processed || 0} tweets`
    );

    return NextResponse.json({
      success: true,
      processed: data.processed || 0,
      results: data.results || [],
    });
  } catch (error: any) {
    console.error(
      `[${new Date().toISOString()}] Vercel cron tick: Exception - ${error?.message}`
    );
    return NextResponse.json(
      { error: "Failed to call Edge Function", details: error?.message },
      { status: 500 }
    );
  }
}
