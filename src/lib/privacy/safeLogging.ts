type ErrorLike = {
  code?: unknown;
  name?: unknown;
  status?: unknown;
};

export function getSafeErrorMetadata(error: unknown) {
  if (!error || typeof error !== "object") {
    return { name: "UnknownError" };
  }
  const value = error as ErrorLike;
  return {
    code: typeof value.code === "string" ? value.code.slice(0, 40) : undefined,
    name: typeof value.name === "string" ? value.name.slice(0, 80) : "Error",
    status: typeof value.status === "number" && Number.isInteger(value.status) ? value.status : undefined,
  };
}

export function logSafeStageError(
  namespace: string,
  stage: string,
  error: unknown,
  operationalDetails: Record<string, string | number | boolean | null | undefined> = {}
) {
  console.error(`[${namespace}]`, stage, {
    ...operationalDetails,
    error: getSafeErrorMetadata(error),
  });
}
