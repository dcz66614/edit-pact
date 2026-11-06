/**
 * P012 T004 单元测试 — 精确比较与 analyze 组装。
 *
 * 重建验证使用本文件内的独立朴素拼接器（不调用生产 compose，也不调用
 * guards 之外的生产逻辑），按 Hunk 区间逐段拼接；与 §8.2 的两条不变量
 * 对照：全部接受重建规范化改稿、全部保留重建规范化原稿。
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { diffArrays } from 'diff';
import type { AnalyzeRequest, RawHunk } from '../../src/domain/types';
import { DIFF_MAX_EDIT_LENGTH, DIFF_TIMEOUT_MS, WORKER_WAIT_MS } from '../../src/domain/types';
import { ENGINE_VERSION, computeRawHunks } from '../../src/core/diff';
import { analyze } from '../../src/core/analyze';
import { canonicalize } from '../../src/core/text';
import { isGraphemeBoundary } from '../../src/core/tokenize';
import { computeAnalysisId, sha256Hex } from '../../src/domain/schema';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** 独立朴素拼接器：按 Hunk 区间拼接（测试自有，不依赖生产 compose）。 */
function spliceWithHunks(
  original: string,
  hunks: readonly RawHunk[],
  pick: 'new' | 'old',
): string {
  let out = '';
  let pos = 0;
  for (const h of hunks) {
    out += original.slice(pos, h.start);
    out += pick === 'new' ? h.newText : h.oldText;
    pos = h.end;
  }
  out += original.slice(pos);
  return out;
}

function makeRequest(
  original: string,
  candidate: string,
  overrides: Partial<AnalyzeRequest> = {},
): AnalyzeRequest {
  return {
    original,
    candidate,
    protections: [],
    revision: 1,
    jobId: 'job-t004-test',
    engineVersion: ENGINE_VERSION,
    ...overrides,
  };
}

/** 断言 Hunk 的通用不变量：升序、不交叠、oldText 与原稿一致。 */
function assertHunkInvariants(original: string, hunks: readonly RawHunk[]): void {
  let prevEnd = 0;
  const ids = new Set<string>();
  for (const h of hunks) {
    expect(h.start).toBeGreaterThanOrEqual(prevEnd);
    expect(h.end).toBeGreaterThanOrEqual(h.start);
    expect(original.slice(h.start, h.end)).toBe(h.oldText);
    expect(ids.has(h.id)).toBe(false);
    ids.add(h.id);
    // 不产生空操作插入（start === end 且 newText === ''）。
    expect(h.start === h.end && h.newText === '').toBe(false);
    prevEnd = h.end;
  }
}

describe('预算常量（项目书 §8.2、CONTRACT.md §1.5）', () => {
  it('maxEditLength 2048、算法 timeout 800 ms、主线程等待 1500 ms', () => {
    expect(DIFF_MAX_EDIT_LENGTH).toBe(2048);
    expect(DIFF_TIMEOUT_MS).toBe(800);
    expect(WORKER_WAIT_MS).toBe(1500);
  });

  it('ENGINE_VERSION 与 package.json 锁定的 jsdiff 版本一致', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url).pathname, 'utf8'),
    ) as { dependencies: Record<string, string> };
    expect(pkg.dependencies.diff).toBe('9.0.0');
    expect(ENGINE_VERSION).toBe(`1.0.0+jsdiff-${pkg.dependencies.diff}`);
  });
});

