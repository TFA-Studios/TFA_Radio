// Verifies the signature Resend puts on its webhooks (it uses Svix): HMAC-SHA256
// over "<id>.<timestamp>.<body>" with the base64 part of the signing secret
// ("whsec_..."), compared against every "v1,<signature>" in the header.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const TOLERANCE_SECONDS = 5 * 60;

export function verifyWebhook({ id, timestamp, signature, body, secret, nowSeconds = Math.floor(Date.now() / 1000) }) {
  if (!id || !timestamp || !signature || !secret) return false;
  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > TOLERANCE_SECONDS) return false;
  const key = Buffer.from(String(secret).replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(id + '.' + timestamp + '.' + body).digest();
  return String(signature).split(' ').some((part) => {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) return false;
    const given = Buffer.from(sig, 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
