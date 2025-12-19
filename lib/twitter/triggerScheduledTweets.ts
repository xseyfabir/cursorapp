/**
 * Utility function to trigger the Supabase Edge Function that processes scheduled tweets
 * This is called from client-side code (dashboard, schedule-tweet page)
 * 
 * The function URL is constructed from NEXT_PUBLIC_SUPABASE_URL
 * The secret is passed as a query parameter (server-side only, never exposed to client)
 */
export async function triggerScheduledTweets(): Promise<{
  success: boolean;
  processed?: number;
  error?: string;
}> {
  try {
    // Call our API route which handles the secret securely
    const response = await fetch("/api/trigger-scheduled-tweets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
      return {
        success: false,
        error: errorData.error || `HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      processed: data.processed || 0,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || "Failed to trigger scheduled tweets",
    };
  }
}
