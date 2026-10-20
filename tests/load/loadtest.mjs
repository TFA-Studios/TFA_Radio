// Dependency-free load test (Node 22+). Simulates clients filling in a brief.
//
//   node tests/load/loadtest.mjs [baseUrl] [stages] [secondsPerStage] [thinkMs] [serverPid] [ramp 0..1]
//   node tests/load/loadtest.mjs http://localhost:3100 10,50,100 20 800 12345
//
// Each virtual user: opens the start of a brief (create), loads the form page,
// then repeats "think, autosave (PATCH), read (GET)" for the stage duration,
// plus an occasional health check. Every user gets its own X-Forwarded-For so
// the per-address rate limiter behaves as it would for separate real clients.
//
// RUN AGAINST A LOCAL OR STAGING BUILD, never production. Numbers from a laptop
// or sandbox against the in-memory backend say nothing about Postgres latency,
// Vercel cold starts or the AI provider; see the report for what is unverified.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const base = process.argv[2] || 'http://localhost:3100';
const stages = (process.argv[3] || '10,50,100').split(',').map(Number);
const seconds = Number(process.argv[4] || 20);
const think = Number(process.argv[5] || 800);
const pid = process.argv[6];
// Arrivals are spread over this share of the stage (0.25 = new users trickle in
// over the first quarter) instead of all landing in the same second.
const ramp = Number(process.argv[7] || 0.25);

const pct = (arr, p) => (arr.length ? arr.slice().sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))] : 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// RSS from ps; CPU as the delta of utime+stime in /proc between samples (Linux),
// i.e. real current usage of one core (100 = one core fully busy), not the
// lifetime average that `ps %cpu` reports.
let lastCpu = null;
function sample() {
  if (!pid) return null;
  try {
    const rss = Number(execSync(`ps -o rss= -p ${pid}`).toString().trim()) / 1024;
    const f = readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ');
    const ticks = Number(f[11]) + Number(f[12]);
    const now = Date.now();
    let cpu = 0;
    if (lastCpu) cpu = ((ticks - lastCpu.ticks) / 100) / ((now - lastCpu.t) / 1000) * 100;
    lastCpu = { ticks, t: now };
    return { rssMb: rss, cpu };
  } catch (e) { return null; }
}

async function stage(users) {
  const lat = { all: [], create: [], page: [], patch: [], get: [] };
  let errors = 0, total = 0, throttled = 0;
  const end = Date.now() + seconds * 1000;
  const samples = [];
  const sampler = setInterval(() => { const s = sample(); if (s) samples.push(s); }, 1000);

  async function req(kind, path, opts = {}, ip) {
    const t = performance.now();
    try {
      const res = await fetch(base + path, { ...opts, headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...(opts.headers || {}) } });
      res._text = Buffer.from(await res.arrayBuffer()).toString();
      const ms = performance.now() - t;
      total++;
      lat.all.push(ms); lat[kind].push(ms);
      if (res.status === 429) throttled++;
      else if (res.status >= 400) errors++;
      return res;
    } catch (e) { total++; errors++; return null; }
  }

  async function user(n) {
    const ip = `10.${(n >> 8) & 255}.${n & 255}.${1 + (n % 200)}`;
    await sleep(Math.random() * seconds * 1000 * ramp); // ramp: spread the arrivals
    const created = await req('create', '/api/briefs', { method: 'POST', body: JSON.stringify({ code: '' }) }, ip);
    if (!created || !created.ok) return;
    let id; try { id = JSON.parse(created._text).id; } catch (e) {}
    if (!id) return;
    await req('page', `/brief/${id}/contact`, {}, ip);
    let i = 0;
    while (Date.now() < end) {
      await sleep(think * (0.5 + Math.random()));
      await req('patch', `/api/briefs/${id}`, { method: 'PATCH', body: JSON.stringify({ companyName: 'Load ' + n, product: 'Tekst '.repeat(20) + i++ }) }, ip);
      await req('get', `/api/briefs/${id}`, {}, ip);
      if (i % 5 === 0) await req('get', '/api/health', {}, ip);
    }
  }

  await Promise.all(Array.from({ length: users }, (_, n) => user(n)));
  clearInterval(sampler);
  const peakRss = samples.reduce((m, s) => Math.max(m, s.rssMb), 0);
  const avgCpu = samples.length ? samples.reduce((a, s) => a + s.cpu, 0) / samples.length : 0;
  return {
    users, requests: total, rps: +(total / seconds).toFixed(1), errors, throttled429: throttled,
    errorRate: +((errors / Math.max(1, total)) * 100).toFixed(2) + '%',
    p50: +pct(lat.all, 50).toFixed(0), p95: +pct(lat.all, 95).toFixed(0), p99: +pct(lat.all, 99).toFixed(0),
    patchP95: +pct(lat.patch, 95).toFixed(0), pageP95: +pct(lat.page, 95).toFixed(0),
    peakRssMb: pid ? +peakRss.toFixed(0) : 'n/a', avgCpuPct: pid ? +avgCpu.toFixed(0) : 'n/a',
  };
}

console.log(`target=${base} seconds/stage=${seconds} think=${think}ms`);
for (const u of stages) {
  const r = await stage(u);
  console.log(JSON.stringify(r));
  await sleep(2000);
}
