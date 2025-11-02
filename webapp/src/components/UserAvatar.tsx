import type { User } from "@/gen/stockpicker/v1/strategy_pb";
import { User as UserIcon } from "lucide-react";

interface UserAvatarProps {
  user: User | null | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-16 h-16 text-lg",
};

export function UserAvatar({ user, size = "md", className = "" }: UserAvatarProps) {
  const sizeClass = sizeClasses[size];
  const displayName = user?.displayName || user?.username || "User";

  if (user?.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt={displayName}
        className={`${sizeClass} rounded-full object-cover ${className}`}
      />
    );
  }

  // Generate a consistent color based on username
  const getColorFromString = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360;
    return `hsl(${hue}, 65%, 50%)`;
  };

  const bgColor = user?.username ? getColorFromString(user.username) : "#6B7280";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center font-semibold text-white ${className}`}
      style={{ backgroundColor: bgColor }}
      title={displayName}
    >
      {initials || <UserIcon className="w-1/2 h-1/2" />}
    </div>
  );
}
