type FilterType = "all" | "predictions" | "strategies";

interface FeedFiltersProps {
  filter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  showFollowing: boolean;
  onFollowingToggle: () => void;
  hasToken: boolean;
}

export function FeedFilters({
  filter,
  onFilterChange,
  showFollowing,
  onFollowingToggle,
  hasToken,
}: FeedFiltersProps) {
  return (
    <div className="flex items-center gap-2 mt-4 flex-wrap">
      <span className="text-sm font-medium text-gray-700">Filter:</span>
      <button
        type="button"
        onClick={() => onFilterChange("all")}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
          filter === "all"
            ? "bg-blue-600 text-white shadow-md"
            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
        }`}
      >
        All
      </button>
      <button
        type="button"
        onClick={() => onFilterChange("predictions")}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
          filter === "predictions"
            ? "bg-blue-600 text-white shadow-md"
            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
        }`}
      >
        Predictions
      </button>
      <button
        type="button"
        onClick={() => onFilterChange("strategies")}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
          filter === "strategies"
            ? "bg-blue-600 text-white shadow-md"
            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
        }`}
      >
        Strategies
      </button>
      {hasToken && (
        <div className="flex items-center gap-2 ml-2 pl-2 border-l border-gray-300">
          <span className="text-sm font-medium text-gray-700">Following:</span>
          <button
            type="button"
            onClick={onFollowingToggle}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              showFollowing ? "bg-blue-600" : "bg-gray-300"
            }`}
            role="switch"
            aria-checked={showFollowing}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                showFollowing ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      )}
    </div>
  );
}
