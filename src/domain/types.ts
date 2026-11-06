/**
 * P012 改稿守约 Edit Pact — 域契约类型（T002）。
 *
 * 唯一来源：项目书 §9.1（核心类型）、§9.2（对外接口与公共辅助类型）、
 * §8（关键算法与正确性边界）、实施计划 §8（关键契约补全清单）。
 * 本文件只定义类型与契约常量，不实现任何业务逻辑。
 * 运行时校验见 ./schema.ts（Zod）；接口语义说明见 docs/CONTRACT.md。
 */

// ---------------------------------------------------------------------------
// 契约常量（项目书 §8.1、§8.2）
// ---------------------------------------------------------------------------

/** 契约 schema 版本。Analysis 与 ReviewReceipt 均固定为该值。 */
export const SCHEMA_VERSION = '1.0.0' as const;

/** 每稿最多 UTF-16 代码单元数。 */
export const MAX_TEXT_UNITS = 12000;

/** 每稿最多换行分段数。 */
export const MAX_PARAGRAPHS = 200;

/** 单个导入文件最多字节数（100 KiB）。 */
export const MAX_FILE_BYTES = 100 * 1024;

/** Worker 比较预算：maxEditLength（项目书 §8.2）。 */
export const DIFF_MAX_EDIT_LENGTH = 2048;

/** Worker 比较预算：算法 timeout（ms，项目书 §8.2）。 */
export const DIFF_TIMEOUT_MS = 800;

/** 主线程等待 Worker 有效结果的上限（ms，项目书 §8.2）。 */
export const WORKER_WAIT_MS = 1500;

// ---------------------------------------------------------------------------
// 错误码（项目书 §9.2）
// ---------------------------------------------------------------------------

export type ErrorCode =
  | 'INVALID_INPUT'
  | 'TOO_COMPLEX'
  | 'CANCELLED'
  | 'STALE_ANALYSIS'
  | 'PENDING_REVIEW'
  | 'PROTECTED_CHANGE'
  | 'INVALID_PATCH'
  | 'UNKNOWN_HUNK'
  | 'UNSUPPORTED_ENV';

/** 全部 8 个错误码（供校验与文档枚举使用）。 */
export const ERROR_CODES: readonly ErrorCode[] = [
  'INVALID_INPUT',
  'TOO_COMPLEX',
  'CANCELLED',
  'STALE_ANALYSIS',
  'PENDING_REVIEW',
  'PROTECTED_CHANGE',
  'INVALID_PATCH',
  'UNKNOWN_HUNK',
  'UNSUPPORTED_ENV',
] as const;

// ---------------------------------------------------------------------------
// 核心类型（项目书 §9.1）
// ---------------------------------------------------------------------------

export type Decision = 'pending' | 'accepted' | 'rejected' | 'blocked';

/**
 * 保护范围。范围为 [start, end)，不包含段末 LF；
 * 所有偏移均为规范化原稿中的 UTF-16 代码单元位置（项目书 §8.1）。
 */
export interface ProtectedRange {
  id: string;
  paragraphId: string;
  start: number;
  end: number;
}

export interface Hunk {
  id: string;
  start: number;
  end: number;
  oldText: string;
  newText: string;
  /** 冲突的保护范围 id 列表；为空表示无冲突。 */
  conflicts: string[];
  decision: Decision;
}

export type RawHunk = Pick<Hunk, 'id' | 'start' | 'end' | 'oldText' | 'newText'>;

export interface Analysis {
  schemaVersion: '1.0.0';
  engineVersion: string;
  revision: number;
  jobId: string;
  analysisId: string;
  originalHash: string;
  candidateHash: string;
  protections: ProtectedRange[];
  hunks: Hunk[];
}

export type SessionPhase = 'prepare' | 'comparing' | 'review' | 'ready' | 'error';

export interface ReviewSession {
  original: string;
  candidate: string;
  revision: number;
  decisionRevision: number;
  phase: SessionPhase;
  protections: ProtectedRange[];
  analysis: Analysis | null;
}

// ---------------------------------------------------------------------------
// 公共辅助类型（项目书 §9.2）
// ---------------------------------------------------------------------------

