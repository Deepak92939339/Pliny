import Anthropic from "@anthropic-ai/sdk";
import type { GenerationProviderPayload } from "./providerBoundary.ts";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_DEFAULT_MODEL = "z-ai/glm-5.3-flash";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const MAX_RETRY_DELAY_MS = 2_000;
const MAX_RESPONSE_CHARACTERS = 48_000;

export type AnswerProviderName = "anthropic" | "openrouter";

export type AnswerProviderUsage = {
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type AnswerProviderResult = {
  model: string;
  requestCount: number;
  text: string;
  usage: AnswerProviderUsage;
};

export type AnswerProvider = {
  configured: boolean;
  generate(payload: GenerationProviderPayload, options?: AnswerProviderRequestOptions): Promise<AnswerProviderResult>;
  name: AnswerProviderName;
};

export type AnswerProviderRequestOptions = {
  signal?: AbortSignal;
};

export type AnswerProviderErrorCode =
  | "invalid_configuration"
  | "malformed_response"
  | "missing_credentials"
  | "cancelled"
  | "provider_request_failed"
  | "rate_limited"
  | "timeout"
  | "upstream_error";

export class AnswerProviderError extends Error {
  readonly code: AnswerProviderErrorCode;
  readonly provider: AnswerProviderName;
  readonly status?: number;

  constructor({
    code,
    provider,
    status,
  }: {
    code: AnswerProviderErrorCode;
    provider: AnswerProviderName;
    status?: number;
  }) {
    super(getSafeProviderErrorMessage(code));
    this.name = "AnswerProviderError";
    this.code = code;
    this.provider = provider;
    this.status = status;
  }
}

type Environment = Record<string, string | undefined>;
type FetchImplementation = typeof fetch;

type AnthropicResponse = {
  content: Array<{ text?: unknown; type?: unknown }>;
  model?: unknown;
  usage?: {
    input_tokens?: unknown;
    output_tokens?: unknown;
  };
};

type AnthropicClient = {
  messages: {
    create(payload: GenerationProviderPayload, options?: { signal?: AbortSignal }): Promise<AnthropicResponse>;
  };
};

type CreateAnswerProviderOptions = {
  anthropicClientFactory?: (apiKey: string, timeoutMs: number) => AnthropicClient;
  env?: Environment;
  fetchImpl?: FetchImplementation;
  maxRetries?: number;
  sleepImpl?: (delayMs: number, signal: AbortSignal) => Promise<void>;
  timeoutMs?: number;
};

type OpenRouterResponse = {
  choices?: Array<{
    finish_reason?: unknown;
    message?: {
      content?: unknown;
    };
  }>;
  model?: unknown;
  usage?: {
    completion_tokens?: unknown;
    cost?: unknown;
    prompt_tokens?: unknown;
    total_tokens?: unknown;
  };
};

function getSafeProviderErrorMessage(code: AnswerProviderErrorCode) {
  switch (code) {
    case "missing_credentials":
      return "The selected answer provider is not configured.";
    case "cancelled":
      return "The answer provider request was cancelled.";
    case "timeout":
      return "The answer provider request timed out.";
    case "rate_limited":
      return "The answer provider rate limit was reached.";
    case "upstream_error":
      return "The answer provider is temporarily unavailable.";
    case "malformed_response":
      return "The answer provider returned an invalid response.";
    case "invalid_configuration":
      return "The answer provider configuration is invalid.";
    default:
      return "The answer provider request failed.";
  }
}

function getProviderName(env: Environment): AnswerProviderName {
  const configured = env.ANSWER_PROVIDER?.trim().toLowerCase() || "openrouter";

  if (configured === "anthropic" || configured === "openrouter") {
    return configured;
  }

  throw new AnswerProviderError({ code: "invalid_configuration", provider: "openrouter" });
}

function getFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function getTokenCount(value: unknown) {
  const number = getFiniteNumber(value);
  return number === undefined ? undefined : Math.floor(number);
}

function getStatusCode(error: unknown) {
  if (!error || typeof error !== "object" || !("status" in error)) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" && Number.isInteger(status) ? status : undefined;
}

function getErrorCodeForStatus(status: number): AnswerProviderErrorCode {
  if (status === 429) return "rate_limited";
  if (status >= 500) return "upstream_error";
  return "provider_request_failed";
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function waitForRetry(delayMs: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(new DOMException("aborted", "AbortError"));

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(new DOMException("aborted", "AbortError"));
    };

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function getRetryDelayMs(response: Response, retryIndex: number) {
  const retryAfter = response.headers.get("retry-after")?.trim();

  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(Math.round(seconds * 1_000), MAX_RETRY_DELAY_MS);
    }

    const timestamp = Date.parse(retryAfter);
    if (Number.isFinite(timestamp)) {
      return Math.min(Math.max(timestamp - Date.now(), 0), MAX_RETRY_DELAY_MS);
    }
  }

  return Math.min(250 * 2 ** retryIndex, MAX_RETRY_DELAY_MS);
}

