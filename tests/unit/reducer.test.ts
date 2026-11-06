import { describe, expect, it } from 'vitest';
import type {
  Analysis,
  AnalyzeResult,
  ProtectedRange,
  RawHunk,
  ReviewSession,
} from '../../src/domain/types';
import { computeAnalysisId, sha256Hex } from '../../src/domain/schema';
import { compose } from '../../src/core/compose';
import { classifyHunks } from '../../src/core/guards';
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

const ENGINE_VERSION = '1.0.0+test-0.0.0';

async function buildAnalysis(
  original: string,
  candidate: string,
  hunks: RawHunk[],
  protections: ProtectedRange[] = [],
  revision = 1,
  jobId = 'job-1',
): Promise<Analysis> {
  const classified = classifyHunks(original, hunks, protections);
  if (!classified.ok) throw new Error('test setup: classifyHunks failed');
  const originalHash = await sha256Hex(original);
  const candidateHash = await sha256Hex(candidate);
  const analysisId = await computeAnalysisId({
    schemaVersion: '1.0.0',
    engineVersion: ENGINE_VERSION,
    revision,
    jobId,
    originalHash,
    candidateHash,
    protections,
  });
  return {
    schemaVersion: '1.0.0',
    engineVersion: ENGINE_VERSION,
    revision,
    jobId,
    analysisId,
    originalHash,
    candidateHash,
    protections: protections.map((protection) => ({ ...protection })),
    hunks: classified.hunks,
  };
}

function buildSession(
  analysis: Analysis | null,
  overrides: Partial<ReviewSession> = {},
): ReviewSession {
  return {
    original: 'abc',
    candidate: 'xyz',
    revision: analysis?.revision ?? 1,
    decisionRevision: 1,
    phase: analysis === null ? 'prepare' : 'review',
    protections: analysis?.protections.map((protection) => ({ ...protection })) ?? [],
    analysis,
    ...overrides,
  };
}

