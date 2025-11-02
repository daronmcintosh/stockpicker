import { FollowButton } from "@/components/FollowButton";
import { UserAvatar } from "@/components/UserAvatar";
import type { User } from "@/gen/stockpicker/v1/strategy_pb";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/connect";
import { Link, createFileRoute } from "@tanstack/react-router";
import { UserCheck, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

export const Route = createFileRoute("/friends")({
  component: FriendsPage,
});

type TabType = "following" | "followers" | "close-friends";

function FriendsPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>("following");
  const [following, setFollowing] = useState<User[]>([]);
  const [followers, setFollowers] = useState<User[]>([]);
  const [closeFriends, setCloseFriends] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      loadFriends();
    } else {
      setLoading(false);
    }
  }, [token]);

  async function loadFriends() {
    if (!token) {
      toast.error("Please log in to view friends");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const client = createClient(token);

      // Load all lists in parallel
      const [followingResponse, followersResponse, closeFriendsResponse] = await Promise.all([
        client.strategy.listFollowing({}),
        client.strategy.listFollowers({}),
        client.strategy.listCloseFriends({}),
      ]);

      setFollowing(followingResponse.users);
      setFollowers(followersResponse.users);
      setCloseFriends(closeFriendsResponse.users);
    } catch (error) {
      console.error("Failed to load friends:", error);
      toast.error("Failed to load friends");
    } finally {
      setLoading(false);
    }
  }

  const handleFollowChange = () => {
    loadFriends();
  };

  const currentList =
    activeTab === "following" ? following : activeTab === "followers" ? followers : closeFriends;

  if (!token) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Please Log In</h2>
          <p className="text-gray-600 mb-4">You need to be logged in to view your friends.</p>
          <Link
            to="/login"
            className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-lg">Loading friends...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">Friends</h1>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setActiveTab("following")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "following"
              ? "border-b-2 border-blue-600 text-blue-600"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4" />
            Following ({following.length})
          </div>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("followers")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "followers"
              ? "border-b-2 border-blue-600 text-blue-600"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Followers ({followers.length})
          </div>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("close-friends")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "close-friends"
              ? "border-b-2 border-blue-600 text-blue-600"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4" />
            Close Friends ({closeFriends.length})
          </div>
        </button>
      </div>

      {/* User List */}
      {currentList.length === 0 ? (
        <div className="bg-white rounded-lg shadow border border-gray-200 p-12 text-center">
          <div className="text-gray-400 mb-4">
            {activeTab === "following" && <UserPlus className="w-12 h-12 mx-auto" />}
            {activeTab === "followers" && <Users className="w-12 h-12 mx-auto" />}
            {activeTab === "close-friends" && <UserCheck className="w-12 h-12 mx-auto" />}
          </div>
          <h3 className="text-xl font-semibold mb-2">
            {activeTab === "following" && "Not following anyone yet"}
            {activeTab === "followers" && "No followers yet"}
            {activeTab === "close-friends" && "No close friends yet"}
          </h3>
          <p className="text-gray-600">
            {activeTab === "following" &&
              "Start following users to see their strategies and predictions"}
            {activeTab === "followers" && "When users follow you, they'll appear here"}
            {activeTab === "close-friends" &&
              "Close friends are users you follow and who also follow you back"}
          </p>
          {activeTab === "following" && (
            <Link
              to="/feed"
              className="mt-4 inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Discover Users
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {currentList.map((user) => (
            <div
              key={user.id}
              className="bg-white rounded-lg shadow border border-gray-200 p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-4">
                <Link to="/users/$username" params={{ username: user.username }}>
                  <UserAvatar user={user} size="md" />
                </Link>
                <div className="flex-1">
                  <Link
                    to="/users/$username"
                    params={{ username: user.username }}
                    className="block hover:text-blue-600 transition-colors"
                  >
                    <h3 className="font-semibold text-lg">{user.displayName || user.username}</h3>
                    <p className="text-gray-600 text-sm">@{user.username}</p>
                  </Link>
                </div>
                {activeTab === "followers" && (
                  <FollowButton
                    userId={user.id}
                    isFollowing={following.some((u) => u.id === user.id)}
                    isCloseFriend={closeFriends.some((u) => u.id === user.id)}
                    onFollowChange={handleFollowChange}
                    variant="outline"
                  />
                )}
                {activeTab === "following" && (
                  <FollowButton
                    userId={user.id}
                    isFollowing={true}
                    isCloseFriend={closeFriends.some((u) => u.id === user.id)}
                    onFollowChange={handleFollowChange}
                    variant="outline"
                  />
                )}
                {activeTab === "close-friends" && (
                  <div className="flex items-center gap-2 text-green-600">
                    <UserCheck className="w-5 h-5" />
                    <span className="text-sm font-medium">Close Friend</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