function isRetryableStatus(status: number) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function createOpenRouterProvider({
  apiKey,
  fetchImpl,
  maxRetries,
  sleepImpl,
  timeoutMs,
}: {
  apiKey?: string;
  fetchImpl: FetchImplementation;
  maxRetries: number;
  sleepImpl: (delayMs: number, signal: AbortSignal) => Promise<void>;
  timeoutMs: number;
}): AnswerProvider {
  return {
    configured: Boolean(apiKey),
    name: "openrouter",
    async generate(payload, options = {}) {
      if (!apiKey) {
        throw new AnswerProviderError({ code: "missing_credentials", provider: "openrouter" });
      }

      if (payload.model === "z-ai/fp8") {
        throw new AnswerProviderError({ code: "invalid_configuration", provider: "openrouter" });
      }

      const controller = new AbortController();
      let timedOut = false;
      const onCallerAbort = () => controller.abort();
      if (options.signal?.aborted) controller.abort();
      else options.signal?.addEventListener("abort", onCallerAbort, { once: true });
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);

      try {
        for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
          let response: Response;

          try {
            response = await fetchImpl(`${OPENROUTER_BASE_URL}/chat/completions`, {
              body: JSON.stringify({
                max_tokens: payload.max_tokens,
                messages: [
                  { content: payload.system, role: "system" },
                  ...payload.messages,
                ],
                model: payload.model,
                temperature: payload.temperature,
              }),
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              method: "POST",
              signal: controller.signal,
            });
          } catch (error) {
            if (controller.signal.aborted || isAbortError(error)) {
              throw new AnswerProviderError({
                code: options.signal?.aborted ? "cancelled" : timedOut ? "timeout" : "provider_request_failed",
                provider: "openrouter",
              });
            }
            throw new AnswerProviderError({ code: "provider_request_failed", provider: "openrouter" });
          }

          if (!response.ok) {
            if (isRetryableStatus(response.status) && attempt < maxRetries) {
              try {
                await sleepImpl(getRetryDelayMs(response, attempt), controller.signal);
              } catch (error) {
                if (controller.signal.aborted || isAbortError(error)) {
                  throw new AnswerProviderError({
                    code: options.signal?.aborted ? "cancelled" : timedOut ? "timeout" : "provider_request_failed",
                    provider: "openrouter",
                  });
                }
                throw new AnswerProviderError({ code: "provider_request_failed", provider: "openrouter" });
              }
              continue;
            }

            throw new AnswerProviderError({
              code: getErrorCodeForStatus(response.status),
              provider: "openrouter",
              status: response.status,
            });
          }

          let body: OpenRouterResponse;
          try {
            body = (await response.json()) as OpenRouterResponse;
          } catch {
            throw new AnswerProviderError({ code: "malformed_response", provider: "openrouter" });
          }

          const choice = body.choices?.[0];
          const text = choice?.message?.content;
          if (
            typeof text !== "string" ||
            text.trim().length === 0 ||
            text.length > MAX_RESPONSE_CHARACTERS ||
            choice?.finish_reason === "length"
          ) {
            throw new AnswerProviderError({ code: "malformed_response", provider: "openrouter" });
          }

          return {
            model: typeof body.model === "string" && body.model.trim().length > 0 ? body.model : payload.model,
            requestCount: attempt + 1,
            text: text.trim(),
            usage: {
              costUsd: getFiniteNumber(body.usage?.cost),
              inputTokens: getTokenCount(body.usage?.prompt_tokens),
              outputTokens: getTokenCount(body.usage?.completion_tokens),
              totalTokens: getTokenCount(body.usage?.total_tokens),
            },
          };
        }

        throw new AnswerProviderError({ code: "provider_request_failed", provider: "openrouter" });
      } finally {
        clearTimeout(timeout);
        options.signal?.removeEventListener("abort", onCallerAbort);
      }
    },
  };
}

