/**
 * P012 改稿守约 Edit Pact — 运行时契约校验（T002）。
 *
 * 来源：项目书 §9（数据结构与模块接口）、§8.1–§8.4、实施计划 §8。
 * - Zod schema 是 src/domain/types.ts 的运行时镜像：字段、枚举与失败
 *   行为以项目书冻结定义为准；.strict() 拒绝未声明字段。
 * - 哈希统一使用 Web Crypto SHA-256（异步），对 TextEncoder 生成的
 *   UTF-8 字节计算并转小写十六进制；不得写未经核验的同步替代。
 * - analysisId 为固定字段顺序的 JSON 数组经 UTF-8 编码后的 SHA-256。
 */

import { z } from 'zod';
import type { Analysis, ProtectedRange } from './types';

// ---------------------------------------------------------------------------
// 基础校验
// ---------------------------------------------------------------------------

/** SHA-256 小写十六进制（64 位字符）。 */
export const Sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const ErrorCodeSchema = z.enum([
  'INVALID_INPUT',
  'TOO_COMPLEX',
  'CANCELLED',
  'STALE_ANALYSIS',
  'PENDING_REVIEW',
  'PROTECTED_CHANGE',
  'INVALID_PATCH',
  'UNKNOWN_HUNK',
  'UNSUPPORTED_ENV',
]);

export const DecisionSchema = z.enum(['pending', 'accepted', 'rejected', 'blocked']);

export const SessionPhaseSchema = z.enum(['prepare', 'comparing', 'review', 'ready', 'error']);

// ---------------------------------------------------------------------------
// 核心类型 schema（项目书 §9.1）
// ---------------------------------------------------------------------------

export const ProtectedRangeSchema = z
  .object({
    id: z.string().min(1),
    paragraphId: z.string().min(1),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
  })
  .strict()
  .refine((p) => p.end > p.start, { message: 'protected range must be non-empty: end > start' });

export const HunkSchema = z
  .object({
    id: z.string().min(1),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    oldText: z.string(),
    newText: z.string(),
    conflicts: z.array(z.string().min(1)),
    decision: DecisionSchema,
  })
  .strict()
  .refine((h) => h.end >= h.start, { message: 'hunk end must be >= start' });

export const AnalysisSchema = z
  .object({
    schemaVersion: z.literal('1.0.0'),
    engineVersion: z.string().min(1),
    revision: z.number().int().nonnegative(),
    jobId: z.string().min(1),
    analysisId: Sha256HexSchema,
    originalHash: Sha256HexSchema,
    candidateHash: Sha256HexSchema,
    protections: z.array(ProtectedRangeSchema),
    hunks: z.array(HunkSchema),
  })
  .strict();

export const ReviewSessionSchema = z
  .object({
    original: z.string(),
    candidate: z.string(),
    revision: z.number().int().nonnegative(),
    decisionRevision: z.number().int().nonnegative(),
    phase: SessionPhaseSchema,
    protections: z.array(ProtectedRangeSchema),
    analysis: AnalysisSchema.nullable(),
  })
  .strict();

// ---------------------------------------------------------------------------
// 公共辅助类型 schema（项目书 §9.2）
// ---------------------------------------------------------------------------

/** 输入问题细分码（与 ErrorCode 区分：校验失败时 ErrorCode 为 INVALID_INPUT）。 */
export const InputIssueCodeSchema = z.enum([
  'EMPTY_ORIGINAL',
  'TOO_LONG',
  'TOO_MANY_PARAGRAPHS',
  'INVALID_UNICODE',
  'INVALID_UTF8',
  'FILE_TOO_LARGE',
]);

export const InputIssueSchema = z
  .object({
    code: InputIssueCodeSchema,
    field: z.enum(['original', 'candidate']),
    limit: z.number().int().nullable(),
    actual: z.number().int().nullable(),
  })
  .strict();

export const ParagraphSchema = z
  .object({
    id: z.string().min(1),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    text: z.string(),
    isBlank: z.boolean(),
  })
  .strict()
  .refine((p) => p.end >= p.start, { message: 'paragraph end must be >= start' });

export const AnalyzeRequestSchema = z
  .object({
    original: z.string(),
    candidate: z.string(),
    protections: z.array(ProtectedRangeSchema),
    revision: z.number().int().nonnegative(),
    jobId: z.string().min(1),
    engineVersion: z.string().min(1),
  })
  .strict();

export const AnalyzeResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), analysis: AnalysisSchema }).strict(),
  z
    .object({
      ok: z.literal(false),
      errorCode: ErrorCodeSchema,
      revision: z.number().int().nonnegative(),
      jobId: z.string().min(1),
    })
    .strict(),
]);

export const GuardResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), hunks: z.array(HunkSchema) }).strict(),
  z.object({ ok: z.literal(false), errorCode: ErrorCodeSchema }).strict(),
]);

