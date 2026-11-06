/**
 * P012 T010 — 有界随机合法补丁生成器（固定种子）。
 *
 * 生成方式（与生产 diff/guards/compose 完全无关，只用 oracle.ts 的拼接）：
 *  - 原稿：1–4 段，每段 3–12 个 grapheme，取自大小写字母/数字/CJK/标点，
 *    偶尔混入 emoji ZWJ 序列、旗帜、组合字符、肤色修饰序列；
 *  - 改稿：对原稿做 0–4 处编辑（替换/删除/纯插入），编辑点落在 grapheme
 *    边界上，编辑之间至少隔一个未改 grapheme；
 *  - 保护：约 60% 的用例带 1–2 处保护，取整段或段内 grapheme 对齐的子区间；
 *  - 约 25% 的带保护用例会额外在保护端点（start 或 end）做一次纯插入，
 *    以锻炼 §8.3 的两端拦截规则。
 *
 * 全部用例满足输入限制（≤12000 UTF-16 单元，≤200 段），编辑合法。
 */

import { canonicalizeText, graphemeTokens, mulberry32, spliceByIntervals } from './oracle';
import type { IntervalDecision } from './oracle';
import type { ProtectedRange } from '../../src/domain/types';

export interface RandomEdit {
  start: number;
  end: number;
  newText: string;
}

export interface RandomCase {
  /** 用例编号，如 R001。 */
  id: string;
  original: string;
  candidate: string;
  protections: ProtectedRange[];
  /** 生成器自己的编辑表（原稿坐标，升序、不重叠）。 */
  edits: RandomEdit[];
}

const LETTERS = ['a', 'b', 'c', 'd', 'e', 'x', 'y', 'z', '0', '1', '2'];
const CJK = ['甲', '乙', '丙', '丁', '请', '谢', '人', '数', '日', '月', '的', '是', '在', '好', '新', '旧'];
const PUNCT = ['。', '，', '、', ' '];
const SPECIAL = ['👨‍👩‍👧', '🇨🇳', 'é', '👍🏽', 'ü'];

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function randomGrapheme(rng: () => number): string {
  const roll = rng();
  if (roll < 0.55) return pick(rng, LETTERS);
  if (roll < 0.9) return pick(rng, CJK);
  if (roll < 0.96) return pick(rng, PUNCT);
  return pick(rng, SPECIAL);
}