function createAnthropicProvider({
  apiKey,
  clientFactory,
  timeoutMs,
}: {
  apiKey?: string;
  clientFactory: (apiKey: string, timeoutMs: number) => AnthropicClient;
  timeoutMs: number;
}): AnswerProvider {
  return {
    configured: Boolean(apiKey),
    name: "anthropic",
    async generate(payload, options = {}) {
      if (!apiKey) {
        throw new AnswerProviderError({ code: "missing_credentials", provider: "anthropic" });
      }

      let response: AnthropicResponse;
      try {
        response = await clientFactory(apiKey, timeoutMs).messages.create(payload, { signal: options.signal });
      } catch (error) {
        const status = getStatusCode(error);
        throw new AnswerProviderError({
          code: isAbortError(error)
            ? options.signal?.aborted
              ? "cancelled"
              : "timeout"
            : status === undefined
              ? "provider_request_failed"
              : getErrorCodeForStatus(status),
          provider: "anthropic",
          status,
        });
      }

      const text = response.content
        .filter((block) => block.type === "text" && typeof block.text === "string")
        .map((block) => block.text as string)
        .join("\n")
        .trim();

      const inputTokens = getTokenCount(response.usage?.input_tokens);
      const outputTokens = getTokenCount(response.usage?.output_tokens);
      return {
        model: typeof response.model === "string" && response.model.trim().length > 0 ? response.model : payload.model,
        requestCount: 1,
        text,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens !== undefined && outputTokens !== undefined ? inputTokens + outputTokens : undefined,
        },
      };
    },
  };
}

export function createAnswerProvider(options: CreateAnswerProviderOptions = {}): AnswerProvider {
  const env = options.env ?? process.env;
  const provider = getProviderName(env);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = Math.min(Math.max(options.maxRetries ?? DEFAULT_MAX_RETRIES, 0), DEFAULT_MAX_RETRIES);

  if (provider === "anthropic") {
    return createAnthropicProvider({
      apiKey: env.ANTHROPIC_API_KEY?.trim(),
      clientFactory:
        options.anthropicClientFactory ??
        ((apiKey, requestTimeoutMs) =>
          new Anthropic({ apiKey, maxRetries: 0, timeout: requestTimeoutMs }) as unknown as AnthropicClient),
      timeoutMs,
    });
  }

  return createOpenRouterProvider({
    apiKey: env.OPENROUTER_API_KEY?.trim(),
    fetchImpl: options.fetchImpl ?? fetch,
    maxRetries,
    sleepImpl: options.sleepImpl ?? waitForRetry,
    timeoutMs,
  });
}

export function getConfiguredAnswerProviderName(env: Environment = process.env) {
  return getProviderName(env);
}

export function getConfiguredOpenRouterModel(env: Environment = process.env) {
  const model = env.OPENROUTER_MODEL?.trim() || OPENROUTER_DEFAULT_MODEL;

  if (model === "z-ai/fp8") {
    throw new AnswerProviderError({ code: "invalid_configuration", provider: "openrouter" });
  }

  return model;
}
