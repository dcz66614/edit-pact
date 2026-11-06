/**
 * P012 改稿守约 Edit Pact — 成稿合成（T005）。
 *
 * 来源：项目书 §8.4（合成与授权）、§9.2（compose 签名）、
 * CONTRACT.md §1.1（冻结签名）、§3（错误码）、§5（授权有效期与状态转换）、
 * §6（保护统计按原稿区间映射核对）。
 *
 * 完成定义（任务卡）：
 *  - 合成只读取原稿和合法 accepted；逐位置验证保护映射；
 *  - 任何非法状态均返回错误而不是部分成稿。
 *
 * 检查顺序（任一失败立即返回错误，不合成、不返回预览文字）：
 *  1. Web Crypto 缺失 → UNSUPPORTED_ENV（不写未经核验的同步替代）。
 *  2. analysis 为 null / schemaVersion 非冻结值 / revision 与 session
 *     不一致 / session.protections 与分析冻结的不一致 → INVALID_PATCH。
 *  3. 输入哈希重查（originalHash / candidateHash）→ INVALID_PATCH。
 *  4. analysisId 重查（computeAnalysisId）→ INVALID_PATCH。
 *     陈旧 analysisId（原稿/改稿/保护变化后未重新分析，或 id 被篡改）
 *     即落入此处；STALE_ANALYSIS 是 setDecision（T006）对“决定指向
 *     陈旧 analysisId”的返回码，compose 的合成前检查失败统一归
 *     INVALID_PATCH（CONTRACT.md §3：“合成前检查失败（哈希、范围、
 *     冲突或状态不一致）”）。
 *  5. Hunk 逐项验证：复用 classifyHunks 验证区间、oldText、升序与不
 *     交叠；stored conflicts 与 decision 必须与重算结果一致（冲突的
 *     Hunk 必须为 blocked；accepted 的 Hunk 不得带冲突——防
 *     PROTECTED_CHANGE 绕过）；decision 必须为四种合法值之一；
 *     全部 Hunk 应用 newText 必须精确重建规范化改稿（项目书 §8.2
 *     不变量）。任一不符 → INVALID_PATCH。
 *  6. 任一 pending → PENDING_REVIEW，不返回预览文字。
 *     （完整性检查先于 pending 检查：损坏状态不应被 PENDING_REVIEW 掩盖。）
 *  7. 合成：顺序遍历 Hunk，复制原稿未改片段，accepted 插 newText，
 *     其余（rejected / blocked）插 oldText（即保留原文），最后复制
 *     剩余原稿。不用模糊 applyPatch、上下文搜索或位置偏移修复。
 *  8. 逐位置验证保护映射：每个保护范围按合成时的原稿区间映射核对
 *     输出位置，输出对应区间必须与原稿保护文字逐字相等；重复出现的
 *     相同文字不能用来掩盖受保护位置被错误替换（不用字符串搜索定位）。
 *     映射失败 → INVALID_PATCH。
 *
 * 本函数不修改传入的 session（只读快照）；返回的 ComposeSuccess 携带
 * 该快照的 analysisId、revision、decisionRevision。
 */

import { computeAnalysisId, sha256Hex } from '../domain/schema';
import type {
  Analysis,
  ComposeResult,
  ComposeSuccess,
  Hunk,
  ProtectedMapping,
  ProtectedRange,
  ReviewSession,
} from '../domain/types';
import { classifyHunks } from './guards';

const INVALID_PATCH: ComposeResult = { ok: false, errorCode: 'INVALID_PATCH' };
const PENDING_REVIEW: ComposeResult = { ok: false, errorCode: 'PENDING_REVIEW' };

/** 合法 decision 值（防止非法 decision 被静默当作 rejected 处理）。 */
const LEGAL_DECISIONS = new Set(['pending', 'accepted', 'rejected', 'blocked']);

