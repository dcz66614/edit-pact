/**
 * P012 T011 — Worker 浏览器验证（真实 Chromium， against `npm run serve` 的 dist）。
 *
 * 补两处遗留：
 * - T004 遗留：真实浏览器 Worker 端到端往返未实测（此前只在 Node + 假 Worker
 *   中验证）。本文件用 page.on('worker') 证明生产包确实创建了
 *   dist 的 diff.worker chunk，并在其中完成一次真实比较；
 * - T009 遗留：真实浏览器 Worker 超时路径（1,500 ms）未演练。生产 Worker
 *   的算法预算为 800 ms，合法输入无法让真实 Worker 超过 1,500 ms——
 *   因此超时路径用生产 DiffWorkerClient + 真实浏览器 Worker（Blob URL，
 *   唯一被桩的是响应时机）演练，并如实记录方法；另测陈旧结果丢弃与取消。
 *
 * 1,500 ms 终止与 1,800 ms UI 恢复上限分开记时（项目书 §12.1）。
 */
import { expect, test } from '@playwright/test';
import { buildSync } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SAMPLE_EXPECTED,
  acceptAllPending,
  runSampleToReview,
  writeEvidence,
} from './helpers';

const HARNESS_ENTRY = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'worker-harness-entry.ts',
);

interface HarnessResult {
  elapsedMs: number;
  resolutions: Array<{ errorCode: string; revision: number; jobId: string }>;
}

async function loadHarness(page: import('@playwright/test').Page): Promise<void> {
  const built = buildSync({
    entryPoints: [HARNESS_ENTRY],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
  });
  const code = built.outputFiles[0].text;
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const el = document.createElement('div');
    el.id = 't011-status';
    el.textContent = 'init';
    document.body.appendChild(el);
  });
  await page.addScriptTag({ content: code, type: 'module' });
  await page.waitForFunction(() => typeof window.__t011 !== 'undefined');
}

test.describe('真实 Worker 端到端往返', () => {
  test('生产包创建真实 diff.worker，比较在其中完成，结果正确', async ({ page }) => {
    const workerUrls: string[] = [];
    page.on('worker', (worker) => workerUrls.push(worker.url()));
    const started = Date.now();
    await runSampleToReview(page);
    const reviewMs = Date.now() - started;
    // 生产包必须创建 dist 的 diff.worker chunk（不是主线程内联比较）。
    expect(
      workerUrls.filter((u) => u.includes('diff.worker-')),
      `应创建真实 diff.worker，实际：${JSON.stringify(workerUrls)}`,
    ).toHaveLength(1);
    await acceptAllPending(page);
    await expect(page.getByLabel('成稿全文')).toHaveText(SAMPLE_EXPECTED);
    writeEvidence(
      'worker-roundtrip.json',
      JSON.stringify({ workerUrls, reviewMs }, null, 2),
    );
  });
});

test.describe('1,500 ms 超时路径（生产客户端 + 真实浏览器 Worker）', () => {
  test('永不回包：约 1,500 ms 后 TOO_COMPLEX，UI 恢复不晚于 1,800 ms', async ({
    page,
  }) => {
    await loadHarness(page);
    const t0 = Date.now();
    const result = (await page.evaluate(() => window.__t011.runNever())) as HarnessResult;
    const wallMs = Date.now() - t0;
    expect(result.resolutions).toHaveLength(1);
    expect(result.resolutions[0].errorCode).toBe('TOO_COMPLEX');
    expect(result.resolutions[0].jobId).toBe('job-never');
    // 客户端计时（页面内 performance.now）与墙钟双重记录，互相印证。
    expect(result.elapsedMs).toBeGreaterThanOrEqual(1400);
    expect(result.elapsedMs).toBeLessThanOrEqual(1800);
    expect(wallMs).toBeLessThanOrEqual(1800);
    await expect(page.locator('#t011-status')).toHaveText('ready');
    writeEvidence(
      'worker-timeout-1500ms.json',
      JSON.stringify({ harnessMs: result.elapsedMs, wallMs, result }, null, 2),
    );
  });

  test('陈旧结果丢弃：jobId/revision 不符的先到结果不 resolve，只接受匹配结果', async ({
    page,
  }) => {
    await loadHarness(page);
    const result = (await page.evaluate(
      () => window.__t011.runStaleThenOk(),
    )) as HarnessResult;
    expect(result.resolutions).toHaveLength(1);
    expect(result.resolutions[0]).toEqual({
      errorCode: 'INVALID_INPUT',
      revision: 7,
      jobId: 'job-stale',
    });
    // 匹配结果在约 300 ms 到达；若陈旧结果被误接受，elapsed 会是约 100 ms。
    expect(result.elapsedMs).toBeGreaterThanOrEqual(250);
    expect(result.elapsedMs).toBeLessThan(1500);
  });

  test('取消：200 ms 后 cancel，快速以 CANCELLED 返回', async ({ page }) => {
    await loadHarness(page);
    const result = (await page.evaluate(() => window.__t011.runCancel())) as HarnessResult;
    expect(result.resolutions).toHaveLength(1);
    expect(result.resolutions[0]).toEqual({
      errorCode: 'CANCELLED',
      revision: 3,
      jobId: 'job-cancel',
    });
    expect(result.elapsedMs).toBeGreaterThanOrEqual(150);
    expect(result.elapsedMs).toBeLessThan(1000);
  });
});
