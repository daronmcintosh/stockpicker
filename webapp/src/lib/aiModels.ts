/**
 * Available AI models for strategy analysis
 */
export interface AIModel {
  id: string;
  name: string;
  provider: "openai" | "anthropic" | "google" | "xai" | "deepseek" | "ollama";
  description: string;
}

export const AVAILABLE_AI_MODELS: AIModel[] = [
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    description: "OpenAI's most advanced model",
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    description: "Fast and efficient OpenAI model",
  },
  {
    id: "gpt-4-turbo",
    name: "GPT-4 Turbo",
    provider: "openai",
    description: "Previous generation OpenAI model",
  },
  {
    id: "claude-3-opus",
    name: "Claude 3 Opus",
    provider: "anthropic",
    description: "Anthropic's most capable model",
  },
  {
    id: "claude-3-sonnet",
    name: "Claude 3 Sonnet",
    provider: "anthropic",
    description: "Anthropic's balanced model",
  },
  {
    id: "claude-3-haiku",
    name: "Claude 3 Haiku",
    provider: "anthropic",
    description: "Anthropic's fastest model",
  },
  {
    id: "claude-3-5-sonnet",
    name: "Claude 3.5 Sonnet",
    provider: "anthropic",
    description: "Anthropic's latest advanced model",
  },
  {
    id: "deepseek-chat",
    name: "DeepSeek Chat",
    provider: "deepseek",
    description: "DeepSeek's advanced language model",
  },
  {
    id: "deepseek-coder",
    name: "DeepSeek Coder",
    provider: "deepseek",
    description: "DeepSeek's code-specialized model",
  },
  {
    id: "ollama-llama3",
    name: "Ollama Llama 3",
    provider: "ollama",
    description: "Meta's Llama 3 via Ollama",
  },
  {
    id: "ollama-mistral",
    name: "Ollama Mistral",
    provider: "ollama",
    description: "Mistral AI model via Ollama",
  },
  {
    id: "gemini-pro",
    name: "Gemini Pro",
    provider: "google",
    description: "Google's Gemini Pro model",
  },
  {
    id: "gemini-ultra",
    name: "Gemini Ultra",
    provider: "google",
    description: "Google's most advanced Gemini model",
  },
  {
    id: "grok-beta",
    name: "Grok Beta",
    provider: "xai",
    description: "xAI's Grok model",
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
