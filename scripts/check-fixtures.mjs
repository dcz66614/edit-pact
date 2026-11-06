/**
 * P012 T002 — fixture 独立校验器。
 *
 * 用法：node scripts/check-fixtures.mjs（或 npm run fixtures:check）
 * 校验 tests/fixtures/EP-F01..EP-F24 与 tests/fixtures/perf/EP-P01：
 *  - case.json 结构与 kind/outcome 一致性（与 schema.ts 的 Zod 规则镜像）
 *  - 文件存在性与 expected.txt 存在规则（成功+有文字才要求 expected.txt）
 *  - 严格 UTF-8、无不成对 surrogate、行尾（仅 F13 允许 CRLF）
 *  - 长度上限（12000 UTF-16 单元 / 200 段），validation 案例反向核对
 *    其声明的违规确实成立
 *  - 保护范围：非空、在界内、位于非空白段、paragraphId 与所在段一致
 *  - 决定区间：升序、不重叠、在界内；accepted 的 newText 出现在改稿中；
 *    已接受决定不得与保护范围重叠
 *  - 独立 oracle：按决定区间对规范化原稿做朴素拼接，结果必须与
 *    手写 expected.txt 逐字节相等（oracle 不使用生产 diff 算法）
 *  - 每处保护文字都出现在 expected.txt 中（必要非充分检查）
 *  - workflow 动作结构与 v2 文件；EP-P01 冻结哈希与计量
 *
 * 全部失败汇总后以非零退出；任一失败即整体 FAIL。
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'tests', 'fixtures');
const MAX_TEXT_UNITS = 12000;
const MAX_PARAGRAPHS = 200;
const MAX_FILE_BYTES = 100 * 1024;

const utf8 = new TextDecoder('utf-8', { fatal: true });
const errors = [];
let checked = 0;
let passed = 0;

function fail(id, msg) {
  errors.push(`${id}: ${msg}`);
}
function readStrict(file) {
  const buf = readFileSync(file);
  return utf8.decode(buf);
}
function canonicalize(text) {
  return text.replace(/\r\n?/g, '\n');
}
function hasUnpairedSurrogate(text) {
  return /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text);
}
function paragraphs(text) {
  const out = [];
  let start = 0;
  for (const part of text.split('\n')) {
    out.push({ id: `p${out.length + 1}`, start, end: start + part.length, text: part, isBlank: part.trim().length === 0 });
    start += part.length + 1;
  }
  return out;
}
function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}
/**
 * 已接受决定是否与保护范围冲突（FIX-T013-11）：非空决定用严格重叠；
 * 零长决定（纯插入点 [a,a)）按项目书 §8.3 纯插入规则，用端点包含
 * 判定（s<=a<=e）——落在保护起/止点的插入同样会被生产 classifyHunks
 * 判冲突。原先一律用 overlaps()，零长决定在端点处会漏报。
 */
