interface PredictionPerformanceBreakdownProps {
  predictionStats: {
    hitTarget: number;
    hitStop: number;
    active: number;
    expired: number;
    total: number;
  };
}

export function PredictionPerformanceBreakdown({
  predictionStats,
}: PredictionPerformanceBreakdownProps) {
  if (predictionStats.total === 0) {
    return null;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Prediction Performance</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">{predictionStats.hitTarget}</div>
          <div className="text-xs text-gray-600 mt-1">Hit Target</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-red-600">{predictionStats.hitStop}</div>
          <div className="text-xs text-gray-600 mt-1">Hit Stop Loss</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">{predictionStats.active}</div>
          <div className="text-xs text-gray-600 mt-1">Active</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-600">{predictionStats.expired}</div>
          <div className="text-xs text-gray-600 mt-1">Expired</div>
        </div>
      </div>
    </div>
  );
}
