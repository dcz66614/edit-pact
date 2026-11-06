/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/core/analyze';
import { compose } from '../../src/core/compose';
import { ENGINE_VERSION } from '../../src/core/diff';
import { makeReceipt, ReceiptError } from '../../src/core/receipt';
import { keepRemaining, setDecision } from '../../src/core/reducer';
import { splitParagraphs } from '../../src/core/text';
import type {
  ComposeSuccess,
  ReviewSession,
} from '../../src/domain/types';

// 项目书 §11.1 正常混合采纳样例：保护第二段，接受其余两处改动。
const ORIGINAL = '请于周五确认。\n人数上限为30人。\n谢谢配合。';
const CANDIDATE = '请在周五前回复确认。\n人数上限为50人。\n感谢配合。';
const EXPECTED = '请在周五前回复确认。\n人数上限为30人。\n感谢配合。';

async function buildDecidedSession(): Promise<{
  session: ReviewSession;
  result: ComposeSuccess;
}> {
  const paragraphs = splitParagraphs(ORIGINAL);
  const second = paragraphs[1];
  const analyzed = await analyze({
    original: ORIGINAL,
    candidate: CANDIDATE,
    protections: [
      {
        id: 'prot-1',
        paragraphId: second.id,
        start: second.start,
        end: second.end,
      },
    ],
    revision: 1,
    jobId: 'receipt-job-1',
    engineVersion: ENGINE_VERSION,
  });
  expect(analyzed.ok).toBe(true);
  if (!analyzed.ok) {
    throw new Error('analyze failed in test setup');
  }
  let session: ReviewSession = {
    original: ORIGINAL,
    candidate: CANDIDATE,
    revision: 1,
    decisionRevision: 0,
    phase: 'review',
    protections: analyzed.analysis.protections,
    analysis: analyzed.analysis,
  };
  // 接受全部待审项（保护冲突项已是 blocked，不参与）。
  for (const hunk of analyzed.analysis.hunks) {
    if (hunk.decision !== 'pending') {
      continue;
    }
    const decided = setDecision(
      session,
      analyzed.analysis.analysisId,
      hunk.id,
      'accepted',
    );
    expect(decided.ok).toBe(true);
    if (decided.ok) {
      session = decided.session;
    }
  }
  const composed = await compose(session);
  expect(composed.ok).toBe(true);
  if (!composed.ok) {
    throw new Error('compose failed in test setup');
  }
  expect(composed.text).toBe(EXPECTED);
  return { session, result: composed };
}