async function simpleAnalysis(revision = 1, jobId = 'job-1'): Promise<Analysis> {
  return buildAnalysis('abc', 'xyz', [
    { id: 'h1', start: 0, end: 3, oldText: 'abc', newText: 'xyz' },
  ], [], revision, jobId);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

describe('setDecision and keepRemaining', () => {
  it('accepts a pending Hunk immutably and advances decisionRevision', async () => {
    const analysis = await simpleAnalysis();
    const session = buildSession(analysis);
    const result = setDecision(session, analysis.analysisId, 'h1', 'accepted');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('result.ok should be true');
    expect(result.session.analysis?.hunks[0].decision).toBe('accepted');
    expect(result.session.decisionRevision).toBe(2);
    expect(result.session).not.toBe(session);
    expect(result.session.analysis).not.toBe(session.analysis);
    expect(result.session.analysis?.hunks[0]).not.toBe(session.analysis?.hunks[0]);
    expect(session.analysis?.hunks[0].decision).toBe('pending');
  });

  it('rejects accepted for a conflicts-bearing Hunk even when its decision was tampered to pending', async () => {
    const protection = { id: 'p1', paragraphId: 'p1', start: 0, end: 3 };
    const analysis = await buildAnalysis(
      'abc',
      'xyz',
      [{ id: 'h1', start: 0, end: 3, oldText: 'abc', newText: 'xyz' }],
      [protection],
    );
    expect(analysis.hunks[0].decision).toBe('blocked');
    const tampered: Analysis = {
      ...analysis,
      hunks: [{ ...analysis.hunks[0], decision: 'pending' }],
    };
    const session = buildSession(tampered, { protections: [protection] });

    expect(setDecision(session, analysis.analysisId, 'h1', 'accepted')).toEqual({
      ok: false,
      errorCode: 'PROTECTED_CHANGE',
    });
    expect(session.analysis?.hunks[0].decision).toBe('pending');
  });

  it('is idempotent and preserves the session reference for identical decisions', async () => {
    const analysis = await simpleAnalysis();
    const accepted: Analysis = {
      ...analysis,
      hunks: analysis.hunks.map((hunk) => ({ ...hunk, decision: 'accepted' })),
    };
    const session = buildSession(accepted);

    const result = setDecision(session, analysis.analysisId, 'h1', 'accepted');
    expect(result).toEqual({ ok: true, session });
    expect(result.ok && result.session).toBe(session);
    expect(session.decisionRevision).toBe(1);
  });

  it('returns STALE_ANALYSIS and UNKNOWN_HUNK without changing session', async () => {
    const analysis = await simpleAnalysis();
    const session = buildSession(analysis);

    expect(setDecision(session, 'e'.repeat(64), 'h1', 'accepted')).toEqual({
      ok: false,
      errorCode: 'STALE_ANALYSIS',
    });
    expect(setDecision(session, analysis.analysisId, 'missing', 'rejected')).toEqual({
      ok: false,
      errorCode: 'UNKNOWN_HUNK',
    });
    expect(session.analysis?.hunks[0].decision).toBe('pending');
    expect(session.decisionRevision).toBe(1);
  });

  it('requires the current analysisId to keep remaining Hunk decisions', async () => {
    const analysis = await simpleAnalysis();
    const session = buildSession(analysis);
    expect(keepRemaining(session, 'e'.repeat(64))).toEqual({
      ok: false,
      errorCode: 'STALE_ANALYSIS',
    });
    const kept = keepRemaining(session, analysis.analysisId);
    expect(kept.ok).toBe(true);
    if (!kept.ok) throw new Error('keepRemaining should succeed');
    expect(kept.session.analysis?.hunks[0].decision).toBe('rejected');
    expect(kept.session.decisionRevision).toBe(2);
    expect(keepRemaining(kept.session, analysis.analysisId)).toEqual({
      ok: true,
      session: kept.session,
    });
  });

  it('preserves blocked hunks when keeping pending decisions', async () => {
    const protection = { id: 'p1', paragraphId: 'p1', start: 0, end: 3 };
    const analysis = await buildAnalysis(
      'abcdef',
      'xyzuvw',
      [
        { id: 'h1', start: 0, end: 3, oldText: 'abc', newText: 'xyz' },
        { id: 'h2', start: 3, end: 6, oldText: 'def', newText: 'uvw' },
      ],
      [protection],
    );
    const session = buildSession(analysis, { original: 'abcdef', candidate: 'xyzuvw' });
    const result = keepRemaining(session, analysis.analysisId);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('keepRemaining should succeed');
    expect(result.session.analysis?.hunks.map((hunk) => hunk.decision)).toEqual([
      'blocked',
      'rejected',
    ]);
  });
});

describe('input and protection invalidation (EP-F17–F19)', () => {
  it('changeOriginal clears candidate, protections and analysis and prevents A→B→C→B approval reuse (F17)', async () => {
    const protection = { id: 'p1', paragraphId: 'p1', start: 0, end: 3 };
    const analysis = await buildAnalysis(
      'abc',
      'xyz',
      [{ id: 'h1', start: 0, end: 3, oldText: 'abc', newText: 'xyz' }],
      [protection],
    );
    const initial = buildSession(analysis, { protections: [protection] });
    const changedB = changeOriginal(initial, 'b\r\ntext', 2);
    expect(changedB).toMatchObject({
      original: 'b\ntext',
      candidate: '',
      revision: 2,
      phase: 'prepare',
      protections: [],
      analysis: null,
      decisionRevision: initial.decisionRevision,
    });
    const changedC = changeOriginal(changedB, 'c', 3);
    const restoredA = changeOriginal(changedC, 'abc', 4);
    const newAnalysis = await simpleAnalysis(4, 'job-new');
    const restoredSession = buildSession(newAnalysis, {
      original: restoredA.original,
      candidate: 'xyz',
      revision: 4,
    });
    expect(setDecision(restoredSession, analysis.analysisId, 'h1', 'accepted')).toEqual({
      ok: false,
      errorCode: 'STALE_ANALYSIS',
    });
    expect(newAnalysis.analysisId).not.toBe(analysis.analysisId);
  });

  it('changeCandidate canonicalizes the input and preserves original and protections (F18)', async () => {
    const protection = { id: 'p1', paragraphId: 'p1', start: 0, end: 3 };
    const analysis = await buildAnalysis(
      'abc',
      'xyz',
      [{ id: 'h1', start: 0, end: 3, oldText: 'abc', newText: 'xyz' }],
      [protection],
    );
    const session = buildSession(analysis, { protections: [protection] });
    const changed = changeCandidate(session, 'new\r\ncandidate', 2);
    expect(changed).toMatchObject({
      original: 'abc',
      candidate: 'new\ncandidate',
      revision: 2,
      phase: 'prepare',
      protections: [protection],
      analysis: null,
    });
    expect(changed.decisionRevision).toBe(session.decisionRevision);
  });

  it('changeProtections copies protections, retains both texts and invalidates decisions (F19)', async () => {
    const analysis = await simpleAnalysis();
    const session = buildSession(analysis);
    const protections = [{ id: 'p2', paragraphId: 'p1', start: 0, end: 1 }];
    const changed = changeProtections(session, protections, 2);
    protections[0].id = 'mutated';
    expect(changed).toMatchObject({
      original: 'abc',
      candidate: 'xyz',
      revision: 2,
      phase: 'prepare',
      analysis: null,
    });
    expect(changed.protections).toEqual([
      { id: 'p2', paragraphId: 'p1', start: 0, end: 1 },
    ]);
    expect(changed.decisionRevision).toBe(session.decisionRevision);
  });

  it('rejects non-integer or non-increasing revisions', () => {
    const session = buildSession(null, { revision: 3 });
    expect(() => changeOriginal(session, 'x', 3)).toThrow(TypeError);
    expect(() => changeCandidate(session, 'x', 2)).toThrow(TypeError);
    expect(() => changeProtections(session, [], 3.5)).toThrow(TypeError);
  });
});

describe('comparison lifecycle', () => {
  it('applies only current successful and error results for the active job', async () => {
    const analysis = await simpleAnalysis(2, 'job-current');
    const comparing = beginCompare(buildSession(null, { revision: 2 }));
    const success: AnalyzeResult = { ok: true, analysis };

    expect(applyAnalysisResult(comparing, success, 'job-old')).toEqual({
      applied: false,
      session: comparing,
    });
    expect(applyAnalysisResult(comparing, success, 'job-current')).toMatchObject({
      applied: true,
      session: { phase: 'review', analysis },
    });

    const errorResult: AnalyzeResult = {
      ok: false,
      errorCode: 'TOO_COMPLEX',
      revision: 2,
      jobId: 'job-current',
    };
    expect(applyAnalysisResult(comparing, errorResult, 'job-current')).toMatchObject({
      applied: true,
      session: { phase: 'error', analysis: null },
    });
    expect(applyAnalysisResult(comparing, { ...errorResult, revision: 1 }, 'job-current')).toEqual({
      applied: false,
      session: comparing,
    });
  });

  it('refuses to begin or apply while IME composition is active', async () => {
    const session = buildSession(null);
    expect(beginCompare(session, { isComposing: true })).toBe(session);

    const comparing = beginCompare(session);
    const result: AnalyzeResult = { ok: true, analysis: await simpleAnalysis() };
    expect(applyAnalysisResult(comparing, result, 'job-1', { isComposing: true })).toEqual({
      applied: false,
      session: comparing,
    });
  });

  it('cancels the active comparison and discards any result (F22)', async () => {
    const session = buildSession(null);
    const comparing = beginCompare(session);
    expect(comparing.phase).toBe('comparing');
    const cancelled = cancelCompare(comparing);
    expect(cancelled).toMatchObject({ phase: 'prepare', analysis: null });
    const lateResult: AnalyzeResult = { ok: true, analysis: await simpleAnalysis() };
    expect(applyAnalysisResult(cancelled, lateResult, 'job-1')).toEqual({
      applied: false,
      session: cancelled,
    });
  });

  it('does not cancel a completed review analysis', async () => {
    const analysis = await simpleAnalysis();
    const session = buildSession(analysis);
    expect(session.phase).toBe('review');

    const cancelled = cancelCompare(session);
    expect(cancelled).toBe(session);
    expect(cancelled.phase).toBe('review');
    expect(cancelled.analysis).toBe(analysis);
  });

  it('copies a successful analysis result and isolates it from later caller mutation', async () => {
    const analysis = await simpleAnalysis();
    const comparing = beginCompare(buildSession(null));
    const result: AnalyzeResult = { ok: true, analysis };
    const applied = applyAnalysisResult(comparing, result, analysis.jobId);

    expect(applied.applied).toBe(true);
    expect(applied.session.analysis).not.toBe(result.analysis);
    expect(applied.session.analysis?.protections).not.toBe(result.analysis.protections);
    expect(applied.session.analysis?.hunks).not.toBe(result.analysis.hunks);
    expect(applied.session.analysis?.hunks[0]).not.toBe(result.analysis.hunks[0]);

    result.analysis.hunks[0].decision = 'accepted';
    expect(applied.session.analysis?.hunks[0].decision).toBe('pending');
  });

  it('clears to a fresh empty session and discards a late response (F24)', async () => {
    const analysis = await simpleAnalysis();
    const session = buildSession(analysis);
    const cleared = clearSession(session);
    expect(cleared).toEqual({
      original: '',
      candidate: '',
      revision: 0,
      decisionRevision: 0,
      phase: 'prepare',
      protections: [],
      analysis: null,
    });
    const lateResult: AnalyzeResult = { ok: true, analysis };
    const applied = applyAnalysisResult(cleared, lateResult, analysis.jobId);
    expect(applied).toEqual({ applied: false, session: cleared });
    expect(applied.session).toBe(cleared);
  });
});

describe('compose authorization and immutability', () => {
  it('invalidates a real compose result when an accepted Hunk is revoked', async () => {
    const analysis = await simpleAnalysis();
    const session = buildSession(analysis);
    const acceptedResult = setDecision(session, analysis.analysisId, 'h1', 'accepted');
    expect(acceptedResult.ok).toBe(true);
    if (!acceptedResult.ok) throw new Error('accept should succeed');
    const firstCompose = await compose(acceptedResult.session);
    expect(firstCompose.ok).toBe(true);
    if (!firstCompose.ok) throw new Error('compose should succeed');

    const revokedResult = setDecision(
      acceptedResult.session,
      analysis.analysisId,
      'h1',
      'rejected',
    );
    expect(revokedResult.ok).toBe(true);
    if (!revokedResult.ok) throw new Error('revoke should succeed');
    expect(revokedResult.session.decisionRevision).toBe(firstCompose.decisionRevision + 1);
    const secondCompose = await compose(revokedResult.session);
    expect(secondCompose.ok).toBe(true);
    if (!secondCompose.ok) throw new Error('compose after revoke should succeed');
    expect(secondCompose.text).toBe('abc');
    expect(firstCompose.text).toBe('xyz');
    expect(
      firstCompose.analysisId === revokedResult.session.analysis?.analysisId &&
        firstCompose.revision === revokedResult.session.revision &&
        firstCompose.decisionRevision === revokedResult.session.decisionRevision,
    ).toBe(false);
  });

  it('supports immutable transitions from deeply frozen inputs', async () => {
    const analysis = await simpleAnalysis();
    const frozen = deepFreeze(buildSession(analysis));
    const decision = setDecision(frozen, analysis.analysisId, 'h1', 'accepted');
    expect(decision.ok).toBe(true);
    if (!decision.ok) throw new Error('decision should succeed');
    expect(frozen.analysis?.hunks[0].decision).toBe('pending');
    const changed = changeProtections(frozen, [], 2);
    expect(changed).not.toBe(frozen);
    expect(changed.analysis).toBeNull();
    expect(frozen.revision).toBe(1);
  });
});