export type InputIssueCode =
  | 'EMPTY_ORIGINAL'
  | 'TOO_LONG'
  | 'TOO_MANY_PARAGRAPHS'
  | 'INVALID_UNICODE'
  | 'INVALID_UTF8'
  | 'FILE_TOO_LARGE';

export interface InputIssue {
  code: InputIssueCode;
  field: 'original' | 'candidate';
  limit: number | null;
  actual: number | null;
}

export interface Paragraph {
  id: string;
  start: number;
  end: number;
  text: string;
  isBlank: boolean;
}

export interface AnalyzeRequest {
  original: string;
  candidate: string;
  protections: ProtectedRange[];
  revision: number;
  jobId: string;
  engineVersion: string;
}

export type AnalyzeResult =
  | { ok: true; analysis: Analysis }
  | { ok: false; errorCode: ErrorCode; revision: number; jobId: string };

export type GuardResult = { ok: true; hunks: Hunk[] } | { ok: false; errorCode: ErrorCode };

export type DecisionResult = { ok: true; session: ReviewSession } | { ok: false; errorCode: ErrorCode };

export interface ProtectedMapping {
  protectionId: string;
  sourceStart: number;
  sourceEnd: number;
  outputStart: number;
  outputEnd: number;
}

export interface ComposeSuccess {
  ok: true;
  text: string;
  outputHash: string;
  analysisId: string;
  revision: number;
  decisionRevision: number;
  protectedMappings: ProtectedMapping[];
}

export type ComposeResult = ComposeSuccess | { ok: false; errorCode: ErrorCode };

/**
 * 审阅回执：仅版本、哈希、区间、状态和计数。
 * 不得包含 original、candidate、oldText、newText 或用户目标文本（项目书 §9.3）。
 */
export interface ReviewReceipt {
  schemaVersion: '1.0.0';
  engineVersion: string;
  analysisId: string;
  revision: number;
  decisionRevision: number;
  originalHash: string;
  candidateHash: string;
  outputHash: string;
  protections: ProtectedRange[];
  protectedMappings: ProtectedMapping[];
  hunks: { id: string; start: number; end: number; decision: Exclude<Decision, 'pending'> }[];
  counts: { accepted: number; rejected: number; blocked: number };
}

// ---------------------------------------------------------------------------
// 对外接口签名（项目书 §9.2；实现分别归属 T003–T009）
// ---------------------------------------------------------------------------

export type Canonicalize = (text: string) => string;
export type ValidateInput = (text: string, field: 'original' | 'candidate') => InputIssue[];
export type SplitParagraphs = (original: string) => Paragraph[];
export type ClassifyHunks = (
  original: string,
  hunks: RawHunk[],
  protections: ProtectedRange[],
) => GuardResult;
export type Analyze = (request: AnalyzeRequest) => Promise<AnalyzeResult>;
export type SetDecision = (
  session: ReviewSession,
  analysisId: string,
  hunkId: string,
  decision: 'accepted' | 'rejected',
) => DecisionResult;
export type Compose = (session: Readonly<ReviewSession>) => Promise<ComposeResult>;
export type MakeReceipt = (
  session: Readonly<ReviewSession>,
  result: ComposeSuccess,
) => ReviewReceipt;
export type ExportText = (text: string) => Blob;
export type ClearSession = (session: ReviewSession) => ReviewSession;

// ---------------------------------------------------------------------------
// UI 回调（实施计划 §8：组件不直接写 session）
// ---------------------------------------------------------------------------

export interface UiCallbacks {
  onProtectionChange(protections: ProtectedRange[]): void;
  onCompare(): void;
  onDecision(hunkId: string, decision: 'accepted' | 'rejected'): void;
  onKeepRemaining(): void;
  onClear(): void;
}

// ---------------------------------------------------------------------------
// Worker 协议（实施计划 §8：一个活动 job；取消终止 Worker，下次重建；
// 所有结果先验证 revision/jobId）
// ---------------------------------------------------------------------------

export type WorkerRequest =
  | { type: 'analyze'; request: AnalyzeRequest }
  | { type: 'cancel'; jobId: string };

export type WorkerResponse =
  | { type: 'result'; result: AnalyzeResult }
  | { type: 'error'; errorCode: ErrorCode; revision: number; jobId: string };
