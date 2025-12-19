"use client";

import { useEffect, useState } from "react";
import Header from "../components/Header";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { triggerScheduledTweets } from "@/lib/twitter/triggerScheduledTweets";

interface TwitterAccount {
  user_id: string;
  created_at: string | null;
}

interface ScheduledTweet {
  id: string;
  text: string;
  scheduled_at: string;
  status: string | null;
  posted_at: string | null;
  error_message: string | null;
  created_at: string | null;
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const supabase = createClient();

  const [twitterAccount, setTwitterAccount] = useState<TwitterAccount | null>(null);
  const [scheduledTweets, setScheduledTweets] = useState<ScheduledTweet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editScheduledAt, setEditScheduledAt] = useState("");

  useEffect(() => {
    if (user) {
      fetchData();
      // Trigger Edge Function on dashboard load to process any due tweets
      triggerScheduledTweets().catch((err) => {
        // Silently fail - this is a background operation
        console.error("Failed to trigger scheduled tweets processor:", err);
      });
    } else if (!authLoading) {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  // Trigger Edge Function when app regains focus (user returns to tab)
  useEffect(() => {
    if (!user) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Trigger Edge Function when tab becomes visible
        triggerScheduledTweets().catch((err) => {
          // Silently fail - this is a background operation
          console.error("Failed to trigger scheduled tweets processor:", err);
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [user]);

  const fetchData = async () => {
    if (!user) return;

    try {
      // Fetch Twitter account status
      const { data: accountData } = await supabase
        .from("twitter_accounts")
        .select("user_id, created_at")
        .eq("user_id", user.id)
        .single();

      setTwitterAccount(accountData || null);

      // Fetch scheduled tweets
      const { data: tweetsData, error: tweetsError } = await supabase
        .from("scheduled_tweets")
        .select("*")
        .eq("user_id", user.id)
        .order("scheduled_at", { ascending: true });

      if (tweetsError) {
        console.error("Error fetching tweets:", tweetsError);
      } else {
        setScheduledTweets(tweetsData || []);
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      setError("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this scheduled tweet?")) {
      return;
    }

    try {
      const response = await fetch(`/api/scheduled-tweets/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete tweet");
      }

      // Refresh the list
      fetchData();
    } catch (err: any) {
      setError(err.message || "Failed to delete tweet");
    }
  };

  const handleEdit = (tweet: ScheduledTweet) => {
    setEditingId(tweet.id);
    setEditText(tweet.text);
    setEditScheduledAt(new Date(tweet.scheduled_at).toISOString().slice(0, 16));
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditText("");
    setEditScheduledAt("");
  };

  const handleSaveEdit = async (id: string) => {
    if (!editText.trim() || editText.length > 280) {
      setError("Tweet text must be between 1 and 280 characters");
      return;
    }

    const scheduledDate = new Date(editScheduledAt);
    if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
      setError("Scheduled time must be in the future");
      return;
    }

    try {
      const response = await fetch(`/api/scheduled-tweets/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: editText,
          scheduled_at: scheduledDate.toISOString(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update tweet");
      }

      setEditingId(null);
      setEditText("");
      setEditScheduledAt("");
      setError(null);
      fetchData();
    } catch (err: any) {
      setError(err.message || "Failed to update tweet");
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "posted":
        return (
          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
            Posted
          </span>
        );
      case "failed":
        return (
          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
            Failed
          </span>
        );
      case "pending":
        return (
          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            Pending
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200">
            Unknown
          </span>
        );
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-grow container mx-auto px-4 py-12">
          <div className="max-w-6xl mx-auto">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
              <p className="text-gray-600 dark:text-gray-300">Loading dashboard...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-grow container mx-auto px-4 py-12">
          <div className="max-w-6xl mx-auto">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 text-center">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Please sign in to view your dashboard
              </h2>
              <Link
                href="/login?redirect=/dashboard"
                className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
              >
                Sign In
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-0">
              Dashboard
            </h1>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/compose-tweet"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold text-center"
              >
                Compose Tweet
              </Link>
              <Link
                href="/schedule-tweet"
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold text-center"
              >
                Schedule Tweet
              </Link>
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg dark:bg-red-900 dark:border-red-700 dark:text-red-200">
              {error}
            </div>
          )}

          {/* Twitter Account Status */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Twitter Account Status
            </h2>
            {twitterAccount ? (
              <div className="flex items-center space-x-3">
                <div className="text-2xl">✓</div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    Twitter Connected
                  </p>
                  {twitterAccount.created_at && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Connected on:{" "}
                      {new Date(twitterAccount.created_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="text-2xl">✗</div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      Twitter Not Connected
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Connect your Twitter account to schedule and post tweets
                    </p>
                  </div>
                </div>
                <Link
                  href="/connect-twitter"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
                >
                  Connect Twitter
                </Link>
              </div>
            )}
          </div>

          {/* Scheduled Tweets */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Scheduled Tweets ({scheduledTweets.length})
            </h2>
            {scheduledTweets.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  No scheduled tweets yet.
                </p>
                <Link
                  href="/schedule-tweet"
                  className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
                >
                  Schedule Your First Tweet
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {scheduledTweets.map((tweet) => (
                  <div
                    key={tweet.id}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    {editingId === tweet.id ? (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Tweet Text
                          </label>
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            maxLength={280}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white resize-none"
                          />
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {editText.length} / 280 characters
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Scheduled Date & Time
                          </label>
                          <input
                            type="datetime-local"
                            value={editScheduledAt}
                            onChange={(e) => setEditScheduledAt(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                          />
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleSaveEdit(tweet.id)}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold text-sm"
                          >
                            Save
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-semibold text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                          <div className="flex-1">
                            <p className="text-gray-900 dark:text-white mb-2 whitespace-pre-wrap break-words">
                              {tweet.text}
                            </p>
                            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                              <span>
                                Scheduled: {new Date(tweet.scheduled_at).toLocaleString()}
                              </span>
                              {tweet.posted_at && (
                                <span>
                                  Posted: {new Date(tweet.posted_at).toLocaleString()}
                                </span>
                              )}
                              {tweet.created_at && (
                                <span>
                                  Created: {new Date(tweet.created_at).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                            {tweet.error_message && (
                              <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                                Error: {tweet.error_message}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                            {getStatusBadge(tweet.status)}
                            {tweet.status === "pending" && (
                              <>
                                <button
                                  onClick={() => handleEdit(tweet)}
                                  className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm font-semibold"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDelete(tweet.id)}
                                  className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm font-semibold"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                            {tweet.status !== "pending" && (
                              <button
                                onClick={() => handleDelete(tweet.id)}
                                className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm font-semibold"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