describe('computeRawHunks', () => {
  it('相同文本：零 Hunk', () => {
    expect(computeRawHunks('你好世界', '你好世界')).toEqual([]);
  });

  it('纯插入：单个 Hunk，start === end，oldText 为空', () => {
    const hunks = computeRawHunks('abc', 'aXbc')!;
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({ start: 1, end: 1, oldText: '', newText: 'X' });
  });

  it('纯删除：单个 Hunk，newText 为空', () => {
    const hunks = computeRawHunks('aXbc', 'abc')!;
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({ start: 1, end: 2, oldText: 'X', newText: '' });
  });

  it('替换原子性：相连的删除+插入合并为一个 Hunk，不拆开', () => {
    const hunks = computeRawHunks('abc', 'aXYc')!;
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({ start: 1, end: 2, oldText: 'b', newText: 'XY' });
  });

  it('替换原子性：无共享 grapheme 的整段替换为一个 Hunk', () => {
    const hunks = computeRawHunks('hello world', 'hello zzz')!;
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({ start: 6, end: 11, oldText: 'world', newText: 'zzz' });
  });

  it('Myers 合法对齐：共享字母 r 作为相等项时替换分为两个 Hunk（非 bug）', () => {
    // 项目书 §8.2：MVP 不承诺唯一最短差异，重复/共享文字可产生多种合法对齐；
    // jsdiff 把共有的 'r' 对齐为相等项，于是 'wo'→'the' 与 'ld'→'e' 为两个 Hunk。
    // 关键不变量仍成立：双向重建精确。
    const original = 'hello world';
    const candidate = 'hello there';
    const hunks = computeRawHunks(original, candidate)!;
    expect(hunks).toHaveLength(2);
    expect(hunks[0]).toMatchObject({ start: 6, end: 8, oldText: 'wo', newText: 'the' });
    expect(hunks[1]).toMatchObject({ start: 9, end: 11, oldText: 'ld', newText: 'e' });
    expect(spliceWithHunks(original, hunks, 'new')).toBe(candidate);
    expect(spliceWithHunks(original, hunks, 'old')).toBe(original);
  });

  it('多段替换：两处改动产生两个升序不交叠 Hunk', () => {
    const hunks = computeRawHunks('one two three', 'ONE two THREE')!;
    expect(hunks).toHaveLength(2);
    expect(hunks[0]).toMatchObject({ start: 0, end: 3, oldText: 'one', newText: 'ONE' });
    expect(hunks[1]).toMatchObject({ start: 8, end: 13, oldText: 'three', newText: 'THREE' });
    assertHunkInvariants('one two three', hunks);
  });

  it('空改稿：整段删除为一个 Hunk', () => {
    const hunks = computeRawHunks('全部删除', '')!;
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({ start: 0, end: 4, oldText: '全部删除', newText: '' });
  });

  it('CRLF 先规范化再比较：Hunk 坐标按 LF 文本计', () => {
    const hunks = computeRawHunks('a\r\nb', 'a\r\nc')!;
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({ start: 2, end: 3, oldText: 'b', newText: 'c' });
  });

  it('emoji ZWJ 序列不拆开：Hunk 端点落在完整 grapheme 外', () => {
    const emoji = '👨‍👩‍👧'; // 3 人家庭：8 个 UTF-16 单元，一个 grapheme
    const original = `a${emoji}b`;
    const hunks = computeRawHunks(original, `a${emoji}c`)!;
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({
      start: 1 + emoji.length,
      end: 2 + emoji.length,
      oldText: 'b',
      newText: 'c',
    });
  });

  it('组合字符不拆开：e + U+0301 是一个 token', () => {
    // 用显式转义写组合字符，避免编辑器把源码归一化为预组合 é。
    const combiningAcute = '\u0301';
    const original = 'x' + 'e' + combiningAcute + 'y';
    const hunks = computeRawHunks(original, 'xey')!;
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({ start: 1, end: 3, oldText: 'e' + combiningAcute, newText: 'e' });
  });

  it('超出 maxEditLength 时返回 undefined，不伪装为空差异', () => {
    const started = Date.now();
    const result = computeRawHunks('a'.repeat(3000), 'b'.repeat(3000));
    const elapsed = Date.now() - started;
    expect(result).toBeUndefined();
    // 预算内快速放弃：记录实测耗时供证据复核。
    console.log(`[T004] maxEditLength abort elapsed=${elapsed}ms`);
    expect(elapsed).toBeLessThan(5000);
  });

  it('jsdiff timeout 机制可用：极小 timeout 下返回 undefined', () => {
    // 隔离验证：把 maxEditLength 放大，只让 timeout 生效，证明
    // jsdiff 的超时中止机制本身工作；生产代码以 800 ms 接入同一机制。
    const tokens = Array.from({ length: 6000 }, (_, i) => `t${i}`);
    const result = diffArrays(tokens, [...tokens].reverse(), {
      maxEditLength: 100000,
      timeout: 1,
    });
    expect(result).toBeUndefined();
  });
});

