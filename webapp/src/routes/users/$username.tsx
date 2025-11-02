import { FollowButton } from "@/components/FollowButton";
import { UserAvatar } from "@/components/UserAvatar";
import type { User } from "@/gen/stockpicker/v1/strategy_pb";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/connect";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  Edit2,
  Mail,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

export const Route = createFileRoute("/users/$username")({
  component: UserProfilePage,
});

function UserProfilePage() {
  const { username: usernameFromRoute } = Route.useParams();
  const { token, user: currentUser, setUser } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isCloseFriend, setIsCloseFriend] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [stats, setStats] = useState({
    totalStrategies: 0,
    activeStrategies: 0,
    totalPredictions: 0,
    activePredictions: 0,
  });
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      if (!token) {
        toast.error("Please log in to view profiles");
        setLoading(false);
        return;
      }

      const client = createClient(token);
      const response = await client.strategy.getUserProfile({
        username: usernameFromRoute,
      });

      if (response.user) {
        setProfile(response.user);
        setIsFollowing(response.isFollowing || false);
        setIsCloseFriend(response.isCloseFriend || false);

        // Load followers/following counts
        try {
          const followersResponse = await client.strategy.listFollowers({
            userId: response.user.id,
          });
          setFollowersCount(followersResponse.users.length);

          const followingResponse = await client.strategy.listFollowing({
            userId: response.user.id,
          });
          setFollowingCount(followingResponse.users.length);
        } catch (error) {
          console.error("Failed to load follower counts:", error);
        }

        // Load user's strategies and predictions for stats
        try {
          const strategiesResponse = await client.strategy.listStrategies({});
          const userStrategies = strategiesResponse.strategies.filter(
            (s) => s.user?.id === response.user?.id
          );
          setStats({
            totalStrategies: userStrategies.length,
            activeStrategies: userStrategies.filter(
              (s) => s.status === 1 // ACTIVE
            ).length,
            totalPredictions: 0, // Would need prediction counts endpoint
            activePredictions: 0,
          });
        } catch (error) {
          console.error("Failed to load user stats:", error);
        }
      }
    } catch (error) {
      console.error("Failed to load profile:", error);
      toast.error("Failed to load user profile");
    } finally {
      setLoading(false);
    }
  }, [token, usernameFromRoute]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleFollowChange = () => {
    loadProfile();
  };

  const handleEditUsername = () => {
    if (profile) {
      setNewUsername(profile.username);
      setIsEditingUsername(true);
    }
  };

  const handleSaveUsername = async () => {
    if (!token || !profile) return;

    const trimmedUsername = newUsername.trim();
    if (trimmedUsername === profile.username) {
      setIsEditingUsername(false);
      return;
    }

    if (trimmedUsername.length < 3 || trimmedUsername.length > 30) {
      toast.error("Username must be between 3 and 30 characters");
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(trimmedUsername)) {
      toast.error("Username can only contain letters, numbers, underscores, and hyphens");
      return;
    }

    setIsSaving(true);
    try {
      const client = createClient(token);
      const response = await client.strategy.updateUser({
        username: trimmedUsername,
      });

      if (response.user) {
        toast.success("Username updated successfully!");
        setUser(response.user);
        setIsEditingUsername(false);
        // Navigate to new username URL
        navigate({
          to: "/users/$username",
          params: { username: response.user.username },
          replace: true,
        });
      }
    } catch (error: unknown) {
      console.error("Failed to update username:", error);
      if (error instanceof Error) {
        toast.error(error.message || "Failed to update username");
      } else {
        toast.error("Failed to update username");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingUsername(false);
    setNewUsername("");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-lg">Loading profile...</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">User Not Found</h2>
          <p className="text-gray-600">The user you're looking for doesn't exist.</p>
          <Link to="/feed" className="mt-4 inline-block text-blue-600 hover:text-blue-700">
            Go to Feed
          </Link>
        </div>
      </div>
    );
  }

  const isOwnProfile = currentUser?.id === profile.id;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Profile Header */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6 mb-6">
        <div className="flex items-start gap-6">
          <UserAvatar user={profile} size="lg" />
          <div className="flex-1">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex-1">
                {isEditingUsername ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-semibold"
                        placeholder="Username"
                        maxLength={30}
                        disabled={isSaving}
                      />
                      <button
                        type="button"
                        onClick={handleSaveUsername}
                        disabled={isSaving || newUsername.trim() === profile.username}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                      >
                        {isSaving ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        disabled={isSaving}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                    <p className="text-xs text-gray-500">
                      3-30 characters, letters, numbers, underscores, and hyphens only
                    </p>
                  </div>
                ) : (
                  <>
                    <h1 className="text-3xl font-bold text-gray-900">
                      {profile.displayName || profile.username}
                    </h1>
                    <div className="flex items-center gap-2">
                      <p className="text-gray-600">@{profile.username}</p>
                      {isOwnProfile && (
                        <button
                          type="button"
                          onClick={handleEditUsername}
                          className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                          title="Edit username"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
              {!isOwnProfile && !isEditingUsername && (
                <FollowButton
                  userId={profile.id}
                  isFollowing={isFollowing}
                  isCloseFriend={isCloseFriend}
                  onFollowChange={handleFollowChange}
                />
              )}
            </div>

            {profile.email && (
              <div className="flex items-center gap-2 text-gray-600 mb-4">
                <Mail className="w-4 h-4" />
                <span>{profile.email}</span>
              </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <div className="text-2xl font-bold">{followersCount}</div>
                <div className="text-sm text-gray-600">Followers</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <UserPlus className="w-5 h-5 text-green-600" />
                </div>
                <div className="text-2xl font-bold">{followingCount}</div>
                <div className="text-sm text-gray-600">Following</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <BarChart3 className="w-5 h-5 text-purple-600" />
                </div>
                <div className="text-2xl font-bold">{stats.totalStrategies}</div>
                <div className="text-sm text-gray-600">Strategies</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <TrendingUp className="w-5 h-5 text-orange-600" />
                </div>
                <div className="text-2xl font-bold">{stats.totalPredictions}</div>
                <div className="text-sm text-gray-600">Predictions</div>
              </div>
            </div>

            {isCloseFriend && (
              <div className="mt-4 flex items-center gap-2 text-green-600">
                <UserCheck className="w-4 h-4" />
                <span className="text-sm font-medium">Close Friend</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* User's Public Strategies & Predictions */}
      <div className="grid gap-6">
        <div>
          <h2 className="text-xl font-bold mb-4">Public Strategies</h2>
          <div className="bg-white rounded-lg shadow border border-gray-200 p-4">
            <p className="text-gray-600 text-center py-8">
              {isOwnProfile
                ? "Your public strategies will appear here"
                : "This user's public strategies will appear here"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
