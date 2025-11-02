import { StrategyStatus } from "@/gen/stockpicker/v1/strategy_pb";
import { predictionClient, strategyClient } from "@/lib/connect";
import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, DollarSign, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/")({ component: App });

function App() {
  const [activeStrategiesCount, setActiveStrategiesCount] = useState(0);
  const [totalBudget, setTotalBudget] = useState(0);
  const [predictionsCount, setPredictionsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    try {
      // Load strategies
      const strategiesResponse = await strategyClient.listStrategies({});
      const strategies = strategiesResponse.strategies;

      // Count active strategies
      const activeCount = strategies.filter((s) => s.status === StrategyStatus.ACTIVE).length;
      setActiveStrategiesCount(activeCount);

      // Calculate total budget across all strategies
      const budget = strategies.reduce((sum, s) => sum + (s.monthlyBudget || 0), 0);
      setTotalBudget(budget);

      // Load predictions count
      // We need to load predictions from all strategies
      let totalPredictions = 0;
      for (const strategy of strategies) {
        try {
          const predictionsResponse = await predictionClient.listPredictions({
            strategyId: strategy.id,
          });
          totalPredictions += predictionsResponse.predictions.length;
        } catch (error) {
          // Ignore errors for individual strategy predictions
          console.error(`Failed to load predictions for strategy ${strategy.id}:`, error);
        }
      }
      setPredictionsCount(totalPredictions);
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">StockPicker Dashboard</h1>
        <p className="text-gray-600">AI-powered stock trading strategies for automated investing</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3 mb-8">
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-8 h-8 text-blue-600" />
            <h3 className="text-lg font-semibold">Active Strategies</h3>
          </div>
          {loading ? (
            <p className="text-3xl font-bold text-blue-600">...</p>
          ) : (
            <p className="text-3xl font-bold text-blue-600">{activeStrategiesCount}</p>
          )}
          <p className="text-sm text-gray-500 mt-1">Currently running strategies</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="w-8 h-8 text-green-600" />
            <h3 className="text-lg font-semibold">Predictions</h3>
          </div>
          {loading ? (
            <p className="text-3xl font-bold text-green-600">...</p>
          ) : (
            <p className="text-3xl font-bold text-green-600">{predictionsCount}</p>
          )}
          <p className="text-sm text-gray-500 mt-1">Total stock predictions</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <DollarSign className="w-8 h-8 text-purple-600" />
            <h3 className="text-lg font-semibold">Total Monthly Budget</h3>
          </div>
          {loading ? (
            <p className="text-3xl font-bold text-purple-600">...</p>
          ) : (
            <p className="text-3xl font-bold text-purple-600">${totalBudget.toLocaleString()}</p>
          )}
          <p className="text-sm text-gray-500 mt-1">Per month across all strategies</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-lg p-8 shadow-lg">
          <h2 className="text-2xl font-bold mb-3">Trading Strategies</h2>
          <p className="mb-6 opacity-90">
            Create and manage AI-powered trading strategies with custom prompts and risk levels
          </p>
          <a
            href="/strategies"
            className="inline-block bg-white text-blue-600 px-6 py-3 rounded-lg font-semibold hover:bg-blue-50 transition-colors"
          >
            Manage Strategies
          </a>
        </div>

        <div className="bg-gradient-to-br from-green-600 to-green-700 text-white rounded-lg p-8 shadow-lg">
          <h2 className="text-2xl font-bold mb-3">Stock Predictions</h2>
          <p className="mb-6 opacity-90">
            View AI-generated stock predictions and performance metrics for your strategies
          </p>
          <a
            href="/predictions"
            className="inline-block bg-white text-green-600 px-6 py-3 rounded-lg font-semibold hover:bg-green-50 transition-colors"
          >
            View Predictions
          </a>
        </div>
      </div>

      <div className="mt-8 bg-gray-50 border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-3">Getting Started</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Create your first trading strategy with a custom AI prompt</li>
          <li>Configure your monthly budget and risk tolerance</li>
          <li>Activate the strategy to start receiving stock predictions</li>
          <li>Monitor performance and adjust as needed</li>
        </ol>
      </div>
    </div>
  );
}
