const HARD_QUESTION_PATTERNS = [
  "compare",
  "risk",
  "clause",
  "legal",
  "financial",
  "contradiction",
  "summarize all",
  "explain why",
];

type ModelRouteInput = {
  maxOutputTokens: number;
  question: string;
  retrievedChunkCount: number;
};

export type ModelRoute = {
  maxOutputTokens: number;
  reason: string;
  selectedModel: string;
};

function getModelEnv(name: string, fallback: string) {
  const value = process.env[name]?.trim();

  return value || fallback;
}

export function routeModel({ maxOutputTokens, question, retrievedChunkCount }: ModelRouteInput): ModelRoute {
  const defaultModel = getModelEnv("ANTHROPIC_DEFAULT_MODEL", "claude-haiku-4-5");
  const strongModel = getModelEnv("ANTHROPIC_STRONG_MODEL", "claude-sonnet-4-6");
  const normalizedQuestion = question.toLowerCase();
  const matchedPattern = HARD_QUESTION_PATTERNS.find((pattern) => normalizedQuestion.includes(pattern));

  if (matchedPattern) {
    return {
      maxOutputTokens,
      reason: `Question matched harder-question keyword: ${matchedPattern}.`,
      selectedModel: strongModel,
    };
  }

  if (retrievedChunkCount >= 4) {
    return {
      maxOutputTokens,
      reason: "Question retrieved four or more chunks.",
      selectedModel: strongModel,
    };
  }

  if (question.length > 220) {
    return {
      maxOutputTokens,
      reason: "Question is longer than 220 characters.",
      selectedModel: strongModel,
    };
  }

  return {
    maxOutputTokens,
    reason: "Question fits default model routing.",
    selectedModel: defaultModel,
  };
}
