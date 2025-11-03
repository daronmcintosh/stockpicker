/**
 * Available AI models for strategy analysis
 */
export interface AIModel {
  id: string;
  name: string;
  provider: "openai" | "anthropic" | "google" | "xai" | "deepseek" | "qwen";
  description: string;
}

export const AVAILABLE_AI_MODELS: AIModel[] = [
  {
    id: "gpt-5",
    name: "GPT 5",
    provider: "openai",
    description: "OpenAI's latest advanced model",
  },
  {
    id: "claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    provider: "anthropic",
    description: "Anthropic's Claude Sonnet 4.5 model",
  },
  {
    id: "claude-haiku-4.5",
    name: "Haiku 4.5",
    provider: "anthropic",
    description: "Anthropic's Claude Haiku 4.5 model",
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "google",
    description: "Google's Gemini 2.5 Pro model",
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "google",
    description: "Google's Gemini 2.5 Flash model",
  },
  {
    id: "grok-4",
    name: "Grok 4",
    provider: "xai",
    description: "xAI's Grok 4 model",
  },
  {
    id: "deepseek-chat-v3.1",
    name: "DeepSeek Chat V3.1",
    provider: "deepseek",
    description: "DeepSeek's Chat V3.1 model",
  },
  {
    id: "qwen3-max",
    name: "Qwen3 Max",
    provider: "qwen",
    description: "Qwen3 Max model",
  },
];

/**
 * Get model by ID
 */
export function getModelById(id: string): AIModel | undefined {
  return AVAILABLE_AI_MODELS.find((m) => m.id === id);
}

/**
 * Group models by provider
 */
export function groupModelsByProvider(): Record<string, AIModel[]> {
  return AVAILABLE_AI_MODELS.reduce(
    (acc, model) => {
      if (!acc[model.provider]) {
        acc[model.provider] = [];
      }
      acc[model.provider].push(model);
      return acc;
    },
    {} as Record<string, AIModel[]>
  );
}
