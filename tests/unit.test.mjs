// Run with: npm test   (Node 22+, no extra dependencies)
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeEditIntoVariation } from '../lib/scriptMerge.js';
import { rateLimit, _resetForTests } from '../lib/rateLimit.js';
import { toPublicBrief } from '../lib/publicBrief.js';
import { fetchWithTimeout, fetchWithRetry } from '../lib/http.js';
import { parseImpressions, parseGenderSplit, variationInfoLabel, safeWebsiteUrl, briefStageOf } from '../components/flowData.js';
import { matchVoices } from '../lib/voiceMatch.js';

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
test('voice match: "no preference" on gender never blocks the age filter', () => {
  const pool = [
    { id: 'a', gender: 'man', ageRange: '18-34', tags: [] },
    { id: 'b', gender: 'vrouw', ageRange: '55+', tags: [] },
    { id: 'c', gender: 'vrouw', ageRange: '18-34', tags: [] },
  ];
  const r = matchVoices(pool, { gender: null, age: '18-34', tags: [] });
  assert.deepEqual(r.voices.map((v) => v.id), ['a', 'c']);
  assert.deepEqual(r.relaxed, []);
});
test('voice match: relaxes and reports only criteria the client actually set', () => {
  const pool = [{ id: 'a', gender: 'man', ageRange: '55+', tags: ['warm'] }];
  const r = matchVoices(pool, { gender: 'man', age: '18-34', tags: [] });
  assert.equal(r.voices.length, 1);
  assert.deepEqual(r.relaxed, ['leeftijd']);
});
test('variation label shows only what the client wrote', () => {
  assert.equal(variationInfoLabel({ kind: 'periode', detail: 'Black Friday', airing: 'nov' }), 'Black Friday · uitzending: nov');
  assert.ok(!/bijv/i.test(variationInfoLabel({ kind: 'periode', detail: '' })));
});
test('website links: only safe http(s) hosts', () => {
  assert.equal(safeWebsiteUrl('bakkerij.nl'), 'https://bakkerij.nl/');
  assert.equal(safeWebsiteUrl('javascript:alert(1)'), '');
  assert.equal(safeWebsiteUrl('localhost'), '');
});
test('stage: released scripts mean the client is choosing', () => {
  assert.equal(briefStageOf({ submittedAt: 'x', scriptsReleasedAt: 'y' }), 'choosing');
  assert.equal(briefStageOf({ submittedAt: 'x', scriptsReleasedAt: 'y', finalizedAt: 'z' }), 'final');
});
test('voice match: always alphabetical, with or without preferences', () => {
  const pool = [
    { id: '1', name: 'Zoë', gender: 'vrouw', ageRange: '18-34', tags: [] },
    { id: '2', name: 'bram', gender: 'man', ageRange: '18-34', tags: [] },
    { id: '3', name: 'Anouk', gender: 'vrouw', ageRange: '35-54', tags: [] },
  ];
  assert.deepEqual(matchVoices(pool, { gender: null, age: null, tags: [] }).voices.map((v) => v.name), ['Anouk', 'bram', 'Zoë']);
  assert.deepEqual(matchVoices(pool, { gender: null, age: '18-34', tags: [] }).voices.map((v) => v.name), ['bram', 'Zoë']);
});
test('proposals: replace keeps position, remove keeps at least one, add stops at three', async () => {
  const { applyProposalOp } = await import('../lib/scriptProposals.js');
  const h = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(applyProposalOp(h, { type: 'replace', versionId: 'b', version: { id: 'n' } }).history.map((x) => x.id), ['a', 'n']);
  assert.equal(applyProposalOp([{ id: 'a' }], { type: 'remove', versionId: 'a' }).error, 'last_one');
  assert.deepEqual(applyProposalOp(h, { type: 'remove', versionId: 'a' }).history.map((x) => x.id), ['b']);
  assert.equal(applyProposalOp([{ id: 1 }, { id: 2 }, { id: 3 }], { type: 'add', version: { id: 4 } }).error, 'too_many');
});
test('event log: appends, caps and sanitises', async () => {
  const { addEvent, parseEvents, MAX_EVENTS } = await import('../lib/eventLog.js');
  let list = [];
  for (let i = 0; i < MAX_EVENTS + 5; i++) list = addEvent(list, { actor: 'bogus', type: 't', text: 'x' + i }, 'id' + i, '2026-10-21T10:00:00Z');
  assert.equal(list.length, MAX_EVENTS);
  assert.equal(list[list.length - 1].actor, 'systeem');
  assert.deepEqual(parseEvents('not json'), []);
});
test('indicators: script and production stages are separate and consistent', async () => {
  const { scriptIndicator, productionIndicator } = await import('../components/statusIndicators.js');
  assert.equal(scriptIndicator({}).label, 'Brief open');
  assert.equal(scriptIndicator({ submittedAt: 'x' }).label, 'Nakijken');
  assert.equal(scriptIndicator({ submittedAt: 'x', scriptsReleasedAt: 'y' }).label, 'Klant kiest');
  assert.equal(scriptIndicator({ submittedAt: 'x', scriptsReleasedAt: 'y', finalizedAt: 'z', scriptAuditStatus: 'approved' }).label, 'Akkoord');
  assert.equal(scriptIndicator({ submittedAt: 'x', scriptsReleasedAt: 'y', finalizedAt: 'z', scriptAuditStatus: 'pending' }).tone, 'attention');
  assert.equal(productionIndicator({}).label, 'Niet gestart');
  assert.equal(productionIndicator({ productionStatus: 'script_choosing' }).label, 'Niet gestart');
  assert.equal(productionIndicator({ productionStatus: 'in_revision' }).tone, 'attention');
  assert.equal(productionIndicator({ productionStatus: 'approved', deliveredAt: 'd' }).label, 'Geleverd');
});