function decisionOverlapsProtection(d, p) {
  if (d.start === d.end) {
    return p.start <= d.start && d.start <= p.end;
  }
  return overlaps(d, p);
}
/** 独立朴素拼接 oracle：决定区间升序应用，接受则替换为 newText，否则保留原文。 */
function oracle(original, decisionList) {
  const sorted = [...decisionList].sort((a, b) => a.start - b.start || a.end - b.end);
  let out = '';
  let cursor = 0;
  for (const d of sorted) {
    out += original.slice(cursor, d.start);
    out += d.decision === 'accepted' ? d.newText : original.slice(d.start, d.end);
    cursor = d.end;
  }
  out += original.slice(cursor);
  return out;
}
function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function checkCase(dir) {
  checked++;
  const id = dir;
  const casePath = path.join(FIX, dir, 'case.json');
  let c;
  try {
    c = JSON.parse(readStrict(casePath));
  } catch (e) {
    fail(id, `case.json 无法解析: ${e.message}`);
    return;
  }
  const local = [];
  const err = (m) => local.push(m);
  if (c.id !== id) err(`case.json id ${c.id} 与目录名 ${id} 不一致`);
  if (!['compose', 'validation', 'workflow'].includes(c.kind)) err(`未知 kind: ${c.kind}`);
  if (!['success', 'error', 'state'].includes(c.expectedOutcome)) err(`未知 expectedOutcome: ${c.expectedOutcome}`);
  if (c.expectedOutcome === 'error' && !c.expectedErrorCode) err('error outcome 缺少 expectedErrorCode');
  if (c.expectedOutcome === 'state' && !c.expectedState) err('state outcome 缺少 expectedState');
  if (c.expectedOutcome === 'success' && (c.expectedErrorCode || c.expectedState)) err('success outcome 不应带 expectedErrorCode/expectedState');
  if (c.kind === 'validation' && c.expectedOutcome !== 'error') err('validation kind 必须预期 error');
  if (c.kind === 'compose' && c.expectedOutcome === 'state') err('compose kind 不能预期 state');
  if (!Array.isArray(c.actions) || c.actions.length === 0) err('actions 为空或缺失');

  // ---- 读取原稿/改稿（严格 UTF-8 + 规范化） ----
  let origRaw = null;
  let orig = null;
  let cand = null;
  try {
    origRaw = readStrict(path.join(FIX, dir, c.originalFile));
    if (hasUnpairedSurrogate(origRaw)) err('original.txt 含不成对 surrogate');
    if (c.lineEndings === 'CRLF') {
      if (!origRaw.includes('\r\n')) err('lineEndings=CRLF 但 original.txt 无 CRLF');
    } else if (origRaw.includes('\r')) {
      err('original.txt 含 CR，但 lineEndings 未声明 CRLF');
    }
    orig = canonicalize(origRaw);
  } catch (e) {
    err(`original.txt 读取失败: ${e.message}`);
  }
  if (c.candidateFile) {
    try {
      const candRaw = readStrict(path.join(FIX, dir, c.candidateFile));
      if (hasUnpairedSurrogate(candRaw)) err('candidate.txt 含不成对 surrogate');
      if (c.lineEndings === 'CRLF') {
        if (!candRaw.includes('\r\n')) err('lineEndings=CRLF 但 candidate.txt 无 CRLF');
      } else if (candRaw.includes('\r')) {
        err('candidate.txt 含 CR，但 lineEndings 未声明 CRLF');
      }
      cand = canonicalize(candRaw);
    } catch (e) {
      err(`candidate.txt 读取失败: ${e.message}`);
    }
  }
  if (orig === null) {
    fail(id, local.join('；'));
    return;
  }
  const paras = paragraphs(orig);
  if (c.kind !== 'validation') {
    if (orig.length > MAX_TEXT_UNITS) err(`原稿 ${orig.length} 单元超过上限 ${MAX_TEXT_UNITS}`);
    if (paras.length > MAX_PARAGRAPHS) err(`原稿 ${paras.length} 段超过上限 ${MAX_PARAGRAPHS}`);
    if (orig.length === 0) err('原稿为空（EMPTY_ORIGINAL）');
  }

  // ---- validation 案例：声明的违规必须确实成立 ----
  if (c.kind === 'validation') {
    if (c.expectedErrorCode !== 'INVALID_INPUT') err('validation 案例的 expectedErrorCode 应为 INVALID_INPUT');
    if (!c.expectedIssueCode) err('validation 案例缺少 expectedIssueCode');
    const issue = c.expectedIssueCode;
    if (issue === 'TOO_LONG' && orig.length <= MAX_TEXT_UNITS) err('TOO_LONG 声明但原稿未超限');
    if (issue === 'EMPTY_ORIGINAL' && orig.length !== 0) err('EMPTY_ORIGINAL 声明但原稿非空');
    if (issue === 'TOO_MANY_PARAGRAPHS' && paras.length <= MAX_PARAGRAPHS) err('TOO_MANY_PARAGRAPHS 声明但段数未超限');
    if (issue === 'FILE_TOO_LARGE') {
      const bytes = statSync(path.join(FIX, dir, c.originalFile)).size;
      if (bytes <= MAX_FILE_BYTES) err('FILE_TOO_LARGE 声明但文件未超 100 KiB');
    }
  }

  // ---- 保护范围 ----
  let protections = [];
  if (c.protectionsFile) {
    try {
      const pf = JSON.parse(readStrict(path.join(FIX, dir, c.protectionsFile)));
      if (pf.version !== '1.0.0') err('protections.json version 不是 1.0.0');
      protections = pf.protections ?? [];
      for (const p of protections) {
        if (!(p.end > p.start)) err(`保护 ${p.id} 为空区间`);
        if (p.start < 0 || p.end > orig.length) err(`保护 ${p.id} [${p.start},${p.end}) 越界（原稿长 ${orig.length}）`);
        const para = paras.find((q) => p.start >= q.start && p.start < q.end);
        if (!para) err(`保护 ${p.id} 起点不在任何段内`);
        else {
          if (para.id !== p.paragraphId) err(`保护 ${p.id} paragraphId ${p.paragraphId} 与所在段 ${para.id} 不符`);
          if (para.isBlank) err(`保护 ${p.id} 位于空白段`);
          if (p.end > para.end) err(`保护 ${p.id} 跨段（保护不得跨段）`);
        }
      }
    } catch (e) {
      err(`protections.json 读取/解析失败: ${e.message}`);
    }
  }

  // ---- 决定区间 ----
  let decisionList = [];
  if (c.decisionsFile) {
    try {
      const df = JSON.parse(readStrict(path.join(FIX, dir, c.decisionsFile)));
      if (df.version !== '1.0.0') err('decisions.json version 不是 1.0.0');
      decisionList = df.decisions ?? [];
      const sorted = [...decisionList].sort((a, b) => a.start - b.start || a.end - b.end);
      for (let i = 0; i < sorted.length; i++) {
        const d = sorted[i];
        if (d.end < d.start) err(`决定 [${d.start},${d.end}) end < start`);
        if (d.start < 0 || d.end > orig.length) err(`决定 [${d.start},${d.end}) 越界（原稿长 ${orig.length}）`);
        if (i > 0 && d.start < sorted[i - 1].end) err(`决定区间重叠：[${d.start},${d.end}) 与 [${sorted[i - 1].start},${sorted[i - 1].end})`);
        if (d.decision === 'accepted') {
          if (typeof d.newText !== 'string') err(`已接受决定 [${d.start},${d.end}) 缺少 newText`);
          else if (cand !== null && d.newText.length > 0 && !cand.includes(d.newText)) {
            err(`已接受决定 [${d.start},${d.end}) 的 newText 未出现在改稿中`);
          }
          for (const p of protections) {
            if (decisionOverlapsProtection(d, p)) err(`已接受决定 [${d.start},${d.end}) 与保护 ${p.id} [${p.start},${p.end}) 重叠（应为 blocked，不得接受）`);
          }
        }
      }
    } catch (e) {
      err(`decisions.json 读取/解析失败: ${e.message}`);
    }
  }

  // ---- expected.txt 存在规则与 oracle ----
  const expectedPath = path.join(FIX, dir, 'expected.txt');
  const needsExpected = c.kind === 'compose' && c.expectedOutcome === 'success' && c.hasText;
  if (needsExpected) {
    if (!existsSync(expectedPath)) err('缺少 expected.txt（成功+有文字案例必须提供）');
    else {
      let expected;
      try {
        expected = readStrict(expectedPath);
      } catch (e) {
        err(`expected.txt 读取失败: ${e.message}`);
      }
      if (expected !== undefined) {
        if (hasUnpairedSurrogate(expected)) err('expected.txt 含不成对 surrogate');
        if (expected.includes('\r')) err('expected.txt 含 CR（应为 LF 规范化形式）');
        const got = oracle(orig, decisionList);
        if (got !== expected) {
          err(`oracle 结果与 expected.txt 不一致（oracle 长 ${got.length}，expected 长 ${expected.length}）`);
        }
        for (const p of protections) {
          const text = orig.slice(p.start, p.end);
          if (!expected.includes(text)) err(`保护文字 ${p.id}「${text}」未出现在 expected.txt 中`);
        }
      }
    }
  } else if (existsSync(expectedPath)) {
    err('不应提供 expected.txt（仅成功+有文字案例提供）');
  }

  // ---- workflow 动作结构与 v2 文件 ----
  if (c.kind === 'workflow') {
    const known = new Set(['analyze', 'applyDecisions', 'compose', 'validate', 'changeOriginal', 'changeCandidate', 'changeProtections', 'cancel', 'clear', 'lateResponse', 'keepRemaining', 'export']);
    for (const a of c.actions) {
      if (!known.has(a.type)) err(`未知动作类型：${a.type}`);
      if (a.type === 'analyze' && (typeof a.revision !== 'number' || !a.jobId)) err('analyze 动作缺少 revision/jobId');
      if (['changeOriginal', 'changeCandidate', 'changeProtections'].includes(a.type)) {
        if (typeof a.revision !== 'number' || !a.file) err(`${a.type} 动作缺少 revision/file`);
        else if (!existsSync(path.join(FIX, dir, a.file))) err(`${a.type} 引用的文件缺失：${a.file}`);
        else {
          try {
            const v2 = canonicalize(readStrict(path.join(FIX, dir, a.file)));
            if (a.type !== 'changeProtections' && v2.length > MAX_TEXT_UNITS) err(`${a.file} 超过长度上限`);
            if (a.type === 'changeProtections') {
              const pf = JSON.parse(readStrict(path.join(FIX, dir, a.file)));
              for (const p of pf.protections ?? []) {
                if (!(p.end > p.start) || p.start < 0 || p.end > orig.length) err(`v2 保护 ${p.id} 区间无效`);
              }
            }
          } catch (e) {
            err(`${a.file} 读取失败: ${e.message}`);
          }
        }
      }
      if (a.type === 'cancel' && !a.jobId) err('cancel 动作缺少 jobId');
      if (a.type === 'lateResponse' && (!a.jobId || typeof a.revision !== 'number')) err('lateResponse 动作缺少 jobId/revision');
    }
    if (c.expectedState) {
      const s = c.expectedState;
      if (!['prepare', 'comparing', 'review', 'ready', 'error'].includes(s.phase)) err(`expectedState.phase 非法：${s.phase}`);
      if (typeof s.analysisNull !== 'boolean' || typeof s.exportable !== 'boolean') err('expectedState.analysisNull/exportable 必须为布尔值');
    }
  }

  if (local.length > 0) fail(id, local.join('；'));
  else {
    passed++;
    console.log(`[fixtures:check] PASS ${id} (${c.kind}/${c.expectedOutcome})`);
  }
}

