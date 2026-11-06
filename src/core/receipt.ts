/**
 * P012 改稿守约 Edit Pact — 无正文审阅回执（T009）。
 *
 * 来源：项目书 §9.3（回执字段：schemaVersion、engineVersion、
 * analysisId、revision、decisionRevision、三个文本哈希、保护范围与
 * 映射、hunk 原稿区间、decision、accepted/rejected/blocked 计数；
 * 不得包含 original、candidate、oldText、newText 或用户目标文本）、
 * CONTRACT.md §1.1（makeReceipt 冻结签名：三个版本标识均需一致且
 * 无 pending，否则抛出带错误码的受控错误）、§5（三个标识复核）。
 *
 * 回执是可选的本次审阅记录，不是便携记忆包，不支持导入恢复，
 * 也不发送给模型。回执可证明版本对应关系，不能单独重建全文，
 * 不能证明模型输出为真。
 */

import { ReviewReceiptSchema } from '../domain/schema';
import type {
  ComposeSuccess,
  ErrorCode,
  ReviewReceipt,
  ReviewSession,
} from '../domain/types';

/** 带错误码的受控错误（调用方按 errorCode 展示，不当作崩溃）。 */
export class ReceiptError extends Error {
  readonly errorCode: ErrorCode;

  constructor(errorCode: ErrorCode, message: string) {
    super(message);
    this.name = 'ReceiptError';
    this.errorCode = errorCode;
  }
}

/**
 * 按冻结签名交付：从当前 session 与 compose 的成功结果生成回执。
 * 生成前复核三个版本标识（analysisId、revision、decisionRevision）
 * 均一致，且无任何 pending；任一不符抛出带错误码的受控错误。
 * 另复核 Hunk 的 conflicts 与 decision 一致（冲突的 Hunk 必须为
 * blocked，accepted 的 Hunk 不得带冲突；与 compose 的检查一致），
 * 防止篡改过的 session 配上旧成稿生成回执。生成后用
 * ReviewReceiptSchema 再校验一次结构才返回。
 */
export function makeReceipt(
  session: Readonly<ReviewSession>,
  result: ComposeSuccess,
): ReviewReceipt {
  const analysis = session.analysis;
  if (analysis === null) {
    throw new ReceiptError('INVALID_PATCH', '没有可回执的分析结果。');
  }
  if (result.analysisId !== analysis.analysisId) {
    throw new ReceiptError('INVALID_PATCH', '成稿与当前分析不对应。');
  }
  if (result.revision !== session.revision) {
    throw new ReceiptError('INVALID_PATCH', '成稿与当前输入版本不对应。');
  }
  if (result.decisionRevision !== session.decisionRevision) {
    throw new ReceiptError('INVALID_PATCH', '成稿与当前决定版本不对应。');
  }
  if (analysis.hunks.some((hunk) => hunk.decision === 'pending')) {
    throw new ReceiptError('PENDING_REVIEW', '仍有待审项，不能生成回执。');
  }
  for (const hunk of analysis.hunks) {
    const hasConflict = hunk.conflicts.length > 0;
    if (hasConflict !== (hunk.decision === 'blocked')) {
      throw new ReceiptError(
        'INVALID_PATCH',
        '审阅状态与保护冲突不一致，不能生成回执。',
      );
    }
  }

  const counts = { accepted: 0, rejected: 0, blocked: 0 };
  const hunks = analysis.hunks.map((hunk) => {
    if (hunk.decision === 'blocked') {
      counts.blocked += 1;
    } else if (hunk.decision === 'accepted') {
      counts.accepted += 1;
    } else {
      counts.rejected += 1;
    }
    return {
      id: hunk.id,
      start: hunk.start,
      end: hunk.end,
      decision: hunk.decision as 'accepted' | 'rejected' | 'blocked',
    };
  });

  const receipt: ReviewReceipt = {
    schemaVersion: '1.0.0',
    engineVersion: analysis.engineVersion,
    analysisId: analysis.analysisId,
    revision: session.revision,
    decisionRevision: session.decisionRevision,
    originalHash: analysis.originalHash,
    candidateHash: analysis.candidateHash,
    outputHash: result.outputHash,
    protections: analysis.protections.map((protection) => ({ ...protection })),
    protectedMappings: result.protectedMappings.map((mapping) => ({ ...mapping })),
    hunks,
    counts,
  };
  const parsed = ReviewReceiptSchema.safeParse(receipt);
  if (!parsed.success) {
    throw new ReceiptError('INVALID_PATCH', '回执结构校验失败。');
  }
  return parsed.data;
}
