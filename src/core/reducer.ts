/**
 * P012 改稿守约 Edit Pact — 状态与授权 reducer（T006）。
 *
 * Sources: docs/CONTRACT.md §§1, 3, 5; P012_PROJECT_BOOK.md §§8.4, 9.2;
 * P012_IMPLEMENTATION_PLAN.md §7, T006; fixture workflows EP-F17–F19,
 * EP-F22 and EP-F24.
 *
 * Contract basis:
 * - setDecision and keepRemaining bind decisions to the current analysis;
 *   decisionRevision advances only when a decision actually changes.
 * - changeOriginal, changeCandidate and changeProtections invalidate analysis
 *   and approvals by requiring a strictly newer revision.
 * - clearSession returns a fresh empty session; compare results are applied
 *   only for the active comparing phase, revision and jobId.
 * - beginCompare refuses to freeze state during IME composition; cancelCompare
 *   returns to prepare and discards any analysis.
 *
 * The contract does not define whether idempotent transitions must allocate a
 * new object, so no-op decisions and discarded results preserve the original
 * reference. New state is otherwise built immutably, including nested Hunk and
 * protection objects. This module owns only session state: compose remains the
 * authority for patch integrity and exportable text, while DiffWorkerClient
 * owns worker creation, cancellation and transport; applyAnalysisResult only
 * admits a result that still belongs to this session.
 */

import type {
  Analysis,
  AnalyzeResult,
  DecisionResult,
  ProtectedRange,
  ReviewSession,
  SetDecision,
} from '../domain/types';
import { canonicalize } from './text';

const STALE_ANALYSIS: DecisionResult = { ok: false, errorCode: 'STALE_ANALYSIS' };
const UNKNOWN_HUNK: DecisionResult = { ok: false, errorCode: 'UNKNOWN_HUNK' };

export interface TransitionOptions {
  isComposing?: boolean;
}

export interface ApplyAnalysisResult {
  applied: boolean;
  session: ReviewSession;
}

function assertNewRevision(session: ReviewSession, revision: number): void {
  if (!Number.isInteger(revision) || revision <= session.revision) {
    throw new TypeError('revision must be an integer greater than the current revision');
  }
}

export const setDecision: SetDecision = (
  session,
  analysisId,
  hunkId,
  decision,
): DecisionResult => {
  const analysis = session.analysis;
  if (
    analysis === null ||
    analysis.analysisId !== analysisId ||
    analysis.revision !== session.revision
  ) {
    return STALE_ANALYSIS;
  }

  const index = analysis.hunks.findIndex((hunk) => hunk.id === hunkId);
  if (index === -1) {
    return UNKNOWN_HUNK;
  }

  const hunk = analysis.hunks[index];
  if (decision === 'accepted' && (hunk.decision === 'blocked' || hunk.conflicts.length > 0)) {
    return { ok: false, errorCode: 'PROTECTED_CHANGE' };
  }
  if (hunk.decision === 'blocked' || hunk.decision === decision) {
    return { ok: true, session };
  }

  const nextHunks = analysis.hunks.map((entry, i) =>
    i === index ? { ...entry, decision } : entry,
  );
  return {
    ok: true,
    session: {
      ...session,
      analysis: { ...analysis, hunks: nextHunks },
      decisionRevision: session.decisionRevision + 1,
    },
  };
};

export function keepRemaining(session: ReviewSession, analysisId: string): DecisionResult {
  const analysis = session.analysis;
  if (
    analysis === null ||
    analysis.analysisId !== analysisId ||
    analysis.revision !== session.revision
  ) {
    return STALE_ANALYSIS;
  }

  let hasChange = false;
  const nextHunks = analysis.hunks.map((hunk) => {
    if (hunk.decision !== 'pending') {
      return hunk;
    }
    hasChange = true;
    return { ...hunk, decision: 'rejected' as const };
  });
  if (!hasChange) {
    return { ok: true, session };
  }
  return {
    ok: true,
    session: {
      ...session,
      analysis: { ...analysis, hunks: nextHunks },
      decisionRevision: session.decisionRevision + 1,
    },
  };
}

export function changeOriginal(
  session: ReviewSession,
  original: string,
  revision: number,
): ReviewSession {
  assertNewRevision(session, revision);
  return {
    ...session,
    original: canonicalize(original),
    candidate: '',
    revision,
    phase: 'prepare',
    protections: [],
    analysis: null,
  };
}

export function changeCandidate(
  session: ReviewSession,
  candidate: string,
  revision: number,
): ReviewSession {
  assertNewRevision(session, revision);
  return {
    ...session,
    candidate: canonicalize(candidate),
    revision,
    phase: 'prepare',
    analysis: null,
  };
}

export function changeProtections(
  session: ReviewSession,
  protections: ProtectedRange[],
  revision: number,
): ReviewSession {
  assertNewRevision(session, revision);
  return {
    ...session,
    revision,
    phase: 'prepare',
    protections: protections.map((protection) => ({ ...protection })),
    analysis: null,
  };
}

export function clearSession(_session: ReviewSession): ReviewSession {
  return {
    original: '',
    candidate: '',
    revision: 0,
    decisionRevision: 0,
    phase: 'prepare',
    protections: [],
    analysis: null,
  };
}

export function beginCompare(
  session: ReviewSession,
  opts: TransitionOptions = {},
): ReviewSession {
  if (opts.isComposing) {
    return session;
  }
  return { ...session, phase: 'comparing', analysis: null };
}

export function cancelCompare(session: ReviewSession): ReviewSession {
  if (session.phase !== 'comparing') {
    return session;
  }
  return { ...session, phase: 'prepare', analysis: null };
}

export function applyAnalysisResult(
  session: ReviewSession,
  result: AnalyzeResult,
  expectedJobId: string,
  opts: TransitionOptions = {},
): ApplyAnalysisResult {
  if (opts.isComposing || session.phase !== 'comparing') {
    return { applied: false, session };
  }

  const resultRevision = result.ok ? result.analysis.revision : result.revision;
  const resultJobId = result.ok ? result.analysis.jobId : result.jobId;
  if (
    resultRevision !== session.revision ||
    resultJobId !== expectedJobId
  ) {
    return { applied: false, session };
  }

  if (result.ok) {
    const analysis: Analysis = {
      ...result.analysis,
      protections: result.analysis.protections.map((protection) => ({ ...protection })),
      hunks: result.analysis.hunks.map((hunk) => ({ ...hunk })),
    };
    return {
      applied: true,
      session: { ...session, phase: 'review', analysis },
    };
  }
  return {
    applied: true,
    session: { ...session, phase: 'error', analysis: null },
  };
}