export const DecisionResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), session: ReviewSessionSchema }).strict(),
  z.object({ ok: z.literal(false), errorCode: ErrorCodeSchema }).strict(),
]);

export const ProtectedMappingSchema = z
  .object({
    protectionId: z.string().min(1),
    sourceStart: z.number().int().nonnegative(),
    sourceEnd: z.number().int().nonnegative(),
    outputStart: z.number().int().nonnegative(),
    outputEnd: z.number().int().nonnegative(),
  })
  .strict()
  .refine((m) => m.sourceEnd > m.sourceStart && m.outputEnd > m.outputStart, {
    message: 'protected mapping ranges must be non-empty',
  });

export const ComposeSuccessSchema = z
  .object({
    ok: z.literal(true),
    text: z.string(),
    outputHash: Sha256HexSchema,
    analysisId: Sha256HexSchema,
    revision: z.number().int().nonnegative(),
    decisionRevision: z.number().int().nonnegative(),
    protectedMappings: z.array(ProtectedMappingSchema),
  })
  .strict();

export const ComposeResultSchema = z.discriminatedUnion('ok', [
  ComposeSuccessSchema,
  z.object({ ok: z.literal(false), errorCode: ErrorCodeSchema }).strict(),
]);

export const ReviewReceiptSchema = z
  .object({
    schemaVersion: z.literal('1.0.0'),
    engineVersion: z.string().min(1),
    analysisId: Sha256HexSchema,
    revision: z.number().int().nonnegative(),
    decisionRevision: z.number().int().nonnegative(),
    originalHash: Sha256HexSchema,
    candidateHash: Sha256HexSchema,
    outputHash: Sha256HexSchema,
    protections: z.array(ProtectedRangeSchema),
    protectedMappings: z.array(ProtectedMappingSchema),
    hunks: z.array(
      z
        .object({
          id: z.string().min(1),
          start: z.number().int().nonnegative(),
          end: z.number().int().nonnegative(),
          decision: z.enum(['accepted', 'rejected', 'blocked']),
        })
        .strict(),
    ),
    counts: z
      .object({
        accepted: z.number().int().nonnegative(),
        rejected: z.number().int().nonnegative(),
        blocked: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Fixture 契约（项目书 §11.3、实施计划 §9）
// ---------------------------------------------------------------------------

export const FixtureActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('analyze'), revision: z.number().int().nonnegative(), jobId: z.string().min(1) }).strict(),
  z.object({ type: z.literal('applyDecisions') }).strict(),
  z.object({ type: z.literal('compose') }).strict(),
  z.object({ type: z.literal('validate'), field: z.enum(['original', 'candidate']) }).strict(),
  z.object({ type: z.literal('changeOriginal'), revision: z.number().int().nonnegative(), file: z.string().min(1) }).strict(),
  z.object({ type: z.literal('changeCandidate'), revision: z.number().int().nonnegative(), file: z.string().min(1) }).strict(),
  z.object({ type: z.literal('changeProtections'), revision: z.number().int().nonnegative(), file: z.string().min(1) }).strict(),
  z.object({ type: z.literal('cancel'), jobId: z.string().min(1) }).strict(),
  z.object({ type: z.literal('clear') }).strict(),
  z.object({ type: z.literal('lateResponse'), jobId: z.string().min(1), revision: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal('keepRemaining') }).strict(),
  z.object({ type: z.literal('export') }).strict(),
]);

export const FixtureExpectedStateSchema = z
  .object({
    phase: SessionPhaseSchema,
    analysisNull: z.boolean(),
    exportable: z.boolean(),
    decisionsEmpty: z.boolean().optional(),
  })
  .strict();

export const FixtureCaseSchema = z
  .object({
    id: z.string().regex(/^EP-F\d{2}$/),
    kind: z.enum(['compose', 'validation', 'workflow']),
    title: z.string().min(1),
    description: z.string().min(1),
    originalFile: z.string().min(1),
    candidateFile: z.string().min(1).optional(),
    protectionsFile: z.string().min(1).optional(),
    decisionsFile: z.string().min(1).optional(),
    /** 原始 fixture 文件的行尾：默认 LF；CRLF 仅用于 F13 规范化案例。 */
    lineEndings: z.enum(['LF', 'CRLF']).optional(),
    actions: z.array(FixtureActionSchema).min(1),
    expectedOutcome: z.enum(['success', 'error', 'state']),
    expectedErrorCode: ErrorCodeSchema.optional(),
    /** validation 案例的输入问题细分码（此时 expectedErrorCode 应为 INVALID_INPUT）。 */
    expectedIssueCode: InputIssueCodeSchema.optional(),
    expectedState: FixtureExpectedStateSchema.optional(),
    hasText: z.boolean(),
    notes: z.string().optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.expectedOutcome === 'error' && !c.expectedErrorCode) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'error outcome requires expectedErrorCode' });
    }
    if (c.expectedOutcome === 'state' && !c.expectedState) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'state outcome requires expectedState' });
    }
    if (c.expectedOutcome === 'success' && (c.expectedErrorCode || c.expectedState)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'success outcome must not carry expectedErrorCode or expectedState' });
    }
    if (c.kind === 'validation' && c.expectedOutcome !== 'error') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'validation kind must expect an error outcome' });
    }
    if (c.kind === 'validation' && c.expectedErrorCode !== 'INVALID_INPUT') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'validation kind must expect INVALID_INPUT with an expectedIssueCode' });
    }
    if (c.kind === 'validation' && !c.expectedIssueCode) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'validation kind requires expectedIssueCode' });
    }
    if (c.kind === 'compose' && c.expectedOutcome === 'state') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'compose kind cannot expect a state outcome' });
    }
  });

