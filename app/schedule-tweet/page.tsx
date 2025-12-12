"use client";

import { useEffect, useState } from "react";
import Header from "../components/Header";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ScheduleTweetPage() {
  const { user, loading: authLoading } = useAuth();
  const supabase = createClient();

  const [tweetText, setTweetText] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [charCount, setCharCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [hasTwitterAccount, setHasTwitterAccount] = useState(false);
  const [checkingAccount, setCheckingAccount] = useState(true);

  const maxLength = 280;

  useEffect(() => {
    if (user) {
      checkTwitterAccount();
    } else {
      setCheckingAccount(false);
    }
  }, [user]);

  const checkTwitterAccount = async () => {
    if (!user) return;

    try {
      const { data } = await supabase
        .from("twitter_accounts")
        .select("user_id")
        .eq("user_id", user.id)
        .single();

      setHasTwitterAccount(!!data);
    } catch (err) {
      setHasTwitterAccount(false);
    } finally {
      setCheckingAccount(false);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    if (text.length <= maxLength) {
      setTweetText(text);
      setCharCount(text.length);
    }
  };

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!scheduledAt) {
      setError("Please select a date and time");
      return;
    }

    const scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
      setError("Invalid date/time");
      return;
    }

    if (scheduledDate.getTime() < Date.now()) {
      setError("Scheduled time must be in the future");
      return;
    }

    if (tweetText.trim().length === 0) {
      setError("Tweet text is required");
      return;
    }

    if (tweetText.length > maxLength) {
      setError("Tweet must be 280 characters or less");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error: insertError } = await supabase.from("scheduled_tweets").insert({
        user_id: user?.id,
        text: tweetText.trim(),
        scheduled_at: scheduledDate.toISOString(),
        status: "pending",
      });

      if (insertError) {
        setError(insertError.message);
      } else {
        setSuccess(true);
        setTweetText("");
        setScheduledAt("");
        setCharCount(0);
      }
    } catch (err) {
      setError("Failed to schedule tweet. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || checkingAccount) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-grow container mx-auto px-4 py-12">
          <div className="max-w-2xl mx-auto">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
              <p className="text-gray-600 dark:text-gray-300">Loading...</p>
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
          <div className="max-w-2xl mx-auto">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 text-center">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Please sign in to schedule tweets
              </h2>
              <Link
                href="/login?redirect=/schedule-tweet"
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

  if (!hasTwitterAccount) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-grow container mx-auto px-4 py-12">
          <div className="max-w-2xl mx-auto">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 text-center">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Connect Twitter Account
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                You need to connect your Twitter account before scheduling tweets.
              </p>
              <Link
                href="/connect-twitter"
                className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
              >
                Connect Twitter
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
        <div className="max-w-2xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
              Schedule Tweet
            </h1>

            {success && (
              <div className="mb-6 p-4 bg-green-100 border border-green-400 text-green-700 rounded-lg dark:bg-green-900 dark:border-green-700 dark:text-green-200">
                Tweet scheduled successfully!
              </div>
            )}

            {error && (
              <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg dark:bg-red-900 dark:border-red-700 dark:text-red-200">
                {error}
              </div>
            )}

            <form onSubmit={handleSchedule} className="space-y-4">
              <div>
                <label
                  htmlFor="tweet-text"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Tweet Text
                </label>
                <textarea
                  id="tweet-text"
                  value={tweetText}
                  onChange={handleTextChange}
                  placeholder="What's happening?"
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white resize-none"
                  required
                />
                <div className="mt-2 flex justify-between items-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {charCount} / {maxLength} characters
                  </p>
                  {charCount > maxLength * 0.9 && (
                    <p
                      className={`text-sm font-semibold ${
                        charCount >= maxLength
                          ? "text-red-600 dark:text-red-400"
                          : "text-yellow-600 dark:text-yellow-400"
                      }`}
                    >
                      {maxLength - charCount} characters remaining
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label
                  htmlFor="scheduled-at"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Scheduled Time
                </label>
                <input
                  id="scheduled-at"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>

              <button
                type="submit"
                disabled={
                  isSubmitting ||
                  tweetText.length === 0 ||
                  tweetText.length > maxLength
                }
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-semibold"
              >
                {isSubmitting ? "Scheduling..." : "Schedule Tweet"}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}


