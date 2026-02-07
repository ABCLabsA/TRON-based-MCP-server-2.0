function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJson(url, options = {}) {
  const {
    method = "GET",
    headers = {},
    body,
    timeoutMs = 8000,
    retries = 2,
    includeMeta = false
  } = options;

  let attempt = 0;
  let lastError;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal
      });

      const status = res.status;
      const contentType = res.headers.get("content-type") || "";
      const text = await res.text();

      clearTimeout(timer);

      if (status === 429 && attempt < retries) {
        const backoff = 500 * Math.pow(2, attempt);
        await sleep(backoff);
        attempt += 1;
        continue;
      }

      if (!contentType.includes("application/json")) {
        const err = new Error("Non-JSON response");
        err.code = "NON_JSON";
        err.status = status;
        err.contentType = contentType;
        err.url = url;
        err.bodySnippet = text.slice(0, 200);
        throw err;
      }

      let data;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        const err = new Error("Invalid JSON body");
        err.code = "BAD_JSON";
        err.status = status;
        err.contentType = contentType;
        err.url = url;
        err.bodySnippet = text.slice(0, 200);
        throw err;
      }

      if (!res.ok) {
        const err = new Error("HTTP Error");
        err.code = "HTTP_ERROR";
        err.status = status;
        err.contentType = contentType;
        err.url = url;
        err.data = data;
        throw err;
      }

      if (includeMeta) {
        return { data, meta: { url, status, contentType } };
      }

      return data;
    } catch (err) {
      clearTimeout(timer);

      if (err.name === "AbortError") {
        lastError = new Error("Request timeout");
        lastError.code = "TIMEOUT";
        lastError.url = url;
      } else {
        lastError = err;
      }

      if (attempt < retries) {
        const backoff = 500 * Math.pow(2, attempt);
        await sleep(backoff);
        attempt += 1;
        continue;
      }

      throw lastError;
    }
  }

  throw lastError || new Error("Request failed");
}
