/**
 * P012 改稿守约 Edit Pact — 成品包快速开始验证（FIX-R1，P1-01）。
 *
 * 按 README 快速开始的真实用户路径，验证 edit-pact-dist.zip：
 * 干净解压到临时目录 → `node serve.mjs --port <port>` 启动 →
 * 首页 HTTP 200 → Worker 正常加载 → §11.1 主流程完成（成稿与期望逐字一致）。
 *
 * 本脚本只读发布目录，不改任何文件；解压目录在退出时删除，截图写到
 * --screenshots-dir（默认 ~/workspace/evidence/P012/FIX-R1/logs/screenshots）。
 * 任一断言失败即 exit 1，并打印已启动的服务器日志与临时目录路径。
 *
 * 用法：
 *   node scripts/verify-dist-quickstart.mjs [--dir <release-dir>]
 *     [--screenshots-dir <dir>] [--port <n>]
 * 默认发布目录：RELEASE_DIR 环境变量，或 <工作区>/../p012-release。
 * 由 `npm run release:verify` 在 hash-release.mjs 之后调用。
 */
import { spawn, execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = resolve(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const DEFAULT_DIR = resolve(ROOT, '..', 'p012-release');
const DEFAULT_SHOTS = resolve(
  ROOT, '..', 'evidence', 'P012', 'FIX-R1', 'logs', 'screenshots',
);

// 项目书 §11.1 正常混合采纳样本（与 tests/e2e/helpers.ts 同值）。
const SAMPLE_ORIGINAL = '请于周五确认。\n人数上限为30人。\n谢谢配合。';
const SAMPLE_CANDIDATE = '请在周五前回复确认。\n人数上限为50人。\n感谢配合。';
const SAMPLE_EXPECTED = '请在周五前回复确认。\n人数上限为30人。\n感谢配合。';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dir') out.dir = resolve(argv[++i]);
    else if (a === '--screenshots-dir') out.shots = resolve(argv[++i]);
    else if (a === '--port') out.port = Number(argv[++i]);
    else throw new Error(`unknown argument: ${a}`);
  }
  out.dir = out.dir ?? (process.env.RELEASE_DIR ? resolve(process.env.RELEASE_DIR) : DEFAULT_DIR);
  out.shots = out.shots ?? (process.env.QUICKSTART_SCREENSHOTS_DIR
    ? resolve(process.env.QUICKSTART_SCREENSHOTS_DIR) : DEFAULT_SHOTS);
  return out;
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const s = createNetServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const port = s.address().port;
      s.close(() => resolvePort(port));
    });
  });
}

