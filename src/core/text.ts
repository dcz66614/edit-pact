/**
 * P012 改稿守约 Edit Pact — 文本规范化、输入限制与分段（T003）。
 *
 * 来源：项目书 §8.1（规范化和输入限制）、实施计划 §8、docs/CONTRACT.md §2。
 * 语义与 T002 的独立 oracle（scripts/check-fixtures.mjs）逐字一致：
 *  - canonicalize：/\\r\\n?/g → '\\n'，只转行尾；
 *  - 段落：按 LF 切分，[start, end) 不含段末 LF，id 为 p1、p2……，
 *    isBlank 为段文本 trim 后为空；
 *  - 不成对 surrogate 判定：与 oracle 相同的正则语义（本文件用循环实现，
 *    以便报告第一个不成对位置）。
 *
 * 约束（只做规定规范化，此外一律不做）：
 *  - 不 trim、不替换空格、不改变全半角、不转换繁简体、不做 Unicode
 *    NFC/NFKC 归一化；
 *  - 所有偏移均为规范化后文本中的 UTF-16 代码单元位置；
 *  - 长度与段落数限制按规范化后文本计量；
 *  - FILE_TOO_LARGE / INVALID_UTF8 是文件导入层（T009）的字节级问题，
 *    本模块只处理已解码的 JS 字符串，不产生这两码。
 */

import { MAX_PARAGRAPHS, MAX_TEXT_UNITS } from '../domain/types';
import type { InputIssue, Paragraph } from '../domain/types';

// ---------------------------------------------------------------------------
// 规范化
// ---------------------------------------------------------------------------

/**
 * 唯一规范化：CRLF 与单独 CR 转换成 LF。
 * 幂等：canonicalize(canonicalize(text)) === canonicalize(text)。
 * 除行尾外不改动任何字符（含空格、全半角、繁简体与组合字符序列）。
 */
export function canonicalize(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

// ---------------------------------------------------------------------------
// 不成对 surrogate
// ---------------------------------------------------------------------------

/**
 * 是否含有不成对 surrogate（高代理后无低代理，或低代理前无高代理）。
 * 与 T002 oracle 的正则语义相同：
 * /[\\uD800-\\uDBFF](?![\\uDC00-\\uDFFF])|(?<![\\uD800-\\uDBFF])[\\uDC00-\\uDFFF]/。
 */
export function hasUnpairedSurrogate(text: string): boolean {
  return firstUnpairedSurrogateIndex(text) >= 0;
}

/**
 * 第一个不成对 surrogate 的 UTF-16 位置；无则返回 -1。
 * 位置按原字符串（调用方传入规范化后文本时即为规范化坐标）计量。
 */
export function firstUnpairedSurrogateIndex(text: string): number {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < text.length ? text.charCodeAt(i + 1) : -1;
      if (next < 0xdc00 || next > 0xdfff) {
        return i;
      }
      i++; // 成对：跳过低代理
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return i;
    }
  }
  return -1;
}

// ---------------------------------------------------------------------------
// 输入限制
// ---------------------------------------------------------------------------

/**
 * 输入限制检查（项目书 §8.1、CONTRACT.md §3）。
 * 对输入先做唯一规范化，再按规范化后文本计量；返回的 issue 顺序固定：
 * INVALID_UNICODE → EMPTY_ORIGINAL → TOO_LONG → TOO_MANY_PARAGRAPHS。
 *
 * 各码的 limit / actual 约定：
 *  - INVALID_UNICODE：limit 为 null，actual 为第一个不成对 surrogate
 *    的 UTF-16 位置；
 *  - EMPTY_ORIGINAL：仅 original 字段，limit 为 1（至少 1 个 UTF-16
 *    单元），actual 为规范化后长度（0）；
 *  - TOO_LONG：limit 为 MAX_TEXT_UNITS（12000），actual 为规范化后长度；
 *  - TOO_MANY_PARAGRAPHS：limit 为 MAX_PARAGRAPHS（200），actual 为段落数。
 * 改稿（candidate）可为空（显式删除场景），不产生 EMPTY_ORIGINAL。
 */
