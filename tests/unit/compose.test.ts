/**
 * P012 T005 — 成稿合成（compose）单元测试。
 *
 * 覆盖（任务卡完成定义：合成只读取原稿和合法 accepted；逐位置验证
 * 保护映射；任何非法状态均返回错误而不是部分成稿）：
 *  - 正常合成：F01/F03/F04/F06/F07/F08/F09/F12 的 expected.txt 逐字
 *    一致，protectedMappings 按原稿区间映射（含位移），outputHash
 *    为 Web Crypto SHA-256；
 *  - 证据：保护段删除（F06）、跨段替换（F07）、区间端点插入（F08）、
 *    重复句坐标映射（F09）、陈旧 analysisId、oldText 错配、pending
 *    导出（F20，PENDING_REVIEW 且不返回预览文字）；
 *  - 任何篡改（哈希、analysisId、revision、保护范围、conflicts、
 *    decision、newText）均返回 INVALID_PATCH，不返回部分成稿；
 *  - compose 不修改传入的 session。
 *
 * 固定测试数据：坐标全部手算并以真实 fixture 文件逐字节核对；
 * Analysis 由 schema.ts 的 sha256Hex / computeAnalysisId 现算
 * （T002 冻结辅助），engineVersion 用测试值 '1.0.0+test-0.0.0'
 * （格式同 CONTRACT.md §4；真实 jsdiff 版本由 T004 锁定）。
 */

import { describe, expect, it, vi } from 'vitest';
import { computeAnalysisId, sha256Hex } from '../../src/domain/schema';
import type {
  Analysis,
  Hunk,
  ProtectedRange,
  RawHunk,
  ReviewSession,
} from '../../src/domain/types';
import { classifyHunks } from '../../src/core/guards';
import { compose } from '../../src/core/compose';

const ENGINE_VERSION = '1.0.0+test-0.0.0';
const REVISION = 1;

/** 用 classifyHunks 得 Hunk，再按给定决定表覆写 pending 项的决定。 */
async function buildAnalysis(
  original: string,
  candidate: string,
  protections: ProtectedRange[],
  rawHunks: RawHunk[],
  decisions: Record<string, 'accepted' | 'rejected'>,
  jobId: string,
): Promise<Analysis> {
  const guard = classifyHunks(original, rawHunks, protections);
  if (!guard.ok) {
    throw new Error('test setup: classifyHunks failed');
  }
  const hunks: Hunk[] = guard.hunks.map((h) => ({
    ...h,
    decision:
      h.decision === 'blocked' ? ('blocked' as const) : (decisions[h.id] ?? 'pending'),
  }));
  const originalHash = await sha256Hex(original);
  const candidateHash = await sha256Hex(candidate);
  const analysisId = await computeAnalysisId({
    schemaVersion: '1.0.0',
    engineVersion: ENGINE_VERSION,
    revision: REVISION,
    jobId,
    originalHash,
    candidateHash,
    protections,
  });
  return {
    schemaVersion: '1.0.0',
    engineVersion: ENGINE_VERSION,
    revision: REVISION,
    jobId,
    analysisId,
    originalHash,
    candidateHash,
    protections,
    hunks,
  };
}

