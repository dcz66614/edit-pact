/**
 * P012 T011 — 生产包用户路径 E2E（真实 Chromium， against `npm run serve` 的 dist）。
 *
 * 覆盖项目书 §11.1 正常混合采纳、保护冲突无接受入口、其余保留原文、
 * 导出一致性（TXT / 剪贴板 / 回执）、清空后空状态、取消比较、
 * 纯键盘流程、IME 组合输入守卫、1,280×800 与 390 px 视口。
 */
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  SAMPLE_CANDIDATE,
  SAMPLE_EXPECTED,
  SAMPLE_ORIGINAL,
  acceptAllPending,
  assertStorageEmpty,
  dialogMessages,
  evidenceDir,
  readStorage,
  runSampleToReview,
} from './helpers';

test.describe('§11.1 正常混合采纳', () => {
  test('保护第 2 段，接受其余改动，成稿与期望一致', async ({ page }) => {
    await runSampleToReview(page);

    // 5 个 Hunk（由锁定算法决定，不硬编码为 3）：4 待审 + 1 保护冲突。
    await expect(page.locator('.review-counts')).toContainText('待审 4 项');
    await expect(page.locator('.review-counts')).toContainText('保护冲突 1 项');
    await expect(page.locator('.hunk-card')).toHaveCount(5);

    // 保护冲突卡无接受入口，只有“返回调整保护”。
    const blocked = page.locator('.hunk-card', { hasText: '保护冲突，已保留原文' });
    await expect(blocked).toHaveCount(1);
    await expect(blocked.getByRole('button', { name: '采用这处修改' })).toHaveCount(0);
    await expect(
      blocked.getByRole('button', { name: '返回调整保护' }),
    ).toHaveCount(1);

    await page.screenshot({ path: path.join(evidenceDir(), 'review-1280x800.png') });

    await acceptAllPending(page);
    await expect(page.locator('.review-counts')).toContainText('待审 0 项');
    await expect(page.getByLabel('成稿全文')).toHaveText(SAMPLE_EXPECTED);
    await page.screenshot({ path: path.join(evidenceDir(), 'result-1280x800.png') });
  });

  test('其余保留原文：已采用项不受影响', async ({ page }) => {
    await runSampleToReview(page);
    // 先采用第一处，其余保留原文。
    await page.locator('button.hunk-accept-button:not([disabled])').first().click();
    await page.waitForTimeout(150);
    await expect(page.locator('.review-counts')).toContainText('已采用 1 项');
    await page.getByRole('button', { name: '其余保留原文' }).click();
    await expect(page.locator('.review-counts')).toContainText('待审 0 项');
    await expect(page.locator('.review-counts')).toContainText('已采用 1 项');
    // 仅第一处（第 1 段“于”→“在…前回复”两处改动中的首处）被采用，
    // 其余保留原文，保护段仍为 30 人。
    const result = await page.getByLabel('成稿全文').innerText();
    expect(result).toContain('人数上限为30人。');
    expect(result).not.toContain('50人');
  });

  test('导出一致：TXT 下载、剪贴板、回执均与预览相同，且回执无正文', async ({
    page,
    browser,
  }) => {
    // 剪贴板读写需要显式授权，用独立上下文。
    await page.context().close();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    const clipPage = await context.newPage();
    await runSampleToReview(clipPage);
    await acceptAllPending(clipPage);
    const preview = await clipPage.getByLabel('成稿全文').innerText();
    expect(preview).toBe(SAMPLE_EXPECTED);

    const download = clipPage.waitForEvent('download', { timeout: 10000 });
    await clipPage.getByRole('button', { name: '下载 TXT' }).click();
    const txt = await download;
    const txtPath = path.join(evidenceDir(), 'export-download.txt');
    await txt.saveAs(txtPath);
    expect(fs.readFileSync(txtPath, 'utf8')).toBe(SAMPLE_EXPECTED);

    await clipPage.getByRole('button', { name: '复制成稿' }).click();
    await clipPage.waitForTimeout(300);
    const clipboard = await clipPage.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe(SAMPLE_EXPECTED);

    const receiptDownload = clipPage.waitForEvent('download', { timeout: 10000 });
    await clipPage.getByRole('button', { name: /下载审阅回执/ }).click();
    const receiptFile = await receiptDownload;
    const receiptPath = path.join(evidenceDir(), 'export-receipt.json');
    await receiptFile.saveAs(receiptPath);
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')) as Record<
      string,
      unknown
    >;
    // 回执只记录版本、哈希与审阅结果，不含正文。
    const receiptText = JSON.stringify(receipt);
    expect(receiptText).not.toContain('周五');
    expect(receiptText).not.toContain('人数上限');
    expect(receiptText).not.toContain('谢谢配合');
    expect(typeof receipt.analysisId).toBe('string');
    expect(typeof receipt.revision).toBe('number');
    expect(typeof receipt.decisionRevision).toBe('number');
    expect(typeof receipt.originalHash).toBe('string');
    expect(typeof receipt.outputHash).toBe('string');
    await context.close();
  });

  test('清空：确认后回到空状态，存储无残留', async ({ page }) => {
    const messages = dialogMessages(page);
    await runSampleToReview(page);
    await acceptAllPending(page);
    await expect(page.getByLabel('成稿全文')).toHaveText(SAMPLE_EXPECTED);

    await page.getByRole('button', { name: '清空本次内容' }).click();
    expect(messages).toContain(
      '确定要清空本次全部内容吗？清空后回到空状态，正在进行的比较也会终止。',
    );
    await expect(page.getByPlaceholder(/粘贴原稿/)).toHaveValue('');
    await expect(page.getByPlaceholder(/粘贴改稿/)).toHaveValue('');
    await expect(page.locator('.protection-count')).toContainText('已保护 0 段');
    await expect(page.getByLabel('核对改动')).toHaveCount(0);
    await expect(page.getByLabel('成稿全文')).toHaveCount(0);
    assertStorageEmpty(await readStorage(page));
  });
});

