import type { ModelPrompt } from "@/gen/stockpicker/v1/strategy_pb";
import { Check, Code2, Copy } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

interface ModelPromptsDisplayProps {
  prompts: ModelPrompt[];
  loading?: boolean;
}

export function ModelPromptsDisplay({ prompts, loading }: ModelPromptsDisplayProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Prompt copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (loading) {
    return <div className="text-sm text-gray-500 py-4">Loading model prompts...</div>;
  }

  if (prompts.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p className="mb-2">No model prompts found</p>
        <p className="text-sm">
          Prompts are generated automatically when a strategy is created. If this is a new strategy,
          prompts should appear shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
        <p className="text-sm text-blue-900">
          <strong>System Prompt:</strong> When these prompts are sent to AI models during workflow
          execution, they are prefixed with the following system prompt:
        </p>
        <p className="text-sm text-blue-800 mt-2 font-mono bg-blue-100 p-2 rounded">
          &quot;You are a professional financial AI analyst specializing in technical analysis.
          Analyze stock data from multiple sources and provide your top 10 stock recommendations
          with detailed technical analysis, source tracing, and risk assessment. Your technical
          analysis should be based on available data sources (price data, volume, sentiment, etc.)
          and include actionable chart points.&quot;
        </p>
        <p className="text-xs text-blue-700 mt-2">
          The prompts below are the <strong>user prompts</strong> that get sent along with runtime
          data (budget, sources, active predictions) to each AI model.
        </p>
      </div>

      {prompts.map((prompt) => (
        <div key={prompt.id} className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-gray-600" />
              <span className="font-semibold text-gray-900">{prompt.modelName}</span>
              <span className="text-xs text-gray-500">
                (Updated:{" "}
                {prompt.updatedAt
                  ? new Date(Number(prompt.updatedAt.seconds) * 1000).toLocaleString()
                  : "Unknown"}
                )
              </span>
            </div>
            <button
              onClick={() => copyToClipboard(prompt.prompt, prompt.id)}
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              {copiedId === prompt.id ? (
                <>
                  <Check className="w-4 h-4" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy
                </>
              )}
            </button>
          </div>
          <div className="p-4">
            <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono bg-gray-50 p-3 rounded border overflow-x-auto max-h-96 overflow-y-auto">
              {prompt.prompt}
            </pre>
          </div>
        </div>
      ))}
    </div>
  );
}