async function waitForOk(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.status === 200) return res;
      last = new Error(`HTTP ${res.status}`);
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server did not answer 200 at ${url} within ${timeoutMs} ms: ${last?.message ?? last}`);
}

function fail(message) {
  console.error(`[quickstart] FAIL ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const distZip = join(args.dir, 'edit-pact-dist.zip');
  if (!existsSync(distZip)) fail(`dist zip not found: ${distZip}`);
  mkdirSync(args.shots, { recursive: true });

  const work = mkdtempSync(join(tmpdir(), 'p012-dist-quickstart-'));
  console.log(`[quickstart] release dir: ${args.dir}`);
  console.log(`[quickstart] extracted to: ${work}`);
  let server = null;
  try {
    execFileSync('unzip', ['-q', distZip, '-d', work], { stdio: 'inherit' });
    // 1. 成品包内容：README 说的启动文件必须在包内。
    for (const f of ['serve.mjs', 'index.html', 'THIRD_PARTY_NOTICES.md']) {
      if (!existsSync(join(work, f))) fail(`missing in dist zip: ${f}`);
    }
    if (!existsSync(join(work, 'assets'))) fail('missing in dist zip: assets/');
    console.log('[quickstart] PASS dist zip contains serve.mjs, index.html, THIRD_PARTY_NOTICES.md, assets/');

    // 2. 按 README 启动：进入解压目录，node serve.mjs --port <port>。
    const port = args.port ?? (await freePort());
    const base = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, ['serve.mjs', '--port', String(port)], {
      cwd: work,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let serverLog = '';
    server.stdout.on('data', (d) => { serverLog += d.toString(); });
    server.stderr.on('data', (d) => { serverLog += d.toString(); });
    const home = await waitForOk(`${base}/`, 15000);
    const homeText = await home.text();
    if (!homeText.includes('id="root"')) fail('GET / 200 but no app root in index.html');
    console.log(`[quickstart] PASS GET / → 200 (app root present, port ${port})`);

    // 3. HTTP 行为：HEAD 200；POST 405；越界路径不返回 200；许可证文件可取。
    const head = await fetch(`${base}/`, { method: 'HEAD' });
    if (head.status !== 200) fail(`HEAD / → ${head.status}, expected 200`);
    const post = await fetch(`${base}/`, { method: 'POST' });
    if (post.status !== 405) fail(`POST / → ${post.status}, expected 405`);
    const traversal = await fetch(`${base}/..%2f..%2fetc%2fpasswd`);
    if (traversal.status === 200) fail('traversal request unexpectedly returned 200');
    const notices = await fetch(`${base}/THIRD_PARTY_NOTICES.md`);
    if (notices.status !== 200) fail(`GET /THIRD_PARTY_NOTICES.md → ${notices.status}, expected 200`);
    const noticesText = await notices.text();
    if (!noticesText.includes('BSD 3-Clause License') || !noticesText.includes('Kevin Decker')) {
      fail('THIRD_PARTY_NOTICES.md served but missing BSD-3-Clause text');
    }
    console.log('[quickstart] PASS HEAD 200, POST 405, traversal blocked, THIRD_PARTY_NOTICES.md served');

    // 4. 真实浏览器：Worker 正常加载 + §11.1 主流程完成。
    const browser = await chromium.launch();
    try {
      const requests = [];
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      page.on('request', (r) => requests.push(`${r.method()} ${r.url()}`));
      page.on('dialog', (d) => void d.accept());
      await page.goto(`${base}/`, { waitUntil: 'networkidle' });
      await page.getByPlaceholder(/粘贴原稿/).fill(SAMPLE_ORIGINAL);
      await page.getByLabel('保护第 2 段').check();
      await page.getByPlaceholder(/粘贴改稿/).fill(SAMPLE_CANDIDATE);
      await page.getByRole('button', { name: '开始比较', exact: true }).click();
      await page.getByLabel('核对改动').waitFor({ timeout: 10000 });
      const hunkCount = await page.locator('.hunk-card').count();
      if (hunkCount !== 5) fail(`expected 5 hunk cards, got ${hunkCount}`);
      const workerReq = requests.find((u) => u.includes('diff.worker'));
      if (!workerReq) fail(`no diff.worker request observed: ${JSON.stringify(requests)}`);
      console.log(`[quickstart] PASS Worker loaded (${workerReq}), 5 hunk cards in review`);
      await page.screenshot({ path: join(args.shots, 'quickstart-review-1280x800.png') });
      for (let i = 0; i < 20; i += 1) {
        const button = page.locator('button.hunk-accept-button:not([disabled])').first();
        if ((await button.count()) === 0) break;
        await button.click();
        await page.waitForTimeout(120);
      }
      await page.getByLabel('成稿全文').waitFor({ timeout: 10000 });
      const composed = await page.getByLabel('成稿全文').innerText();
      if (composed !== SAMPLE_EXPECTED) {
        fail(`composed text mismatch: ${JSON.stringify(composed)}`);
      }
      console.log('[quickstart] PASS §11.1 main flow complete, composed text matches expected');
      await page.screenshot({ path: join(args.shots, 'quickstart-result-1280x800.png') });
      const external = requests.filter(
        (u) => !u.startsWith('GET http://127.0.0.1:') && !u.startsWith('GET data:'),
      );
      if (external.length > 0) fail(`external requests during quickstart: ${JSON.stringify(external)}`);
      console.log(`[quickstart] PASS ${requests.length} request(s), all loopback, 0 external`);
      await context.close();

      // 390 px 窄屏：无横向溢出，核心按钮可见。
      const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const mpage = await mobile.newPage();
      mpage.on('dialog', (d) => void d.accept());
      await mpage.goto(`${base}/`, { waitUntil: 'networkidle' });
      await mpage.screenshot({ path: join(args.shots, 'quickstart-initial-390px.png') });
      const overflow = await mpage.evaluate(() => document.documentElement.scrollWidth > 390);
      if (overflow) fail('390px viewport has horizontal overflow');
      await mpage.getByPlaceholder(/粘贴原稿/).fill(SAMPLE_ORIGINAL);
      await mpage.getByLabel('保护第 2 段').check();
      await mpage.getByPlaceholder(/粘贴改稿/).fill(SAMPLE_CANDIDATE);
      await mpage.getByRole('button', { name: '开始比较', exact: true }).click();
      await mpage.getByLabel('核对改动').waitFor({ timeout: 10000 });
      await mpage.screenshot({ path: join(args.shots, 'quickstart-review-390px.png') });
      console.log('[quickstart] PASS 390px viewport, no horizontal overflow');
      await mobile.close();
    } finally {
      await browser.close();
    }
  } finally {
    if (server) {
      server.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 300));
      if (!server.killed) server.kill('SIGKILL');
    }
    rmSync(work, { recursive: true, force: true });
  }
  console.log('[quickstart] all checks passed');
}

main().catch((e) => {
  if (process.exitCode !== 1) {
    console.error(`[quickstart] FAIL ${e.message}`);
    process.exitCode = 1;
  }
});