test.describe('原稿改动先确认一次', () => {
  const NEW_ORIGINAL = '新的原稿第一段。\n人数上限为30人。\n谢谢配合。';

  async function setupCommittedOriginal(page: import('@playwright/test').Page) {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.getByPlaceholder(/粘贴原稿/).fill(SAMPLE_ORIGINAL);
    // 此时改稿为空，勾选保护可静默提交原稿（无确认框）。
    await page.getByLabel('保护第 2 段').check();
    await page.getByPlaceholder(/粘贴改稿/).fill(SAMPLE_CANDIDATE);
    await expect(page.locator('.protection-count')).toContainText('已保护 1 段');
  }

  test('接受确认：原稿更新，改稿与旧保护被清除', async ({ page }) => {
    const messages: string[] = [];
    page.on('dialog', (dialog) => {
      messages.push(dialog.message());
      void dialog.accept();
    });
    await setupCommittedOriginal(page);
    await page.getByPlaceholder(/粘贴原稿/).fill(NEW_ORIGINAL);
    await page.getByLabel('保护第 1 段').check();
    expect(messages).toContain('修改原稿将清除改稿、保护和决定，确定吗？');
    await expect(page.getByPlaceholder(/粘贴原稿/)).toHaveValue(NEW_ORIGINAL);
    await expect(page.getByPlaceholder(/粘贴改稿/)).toHaveValue('');
    await expect(page.locator('.protection-count')).toContainText('已保护 1 段');
  });

  test('拒绝确认：草稿恢复为旧原稿，改稿与保护保留', async ({ page }) => {
    page.on('dialog', (dialog) => void dialog.dismiss());
    await setupCommittedOriginal(page);
    await page.getByPlaceholder(/粘贴原稿/).fill(NEW_ORIGINAL);
    // 拒绝确认时保护不切换：用 click() 而不用 check()，check() 会因
    // 状态未变而报错，而状态未变正是拒绝确认的正确结果。
    await page.getByLabel('保护第 1 段').click();
    await expect(page.getByPlaceholder(/粘贴原稿/)).toHaveValue(SAMPLE_ORIGINAL);
    await expect(page.getByPlaceholder(/粘贴改稿/)).toHaveValue(SAMPLE_CANDIDATE);
    await expect(page.locator('.protection-count')).toContainText('已保护 1 段');
    await expect(page.getByLabel('保护第 2 段')).toBeChecked();
  });
});