/** 生成一个随机用例。rng 由调用方用固定种子创建。 */
export function generateRandomCase(rng: () => number, index: number): RandomCase {
  const id = `R${String(index + 1).padStart(3, '0')}`;
  const paragraphCount = 1 + Math.floor(rng() * 4);
  const paragraphs: string[] = [];
  for (let i = 0; i < paragraphCount; i++) {
    const len = 3 + Math.floor(rng() * 10);
    const graphemes: string[] = [];
    // 每段首字符取非空格，保证段落非空白。
    graphemes.push(pick(rng, [...LETTERS, ...CJK]));
    for (let j = 1; j < len; j++) {
      graphemes.push(randomGrapheme(rng));
    }
    paragraphs.push(graphemes.join(''));
  }
  const original = paragraphs.join('\n');
  const canonical = canonicalizeText(original);

  // 段落区间（grapheme 边界）。
  const paraRanges: { id: string; start: number; end: number; tokens: { start: number; end: number }[] }[] = [];
  let cursor = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    const tokens = graphemeTokens(paragraphs[i]);
    const start = cursor;
    const end = cursor + paragraphs[i].length;
    paraRanges.push({ id: `p${i + 1}`, start, end, tokens: tokens.map((t) => ({ start: t.start + start, end: t.end + start })) });
    cursor = end + 1; // 跳过 \n
  }

  // 保护：60% 概率带 1–2 处，取整段或段内子区间。
  const protections: ProtectedRange[] = [];
  if (rng() < 0.6) {
    const count = 1 + Math.floor(rng() * 2);
    const chosen = new Set<number>();
    for (let k = 0; k < count && chosen.size < paraRanges.length; k++) {
      const pi = Math.floor(rng() * paraRanges.length);
      if (chosen.has(pi)) continue;
      chosen.add(pi);
      const para = paraRanges[pi];
      if (rng() < 0.5 || para.tokens.length === 0) {
        protections.push({ id: `prot-${protections.length + 1}`, paragraphId: para.id, start: para.start, end: para.end });
      } else {
        const a = Math.floor(rng() * para.tokens.length);
        const b = a + 1 + Math.floor(rng() * (para.tokens.length - a));
        protections.push({
          id: `prot-${protections.length + 1}`,
          paragraphId: para.id,
          start: para.tokens[a].start,
          end: para.tokens[Math.min(b, para.tokens.length - 1)].end,
        });
      }
    }
    protections.sort((a, b) => a.start - b.start);
  }

  // 编辑：0–4 处，落在 grapheme 边界，彼此至少隔一个未改 grapheme。
  const tokens = graphemeTokens(canonical);
  const editCount = Math.floor(rng() * 5);
  const edits: RandomEdit[] = [];
  const used = new Set<number>(); // 已占用的 token 下标（含隔离带）
  const tryAddEdit = (startTok: number, endTok: number, newText: string): boolean => {
    for (let t = startTok - 1; t <= endTok; t++) {
      if (used.has(t)) return false;
    }
    const start = startTok === 0 ? 0 : tokens[startTok - 1].end;
    const end = endTok === 0 ? 0 : tokens[endTok - 1].end;
    edits.push({ start, end, newText });
    for (let t = startTok - 1; t <= endTok; t++) used.add(t);
    return true;
  };
  let attempts = 0;
  while (edits.length < editCount && attempts < 40) {
    attempts++;
    const kind = rng();
    const spanLen = 1 + Math.floor(rng() * 3);
    const startTok = Math.floor(rng() * tokens.length);
    if (kind < 0.4) {
      // 替换：1–3 个 grapheme → 0–3 个新 grapheme。
      const endTok = Math.min(startTok + spanLen, tokens.length);
      const newLen = Math.floor(rng() * 4);
      const newText = Array.from({ length: newLen }, () => randomGrapheme(rng)).join('');
      tryAddEdit(startTok, endTok, newText);
    } else if (kind < 0.7) {
      // 纯插入。
      const newLen = 1 + Math.floor(rng() * 3);
      const newText = Array.from({ length: newLen }, () => randomGrapheme(rng)).join('');
      tryAddEdit(startTok, startTok, newText);
    } else {
      // 删除：1–3 个 grapheme → 空。
      const endTok = Math.min(startTok + spanLen, tokens.length);
      tryAddEdit(startTok, endTok, '');
    }
  }
  // 约 25% 的带保护用例：在保护端点做一次纯插入（锻炼两端拦截）。
  if (protections.length > 0 && rng() < 0.25) {
    const p = pick(rng, protections);
    const at = rng() < 0.5 ? p.start : p.end;
    // at 对应的插入 token 下标：at 之前那个 token 之后的位置。
    let tokIndex: number;
    if (at === 0) {
      tokIndex = 0;
    } else if (at === canonical.length) {
      tokIndex = tokens.length;
    } else {
      tokIndex = tokens.findIndex((t) => t.start === at);
    }
    if (tokIndex >= 0) {
      tryAddEdit(tokIndex, tokIndex, pick(rng, LETTERS));
    }
  }
  edits.sort((a, b) => a.start - b.start);

  const decisions: IntervalDecision[] = edits.map((e) => ({
    start: e.start,
    end: e.end,
    decision: 'accepted' as const,
    newText: e.newText,
  }));
  const candidate = spliceByIntervals(canonical, decisions);
  return { id, original: canonical, candidate, protections, edits };
}

/** 用固定种子生成 n 组用例。 */
export function generateRandomCases(seed: number, count: number): RandomCase[] {
  const rng = mulberry32(seed);
  const cases: RandomCase[] = [];
  for (let i = 0; i < count; i++) {
    cases.push(generateRandomCase(rng, i));
  }
  return cases;
}
