// Small in-memory sliding-window rate limiter for the public (unauthenticated)
// endpoints. Per server instance, best effort: on serverless each warm
// instance keeps its own counters, which is enough to blunt a script hammering
// one endpoint, but it is NOT a global limit. If real abuse ever shows up, move
// the counters to a shared store (e.g. Upstash Redis / Vercel KV) behind this
// same function.
const buckets = new Map();
const MAX_KEYS = 5000;

export function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  let hits = buckets.get(key);
  if (!hits) {
    if (buckets.size >= MAX_KEYS) pruneOldest(now);
    hits = [];
    buckets.set(key, hits);
  }
  while (hits.length && now - hits[0] >= windowMs) hits.shift();
  if (hits.length >= limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((windowMs - (now - hits[0])) / 1000)) };
  }
  hits.push(now);
  return { ok: true, retryAfter: 0 };
}

// Keeps memory bounded: drop empty/stale buckets (and, if still full, the oldest).
function pruneOldest(now) {
  for (const [k, v] of buckets) {
    if (!v.length || now - v[v.length - 1] > 3600000) buckets.delete(k);
  }
  if (buckets.size >= MAX_KEYS) {
    const first = buckets.keys().next().value;
    buckets.delete(first);
  }
}

export function clientIp(request) {
  const xf = request.headers.get('x-forwarded-for') || '';
  return (xf.split(',')[0] || request.headers.get('x-real-ip') || 'unknown').trim();
}

export function tooManyRequests(retryAfter) {
  return new Response(JSON.stringify({ error: 'rate_limited', message: 'Even rustig aan, probeer het zo opnieuw.' }), {
    status: 429,
    headers: { 'content-type': 'application/json', 'retry-after': String(retryAfter) },
  });
}

export function _resetForTests() { buckets.clear(); }
