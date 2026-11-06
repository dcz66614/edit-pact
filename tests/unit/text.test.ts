/**
 * P012 T003 — 文本规范化、分段与 grapheme 分词单元测试。
 *
 * 覆盖（任务卡完成定义）：
 *  - 只做规定规范化（CRLF/CR → LF），不 trim、不改空格、不做 Unicode 归一化；
 *  - 每个 token 拼回原文；边界单调且正确；
 *  - 无 Segmenter 时明确报错（UNSUPPORTED_ENV），不退化；
 *  - 输入限制（EMPTY_ORIGINAL / TOO_LONG / TOO_MANY_PARAGRAPHS /
 *    INVALID_UNICODE）与段落坐标；
 *  - Fixture F13–F16：CRLF、连续空格、emoji ZWJ、组合字符的真实文件核对。
 *
 * 本文件不实现 compose/diff；决定区间与 expected.txt 的语义复核
 * 归 T002 oracle 与 T004/T005，T003 只核对坐标与边界。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canonicalize,
  firstUnpairedSurrogateIndex,
  hasUnpairedSurrogate,
  splitParagraphs,
  truncateToUtf16Units,
  validateInput,
} from '../../src/core/text';
import {
  SegmenterUnavailableError,
  getGraphemeSegmenter,
  isGraphemeBoundary,
  joinTokens,
  tokenize,
} from '../../src/core/tokenize';
import type { TextToken } from '../../src/core/tokenize';
import { MAX_PARAGRAPHS, MAX_TEXT_UNITS } from '../../src/domain/types';

const FIXTURES_DIR = fileURLToPath(new URL('../fixtures/', import.meta.url));

function readFixture(id: string, name: string): string {
  return readFileSync(path.join(FIXTURES_DIR, id, name), 'utf8');
}

function readFixtureJson<T>(id: string, name: string): T {
  return JSON.parse(readFixture(id, name)) as T;
}

/** token 不变量：单调首尾相接、拼回规范化原文、端点均为 grapheme 边界。 */
function assertTokenInvariants(text: string, tokens: TextToken[]): void {
  const canonical = canonicalize(text);
  expect(joinTokens(tokens)).toBe(canonical);
  let cursor = 0;
  for (const token of tokens) {
    expect(token.start).toBe(cursor);
    expect(token.end).toBe(token.start + token.text.length);
    expect(token.end).toBeGreaterThan(token.start);
    cursor = token.end;
  }
  expect(cursor).toBe(canonical.length);
  for (const token of tokens) {
    expect(isGraphemeBoundary(canonical, token.start)).toBe(true);
    expect(isGraphemeBoundary(canonical, token.end)).toBe(true);
  }
}

// ---------------------------------------------------------------------------
// canonicalize
// ---------------------------------------------------------------------------