function checkPerf() {
  checked++;
  const id = 'EP-P01';
  const dir = path.join(FIX, 'perf', 'EP-P01');
  const local = [];
  const err = (m) => local.push(m);
  try {
    const meta = JSON.parse(readStrict(path.join(dir, 'meta.json')));
    const orig = readStrict(path.join(dir, 'original.txt'));
    const cand = readStrict(path.join(dir, 'candidate.txt'));
    const prot = JSON.parse(readStrict(path.join(dir, 'protections.json')));
    if (orig.length !== 2000) err(`原稿长 ${orig.length}，应为 2000`);
    if (cand.length !== 2000) err(`改稿长 ${cand.length}，应为 2000`);
    if (meta.totalUtf16Units !== 2000) err('meta.totalUtf16Units 不是 2000');
    if (orig.split('\n').slice(0, 20).some((l) => l.length !== 99)) err('存在非 99 字行');
    let diff = 0;
    for (let i = 0; i < orig.length; i++) if (orig[i] !== cand[i]) diff++;
    if (diff !== 100) err(`替换数 ${diff}，应为 100`);
    if (meta.totalSubstitutions !== 100) err('meta.totalSubstitutions 不是 100');
    if (sha256Hex(orig) !== meta.originalSha256) err('originalSha256 与文件不符');
    if (sha256Hex(cand) !== meta.candidateSha256) err('candidateSha256 与文件不符');
    const want = [[300, 399], [700, 799], [1100, 1199], [1500, 1599], [1900, 1999]];
    const got = (prot.protections ?? []).map((p) => [p.start, p.end]);
    if (JSON.stringify(got) !== JSON.stringify(want)) err(`保护行区间不符：${JSON.stringify(got)}`);
  } catch (e) {
    err(`读取失败: ${e.message}`);
  }
  if (local.length > 0) fail(id, local.join('；'));
  else {
    passed++;
    console.log('[fixtures:check] PASS EP-P01 (performance)');
  }
}

for (const dir of readdirSync(FIX).filter((d) => d.startsWith('EP-F')).sort()) checkCase(dir);
checkPerf();

console.log(`[fixtures:check] ${passed}/${checked} passed`);
if (errors.length > 0) {
  for (const e of errors) console.error(`[fixtures:check] FAIL ${e}`);
  process.exit(1);
}
console.log('[fixtures:check] all fixtures OK');