test.describe('取消比较', () => {
  test('比较中取消：回到准备页，输入完整保留', async ({ page }) => {
    // 为拿到可操作的取消窗口，用路由延迟 Worker 脚本加载 2 s：
    // 比较阶段因此至少持续 2 s，取消按钮可稳定点到。被延迟的只是
    // Worker 脚本的取回时机，取消路径本身（cancelCompare → 终止
    // Worker → 回准备页）是真实的；见 evidence.md。
    await page.route('**/assets/diff.worker-*.js', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue();
    });
    await page.goto('/', { waitUntil: 'networkidle' });
    dialogMessages(page);
    // 病态输入：3,000 个 'a' 对 3,000 个 'b'。先勾选一段保护以静默提交
    // 原稿（此时改稿尚为空，不弹确认框），再填改稿；否则比较时提交原稿
    // 会按设计清除改稿（见“原稿改动先确认一次”用例）。
    const original = 'a'.repeat(3000);
    const candidate = 'b'.repeat(3000);
    await page.getByPlaceholder(/粘贴原稿/).fill(original);
    await page.getByLabel('保护第 1 段').check();
    await page.getByPlaceholder(/粘贴改稿/).fill(candidate);
    await page.getByRole('button', { name: '开始比较', exact: true }).click();
    // 比较按钮一出现就点取消（Playwright 自动等待按钮可操作）。
    await page.getByRole('button', { name: '取消比较' }).click({ timeout: 5000 });
    await expect(page.getByPlaceholder(/粘贴原稿/)).toHaveValue(original);
    await expect(page.getByPlaceholder(/粘贴改稿/)).toHaveValue(candidate);
    await expect(page.getByLabel('保护第 1 段')).toBeChecked();
    await expect(page.getByLabel('核对改动')).toHaveCount(0);
    await expect(page.getByLabel('正在比较')).toHaveCount(0);
  });
});

test.describe('纯键盘流程', () => {
  test('全程只用 Tab / Space / Enter 完成 §11.1', async ({ page }) => {
    dialogMessages(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.getByPlaceholder(/粘贴原稿/).fill(SAMPLE_ORIGINAL);
    // 先键盘勾选保护再填改稿：勾选会静默提交原稿（改稿尚为空，不弹
    // 确认框）；顺序反了会触发“修改原稿将清除改稿”确认并清空改稿。
    const checkbox = page.getByLabel('保护第 2 段');
    await checkbox.focus();
    await page.keyboard.press('Space');
    await expect(checkbox).toBeChecked();
    await expect(page.locator('.protection-count')).toContainText('已保护 1 段');
    await page.getByPlaceholder(/粘贴改稿/).fill(SAMPLE_CANDIDATE);
    // Tab 到“开始比较”并用 Enter 触发。
    const compare = page.getByRole('button', { name: '开始比较', exact: true });
    await compare.focus();
    await page.keyboard.press('Enter');
    await page.getByLabel('核对改动').waitFor({ timeout: 10000 });
    // 逐个用键盘采用待审项：Tab 到第一个可用的采用按钮，Space 触发。
    for (let i = 0; i < 10; i++) {
      const button = page.locator('button.hunk-accept-button:not([disabled])').first();
      if ((await button.count()) === 0) break;
      await button.focus();
      await page.keyboard.press('Space');
      await page.waitForTimeout(120);
    }
    await expect(page.locator('.review-counts')).toContainText('待审 0 项');
    await expect(page.getByLabel('成稿全文')).toHaveText(SAMPLE_EXPECTED);
  });
});

test.describe('IME 组合输入守卫', () => {
  test('组合输入中比较被挡，结束后恢复', async ({ page }) => {
    dialogMessages(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    const originalBox = page.getByPlaceholder(/粘贴原稿/);
    await originalBox.fill(SAMPLE_ORIGINAL);
    // 先勾选保护以静默提交原稿（改稿尚为空，不弹确认框），再填改稿；
    // 否则比较时提交原稿会按设计清除改稿，审阅页将只剩删除全部的
    // 1 个 blocked Hunk，不是 §11.1 的 4 待审 + 1 冲突。
    await page.getByLabel('保护第 2 段').check();
    await page.getByPlaceholder(/粘贴改稿/).fill(SAMPLE_CANDIDATE);
    // 模拟真实 IME 事件序列（Playwright 无法驱动真实输入法，
    // 此处派发真实 DOM CompositionEvent；见 docs/COMPATIBILITY.md）。
    await originalBox.evaluate((el) => {
      el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    });
    // 组合输入中“开始比较”不可用，并有明确提示。
    const compare = page.getByRole('button', { name: '开始比较', exact: true });
    await expect(compare).toBeDisabled();
    await expect(page.locator('body')).toContainText('输入法组合输入尚未结束');
    // 结束组合后恢复，比较正常进行。
    await originalBox.evaluate((el) => {
      el.dispatchEvent(
        new CompositionEvent('compositionupdate', { bubbles: true, data: '周' }),
      );
      el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '周' }));
    });
    await expect(compare).toBeEnabled();
    await compare.click();
    await page.getByLabel('核对改动').waitFor({ timeout: 10000 });
    // 组合结束后比较正常进行：4 待审 + 1 保护冲突（不是删全文的 1 项）。
    await expect(page.locator('.review-counts')).toContainText('待审 4 项');
    await expect(page.locator('.review-counts')).toContainText('保护冲突 1 项');
  });
});

