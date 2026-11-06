/**
 * P012 改稿守约 Edit Pact — 打包进生产 JS 的第三方运行时依赖审计
 *（FIX-R2，终审 R2 P2-09）。
 *
 * 教训：FIX-R1 只按直接导入链审计，漏了 react-dom 的传递依赖
 * scheduler（实际打包进生产 JS）。本次按产物内容重审：枚举 lockfile
 * 的生产依赖树（含传递依赖），再到构建产物（dist/assets/*.js）里
 * 用标识逐个核对是否真的打包进去；同时核对 THIRD_PARTY_NOTICES.md
 * 收录的集合与许可证正文是否与实际一致。
 *
 * 判定规则：
 * - 打包进生产 JS：产物内含该包的标识（见 MARKERS），且源码静态导入链
 *   可达（react/react-dom/scheduler/zod 经 src/main.tsx 与
 *   src/domain/schema.ts；diff 经 src/core/diff.ts → Worker）。
 * - 未打包：生产依赖树里有、产物内无标识（loose-envify：Vite 以
 *   define 把 process.env.NODE_ENV 替换为 "production" 并 tree-shake
 *   掉；js-tokens：只供 loose-envify 自身构建工具使用，不随运行时发货）。
 * - 许可证正文：通知文件里每节的 ``` 代码块内容须与
 *   node_modules/<包>/LICENSE 逐字节一致（仅允许末尾一个换行符差异）。
 *
 * 用法：先 `npm run build` 保证 dist 新鲜，再跑
 *   node scripts/audit-bundled-deps.mjs [--dist <dir>]
 * 默认 dist：<工作区>/dist。任一核对失败 exit 1；只读，不改任何文件。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(join(fileURLToPath(new URL('.', import.meta.url)), '..'));

// 每个包在产物里必须出现的标识（压缩后仍保留的全局名 / 内部函数名）。
// diff 的标识是 jsdiff 内部函数名（diff/base.js 与 diff/array.js），
// 压缩后仍保留；其余标识是各包的公开 API 名或全局对象名。
const MARKERS = {
  diff: { bundle: 'diff.worker', markers: ['extractCommon', 'buildValues', 'removeEmpty'] },
  react: { bundle: 'index', markers: ['createElement', 'ReactCurrentOwner'] },
  'react-dom': { bundle: 'index', markers: ['createRoot', 'useSyncExternalStore'] },
  scheduler: { bundle: 'index', markers: ['MessageChannel', 'unstable_scheduleCallback'] },
  zod: { bundle: 'both', markers: ['ZodError'] },
};

// 生产依赖树里有、但构建会消除、不应收录的包（须在产物里找不到）。
const EXPECTED_ABSENT = ['loose-envify', 'js-tokens'];

function fail(message) {
  console.error(`[audit-bundled-deps] FAIL ${message}`);
  process.exitCode = 1;
}

function main() {
  const argv = process.argv.slice(2);
  let distDir = join(ROOT, 'dist');
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dist') distDir = resolve(argv[++i]);
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (!existsSync(distDir)) fail(`dist not found: ${distDir} (run npm run build first)`);
  if (process.exitCode) process.exit(1);

  // 1. 枚举 lockfile 的生产依赖树（根 dependencies + 传递依赖，不含 dev）。
  const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf-8'));
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
  const tree = new Map(); // name -> version
  const queue = Object.keys(pkg.dependencies ?? {});
  while (queue.length > 0) {
    const name = queue.shift();
    if (tree.has(name)) continue;
    const entry = lock.packages?.[`node_modules/${name}`];
    if (!entry) fail(`lockfile has no entry for production dep: ${name}`);
    if (process.exitCode) process.exit(1);
    tree.set(name, entry.version);
    for (const dep of Object.keys(entry.dependencies ?? {})) queue.push(dep);
  }
  console.log('[audit-bundled-deps] production tree (lockfile):');
  for (const [name, version] of [...tree.entries()].sort()) {
    console.log(`[audit-bundled-deps]   ${name}@${version}`);
  }

  // 2. 读产物。
  const assets = readdirSync(join(distDir, 'assets')).filter((f) => f.endsWith('.js'));
  const indexFile = assets.find((f) => f.startsWith('index-'));
  const workerFile = assets.find((f) => f.startsWith('diff.worker-'));
  if (!indexFile || !workerFile) fail(`expected index-*.js and diff.worker-*.js in ${join(distDir, 'assets')}`);
  if (process.exitCode) process.exit(1);
  const indexJs = readFileSync(join(distDir, 'assets', indexFile), 'utf-8');
  const workerJs = readFileSync(join(distDir, 'assets', workerFile), 'utf-8');
  const bundleOf = (kind) =>
    kind === 'index' ? indexJs : kind === 'diff.worker' ? workerJs : indexJs + workerJs;

  // 3. 逐包核对标识。
  const bundled = [];
  for (const [name, { bundle, markers }] of Object.entries(MARKERS)) {
    const text = bundleOf(bundle);
    const missing = markers.filter((m) => !text.includes(m));
    if (missing.length > 0) {
      fail(`${name}: missing markers in ${bundle} bundle: ${missing.join(', ')}`);
      continue;
    }
    if (!tree.has(name)) fail(`${name}: bundled but not in lockfile production tree`);
    bundled.push(name);
    console.log(`[audit-bundled-deps] PASS ${name}@${tree.get(name)} bundled (${bundle}: ${markers.join(', ')})`);
  }

  // 4. 应排除的包必须不在产物里。
  for (const name of EXPECTED_ABSENT) {
    if (!tree.has(name)) {
      console.log(`[audit-bundled-deps] note ${name}: not in lockfile production tree, skip absent check`);
      continue;
    }
    if (indexJs.includes(name) || workerJs.includes(name)) {
      fail(`${name}: present in production tree and found in bundle, must be listed in THIRD_PARTY_NOTICES.md`);
    } else {
      console.log(`[audit-bundled-deps] PASS ${name}@${tree.get(name)} in tree but absent from bundles (excluded)`);
    }
  }

  // 5. 通知文件：收录集合须等于实际打包集合；许可证正文逐字节一致。
  const notices = readFileSync(join(ROOT, 'THIRD_PARTY_NOTICES.md'), 'utf-8');
  // 节标题形如 `## 1. diff（jsdiff）9.0.0 — ...` 或 `## 2. react 18.3.1 — ...`：
  // 取版本号前的全部文字，去掉括号内别名后才是包名。
  const listed = [...notices.matchAll(/^## \d+\. (.+?) ?\d+\.\d+\.\d+ — /gm)].map((m) =>
    m[1].replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim(),
  );
  const missing = bundled.filter((n) => !listed.includes(n));
  const extra = listed.filter((n) => !bundled.includes(n));
  if (missing.length > 0) fail(`THIRD_PARTY_NOTICES.md missing bundled: ${missing.join(', ')}`);
  if (extra.length > 0) fail(`THIRD_PARTY_NOTICES.md lists not-bundled: ${extra.join(', ')}`);
  for (const name of bundled) {
    const version = tree.get(name);
    const licensePath = join(ROOT, 'node_modules', name, 'LICENSE');
    if (!existsSync(licensePath)) {
      fail(`${name}: no node_modules/${name}/LICENSE to compare`);
      continue;
    }
    const license = readFileSync(licensePath, 'utf-8').replace(/\n$/, '');
    const section = new RegExp(
      `^## \\d+\\. ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:（[^）]*）)? ?${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} — [^\\n]+\\n[\\s\\S]*?\n\`\`\`\n([\\s\\S]*?)\n\`\`\``,
      'm',
    );
    const m = notices.match(section);
    if (!m) {
      fail(`${name}@${version}: no license code block found in THIRD_PARTY_NOTICES.md`);
      continue;
    }
    if (m[1].replace(/\n$/, '') !== license) {
      fail(`${name}@${version}: license text in THIRD_PARTY_NOTICES.md differs from node_modules/${name}/LICENSE`);
    } else {
      console.log(`[audit-bundled-deps] PASS ${name}@${version} license text byte-identical (${license.length} bytes)`);
    }
  }

  if (process.exitCode) {
    console.error('[audit-bundled-deps] FAILED');
    process.exit(1);
  }
  console.log(`[audit-bundled-deps] all checks passed: bundled = ${bundled.join(', ')}`);
}

main();