describe('makeReceipt', () => {
  it('成功回执：三标识一致、计数正确、不含任何正文', async () => {
    const { session, result } = await buildDecidedSession();
    const receipt = makeReceipt(session, result);
    expect(receipt.schemaVersion).toBe('1.0.0');
    expect(receipt.engineVersion).toBe(ENGINE_VERSION);
    expect(receipt.analysisId).toBe(session.analysis!.analysisId);
    expect(receipt.revision).toBe(session.revision);
    expect(receipt.decisionRevision).toBe(session.decisionRevision);
    expect(receipt.originalHash).toBe(session.analysis!.originalHash);
    expect(receipt.candidateHash).toBe(session.analysis!.candidateHash);
    expect(receipt.outputHash).toBe(result.outputHash);
    expect(receipt.protections).toHaveLength(1);
    expect(receipt.protectedMappings).toHaveLength(1);
    expect(receipt.hunks.length).toBe(session.analysis!.hunks.length);
    // 回执 hunk decision 的类型本身已排除 pending；此处再断言取值范围。
    expect(
      receipt.hunks.every((h) =>
        ['accepted', 'rejected', 'blocked'].includes(h.decision),
      ),
    ).toBe(true);
    const total =
      receipt.counts.accepted + receipt.counts.rejected + receipt.counts.blocked;
    expect(total).toBe(session.analysis!.hunks.length);
    expect(receipt.counts.blocked).toBe(1);
    // JSON 全文断言：不得出现任何正文字段（精确键名；originalHash /
    // candidateHash 是合法的哈希字段名，不在此列）或正文内容。
    const json = JSON.stringify(receipt);
    for (const banned of [
      '"original":',
      '"candidate":',
      '"oldText":',
      '"newText":',
      '"goal":',
      '请于周五确认',
      '人数上限为50人',
      '谢谢配合',
    ]) {
      expect(json).not.toContain(banned);
    }
    // 受保护文字只以哈希与区间形式出现，不以明文出现。
    expect(json).not.toContain('人数上限为30人');
  });

  it('仍有 pending → PENDING_REVIEW', async () => {
    const { session, result } = await buildDecidedSession();
    const pendingSession: ReviewSession = {
      ...session,
      analysis: {
        ...session.analysis!,
        hunks: session.analysis!.hunks.map((hunk) =>
          hunk.decision === 'accepted'
            ? { ...hunk, decision: 'pending' as const }
            : hunk,
        ),
      },
    };
    let thrown: unknown = null;
    try {
      makeReceipt(pendingSession, result);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ReceiptError);
    expect((thrown as ReceiptError).errorCode).toBe('PENDING_REVIEW');
  });

  it('analysisId 不一致 → INVALID_PATCH', async () => {
    const { session, result } = await buildDecidedSession();
    const tampered: ComposeSuccess = {
      ...result,
      analysisId: 'a'.repeat(64),
    };
    let thrown: unknown = null;
    try {
      makeReceipt(session, tampered);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ReceiptError);
    expect((thrown as ReceiptError).errorCode).toBe('INVALID_PATCH');
  });

  it('decisionRevision 不一致 → INVALID_PATCH', async () => {
    const { session, result } = await buildDecidedSession();
    const stale: ComposeSuccess = {
      ...result,
      decisionRevision: result.decisionRevision + 1,
    };
    let thrown: unknown = null;
    try {
      makeReceipt(session, stale);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ReceiptError);
    expect((thrown as ReceiptError).errorCode).toBe('INVALID_PATCH');
  });

  it('revision 不一致 → INVALID_PATCH', async () => {
    const { session, result } = await buildDecidedSession();
    const stale: ComposeSuccess = {
      ...result,
      revision: result.revision + 1,
    };
    let thrown: unknown = null;
    try {
      makeReceipt(session, stale);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ReceiptError);
    expect((thrown as ReceiptError).errorCode).toBe('INVALID_PATCH');
  });

  it('analysis 为 null → INVALID_PATCH', async () => {
    const { session, result } = await buildDecidedSession();
    const noAnalysis: ReviewSession = { ...session, analysis: null };
    let thrown: unknown = null;
    try {
      makeReceipt(noAnalysis, result);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ReceiptError);
    expect((thrown as ReceiptError).errorCode).toBe('INVALID_PATCH');
  });

  it('冲突 Hunk 被篡改为非 blocked → INVALID_PATCH', async () => {
    const { session, result } = await buildDecidedSession();
    const tamperedSession: ReviewSession = {
      ...session,
      analysis: {
        ...session.analysis!,
        hunks: session.analysis!.hunks.map((hunk) =>
          hunk.decision === 'blocked'
            ? { ...hunk, decision: 'rejected' as const }
            : hunk,
        ),
      },
    };
    let thrown: unknown = null;
    try {
      makeReceipt(tamperedSession, result);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ReceiptError);
    expect((thrown as ReceiptError).errorCode).toBe('INVALID_PATCH');
  });

  it('其余保留原文后回执计数随之变化', async () => {
    const { session } = await buildDecidedSession();
    // 回到待审清零前的状态：把已接受项全部撤回为 rejected 再合成。
    let reverted = session;
    for (const hunk of session.analysis!.hunks) {
      if (hunk.decision !== 'accepted') {
        continue;
      }
      const decided = setDecision(
        reverted,
        session.analysis!.analysisId,
        hunk.id,
        'rejected',
      );
      if (decided.ok) {
        reverted = decided.session;
      }
    }
    const kept = keepRemaining(reverted, session.analysis!.analysisId);
    expect(kept.ok).toBe(true);
    const composed = await compose(kept.ok ? kept.session : reverted);
    expect(composed.ok).toBe(true);
    if (!composed.ok) {
      throw new Error('compose failed in test setup');
    }
    const receipt = makeReceipt(kept.ok ? kept.session : reverted, composed);
    expect(receipt.counts.accepted).toBe(0);
    expect(receipt.counts.blocked).toBe(1);
    expect(composed.text).toBe(ORIGINAL);
  });
});
