// Outbound HTTP with a hard timeout (and an optional bounded retry), shared by
// every third-party call (Resend, Slack, the AI providers). Without a timeout
// a hung provider keeps a serverless function open until the platform kills
// it; with one, the caller's existing try/catch handles it like any other
// failure.
export async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      const e = new Error('Request to ' + safeHost(url) + ' timed out after ' + timeoutMs + 'ms');
      e.code = 'ETIMEDOUT';
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Retries ONLY when the provider answered "try again later" (429/502/503/504),
// i.e. the request was demonstrably not processed, so a retry can never send a
// duplicate email or double-bill. Timeouts and network errors are not retried
// for the same reason. Bounded: at most `retries` extra attempts, exponential
// backoff (400ms, 800ms, ...), honouring Retry-After up to 2s.
export async function fetchWithRetry(url, options = {}, { timeoutMs = 15000, retries = 2 } = {}) {
  let attempt = 0;
  for (;;) {
    const res = await fetchWithTimeout(url, options, timeoutMs);
    if (![429, 502, 503, 504].includes(res.status) || attempt >= retries) return res;
    const ra = parseInt(res.headers.get('retry-after') || '', 10);
    const wait = Number.isFinite(ra) ? Math.min(ra * 1000, 2000) : 400 * 2 ** attempt;
    await new Promise((r) => setTimeout(r, wait));
    attempt++;
  }
}

function safeHost(url) {
  try { return new URL(url).host; } catch (e) { return 'upstream'; }
}
