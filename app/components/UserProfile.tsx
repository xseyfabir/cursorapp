"use client";

import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

interface UserProfileData {
  id: string;
  email: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export default function UserProfile() {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (user) {
      fetchUserProfile();
    } else {
      setLoading(false);
    }
  }, [user]);

  const fetchUserProfile = async () => {
    if (!user) return;

    try {
      // Try fetching existing profile
      // Using type assertion to work around TypeScript inference issue with generated types
      const supabaseAny = supabase as any;
      const { data, error } = await supabaseAny
        .from("users")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error && error.code !== "PGRST116") {
        console.error("Error fetching profile:", error);
      }

      if (data) {
        setProfile(data);
      } else {
        // Create user profile via server API
        const res = await fetch("/api/create-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: user.id, email: user.email }),
        });

        const newProfile = await res.json();
        if (res.ok) {
          setProfile(newProfile);
        } else {
          console.error("Error creating profile:", newProfile.error);
        }
      }
    } catch (err) {
      console.error("Unexpected error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  if (loading) return <p>Loading profile...</p>;
  if (!user) return null;

  return (
    <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
        User Profile
      </h2>
      <div className="space-y-2 mb-6">
        <p className="text-gray-700 dark:text-gray-300">
          <span className="font-semibold">Email:</span> {user.email}
        </p>
        {profile && (
          <>
            <p className="text-gray-700 dark:text-gray-300">
              <span className="font-semibold">User ID:</span> {profile.id}
            </p>
            {profile.created_at && (
              <p className="text-gray-700 dark:text-gray-300">
                <span className="font-semibold">Member since:</span>{" "}
                {new Date(profile.created_at).toLocaleDateString()}
              </p>
            )}
          </>
        )}
      </div>
      <button
        onClick={handleSignOut}
        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-semibold"
      >
        Sign Out
      </button>
    </div>
  );
}
