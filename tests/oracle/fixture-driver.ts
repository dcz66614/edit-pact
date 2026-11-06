/**
 * P012 T010 — 24 组 fixture 的独立执行驱动。
 *
 * 本驱动按 case.json 的 actions 逐步执行生产 analyze / reducer / compose，
 * 每步用 oracle.ts 的独立实现复核结果（哈希、analysisId、冲突分类、
 * Hunk 不变量、合成文本、保护映射），不信任构建者的自述。
 *
 * 驱动语义（显式约定，写入审查报告；case.json 本身未定义执行时序）：
 *  - 初始 session：revision 0，phase 'prepare'，原稿/改稿为 oracle 规范化
 *    后的文件内容（应用在导入时规范化；生产 analyze/reducer 内部也会规范化）。
 *  - 'analyze' 动作 = beginCompare + 调用 analyze，结果暂存为 pending，
 *    暂不应用——这还原真实异步时序（结果到达前用户可能取消）。
 *  - 需要分析的下一动作（applyDecisions / compose / change* / clear）
 *    会先应用 pending 结果（applyAnalysisResult 必须成功，否则记失败）；
 *    'cancel' 动作丢弃 pending 结果（比较进行中取消，F22）；
 *    'lateResponse' 动作把已清空后到达的旧结果交给 applyAnalysisResult，
 *    必须被拒绝（F24）。
 *  - changeProtections 后若 expectedState 要求分析存在（F19），按其
 *    description 所述以新 jobId 重算：原 jobId 尾部 '-a' 改为 '-b'
 *    （无 '-a' 时追加 '-b'），revision 取 changeProtections 的 revision。
 *  - exportable 定义：分析存在且无 pending Hunk（blocked 不计为 pending）。
 *  - 决定应用：decisions.json 的每个区间必须完整包含其覆盖的 Hunk；
 *    任一 Hunk 与决定区间部分相交即按 CONTRACT.md §7.5 记为 fixture 无效；
 *    区间覆盖 0 个 Hunk 时记一条 note（若 newText 与原文该区间不同，
 *    合成三方比对会进一步暴露分歧）。
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../../src/core/analyze';
import { compose } from '../../src/core/compose';
import { computeRawHunks, ENGINE_VERSION } from '../../src/core/diff';
import {
  applyAnalysisResult,
  beginCompare,
  cancelCompare,
  changeCandidate,
  changeOriginal,
  changeProtections,
  clearSession,
  keepRemaining,
  setDecision,
} from '../../src/core/reducer';
import { validateInput } from '../../src/core/text';
import type {
  Analysis,
  AnalyzeResult,
  Hunk,
  ProtectedRange,
  ReviewSession,
} from '../../src/domain/types';
import {
  analysisIdIndependent,
  canonicalizeText,
  classifyIndependent,
  graphemeBoundaries,
  mapProtectionToOutput,
  sha256HexNode,
  spliceByHunks,
  spliceByIntervals,
} from './oracle';
import type { IntervalDecision } from './oracle';

const FIXTURES_DIR = fileURLToPath(new URL('../fixtures/', import.meta.url));

export interface FixtureCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface FixtureReport {
  id: string;
  kind: string;
  checks: FixtureCheck[];
  notes: string[];
  failures: string[];
}

interface CaseJson {
  id: string;
  kind: string;
  originalFile: string;
  candidateFile?: string;
  protectionsFile?: string;
  decisionsFile?: string;
  actions: { type: string; revision?: number; jobId?: string; field?: string; file?: string }[];
  expectedOutcome: string;
  expectedErrorCode?: string;
  expectedIssueCode?: string;
  expectedState?: { phase: string; analysisNull: boolean; exportable: boolean; decisionsEmpty?: boolean };
  hasText: boolean;
  description?: string;
}

interface DecisionsFile {
  version: string;
  decisions: { start: number; end: number; decision: 'accepted' | 'rejected'; newText?: string }[];
}

interface ProtectionsFile {
  version: string;
  protections: ProtectedRange[];
}

function readText(dir: string, name: string): string {
  return readFileSync(path.join(dir, name), 'utf8');
}

function readJson<T>(dir: string, name: string): T {
  return JSON.parse(readFileSync(path.join(dir, name), 'utf8')) as T;
}

function isExportable(session: ReviewSession): boolean {
  const analysis = session.analysis;
  if (analysis === null) return false;
  return !analysis.hunks.some((h) => h.decision === 'pending');
}

function decisionsEmpty(session: ReviewSession): boolean {
  const analysis = session.analysis;
  if (analysis === null) return true;
  return !analysis.hunks.some((h) => h.decision === 'accepted' || h.decision === 'rejected');
}

/** 独立核对一次分析结果：哈希、analysisId、Hunk 不变量、独立冲突分类。 */
function verifyAnalysis(
  report: FixtureReport,
  label: string,
  original: string,
  candidate: string,
  analysis: Analysis,
  protections: readonly ProtectedRange[],
): void {
  const check = (name: string, ok: boolean, detail?: string): void => {
    report.checks.push({ name: `${label}:${name}`, ok, detail });
    if (!ok) report.failures.push(`${label}:${name}${detail ? ` — ${detail}` : ''}`);
  };

  const canonicalOriginal = canonicalizeText(original);
  const canonicalCandidate = canonicalizeText(candidate);
  const originalHash = sha256HexNode(canonicalOriginal);
  const candidateHash = sha256HexNode(canonicalCandidate);
  check('originalHash', analysis.originalHash === originalHash, `got ${analysis.originalHash}`);
  check('candidateHash', analysis.candidateHash === candidateHash, `got ${analysis.candidateHash}`);
  const expectedId = analysisIdIndependent({
    schemaVersion: '1.0.0',
    engineVersion: analysis.engineVersion,
    revision: analysis.revision,
    jobId: analysis.jobId,
    originalHash,
    candidateHash,
    protections: analysis.protections,
  });
  check('analysisId', analysis.analysisId === expectedId, `got ${analysis.analysisId}`);
  check('schemaVersion', analysis.schemaVersion === '1.0.0');
  check('engineVersion', analysis.engineVersion === ENGINE_VERSION, `got ${analysis.engineVersion}`);

  // Hunk 不变量（独立于生产 guards 的重新检查）。
  const boundaries = graphemeBoundaries(canonicalOriginal);
  let prevEnd = 0;
  let sortedOk = true;
  for (const h of analysis.hunks) {
    if (h.start < prevEnd) sortedOk = false;
    prevEnd = h.end;
    if (canonicalOriginal.slice(h.start, h.end) !== h.oldText) {
      check(`hunk ${h.id} oldText`, false, `slice != oldText`);
    }
    if (!boundaries.has(h.start) || !boundaries.has(h.end)) {
      check(`hunk ${h.id} grapheme-boundary`, false, `[${h.start}, ${h.end}) splits a grapheme`);
    }
  }
  check('hunks sorted non-overlapping', sortedOk);

  // 独立冲突分类：用生产 diff 的 raw hunks 跑我自己的分类，与生产分析逐项比对。
  const rawHunks = computeRawHunks(canonicalOriginal, canonicalCandidate);
  if (rawHunks === undefined) {
    check('diff not TOO_COMPLEX', false, 'computeRawHunks returned undefined');
    return;
  }
  const mine = classifyIndependent(canonicalOriginal, rawHunks, protections);
  if (!mine.ok) {
    check('independent classify', false, mine.reason);
    return;
  }
  check('independent classify ok', true);
  if (mine.hunks.length !== analysis.hunks.length) {
    check(
      'hunk count matches independent classify',
      false,
      `independent ${mine.hunks.length} vs production ${analysis.hunks.length}`,
    );
    return;
  }
  for (let i = 0; i < mine.hunks.length; i++) {
    const m = mine.hunks[i];
    const p = analysis.hunks[i];
    const same =
      m.id === p.id &&
      m.start === p.start &&
      m.end === p.end &&
      m.oldText === p.oldText &&
      m.newText === p.newText &&
      m.conflicts.join(',') === p.conflicts.join(',') &&
      m.decision === p.decision;
    check(`hunk ${p.id} matches independent classify`, same, JSON.stringify({ mine: m, prod: p }));
  }

  // 重建不变量（§8.2）：全部 newText 得改稿，全部 oldText 得原稿。
  check('rebuild all-newText == candidate', rebuildAllNew(canonicalOriginal, analysis.hunks) === canonicalCandidate);
  check('rebuild all-oldText == original', rebuildAllOld(canonicalOriginal, analysis.hunks) === canonicalOriginal);
}

