/**
 * P012 T011 — EP-P01 性能基准（真实 Chromium， against 生产包）。
 *
 * 项目书 §12.1：固定 EP-P01 负载（20 行各 99 个 CJK 字符，共 2,000 UTF-16
 * 单元；每行 5 处替换，共 100 处；保护第 4、8、12、16、20 行），5 次预热
 * 后 30 次正式测量，P95 不超过 500 ms。计时从用户点击比较的处理函数起，
 * 到结果经轮次验证写入状态、可审阅控件出现后的下一次 requestAnimationFrame
 * 止，包含分段、哈希、Worker 往返和首次 UI 更新。P95 取升序第 ceil(0.95*n)
 * 个值，n=30 时第 29 个；保存所有正式测量，不删慢样本。
 *
 * 计时方法：点击前在页面内取 performance.now()，审阅面板出现后在页面内
 * 等一个 requestAnimationFrame 再取 performance.now()；差值为单次测量。
 * 每次测量重新加载页面（冷状态），避免上一次的决定/缓存干扰。
 */
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evidenceDir } from '../e2e/helpers';

const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'perf',
  'EP-P01',
);
const WARMUP = 5;
const FORMAL = 30;
const P95_BUDGET_MS = 500;

interface BenchmarkResults {
  sample: string;
  originalSha256: string;
  candidateSha256: string;
  browser: string;
  viewport: { width: number; height: number };
  warmupRuns: number;
  formalRuns: number;
  durationsMs: number[];
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  budgetMs: number;
  pass: boolean;
}

function percentile(sortedAsc: number[], p: number): number {
  const index = Math.ceil(p * sortedAsc.length) - 1;
  return sortedAsc[Math.max(0, index)];
}

async function measureOnce(
  page: import('@playwright/test').Page,
  original: string,
  candidate: string,
): Promise<number> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder(/粘贴原稿/).fill(original);
  for (const line of [4, 8, 12, 16, 20]) {
    await page.getByLabel(`保护第 ${line} 段`).check();
  }
  await page.getByPlaceholder(/粘贴改稿/).fill(candidate);
  const t0 = await page.evaluate(() => performance.now());
  await page.getByRole('button', { name: '开始比较', exact: true }).click();
  await page.getByLabel('核对改动').waitFor({ timeout: 10000 });
  const t1 = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        requestAnimationFrame(() => resolve(performance.now()));
      }),
  );
  return t1 - t0;
}

test('EP-P01：5 次预热 + 30 次正式测量，P95 ≤ 500 ms', async ({ page, browser }) => {
  test.setTimeout(240000);
  const original = fs.readFileSync(path.join(FIXTURE_DIR, 'original.txt'), 'utf8');
  const candidate = fs.readFileSync(path.join(FIXTURE_DIR, 'candidate.txt'), 'utf8');
  const meta = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'meta.json'), 'utf8')) as {
    originalSha256: string;
    candidateSha256: string;
  };
  // 样本哈希必须与 T002 冻结值一致，否则测量无效。
  const { createHash } = await import('node:crypto');
  expect(createHash('sha256').update(original, 'utf8').digest('hex')).toBe(
    meta.originalSha256,
  );
  expect(createHash('sha256').update(candidate, 'utf8').digest('hex')).toBe(
    meta.candidateSha256,
  );

  for (let i = 0; i < WARMUP; i++) {
    const ms = await measureOnce(page, original, candidate);
    console.log(`warmup ${i + 1}/${WARMUP}: ${ms.toFixed(1)} ms`);
  }
  const durationsMs: number[] = [];
  for (let i = 0; i < FORMAL; i++) {
    const ms = await measureOnce(page, original, candidate);
    durationsMs.push(ms);
    console.log(`formal ${i + 1}/${FORMAL}: ${ms.toFixed(1)} ms`);
  }
  const sorted = [...durationsMs].sort((a, b) => a - b);
  const p50Ms = percentile(sorted, 0.5);
  const p95Ms = percentile(sorted, 0.95);
  const maxMs = sorted[sorted.length - 1];
  const results: BenchmarkResults = {
    sample: 'EP-P01',
    originalSha256: meta.originalSha256,
    candidateSha256: meta.candidateSha256,
    browser: browser.version(),
    viewport: { width: 1280, height: 800 },
    warmupRuns: WARMUP,
    formalRuns: FORMAL,
    durationsMs,
    p50Ms,
    p95Ms,
    maxMs,
    budgetMs: P95_BUDGET_MS,
    pass: p95Ms <= P95_BUDGET_MS,
  };
  fs.writeFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'results.json'),
    JSON.stringify(results, null, 2),
  );
  fs.writeFileSync(
    path.join(evidenceDir(), 'benchmark-results.json'),
    JSON.stringify(results, null, 2),
  );
  console.log(`P50=${p50Ms.toFixed(1)} ms P95=${p95Ms.toFixed(1)} ms max=${maxMs.toFixed(1)} ms`);
  expect(p95Ms, `EP-P01 P95 必须 ≤ ${P95_BUDGET_MS} ms，实际 ${p95Ms.toFixed(1)} ms`).toBeLessThanOrEqual(
    P95_BUDGET_MS,
  );
});
