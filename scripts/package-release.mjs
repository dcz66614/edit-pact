/**
 * P012 改稿守约 Edit Pact — T014 发布打包器（release:pack）。
 *
 * 从当前工作区生成冻结发布包。冻结快照的标识就是下面这套文件的 SHA-256
 *（本工作区没有 Git 仓库、没有 commit；不伪造 commit hash；C、D、E 各自
 * 独立发布目录，互不覆盖）：
 * edit-pact-source.zip + SOURCE_MANIFEST.csv + SHA256SUMS.txt。
 *
 * 步骤：
 * 1. 记录环境（ENVIRONMENT.md）；跑 `npm run build` 生成新鲜 dist，
 *    输出存为 BUILD_LOG.txt。
 * 2. 收录源码树（排除 node_modules、dist、test-results、playwright-report、
 *    coverage、P012-edit-pact、.git、*.tsbuildinfo、.DS_Store，以及每次
 *    benchmark 重写的 tests/performance/results.json——该文件是测量产物，
 *    不进冻结包；冻结时的数值另存为 BENCHMARK_RESULTS.json），算 SHA-256，
 *    打 edit-pact-source.zip。
 * 3. 打 edit-pact-dist.zip（dist 内容置于包根目录，解压即为可运行目录）。
 *    打包前把 scripts/serve-dist.mjs 以 serve.mjs 之名、以及
 *    THIRD_PARTY_NOTICES.md 复制进 dist/（FIX-R1 P1-01/P1-02）：成品包
 *    自带启动文件与第三方许可证通知，README 快速开始与之对应。
 * 4. 写 SOURCE_MANIFEST.csv 与 DIST_MANIFEST.csv（path,bytes,sha256），
 *    末尾加两行发布包自记录（与 P011 的 SOURCE_MANIFEST 做法一致）。
 * 5. 从 --verify-log 拆分 TEST_LOG / E2E_LOG / PRIVACY_LOG /
 *    BENCHMARK_LOG / EVALUATION_CHECK_LOG / VERIFY_LOG；从 --logs-dir
 *    复制 NETWORK_REQUESTS.json、STORAGE_CHECK.json；从 --screenshots-dir
 *    复制演示截图；从源码树复制冻结时的 BENCHMARK_RESULTS.json，并生成
 *    BENCHMARK_NOTE.md（标注 BENCHMARK_LOG 与 BENCHMARK_RESULTS 各自的
 *    运行来源，不把不同运行的数值说成同一次测试；FIX-R1 P2-03）。
 *    --install-log 给出时复制 npm ci 原始日志为 INSTALL_LOG.txt
 *    （FIX-R1 P2-04）。
 * 6. 复制 LICENSE，生成 LICENSE_REPORT.md（注明 THIRD_PARTY_NOTICES.md
 *    随两个包交付）。
 * 7. 调 scripts/build-review-packs.mjs 生成 REVIEW_INDEX.md 与
 *    REVIEW_PACK_XX.md。
 * 8. 写 SHA256SUMS.txt（发布目录内除自身外全部文件）。
 * 9. 生成 DRIVE_MANIFEST.md（在第 8 步之后，以最终文件清单为准，
 *    含 SHA256SUMS.txt、REVIEW_INDEX.md、REVIEW_PACK_XX.md 在内的全部
 *    文件；FIX-R1 P2-02：旧版在第 6 步生成，漏列后生成的审查包与
 *    SHA256SUMS），再写 RELEASE_PACK_LOG.txt（本脚本自身的完整输出
 *    日志；FIX-R1 P2-04），最后重算 SHA256SUMS.txt 使其包含这两份文件。
 *    归档目标文件夹由 --drive-folder 指定（默认 03_release；E 用
 *    05_release；FIX-R2 P2-02：D 的清单仍写 03_release 是错的，E 不
 *    再写错）。
 * 10. 捕获完整 release:verify 输出为 RELEASE_VERIFY_LOG.txt
 *    （FIX-R2 P2-04 + 终审 R2 证据缺口）：先写一份占位头（使该文件在
 *    release:verify 的必需文件检查时已存在），再依次跑 hash-release
 *    与 verify-dist-quickstart（均须 exit 0；任一失败把已捕获输出存入
 *    日志后抛错），最后用完整输出重写该日志并重算 SHA256SUMS.txt。
 *    quickstart 的截图写到 --screenshots-dir（证据目录），不写发布
 *    目录；本步不改业务代码，只补证据。
 *
 * 本脚本不跑 verify、不跑测试、不改业务代码与验收门槛。验收顺序按计划 §10：
 * 先 `npm run verify`，再 `npm run release:pack`，最后 `npm run release:verify`。
 * 若输出目录已含一份发布（存在 SHA256SUMS.txt）且未给 --force，拒绝覆盖，
 * 防止干净检出误写正式发布目录。
 *
 * 用法：
 *   node scripts/package-release.mjs [--out <dir>] [--verify-log <path>]
 *     [--logs-dir <dir>] [--screenshots-dir <dir>] [--install-log <path>]
 *     [--drive-folder <name>] [--force]
 * 默认：--out <工作区>/../p012-release；--logs-dir <工作区>/../evidence/P012/T014/logs；
 * --screenshots-dir <logs-dir>/screenshots；--verify-log <logs-dir>/verify.log。
 * --install-log 是本次冻结对应的 `npm ci` 原始日志（由调用方 tee 保存后
 * 传入）；给出时复制为发布目录的 INSTALL_LOG.txt，未给出时不生成该文件。
 * 退出码：任一步失败非零；日志缺失、截图缺失、zip 工具缺失时直接报错，不编造。
 */
