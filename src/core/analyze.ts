/**
 * P012 改稿守约 Edit Pact — 比较组装（T004）。
 *
 * 来源：项目书 §8.2（精确差异）、§9.2（analyze 签名）、CONTRACT.md
 * §1.1（冻结签名）、§4（哈希与 analysisId）、§5（授权有效期）。
 *
 * analyze 是唯一公开的完整组装入口：校验请求 → 规范化与输入限制 →
 * 差异（diff.ts）→ 保护分类（T005 classifyHunks，只调用，不重复实现
 * 保护规则）→ 哈希与 analysisId → 完整 Analysis。
 *
 * 失败映射（按契约）：
 *  - 请求结构非法 → INVALID_INPUT（revision/jobId 仍可读时）；
 *    revision/jobId 本身无法读取时抛 TypeError（调用方编程错误，
 *    不属于契约定义的失败）。
 *  - 缺少 Web Crypto → UNSUPPORTED_ENV。
 *  - 输入违反 §8.1 限制 → INVALID_INPUT。
 *  - 无 Intl.Segmenter → UNSUPPORTED_ENV（不退化）。
 *  - 差异算法返回 undefined（超 maxEditLength 或 800 ms 超时）
 *    → TOO_COMPLEX，绝不视作“没有差异”。
 *  - classifyHunks 验证失败（区间/oldText/保护非法）
 *    → INVALID_PATCH（T005 的显式判定）。
 *
 * 本模块不修改传入的 request 与 protections（Analysis 内为副本），
 * 不做决定、不做合成、不碰 UI 与状态机。
 */

import type { Analyze, AnalyzeRequest, AnalyzeResult } from '../domain/types';
import { SCHEMA_VERSION } from '../domain/types';
import { AnalyzeRequestSchema, computeAnalysisId, sha256Hex } from '../domain/schema';
import { canonicalize, validateInput } from './text';
import { computeRawHunks } from './diff';
import { classifyHunks } from './guards';
import { SegmenterUnavailableError } from './tokenize';

function errorResult(
  request: AnalyzeRequest,
  errorCode: 'INVALID_INPUT' | 'TOO_COMPLEX' | 'INVALID_PATCH' | 'UNSUPPORTED_ENV',
): AnalyzeResult {
  return { ok: false, errorCode, revision: request.revision, jobId: request.jobId };
}

/**
 * 按冻结签名交付：异步（Web Crypto 哈希），返回完整 Analysis 或
 * 带错误码的失败结果。
 */
export const analyze: Analyze = async (request: AnalyzeRequest): Promise<AnalyzeResult> => {
  const parsed = AnalyzeRequestSchema.safeParse(request);
  if (!parsed.success) {
    // 结构非法但 revision/jobId 仍可读：按契约返回 INVALID_INPUT；
    // 连这两个标识都无法读取时属于调用方编程错误，直接抛出。
    const revision = (request as { revision?: unknown } | null)?.revision;
    const jobId = (request as { jobId?: unknown } | null)?.jobId;
    if (typeof revision === 'number' && Number.isInteger(revision) && revision >= 0
      && typeof jobId === 'string' && jobId.length > 0) {
      return { ok: false, errorCode: 'INVALID_INPUT', revision, jobId };
    }
    throw new TypeError('analyze: request must carry a valid revision and jobId');
  }

  if (typeof globalThis.crypto?.subtle?.digest !== 'function') {
    return errorResult(request, 'UNSUPPORTED_ENV');
  }

  const original = canonicalize(request.original);
  const candidate = canonicalize(request.candidate);

  const issues = [
    ...validateInput(original, 'original'),
    ...validateInput(candidate, 'candidate'),
  ];
  if (issues.length > 0) {
    return errorResult(request, 'INVALID_INPUT');
  }

  let rawHunks;
  try {
    rawHunks = computeRawHunks(original, candidate);
  } catch (error) {
    if (error instanceof SegmenterUnavailableError) {
      return errorResult(request, 'UNSUPPORTED_ENV');
    }
    throw error;
  }
  if (rawHunks === undefined) {
    return errorResult(request, 'TOO_COMPLEX');
  }

  const guard = classifyHunks(original, rawHunks, request.protections);
  if (!guard.ok) {
    return errorResult(request, 'INVALID_PATCH');
  }

  const originalHash = await sha256Hex(original);
  const candidateHash = await sha256Hex(candidate);
  const analysisId = await computeAnalysisId({
    schemaVersion: SCHEMA_VERSION,
    engineVersion: request.engineVersion,
    revision: request.revision,
    jobId: request.jobId,
    originalHash,
    candidateHash,
    protections: request.protections,
  });

  return {
    ok: true,
    analysis: {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: request.engineVersion,
      revision: request.revision,
      jobId: request.jobId,
      analysisId,
      originalHash,
      candidateHash,
      protections: [...request.protections],
      hunks: guard.hunks,
    },
  };
};
