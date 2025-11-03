import { CheckCircle2, ChevronDown, ChevronRight, Info } from "lucide-react";
import { useState } from "react";

export interface SourceConfig {
  enabled: {
    alpha_vantage: boolean;
    polymarket: boolean;
    reddit: boolean;
    news: boolean;
    earnings: boolean;
    politics: boolean;
  };
  reddit?: {
    subreddits: string[];
  };
  news?: {
    sources: string[];
  };
}

const DEFAULT_SOURCE_CONFIG: SourceConfig = {
  enabled: {
    alpha_vantage: true,
    polymarket: true,
    reddit: true,
    news: true,
    earnings: true,
    politics: true,
  },
  reddit: {
    subreddits: ["wallstreetbets", "stocks", "investing", "StockMarket", "options"],
  },
  news: {
    sources: ["general"],
  },
};

const COMMON_SUBREDDITS = [
  "wallstreetbets",
  "stocks",
  "investing",
  "StockMarket",
  "options",
  "SecurityAnalysis",
  "investingforbeginners",
  "ValueInvesting",
  "dividends",
  "pennystocks",
  "RobinHood",
  "SmallCapStock",
  "Daytrading",
  "Stock_Picks",
  "TradeIdeas",
];

interface SourceConfigEditorProps {
  config: SourceConfig;
  onChange: (config: SourceConfig) => void;
}

export function SourceConfigEditor({ config, onChange }: SourceConfigEditorProps) {
  const [expandedSource, setExpandedSource] = useState<string | null>(null);

  const updateEnabled = (source: keyof SourceConfig["enabled"], value: boolean) => {
    onChange({
      ...config,
      enabled: {
        ...config.enabled,
        [source]: value,
      },
    });
  };

  const updateRedditSubreddits = (subreddits: string[]) => {
    onChange({
      ...config,
      reddit: {
        ...config.reddit,
        subreddits,
      },
    });
  };

  const toggleSubreddit = (subreddit: string) => {
    const current = config.reddit?.subreddits || [];
    if (current.includes(subreddit)) {
      updateRedditSubreddits(current.filter((s) => s !== subreddit));
    } else {
      updateRedditSubreddits([...current, subreddit]);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 text-sm text-gray-600">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <p>
          Select which data sources to use for stock analysis. Default sources are pre-selected. You
          can customize Reddit subreddits for sentiment analysis.
        </p>
      </div>

      {/* Source Toggles */}
      <div className="space-y-3">
        {/* Alpha Vantage */}
        <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="source-alpha-vantage"
              checked={config.enabled.alpha_vantage}
              onChange={(e) => updateEnabled("alpha_vantage", e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="source-alpha-vantage" className="flex-1 cursor-pointer">
              <div className="font-medium text-gray-900">Alpha Vantage</div>
              <div className="text-sm text-gray-500">
                Top gainers/losers, price data, technical indicators
              </div>
            </label>
          </div>
        </div>

        {/* Reddit */}
        <div className="border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between p-3 hover:bg-gray-50">
            <div className="flex items-center gap-3 flex-1">
              <input
                type="checkbox"
                id="source-reddit"
                checked={config.enabled.reddit}
                onChange={(e) => updateEnabled("reddit", e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="source-reddit" className="flex-1 cursor-pointer">
                <div className="font-medium text-gray-900">Reddit Sentiment</div>
                <div className="text-sm text-gray-500">
                  Social sentiment from Reddit discussions
                </div>
              </label>
            </div>
            {config.enabled.reddit && (
              <button
                type="button"
                onClick={() => setExpandedSource(expandedSource === "reddit" ? null : "reddit")}
                className="ml-2 text-gray-500 hover:text-gray-700"
              >
                {expandedSource === "reddit" ? (
                  <ChevronDown className="w-5 h-5" />
                ) : (
                  <ChevronRight className="w-5 h-5" />
                )}
              </button>
            )}
          </div>

          {config.enabled.reddit && expandedSource === "reddit" && (
            <div className="px-3 pb-3 pt-2 bg-gray-50 border-t border-gray-200">
              <div className="text-sm font-medium text-gray-700 mb-2">
                Select Subreddits ({config.reddit?.subreddits.length || 0} selected)
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                {COMMON_SUBREDDITS.map((subreddit) => {
                  const isSelected = config.reddit?.subreddits.includes(subreddit) || false;
                  return (
                    <label
                      key={subreddit}
                      className={`flex items-center gap-2 p-2 rounded cursor-pointer ${
                        isSelected
                          ? "bg-blue-50 border border-blue-200"
                          : "bg-white border border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSubreddit(subreddit)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">r/{subreddit}</span>
                    </label>
                  );
                })}
              </div>
              {config.reddit?.subreddits.length === 0 && (
                <p className="text-xs text-amber-600 mt-2">
                  ⚠️ At least one subreddit must be selected
                </p>
              )}
            </div>
          )}
        </div>

        {/* Polymarket */}
        <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="source-polymarket"
              checked={config.enabled.polymarket}
              onChange={(e) => updateEnabled("polymarket", e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="source-polymarket" className="flex-1 cursor-pointer">
              <div className="font-medium text-gray-900">Polymarket</div>
              <div className="text-sm text-gray-500">
                Prediction market odds and market sentiment
              </div>
            </label>
          </div>
        </div>

        {/* News */}
        <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="source-news"
              checked={config.enabled.news}
              onChange={(e) => updateEnabled("news", e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="source-news" className="flex-1 cursor-pointer">
              <div className="font-medium text-gray-900">News</div>
              <div className="text-sm text-gray-500">Financial news articles and headlines</div>
            </label>
          </div>
        </div>

        {/* Earnings */}
        <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="source-earnings"
              checked={config.enabled.earnings}
              onChange={(e) => updateEnabled("earnings", e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="source-earnings" className="flex-1 cursor-pointer">
              <div className="font-medium text-gray-900">Earnings</div>
              <div className="text-sm text-gray-500">Upcoming earnings dates and expectations</div>
            </label>
          </div>
        </div>

        {/* Politics */}
        <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="source-politics"
              checked={config.enabled.politics}
              onChange={(e) => updateEnabled("politics", e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="source-politics" className="flex-1 cursor-pointer">
              <div className="font-medium text-gray-900">Politics</div>
              <div className="text-sm text-gray-500">Policy impacts and regulatory news</div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

export { DEFAULT_SOURCE_CONFIG };