describe('canonicalize', () => {
  it('CRLF 与单独 CR 都转 LF，LF 不变', () => {
    expect(canonicalize('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
    expect(canonicalize('a\nb')).toBe('a\nb');
    expect(canonicalize('')).toBe('');
    expect(canonicalize('\r\n')).toBe('\n');
    expect(canonicalize('\r')).toBe('\n');
    expect(canonicalize('\r\r\n\n\r')).toBe('\n\n\n\n');
  });

  it('不 trim、不替换空格、不改全半角、不转繁简体', () => {
    expect(canonicalize('  前后空格  ')).toBe('  前后空格  ');
    expect(canonicalize('a\t\tb  c')).toBe('a\t\tb  c');
    expect(canonicalize('ＡＢＣ１２３')).toBe('ＡＢＣ１２３');
    expect(canonicalize('繁體字')).toBe('繁體字');
  });

  it('不做 Unicode NFC/NFKC：组合序列保持分解形态', () => {
    const decomposed = 'Café'; // e + U+0301，共 5 个 UTF-16 单元
    expect(decomposed.length).toBe(5);
    const out = canonicalize(decomposed);
    expect(out.length).toBe(5);
    expect(out.charCodeAt(4)).toBe(0x0301);
    expect(out).not.toBe('Café'); // 预合成 é（单码点）不是同一字符串
  });

  it('幂等', () => {
    const samples = ['', 'a\r\nb\rc', '  x  ', 'Café', '第一行\r\n第二行\r'];
    for (const s of samples) {
      expect(canonicalize(canonicalize(s))).toBe(canonicalize(s));
    }
  });
});

// ---------------------------------------------------------------------------
// validateInput
// ---------------------------------------------------------------------------

describe('validateInput', () => {
  it('空原稿报 EMPTY_ORIGINAL，空改稿合法（显式删除）', () => {
    expect(validateInput('', 'original')).toEqual([
      { code: 'EMPTY_ORIGINAL', field: 'original', limit: 1, actual: 0 },
    ]);
    expect(validateInput('', 'candidate')).toEqual([]);
  });

  it('TOO_LONG 按规范化后 UTF-16 长度计量，边界 12000 通过、12001 拒绝', () => {
    expect(validateInput('a'.repeat(MAX_TEXT_UNITS), 'original')).toEqual([]);
    expect(validateInput('a'.repeat(MAX_TEXT_UNITS + 1), 'original')).toEqual([
      { code: 'TOO_LONG', field: 'original', limit: MAX_TEXT_UNITS, actual: MAX_TEXT_UNITS + 1 },
    ]);
    expect(validateInput('b'.repeat(MAX_TEXT_UNITS + 1), 'candidate')).toEqual([
      { code: 'TOO_LONG', field: 'candidate', limit: MAX_TEXT_UNITS, actual: MAX_TEXT_UNITS + 1 },
    ]);
  });

  it('CRLF 按规范化后长度计量：原始超限、规范化后恰好 12000 时不超限', () => {
    // 11900 个 a + 100 个 CRLF：原始 12100 单元，规范化后 12000 单元，101 段
    expect(validateInput('a'.repeat(11900) + '\r\n'.repeat(100), 'original')).toEqual([]);
    // 11900 个 a + 101 个 CRLF：规范化后 12001 单元，报 TOO_LONG
    expect(validateInput('a'.repeat(11900) + '\r\n'.repeat(101), 'original')).toEqual([
      { code: 'TOO_LONG', field: 'original', limit: MAX_TEXT_UNITS, actual: MAX_TEXT_UNITS + 1 },
    ]);
  });

  it('TOO_MANY_PARAGRAPHS 边界 200 通过、201 拒绝', () => {
    const ok = Array.from({ length: MAX_PARAGRAPHS }, () => '段').join('\n');
    expect(validateInput(ok, 'original')).toEqual([]);
    const over = Array.from({ length: MAX_PARAGRAPHS + 1 }, () => '段').join('\n');
    expect(validateInput(over, 'original')).toEqual([
      { code: 'TOO_MANY_PARAGRAPHS', field: 'original', limit: MAX_PARAGRAPHS, actual: MAX_PARAGRAPHS + 1 },
    ]);
  });

  it('INVALID_UNICODE：单独高代理、低代理均报错，位置为第一个不成对处', () => {
    expect(hasUnpairedSurrogate('😀')).toBe(false);
    expect(hasUnpairedSurrogate('\uD83D\uDE00')).toBe(false);
    expect(hasUnpairedSurrogate('\uD800')).toBe(true);
    expect(hasUnpairedSurrogate('\uDC00')).toBe(true);
    expect(firstUnpairedSurrogateIndex('\uD800')).toBe(0);
    expect(firstUnpairedSurrogateIndex('ab\uDC00')).toBe(2);
    expect(firstUnpairedSurrogateIndex('ab\uD83D\uDE00\uD800')).toBe(4);
    expect(firstUnpairedSurrogateIndex('ok')).toBe(-1);
    expect(validateInput('ab\uD800', 'original')).toEqual([
      { code: 'INVALID_UNICODE', field: 'original', limit: null, actual: 2 },
    ]);
    expect(validateInput('ab\uD800', 'candidate')).toEqual([
      { code: 'INVALID_UNICODE', field: 'candidate', limit: null, actual: 2 },
    ]);
  });

  it('多问题按固定顺序一次返回', () => {
    const issues = validateInput('\uD800'.repeat(MAX_TEXT_UNITS + 1), 'original');
    expect(issues.map((i) => i.code)).toEqual(['INVALID_UNICODE', 'TOO_LONG']);
  });
});

// ---------------------------------------------------------------------------
// splitParagraphs
// ---------------------------------------------------------------------------

describe('splitParagraphs', () => {
  it('基本分段：范围 [start, end) 不含段末 LF，id 从 p1 编号', () => {
    const paras = splitParagraphs('第一段\n第二段\n第三段');
    expect(paras).toEqual([
      { id: 'p1', start: 0, end: 3, text: '第一段', isBlank: false },
      { id: 'p2', start: 4, end: 7, text: '第二段', isBlank: false },
      { id: 'p3', start: 8, end: 11, text: '第三段', isBlank: false },
    ]);
    for (const p of paras) {
      expect('第一段\n第二段\n第三段'.slice(p.start, p.end)).toBe(p.text);
    }
  });

  it('CRLF 输入先规范化再分段，坐标按规范化后文本', () => {
    const paras = splitParagraphs('第一段\r\n第二段\r第三段');
    expect(paras.map((p) => [p.id, p.start, p.end, p.text])).toEqual([
      ['p1', 0, 3, '第一段'],
      ['p2', 4, 7, '第二段'],
      ['p3', 8, 11, '第三段'],
    ]);
  });

  it('末尾 LF 产生一个空尾段；空文本得到一个空白段 [0, 0)', () => {
    expect(splitParagraphs('a\n')).toEqual([
      { id: 'p1', start: 0, end: 1, text: 'a', isBlank: false },
      { id: 'p2', start: 2, end: 2, text: '', isBlank: true },
    ]);
    expect(splitParagraphs('')).toEqual([
      { id: 'p1', start: 0, end: 0, text: '', isBlank: true },
    ]);
    expect(splitParagraphs('\n')).toEqual([
      { id: 'p1', start: 0, end: 0, text: '', isBlank: true },
      { id: 'p2', start: 1, end: 1, text: '', isBlank: true },
    ]);
  });

  it('空白判定：空段与纯空格段为 blank，含可见字符则不是', () => {
    const paras = splitParagraphs('a\n\n   \n\t\n b ');
    expect(paras.map((p) => p.isBlank)).toEqual([false, true, true, true, false]);
    expect(paras[2].text).toBe('   ');
  });

  it('段内原始空格原样保留', () => {
    const paras = splitParagraphs('请  思考\n结尾   三个空格');
    expect(paras[0].text).toBe('请  思考');
    expect(paras[1].text).toBe('结尾   三个空格');
  });

  it('段落数恒为 LF 个数 + 1', () => {
    for (const s of ['', 'a', 'a\n', 'a\nb\nc', '\n\n\n']) {
      expect(splitParagraphs(s).length).toBe(canonicalize(s).split('\n').length);
    }
  });
});

// ---------------------------------------------------------------------------
// tokenize
// ---------------------------------------------------------------------------

describe('tokenize', () => {
  it('ASCII 与 CJK 按字切分，拼回原文', () => {
    const tokens = tokenize('abc中文');
    expect(tokens.map((t) => t.text)).toEqual(['a', 'b', 'c', '中', '文']);
    assertTokenInvariants('abc中文', tokens);
  });

  it('代理对不拆开：单个 emoji 为一个 token，占 2 个 UTF-16 单元', () => {
    const tokens = tokenize('a😀b');
    expect(tokens).toEqual([
      { text: 'a', start: 0, end: 1 },
      { text: '😀', start: 1, end: 3 },
      { text: 'b', start: 3, end: 4 },
    ]);
    assertTokenInvariants('a😀b', tokens);
  });

  it('emoji ZWJ 序列为一个 token：家庭 emoji 占 11 个 UTF-16 单元', () => {
    const family = '👨‍👩‍👧‍👦';
    expect(family.length).toBe(11);
    const tokens = tokenize(`家${family}好`);
    expect(tokens).toEqual([
      { text: '家', start: 0, end: 1 },
      { text: family, start: 1, end: 12 },
      { text: '好', start: 12, end: 13 },
    ]);
    assertTokenInvariants(`家${family}好`, tokens);
  });

  it('组合字符不拆开：e + U+0301 为一个 token', () => {
    const tokens = tokenize('Café');
    expect(tokens.map((t) => t.text)).toEqual(['C', 'a', 'f', 'é']);
    expect(tokens[3]).toEqual({ text: 'é', start: 3, end: 5 });
    assertTokenInvariants('Café', tokens);
  });

  it('旗帜与肤色修饰序列各为一个 token', () => {
    expect(tokenize('🇨🇳')).toEqual([{ text: '🇨🇳', start: 0, end: 4 }]);
    expect(tokenize('👩🏽')).toEqual([{ text: '👩🏽', start: 0, end: 4 }]);
    assertTokenInvariants('🇨🇳👩🏽', tokenize('🇨🇳👩🏽'));
  });

  it('CRLF 输入先规范化：token 拼回 LF 文本，坐标按规范化后计量', () => {
    const tokens = tokenize('a\r\nb');
    expect(joinTokens(tokens)).toBe('a\nb');
    expect(tokens).toEqual([
      { text: 'a', start: 0, end: 1 },
      { text: '\n', start: 1, end: 2 },
      { text: 'b', start: 2, end: 3 },
    ]);
  });

  it('空文本得到零个 token', () => {
    expect(tokenize('')).toEqual([]);
    expect(joinTokens([])).toBe('');
  });

  it('长混合文本满足全部 token 不变量', () => {
    const text =
      '第一段文字。\n第二段有 emoji 👨‍👩‍👧‍👦 与组合 Café́，  连续空格。\n第三段 🇨🇳 👩🏽 😀。';
    assertTokenInvariants(text, tokenize(text));
  });
});

// ---------------------------------------------------------------------------
// isGraphemeBoundary
// ---------------------------------------------------------------------------

describe('isGraphemeBoundary', () => {
  it('0 与末尾恒为边界；ASCII 每个字符间均为边界', () => {
    expect(isGraphemeBoundary('abc', 0)).toBe(true);
    expect(isGraphemeBoundary('abc', 1)).toBe(true);
    expect(isGraphemeBoundary('abc', 3)).toBe(true);
    expect(isGraphemeBoundary('abc', 4)).toBe(false);
    expect(isGraphemeBoundary('abc', -1)).toBe(false);
    expect(isGraphemeBoundary('abc', 1.5)).toBe(false);
  });

  it('代理对内部、ZWJ 序列内部、组合序列内部均不是边界', () => {
    expect(isGraphemeBoundary('a😀b', 2)).toBe(false); // 代理对内部
    expect(isGraphemeBoundary('a😀b', 1)).toBe(true);
    expect(isGraphemeBoundary('a😀b', 3)).toBe(true);
    const family = '👨‍👩‍👧‍👦';
    for (let i = 1; i < 11; i++) {
      expect(isGraphemeBoundary(family, i)).toBe(false);
    }
    expect(isGraphemeBoundary(family, 0)).toBe(true);
    expect(isGraphemeBoundary(family, 11)).toBe(true);
    expect(isGraphemeBoundary('Café', 4)).toBe(false); // e 与 U+0301 之间
    expect(isGraphemeBoundary('Café', 3)).toBe(true);
    expect(isGraphemeBoundary('Café', 5)).toBe(true);
  });

  it('CRLF 输入按规范化后坐标判定', () => {
    expect(isGraphemeBoundary('a\r\nb', 2)).toBe(true); // 规范化后 "a\nb" 的 b
    expect(isGraphemeBoundary('a\r\nb', 3)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 无 Segmenter：明确报错，不退化
// ---------------------------------------------------------------------------

describe('Segmenter unavailable', () => {
  it('缺少 Intl.Segmenter 时 tokenize / 边界判定 / 获取均抛 UNSUPPORTED_ENV', () => {
    const holder = Intl as unknown as Record<string, unknown>;
    const original = holder.Segmenter;
    try {
      holder.Segmenter = undefined;
      expect(() => tokenize('abc')).toThrowError(SegmenterUnavailableError);
      expect(() => getGraphemeSegmenter()).toThrowError(SegmenterUnavailableError);
      expect(() => isGraphemeBoundary('abc', 1)).toThrowError(SegmenterUnavailableError);
      try {
        tokenize('abc');
        expect.unreachable('应抛出 SegmenterUnavailableError');
      } catch (err) {
        expect(err).toBeInstanceOf(SegmenterUnavailableError);
        expect((err as SegmenterUnavailableError).code).toBe('UNSUPPORTED_ENV');
        expect((err as SegmenterUnavailableError).name).toBe('SegmenterUnavailableError');
      }
    } finally {
      holder.Segmenter = original;
    }
    // 恢复后正常工作
    expect(tokenize('abc').map((t) => t.text)).toEqual(['a', 'b', 'c']);
  });
});

// ---------------------------------------------------------------------------
// Fixture F13–F16：真实文件核对
// ---------------------------------------------------------------------------

describe('fixtures EP-F13–F16', () => {
  it('F13 CRLF：规范化后无 CR、长度 20，三段坐标与保护/决定一致', () => {
    const original = readFixture('EP-F13', 'original.txt');
    const candidate = readFixture('EP-F13', 'candidate.txt');
    const expected = readFixture('EP-F13', 'expected.txt');
    const canonical = canonicalize(original);
    expect(canonical).not.toContain('\r');
    expect(canonical.length).toBe(20);
    expect(canonical).toBe('第一行文字。\n第二行文字。\n第三行文字。');
    const paras = splitParagraphs(original);
    expect(paras.map((p) => [p.id, p.start, p.end, p.text])).toEqual([
      ['p1', 0, 6, '第一行文字。'],
      ['p2', 7, 13, '第二行文字。'],
      ['p3', 14, 20, '第三行文字。'],
    ]);
    const protections = readFixtureJson<{ protections: { id: string; paragraphId: string; start: number; end: number }[] }>(
      'EP-F13',
      'protections.json',
    ).protections;
    expect(protections).toEqual([{ id: 'prot-1', paragraphId: 'p2', start: 7, end: 13 }]);
    expect(canonical.slice(7, 13)).toBe('第二行文字。');
    const decisions = readFixtureJson<{ decisions: { start: number; end: number }[] }>(
      'EP-F13',
      'decisions.json',
    ).decisions;
    for (const d of decisions) {
      expect(isGraphemeBoundary(canonical, d.start)).toBe(true);
      expect(isGraphemeBoundary(canonical, d.end)).toBe(true);
    }
    expect(canonical.slice(0, 6)).toBe('第一行文字。');
    expect(canonical.slice(14, 20)).toBe('第三行文字。');
    // 改稿规范化后即为 expected（本组改动全部接受、保护段未改）
    expect(canonicalize(candidate)).toBe(expected);
  });

  it('F14 连续空格：段内空格原样保留，改稿规范化后等于 expected', () => {
    const original = readFixture('EP-F14', 'original.txt');
    const candidate = readFixture('EP-F14', 'candidate.txt');
    const expected = readFixture('EP-F14', 'expected.txt');
    const paras = splitParagraphs(original);
    expect(paras[0].text).toBe('请  注意这里有两个空格。');
    expect(paras[1].text).toBe('结尾   三个空格要保留。');
    expect(paras[0].text).toContain('  ');
    expect(paras[1].text).toContain('   ');
    const decisions = readFixtureJson<{ decisions: { start: number; end: number; newText: string }[] }>(
      'EP-F14',
      'decisions.json',
    ).decisions;
    expect(decisions[0].newText).toContain('   ');
    expect(canonicalize(candidate)).toBe(expected);
    assertTokenInvariants(original, tokenize(original));
  });

  it('F15 emoji ZWJ：家庭 emoji 为单个 token，保护端点落在 grapheme 边界', () => {
    const original = readFixture('EP-F15', 'original.txt');
    const canonical = canonicalize(original);
    const family = '👨‍👩‍👧‍👦';
    expect(canonical).toContain(family);
    const tokens = tokenize(canonical);
    const emojiToken = tokens.find((t) => t.text === family);
    expect(emojiToken).toEqual({ text: family, start: 5, end: 16 });
    expect(family.length).toBe(11);
    const paras = splitParagraphs(original);
    expect(paras[0]).toEqual({ id: 'p1', start: 0, end: 21, text: '家庭合影 👨‍👩‍👧‍👦 很温馨。', isBlank: false });
    const protections = readFixtureJson<{ protections: { start: number; end: number }[] }>(
      'EP-F15',
      'protections.json',
    ).protections;
    expect(protections[0]).toMatchObject({ start: 0, end: 21 });
    expect(isGraphemeBoundary(canonical, 0)).toBe(true);
    expect(isGraphemeBoundary(canonical, 21)).toBe(true);
    expect(canonical.slice(0, 21)).toBe('家庭合影 👨‍👩‍👧‍👦 很温馨。');
    // 保护范围内的任何位置都不能把 ZWJ 序列拆开：其内部偏移均非边界
    for (let i = 6; i < 16; i++) {
      expect(isGraphemeBoundary(canonical, i)).toBe(false);
    }
    assertTokenInvariants(original, tokens);
  });

  it('F16 组合字符：e + U+0301 为单个 token，不做 NFC，保护端点为边界', () => {
    const original = readFixture('EP-F16', 'original.txt');
    const canonical = canonicalize(original);
    expect(canonical.charCodeAt(8)).toBe(0x0301); // 仍为分解形态，未被 NFC 合并
    expect(canonical.length).toBe(14 + 1 + 8);
    const tokens = tokenize(canonical);
    const combined = tokens.find((t) => t.text === 'é');
    expect(combined).toEqual({ text: 'é', start: 7, end: 9 });
    const paras = splitParagraphs(original);
    expect(paras[0]).toEqual({ id: 'p1', start: 0, end: 14, text: '咖啡馆 Café 开业了。', isBlank: false });
    const protections = readFixtureJson<{ protections: { start: number; end: number }[] }>(
      'EP-F16',
      'protections.json',
    ).protections;
    expect(protections[0]).toMatchObject({ start: 0, end: 14 });
    expect(isGraphemeBoundary(canonical, 0)).toBe(true);
    expect(isGraphemeBoundary(canonical, 14)).toBe(true);
    expect(isGraphemeBoundary(canonical, 8)).toBe(false); // e 与组合符之间
    assertTokenInvariants(original, tokens);
  });
});

describe('truncateToUtf16Units', () => {
  it('未超限时原样返回', () => {
    expect(truncateToUtf16Units('abc', 120)).toBe('abc');
    expect(truncateToUtf16Units('', 120)).toBe('');
  });

  it('T013-08 探针原案：119 个 a + 家庭表情，超限的表情整个舍弃，不切开代理对', () => {
    const input = 'a'.repeat(119) + '👨‍👩‍👧‍👦';
    const out = truncateToUtf16Units(input, 120);
    expect(out).toBe('a'.repeat(119));
    expect(hasUnpairedSurrogate(out)).toBe(false);
    expect(out.length).toBeLessThanOrEqual(120);
  });

  it('末尾孤立代理（如 maxLength 截断残留）直接丢弃', () => {
    // '\uD83D' 是不成对的高代理（家庭表情的首单元被截断后的残留）。
    const input = 'a'.repeat(119) + '\uD83D';
    expect(truncateToUtf16Units(input, 120)).toBe('a'.repeat(119));
    expect(hasUnpairedSurrogate(truncateToUtf16Units(input, 120))).toBe(false);
  });

  it('单个表情恰好放得下时保留完整，不拆开', () => {
    // 家庭表情 11 个 UTF-16 单元：109 + 11 = 120，恰好放得下。
    expect(truncateToUtf16Units('a'.repeat(109) + '👨‍👩‍👧‍👦', 120)).toBe(
      'a'.repeat(109) + '👨‍👩‍👧‍👦',
    );
    expect(truncateToUtf16Units('a'.repeat(109) + '👨‍👩‍👧‍👦', 120).length).toBe(
      120,
    );
  });

  it('组合字符 e + U+0301 不拆开：上限卡在组合符前则整个舍弃', () => {
    expect(truncateToUtf16Units('ab' + 'é', 3)).toBe('ab');
    expect(truncateToUtf16Units('ab' + 'é', 4)).toBe('ab' + 'é');
  });
});
