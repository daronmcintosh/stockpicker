import { UserAvatar } from "@/components/UserAvatar";
import {
  type LeaderboardEntry,
  LeaderboardScope,
  LeaderboardTimeframe,
} from "@/gen/stockpicker/v1/strategy_pb";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/connect";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Award, Medal, Trophy, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

export const Route = createFileRoute("/leaderboard")({
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const { token, user: currentUser } = useAuth();
  const [timeframe, setTimeframe] = useState<LeaderboardTimeframe>(LeaderboardTimeframe.ALL_TIME);
  const [scope, setScope] = useState<LeaderboardScope>(LeaderboardScope.GLOBAL);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [currentUserEntry, setCurrentUserEntry] = useState<LeaderboardEntry | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadLeaderboard = useCallback(async () => {
    if (!token) {
      toast.error("Please log in to view leaderboard");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const client = createClient(token);
      const response = await client.strategy.getLeaderboard({
        timeframe,
        scope,
        limit: 100, // Load top 100
        offset: 0,
      });

      setEntries(response.entries);
      setTotalCount(response.totalCount);
      setCurrentUserEntry(response.currentUserEntry || null);
    } catch (error) {
      console.error("Failed to load leaderboard:", error);
      toast.error("Failed to load leaderboard");
    } finally {
      setLoading(false);
    }
  }, [token, timeframe, scope]);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  const getMedalIcon = (rank: number) => {
    if (rank === 1) {
      return <Trophy className="w-6 h-6 text-yellow-500" />;
    }
    if (rank === 2) {
      return <Medal className="w-6 h-6 text-gray-400" />;
    }
    if (rank === 3) {
      return <Medal className="w-6 h-6 text-amber-600" />;
    }
    return null;
  };

  const getRankDisplay = (rank: number) => {
    if (rank <= 3) {
      return (
        <div className="flex items-center gap-2">
          {getMedalIcon(rank)}
          <span className="font-bold text-lg">#{rank}</span>
        </div>
      );
    }
    return <span className="font-semibold text-gray-700">#{rank}</span>;
  };

  const isCurrentUser = (userId: string) => {
    return currentUser?.id === userId;
  };

  if (!token) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Please Log In</h2>
          <p className="text-gray-600 mb-4">You need to be logged in to view the leaderboard.</p>
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

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Leaderboard</h1>
        <p className="text-gray-600">Compete with other traders and see who's on top!</p>
      </div>

      {/* Timeframe Tabs */}
      <div className="flex items-center gap-2 mb-4 border-b border-gray-200 pb-4">
        <span className="text-sm font-medium text-gray-700">Timeframe:</span>
        <button
          type="button"
          onClick={() => setTimeframe(LeaderboardTimeframe.ALL_TIME)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            timeframe === LeaderboardTimeframe.ALL_TIME
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          All Time
        </button>
        <button
          type="button"
          onClick={() => setTimeframe(LeaderboardTimeframe.MONTHLY)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            timeframe === LeaderboardTimeframe.MONTHLY
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          This Month
        </button>
      </div>

      {/* Scope Tabs */}
      <div className="flex items-center gap-2 mb-6 border-b border-gray-200 pb-4">
        <span className="text-sm font-medium text-gray-700">Scope:</span>
        <button
          type="button"
          onClick={() => setScope(LeaderboardScope.GLOBAL)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            scope === LeaderboardScope.GLOBAL
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          <Users className="w-4 h-4 inline mr-2" />
          Global
        </button>
        <button
          type="button"
          onClick={() => setScope(LeaderboardScope.FOLLOWING)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            scope === LeaderboardScope.FOLLOWING
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          Following
        </button>
        <button
          type="button"
          onClick={() => setScope(LeaderboardScope.CLOSE_FRIENDS)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            scope === LeaderboardScope.CLOSE_FRIENDS
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          Close Friends
        </button>
      </div>

      {/* Current User's Position Banner */}
      {currentUserEntry && currentUserEntry.user?.username && (
        <div
          className={`mb-6 p-4 rounded-lg border-2 ${
            isCurrentUser(currentUserEntry.user?.id)
              ? "bg-blue-50 border-blue-500"
              : "bg-gray-50 border-gray-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <UserAvatar user={currentUserEntry.user} size="md" />
              <div>
                <h3 className="font-semibold text-lg">
                  {currentUserEntry.user?.displayName || currentUserEntry.user?.username}
                </h3>
                <p className="text-sm text-gray-600">@{currentUserEntry.user?.username}</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">#{currentUserEntry.rank}</div>
              <div className="text-sm text-gray-600">Your Rank</div>
            </div>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-xs text-gray-500">Score</div>
                <div className="font-semibold">{currentUserEntry.performanceScore.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Win Rate</div>
                <div className="font-semibold">
                  {currentUserEntry.performance?.winRate.toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Avg Return</div>
                <div className="font-semibold">
                  {currentUserEntry.performance?.avgReturn?.toFixed(2) ?? "0.00"}%
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Streak</div>
                {currentUserEntry.performance?.currentStreak}
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-white rounded-lg shadow border border-gray-200 p-12 text-center">
          <Award className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">No entries yet</h3>
          <p className="text-gray-600">
            {scope === LeaderboardScope.GLOBAL
              ? "Be the first to make predictions and climb the leaderboard!"
              : scope === LeaderboardScope.FOLLOWING
                ? "Start following users to see their rankings here"
                : "No close friends yet - mutual follows will appear here"}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rank
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Score
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Predictions
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Wins
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Win Rate
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Avg Return
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Streak
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {entries.map((entry) => {
                const isCurrent = entry.user?.id ? isCurrentUser(entry.user.id) : false;
                return (
                  <tr
                    key={entry.user?.id}
                    className={`hover:bg-gray-50 transition-colors ${
                      isCurrent ? "bg-blue-50 border-l-4 border-l-blue-500" : ""
                    }`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">{getRankDisplay(entry.rank)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {entry.user?.username ? (
                        <Link
                          to="/users/$username"
                          params={{ username: entry.user.username }}
                          className="flex items-center gap-3 hover:text-blue-600 transition-colors"
                        >
                          <UserAvatar user={entry.user} size="sm" />
                          <div>
                            <div className="font-semibold">
                              {entry.user?.displayName || entry.user?.username}
                              {isCurrent && (
                                <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-gray-600">@{entry.user?.username}</div>
                          </div>
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3">
                          <UserAvatar user={entry.user} size="sm" />
                          <div>
                            <div className="font-semibold">
                              {entry.user?.displayName || "Unknown User"}
                            </div>
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="font-bold text-lg">{entry.performanceScore.toFixed(2)}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-gray-700">
                      {entry.performance?.totalPredictions}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-green-600 font-semibold">
                      {entry.performance?.wins}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-gray-700">
                      {entry.performance?.winRate.toFixed(1)}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span
                        className={`font-semibold ${
                          (entry.performance?.avgReturn ?? 0) >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {(entry.performance?.avgReturn ?? 0) >= 0 ? "+" : ""}
                        {entry.performance?.avgReturn?.toFixed(2) ?? "0.00"}%
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="font-semibold text-orange-600">
                        {entry.performance?.currentStreak}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Total count info */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 text-sm text-gray-600">
            Showing {entries.length} of {totalCount} {totalCount === 1 ? "user" : "users"}
          </div>
        </div>
      )}
    </div>
  );
}
