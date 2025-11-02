import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/connect";
import { Loader2, UserMinus, UserPlus } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

interface FollowButtonProps {
  userId: string;
  isFollowing: boolean;
  isCloseFriend?: boolean;
  onFollowChange?: () => void;
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
}

export function FollowButton({
  userId,
  isFollowing,
  isCloseFriend = false,
  onFollowChange,
  variant = "default",
  size = "md",
}: FollowButtonProps) {
  const { token, user: currentUser } = useAuth();
  const [loading, setLoading] = useState(false);

  // Don't show button if viewing own profile
  if (currentUser?.id === userId) {
    return null;
  }

  // Don't show button if not logged in
  if (!token) {
    return null;
  }

  const sizeClasses = {
    sm: "px-2 py-1 text-xs",
    md: "px-3 py-1.5 text-sm",
    lg: "px-4 py-2 text-base",
  };

  const variantClasses = {
    default: isFollowing
      ? "bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-300"
      : "bg-blue-600 text-white hover:bg-blue-700",
    outline: isFollowing
      ? "border-gray-300 text-gray-700 hover:bg-gray-50"
      : "border-blue-600 text-blue-600 hover:bg-blue-50",
    ghost: isFollowing ? "text-gray-600 hover:bg-gray-100" : "text-blue-600 hover:bg-blue-50",
  };

  const handleClick = async () => {
    if (!token) {
      toast.error("Please log in to follow users");
      return;
    }

    setLoading(true);
    try {
      const client = createClient(token);
      if (isFollowing) {
        await client.strategy.unfollowUser({ userId });
        toast.success("Unfollowed successfully");
      } else {
        await client.strategy.followUser({ userId });
        toast.success("Following successfully");
      }
      onFollowChange?.();
    } catch (error) {
      console.error("Failed to toggle follow:", error);
      toast.error(isFollowing ? "Failed to unfollow user" : "Failed to follow user");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={`
        ${sizeClasses[size]} 
        ${variantClasses[variant]}
        rounded-lg font-medium transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed
        inline-flex items-center gap-2
        ${variant !== "ghost" ? "border" : ""}
      `}
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{isFollowing ? "Unfollowing..." : "Following..."}</span>
        </>
      ) : (
        <>
          {isFollowing ? (
            <>
              <UserMinus className="w-4 h-4" />
              <span>{isCloseFriend ? "Close Friend" : "Following"}</span>
            </>
          ) : (
            <>
              <UserPlus className="w-4 h-4" />
              <span>Follow</span>
            </>
          )}
        </>
      )}
    </button>
  );
}