/** 保护范围集合是否一致（按 id 排序后逐项比对；顺序不同视为一致）。 */
function sameProtections(a: ProtectedRange[], b: ProtectedRange[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const byId = (x: ProtectedRange, y: ProtectedRange): number =>
    x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
  const sortedA = [...a].sort(byId);
  const sortedB = [...b].sort(byId);
  return sortedA.every(
    (p, i) =>
      p.id === sortedB[i].id &&
      p.paragraphId === sortedB[i].paragraphId &&
      p.start === sortedB[i].start &&
      p.end === sortedB[i].end,
  );
}

/** 从原稿复制的片段：原稿区间 [sourceStart, sourceEnd) 对应输出区间。 */
interface CopiedSegment {
  sourceStart: number;
  sourceEnd: number;
  outputStart: number;
  outputEnd: number;
}

/**
 * 按状态合成文本并记录原稿复制片段。
 * 前置条件：hunks 已验证升序、不交叠、oldText 与原稿一致、decision 合法。
 * accepted 插 newText；rejected / blocked 插 oldText（保留原文）；
 * 纯插入 blocked 时不插入任何文字（原稿该位置无文字可保留）。
 */
function synthesize(
  original: string,
  hunks: Hunk[],
): { text: string; segments: CopiedSegment[] } {
  let text = '';
  let cursor = 0;
  const segments: CopiedSegment[] = [];
  for (const h of hunks) {
    if (h.start > cursor) {
      segments.push({
        sourceStart: cursor,
        sourceEnd: h.start,
        outputStart: text.length,
        outputEnd: text.length + (h.start - cursor),
      });
      text += original.slice(cursor, h.start);
    }
    if (h.decision === 'accepted') {
      text += h.newText;
    } else if (h.end > h.start) {
      segments.push({
        sourceStart: h.start,
        sourceEnd: h.end,
        outputStart: text.length,
        outputEnd: text.length + (h.end - h.start),
      });
      text += h.oldText;
    }
    cursor = h.end;
  }
  if (cursor < original.length) {
    segments.push({
      sourceStart: cursor,
      sourceEnd: original.length,
      outputStart: text.length,
      outputEnd: text.length + (original.length - cursor),
    });
    text += original.slice(cursor);
  }
  return { text, segments };
}

/**
 * 原稿边界位置 x 对应的输出边界位置。
 * 保护边界永不落在 accepted Hunk 的替换区间内部（否则即冲突，该 Hunk
 * 不可能为 accepted），因此 x 总在某个原稿复制片段内；落在两个片段
 * 交界时两边给出同一输出位置（片段在输出中首尾相接）。
 */
function boundaryOffset(segments: CopiedSegment[], x: number): number | null {
  for (const s of segments) {
    if (x >= s.sourceStart && x <= s.sourceEnd) {
      return s.outputStart + (x - s.sourceStart);
    }
  }
  return null;
}

/**
 * 逐位置验证保护映射：对每个保护范围，用合成时的原稿区间映射算出
 * 输出位置，并核对输出对应区间与原稿保护文字逐字相等。
 * 任一保护非法或映射失败返回 null（调用方转为 INVALID_PATCH）。
 */
function buildProtectedMappings(
  original: string,
  output: string,
  segments: CopiedSegment[],
  protections: ProtectedRange[],
): ProtectedMapping[] | null {
  const mappings: ProtectedMapping[] = [];
  for (const p of protections) {
    if (
      !Number.isInteger(p.start) ||
      !Number.isInteger(p.end) ||
      p.end <= p.start ||
      p.start < 0 ||
      p.end > original.length
    ) {
      return null;
    }
    const outputStart = boundaryOffset(segments, p.start);
    const outputEnd = boundaryOffset(segments, p.end);
    if (outputStart === null || outputEnd === null || outputEnd <= outputStart) {
      return null;
    }
    if (output.slice(outputStart, outputEnd) !== original.slice(p.start, p.end)) {
      return null;
    }
    mappings.push({
      protectionId: p.id,
      sourceStart: p.start,
      sourceEnd: p.end,
      outputStart,
      outputEnd,
    });
  }
  return mappings;
}

/**
 * 全部 Hunk 应用 newText 后必须精确重建规范化改稿（项目书 §8.2 不变量）。
 * 前置条件：hunks 已验证升序、不交叠。
 */
function rebuildsCandidate(original: string, candidate: string, hunks: Hunk[]): boolean {
  let rebuilt = '';
  let cursor = 0;
  for (const h of hunks) {
    rebuilt += original.slice(cursor, h.start);
    rebuilt += h.newText;
    cursor = h.end;
  }
  rebuilt += original.slice(cursor);
  return rebuilt === candidate;
}

/** 按冻结签名交付：从 session 合成成稿，或返回明确错误（无部分成稿）。 */
export async function compose(session: Readonly<ReviewSession>): Promise<ComposeResult> {
  if (typeof globalThis.crypto?.subtle?.digest !== 'function') {
    return { ok: false, errorCode: 'UNSUPPORTED_ENV' };
  }

  const analysis: Analysis | null = session.analysis;
  if (analysis === null) {
    return INVALID_PATCH;
  }
  if (analysis.schemaVersion !== '1.0.0' || typeof analysis.engineVersion !== 'string' || analysis.engineVersion === '') {
    return INVALID_PATCH;
  }
  if (session.revision !== analysis.revision) {
    return INVALID_PATCH;
  }
  if (!sameProtections(session.protections, analysis.protections)) {
    return INVALID_PATCH;
  }

  const originalHash = await sha256Hex(session.original);
  const candidateHash = await sha256Hex(session.candidate);
  if (originalHash !== analysis.originalHash || candidateHash !== analysis.candidateHash) {
    return INVALID_PATCH;
  }

  const analysisId = await computeAnalysisId({
    schemaVersion: analysis.schemaVersion,
    engineVersion: analysis.engineVersion,
    revision: analysis.revision,
    jobId: analysis.jobId,
    originalHash,
    candidateHash,
    protections: analysis.protections,
  });
  if (analysisId !== analysis.analysisId) {
    return INVALID_PATCH;
  }

  const guard = classifyHunks(session.original, analysis.hunks, analysis.protections);
  if (!guard.ok) {
    return INVALID_PATCH;
  }
  const reclassified = new Map(guard.hunks.map((h) => [h.id, h]));
  for (const h of analysis.hunks) {
    if (!LEGAL_DECISIONS.has(h.decision)) {
      return INVALID_PATCH;
    }
    const fresh = reclassified.get(h.id);
    if (fresh === undefined) {
      return INVALID_PATCH;
    }
    const storedConflicts = [...h.conflicts].sort();
    const freshConflicts = [...fresh.conflicts].sort();
    if (
      storedConflicts.length !== freshConflicts.length ||
      storedConflicts.some((id, i) => id !== freshConflicts[i])
    ) {
      return INVALID_PATCH;
    }
    // 冲突的 Hunk 必须为 blocked；accepted 的 Hunk 不得带冲突。
    if ((freshConflicts.length > 0) !== (h.decision === 'blocked')) {
      return INVALID_PATCH;
    }
  }

  if (!rebuildsCandidate(session.original, session.candidate, analysis.hunks)) {
    return INVALID_PATCH;
  }

  if (analysis.hunks.some((h) => h.decision === 'pending')) {
    return PENDING_REVIEW;
  }

  const { text, segments } = synthesize(session.original, analysis.hunks);
  const protectedMappings = buildProtectedMappings(
    session.original,
    text,
    segments,
    analysis.protections,
  );
  if (protectedMappings === null) {
    return INVALID_PATCH;
  }

  const outputHash = await sha256Hex(text);
  const success: ComposeSuccess = {
    ok: true,
    text,
    outputHash,
    analysisId: analysis.analysisId,
    revision: session.revision,
    decisionRevision: session.decisionRevision,
    protectedMappings,
  };
  return success;
}
