/**
 * P012 T011 — 性能基准入口（`npm run benchmark`）。
 *
 * 跑 tests/performance/benchmark.spec.ts（真实 Chromium + 生产包，
 * EP-P01：5 次预热 + 30 次正式测量），读回 results.json，打印
 * P50 / P95 / max；P95 超过 500 ms 时以非零退出码失败。
 * 详细记录见 tests/performance/results.json 与证据目录副本。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESULTS = path.join(ROOT, 'tests', 'performance', 'results.json');

const run = spawnSync(
  'npx',
  ['playwright', 'test', '--config', 'tests/performance/playwright.config.ts', '--reporter=list'],
  { cwd: ROOT, stdio: 'inherit' },
);
if (run.status !== 0) {
  console.error(`[benchmark] FAIL: playwright exited with ${run.status}`);
  process.exit(run.status ?? 1);
}
if (!fs.existsSync(RESULTS)) {
  console.error('[benchmark] FAIL: results.json not produced');
  process.exit(1);
}
const results = JSON.parse(fs.readFileSync(RESULTS, 'utf8'));
console.log(
  `[benchmark] ${results.pass ? 'PASS' : 'FAIL'}: EP-P01 n=${results.formalRuns} ` +
    `P50=${results.p50Ms.toFixed(1)} ms P95=${results.p95Ms.toFixed(1)} ms ` +
    `max=${results.maxMs.toFixed(1)} ms budget=${results.budgetMs} ms ` +
    `browser=${results.browser}`,
);
if (!results.pass) process.exit(1);
