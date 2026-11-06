/**
 * P012 T010 — 独立验证 oracle（与生产实现无关）。
 *
 * 本文件是 T010 验证方自己写的复核工具，不调用生产代码的任何运行时函数：
 *  - 不调用生产 compose / guards / diff / analyze / text / tokenize / schema；
 *  - 哈希用 Node 原生 crypto（与生产 Web Crypto 是两条实现路径）；
 *  - 规范化、分段、冲突规则、拼接、analysisId 载荷均按项目书 §8 与
 *    CONTRACT.md §2/§4/§5 从规格重新推导实现；
 *  - grapheme 边界直接用平台 Intl.Segmenter（规格指定的机制本身）。
 *
 * 只从 src/domain/types.ts 做类型导入（类型不是实现）。
 */

import { createHash } from 'node:crypto';
import type { Decision, Hunk, ProtectedRange, RawHunk } from '../../src/domain/types';

// ---------------------------------------------------------------------------
// 确定性伪随机（mulberry32，种子固定）
// ---------------------------------------------------------------------------

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// 哈希（Node 原生 crypto，与生产 Web Crypto 不同实现路径）
// ---------------------------------------------------------------------------

export function sha256HexNode(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// 规范化（按 CONTRACT.md §2：仅 CRLF 与单独 CR 转 LF）
// ---------------------------------------------------------------------------

export function canonicalizeText(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

// ---------------------------------------------------------------------------
// grapheme 边界（直接用平台 Intl.Segmenter，不经过生产 tokenize）
// ---------------------------------------------------------------------------

export interface GraphemeToken {
  text: string;
  start: number;
  end: number;
}

interface SegmentLike {
  segment: string;
  index: number;
}

interface SegmenterLike {
  segment(input: string): Iterable<SegmentLike>;
}

type SegmenterCtor = new (
  locales?: string | string[],
  options?: { granularity?: string },
) => SegmenterLike;

function getSegmenter(): SegmenterLike {
  const intl = (globalThis as { Intl?: { Segmenter?: unknown } }).Intl;
  const Ctor = intl?.Segmenter as SegmenterCtor | undefined;
  if (typeof Ctor !== 'function') {
    throw new Error('oracle: Intl.Segmenter is not available');
  }
  return new Ctor(undefined, { granularity: 'grapheme' });
}

/** 文本的 grapheme token 列表（先做唯一规范化）。 */
export function graphemeTokens(text: string): GraphemeToken[] {
  const canonical = canonicalizeText(text);
  const segmenter = getSegmenter();
  const out: GraphemeToken[] = [];
  for (const segment of segmenter.segment(canonical)) {
    out.push({
      text: segment.segment,
      start: segment.index,
      end: segment.index + segment.segment.length,
    });
  }
  return out;
}

/** 文本的全部 grapheme 边界偏移集合（含 0 与文本末尾）。 */
export function graphemeBoundaries(text: string): Set<number> {
  const canonical = canonicalizeText(text);
  const boundaries = new Set<number>([0, canonical.length]);
  for (const token of graphemeTokens(canonical)) {
    boundaries.add(token.start);
    boundaries.add(token.end);
  }
  return boundaries;
}

// ---------------------------------------------------------------------------
// 朴素拼接（按决定区间 / 按 Hunk 列表；与生产 synthesize 不同的实现）
// ---------------------------------------------------------------------------

export interface SpanItem {
  start: number;
  end: number;
  newText: string;
}

export interface MappedSpan {
  origStart: number;
  origEnd: number;
  candStart: number;
  candEnd: number;
}

/**
 * 把一组升序、不重叠的区间项（编辑或 Hunk）映射到改稿坐标。
 * 原理：逐项推进原稿/改稿双游标，未改片段在两稿中长度相同。
 * 用于判断“某 Hunk 的决定是否影响某处编辑”：原稿区间重叠或改稿区间
 * 重叠即有关联——半开区间重叠判定会漏掉零长区间（纯插入），故必须
 * 同时看改稿坐标。
 */
export function candidateSpans(original: string, items: readonly SpanItem[]): MappedSpan[] {
  const canonical = canonicalizeText(original);
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: MappedSpan[] = [];
  let origCursor = 0;
  let candCursor = 0;
  for (const it of sorted) {
    if (it.start < origCursor || it.end < it.start || it.end > canonical.length) {
      throw new Error('oracle: invalid span items');
    }
    candCursor += it.start - origCursor;
    out.push({
      origStart: it.start,
      origEnd: it.end,
      candStart: candCursor,
      candEnd: candCursor + it.newText.length,
    });
    candCursor += it.newText.length;
    origCursor = it.end;
  }
  return out;
}

/** 两个半开区间是否重叠。 */
export function spansOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

export interface IntervalDecision {
  start: number;
  end: number;
  decision: 'accepted' | 'rejected';
  newText?: string;
}

/**
 * 按决定区间对规范化原稿做朴素拼接：accepted 替换为 newText，其余保留原文。
 * 区间必须升序、不重叠、在界内；否则抛错（调用方把抛错当作输入无效）。
 */
export function spliceByIntervals(original: string, decisions: IntervalDecision[]): string {
  const canonical = canonicalizeText(original);
  const sorted = [...decisions].sort((a, b) => a.start - b.start || a.end - b.end);
  let out = '';
  let cursor = 0;
  for (const d of sorted) {
    if (!Number.isInteger(d.start) || !Number.isInteger(d.end) || d.start < 0 || d.end < d.start) {
      throw new Error(`oracle: invalid decision interval [${d.start}, ${d.end})`);
    }
    if (d.end > canonical.length) {
      throw new Error(`oracle: decision interval [${d.start}, ${d.end}) out of bounds`);
    }
    if (d.start < cursor) {
      throw new Error('oracle: overlapping decision intervals');
    }
    out += canonical.slice(cursor, d.start);
    out += d.decision === 'accepted' ? (d.newText ?? '') : canonical.slice(d.start, d.end);
    cursor = d.end;
  }
  out += canonical.slice(cursor);
  return out;
}

/**
 * 按 Hunk 列表拼接：accepted 插 newText，其余插 oldText。
 * 与 spliceByIntervals 相互独立实现（一个按区间、一个按 Hunk），两者都用于
 * 交叉核对生产 compose 的输出。
 */
export function spliceByHunks(original: string, hunks: readonly Hunk[]): string {
  const canonical = canonicalizeText(original);
  let out = '';
  let cursor = 0;
  for (const h of hunks) {
    if (h.start < cursor) {
      throw new Error('oracle: hunks not sorted / overlapping');
    }
    out += canonical.slice(cursor, h.start);
    out += h.decision === 'accepted' ? h.newText : h.oldText;
    cursor = h.end;
  }
  out += canonical.slice(cursor);
  return out;
}

/** 全部 Hunk 应用 newText 后重建的文本（§8.2 不变量之一）。 */
export function rebuildWithAllNewText(original: string, hunks: readonly Hunk[]): string {
  const canonical = canonicalizeText(original);
  let out = '';
  let cursor = 0;
  for (const h of hunks) {
    out += canonical.slice(cursor, h.start);
    out += h.newText;
    cursor = h.end;
  }
  out += canonical.slice(cursor);
  return out;
}

/** 全部 Hunk 保留 oldText 后重建的文本（§8.2 不变量之二，应等于原稿）。 */
export function rebuildWithAllOldText(original: string, hunks: readonly Hunk[]): string {
  const canonical = canonicalizeText(original);
  let out = '';
  let cursor = 0;
  for (const h of hunks) {
    out += canonical.slice(cursor, h.start);
    out += h.oldText;
    cursor = h.end;
  }
  out += canonical.slice(cursor);
  return out;
}

// ---------------------------------------------------------------------------
// 冲突规则（项目书 §8.3，从规格重新推导，不调用生产 guards）
// ---------------------------------------------------------------------------

export function conflictsWithInterval(
  hunk: { start: number; end: number },
  protection: ProtectedRange,
): boolean {
  if (hunk.start === hunk.end) {
    // 纯插入：两端也拦截。
    return protection.start <= hunk.start && hunk.start <= protection.end;
  }
  return hunk.start < protection.end && hunk.end > protection.start;
}

/**
 * 从规格重新实现的保护分类：先验证区间与 oldText，再算 conflicts。
 * 返回 ok:false 时附原因字符串（供测试定位），不抛错。
 */
export function classifyIndependent(
  original: string,
  rawHunks: readonly RawHunk[],
  protections: readonly ProtectedRange[],
):
  | { ok: true; hunks: Hunk[] }
  | { ok: false; reason: string } {
  const canonical = canonicalizeText(original);
  const seenProtectionIds = new Set<string>();
  for (const p of protections) {
    if (
      typeof p.id !== 'string' ||
      p.id === '' ||
      typeof p.paragraphId !== 'string' ||
      p.paragraphId === '' ||
      !Number.isInteger(p.start) ||
      !Number.isInteger(p.end) ||
      p.end <= p.start ||
      p.start < 0 ||
      p.end > canonical.length
    ) {
      return { ok: false, reason: `invalid protection ${JSON.stringify(p)}` };
    }
    if (seenProtectionIds.has(p.id)) {
      return { ok: false, reason: `duplicate protection id ${p.id}` };
    }
    seenProtectionIds.add(p.id);
  }
  const seenHunkIds = new Set<string>();
  let prevEnd = 0;
  for (const h of rawHunks) {
    if (
      typeof h.id !== 'string' ||
      h.id === '' ||
      typeof h.oldText !== 'string' ||
      typeof h.newText !== 'string' ||
      !Number.isInteger(h.start) ||
      !Number.isInteger(h.end) ||
      h.start < 0 ||
      h.end < h.start ||
      h.end > canonical.length
    ) {
      return { ok: false, reason: `invalid hunk ${JSON.stringify(h)}` };
    }
    if (canonical.slice(h.start, h.end) !== h.oldText) {
      return { ok: false, reason: `hunk ${h.id} oldText mismatch` };
    }
    if (seenHunkIds.has(h.id)) {
      return { ok: false, reason: `duplicate hunk id ${h.id}` };
    }
    seenHunkIds.add(h.id);
    if (h.start < prevEnd) {
      return { ok: false, reason: `hunk ${h.id} not sorted / overlapping` };
    }
    prevEnd = h.end;
  }
  const hunks: Hunk[] = rawHunks.map((h) => {
    const conflicts = protections
      .filter((p) => conflictsWithInterval(h, p))
      .map((p) => p.id);
    return {
      ...h,
      conflicts,
      decision: (conflicts.length > 0 ? 'blocked' : 'pending') as Decision,
    };
  });
  return { ok: true, hunks };
}

// ---------------------------------------------------------------------------
// analysisId（CONTRACT.md §4：固定字段顺序 JSON 数组 + SHA-256，自行实现）
// ---------------------------------------------------------------------------

export interface AnalysisIdInput {
  schemaVersion: '1.0.0';
  engineVersion: string;
  revision: number;
  jobId: string;
  originalHash: string;
  candidateHash: string;
  protections: readonly ProtectedRange[];
}

export function analysisIdIndependent(input: AnalysisIdInput): string {
  const sorted = [...input.protections].sort(
    (a, b) => a.start - b.start || a.end - b.end || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const payload = JSON.stringify([
    input.schemaVersion,
    input.engineVersion,
    input.revision,
    input.jobId,
    input.originalHash,
    input.candidateHash,
    sorted.map((p) => [p.id, p.paragraphId, p.start, p.end]),
  ]);
  return sha256HexNode(payload);
}

// ---------------------------------------------------------------------------
// 保护映射（按原稿区间逐步映射到输出位置，不用字符串搜索定位）
// ---------------------------------------------------------------------------

/**
 * 把保护范围 [start, end) 按 Hunk+决定映射到输出位置。
 * 返回 null 的两种情形：保护边界落在某个 accepted Hunk 的替换区间内部
 * （保护文字已被替换，属保护违规）；或边界无法定位。
 * 调用方再核对输出对应区间与原稿保护文字逐字相等。
 */
export function mapProtectionToOutput(
  original: string,
  hunks: readonly Hunk[],
  protection: ProtectedRange,
): { outputStart: number; outputEnd: number } | null {
  const canonical = canonicalizeText(original);
  const boundary = (x: number): number | null => {
    let shift = 0;
    for (const h of hunks) {
      if (x < h.start) {
        return x + shift;
      }
      if (x === h.start) {
        return h.start + shift;
      }
      if (x > h.start && x < h.end) {
        // 边界落在 Hunk 内部：accepted 则该边界已被替换掉；否则保留原文，
        // 位置仍可按原稿偏移换算。
        if (h.decision === 'accepted') {
          return null;
        }
        return x + shift;
      }
      if (x === h.end) {
        const applied = h.decision === 'accepted' ? h.newText.length : h.oldText.length;
        return h.start + shift + applied;
      }
      // x > h.end：累计位移后继续。
      const applied = h.decision === 'accepted' ? h.newText.length : h.oldText.length;
      shift += applied - (h.end - h.start);
    }
    return x + shift;
  };
  if (
    !Number.isInteger(protection.start) ||
    !Number.isInteger(protection.end) ||
    protection.end <= protection.start ||
    protection.start < 0 ||
    protection.end > canonical.length
  ) {
    return null;
  }
  const outputStart = boundary(protection.start);
  const outputEnd = boundary(protection.end);
  if (outputStart === null || outputEnd === null || outputEnd <= outputStart) {
    return null;
  }
  return { outputStart, outputEnd };
}
