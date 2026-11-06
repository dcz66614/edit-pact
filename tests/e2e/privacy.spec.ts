/**
 * P012 T011 — 隐私 E2E（真实 Chromium， against `npm run serve` 的 dist）。
 *
 * 依据项目书 §13 与实施计划 T011 完成定义：
 * - 核心操作零外部请求（冷启动 + 完整流程 + 导出 + 清空，全程记请求）；
 * - 在禁止外网但允许 loopback 的全新浏览器上下文中冷启动并完成 §11.1；
 *   不用 setOffline 后靠旧页面缓存操作作为唯一离线证据；
 * - 清空后应用状态与持久化区无正文。
 *
 * 网络日志与存储检查结果写入证据目录（见 helpers.writeEvidence）。
 */
import { expect, test } from '@playwright/test';
import {
  SAMPLE_EXPECTED,
  acceptAllPending,
  assertLoopbackOnly,
  assertStorageEmpty,
  collectRequests,
  readStorage,
  runSampleToReview,
  writeEvidence,
} from './helpers';

const LOOPBACK = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//;

test.describe('网络：零外部请求', () => {
  test('冷启动 + §11.1 全流程 + 导出 + 清空，全程无外部请求', async ({ page }) => {
    const urls = collectRequests(page);
    await runSampleToReview(page);
    await acceptAllPending(page);
    await expect(page.getByLabel('成稿全文')).toHaveText(SAMPLE_EXPECTED);

    const download = page.waitForEvent('download', { timeout: 10000 });
    await page.getByRole('button', { name: '下载 TXT' }).click();
    await download;

    await page.getByRole('button', { name: '清空本次内容' }).click();
    await expect(page.getByPlaceholder(/粘贴原稿/)).toHaveValue('');

    writeEvidence('network-requests.json', JSON.stringify(urls, null, 2));
    assertLoopbackOnly(urls);
    // 至少包含页面、JS、CSS 与 Worker 四类本机请求，证明记录不是空的。
    const joined = urls.join('\n');
    expect(joined).toContain('127.0.0.1:4173/');
    expect(joined).toContain('.js');
    expect(joined).toContain('diff.worker-');
    expect(urls.length).toBeGreaterThanOrEqual(4);
  });
});

test.describe('离线冷启动', () => {
  test('全新上下文：拦截全部非 loopback 请求，仍能冷启动并完成 §11.1', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    // 在请求发出前拦截：非 loopback 一律中止；loopback 放行。
    // 这是全新上下文（无缓存、无 Service Worker），不是 setOffline 后
    // 靠旧页面缓存操作。
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (LOOPBACK.test(url) || url.startsWith('data:')) {
        await route.continue();
      } else {
        await route.abort();
      }
    });
    const page = await context.newPage();
    const blocked: string[] = [];
    page.on('requestfailed', (request) => blocked.push(request.url()));
    const urls = collectRequests(page);

    await runSampleToReview(page);
    await acceptAllPending(page);
    await expect(page.getByLabel('成稿全文')).toHaveText(SAMPLE_EXPECTED);

    assertLoopbackOnly(urls);
    // 被拦截的应为 0：应用根本不发外部请求，不是“发了但被挡住”。
    expect(blocked, '不应有任何请求被拦截（应用不应尝试外部请求）').toEqual([]);
    await context.close();
  });
});

test.describe('存储：无持久化残留', () => {
  test('流程前后与清空后，localStorage / sessionStorage / cookie / IndexedDB 全空', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    assertStorageEmpty(await readStorage(page));

    await runSampleToReview(page);
    await acceptAllPending(page);
    await expect(page.getByLabel('成稿全文')).toHaveText(SAMPLE_EXPECTED);
    const during = await readStorage(page);
    assertStorageEmpty(during);
    writeEvidence('storage-check.json', JSON.stringify({ during }, null, 2));

    await page.getByRole('button', { name: '清空本次内容' }).click();
    await expect(page.getByPlaceholder(/粘贴原稿/)).toHaveValue('');
    const afterClear = await readStorage(page);
    assertStorageEmpty(afterClear);
    writeEvidence(
      'storage-check.json',
      JSON.stringify({ during, afterClear }, null, 2),
    );
  });
});