export type FixtureCase = z.infer<typeof FixtureCaseSchema>;
export type FixtureAction = z.infer<typeof FixtureActionSchema>;
export type FixtureExpectedState = z.infer<typeof FixtureExpectedStateSchema>;

/** protections.json 文件契约。 */
export const ProtectionsFileSchema = z
  .object({ version: z.literal('1.0.0'), protections: z.array(ProtectedRangeSchema) })
  .strict();

export type ProtectionsFile = z.infer<typeof ProtectionsFileSchema>;

/**
 * decisions.json 文件契约：决定以原稿区间表达（UTF-16 代码单元，
 * 规范化后坐标），不依赖尚未生成的 Hunk ID。
 * accepted 必须带 newText（该区间对应的改稿文字，可为空字符串表示删除）；
 * rejected 不需要 newText；blocked 由保护冲突自动判定，不出现在本文件。
 */
export const DecisionEntrySchema = z
  .object({
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    decision: z.enum(['accepted', 'rejected']),
    newText: z.string().optional(),
  })
  .strict()
  .refine((e) => e.end >= e.start, { message: 'decision end must be >= start' })
  .refine((e) => e.decision === 'rejected' || typeof e.newText === 'string', {
    message: 'accepted decision requires newText',
  });

export const DecisionsFileSchema = z
  .object({ version: z.literal('1.0.0'), decisions: z.array(DecisionEntrySchema) })
  .strict();

export type DecisionEntry = z.infer<typeof DecisionEntrySchema>;
export type DecisionsFile = z.infer<typeof DecisionsFileSchema>;

// ---------------------------------------------------------------------------
// 解析辅助（safeParse，不抛错；供测试与下游调用）
// ---------------------------------------------------------------------------

export function parseFixtureCase(data: unknown) {
  return FixtureCaseSchema.safeParse(data);
}

export function parseProtectionsFile(data: unknown) {
  return ProtectionsFileSchema.safeParse(data);
}

export function parseDecisionsFile(data: unknown) {
  return DecisionsFileSchema.safeParse(data);
}

// ---------------------------------------------------------------------------
// 异步 Web Crypto 哈希（项目书 §9.1）
// ---------------------------------------------------------------------------

/**
 * SHA-256（Web Crypto，异步）：对 TextEncoder 生成的 UTF-8 字节计算，
 * 返回小写十六进制。缺少 Web Crypto 时由调用方返回 UNSUPPORTED_ENV，
 * 本函数不提供未经核验的同步替代。
 */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// analysisId（项目书 §9.1）
// ---------------------------------------------------------------------------

export interface AnalysisIdInput {
  schemaVersion: '1.0.0';
  engineVersion: string;
  revision: number;
  jobId: string;
  originalHash: string;
  candidateHash: string;
  protections: ProtectedRange[];
}

/**
 * analysisId 的哈希输入原文：固定字段顺序的 JSON 数组
 * [schemaVersion, engineVersion, revision, jobId, originalHash,
 *  candidateHash, [[id, paragraphId, start, end], ...]]，
 * 保护项按 start/end/id 排序。供测试与独立复核直接比对。
 */
export function buildAnalysisIdPayload(input: AnalysisIdInput): string {
  const sorted = [...input.protections].sort(
    (a, b) => a.start - b.start || a.end - b.end || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const prot = sorted.map((p) => [p.id, p.paragraphId, p.start, p.end]);
  return JSON.stringify([
    input.schemaVersion,
    input.engineVersion,
    input.revision,
    input.jobId,
    input.originalHash,
    input.candidateHash,
    prot,
  ]);
}

/** analysisId = SHA-256(UTF-8(buildAnalysisIdPayload(input)))，小写十六进制。 */
export async function computeAnalysisId(input: AnalysisIdInput): Promise<string> {
  return sha256Hex(buildAnalysisIdPayload(input));
}

/** 供测试直接断言的 Analysis 类型重导出。 */
export type { Analysis };