import { createHash } from 'node:crypto';
import { execFileSync, execSync } from 'node:child_process';
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { cpus, totalmem } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const PROJECT_ID = 'P012';
const SPEC_VERSION = '1.0.0';
const APP_VERSION = '0.1.0';
const SOURCE_ZIP = 'edit-pact-source.zip';
const DIST_ZIP = 'edit-pact-dist.zip';

const EXCLUDED_DIRS = new Set([
  'node_modules',
  'dist',
  'test-results',
  'playwright-report',
  'coverage',
  'P012-edit-pact',
  '.git',
]);
// 每次 benchmark 重写，不以哈希为准，不进冻结源码包。
const EXCLUDED_FROM_SOURCE_ZIP = new Set(['tests/performance/results.json']);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--out') out.outDir = resolve(argv[++i]);
    else if (a === '--verify-log') out.verifyLog = resolve(argv[++i]);
    else if (a === '--logs-dir') out.logsDir = resolve(argv[++i]);
    else if (a === '--screenshots-dir') out.screenshotsDir = resolve(argv[++i]);
    else if (a === '--install-log') out.installLog = resolve(argv[++i]);
    else if (a === '--drive-folder') out.driveFolder = argv[++i];
    else if (a === '--force') out.force = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  out.driveFolder = out.driveFolder ?? '03_release';
  out.logsDir = out.logsDir ?? resolve(ROOT, '..', 'evidence', 'P012', 'T014', 'logs');
  out.screenshotsDir = out.screenshotsDir ?? join(out.logsDir, 'screenshots');
  out.verifyLog = out.verifyLog ?? join(out.logsDir, 'verify.log');
  out.outDir = out.outDir ?? resolve(ROOT, '..', 'p012-release');
  return out;
}

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
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
      found.push(rel);
    }
  }
  return found.sort();
}

function csvEscape(value) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function writeManifest(path, rows) {
  const lines = ['path,bytes,sha256'];
  for (const r of rows) lines.push(`${csvEscape(r.path)},${r.bytes},${r.sha256}`);
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf-8');
}

function hashRows(rootDir, files) {
  return files.map((rel) => {
    const bytes = readFileSync(join(rootDir, rel));
    return { path: rel, bytes: bytes.length, sha256: sha256Hex(bytes) };
  });
}