export function validateInput(text: string, field: 'original' | 'candidate'): InputIssue[] {
  const canonical = canonicalize(text);
  const issues: InputIssue[] = [];

  const unpairedAt = firstUnpairedSurrogateIndex(canonical);
  if (unpairedAt >= 0) {
    issues.push({ code: 'INVALID_UNICODE', field, limit: null, actual: unpairedAt });
  }
  if (field === 'original' && canonical.length === 0) {
    issues.push({ code: 'EMPTY_ORIGINAL', field, limit: 1, actual: 0 });
  }
  if (canonical.length > MAX_TEXT_UNITS) {
    issues.push({ code: 'TOO_LONG', field, limit: MAX_TEXT_UNITS, actual: canonical.length });
  }
  const paragraphCount = splitParagraphs(canonical).length;
  if (paragraphCount > MAX_PARAGRAPHS) {
    issues.push({ code: 'TOO_MANY_PARAGRAPHS', field, limit: MAX_PARAGRAPHS, actual: paragraphCount });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// 分段
// ---------------------------------------------------------------------------

/**
 * 按 LF 分段（项目书 §8.1、CONTRACT.md §2）。
 * 输入先做唯一规范化；段落范围 [start, end) 不含段末 LF；
 * 段落数恒为 LF 个数 + 1（空文本得到一个空白段 [0, 0)）；
 * id 从 p1 起按顺序编号；isBlank 为段文本 trim 后为空
 * （空格/制表符组成的段也是空白段，展示但不能保护）。
 */
export function splitParagraphs(original: string): Paragraph[] {
  const canonical = canonicalize(original);
  const out: Paragraph[] = [];
  let start = 0;
  for (const part of canonical.split('\n')) {
    out.push({
      id: `p${out.length + 1}`,
      start,
      end: start + part.length,
      text: part,
      isBlank: part.trim().length === 0,
    });
    start += part.length + 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 按 UTF-16 单元上限截断（不断开字位簇）
// ---------------------------------------------------------------------------

/**
 * 把文本截断到至多 maxUnits 个 UTF-16 代码单元，且截断点落在字位簇
 * （grapheme）边界上：不切开代理对，也不切开 ZWJ 组合序列等。
 *
 * （FIX-T013-08：原先调用方用 `text.slice(0, 120)`，探针确认
 * `'a'.repeat(119) + '👨‍👩‍👧‍👦'` 会被切出不成对 surrogate。
 * 上限仍按 UTF-16 单元计量——与项目书 §7.1 的“120 UTF-16 单元”
 * 一致；超限的字位簇整个舍弃，不取其前半部分。）
 *
 * 优先用 Intl.Segmenter 按字位簇切分；无 Segmenter 的环境回退到
 * 按码位（code point）累加，同样不断开代理对。
 */
export function truncateToUtf16Units(text: string, maxUnits: number): string {
  if (text.length <= maxUnits && !hasUnpairedSurrogate(text)) {
    return text;
  }
  const segmenter = getGraphemeSegmenter();
  if (segmenter !== null) {
    let out = '';
    for (const { segment } of segmenter.segment(text)) {
      if (hasUnpairedSurrogate(segment)) {
        continue; // 孤立代理段（如 maxLength 截断残留）直接丢弃。
      }
      if (out.length + segment.length > maxUnits) {
        break;
      }
      out += segment;
    }
    return out;
  }
  // 无 Segmenter 的环境回退：按码位累加，成对代理按一对取，
  // 孤立代理直接丢弃。
  {
    let out = '';
    for (let i = 0; i < text.length; ) {
      const code = text.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = i + 1 < text.length ? text.charCodeAt(i + 1) : -1;
        if (next >= 0xdc00 && next <= 0xdfff) {
          if (out.length + 2 > maxUnits) {
            break;
          }
          out += text.slice(i, i + 2);
          i += 2;
        } else {
          i += 1; // 孤立高代理：丢弃。
        }
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        i += 1; // 孤立低代理：丢弃。
      } else {
        if (out.length + 1 > maxUnits) {
          break;
        }
        out += text[i];
        i += 1;
      }
    }
    return out;
  }
}

/**
 * 最小结构类型（仅覆盖本函数实际使用的 Segmenter 形态）。
 * tsconfig 的 lib 为 ES2020 + DOM，不含 ES2022 的 Intl.Segmenter
 * 类型声明（与 tokenize.ts 同一约束，本文件不得改 tsconfig），
 * 故在运行时动态读取 globalThis.Intl.Segmenter；缺失时返回 null。
 */
interface GraphemeSegmentLike {
  segment: string;
}

interface GraphemeSegmenterLike {
  segment(input: string): Iterable<GraphemeSegmentLike>;
}

type GraphemeSegmenterConstructorLike = new (
  locales?: string | string[],
  options?: { granularity?: string },
) => GraphemeSegmenterLike;

function getGraphemeSegmenter(): GraphemeSegmenterLike | null {
  const ctor = (
    globalThis as unknown as {
      Intl?: { Segmenter?: GraphemeSegmenterConstructorLike };
    }
  ).Intl?.Segmenter;
  if (typeof ctor !== 'function') {
    return null;
  }
  try {
    return new ctor(undefined, { granularity: 'grapheme' });
  } catch {
    return null;
  }
}
