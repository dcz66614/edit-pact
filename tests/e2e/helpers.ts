/**
 * P012 T011 — E2E 共享辅助（真实浏览器，Playwright）。
 *
 * 项目书 §11.1 正常混合采纳样本；所有断言以正确合成结果与保护
 * 不变量为准，不把某种漂亮分块误当业务正确性。
 */
import { expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

export const SAMPLE_ORIGINAL = '请于周五确认。\n人数上限为30人。\n谢谢配合。';
export const SAMPLE_CANDIDATE = '请在周五前回复确认。\n人数上限为50人。\n感谢配合。';
export const SAMPLE_EXPECTED = '请在周五前回复确认。\n人数上限为30人。\n感谢配合。';

/** 证据目录：默认 ~/workspace/evidence/P012/T011，可用环境变量覆盖。 */
export function evidenceDir(): string {
  const dir =
    process.env.T011_EVIDENCE_DIR ??
    path.join(process.env.HOME ?? '', 'workspace', 'evidence', 'P012', 'T011');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 每页只注册一次的确认框处理：记录全部确认框文案并一律接受（真实用户
 * 点“确定”的等价操作）。重复调用返回同一数组，不会重复注册导致
 * "dialog already handled" 报错。需要拒绝确认的测试不要用它，
 * 改为自己注册一次性的 dismiss 处理（见 user-flow.spec.ts）。
 */
export function dialogMessages(page: Page): string[] {
  const p = page as unknown as { __t011DialogMessages?: string[] };
  if (!p.__t011DialogMessages) {
    p.__t011DialogMessages = [];
    page.on('dialog', (dialog) => {
      p.__t011DialogMessages!.push(dialog.message());
      void dialog.accept();
    });
  }
  return p.__t011DialogMessages;
}

export function writeEvidence(name: string, content: string): string {
  const file = path.join(evidenceDir(), name);
  fs.writeFileSync(file, content);
  return file;
}

/** 收集一次完整流程的全部网络请求 URL。 */
export function collectRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (request) => urls.push(`${request.method()} ${request.url()}`));
  return urls;
}

/** 断言：全部请求均为本机 loopback 或 data:，零外部请求。 */
export function assertLoopbackOnly(urls: string[]): void {
  const external = urls.filter(
    (u) => !u.startsWith('GET http://127.0.0.1:') && !u.startsWith('GET data:'),
  );
  expect(external, `外部请求必须为 0，实际：${JSON.stringify(external)}`).toEqual([]);
}

/** 填原稿、保护第 2 段、填改稿、开始比较，直至审阅页出现。
 *
 * 顺序有讲究：先勾选保护再填改稿——勾选会提交原稿草稿，此时改稿
 * 尚为空所以静默提交；若先填改稿再提交原稿，会弹出“修改原稿将清除
 * 改稿、保护和决定”确认框（见“原稿改动先确认一次”用例）。 */
export async function runSampleToReview(page: Page): Promise<void> {
  dialogMessages(page);
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.getByPlaceholder(/粘贴原稿/).fill(SAMPLE_ORIGINAL);
  await page.getByLabel('保护第 2 段').check();
  await page.getByPlaceholder(/粘贴改稿/).fill(SAMPLE_CANDIDATE);
  await page.getByRole('button', { name: '开始比较', exact: true }).click();
  await page.getByLabel('核对改动').waitFor({ timeout: 10000 });
}

/** 采用全部处于待审的变更（已决定项的按钮为 disabled，不再点）。 */
export async function acceptAllPending(page: Page): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const button = page.locator('button.hunk-accept-button:not([disabled])').first();
    if ((await button.count()) === 0) return;
    await button.click();
    await page.waitForTimeout(120);
  }
  throw new Error('acceptAllPending: 20 次点击后仍有待审项');
}

/** 读取当前浏览器存储状态（localStorage / sessionStorage / cookie / IndexedDB）。 */
export async function readStorage(page: Page): Promise<{
  localStorage: string[];
  sessionStorage: string[];
  cookie: string;
  indexedDB: string[];
}> {
  return page.evaluate(async () => ({
    localStorage: Object.keys(localStorage),
    sessionStorage: Object.keys(sessionStorage),
    cookie: document.cookie,
    indexedDB: (await indexedDB.databases()).map((d) => d.name ?? ''),
  }));
}

export function assertStorageEmpty(storage: {
  localStorage: string[];
  sessionStorage: string[];
  cookie: string;
  indexedDB: string[];
}): void {
  expect(storage.localStorage, 'localStorage 必须为空').toEqual([]);
  expect(storage.sessionStorage, 'sessionStorage 必须为空').toEqual([]);
  expect(storage.cookie, 'cookie 必须为空').toEqual('');
  expect(storage.indexedDB, 'IndexedDB 必须为空').toEqual([]);
}
