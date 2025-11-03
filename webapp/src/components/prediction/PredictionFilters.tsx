import {
  PredictionAction,
  PredictionStatus,
  type StrategyPrivacy,
} from "@/gen/stockpicker/v1/strategy_pb";
import { useNavigate } from "@tanstack/react-router";

interface PredictionFiltersProps {
  selectedStrategy: string;
  strategies: Array<{ id: string; name: string; privacy?: StrategyPrivacy }>;
  statusFilter: PredictionStatus | "all";
  actionFilter: PredictionAction | "all";
  onStrategyChange: (strategy: string) => void;
  onStatusChange: (status: PredictionStatus | "all") => void;
  onActionChange: (action: PredictionAction | "all") => void;
}

export function PredictionFilters({
  selectedStrategy,
  strategies,
  statusFilter,
  actionFilter,
  onStrategyChange,
  onStatusChange,
  onActionChange,
}: PredictionFiltersProps) {
  const navigate = useNavigate({ from: "/predictions" });

  const handleStrategyChange = (value: string) => {
    onStrategyChange(value);
    navigate({
      search: {
        strategy: value === "all" ? undefined : value,
        status: statusFilter === "all" ? undefined : statusFilter,
        action: actionFilter === "all" ? undefined : actionFilter,
      },
      replace: true,
    });
  };

  const handleStatusChange = (value: PredictionStatus | "all") => {
    onStatusChange(value);
    navigate({
      search: {
        strategy: selectedStrategy === "all" ? undefined : selectedStrategy,
        status: value === "all" ? undefined : value,
        action: actionFilter === "all" ? undefined : actionFilter,
      },
      replace: true,
    });
  };

  const handleActionChange = (value: PredictionAction | "all") => {
    onActionChange(value);
    navigate({
      search: {
        strategy: selectedStrategy === "all" ? undefined : selectedStrategy,
        status: statusFilter === "all" ? undefined : statusFilter,
        action: value === "all" ? undefined : value,
      },
      replace: true,
    });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 mb-6 shadow-sm">
      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-sm font-medium text-gray-700 whitespace-nowrap">Filters:</span>

        <select
          id="strategy-filter"
          value={selectedStrategy}
          onChange={(e) => handleStrategyChange(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
        >
          <option value="all">All Strategies</option>
          {strategies.map((strategy) => (
            <option key={strategy.id} value={strategy.id}>
              {strategy.name}
            </option>
          ))}
        </select>

        <select
          id="status-filter"
          value={statusFilter === "all" ? "all" : statusFilter}
          onChange={(e) => {
            const value =
              e.target.value === "all" ? "all" : (Number(e.target.value) as PredictionStatus);
            handleStatusChange(value);
          }}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
        >
          <option value="all">All Statuses</option>
          <option value={PredictionStatus.ACTIVE}>Active</option>
          <option value={PredictionStatus.HIT_TARGET}>Hit Target</option>
          <option value={PredictionStatus.HIT_STOP}>Hit Stop</option>
          <option value={PredictionStatus.EXPIRED}>Expired</option>
        </select>

        <select
          id="action-filter"
          value={actionFilter === "all" ? "all" : actionFilter}
          onChange={(e) => {
            const value =
              e.target.value === "all" ? "all" : (Number(e.target.value) as PredictionAction);
            handleActionChange(value);
          }}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
        >
          <option value="all">All Actions</option>
          <option value={PredictionAction.PENDING}>Pending</option>
          <option value={PredictionAction.ENTERED}>Entered</option>
          <option value={PredictionAction.DISMISSED}>Dismissed</option>
        </select>
      </div>
    </div>
  );
}
