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
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 is "not found" - we'll handle that by creating a profile
        console.error("Error fetching profile:", error);
      }

      if (data) {
        setProfile(data);
      } else {
        // Create user profile if it doesn't exist
        const { data: newProfile, error: insertError } = await supabase
          .from("users")
          .insert({
            id: user.id,
            email: user.email,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (insertError) {
          console.error("Error creating profile:", insertError);
        } else {
          setProfile(newProfile);
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

  if (loading) {
    return (
      <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
        <p className="text-gray-600 dark:text-gray-300">Loading profile...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

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





