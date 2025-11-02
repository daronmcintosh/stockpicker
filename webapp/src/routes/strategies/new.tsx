import { Frequency, RiskLevel } from "@/gen/stockpicker/v1/strategy_pb";
import { strategyClient } from "@/lib/connect";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import toast from "react-hot-toast";

export const Route = createFileRoute("/strategies/new")({
  component: NewStrategyPage,
});

function NewStrategyPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);

    try {
      await strategyClient.createStrategy({
        name: formData.get("name") as string,
        description: formData.get("description") as string,
        customPrompt: formData.get("customPrompt") as string,
        monthlyBudget: Number(formData.get("monthlyBudget")),
        timeHorizon: formData.get("timeHorizon") as string,
        targetReturnPct: Number(formData.get("targetReturnPct")),
        frequency: Number(formData.get("frequency")) as Frequency,
        riskLevel: Number(formData.get("riskLevel")) as RiskLevel,
        maxUniqueStocks: Number(formData.get("maxUniqueStocks")),
      });

      toast.success("Strategy created successfully!");
      navigate({ to: "/strategies" });
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
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-8">Create New Strategy</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
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
        </div>

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
          <p className="text-sm text-gray-500 mt-1">
            This prompt will guide the AI when analyzing and selecting stocks
          </p>
        </div>

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
              defaultValue="1000"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

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
          </div>

          <div>
            <label htmlFor="frequency" className="block text-sm font-medium mb-2">
              Trading Frequency *
            </label>
            <select
              id="frequency"
              name="frequency"
              required
              defaultValue={Frequency.TWICE_WEEKLY.toString()}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value={Frequency.DAILY}>Daily (~22 trades/month)</option>
              <option value={Frequency.TWICE_WEEKLY}>Twice Weekly (8 trades/month)</option>
              <option value={Frequency.WEEKLY}>Weekly (4 trades/month)</option>
              <option value={Frequency.BIWEEKLY}>Bi-weekly (2 trades/month)</option>
              <option value={Frequency.MONTHLY}>Monthly (1 trade/month)</option>
            </select>
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
              <option value={RiskLevel.LOW}>Low</option>
              <option value={RiskLevel.MEDIUM}>Medium</option>
              <option value={RiskLevel.HIGH}>High</option>
            </select>
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
              defaultValue="20"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-sm text-gray-500 mt-1">
              Max number of different stocks to hold at once
            </p>
          </div>
        </div>

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
