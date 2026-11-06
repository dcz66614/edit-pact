/**
 * P012 改稿守约 Edit Pact — T014 发布校验器（release:verify）。
 *
 * 对发布目录做完整一致性校验，全部通过才 exit 0；任一失败列出明细并 exit 1。
 * 校验项：
 * 1. 必需文件齐全且可读（见 REQUIRED 列表）。
 * 2. SHA256SUMS.txt：每行哈希与实际文件一致；目录内每个文件（除自身外）
 *    恰好被列出一次，无多余、无遗漏。
 * 3. SOURCE_MANIFEST.csv：每行文件在 edit-pact-source.zip 内存在且字节数、
 *    SHA-256 一致；zip 内无清单外文件；两行发布包自记录与实际 zip 文件一致。
 * 4. DIST_MANIFEST.csv：同上，针对 edit-pact-dist.zip。
 * 5. REVIEW_INDEX.md：清单每行都出现且 SHA-256 前缀一致；引用的审查包存在。
 * 6. REVIEW_PACK_XX.md：每包内每个文件的 SHA-256 与清单一致。
 * 7. NETWORK_REQUESTS.json：全部请求均为 127.0.0.1 loopback，零外部请求。
 * 8. STORAGE_CHECK.json：流程前后与清空后，localStorage / sessionStorage /
 *    cookie / IndexedDB 全空。
 * 9. 第三方许可证（FIX-R1 P1-02）：THIRD_PARTY_NOTICES.md 同时存在于
 *    源码包与成品包内，两份内容逐字节一致，且含 diff BSD-3-Clause 完整
 *    正文（版权 Kevin Decker）与 react / react-dom / zod MIT 通知。
 *
 * 注意：本脚本只校验发布目录，不改任何文件，不调用 verify / release:pack。
 * 用法：node scripts/hash-release.mjs [--dir <release-dir>]
 * 默认目录：<工作区>/../p012-release；也可用 RELEASE_DIR 环境变量指定。
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const DEFAULT_DIR = resolve(ROOT, '..', 'p012-release');

const REQUIRED_FILES = [
  'edit-pact-source.zip',
  'edit-pact-dist.zip',
  'SOURCE_MANIFEST.csv',
  'DIST_MANIFEST.csv',
  'SHA256SUMS.txt',
  'ENVIRONMENT.md',
  'BUILD_LOG.txt',
  'TEST_LOG.txt',
  'E2E_LOG.txt',
  'PRIVACY_LOG.txt',
  'BENCHMARK_LOG.txt',
  'BENCHMARK_RESULTS.json',
  'BENCHMARK_NOTE.md',
  'EVALUATION_CHECK_LOG.txt',
  'VERIFY_LOG.txt',
  'INSTALL_LOG.txt',
  'RELEASE_PACK_LOG.txt',
  'RELEASE_VERIFY_LOG.txt',
  'NETWORK_REQUESTS.json',
  'STORAGE_CHECK.json',
  'REVIEW_INDEX.md',
  'REVIEW_PACK_01.md',
  'LICENSE',
  'LICENSE_REPORT.md',
  'DRIVE_MANIFEST.md',
];

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function walkFiles(dir, base) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walkFiles(full, base));
    else if (entry.isFile()) found.push(relative(base, full).split(sep).join('/'));
  }
  return found.sort();
}

function parseSums(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (line.length === 0) continue;
    const m = line.match(/^([0-9a-f]{64})  (.+)$/);
    if (!m) throw new Error(`bad SHA256SUMS line: ${line}`);
    rows.push({ hash: m[1], file: m[2] });
  }
  return rows;
}

function parseCsvManifest(text, name) {
  const lines = text.split('\n').filter((l) => l.length > 0);
  if (lines[0] !== 'path,bytes,sha256') throw new Error(`bad ${name} header: ${lines[0]}`);
  return lines.slice(1).map((line) => {
    const [path, bytes, sha256] = line.split(',');
    if (!path || bytes === undefined || !sha256) throw new Error(`bad ${name} row: ${line}`);
    return { path, bytes: Number(bytes), sha256 };
  });
}

// 用 unzip -p 读出 zip 内单个文件（不解压到磁盘）。
function zipRead(zipPath, entry) {
  return execFileSync('unzip', ['-p', zipPath, entry], { maxBuffer: 64 * 1024 * 1024 });
}

function zipList(zipPath) {
  const out = execFileSync('unzip', ['-l', zipPath], { encoding: 'utf-8' });
  const entries = [];
  for (const line of out.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+(.+)$/);
    if (m) entries.push({ bytes: Number(m[1]), path: m[2] });
  }
  return entries;
}

function main() {
  const argv = process.argv.slice(2);
  let dir = process.env.RELEASE_DIR ? resolve(process.env.RELEASE_DIR) : DEFAULT_DIR;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dir') dir = resolve(argv[++i]);
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  const failures = [];
  const passes = [];
  const fail = (msg) => failures.push(msg);
  const pass = (msg) => passes.push(msg);

  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error(`[hash-release] release dir not found: ${dir}`);
    process.exit(1);
  }

  // 1. 必需文件。
  const missing = REQUIRED_FILES.filter((f) => !existsSync(join(dir, f)));
  if (missing.length > 0) fail(`missing required files: ${missing.join(', ')}`);
  else pass(`required files present (${REQUIRED_FILES.length})`);
  const screenshots = existsSync(join(dir, 'screenshots'))
    ? walkFiles(join(dir, 'screenshots'), join(dir, 'screenshots')).filter((f) => f.endsWith('.png'))
    : [];
  if (screenshots.length === 0) fail('screenshots/: no PNG demo screenshots');
  else pass(`screenshots present (${screenshots.length} PNG)`);

  // 2. SHA256SUMS.txt。
  const allFiles = walkFiles(dir, dir).filter((f) => f !== 'SHA256SUMS.txt');
  try {
    const sums = parseSums(readFileSync(join(dir, 'SHA256SUMS.txt'), 'utf-8'));
    const listed = new Set(sums.map((s) => s.file));
    for (const s of sums) {
      if (!existsSync(join(dir, s.file))) {
        fail(`SHA256SUMS lists missing file: ${s.file}`);
        continue;
      }
      const actual = sha256Hex(readFileSync(join(dir, s.file)));
      if (actual !== s.hash) fail(`SHA256SUMS mismatch: ${s.file}`);
    }
    for (const f of allFiles) {
      if (!listed.has(f)) fail(`SHA256SUMS missing entry for: ${f}`);
    }
    if (failures.length === 0) pass(`SHA256SUMS.txt verified (${sums.length} entries)`);
  } catch (e) {
    fail(`SHA256SUMS.txt unreadable: ${e.message}`);
  }

  // 3+4. 两个 zip 与各自清单。
  function checkZip(zipName, manifestName) {
    const zipPath = join(dir, zipName);
    const manifestPath = join(dir, manifestName);
    if (!existsSync(zipPath) || !existsSync(manifestPath)) {
      fail(`cannot check ${zipName} / ${manifestName}: missing`);
      return;
    }
    const rows = parseCsvManifest(readFileSync(manifestPath, 'utf-8'), manifestName);
    const entries = zipList(zipPath);
    const entryMap = new Map(entries.map((e) => [e.path, e.bytes]));
    const selfRows = rows.filter((r) => r.path === 'edit-pact-source.zip' || r.path === 'edit-pact-dist.zip');
    const fileRows = rows.filter((r) => !selfRows.includes(r));
    for (const row of fileRows) {
      if (!entryMap.has(row.path)) {
        fail(`${manifestName}: ${row.path} not in ${zipName}`);
        continue;
      }
      if (entryMap.get(row.path) !== row.bytes) {
        fail(`${manifestName}: size mismatch ${row.path}`);
      }
      let content;
      try {
        content = zipRead(zipPath, row.path);
      } catch {
        fail(`${manifestName}: cannot read ${row.path} from ${zipName}`);
        continue;
      }
      if (sha256Hex(content) !== row.sha256) fail(`${manifestName}: hash mismatch ${row.path}`);
    }
    for (const e of entries) {
      if (!fileRows.some((r) => r.path === e.path)) {
        fail(`${zipName} has extra entry not in ${manifestName}: ${e.path}`);
      }
    }
    for (const row of selfRows) {
      const actualPath = join(dir, row.path);
      if (!existsSync(actualPath)) {
        fail(`${manifestName}: self-record file missing: ${row.path}`);
        continue;
      }
      const bytes = readFileSync(actualPath);
      if (bytes.length !== row.bytes) fail(`${manifestName}: self-record size mismatch ${row.path}`);
      if (sha256Hex(bytes) !== row.sha256) fail(`${manifestName}: self-record hash mismatch ${row.path}`);
    }
    pass(`${zipName} matches ${manifestName} (${fileRows.length} files)`);
  }
  checkZip('edit-pact-source.zip', 'SOURCE_MANIFEST.csv');
  checkZip('edit-pact-dist.zip', 'DIST_MANIFEST.csv');

  // 5. REVIEW_INDEX.md 与清单一致。
  try {
    const index = readFileSync(join(dir, 'REVIEW_INDEX.md'), 'utf-8');
    const sourceRows = parseCsvManifest(readFileSync(join(dir, 'SOURCE_MANIFEST.csv'), 'utf-8'), 'SOURCE_MANIFEST.csv');
    for (const row of sourceRows) {
      const re = new RegExp(`\\| \`${row.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\` \\| \`([0-9a-f]{12})…([0-9a-f]{4})\` \\| ${row.bytes} \\|`);
      const m = index.match(re);
      if (!m) {
        fail(`REVIEW_INDEX.md missing or inconsistent row: ${row.path}`);
      } else if (!row.sha256.startsWith(m[1]) || !row.sha256.endsWith(m[2])) {
        fail(`REVIEW_INDEX.md hash prefix mismatch: ${row.path}`);
      }
    }
    const packRefs = [...index.matchAll(/REVIEW_PACK_\d+\.md/g)].map((m) => m[0]);
    const uniquePacks = [...new Set(packRefs)];
    const missingPacks = uniquePacks.filter((p) => !existsSync(join(dir, p)));
    if (missingPacks.length > 0) fail(`REVIEW_INDEX.md references missing packs: ${missingPacks.join(', ')}`);
    else pass(`REVIEW_INDEX.md consistent (${sourceRows.length} rows, ${uniquePacks.length} pack(s))`);
  } catch (e) {
    fail(`REVIEW_INDEX.md check failed: ${e.message}`);
  }

  // 6. REVIEW_PACK_XX.md 内文件哈希与清单一致。
  try {
    const sourceRows = parseCsvManifest(readFileSync(join(dir, 'SOURCE_MANIFEST.csv'), 'utf-8'), 'SOURCE_MANIFEST.csv');
    const rowMap = new Map(sourceRows.map((r) => [r.path, r.sha256]));
    const packFiles = walkFiles(dir, dir).filter((f) => /^REVIEW_PACK_\d+\.md$/.test(f));
    let checked = 0;
    for (const packFile of packFiles) {
      const text = readFileSync(join(dir, packFile), 'utf-8');
      const blocks = [...text.matchAll(/^## `(.+)`\n\n- SHA-256: `([0-9a-f]{64})`/gm)];
      for (const [, path, hash] of blocks) {
        checked += 1;
        if (!rowMap.has(path)) fail(`${packFile}: file not in manifest: ${path}`);
        else if (rowMap.get(path) !== hash) fail(`${packFile}: hash mismatch: ${path}`);
      }
    }
    if (checked === 0) fail('no files found inside REVIEW_PACK files');
    else pass(`REVIEW_PACK contents match manifest (${checked} files)`);
  } catch (e) {
    fail(`REVIEW_PACK check failed: ${e.message}`);
  }

  // 7. 网络：零外部请求。
  try {
    const net = JSON.parse(readFileSync(join(dir, 'NETWORK_REQUESTS.json'), 'utf-8'));
    const requests = net.requests ?? net;
    if (!Array.isArray(requests)) throw new Error('no requests array');
    // 请求以 "METHOD url" 记录（T011 证据格式）；先取 URL 部分再判定。
    const external = requests.filter((u) => {
      if (typeof u !== 'string') return true;
      const url = u.split(/\s+/).pop() ?? '';
      return (
        !url.startsWith('http://127.0.0.1') &&
        !url.startsWith('http://localhost') &&
        !url.startsWith('data:')
      );
    });
    if (external.length > 0) fail(`external network requests found: ${external.slice(0, 5).join(', ')}`);
    else pass(`network: ${requests.length} request(s), all loopback, 0 external`);
  } catch (e) {
    fail(`NETWORK_REQUESTS.json check failed: ${e.message}`);
  }

  // 8. 存储：全空。接受两种写法：检查点数组，或 {名字: 检查点} 对象
  // （T011 证据格式）；每项含 localStorage / sessionStorage / cookie /
  // indexedDB 四区，空数组 / 空字符串 / 0 / null / 空对象均算空。
  try {
    const store = JSON.parse(readFileSync(join(dir, 'STORAGE_CHECK.json'), 'utf-8'));
    let checkpoints;
    if (Array.isArray(store)) checkpoints = store;
    else if (Array.isArray(store.checkpoints)) checkpoints = store.checkpoints;
    else if (store && typeof store === 'object') {
      checkpoints = Object.entries(store).map(([name, v]) => ({ name, ...(v ?? {}) }));
    } else {
      throw new Error('unrecognized shape');
    }
    if (checkpoints.length === 0) throw new Error('no checkpoints found');
    const bad = [];
    for (const cp of checkpoints) {
      for (const area of ['localStorage', 'sessionStorage', 'cookie', 'indexedDB']) {
        const v = cp[area];
        const empty =
          v === 0 || v === '' || v === null || (Array.isArray(v) && v.length === 0) ||
          (typeof v === 'object' && v !== null && Object.keys(v).length === 0);
        if (!empty) bad.push(`${cp.name ?? cp.stage ?? '?'}:${area}=${JSON.stringify(v)}`);
      }
    }
    if (bad.length > 0) fail(`storage not empty: ${bad.join('; ')}`);
    else pass(`storage: empty at all ${checkpoints.length} checkpoint(s)`);
  } catch (e) {
    fail(`STORAGE_CHECK.json check failed: ${e.message}`);
  }

  // 9. 第三方许可证（FIX-R1 P1-02；FIX-R2 P2-09 补 scheduler）：通知文件
  // 必须同时在源码包与成品包内，两份逐字节一致，且含 BSD-3-Clause 完整
  // 正文与 MIT 通知（含 scheduler@0.23.2，react-dom 的传递依赖）。
  try {
    const sourceZip = join(dir, 'edit-pact-source.zip');
    const distZip = join(dir, 'edit-pact-dist.zip');
    const inSource = zipList(sourceZip).some((e) => e.path === 'THIRD_PARTY_NOTICES.md');
    const inDist = zipList(distZip).some((e) => e.path === 'THIRD_PARTY_NOTICES.md');
    if (!inSource) fail('THIRD_PARTY_NOTICES.md missing from edit-pact-source.zip');
    if (!inDist) fail('THIRD_PARTY_NOTICES.md missing from edit-pact-dist.zip');
    if (inSource && inDist) {
      const a = zipRead(sourceZip, 'THIRD_PARTY_NOTICES.md');
      const b = zipRead(distZip, 'THIRD_PARTY_NOTICES.md');
      if (!a.equals(b)) fail('THIRD_PARTY_NOTICES.md differs between source and dist zips');
      const text = a.toString('utf-8');
      const needed = [
        'BSD 3-Clause License',
        'Kevin Decker',
        'diff',
        'react 18.3.1',
        'react-dom 18.3.1',
        'scheduler 0.23.2',
        'scheduler',
        'zod 3.25.76',
        'MIT License',
      ];
      const absent = needed.filter((s) => !text.includes(s));
      if (absent.length > 0) fail(`THIRD_PARTY_NOTICES.md missing: ${absent.join(', ')}`);
      else pass('third-party notices in both zips, identical, BSD-3-Clause + MIT present');
    }
  } catch (e) {
    fail(`THIRD_PARTY_NOTICES.md check failed: ${e.message}`);
  }

  for (const p of passes) console.log(`[hash-release] PASS ${p}`);
  if (failures.length > 0) {
    for (const f of failures) console.error(`[hash-release] FAIL ${f}`);
    console.error(`[hash-release] FAILED: ${failures.length} failure(s)`);
    process.exit(1);
  }
  console.log('[hash-release] all checks passed');
}

main();
