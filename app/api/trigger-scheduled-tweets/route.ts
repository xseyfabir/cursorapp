import { NextRequest, NextResponse } from "next/server";

/**
 * API route to trigger the Supabase Edge Function
 * This is called from client-side code (dashboard, schedule-tweet page)
 * The secret is kept server-side and never exposed to the client
 */
export async function POST(request: NextRequest) {
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
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[${new Date().toISOString()}] Trigger scheduled tweets: Edge Function error - ${response.status}: ${errorText}`
      );
      return NextResponse.json(
        { error: "Edge Function call failed", status: response.status },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({
      success: true,
      processed: data.processed || 0,
      results: data.results || [],
    });
  } catch (error: any) {
    console.error(
      `[${new Date().toISOString()}] Trigger scheduled tweets: Exception - ${error?.message}`
    );
    return NextResponse.json(
      { error: "Failed to call Edge Function", details: error?.message },
      { status: 500 }
    );
  }
}
