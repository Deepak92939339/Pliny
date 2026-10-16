// fetch() cannot report upload progress. Supabase's uploadToSignedUrl accepts a custom fetch,
// so uploads go through this XMLHttpRequest-backed one to get real byte-level progress events
// while still using the library's signed-upload protocol unchanged.

export type ProgressFetchOptions = {
  /** Abort the request if no bytes move for this long, so an upload can never hang forever. */
  inactivityMs?: number;
  onProgress: (loaded: number, total: number) => void;
  xhrFactory?: () => XMLHttpRequest;
};

export const UPLOAD_INACTIVITY_MS = 60_000;

export class UploadStalledError extends Error {
  constructor() {
    super("The upload stopped making progress. Check your connection and retry.");
    this.name = "UploadStalledError";
  }
}

function toUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function parseResponseHeaders(raw: string) {
  const headers = new Headers();

  for (const line of raw.trim().split(/[\r\n]+/)) {
    const separator = line.indexOf(":");

    if (separator > 0) {
      try {
        headers.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
      } catch {
        // Ignore headers the Headers constructor rejects.
      }
    }
  }

  return headers;
}

export function createProgressFetch({ inactivityMs = UPLOAD_INACTIVITY_MS, onProgress, xhrFactory }: ProgressFetchOptions): typeof fetch {
  return (input, init) =>
    new Promise<Response>((resolve, reject) => {
      const xhr = xhrFactory ? xhrFactory() : new XMLHttpRequest();
      let inactivityTimer: ReturnType<typeof setTimeout> | undefined;
      let settled = false;

      function finish(action: () => void) {
        if (settled) return;
        settled = true;
        if (inactivityTimer) clearTimeout(inactivityTimer);
        action();
      }

      function armInactivityTimer() {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
          finish(() => {
            xhr.abort();
            reject(new UploadStalledError());
          });
        }, inactivityMs);
      }

      xhr.open(init?.method ?? "GET", toUrl(input));
      new Headers(init?.headers).forEach((value, key) => xhr.setRequestHeader(key, value));

      xhr.upload.onprogress = (event) => {
        armInactivityTimer();
        if (event.lengthComputable) onProgress(event.loaded, event.total);
      };
      xhr.onload = () =>
        finish(() => {
          const status = xhr.status;
          const nullBody = status === 204 || status === 205 || status === 304;
          resolve(
            new Response(nullBody ? null : xhr.responseText, {
              headers: parseResponseHeaders(xhr.getAllResponseHeaders()),
              status,
              statusText: xhr.statusText,
            })
          );
        });
      xhr.onerror = () => finish(() => reject(new TypeError("Network error during upload.")));
      xhr.onabort = () => finish(() => reject(new DOMException("The upload was cancelled.", "AbortError")));
      xhr.ontimeout = () => finish(() => reject(new UploadStalledError()));

      init?.signal?.addEventListener("abort", () => xhr.abort());

      armInactivityTimer();
      xhr.send((init?.body ?? null) as XMLHttpRequestBodyInit | null);
    });
}
