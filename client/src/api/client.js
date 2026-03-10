export class APIError extends Error {
  constructor(message, status, code, body) {
    super(message);
    this.name = "APIError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export async function apiFetch(
  path,
  { method = "GET", body, headers, signal } = {}
) {
  const initHeaders = new Headers(headers || {});
  const init = {
    method,
    credentials: "same-origin",
    headers: initHeaders,
  };
  if (signal) {
    init.signal = signal;
  }
  if (body !== undefined) {
    if (body instanceof FormData) {
      init.body = body;
    } else if (typeof body === "object" && body !== null) {
      if (!initHeaders.has("Content-Type")) {
        initHeaders.set("Content-Type", "application/json");
      }
      init.body = JSON.stringify(body);
    } else {
      init.body = body;
    }
  }

  const response = await fetch(path, init);
  const text = await response.text();
  let parsed;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!response.ok) {
    const payload =
      parsed && typeof parsed === "object" && "error" in parsed
        ? parsed.error
        : parsed;
    const message =
      payload && typeof payload === "object" && payload.message
        ? payload.message
        : response.statusText || "Request failed";
    const code =
      payload && typeof payload === "object" && payload.code
        ? payload.code
        : `HTTP_${response.status}`;
    throw new APIError(message, response.status, code, parsed);
  }
  if (parsed === undefined) {
    return null;
  }
  return parsed;
}