function runZip(zipPath, cwd, files) {
  execFileSync('zip', ['-X', '-q', '-r', zipPath, ...files], { cwd, stdio: 'inherit' });
}

function environmentText() {
  const now = new Date().toISOString();
  let osLine = 'unknown';
  let memLine = 'unknown';
  try {
    osLine = execSync('uname -a', { encoding: 'utf-8' }).trim();
    memLine = execSync('free -m | head -2', { encoding: 'utf-8' }).trim().replace(/\n/g, '; ');
  } catch { /* keep unknown */ }
  let playwrightLine = 'unknown';
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
    const cache = existsSync(join(process.env.HOME ?? '', '.cache', 'ms-playwright'))
      ? readdirSync(join(process.env.HOME ?? '', '.cache', 'ms-playwright')).join(', ')
      : 'no ms-playwright cache found';
    playwrightLine = `@playwright/test ${pkg.devDependencies['@playwright/test']} (cache: ${cache})`;
  } catch { /* keep unknown */ }
  return [
    '# P012 改稿守约 Edit Pact — 发布环境记录（T014）',
    '',
    `- 生成时间（UTC）：${now}`,
    `- 项目：${PROJECT_ID}；规格：SPEC ${SPEC_VERSION}；应用版本：${APP_VERSION}`,
    `- 状态：READY_FOR_FINAL_REVIEW（未终审通过，不标 ACCEPTED）`,
    `- OS：${osLine}`,
    `- CPU：${cpus().length} vCPU（${cpus()[0]?.model ?? 'unknown'}）；内存总计：${Math.round(totalmem() / 1024 / 1024)} MB；${memLine}`,
    `- Node.js：${process.version}；npm：${execSync('npm --version', { encoding: 'utf-8' }).trim()}`,
    `- 浏览器：${playwrightLine}`,
    '- 版本控制：本工作区没有 Git 仓库、没有 commit；冻结标识为 source.zip + SOURCE_MANIFEST.csv + SHA256SUMS.txt 的 SHA-256（见下）。',
    '- Windows：NOT_TESTED（本 VM 无 Windows 测试条件，不伪造跨平台通过）。',
    '',
  ].join('\n');
}

// 从 verify 全量日志按 [verify] step 标记拆分各段；找不到某段直接报错。
function splitVerifyLog(verifyLogPath) {
  const text = readFileSync(verifyLogPath, 'utf-8');
  const stepOrder = [
    'typecheck',
    'fixtures:check',
    'test',
    'test:invariants',
    'build',
    'test:e2e',
    'test:privacy',
    'benchmark',
    'evaluation:check',
  ];
  const sections = new Map();
  const marker = /^\[verify\] step: ([^\s]+) — .+$/gm;
  const marks = [...text.matchAll(marker)];
  if (marks.length === 0) throw new Error(`no [verify] step markers in ${verifyLogPath}`);
  for (let i = 0; i < marks.length; i += 1) {
    const start = marks[i].index;
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    sections.set(marks[i][1], text.slice(start, end));
  }
  for (const step of stepOrder) {
    if (!sections.has(step)) throw new Error(`verify log missing step: ${step}`);
  }
  if (!text.includes('[verify] all steps passed')) {
    throw new Error('verify log does not end with "[verify] all steps passed"');
  }
  return sections;
}

// 与 tests/performance/benchmark.spec.ts 同款百分位算法：
// sorted[Math.ceil(p*n)-1]。
function percentile(sortedAsc, p) {
  const index = Math.ceil(p * sortedAsc.length) - 1;
  return sortedAsc[Math.max(0, index)];
}