function rebuildAllNew(original: string, hunks: readonly Hunk[]): string {
  let out = '';
  let cursor = 0;
  for (const h of hunks) {
    out += original.slice(cursor, h.start);
    out += h.newText;
    cursor = h.end;
  }
  out += original.slice(cursor);
  return out;
}

function rebuildAllOld(original: string, hunks: readonly Hunk[]): string {
  let out = '';
  let cursor = 0;
  for (const h of hunks) {
    out += original.slice(cursor, h.start);
    out += h.oldText;
    cursor = h.end;
  }
  out += original.slice(cursor);
  return out;
}

function applyDecisions(
  report: FixtureReport,
  session: ReviewSession,
  decisions: DecisionsFile['decisions'],
): ReviewSession {
  const analysis = session.analysis;
  if (analysis === null) {
    report.failures.push('applyDecisions: no analysis');
    return session;
  }
  let current = session;
  for (const d of decisions) {
    const covered: Hunk[] = [];
    let partial: Hunk | null = null;
    for (const h of analysis.hunks) {
      const inside = h.start >= d.start && h.end <= d.end;
      const overlaps = h.start < d.end && h.end > d.start;
      if (inside) covered.push(h);
      else if (overlaps) partial = h;
    }
    if (partial !== null) {
      report.checks.push({
        name: `decision [${d.start}, ${d.end}) containment`,
        ok: false,
        detail: `hunk ${partial.id} [${partial.start}, ${partial.end}) partially overlaps — fixture invalid per CONTRACT.md §7.5`,
      });
      report.failures.push(
        `decision [${d.start}, ${d.end}) partially overlaps hunk ${partial.id} — fixture invalid per CONTRACT.md §7.5`,
      );
      continue;
    }
    if (covered.length === 0) {
      report.notes.push(
        `decision [${d.start}, ${d.end}) ${d.decision} covers 0 hunks` +
          (d.decision === 'accepted' && d.newText !== canonicalizeText(current.original).slice(d.start, d.end)
            ? ' (newText differs from original span — oracle/product divergence risk)'
            : ''),
      );
    }
    for (const h of covered) {
      // 当前 session 的 analysis 可能已被前一决定更新，取最新 hunk 状态。
      const latest = current.analysis?.hunks.find((x) => x.id === h.id);
      if (latest === undefined) continue;
      if (latest.decision === 'blocked' && d.decision === 'rejected') {
        // blocked 保持 blocked 是正确语义（reducer 对 blocked 是 no-op 成功）。
        continue;
      }
      const result = setDecision(current, analysis.analysisId, h.id, d.decision);
      if (!result.ok) {
        report.checks.push({
          name: `setDecision ${h.id} ${d.decision}`,
          ok: false,
          detail: `errorCode ${result.errorCode}`,
        });
        report.failures.push(`setDecision ${h.id} ${d.decision} failed: ${result.errorCode}`);
      } else {
        current = result.session;
      }
    }
  }
  return current;
}