function buildSession(
  original: string,
  candidate: string,
  protections: ProtectedRange[],
  analysis: Analysis | null,
  overrides: Partial<ReviewSession> = {},
): ReviewSession {
  return {
    original,
    candidate,
    revision: REVISION,
    decisionRevision: 1,
    phase: 'review',
    protections,
    analysis,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 固定测试数据（手算坐标，已与 tests/fixtures/EP-Fxx 核对）
// ---------------------------------------------------------------------------

const F01 = {
  original: '请于周五确认。\n人数上限为30人。\n谢谢配合。',
  candidate: '请在周五前回复确认。\n人数上限为50人。\n感谢配合。',
  expected: '请在周五前回复确认。\n人数上限为30人。\n感谢配合。',
  protections: [{ id: 'prot-1', paragraphId: 'p2', start: 8, end: 17 }] as ProtectedRange[],
  hunks: [
    { id: 'h1', start: 0, end: 7, oldText: '请于周五确认。', newText: '请在周五前回复确认。' },
    { id: 'h2', start: 8, end: 17, oldText: '人数上限为30人。', newText: '人数上限为50人。' },
    { id: 'h3', start: 18, end: 23, oldText: '谢谢配合。', newText: '感谢配合。' },
  ] as RawHunk[],
  decisions: { h1: 'accepted', h3: 'accepted' } as Record<string, 'accepted' | 'rejected'>,
};

const F03 = {
  original: '第一段旧文字。\n第二段旧文字。\n第三段旧文字。',
  candidate: '第一段新文字。\n第二段新文字。\n第三段新文字。',
  protections: [] as ProtectedRange[],
  hunks: [
    { id: 'h1', start: 0, end: 7, oldText: '第一段旧文字。', newText: '第一段新文字。' },
    { id: 'h2', start: 8, end: 15, oldText: '第二段旧文字。', newText: '第二段新文字。' },
    { id: 'h3', start: 16, end: 23, oldText: '第三段旧文字。', newText: '第三段新文字。' },
  ] as RawHunk[],
  decisions: { h1: 'accepted', h2: 'accepted', h3: 'accepted' } as Record<
    string,
    'accepted' | 'rejected'
  >,
};

const F04 = {
  original: '第一段受保护。\n第二段受保护。\n第三段受保护。',
  candidate: '第一段已改动。\n第二段已改动。\n第三段已改动。',
  protections: [
    { id: 'prot-1', paragraphId: 'p1', start: 0, end: 7 },
    { id: 'prot-2', paragraphId: 'p2', start: 8, end: 15 },
    { id: 'prot-3', paragraphId: 'p3', start: 16, end: 23 },
  ] as ProtectedRange[],
  hunks: [
    { id: 'h1', start: 0, end: 7, oldText: '第一段受保护。', newText: '第一段已改动。' },
    { id: 'h2', start: 8, end: 15, oldText: '第二段受保护。', newText: '第二段已改动。' },
    { id: 'h3', start: 16, end: 23, oldText: '第三段受保护。', newText: '第三段已改动。' },
  ] as RawHunk[],
  decisions: {} as Record<string, 'accepted' | 'rejected'>,
};

const F06 = {
  original: '开头段不变。\n受保护段不得删除。\n结尾段需要改写。',
  candidate: '开头段不变。\n结尾段已经改写。',
  expected: '开头段不变。\n受保护段不得删除。\n结尾段已经改写。',
  protections: [{ id: 'prot-1', paragraphId: 'p2', start: 7, end: 16 }] as ProtectedRange[],
  hunks: [
    // 删除保护段的 Hunk 必须含段末 LF [7,17)，否则重建改稿会多一个换行。
    { id: 'h1', start: 7, end: 17, oldText: '受保护段不得删除。\n', newText: '' },
    { id: 'h2', start: 17, end: 25, oldText: '结尾段需要改写。', newText: '结尾段已经改写。' },
  ] as RawHunk[],
  decisions: { h2: 'accepted' } as Record<string, 'accepted' | 'rejected'>,
};

const F07 = {
  original: '第一段内容不变。\n第二段甲内容。\n第三段乙内容。\n第四段内容不变。',
  candidate: '第一段内容不变。\n第二三段合并后的内容。\n第四段内容不变。',
  expected: '第一段内容不变。\n第二段甲内容。\n第三段合并后的内容。\n第四段内容不变。',
  protections: [{ id: 'prot-1', paragraphId: 'p2', start: 9, end: 16 }] as ProtectedRange[],
  hunks: [
    // 真实最小差异（FIX-T010-01 修复后的 EP-F07 金标准，T013-04）：
    // h1 [11,18) blocked；h2 [20,21) 接受后第三段取改稿。
    // 旧版此处手写单 Hunk [9,24)，与修复后金标准矛盾，已改写。
    {
      id: 'h1',
      start: 11,
      end: 18,
      oldText: '段甲内容。\n第',
      newText: '',
    },
    {
      id: 'h2',
      start: 20,
      end: 21,
      oldText: '乙',
      newText: '合并后的',
    },
  ] as RawHunk[],
  decisions: { h2: 'accepted' } as Record<string, 'accepted' | 'rejected'>,
};

const F08 = {
  original: '保护段文字。\n普通段文字。',
  candidate: '保护段文字。插入受阻。\n普通段文字。追加内容。',
  expected: '保护段文字。\n普通段文字。追加内容。',
  protections: [{ id: 'prot-1', paragraphId: 'p1', start: 0, end: 6 }] as ProtectedRange[],
  hunks: [
    { id: 'h1', start: 6, end: 6, oldText: '', newText: '插入受阻。' },
    { id: 'h2', start: 13, end: 13, oldText: '', newText: '追加内容。' },
  ] as RawHunk[],
  decisions: { h2: 'accepted' } as Record<string, 'accepted' | 'rejected'>,
};

const F09 = {
  original: '注意：仅限内部使用。\n第一段正文。\n注意：仅限内部使用。\n第二段正文。',
  candidate:
    '注意：仅限内部使用。\n第一段正文修改版。\n注意：仅限内部使用，请勿外传。\n第二段正文。',
  expected:
    '注意：仅限内部使用。\n第一段正文修改版。\n注意：仅限内部使用，请勿外传。\n第二段正文。',
  protections: [{ id: 'prot-1', paragraphId: 'p1', start: 0, end: 10 }] as ProtectedRange[],
  hunks: [
    { id: 'h1', start: 11, end: 17, oldText: '第一段正文。', newText: '第一段正文修改版。' },
    {
      id: 'h2',
      start: 18,
      end: 28,
      oldText: '注意：仅限内部使用。',
      newText: '注意：仅限内部使用，请勿外传。',
    },
  ] as RawHunk[],
  decisions: { h1: 'accepted', h2: 'accepted' } as Record<string, 'accepted' | 'rejected'>,
};

const F12 = {
  original: '将被清空的第一段。\n将被清空的第二段。',
  candidate: '',
  protections: [] as ProtectedRange[],
  hunks: [
    {
      id: 'h1',
      start: 0,
      end: 19,
      oldText: '将被清空的第一段。\n将被清空的第二段。',
      newText: '',
    },
  ] as RawHunk[],
  decisions: { h1: 'accepted' } as Record<string, 'accepted' | 'rejected'>,
};

const F20 = {
  original: '待审第一段。\n待审第二段。',
  candidate: '待审第一段已改。\n待审第二段。',
  protections: [] as ProtectedRange[],
  hunks: [
    { id: 'h1', start: 0, end: 6, oldText: '待审第一段。', newText: '待审第一段已改。' },
  ] as RawHunk[],
  decisions: {} as Record<string, 'accepted' | 'rejected'>,
};

// ---------------------------------------------------------------------------
// 正常合成：逐位置验证保护映射
// ---------------------------------------------------------------------------

describe('compose 正常合成', () => {
  it('F01 混合采纳：成稿等于 expected.txt，保护映射随位移 [8,17)→[11,20)', async () => {
    const analysis = await buildAnalysis(
      F01.original,
      F01.candidate,
      F01.protections,
      F01.hunks,
      F01.decisions,
      'job-ep-f01-a',
    );
    const result = await compose(buildSession(F01.original, F01.candidate, F01.protections, analysis));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(F01.expected);
    expect(result.outputHash).toBe(await sha256Hex(F01.expected));
    expect(result.analysisId).toBe(analysis.analysisId);
    expect(result.revision).toBe(REVISION);
    expect(result.decisionRevision).toBe(1);
    expect(result.protectedMappings).toEqual([
      { protectionId: 'prot-1', sourceStart: 8, sourceEnd: 17, outputStart: 11, outputEnd: 20 },
    ]);
    // 映射位置的输出文字与原稿保护文字逐字相等。
    expect(result.text.slice(11, 20)).toBe('人数上限为30人。');
  });

  it('F03 无保护全部接受：成稿精确等于改稿，映射为空', async () => {
    const analysis = await buildAnalysis(
      F03.original,
      F03.candidate,
      F03.protections,
      F03.hunks,
      F03.decisions,
      'job-ep-f03-a',
    );
    const result = await compose(buildSession(F03.original, F03.candidate, F03.protections, analysis));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(F03.candidate);
    expect(result.protectedMappings).toEqual([]);
  });

  it('F04 全部保护：blocked 不计 pending，成稿等于原稿，映射为恒等', async () => {
    const analysis = await buildAnalysis(
      F04.original,
      F04.candidate,
      F04.protections,
      F04.hunks,
      F04.decisions,
      'job-ep-f04-a',
    );
    const result = await compose(buildSession(F04.original, F04.candidate, F04.protections, analysis));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(F04.original);
    expect(result.protectedMappings).toEqual([
      { protectionId: 'prot-1', sourceStart: 0, sourceEnd: 7, outputStart: 0, outputEnd: 7 },
      { protectionId: 'prot-2', sourceStart: 8, sourceEnd: 15, outputStart: 8, outputEnd: 15 },
      { protectionId: 'prot-3', sourceStart: 16, sourceEnd: 23, outputStart: 16, outputEnd: 23 },
    ]);
  });

  it('F06 保护段删除：被删的保护段保留原文，成稿等于 expected.txt', async () => {
    const analysis = await buildAnalysis(
      F06.original,
      F06.candidate,
      F06.protections,
      F06.hunks,
      F06.decisions,
      'job-ep-f06-a',
    );
    const result = await compose(buildSession(F06.original, F06.candidate, F06.protections, analysis));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(F06.expected);
    expect(result.protectedMappings).toEqual([
      { protectionId: 'prot-1', sourceStart: 7, sourceEnd: 16, outputStart: 7, outputEnd: 16 },
    ]);
    expect(result.text.slice(7, 16)).toBe('受保护段不得删除。');
  });

  it('F07 跨段替换：h1 blocked 保留第二段原文，h2 接受后第三段取改稿，成稿等于 expected.txt', async () => {
    const analysis = await buildAnalysis(
      F07.original,
      F07.candidate,
      F07.protections,
      F07.hunks,
      F07.decisions,
      'job-ep-f07-a',
    );
    const result = await compose(buildSession(F07.original, F07.candidate, F07.protections, analysis));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(F07.expected);
    expect(result.protectedMappings).toEqual([
      { protectionId: 'prot-1', sourceStart: 9, sourceEnd: 16, outputStart: 9, outputEnd: 16 },
    ]);
  });

  it('F08 区间端点插入：blocked 插入不产生文字，文末接受插入生效', async () => {
    const analysis = await buildAnalysis(
      F08.original,
      F08.candidate,
      F08.protections,
      F08.hunks,
      F08.decisions,
      'job-ep-f08-a',
    );
    const result = await compose(buildSession(F08.original, F08.candidate, F08.protections, analysis));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(F08.expected);
    expect(result.text).not.toContain('插入受阻');
    expect(result.protectedMappings).toEqual([
      { protectionId: 'prot-1', sourceStart: 0, sourceEnd: 6, outputStart: 0, outputEnd: 6 },
    ]);
  });

  it('F09 重复句坐标映射：第一次出现原样保留，第二次出现可改，映射按位置', async () => {
    const analysis = await buildAnalysis(
      F09.original,
      F09.candidate,
      F09.protections,
      F09.hunks,
      F09.decisions,
      'job-ep-f09-a',
    );
    const result = await compose(buildSession(F09.original, F09.candidate, F09.protections, analysis));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(F09.expected);
    expect(result.protectedMappings).toEqual([
      { protectionId: 'prot-1', sourceStart: 0, sourceEnd: 10, outputStart: 0, outputEnd: 10 },
    ]);
    // 映射位置的文字是第一次出现的原句；第二次出现的同句已被改写。
    expect(result.text.slice(0, 10)).toBe('注意：仅限内部使用。');
    expect(result.text).toContain('注意：仅限内部使用，请勿外传。');
  });

  it('F12 空改稿：接受整篇删除，合法空结果（text 为空字符串）', async () => {
    const analysis = await buildAnalysis(
      F12.original,
      F12.candidate,
      F12.protections,
      F12.hunks,
      F12.decisions,
      'job-ep-f12-a',
    );
    const result = await compose(buildSession(F12.original, F12.candidate, F12.protections, analysis));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe('');
    expect(result.outputHash).toBe(await sha256Hex(''));
    expect(result.protectedMappings).toEqual([]);
  });

  it('rejected 的 Hunk 保留原文；decisionRevision 按快照回显', async () => {
    const analysis = await buildAnalysis(
      F01.original,
      F01.candidate,
      F01.protections,
      F01.hunks,
      { h1: 'accepted', h3: 'rejected' },
      'job-ep-f01-b',
    );
    const session = buildSession(F01.original, F01.candidate, F01.protections, analysis, {
      decisionRevision: 3,
    });
    const result = await compose(session);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe('请在周五前回复确认。\n人数上限为30人。\n谢谢配合。');
    expect(result.decisionRevision).toBe(3);
  });

  it('compose 不修改传入的 session', async () => {
    const analysis = await buildAnalysis(
      F01.original,
      F01.candidate,
      F01.protections,
      F01.hunks,
      F01.decisions,
      'job-ep-f01-c',
    );
    const session = buildSession(F01.original, F01.candidate, F01.protections, analysis);
    const before = JSON.stringify(session);
    const result = await compose(session);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(session)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// pending 与非法状态：返回错误，不返回部分成稿
// ---------------------------------------------------------------------------

describe('compose pending 与非法状态', () => {
  it('F20 待审导出：任一 pending 立即返回 PENDING_REVIEW，不含 text', async () => {
    const analysis = await buildAnalysis(
      F20.original,
      F20.candidate,
      F20.protections,
      F20.hunks,
      F20.decisions,
      'job-ep-f20-a',
    );
    const result = await compose(buildSession(F20.original, F20.candidate, F20.protections, analysis));
    expect(result).toEqual({ ok: false, errorCode: 'PENDING_REVIEW' });
    expect(result).not.toHaveProperty('text');
  });

  it('陈旧 analysisId：id 被篡改 → INVALID_PATCH', async () => {
    const analysis = await buildAnalysis(
      F01.original,
      F01.candidate,
      F01.protections,
      F01.hunks,
      F01.decisions,
      'job-ep-f01-d',
    );
    analysis.analysisId = '0'.repeat(64);
    const result = await compose(buildSession(F01.original, F01.candidate, F01.protections, analysis));
    expect(result).toEqual({ ok: false, errorCode: 'INVALID_PATCH' });
  });

  it('原稿变化后哈希失配 → INVALID_PATCH', async () => {
    const analysis = await buildAnalysis(
      F01.original,
      F01.candidate,
      F01.protections,
      F01.hunks,
      F01.decisions,
      'job-ep-f01-e',
    );
    const session = buildSession(F01.original + '篡改', F01.candidate, F01.protections, analysis);
    expect(await compose(session)).toEqual({ ok: false, errorCode: 'INVALID_PATCH' });
  });

  it('改稿变化后哈希失配 → INVALID_PATCH', async () => {
    const analysis = await buildAnalysis(
      F01.original,
      F01.candidate,
      F01.protections,
      F01.hunks,
      F01.decisions,
      'job-ep-f01-f',
    );
    const session = buildSession(F01.original, F01.candidate + '篡改', F01.protections, analysis);
    expect(await compose(session)).toEqual({ ok: false, errorCode: 'INVALID_PATCH' });
  });

  it('oldText 错配 → INVALID_PATCH', async () => {
    const analysis = await buildAnalysis(
      F01.original,
      F01.candidate,
      F01.protections,
      F01.hunks,
      F01.decisions,
      'job-ep-f01-g',
    );
    analysis.hunks[0].oldText = '错配文字';
    const result = await compose(buildSession(F01.original, F01.candidate, F01.protections, analysis));
    expect(result).toEqual({ ok: false, errorCode: 'INVALID_PATCH' });
  });

  it('accepted 的 Hunk 带冲突（绕过 PROTECTED_CHANGE）→ INVALID_PATCH', async () => {
    const analysis = await buildAnalysis(
      F01.original,
      F01.candidate,
      F01.protections,
      F01.hunks,
      F01.decisions,
      'job-ep-f01-h',
    );
    // h2 与保护冲突，正常应为 blocked；篡改为 accepted 即非法状态。
    analysis.hunks[1].decision = 'accepted';
    const result = await compose(buildSession(F01.original, F01.candidate, F01.protections, analysis));
    expect(result).toEqual({ ok: false, errorCode: 'INVALID_PATCH' });
  });

  it('stored conflicts 被清空（与重算不一致）→ INVALID_PATCH', async () => {
    const analysis = await buildAnalysis(
      F01.original,
      F01.candidate,
      F01.protections,
      F01.hunks,
      F01.decisions,
      'job-ep-f01-i',
    );
    analysis.hunks[1].conflicts = [];
    const result = await compose(buildSession(F01.original, F01.candidate, F01.protections, analysis));
    expect(result).toEqual({ ok: false, errorCode: 'INVALID_PATCH' });
  });

  it('analysis 为 null → INVALID_PATCH', async () => {
    const session = buildSession(F01.original, F01.candidate, F01.protections, null);
    expect(await compose(session)).toEqual({ ok: false, errorCode: 'INVALID_PATCH' });
  });

  it('session.revision 与 analysis.revision 不一致 → INVALID_PATCH', async () => {
    const analysis = await buildAnalysis(
      F01.original,
      F01.candidate,
      F01.protections,
      F01.hunks,
      F01.decisions,
      'job-ep-f01-j',
    );
    const session = buildSession(F01.original, F01.candidate, F01.protections, analysis, {
      revision: 2,
    });
    expect(await compose(session)).toEqual({ ok: false, errorCode: 'INVALID_PATCH' });
  });

  it('保护范围变化（session.protections 与分析冻结的不一致）→ INVALID_PATCH', async () => {
    const analysis = await buildAnalysis(
      F01.original,
      F01.candidate,
      F01.protections,
      F01.hunks,
      F01.decisions,
      'job-ep-f01-k',
    );
    const session = buildSession(F01.original, F01.candidate, [], analysis);
    expect(await compose(session)).toEqual({ ok: false, errorCode: 'INVALID_PATCH' });
  });

  it('newText 被篡改导致重建改稿失配 → INVALID_PATCH', async () => {
    const analysis = await buildAnalysis(
      F01.original,
      F01.candidate,
      F01.protections,
      F01.hunks,
      F01.decisions,
      'job-ep-f01-l',
    );
    analysis.hunks[0].newText = '篡改。';
    const result = await compose(buildSession(F01.original, F01.candidate, F01.protections, analysis));
    expect(result).toEqual({ ok: false, errorCode: 'INVALID_PATCH' });
  });

  it('非法 decision 值 → INVALID_PATCH（不静默当作 rejected）', async () => {
    const analysis = await buildAnalysis(
      F01.original,
      F01.candidate,
      F01.protections,
      F01.hunks,
      F01.decisions,
      'job-ep-f01-m',
    );
    analysis.hunks[0].decision = 'maybe' as unknown as Hunk['decision'];
    const result = await compose(buildSession(F01.original, F01.candidate, F01.protections, analysis));
    expect(result).toEqual({ ok: false, errorCode: 'INVALID_PATCH' });
  });

  it('缺少 Web Crypto 时返回 UNSUPPORTED_ENV（不写同步替代）', async () => {
    const analysis = await buildAnalysis(
      F01.original,
      F01.candidate,
      F01.protections,
      F01.hunks,
      F01.decisions,
      'job-ep-f01-n',
    );
    const session = buildSession(F01.original, F01.candidate, F01.protections, analysis);
    const originalCrypto = globalThis.crypto;
    try {
      vi.stubGlobal('crypto', undefined);
      expect(await compose(session)).toEqual({ ok: false, errorCode: 'UNSUPPORTED_ENV' });
    } finally {
      vi.stubGlobal('crypto', originalCrypto);
      vi.unstubAllGlobals();
    }
  });
});