describe('analyze 组装', () => {
  it('相同文本：ok，零 Hunk，analysisId 可复算', async () => {
    const request = makeRequest('你好世界', '你好世界', { jobId: 'job-same' });
    const result = await analyze(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.hunks).toEqual([]);
    expect(result.analysis.originalHash).toBe(await sha256Hex('你好世界'));
    expect(result.analysis.candidateHash).toBe(await sha256Hex('你好世界'));
    expect(result.analysis.analysisId).toBe(
      await computeAnalysisId({
        schemaVersion: '1.0.0',
        engineVersion: ENGINE_VERSION,
        revision: 1,
        jobId: 'job-same',
        originalHash: result.analysis.originalHash,
        candidateHash: result.analysis.candidateHash,
        protections: [],
      }),
    );
  });

  it('同一 jobId 两次分析 analysisId 相同；换 jobId 则不同', async () => {
    const a = await analyze(makeRequest('甲乙', '甲丙', { jobId: 'job-x' }));
    const b = await analyze(makeRequest('甲乙', '甲丙', { jobId: 'job-x' }));
    const c = await analyze(makeRequest('甲乙', '甲丙', { jobId: 'job-y' }));
    expect(a.ok && b.ok && c.ok).toBe(true);
    if (!a.ok || !b.ok || !c.ok) return;
    expect(a.analysis.analysisId).toBe(b.analysis.analysisId);
    expect(a.analysis.analysisId).not.toBe(c.analysis.analysisId);
  });

  it('全接受重建改稿、全保留重建原稿（独立拼接器）', async () => {
    const original = '第一段文字。第二段文字。第三段文字。';
    const candidate = '第一段改后。第二段文字。第三段改后。';
    const result = await analyze(makeRequest(original, candidate));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const hunks = result.analysis.hunks;
    assertHunkInvariants(original, hunks);
    expect(spliceWithHunks(original, hunks, 'new')).toBe(candidate);
    expect(spliceWithHunks(original, hunks, 'old')).toBe(original);
  });

  it('空原稿 → INVALID_INPUT；过长原稿 → INVALID_INPUT', async () => {
    const empty = await analyze(makeRequest('', 'x'));
    expect(empty).toEqual({ ok: false, errorCode: 'INVALID_INPUT', revision: 1, jobId: 'job-t004-test' });
    const tooLong = await analyze(makeRequest('a'.repeat(12001), 'x'));
    expect(tooLong).toEqual({ ok: false, errorCode: 'INVALID_INPUT', revision: 1, jobId: 'job-t004-test' });
  });

  it('差异超预算 → TOO_COMPLEX，不返回空 Hunk', async () => {
    const started = Date.now();
    const result = await analyze(
      makeRequest('a'.repeat(3000), 'b'.repeat(3000), { jobId: 'job-complex' }),
    );
    const elapsed = Date.now() - started;
    expect(result).toEqual({
      ok: false,
      errorCode: 'TOO_COMPLEX',
      revision: 1,
      jobId: 'job-complex',
    });
    console.log(`[T004] analyze TOO_COMPLEX elapsed=${elapsed}ms`);
  });

  it('保护范围越界 → INVALID_PATCH（classifyHunks 验证失败）', async () => {
    const result = await analyze(
      makeRequest('短文本', '短文本改', {
        protections: [{ id: 'p1', paragraphId: 'p1', start: 0, end: 999 }],
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe('INVALID_PATCH');
  });

  it('合法保护不改变差异本身，只给 Hunk 标 conflicts', async () => {
    const original = '保留这句。改这句。';
    const candidate = '保留这句。改后。';
    const result = await analyze(
      makeRequest(original, candidate, {
        protections: [{ id: 'p1', paragraphId: 'p1', start: 0, end: 5 }],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.hunks).toHaveLength(1);
    expect(result.analysis.hunks[0].decision).toBe('pending');
    expect(result.analysis.hunks[0].conflicts).toEqual([]);
  });

  it('无 Intl.Segmenter → UNSUPPORTED_ENV，不退化', async () => {
    // lib 未含 Intl.Segmenter 类型声明（见 T003 交接），用结构类型访问。
    const intl = Intl as unknown as { Segmenter?: unknown };
    const saved = intl.Segmenter;
    try {
      intl.Segmenter = undefined;
      const result = await analyze(makeRequest('甲乙', '甲丙'));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errorCode).toBe('UNSUPPORTED_ENV');
    } finally {
      intl.Segmenter = saved;
    }
  });

  it('无 Web Crypto → UNSUPPORTED_ENV', async () => {
    vi.stubGlobal('crypto', undefined);
    const result = await analyze(makeRequest('甲乙', '甲丙'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe('UNSUPPORTED_ENV');
  });

  it('请求结构非法但标识可读 → INVALID_INPUT；标识不可读 → 抛 TypeError', async () => {
    const bad = await analyze({
      original: '甲',
      candidate: '乙',
      protections: 'not-an-array',
      revision: 2,
      jobId: 'job-bad',
      engineVersion: ENGINE_VERSION,
    } as unknown as AnalyzeRequest);
    expect(bad).toEqual({ ok: false, errorCode: 'INVALID_INPUT', revision: 2, jobId: 'job-bad' });
    await expect(
      analyze({ original: '甲' } as unknown as AnalyzeRequest),
    ).rejects.toThrow(TypeError);
  });

  it('不修改传入的 request 与 protections', async () => {
    const protections = [{ id: 'p1', paragraphId: 'p1', start: 0, end: 5 }];
    const request = makeRequest('保留这句。改这句。', '保留这句。改后。', { protections });
    const snapshot = JSON.stringify(request);
    const result = await analyze(request);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(request)).toBe(snapshot);
    expect(request.protections).toEqual(protections);
  });
});

describe('fixture 性质：EP-F01–F16 / F23 的 Hunk 不变量', () => {
  const cases = ['F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08', 'F09', 'F10', 'F11', 'F12', 'F13', 'F14', 'F15', 'F16', 'F23'];

  it.each(cases)('%s：oldText 一致、重建双向精确、端点为 grapheme 边界', async (id) => {
    const dir = new URL(`../fixtures/EP-${id}/`, import.meta.url);
    const original = readFileSync(new URL('original.txt', dir).pathname, 'utf8');
    const candidate = readFileSync(new URL('candidate.txt', dir).pathname, 'utf8');
    let protections: AnalyzeRequest['protections'] = [];
    try {
      const parsed = JSON.parse(readFileSync(new URL('protections.json', dir).pathname, 'utf8')) as {
        protections: AnalyzeRequest['protections'];
      };
      protections = parsed.protections;
    } catch {
      protections = [];
    }
    const canonicalOriginal = canonicalize(original);
    const canonicalCandidate = canonicalize(candidate);
    const result = await analyze(
      makeRequest(original, candidate, { protections, jobId: `job-ep-${id.toLowerCase()}` }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const hunks = result.analysis.hunks;
    assertHunkInvariants(canonicalOriginal, hunks);
    expect(spliceWithHunks(canonicalOriginal, hunks, 'new')).toBe(canonicalCandidate);
    expect(spliceWithHunks(canonicalOriginal, hunks, 'old')).toBe(canonicalOriginal);
    for (const h of hunks) {
      expect(isGraphemeBoundary(canonicalOriginal, h.start)).toBe(true);
      expect(isGraphemeBoundary(canonicalOriginal, h.end)).toBe(true);
    }
  });
});
