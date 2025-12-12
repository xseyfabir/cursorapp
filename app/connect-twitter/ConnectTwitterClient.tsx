"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface TwitterConnection {
  user_id: string;
  created_at: string | null;
}

export default function ConnectTwitterClient() {
  const { user, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const [connection, setConnection] = useState<TwitterConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    const errorParam = searchParams.get("error");
    const successParam = searchParams.get("success");

    if (errorParam) {
      setError(getErrorMessage(errorParam, searchParams));
    }
    if (successParam === "true") {
      setSuccess(true);
      fetchConnectionStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (user) {
      fetchConnectionStatus();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchConnectionStatus = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("twitter_accounts")
        .select("user_id, created_at")
        .eq("user_id", user.id)
        .single();

      if (error && error.code !== "PGRST116") {
        console.error("Error fetching connection:", error);
      } else if (data) {
        setConnection(data);
      }
    } catch (err) {
      console.error("Unexpected error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectTwitter = async () => {
    setConnecting(true);
    setError(null);
    setSuccess(false);

    try {
      window.location.href = "/api/auth/twitter";
    } catch {
      setError("Failed to initiate Twitter connection");
      setConnecting(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
          <p className="text-gray-600 dark:text-gray-300">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Please sign in to connect Twitter
          </h2>
          <Link
            href="/login?redirect=/connect-twitter"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
          Connect Twitter
        </h1>

        {success && (
          <div className="mb-6 p-4 bg-green-100 border border-green-400 text-green-700 rounded-lg dark:bg-green-900 dark:border-green-700 dark:text-green-200">
            Twitter account connected successfully!
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg dark:bg-red-900 dark:border-red-700 dark:text-red-200">
            {error}
          </div>
        )}

        {connection ? (
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="text-2xl">✓</div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    Twitter Connected
                  </p>
                  {connection.created_at && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Connected on:{" "}
                      {new Date(connection.created_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={handleConnectTwitter}
              disabled={connecting}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-semibold"
            >
              {connecting ? "Connecting..." : "Reconnect Twitter"}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Connect your Twitter account to enable Twitter features in this
              application. Your access token will be stored securely and linked
              to your account.
            </p>
            <button
              onClick={handleConnectTwitter}
              disabled={connecting}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-semibold flex items-center justify-center space-x-2"
            >
              {connecting ? (
                <span>Connecting...</span>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  <span>Connect Twitter</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function getErrorMessage(error: string, searchParams: URLSearchParams): string {
  const details = searchParams.get("details");
  const errorMessages: Record<string, string> = {
    access_denied: "Twitter connection was cancelled.",
    invalid_state: "Invalid authentication state. Please try again.",
    missing_code: "Authorization code missing. Please try again.",
    token_exchange_failed: details
      ? `Failed to exchange authorization code: ${decodeURIComponent(details)}`
      : "Failed to exchange authorization code. Please check your Twitter app configuration and environment variables.",
    storage_failed: details
      ? `Failed to store Twitter credentials: ${decodeURIComponent(details)}. Please check if the twitter_accounts table exists and RLS policies are configured correctly.`
      : "Failed to store Twitter credentials. Please check if the twitter_accounts table exists in Supabase.",
    storage_failed_table_missing:
      "The twitter_accounts table does not exist. Please run the SQL migration in Supabase to create the table.",
    storage_failed_permission_denied:
      "Permission denied. Please check your Row Level Security (RLS) policies for the twitter_accounts table. Ensure the INSERT and UPDATE policies allow authenticated users to modify their own records.",
    callback_failed: "An error occurred during authentication. Please try again.",
    oauth_init_failed:
      "Failed to initiate Twitter connection. Please check your TWITTER_CLIENT_ID environment variable.",
  };

  return errorMessages[error] || `An error occurred: ${error}. Please try again.`;
}


