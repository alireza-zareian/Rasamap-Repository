// Tiny dependency-free load benchmark.
//
//   npm run bench                         # hits http://localhost:3000/api/billboards?limit=24
//   npm run bench -- http://localhost:3100 /api/billboards/pins
//   BENCH_CONCURRENCY=50 BENCH_DURATION_MS=15000 npm run bench
//
// Reports throughput and latency percentiles. Not a substitute for a real
// load test — it just shows where the first bottleneck is.

const BASE = process.argv[2] || process.env.TEST_BASE_URL || "http://localhost:3000";
const PATH = process.argv[3] || "/api/billboards?limit=24";
const DURATION_MS = Number(process.env.BENCH_DURATION_MS || 10000);
const CONCURRENCY = Number(process.env.BENCH_CONCURRENCY || 20);

const url = BASE + PATH;
const UA = "Mozilla/5.0 (rasamap-bench)";
// Per-IP rate limiting (60 req/min) would otherwise dominate the numbers, so
// rotate the forwarded IP to simulate many distinct clients. Set BENCH_SINGLE_IP=1
// to instead measure what a single hammering client experiences.
const SINGLE_IP = process.env.BENCH_SINGLE_IP === "1";

const latencies = [];
let ok = 0;
let errors = 0;
let stop = false;
let n = 0;
const statusCounts = {};

function nextIp() {
  if (SINGLE_IP) return "198.51.100.1";
  n += 1;
  return `198.51.${(n >> 8) & 255}.${(n & 255) || 1}`;
}

async function worker() {
  while (!stop) {
    const t0 = performance.now();
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, "x-forwarded-for": nextIp() } });
      await res.arrayBuffer();
      statusCounts[res.status] = (statusCounts[res.status] || 0) + 1;
      if (res.ok) ok += 1;
      else errors += 1;
    } catch {
      errors += 1;
      statusCounts.fetch_error = (statusCounts.fetch_error || 0) + 1;
    }
    latencies.push(performance.now() - t0);
  }
}

console.log(`benchmarking ${url}`);
console.log(`  concurrency=${CONCURRENCY}  duration=${DURATION_MS}ms\n`);

// warm the route (next dev compiles lazily; first hit is not representative)
await fetch(url, { headers: { "user-agent": UA } }).catch(() => {});

const start = performance.now();
setTimeout(() => (stop = true), DURATION_MS);
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
const elapsedS = (performance.now() - start) / 1000;

latencies.sort((a, b) => a - b);
const pct = (p) =>
  latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))].toFixed(1) : "-";

const total = ok + errors;
console.log(`requests     ${total}   (${(total / elapsedS).toFixed(0)} req/s)`);
console.log(`success      ${ok}`);
console.log(`errors       ${errors}`);
console.log(`status       ${JSON.stringify(statusCounts)}`);
console.log(`latency ms   p50 ${pct(50)}   p90 ${pct(90)}   p95 ${pct(95)}   p99 ${pct(99)}   max ${pct(100)}`);
