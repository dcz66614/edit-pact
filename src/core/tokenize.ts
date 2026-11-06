/**
 * P012 改稿守约 Edit Pact — grapheme 分词与 UTF-16 坐标映射（T003）。
 *
 * 来源：项目书 §8.2（精确差异）、§8.5（特殊字符）、CONTRACT.md §6。
 *  - 使用 Intl.Segmenter 的 grapheme 粒度切分：代理对、组合字符、
 *    emoji ZWJ 序列、旗帜与肤色修饰序列均不拆开；
 *  - 每个 token 记录其在规范化文本中的 UTF-16 区间 [start, end)，
 *    供 T004 按 §8.2 [R6] 累计 token 的 JS string.length 建立偏移映射；
 *  - 浏览器 / 环境缺少 Intl.Segmenter 时抛出 SegmenterUnavailableError
 *   （错误码 UNSUPPORTED_ENV），明确停止，不静默退化为会拆开 emoji 的实现。
 *
 * 类型说明：本项目 tsconfig 的 lib 为 ES2020 + DOM，不含 ES2022 的
 * Intl.Segmenter 类型声明；且 tokenize.ts 不得改 tsconfig（非本任务
 * 归属文件）。因此本文件用最小结构类型描述所用的 Segmenter 形态，
 * 并在运行时动态读取 globalThis.Intl.Segmenter；形态不符或缺失时
 * 一律按不可用处理。
 */

import { canonicalize } from './text';

// ---------------------------------------------------------------------------
// 类型（最小结构描述，仅覆盖本文件实际使用的 Segmenter 形态）
// ---------------------------------------------------------------------------

/** Intl.Segmenter.segment() 产出的单个分段。 */
export interface GraphemeSegment {
  /** 分段文本（一个完整 grapheme 簇）。 */
  segment: string;
  /** 该分段在输入中的 UTF-16 起始位置。 */
  index: number;
  /** 被分段的完整输入文本。 */
  input: string;
}

/** 本文件所需的 Segmenter 最小形态（grapheme 粒度）。 */
export interface GraphemeSegmenter {
  segment(input: string): Iterable<GraphemeSegment>;
}

export interface GraphemeSegmenterConstructor {
  new (locales?: string | string[], options?: { granularity?: 'grapheme' }): GraphemeSegmenter;
}

// ---------------------------------------------------------------------------
// 错误：无 Segmenter 时明确报错，不退化
// ---------------------------------------------------------------------------

/**
 * 环境缺少可用的 Intl.Segmenter。调用方（T004 analyze）应将其映射为
 * ErrorCode UNSUPPORTED_ENV，不得改用逐 UTF-16 单元切分继续比较。
 */
export class SegmenterUnavailableError extends Error {
  readonly code = 'UNSUPPORTED_ENV' as const;

  constructor(
    message = 'Intl.Segmenter is not available in this environment; refusing to fall back to a splitter that can break emoji or combining characters.',
  ) {
    super(message);
    this.name = 'SegmenterUnavailableError';
  }
}

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

/**
 * 一个完整 grapheme 簇及其在规范化文本中的 UTF-16 区间 [start, end)。
 * 不变量：tokens 按 start 升序、首尾相接（前一个 end == 后一个 start）、
 * 首 token start 为 0、末 token end 为文本长度、拼回原文。
 */
export interface TextToken {
  /** token 文本（一个完整 grapheme 簇）。 */
  text: string;
  /** UTF-16 起始偏移（规范化文本内）。 */
  start: number;
  /** UTF-16 结束偏移（不含），end - start === text.length。 */
  end: number;
}

/** 拼回原文：tokens.map(t => t.text).join('') === 规范化输入。 */
export function joinTokens(tokens: readonly TextToken[]): string {
  return tokens.map((t) => t.text).join('');
}

// ---------------------------------------------------------------------------
// Segmenter 获取
// ---------------------------------------------------------------------------

/** 动态读取 Intl.Segmenter 构造器；缺失或形态不符时返回 undefined。 */
function getSegmenterConstructor(): GraphemeSegmenterConstructor | undefined {
  const intl = (globalThis as { Intl?: { Segmenter?: unknown } }).Intl;
  const ctor = intl?.Segmenter;
  return typeof ctor === 'function' ? (ctor as GraphemeSegmenterConstructor) : undefined;
}

/**
 * 返回可用的 grapheme Segmenter；缺失时抛 SegmenterUnavailableError。
 * locale 取默认值（grapheme 切分按 UAX #29，与 locale 基本无关）。
 */
export function getGraphemeSegmenter(): GraphemeSegmenter {
  const Ctor = getSegmenterConstructor();
  if (Ctor === undefined) {
    throw new SegmenterUnavailableError();
  }
  return new Ctor(undefined, { granularity: 'grapheme' });
}

// ---------------------------------------------------------------------------
// 分词与边界判定
// ---------------------------------------------------------------------------

/**
 * 将文本切分为 grapheme token（先做唯一规范化 CRLF/CR → LF）。
 * 返回的 token 按 UTF-16 位置升序、首尾相接；拼回后等于规范化输入。
 * 无 Segmenter 时抛 SegmenterUnavailableError，不退化。
 */
export function tokenize(text: string): TextToken[] {
  const canonical = canonicalize(text);
  const segmenter = getGraphemeSegmenter();
  const tokens: TextToken[] = [];
  for (const segment of segmenter.segment(canonical)) {
    tokens.push({
      text: segment.segment,
      start: segment.index,
      end: segment.index + segment.segment.length,
    });
  }
  return tokens;
}

/**
 * offset 是否落在完整 grapheme 边界上（项目书 §8.2：
 * 所有保护端点和变更端点均须落在完整 grapheme 边界）。
 * 0 与文本末尾恒为边界；越界或非整数返回 false。
 * 无 Segmenter 时抛 SegmenterUnavailableError，不退化。
 */
export function isGraphemeBoundary(text: string, offset: number): boolean {
  const canonical = canonicalize(text);
  if (!Number.isInteger(offset) || offset < 0 || offset > canonical.length) {
    return false;
  }
  if (offset === 0 || offset === canonical.length) {
    return true;
  }
  return tokenize(canonical).some((t) => t.start === offset);
}