/** 执行一组 fixture，返回逐项核对报告。 */
export async function runFixture(id: string): Promise<FixtureReport> {
  const report: FixtureReport = { id, kind: '', checks: [], notes: [], failures: [] };
  const dir = path.join(FIXTURES_DIR, id);
  const check = (name: string, ok: boolean, detail?: string): void => {
    report.checks.push({ name, ok, detail });
    if (!ok) report.failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  };

  const c = readJson<CaseJson>(dir, 'case.json');
  report.kind = c.kind;
  const originalRaw = readText(dir, c.originalFile);
  const candidateRaw = c.candidateFile !== undefined ? readText(dir, c.candidateFile) : '';
  const protections: ProtectedRange[] =
    c.protectionsFile !== undefined
      ? readJson<ProtectionsFile>(dir, c.protectionsFile).protections
      : [];
  const decisions: DecisionsFile['decisions'] =
    c.decisionsFile !== undefined ? readJson<DecisionsFile>(dir, c.decisionsFile).decisions : [];

  let session: ReviewSession = {
    original: canonicalizeText(originalRaw),
    candidate: canonicalizeText(candidateRaw),
    revision: 0,
    decisionRevision: 0,
    phase: 'prepare',
    protections: protections.map((p) => ({ ...p })),
    analysis: null,
  };

  let pending: { result: AnalyzeResult; jobId: string } | null = null;
  let late: { result: AnalyzeResult; jobId: string } | null = null;
  let lastJobId = '';

  const applyPending = (label: string): void => {
    if (pending === null) return;
    const { applied, session: next } = applyAnalysisResult(session, pending.result, pending.jobId);
    if (!applied) {
      check(`${label}:apply pending analysis`, false, 'applyAnalysisResult refused a fresh result');
    } else {
      session = next;
      if (pending.result.ok) {
        verifyAnalysis(
          report,
          `${label}:analyze`,
          session.original,
          session.candidate,
          pending.result.analysis,
          session.protections,
        );
      } else {
        check(
          `${label}:analyze error`,
          pending.result.errorCode === c.expectedErrorCode,
          `got ${pending.result.errorCode}, expected ${c.expectedErrorCode ?? '(success)'}`,
        );
      }
    }
    pending = null;
  };

  const runAnalyze = async (revision: number, jobId: string): Promise<void> => {
    session = beginCompare(session);
    const result = await analyze({
      original: session.original,
      candidate: session.candidate,
      protections: session.protections,
      revision,
      jobId,
      engineVersion: ENGINE_VERSION,
    });
    session = { ...session, revision };
    pending = { result, jobId };
    lastJobId = jobId;
  };

  for (const action of c.actions) {
    switch (action.type) {
      case 'analyze': {
        await runAnalyze(action.revision ?? 1, action.jobId ?? '');
        break;
      }
      case 'applyDecisions': {
        applyPending('applyDecisions');
        session = applyDecisions(report, session, decisions);
        break;
      }
      case 'compose': {
        applyPending('compose');
        const before = JSON.stringify(session);
        const result = await compose(session);
        check('compose does not mutate session', JSON.stringify(session) === before);
        if (c.expectedOutcome === 'success') {
          if (!result.ok) {
            check('compose ok', false, `errorCode ${result.errorCode}`);
            break;
          }
          const expectedPath = path.join(dir, 'expected.txt');
          if (!existsSync(expectedPath)) {
            check('expected.txt exists', false);
            break;
          }
          const expected = canonicalizeText(readText(dir, 'expected.txt'));
          check('compose text == expected.txt', result.text === expected, `got ${JSON.stringify(result.text)}`);
          // 独立 oracle：只用 decisions.json 的区间拼接。
          const oracleDecisions: IntervalDecision[] = decisions.map((d) => ({
            start: d.start,
            end: d.end,
            decision: d.decision,
            newText: d.newText,
          }));
          let oracleText: string | null = null;
          try {
            oracleText = spliceByIntervals(session.original, oracleDecisions);
          } catch (e) {
            check('oracle splice', false, (e as Error).message);
          }
          if (oracleText !== null) {
            check('compose text == independent oracle', result.text === oracleText);
            check('oracle text == expected.txt', oracleText === expected);
          }
          // 与 Hunk 拼接交叉核对。
          if (session.analysis !== null) {
            check(
              'compose text == independent hunk splice',
              result.text === spliceByHunks(session.original, session.analysis.hunks),
            );
          }
          // 保护映射：独立映射 + 输出逐字核对。
          if (session.analysis !== null) {
            for (const p of session.analysis.protections) {
              const mapped = mapProtectionToOutput(session.original, session.analysis.hunks, p);
              if (mapped === null) {
                check(`protection ${p.id} mappable`, false, 'boundary destroyed by an accepted hunk');
                continue;
              }
              check(
                `protection ${p.id} text preserved at mapped position`,
                result.text.slice(mapped.outputStart, mapped.outputEnd) ===
                  session.original.slice(p.start, p.end),
              );
              const reported = result.protectedMappings.find((m) => m.protectionId === p.id);
              check(
                `protection ${p.id} mapping matches production report`,
                reported !== undefined &&
                  reported.outputStart === mapped.outputStart &&
                  reported.outputEnd === mapped.outputEnd,
                `production ${JSON.stringify(reported)} vs independent ${JSON.stringify(mapped)}`,
              );
            }
          }
          check('outputHash == node crypto sha256', result.outputHash === sha256HexNode(result.text));
          check(
            'compose identifiers echo session snapshot',
            result.analysisId === session.analysis?.analysisId &&
              result.revision === session.revision &&
              result.decisionRevision === session.decisionRevision,
          );
        } else if (c.expectedOutcome === 'error') {
          if (result.ok) {
            check('compose fails as expected', false, `unexpected success text ${JSON.stringify(result.text)}`);
          } else {
            check('compose errorCode', result.errorCode === c.expectedErrorCode, `got ${result.errorCode}`);
            check('error result carries no text', !('text' in result));
          }
        } else {
          check('compose in state fixture', false, 'unexpected compose action');
        }
        break;
      }
      case 'validate': {
        const field = action.field === 'candidate' ? 'candidate' : 'original';
        const text = field === 'original' ? originalRaw : candidateRaw;
        const issues = validateInput(text, field);
        const found = issues.find((i) => i.code === c.expectedIssueCode);
        check(
          `validate ${field} issue ${c.expectedIssueCode}`,
          found !== undefined,
          `issues ${JSON.stringify(issues)}`,
        );
        break;
      }
      case 'changeOriginal': {
        applyPending('changeOriginal');
        const newText = canonicalizeText(readText(dir, action.file ?? ''));
        session = changeOriginal(session, newText, action.revision ?? session.revision + 1);
        check('changeOriginal clears analysis', session.analysis === null);
        check('changeOriginal clears candidate', session.candidate === '');
        check('changeOriginal clears protections', session.protections.length === 0);
        check('changeOriginal phase prepare', session.phase === 'prepare');
        break;
      }
      case 'changeCandidate': {
        applyPending('changeCandidate');
        const newText = canonicalizeText(readText(dir, action.file ?? ''));
        const oldProtections = session.protections;
        const oldOriginal = session.original;
        session = changeCandidate(session, newText, action.revision ?? session.revision + 1);
        check('changeCandidate clears analysis', session.analysis === null);
        check('changeCandidate keeps original', session.original === oldOriginal);
        check(
          'changeCandidate keeps protections',
          JSON.stringify(session.protections) === JSON.stringify(oldProtections),
        );
        check('changeCandidate phase prepare', session.phase === 'prepare');
        break;
      }
      case 'changeProtections': {
        applyPending('changeProtections');
        const oldAnalysis = session.analysis;
        const newProtections = readJson<ProtectionsFile>(dir, action.file ?? '').protections;
        const oldOriginal = session.original;
        const oldCandidate = session.candidate;
        session = changeProtections(session, newProtections, action.revision ?? session.revision + 1);
        check('changeProtections clears analysis', session.analysis === null);
        check('changeProtections keeps original', session.original === oldOriginal);
        check('changeProtections keeps candidate', session.candidate === oldCandidate);
        check('changeProtections phase prepare', session.phase === 'prepare');
        // 旧 analysisId 不得复用。
        if (oldAnalysis !== null) {
          const stale = setDecision(session, oldAnalysis.analysisId, 'h1', 'accepted');
          check(
            'old analysisId rejected after changeProtections',
            !stale.ok && stale.errorCode === 'STALE_ANALYSIS',
            `got ${JSON.stringify(stale)}`,
          );
        }
        // F19：description 明确要求以新 jobId 重算。
        if (c.expectedState !== undefined && !c.expectedState.analysisNull) {
          const newJobId = lastJobId.endsWith('-a')
            ? `${lastJobId.slice(0, -1)}b`
            : `${lastJobId}-b`;
          await runAnalyze(action.revision ?? session.revision, newJobId);
          applyPending('changeProtections:re-analyze');
        }
        break;
      }
      case 'cancel': {
        // 比较进行中取消：先独立核对 pending 的分析结果（它本身必须正确），
        // 再丢弃它；cancelCompare 回到 prepare。
        if (pending !== null) {
          // 注：TS 在此 switch 分支里把 pending 的收窄算成 never（同一
          // 模式在 applyPending 小函数里正常）；前面已做 !== null 检查，
          // 此处断言为非空类型是诚实的。
          const p = pending as { result: AnalyzeResult; jobId: string };
          if (p.result.ok) {
            verifyAnalysis(
              report,
              'cancel:analyze',
              session.original,
              session.candidate,
              p.result.analysis,
              session.protections,
            );
          }
          pending = null;
          session = cancelCompare(session);
          check('cancel returns to prepare', session.phase === 'prepare', `got ${session.phase}`);
          check('cancel clears analysis', session.analysis === null);
        } else {
          session = cancelCompare(session);
          check('cancel returns to prepare', session.phase === 'prepare', `got ${session.phase}`);
        }
        break;
      }
      case 'clear': {
        applyPending('clear');
        // 保存旧结果供后续 lateResponse 动作使用（清空后到达的迟到响应）。
        if (session.analysis !== null) {
          late = {
            result: { ok: true, analysis: session.analysis },
            jobId: session.analysis.jobId,
          };
        }
        session = clearSession(session);
        check('clear empties session', session.original === '' && session.candidate === '');
        check('clear resets revision', session.revision === 0 && session.decisionRevision === 0);
        check('clear phase prepare', session.phase === 'prepare');
        check('clear analysis null', session.analysis === null);
        break;
      }
      case 'lateResponse': {
        if (late === null) {
          check('lateResponse has a held result', false, 'no prior analysis to replay');
          break;
        }
        const before = JSON.stringify(session);
        const { applied, session: next } = applyAnalysisResult(session, late.result, action.jobId ?? '');
        check('late response discarded', applied === false, `applied=${applied}`);
        check('late response leaves session unchanged', JSON.stringify(next) === before);
        session = next;
        late = null;
        break;
      }
      case 'keepRemaining': {
        applyPending('keepRemaining');
        if (session.analysis === null) {
          check('keepRemaining needs analysis', false);
          break;
        }
        const beforeRevision = session.decisionRevision;
        const acceptedBefore = session.analysis.hunks.filter((h) => h.decision === 'accepted').length;
        const blockedBefore = session.analysis.hunks.filter((h) => h.decision === 'blocked').length;
        const result = keepRemaining(session, session.analysis.analysisId);
        if (!result.ok) {
          check('keepRemaining ok', false, `errorCode ${result.errorCode}`);
          break;
        }
        session = result.session;
        check(
          'keepRemaining rejects all pending',
          session.analysis !== null && !session.analysis.hunks.some((h) => h.decision === 'pending'),
        );
        check(
          'keepRemaining keeps accepted untouched',
          session.analysis !== null &&
            session.analysis.hunks.filter((h) => h.decision === 'accepted').length === acceptedBefore,
        );
        check(
          'keepRemaining keeps blocked untouched',
          session.analysis !== null &&
            session.analysis.hunks.filter((h) => h.decision === 'blocked').length === blockedBefore,
        );
        check(
          'keepRemaining bumps decisionRevision on change',
          session.decisionRevision === beforeRevision + 1,
          `got ${session.decisionRevision} from ${beforeRevision}`,
        );
        break;
      }
      case 'export': {
        applyPending('export');
        check('exportable state', isExportable(session));
        break;
      }
      default: {
        check(`unknown action ${action.type}`, false);
        break;
      }
    }
  }

  // 终态核对（state / 其余 outcome 的收尾断言）。
  if (c.expectedOutcome === 'state' && c.expectedState !== undefined) {
    const s = c.expectedState;
    check('final phase', session.phase === s.phase, `got ${session.phase}`);
    check('final analysisNull', (session.analysis === null) === s.analysisNull);
    check('final exportable', isExportable(session) === s.exportable);
    if (s.decisionsEmpty !== undefined) {
      check('final decisionsEmpty', decisionsEmpty(session) === s.decisionsEmpty);
    }
  }
  if (c.expectedOutcome === 'error' && c.kind === 'validation') {
    // validation 案例已在 validate 动作中断言；此处确认 analyze 同样拒绝。
    const result = await analyze({
      original: originalRaw,
      candidate: candidateRaw,
      protections,
      revision: 1,
      jobId: `job-${id}-v`,
      engineVersion: ENGINE_VERSION,
    });
    check(
      'analyze rejects invalid input',
      !result.ok && result.errorCode === 'INVALID_INPUT',
      `got ${JSON.stringify(result)}`,
    );
  }

  // 任何残留的 classifyHunks 直接调用验证已在 verifyAnalysis 中通过
  // computeRawHunks + classifyIndependent 覆盖（与 analyze 路径无关的 guard 层
  // 在 invariants.test.ts 的反例部分直接调用生产 classifyHunks 核对）。
  return report;
}

/** 全部 24 组 fixture 的 id 列表。 */
export const FIXTURE_IDS: string[] = Array.from({ length: 24 }, (_, i) => `EP-F${String(i + 1).padStart(2, '0')}`);
