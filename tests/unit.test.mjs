// Run with: npm test   (Node 22+, no extra dependencies)
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeEditIntoVariation } from '../lib/scriptMerge.js';
import { rateLimit, _resetForTests } from '../lib/rateLimit.js';
import { toPublicBrief } from '../lib/publicBrief.js';
import { fetchWithTimeout, fetchWithRetry } from '../lib/http.js';
import { parseImpressions, parseGenderSplit } from '../components/flowData.js';

test('merge: an edit to the main script reaches the variation', () => {
  const r = mergeEditIntoVariation('Koop nu bij Jansen.', 'Koop nu bij Jansen in Zwolle.', 'Koop nu bij Jansen. Black Friday!');
  assert.equal(r.conflicts, 0);
  assert.match(r.text, /Zwolle/);
  assert.match(r.text, /Black Friday/);
});
test('merge: wholesale rewrite resets the variation to the new main', () => {
  const r = mergeEditIntoVariation('een twee drie vier vijf zes', 'totaal andere tekst hier nu', 'een twee drie vier vijf zes extra');
  assert.equal(r.reset, true);
});
test('rateLimit: blocks after the limit and recovers after the window', async () => {
  _resetForTests();
  for (let i = 0; i < 3; i++) assert.equal(rateLimit('k', 3, 50).ok, true);
  assert.equal(rateLimit('k', 3, 50).ok, false);
  assert.equal(rateLimit('other', 3, 50).ok, true);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(rateLimit('k', 3, 50).ok, true);
});
test('publicBrief: internal notes never leave the server', () => {
  const out = toPublicBrief({ id: 'x', internalNotes: '[{"text":"geheim"}]', companyName: 'A' });
  assert.equal(out.internalNotes, '[]');
  assert.equal(out.companyName, 'A');
});
test('http: timeout aborts a hung request', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = (url, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'AbortError' }))));
  await assert.rejects(fetchWithTimeout('https://example.test/', {}, 30), /timed out/);
  globalThis.fetch = orig;
});
test('http: retries only on 429/5xx answers, bounded', async () => {
  const orig = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('', { status: 503, headers: { 'retry-after': '0' } }); };
  const res = await fetchWithRetry('https://example.test/', {}, { timeoutMs: 100, retries: 2 });
  assert.equal(res.status, 503);
  assert.equal(calls, 3);
  calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('', { status: 400 }); };
  await fetchWithRetry('https://example.test/', {}, { timeoutMs: 100, retries: 2 });
  assert.equal(calls, 1);
  globalThis.fetch = orig;
});
test('impressions: free-text input is understood', () => {
  for (const [txt, n] of [['500k', 500000], ['1,5 miljoen', 1500000], ['250.000', 250000]]) {
    const p = parseImpressions(txt);
    assert.equal(p.ok, true); assert.equal(p.value, n);
  }
});
test('gender split: "man / vrouw - 30 / 70" is 30% men', () => {
  const g = parseGenderSplit('man / vrouw - 30 / 70');
  assert.equal(g.men, 30); assert.equal(g.women, 70);
});