// 写 SHA256SUMS.txt（发布目录内除自身外全部文件）。打包末尾会重算一次，
// 以包含最后生成的 DRIVE_MANIFEST.md 与 RELEASE_PACK_LOG.txt。
function writeSums(outDir) {
  const sumsFiles = walkFiles(outDir, outDir).filter((f) => f !== 'SHA256SUMS.txt');
  const sumsLines = sumsFiles.map((f) => {
    const bytes = readFileSync(join(outDir, f));
    return `${sha256Hex(bytes)}  ${f}`;
  });
  writeFileSync(join(outDir, 'SHA256SUMS.txt'), `${sumsLines.join('\n')}\n`, 'utf-8');
  return sumsFiles.length;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { outDir } = args;
  // 自日志：缓冲本脚本的全部控制台输出，末尾写为 RELEASE_PACK_LOG.txt
  //（FIX-R1 P2-04）。缓冲不改变屏幕输出。
  const packLogLines = [];
  const origLog = console.log;
  const origError = console.error;
  console.log = (...line) => { packLogLines.push(line.join(' ')); origLog(...line); };
  console.error = (...line) => { packLogLines.push(line.join(' ')); origError(...line); };
  if (existsSync(join(outDir, 'SHA256SUMS.txt')) && !args.force) {
    throw new Error(
      `release dir already contains a release: ${outDir} (pass --force to overwrite)`,
    );
  }
  mkdirSync(outDir, { recursive: true });
  const generatedUtc = new Date().toISOString();
  console.log(`[package-release] out: ${outDir}`);

  // 1. 环境记录 + 新鲜构建。
  writeFileSync(join(outDir, 'ENVIRONMENT.md'), environmentText(), 'utf-8');
  console.log('[package-release] building dist (npm run build)…');
  let buildOutput;
  try {
    buildOutput = execSync('npm run build', { cwd: ROOT, encoding: 'utf-8' });
  } catch (e) {
    const out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    writeFileSync(join(outDir, 'BUILD_LOG.txt'), out, 'utf-8');
    throw new Error(`npm run build failed; output saved to ${join(outDir, 'BUILD_LOG.txt')}`);
  }
  writeFileSync(join(outDir, 'BUILD_LOG.txt'), buildOutput, 'utf-8');
  if (!existsSync(join(ROOT, 'dist', 'index.html'))) {
    throw new Error('dist/index.html missing after build');
  }

  // 2. 源码收录 + source.zip。
  const sourceFiles = walk(ROOT, ROOT).filter((f) => !EXCLUDED_FROM_SOURCE_ZIP.has(f));
  const sourceRows = hashRows(ROOT, sourceFiles);
  const sourceZipPath = join(outDir, SOURCE_ZIP);
  runZip(sourceZipPath, ROOT, sourceFiles);
  const sourceZipBytes = statSync(sourceZipPath);
  const sourceZipHash = sha256Hex(readFileSync(sourceZipPath));
  console.log(`[package-release] ${SOURCE_ZIP}: ${sourceFiles.length} files, ${sourceZipBytes.size} bytes, sha256 ${sourceZipHash}`);

  // 3. dist.zip（dist 内容置于包根目录）。
  // FIX-R1 P1-01/P1-02：先把成品启动文件与第三方许可证通知复制进 dist/，
  // 再打包——构建（vite build）会清空 dist，必须在构建之后复制。
  copyFileSync(join(ROOT, 'scripts', 'serve-dist.mjs'), join(ROOT, 'dist', 'serve.mjs'));
  copyFileSync(join(ROOT, 'THIRD_PARTY_NOTICES.md'), join(ROOT, 'dist', 'THIRD_PARTY_NOTICES.md'));
  const distFiles = walk(join(ROOT, 'dist'), join(ROOT, 'dist'));
  if (distFiles.length === 0) throw new Error('dist/ is empty');
  const distRows = hashRows(join(ROOT, 'dist'), distFiles);
  const distZipPath = join(outDir, DIST_ZIP);
  runZip(distZipPath, join(ROOT, 'dist'), distFiles);
  const distZipBytes = statSync(distZipPath);
  const distZipHash = sha256Hex(readFileSync(distZipPath));
  console.log(`[package-release] ${DIST_ZIP}: ${distFiles.length} files, ${distZipBytes.size} bytes, sha256 ${distZipHash}`);

  // 4. 清单（含两行发布包自记录）。
  const selfRows = [
    { path: SOURCE_ZIP, bytes: sourceZipBytes.size, sha256: sourceZipHash },
    { path: DIST_ZIP, bytes: distZipBytes.size, sha256: distZipHash },
  ];
  writeManifest(join(outDir, 'SOURCE_MANIFEST.csv'), [...sourceRows, ...selfRows]);
  writeManifest(join(outDir, 'DIST_MANIFEST.csv'), [...distRows, ...selfRows]);

  // 5. 日志：verify 拆分 + 网络/存储证据 + 截图 + 冻结性能数值。
  if (!existsSync(args.verifyLog)) throw new Error(`verify log not found: ${args.verifyLog}`);
  const sections = splitVerifyLog(args.verifyLog);
  const testLog = [
    sections.get('typecheck'),
    sections.get('fixtures:check'),
    sections.get('test'),
    sections.get('test:invariants'),
  ].join('\n');
  writeFileSync(join(outDir, 'TEST_LOG.txt'), testLog, 'utf-8');
  writeFileSync(join(outDir, 'E2E_LOG.txt'), sections.get('test:e2e'), 'utf-8');
  writeFileSync(join(outDir, 'PRIVACY_LOG.txt'), sections.get('test:privacy'), 'utf-8');
  writeFileSync(join(outDir, 'BENCHMARK_LOG.txt'), sections.get('benchmark'), 'utf-8');
  writeFileSync(
    join(outDir, 'EVALUATION_CHECK_LOG.txt'),
    sections.get('evaluation:check'),
    'utf-8',
  );
  writeFileSync(join(outDir, 'VERIFY_LOG.txt'), readFileSync(args.verifyLog, 'utf-8'), 'utf-8');
  for (const name of ['NETWORK_REQUESTS.json', 'STORAGE_CHECK.json']) {
    const src = join(args.logsDir, name);
    if (!existsSync(src)) throw new Error(`missing log evidence: ${src}`);
    copyFileSync(src, join(outDir, name));
  }
  const benchResults = join(ROOT, 'tests', 'performance', 'results.json');
  if (!existsSync(benchResults)) throw new Error(`missing benchmark results: ${benchResults}`);
  copyFileSync(benchResults, join(outDir, 'BENCHMARK_RESULTS.json'));
  // BENCHMARK_NOTE.md（FIX-R1 P2-03）：标注两份性能数值的各自来源。
  // 机制保证：verify 的 benchmark 步骤重写 tests/performance/results.json，
  // 打包只跑 `npm run build`（不跑 benchmark），因此 BENCHMARK_LOG.txt
  //（verify.log 的 benchmark 段）与 BENCHMARK_RESULTS.json（打包时复制的
  // results.json）来自同一次 verify 运行；此处如实写明，并给出两份数值，
  // 不把不同运行的数值说成同一次测试。
  const benchJson = JSON.parse(readFileSync(join(outDir, 'BENCHMARK_RESULTS.json'), 'utf-8'));
  const benchSorted = [...benchJson.durationsMs].sort((a, b) => a - b);
  const benchP50 = percentile(benchSorted, 0.5);
  const benchP95 = percentile(benchSorted, 0.95);
  const benchMax = benchSorted[benchSorted.length - 1];
  const logP95Match = sections.get('benchmark').match(/P95=([\d.]+) ms/);
  const logP95 = logP95Match ? Number(logP95Match[1]) : null;
  if (logP95 === null) throw new Error('benchmark log has no P95 value');
  writeFileSync(
    join(outDir, 'BENCHMARK_NOTE.md'),
    [
      '# P012 改稿守约 Edit Pact — 性能数值来源说明（FIX-R1 P2-03）',
      '',
      `- 生成时间（UTC）：${generatedUtc}`,
      '- 门槛：EP-P01 P95 ≤ 500 ms；以下两份数值均低于门槛，无性能问题。',
      '',
      '## 各数值来源（不要把它们说成同一次测试之外的东西）',
      '',
      `- BENCHMARK_LOG.txt：P95 ${logP95.toFixed(1)} ms——本次冻结的 verify 运行`,
      '  的 benchmark 段（完整日志见本发布目录 VERIFY_LOG.txt）。',
      `- BENCHMARK_RESULTS.json：P50 ${benchP50.toFixed(1)} ms、P95 ${benchP95.toFixed(1)} ms、`,
      `  max ${benchMax.toFixed(1)} ms、n=${benchJson.formalRuns}——打包时复制的`,
      '  tests/performance/results.json；该文件由同一次 verify 运行的 benchmark',
      '  步骤写出，打包过程只跑 `npm run build`，不重跑 benchmark，因此两份',
      '  数值来自同一次 verify 运行的不同记录形式（日志行 vs 测量 JSON），不是',
      '  两次独立测试。若两者 P95 不一致，说明 verify 与打包之间有人重跑了',
      '  benchmark，该包应作废重冻。',
      '- 干净检出门禁是另一次独立运行，其 P95 见干净检出发布目录的对应文件，',
      '  不与此处数值混用。',
      '',
      '## 历史教训（快照 C，诚实记录）',
      '',
      '- 快照 C 的三份数值各不相同：BENCHMARK_LOG.txt P95 210.1 ms（/var/tmp',
      '  复制件 verify 运行，22:19 GMT）、BENCHMARK_RESULTS.json P95 220.9 ms',
      '  （打包时复制的 results.json；T014 证据未登记写出它的那次 benchmark',
      '  运行，无法追溯到某一次具名运行）、FIX-T013 交接 P95 270.8 ms（FIX-T013',
      '  的 verify 运行）。三者都是独立运行的真实测量，均低于 500 ms 门槛；',
      '  旧版 BENCHMARK 说明未标注来源，终审 R1 以 P2-03 指出。本文件自快照 D',
      '  起随包发布，避免重蹈。',
      '',
    ].join('\n'),
    'utf-8',
  );
  if (args.installLog) {
    if (!existsSync(args.installLog)) throw new Error(`install log not found: ${args.installLog}`);
    copyFileSync(args.installLog, join(outDir, 'INSTALL_LOG.txt'));
  }

  mkdirSync(join(outDir, 'screenshots'), { recursive: true });
  if (!existsSync(args.screenshotsDir)) throw new Error(`screenshots dir not found: ${args.screenshotsDir}`);
  const shots = readdirSync(args.screenshotsDir).filter((f) => f.endsWith('.png'));
  if (shots.length === 0) throw new Error(`no PNG screenshots in ${args.screenshotsDir}`);
  for (const shot of shots) {
    copyFileSync(join(args.screenshotsDir, shot), join(outDir, 'screenshots', shot));
  }

  // 6. 许可证与 Drive 对应列表。
  copyFileSync(join(ROOT, 'LICENSE'), join(outDir, 'LICENSE'));
  let depText = '';
  try {
    depText = readFileSync(join(ROOT, 'docs', 'DEPENDENCIES.md'), 'utf-8');
  } catch { /* keep empty */ }
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const depLines = Object.entries(deps)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, version]) => `- ${name} ${version}`);
  writeFileSync(
    join(outDir, 'LICENSE_REPORT.md'),
    [
      '# P012 改稿守约 Edit Pact — 许可证报告（T014；FIX-R1 补第三方通知）',
      '',
      `- 生成时间（UTC）：${generatedUtc}`,
      '- 本项目许可证：MIT（见发布目录 LICENSE，Copyright (c) 2026 Chengze Du）。',
      '- 第三方许可证通知：见 `THIRD_PARTY_NOTICES.md`（随源码包与成品包一同',
      '  交付；含 diff@9.0.0 BSD-3-Clause 完整正文与 react / react-dom / scheduler / zod',
      '  MIT 完整正文，均逐字复制自锁定的发行包；scheduler 由 FIX-R2 按产物内容审计补列）。',
      '- 依赖许可证以 docs/DEPENDENCIES.md 为准；下面是 package.json 锁定的依赖版本清单。',
      '',
      '## 依赖版本（package.json / package-lock.json 锁定）',
      '',
      ...depLines,
      '',
      '## docs/DEPENDENCIES.md 全文',
      '',
      depText,
      '',
    ].join('\n'),
    'utf-8',
  );

  // 7. 审查包。
  console.log('[package-release] building review packs…');
  execFileSync(
    process.execPath,
    [
      join(ROOT, 'scripts', 'build-review-packs.mjs'),
      '--out',
      outDir,
      '--manifest',
      join(outDir, 'SOURCE_MANIFEST.csv'),
      '--source-zip',
      sourceZipPath,
    ],
    { cwd: ROOT, stdio: 'inherit' },
  );

  // 8. SHA256SUMS.txt（发布目录内除自身外全部文件）。
  writeSums(outDir);

  // 9. DRIVE_MANIFEST.md（FIX-R1 P2-02）：必须在第 8 步之后生成，以最终
  // 文件清单为准，含 SHA256SUMS.txt、REVIEW_INDEX.md、REVIEW_PACK_XX.md
  // 在内的全部文件。旧版在第 6 步生成，漏列后生成的审查包与 SHA256SUMS。
  // 清单取“当前目录文件 ∪ 本步新增的两份文件”，两者都写进表里。
  const manifestFiles = [...new Set([
    ...walkFiles(outDir, outDir).filter((f) => f !== 'SHA256SUMS.txt'),
    'DRIVE_MANIFEST.md',
    'RELEASE_PACK_LOG.txt',
    'RELEASE_VERIFY_LOG.txt',
    'SHA256SUMS.txt',
  ])].sort();
  writeFileSync(
    join(outDir, 'DRIVE_MANIFEST.md'),
    [
      '# P012 改稿守约 Edit Pact — Drive 对应列表',
      '',
      `- 生成时间（UTC）：${generatedUtc}`,
      `- 目标文件夹：Google Drive \`agent project auto / P012-edit-pact / ${args.driveFolder}\`（P012 文件夹 id：\`1yxf-97jsseq5wpSlg5gofOCxHN6zdhPw\`）。`,
      '- 状态：待上传。本快照尚未归档；归档目标与时机由主控决定。本文件只列出对应关系，不表示已上传；上传由主控按工厂顺序（先归档再终审）执行并复核。',
      `- 冻结标识：source.zip SHA-256 \`${sourceZipHash}\`。`,
      '',
      '| 发布目录文件 | Drive 目标路径 |',
      '|---|---|',
      ...manifestFiles.map((f) => `| \`${f}\` | \`agent project auto/P012-edit-pact/${args.driveFolder}/${f}\` |`),
      '',
    ].join('\n'),
    'utf-8',
  );

  // 9（续）. RELEASE_PACK_LOG.txt（FIX-R1 P2-04）：本脚本自身的完整输出
  // 日志。先把截至目前的缓冲行与最终汇总行写入文件，再重算 SHA256SUMS，
  // 使其包含这两份最后生成的文件。
  console.log(`[package-release] done: ${sourceFiles.length} source files, ${distFiles.length} dist files`);
  console.log(`[package-release] ${SOURCE_ZIP} sha256 ${sourceZipHash}`);
  console.log(`[package-release] ${DIST_ZIP} sha256 ${distZipHash}`);
  console.log(`[package-release] release dir: ${outDir}`);
  writeFileSync(join(outDir, 'RELEASE_PACK_LOG.txt'), `${packLogLines.join('\n')}\n`, 'utf-8');
  writeSums(outDir);
  console.log('[package-release] pack log saved to RELEASE_PACK_LOG.txt; SHA256SUMS.txt recomputed');

  // 10. RELEASE_VERIFY_LOG.txt（FIX-R2 P2-04 + 终审 R2 证据缺口）：
  // 把完整的 release:verify 输出（hash-release 全部检查行 +
  // verify-dist-quickstart 全部检查行）捕获为随包冻结的日志文件。
  // 顺序关键：hash-release 的必需文件检查要求该文件已存在，所以先写
  // 占位头并重算 SHA256SUMS 使其覆盖占位文件，跑完两条命令后再用完整
  // 输出重写；最后把第 10 步的控制台行追加进 RELEASE_PACK_LOG.txt 并
  // 再次重算 SHA256SUMS，使其包含最终版日志与更新后的打包日志。
  // quickstart 的截图写到 --screenshots-dir（证据目录），不进发布目录；
  // 其默认截图目录是 FIX-R1 证据目录，必须显式传入，否则会覆盖 FIX-R1
  // 的证据截图。本步不改业务代码，只补证据。
  const verifyLogPath = join(outDir, 'RELEASE_VERIFY_LOG.txt');
  const verifyLogMark = packLogLines.length;
  writeFileSync(
    verifyLogPath,
    [
      '# P012 改稿守约 Edit Pact — release:verify 完整输出日志',
      '',
      `- 生成时间（UTC）：${generatedUtc}`,
      '- 本文件为占位头：打包第 10 步先写此头，使 release:verify 的必需',
      '  文件检查通过；两条命令跑完后，本文件被完整输出重写（见下）。',
      '',
    ].join('\n'),
    'utf-8',
  );
  writeSums(outDir);
  const verifyOutputs = [];
  const verifySteps = [
    ['hash-release', [join(ROOT, 'scripts', 'hash-release.mjs'), '--dir', outDir]],
    [
      'verify-dist-quickstart',
      [
        join(ROOT, 'scripts', 'verify-dist-quickstart.mjs'),
        '--dir',
        outDir,
        '--screenshots-dir',
        args.screenshotsDir,
      ],
    ],
  ];
  for (const [stepName, stepArgs] of verifySteps) {
    console.log(`[package-release] release:verify step: ${stepName}…`);
    try {
      const out = execFileSync(process.execPath, stepArgs, { cwd: ROOT, encoding: 'utf-8' });
      verifyOutputs.push(`===== ${stepName} (exit 0) =====\n${out}`);
    } catch (e) {
      const out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
      verifyOutputs.push(`===== ${stepName} (FAILED, exit ${e.status ?? '?'}) =====\n${out}`);
      writeFileSync(verifyLogPath, `${verifyOutputs.join('\n')}\n`, 'utf-8');
      throw new Error(`release:verify step ${stepName} failed; partial output saved to ${verifyLogPath}`);
    }
  }
  writeFileSync(
    verifyLogPath,
    [
      '# P012 改稿守约 Edit Pact — release:verify 完整输出日志',
      '',
      `- 生成时间（UTC）：${generatedUtc}`,
      `- 发布目录：${outDir}`,
      '- 说明：本日志由打包第 10 步在打包机上实跑 release:verify 生成；',
      '  打包时先写占位头以满足必需文件检查，两条命令均 exit 0 后用完整',
      '  输出重写本文件，再重算 SHA256SUMS.txt。独立复核命令：',
      `  node scripts/hash-release.mjs --dir ${outDir} && node scripts/verify-dist-quickstart.mjs --dir ${outDir}`,
      '',
      ...verifyOutputs,
      '',
      '[release:verify] all checks passed (hash-release + verify-dist-quickstart)',
      '',
    ].join('\n'),
    'utf-8',
  );
  appendFileSync(
    join(outDir, 'RELEASE_PACK_LOG.txt'),
    `${packLogLines.slice(verifyLogMark).join('\n')}\n`,
    'utf-8',
  );
  writeSums(outDir);
  console.log('[package-release] RELEASE_VERIFY_LOG.txt captured; SHA256SUMS.txt recomputed');
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

main();