test.describe('窄屏 390 px', () => {
  test('390×844 下无横向溢出，核心按钮可见', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const narrow = await context.newPage();
    await runSampleToReview(narrow);
    const overflow = await narrow.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, '390 px 下不得出现横向溢出').toBeLessThanOrEqual(1);
    await narrow.screenshot({ path: path.join(evidenceDir(), 'review-390px.png') });
    await acceptAllPending(narrow);
    await expect(narrow.getByLabel('成稿全文')).toHaveText(SAMPLE_EXPECTED);
    await expect(
      narrow.getByRole('button', { name: '下载 TXT' }),
    ).toBeVisible();
    await narrow.screenshot({ path: path.join(evidenceDir(), 'result-390px.png') });
    await context.close();
  });
});

test.describe('FIX-T013 修复回归', () => {
  test('FR03：复制改稿说明，剪贴板内容与可见状态一致、不含内部标识', async ({
    page,
    browser,
  }) => {
    // 剪贴板读写需要显式授权，用独立上下文（与“导出一致”用例同一做法）。
    await page.context().close();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    const clipPage = await context.newPage();
    dialogMessages(clipPage);
    await clipPage.goto('/', { waitUntil: 'networkidle' });
    await clipPage.getByPlaceholder(/粘贴原稿/).fill(SAMPLE_ORIGINAL);
    await clipPage.getByLabel('保护第 2 段').check();
    await clipPage
      .getByPlaceholder(/把语气改得更正式/)
      .fill('语气更正式，但不要改时间地点');
    // 说明区显示当前目标与保护段落。
    await expect(clipPage.locator('#prepare-instruction-text')).toContainText(
      '修改目标：语气更正式，但不要改时间地点',
    );
    await expect(clipPage.locator('#prepare-instruction-text')).toContainText(
      '第 2 段：人数上限为30人。',
    );
    await clipPage
      .getByRole('button', { name: '复制改稿说明', exact: true })
      .click();
    await expect(clipPage.locator('body')).toContainText('已复制改稿说明。');
    await clipPage.waitForTimeout(300);
    const clipboard = await clipPage.evaluate(() =>
      navigator.clipboard.readText(),
    );
    expect(clipboard).toContain('修改目标：语气更正式，但不要改时间地点');
    expect(clipboard).toContain('第 2 段：人数上限为30人。');
    expect(clipboard).toContain('不会发送任何内容');
    expect(clipboard).not.toContain('prot-1');
    expect(clipboard).not.toContain('analysisId');
    await context.close();
  });

  test('P2-05：返回审阅（保留决定），已做决定不受影响', async ({ page }) => {
    await runSampleToReview(page);
    // 先采用一处改动。
    await page.locator('button.hunk-accept-button:not([disabled])').first().click();
    await expect(page.locator('.review-counts')).toContainText('已采用 1 项');
    // 返回准备页，再点“返回审阅（保留决定）”。
    await page
      .getByRole('button', { name: '返回调整保护', exact: true })
      .first()
      .click();
    await expect(page.locator('body')).toContainText('你从审阅页返回');
    await expect(
      page.getByRole('button', { name: '返回审阅（保留决定）', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: '返回审阅（保留决定）', exact: true })
      .click();
    await page.getByLabel('核对改动').waitFor({ timeout: 10000 });
    // 决定保留：仍为已采用 1 项，未被清空。
    await expect(page.locator('.review-counts')).toContainText('已采用 1 项');
    // 文案说明调整保护或原稿会清空决定。
    await page
      .getByRole('button', { name: '返回调整保护', exact: true })
      .first()
      .click();
    await expect(page.locator('body')).toContainText(
      '调整保护或原稿将清空旧的审阅决定',
    );
  });

  test('P2-06：组合输入中点保护复选框不冻结半成品草稿，结束后恢复', async ({
    page,
  }) => {
    dialogMessages(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    const originalBox = page.getByPlaceholder(/粘贴原稿/);
    await originalBox.fill(SAMPLE_ORIGINAL);
    await originalBox.evaluate((el) => {
      el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    });
    // 组合输入中点保护复选框：保护不勾上，并有明确提示。
    await page.getByLabel('保护第 2 段').click();
    await expect(page.locator('body')).toContainText('本轮没有受保护段落');
    await expect(page.locator('body')).toContainText('输入法组合输入尚未结束');
    await expect(page.getByLabel('保护第 2 段')).not.toBeChecked();
    // 结束组合后，勾选正常生效。
    await originalBox.evaluate((el) => {
      el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '人' }));
    });
    await page.getByLabel('保护第 2 段').check();
    await expect(page.locator('body')).toContainText('已保护 1 段');
  });

  test('P2-10：剪贴板被拒绝时复制成稿显示手动全选回退', async ({
    page,
    browser,
  }) => {
    await page.context().close();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    // 模拟剪贴板授权被拒绝：writeText 恒失败。
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: () => Promise.reject(new Error('clipboard denied')),
          readText: () => Promise.reject(new Error('clipboard denied')),
        },
        configurable: true,
      });
    });
    const deniedPage = await context.newPage();
    await runSampleToReview(deniedPage);
    await acceptAllPending(deniedPage);
    await deniedPage
      .getByRole('button', { name: '复制成稿', exact: true })
      .click();
    await expect(deniedPage.locator('body')).toContainText('复制失败');
    const fallback = deniedPage.locator('#app-fallback-text');
    await expect(fallback).toBeVisible();
    await expect(fallback).toHaveValue(SAMPLE_EXPECTED);
    await context.close();
  });

  test('P2-10：超限与非 UTF-8 文件导入在浏览器中被拒绝，旧输入保留', async ({
    page,
  }) => {
    dialogMessages(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    const originalBox = page.getByPlaceholder(/粘贴原稿/);
    await originalBox.fill(SAMPLE_ORIGINAL);
    await page.getByLabel('保护第 2 段').check();
    const fileInput = page.locator('input[aria-label="选择原稿文件"]');
    // 超限文件（>100 KiB）：写临时文件后按路径传入。
    const bigPath = '/tmp/fix-t013-big.txt';
    const badPath = '/tmp/fix-t013-bad.txt';
    fs.writeFileSync(bigPath, 'x'.repeat(100 * 1024 + 1));
    fs.writeFileSync(badPath, new Uint8Array([0xff, 0xfe, 0x41, 0x42]));
    await fileInput.setInputFiles(bigPath);
    await expect(page.locator('body')).toContainText('文件超过 100 KiB');
    await expect(originalBox).toHaveValue(SAMPLE_ORIGINAL);
    // 非 UTF-8 文件（0xFF 字节无法解码）。
    await fileInput.setInputFiles(badPath);
    await expect(page.locator('body')).toContainText('文件不是严格 UTF-8 文本');
    await expect(originalBox).toHaveValue(SAMPLE_ORIGINAL);
  });
});
