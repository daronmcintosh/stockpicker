import {
  DEFAULT_SOURCE_CONFIG,
  type SourceConfig,
  SourceConfigEditor,
} from "@/components/strategy/SourceConfigEditor";
import { Frequency, RiskLevel } from "@/gen/stockpicker/v1/strategy_pb";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/connect";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import toast from "react-hot-toast";

export const Route = createFileRoute("/strategies/new")({
  component: NewStrategyPage,
});

// Helper to calculate trades per month from frequency
function getTradesPerMonth(frequency: Frequency): number {
  switch (frequency) {
    case Frequency.DAILY:
      return 22;
    case Frequency.TWICE_WEEKLY:
      return 8;
    case Frequency.WEEKLY:
      return 4;
    case Frequency.BIWEEKLY:
      return 2;
    case Frequency.MONTHLY:
      return 1;
    default:
      return 0;
  }
}

function NewStrategyPage() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Form state for calculated fields
  const [monthlyBudget, setMonthlyBudget] = useState(1000);
  const [frequency, setFrequency] = useState(Frequency.TWICE_WEEKLY);
  const [maxUniqueStocks, setMaxUniqueStocks] = useState(20);
  const [sourceConfig, setSourceConfig] = useState<SourceConfig>(DEFAULT_SOURCE_CONFIG);

  // Calculate derived values
  const calculatedValues = useMemo(() => {
    const tradesPerMonth = getTradesPerMonth(frequency);
    const perTradeBudget = monthlyBudget / tradesPerMonth;
    const perStockAllocation = perTradeBudget / 3; // Default 3 stocks per trade

    return {
      tradesPerMonth,
      perTradeBudget: perTradeBudget.toFixed(2),
      perStockAllocation: perStockAllocation.toFixed(2),
    };
  }, [monthlyBudget, frequency]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);

    if (!token) {
      toast.error("Please log in to create strategies");
      navigate({ to: "/login" });
      return;
    }

    try {
      const client = createClient(token);
      await client.strategy.createStrategy({
        name: formData.get("name") as string,
        description: formData.get("description") as string,
        customPrompt: formData.get("customPrompt") as string,
        monthlyBudget: Number(formData.get("monthlyBudget")),
        timeHorizon: formData.get("timeHorizon") as string,
        targetReturnPct: Number(formData.get("targetReturnPct")),
        frequency: Number(formData.get("frequency")) as Frequency,
        riskLevel: Number(formData.get("riskLevel")) as RiskLevel,
        maxUniqueStocks: Number(formData.get("maxUniqueStocks")),
        sourceConfig: JSON.stringify(sourceConfig),
      } as never);

      toast.success("Strategy created successfully!");
      navigate({ to: "/strategies", search: { id: undefined } });
    } catch (error) {
      console.error("Failed to create strategy:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create strategy. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-3xl font-bold mb-8">Create New Strategy</h1>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Basic Information */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 border-b pb-2">Basic Information</h2>

          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-2">
              Strategy Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., Tech Growth Q4 2024"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium mb-2">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="What's the goal of this strategy?"
            />
            <p className="text-xs text-gray-500 mt-1 flex items-start gap-1">
              <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
              Brief overview of your investment thesis
            </p>
          </div>
        </section>

        {/* Budget & Returns */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 border-b pb-2">Budget & Returns</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="monthlyBudget" className="block text-sm font-medium mb-2">
                Monthly Budget ($) *
              </label>
              <input
                type="number"
                id="monthlyBudget"
                name="monthlyBudget"
                required
                min="100"
                step="100"
                value={monthlyBudget}
                onChange={(e) => setMonthlyBudget(Number(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1 flex items-start gap-1">
                <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                Total amount to invest per month
              </p>
            </div>

            <div>
              <label htmlFor="targetReturnPct" className="block text-sm font-medium mb-2">
                Target Return (%) *
              </label>
              <input
                type="number"
                id="targetReturnPct"
                name="targetReturnPct"
                required
                min="1"
                max="100"
                step="0.5"
                defaultValue="10"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1 flex items-start gap-1">
                <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                Expected return percentage per trade
              </p>
            </div>
          </div>

          {/* Calculated Budget Breakdown */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium text-blue-900">Calculated Budget Allocation</p>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-blue-600">Trades/Month</p>
                <p className="font-semibold text-blue-900">{calculatedValues.tradesPerMonth}</p>
              </div>
              <div>
                <p className="text-blue-600">Per Trade</p>
                <p className="font-semibold text-blue-900">${calculatedValues.perTradeBudget}</p>
              </div>
              <div>
                <p className="text-blue-600">Per Stock</p>
                <p className="font-semibold text-blue-900">
                  ${calculatedValues.perStockAllocation}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Risk & Diversification */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 border-b pb-2">
            Risk & Diversification
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="timeHorizon" className="block text-sm font-medium mb-2">
                Time Horizon *
              </label>
              <select
                id="timeHorizon"
                name="timeHorizon"
                required
                defaultValue="3 months"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="1 week">1 Week</option>
                <option value="2 weeks">2 Weeks</option>
                <option value="1 month">1 Month</option>
                <option value="3 months">3 Months</option>
                <option value="6 months">6 Months</option>
                <option value="1 year">1 Year</option>
              </select>
              <p className="text-xs text-gray-500 mt-1 flex items-start gap-1">
                <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                Expected holding period for positions
              </p>
            </div>

            <div>
              <label htmlFor="frequency" className="block text-sm font-medium mb-2">
                Trading Frequency *
              </label>
              <select
                id="frequency"
                name="frequency"
                required
                value={frequency}
                onChange={(e) => setFrequency(Number(e.target.value) as Frequency)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={Frequency.DAILY}>Daily</option>
                <option value={Frequency.TWICE_WEEKLY}>Twice Weekly</option>
                <option value={Frequency.WEEKLY}>Weekly</option>
                <option value={Frequency.BIWEEKLY}>Bi-weekly</option>
                <option value={Frequency.MONTHLY}>Monthly</option>
              </select>
              <p className="text-xs text-gray-500 mt-1 flex items-start gap-1">
                <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                How often to execute new trades
              </p>
            </div>

            <div>
              <label htmlFor="riskLevel" className="block text-sm font-medium mb-2">
                Risk Level *
              </label>
              <select
                id="riskLevel"
                name="riskLevel"
                required
                defaultValue={RiskLevel.MEDIUM.toString()}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={RiskLevel.LOW}>Low (Conservative)</option>
                <option value={RiskLevel.MEDIUM}>Medium (Balanced)</option>
                <option value={RiskLevel.HIGH}>High (Aggressive)</option>
              </select>
              <p className="text-xs text-gray-500 mt-1 flex items-start gap-1">
                <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                Risk tolerance for stock selection
              </p>
            </div>

            <div>
              <label htmlFor="maxUniqueStocks" className="block text-sm font-medium mb-2">
                Max Unique Stocks *
              </label>
              <input
                type="number"
                id="maxUniqueStocks"
                name="maxUniqueStocks"
                required
                min="3"
                max="50"
                value={maxUniqueStocks}
                onChange={(e) => setMaxUniqueStocks(Number(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1 flex items-start gap-1">
                <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                Portfolio diversification limit
              </p>
            </div>
          </div>
        </section>

        {/* Data Sources */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 border-b pb-2">Data Sources</h2>
          <SourceConfigEditor config={sourceConfig} onChange={setSourceConfig} />
        </section>

        {/* Advanced Settings - Collapsible */}
        <section className="space-y-4">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-lg font-semibold text-gray-900 border-b pb-2 w-full hover:text-blue-600 transition-colors"
          >
            {showAdvanced ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            Advanced Settings (Optional)
          </button>

          {showAdvanced && (
            <div>
              <label htmlFor="customPrompt" className="block text-sm font-medium mb-2">
                Custom Analysis Prompt
              </label>
              <textarea
                id="customPrompt"
                name="customPrompt"
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., Focus on AI and cloud computing stocks, avoid recent IPOs, prefer companies with positive earnings"
              />
              <p className="text-xs text-gray-500 mt-1 flex items-start gap-1">
                <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                Custom instructions to guide AI stock analysis and selection
              </p>
            </div>
          )}
        </section>

        <div className="flex gap-4 pt-4">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Creating..." : "Create Strategy"}
          </button>
          <a
            href="/strategies"
            className="px-6 py-3 border border-gray-300 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}
