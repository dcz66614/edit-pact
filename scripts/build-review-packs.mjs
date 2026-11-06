/**
 * P012 改稿守约 Edit Pact — T014 终审审查包生成器。
 *
 * 生成 REVIEW_INDEX.md（覆盖清单）与 REVIEW_PACK_XX.md（完整源码正文，
 * 按字节上限分包，单个文件永不拆开）。审查包只收录源码类文件
 *（src/**、scripts/**、tests/** 代码文件、根配置）；评估数据、
 * 审查报告、文档、交接记录、规格文件只进索引，不进包正文——与 P011
 * 的 REVIEW_INDEX/REVIEW_PACK 组织方式一致。
 *
 * 覆盖栏的依据只写已实际发生的审查，不编造：
 * - T013 独立审查逐行读过的文件，写明 T013 全文通读；
 * - FIX-T013 / T014 新增的文件，写明未经 T013 阅读、随终审包提交终审阅读；
 * - 测试与 fixture 写 T013 / T010 的实际核对方式。
 *
 * 用法：
 *   node scripts/build-review-packs.mjs --out <release-dir> \
 *     --manifest <release-dir>/SOURCE_MANIFEST.csv \
 *     --source-zip <release-dir>/edit-pact-source.zip [--max-bytes 150000]
 * 由 scripts/package-release.mjs 调用，也可单独运行。
 * 退出码：参数缺失、清单缺失、文件不可读、包内哈希与清单不一致时非零。
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const PROJECT_ID = 'P012';
const SPEC_VERSION = '1.0.0';
const APP_VERSION = '0.1.0';
const DEFAULT_MAX_BYTES = 150000;

// 与 package-release.mjs 相同的源码树收录规则（排除构建产物与重复规格包）。
const EXCLUDED_DIRS = new Set([
  'node_modules',
  'dist',
  'test-results',
  'playwright-report',
  'coverage',
  'P012-edit-pact',
  '.git',
]);
// 测量型产物：每次 benchmark 重写，不以哈希为准，不进冻结源码包。
const EXCLUDED_FROM_SOURCE_ZIP = new Set(['tests/performance/results.json']);

function parseArgs(argv) {
  const out = { maxBytes: DEFAULT_MAX_BYTES };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--out') out.outDir = argv[++i];
    else if (a === '--manifest') out.manifest = argv[++i];
    else if (a === '--source-zip') out.sourceZip = argv[++i];
    else if (a === '--max-bytes') out.maxBytes = Number(argv[++i]);
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!out.outDir || !out.manifest || !out.sourceZip) {
    throw new Error('missing required argument: --out, --manifest and --source-zip are all required');
  }
  if (!Number.isInteger(out.maxBytes) || out.maxBytes <= 0) {
    throw new Error(`invalid --max-bytes: ${out.maxBytes}`);
  }
  return out;
}

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function shortHash(hash) {
  return `${hash.slice(0, 12)}…${hash.slice(-4)}`;
}

function walk(dir, base) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = relative(base, full).split(sep).join('/');
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      found.push(...walk(full, base));
    } else if (entry.isFile()) {
      if (entry.name === '.DS_Store') continue;
      if (rel.endsWith('.tsbuildinfo')) continue;
      if (EXCLUDED_FROM_SOURCE_ZIP.has(rel)) continue;
      found.push(rel);
    }
  }
  return found;
}

// 审查包收录：源码类文件全文；其余文件只进索引。
function inReviewPack(rel) {
  if (rel.startsWith('src/')) return true;
  if (rel.startsWith('scripts/')) return true;
  if (rel.startsWith('tests/') && /\.(ts|tsx|d\.ts)$/.test(rel)) return true;
  return [
    'index.html',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'vite.config.ts',
    'vitest.config.ts',
    'playwright.config.ts',
    '.nvmrc',
    '.gitignore',
  ].includes(rel);
}

// 实际读取覆盖：只写已发生的审查结论，不编造。
// 时间线口径（FIX-R2 P2-10）：终审 R2 指出 D 的索引把 FIX-R1 新增的
// 两个脚本标成“T013 全文通读”，并把 FIX-T013 改过的文件标成 T013
// 读过冻结版——两者都不成立：T013 读的是修改前版本，FIX-R1 的新文件
// 在 T013 之后才出现。以下集合按“最新修改者优先”判定，每行写明该文件
// 内容实际被谁、在何时读过，修改后未重读的如实写出，不冒充。
// 集合来源：各任务交接的“改动文件清单”（FIX-T013 / FIX-R1 / FIX-R2）。
const FIX_T013_NEW = new Set([
  'scripts/verify.mjs',
  'src/core/instruction.ts',
  'tests/unit/instruction.test.ts',
  'LICENSE',
]);
const FIX_T013_MODIFIED = new Set([
  'package.json',
  'src/workers/client.ts',
  'src/app/useEditPact.ts',
  'src/components/PreparePanel.tsx',
  'src/components/HunkCard.tsx',
  'src/app/EditPactApp.tsx',
  'src/core/text.ts',
  'src/components/prepare.css',
  'src/styles/base.css',
  'scripts/check-fixtures.mjs',
  'docs/DEPENDENCIES.md',
  'tests/unit/integration.test.tsx',
  'tests/unit/worker.test.ts',
  'tests/unit/text.test.ts',
  'tests/unit/review-ui.test.tsx',
  'tests/unit/prepare-ui.test.tsx',
  'tests/e2e/user-flow.spec.ts',
  'tests/node-shims.d.ts',
  'tests/unit/guards.test.ts',
  'tests/unit/compose.test.ts',
  'reviews/OPEN_ISSUES.md',
]);
const FIX_R1_NEW = new Set([
  'scripts/serve-dist.mjs',
  'scripts/verify-dist-quickstart.mjs',
  'THIRD_PARTY_NOTICES.md',
]);
const FIX_R1_MODIFIED = new Set([
  'scripts/package-release.mjs',
  'scripts/hash-release.mjs',
  'package.json',
  'README.md',
  'docs/DEPENDENCIES.md',
  'reviews/OPEN_ISSUES.md',
  'src/app/useEditPact.ts',
  'docs/RELEASE_GUIDE.md',
]);
const FIX_R2_NEW = new Set(['scripts/audit-bundled-deps.mjs']);
const FIX_R2_MODIFIED = new Set([
  'scripts/build-review-packs.mjs',
  'scripts/package-release.mjs',
  'scripts/hash-release.mjs',
  'THIRD_PARTY_NOTICES.md',
]);

function coverageFor(rel) {
  if (FIX_R2_NEW.has(rel)) {
    return 'FIX-R2 新增；未经独立审查；随终审包提交终审阅读';
  }
  if (FIX_R2_MODIFIED.has(rel)) {
    if (rel === 'scripts/build-review-packs.mjs') {
      return 'T014 新增；FIX-R2 修改（审查时间线口径）；未经独立审查；随终审包提交终审阅读';
    }
    if (rel === 'scripts/package-release.mjs' || rel === 'scripts/hash-release.mjs') {
      return 'T014 新增；FIX-R1 与 FIX-R2 先后修改；未经独立审查；随终审包提交终审阅读';
    }
    if (rel === 'THIRD_PARTY_NOTICES.md') {
      return 'FIX-R1 新增；FIX-R2 修改（补 scheduler）；未经独立审查；随终审包提交终审阅读';
    }
  }
  if (FIX_R1_NEW.has(rel)) {
    return 'FIX-R1 新增；未经独立审查；随终审包提交终审阅读';
  }
  if (FIX_R1_MODIFIED.has(rel)) {
    if (rel === 'src/app/useEditPact.ts') {
      return 'T013 通读的是 FIX-T013 修改前版本；FIX-T013 与 FIX-R1 先后修改，修改后未经独立审查；随终审包提交终审阅读';
    }
    if (rel === 'README.md') {
      return 'FIX-R1 修改（快速开始命令）；未列入 T013 逐文件阅读清单；随终审包提交终审阅读';
    }
    if (rel === 'docs/DEPENDENCIES.md') {
      return '规格依据文件；T013 审查时引用（未逐行通读）；FIX-T013 与 FIX-R1 修改后内容有变；随终审包提交终审阅读';
    }
    if (rel === 'reviews/OPEN_ISSUES.md') {
      return '审查报告本身（T010/T011/T013 审查结论）；FIX-T013 与 FIX-R1 续登修复状态与终审轮次';
    }
    if (rel === 'package.json') {
      return '未列入 T013 逐文件阅读清单；FIX-T013 与 FIX-R1 修改（verify / release:verify / description）；随终审包提交终审阅读';
    }
    if (rel === 'docs/RELEASE_GUIDE.md') {
      return '规格依据文件；FIX-R1 修改（发布目录与 release:verify 说明）；随终审包提交终审阅读';
    }
  }
  if (FIX_T013_NEW.has(rel)) {
    if (rel === 'scripts/verify.mjs') {
      return 'FIX-T013 新增（T013 要求补建）；T013 未读；npm run verify 已跑通，随终审包提交终审阅读';
    }
    if (rel === 'src/core/instruction.ts') {
      return 'FIX-T013 新增（实现 FR03）；T013 未读；单元 + 集成 + E2E 覆盖，随终审包提交终审阅读';
    }
    if (rel === 'tests/unit/instruction.test.ts') {
      return 'FIX-T013 新增；T013 未读；单元覆盖 FR03，随终审包提交终审阅读';
    }
    if (rel === 'LICENSE') {
      return 'FIX-T013 新增（MIT）；T013 未读；随终审包提交终审阅读';
    }
  }
  if (FIX_T013_MODIFIED.has(rel)) {
    if (rel.startsWith('tests/')) {
      return 'T013 按测试名清单核对的是 FIX-T013 修改前版本；修改后未经 T013 重核；随终审包提交终审阅读';
    }
    return 'T013 独立审查通读的是 FIX-T013 修改前版本；修改后未经 T013 重读；随终审包提交终审阅读';
  }
  if (rel === 'src/core/instruction.ts') {
    return 'FIX-T013 新增（实现 FR03）；T013 未读；单元 + 集成 + E2E 覆盖，随终审包提交终审阅读';
  }
  if (rel.startsWith('src/')) return 'T013 独立审查：全文通读（2026-11-05）';
  if (rel === 'scripts/verify.mjs') {
    return 'FIX-T013 新增（T013 要求补建）；T013 未读；npm run verify 已跑通，随终审包提交终审阅读';
  }
  if (/^scripts\/(package-release|hash-release|build-review-packs)\.mjs$/.test(rel)) {
    return 'T014 新增；未经独立审查；随终审包提交终审阅读';
  }
  if (rel.startsWith('scripts/')) return 'T013 独立审查：全文通读（2026-11-05）';
  if (rel.startsWith('tests/oracle/')) return 'T010 独立 oracle（自写，不调用生产函数）';
  if (rel.startsWith('tests/fixtures/')) {
    return '金标准：T002 建立；T010 独立 oracle 核对；FIX-T010-01 修正 F07';
  }
  if (rel.startsWith('tests/')) {
    return 'T013 按测试名清单核对覆盖（见 TRACEABILITY_REVIEW.md）';
  }
  if (rel.startsWith('evaluation/')) {
    return 'T013 已读：协议 v1.0.0 冻结；observations.csv 0 行；results.json 状态 USER_VALUE_NOT_MEASURED 与 REPORT 一致';
  }
  if (rel.startsWith('reviews/')) return '审查报告本身（T010/T011/T013 审查结论）';
  if (rel.startsWith('docs/')) return '规格依据文件；T013 审查时引用（CONTRACT §7 等），未逐行通读';
  if (rel.startsWith('handoffs/')) return '任务交接记录；未逐行审查';
  if (/^(PROJECT_BOOK|IMPLEMENTATION_PLAN|IDEATION_REPORT)\.md$/.test(rel)) {
    return '立项规格（SPEC 1.0.0）；终审阅读材料';
  }
  return '未列入 T013 逐文件阅读清单；随终审包提交终审阅读';
}

function langFor(rel) {
  if (rel.endsWith('.tsx')) return 'tsx';
  if (rel.endsWith('.ts')) return 'ts';
  if (rel.endsWith('.mjs') || rel.endsWith('.js')) return 'js';
  if (rel.endsWith('.json')) return 'json';
  if (rel.endsWith('.html')) return 'html';
  if (rel.endsWith('.css')) return 'css';
  if (rel.endsWith('.md')) return 'md';
  return '';
}

function parseManifest(csvPath) {
  const text = readFileSync(csvPath, 'utf-8');
  const lines = text.split('\n').filter((l) => l.length > 0);
  if (lines[0] !== 'path,bytes,sha256') throw new Error(`bad manifest header: ${lines[0]}`);
  const rows = [];
  for (const line of lines.slice(1)) {
    const [path, bytes, sha256] = line.split(',');
    if (!path || !bytes || !sha256) throw new Error(`bad manifest row: ${line}`);
    rows.push({ path, bytes: Number(bytes), sha256 });
  }
  return rows;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = resolve(args.outDir);
  const manifestPath = resolve(args.manifest);
  const sourceZipPath = resolve(args.sourceZip);
  if (!existsSync(manifestPath)) throw new Error(`manifest not found: ${manifestPath}`);
  if (!existsSync(sourceZipPath)) throw new Error(`source zip not found: ${sourceZipPath}`);
  mkdirSync(outDir, { recursive: true });

  const manifestRows = parseManifest(manifestPath);
  const sourceZipHash = sha256Hex(readFileSync(sourceZipPath));
  const sourceZipBytes = statSync(sourceZipPath).size;
  const generatedUtc = new Date().toISOString();

  // 校验：工作区现有的源码树文件必须与清单一致（哈希与字节数）。
  // 清单是冻结快照的权威记录；不一致说明打包后源码被改动，拒绝生成。
  const treeFiles = walk(ROOT, ROOT).sort();
  const manifestSourceRows = manifestRows.filter(
    (r) => r.path !== 'edit-pact-source.zip' && r.path !== 'edit-pact-dist.zip',
  );
  const manifestPaths = new Set(manifestSourceRows.map((r) => r.path));
  const problems = [];
  for (const rel of treeFiles) {
    if (!manifestPaths.has(rel)) problems.push(`tree file not in manifest: ${rel}`);
  }
  for (const row of manifestSourceRows) {
    if (!treeFiles.includes(row.path)) {
      problems.push(`manifest file missing from tree: ${row.path}`);
      continue;
    }
    const bytes = readFileSync(join(ROOT, row.path));
    if (bytes.length !== row.bytes) problems.push(`size mismatch: ${row.path}`);
    if (sha256Hex(bytes) !== row.sha256) problems.push(`hash mismatch: ${row.path}`);
  }
  if (problems.length > 0) {
    throw new Error(`tree/manifest mismatch:\n${problems.join('\n')}`);
  }

  // 分包：按字节上限贪心分包，单个文件永不拆开。
  const packFiles = manifestSourceRows.filter((r) => inReviewPack(r.path));
  const packs = [];
  let current = [];
  let currentBytes = 0;
  for (const row of packFiles) {
    const content = readFileSync(join(ROOT, row.path), 'utf-8');
    const entry = [
      `## \`${row.path}\``,
      '',
      `- SHA-256: \`${row.sha256}\``,
      `- 字节：${row.bytes}`,
      '',
      `\`\`\`${langFor(row.path)}`,
      content,
      '```',
      '',
    ].join('\n');
    const entryBytes = Buffer.byteLength(entry, 'utf-8');
    if (current.length > 0 && currentBytes + entryBytes > args.maxBytes) {
      packs.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push({ row, entry });
    currentBytes += entryBytes;
  }
  if (current.length > 0) packs.push(current);

  const packNames = [];
  packs.forEach((pack, idx) => {
    const packNo = String(idx + 1).padStart(2, '0');
    const packName = `REVIEW_PACK_${packNo}.md`;
    const header = [
      `# P012 改稿守约 Edit Pact — 源码审查包 ${packNo}`,
      '',
      `- 发布包：\`edit-pact-source.zip\`，SHA-256 \`${sourceZipHash}\`（${sourceZipBytes} 字节）。`,
      `- 规格：SPEC 1.0.0；应用版本：${APP_VERSION}；项目：${PROJECT_ID}。`,
      `- 本包文件数：${pack.length}；共 ${packs.length} 包。`,
      `- 生成时间（UTC）：${generatedUtc}。`,
      `- 说明：以下为源码全文（UTF-8 原文），每个文件附 SHA-256，与 SOURCE_MANIFEST.csv 一致。`,
      '',
    ].join('\n');
    const body = pack.map((p) => p.entry).join('\n');
    writeFileSync(join(outDir, packName), header + body, 'utf-8');
    packNames.push(packName);
  });

  // 覆盖清单：清单全部行（含量化文件自记录行）逐一列出。
  const packOf = new Map();
  packs.forEach((pack, idx) => {
    const packName = `REVIEW_PACK_${String(idx + 1).padStart(2, '0')}.md`;
    for (const p of pack) packOf.set(p.row.path, packName);
  });
  const indexLines = [
    '# P012 改稿守约 Edit Pact — 审查索引',
    '',
    `发布包：\`edit-pact-source.zip\`，SHA-256 \`${sourceZipHash}\`。本索引与该包同一源码版本。`,
    '',
    `规格：SPEC 1.0.0；应用版本：${APP_VERSION}；项目：${PROJECT_ID}。生成时间（UTC）：${generatedUtc}。本索引随每次重新冻结重新生成；各行“实际读取覆盖”只写已实际发生的审查。`,
    '',
    '“审查包”栏为 — 表示该文件未收入审查包正文（评估数据 / 审查报告 / 文档 / 交接记录 / 规格文件只列入索引）。“实际读取覆盖”栏只写已实际发生的审查结论；未读过的文件如实标注，不冒充已审查。',
    '',
    '| 文件 | SHA-256 | 字节 | 审查包 | 实际读取覆盖 |',
    '|---|---|---|---|---|',
  ];
  for (const row of manifestRows) {
    const pack = packOf.get(row.path) ?? '—';
    const cov =
      row.path === 'edit-pact-source.zip' || row.path === 'edit-pact-dist.zip'
        ? '发布包本身（自记录行；哈希见 SHA256SUMS.txt）'
        : coverageFor(row.path);
    indexLines.push(
      `| \`${row.path}\` | \`${shortHash(row.sha256)}\` | ${row.bytes} | ${pack} | ${cov} |`,
    );
  }
  indexLines.push('');
  indexLines.push(
    `共 ${manifestRows.length} 行（含 2 行发布包自记录）；审查包 ${packs.length} 个，收录 ${packFiles.length} 个源码文件。`,
  );
  indexLines.push('');
  writeFileSync(join(outDir, 'REVIEW_INDEX.md'), indexLines.join('\n'), 'utf-8');

  console.log(
    `[build-review-packs] index + ${packs.length} pack(s), ${packFiles.length} files in packs, ${manifestRows.length} manifest rows`,
  );
  console.log(`[build-review-packs] packs: ${packNames.join(', ')}`);
}

main();
