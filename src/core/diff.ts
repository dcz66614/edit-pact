/**
 * P012 改稿守约 Edit Pact — 精确比较（T004）。
 *
 * 来源：项目书 §8.2（精确差异）、CONTRACT.md §1.5（Worker 协议）、
 * §4（engineVersion 格式）、实施计划 §7 T004 任务卡。
 *
 * 行为：
 *  - 以 Intl.Segmenter 的 grapheme 粒度切分两稿（tokenize，T003），
 *    再把完整字符串 token 数组传入锁定版本的 jsdiff `diffArrays`，
 *    用严格相等比较（大小写与空格敏感，不使用忽略空白的词级比较）。
 *  - 累计各 token 的 JS string.length 建立 UTF-16 偏移映射，
 *    不把 token 个数或 change.count 当 UTF-16 长度。
 *  - 连续的非相等差异项合并为一个原子变更块；任何相等项结束当前块。
 *    删除与插入相连时作为同一替换，不拆开批准。
 *  - 得到按原稿位置升序、不交叠的 RawHunk；每个 Hunk 满足
 *    original.slice(start, end) === oldText。
 *  - 差异算法受两个预算约束（契约常量，见 src/domain/types.ts）：
 *    maxEditLength 2048 与 timeout 800 ms；任一预算耗尽时 jsdiff
 *    返回 undefined，本模块原样返回 undefined（调用方映射为
 *    TOO_COMPLEX，绝不视作“没有差异”）。
 *  - 不产生空操作插入（start === end 且 newText === ''）：jsdiff 的
 *    每个差异项至少含一个 token，插入项必有 newText，删除项必有 oldText。
 *
 * 本模块不做保护分类（那是 T005 classifyHunks 的唯一职责），不做哈希
 * 与 Analysis 组装（那是 analyze.ts），不碰 UI 与状态机。
 */

import { diffArrays } from 'diff';
import type { RawHunk } from '../domain/types';
import { DIFF_MAX_EDIT_LENGTH, DIFF_TIMEOUT_MS } from '../domain/types';
import { canonicalize } from './text';
import { tokenize } from './tokenize';

/**
 * engineVersion（CONTRACT.md §4）：
 * `<核心规则版本>+<diff 包名>-<包版本>`。jsdiff 锁定版本为
 * package.json 的 `diff@9.0.0`（2026-04-13 发布，BSD-3-Clause，
 * 自带 TypeScript 类型，无需 @types/diff）。
 * 与 package.json 锁定的版本一致性由 tests/unit/diff.test.ts 断言。
 */
export const ENGINE_VERSION = '1.0.0+jsdiff-9.0.0';

/**
 * 将两稿转换为原稿坐标的原子 RawHunk（内部先做唯一规范化）。
 *
 * @param original 原稿（可含 CRLF/CR，内部规范化为 LF）。
 * @param candidate 改稿（同上）。
 * @returns 按原稿位置升序、不交叠的 RawHunk；差异算法返回 undefined
 *   （超出 maxEditLength 或 800 ms 超时）时返回 undefined。
 * @throws SegmenterUnavailableError（无 Intl.Segmenter 时，tokenize 抛出；
 *   调用方映射为 UNSUPPORTED_ENV，不退化）。
 */
export function computeRawHunks(original: string, candidate: string): RawHunk[] | undefined {
  // 先规范化再切分与切片：token 坐标是规范化文本内的 UTF-16 偏移，
  // original.slice 也必须取自同一规范化文本（canonicalize 幂等）。
  const canonicalOriginal = canonicalize(original);
  const canonicalCandidate = canonicalize(candidate);
  const origTokens = tokenize(canonicalOriginal);
  const candTokens = tokenize(canonicalCandidate);

  const changes = diffArrays(
    origTokens.map((t) => t.text),
    candTokens.map((t) => t.text),
    { maxEditLength: DIFF_MAX_EDIT_LENGTH, timeout: DIFF_TIMEOUT_MS },
  );
  if (changes === undefined) {
    return undefined;
  }

  const hunks: RawHunk[] = [];
  // 原稿 / 改稿的当前 UTF-16 偏移。只按 token 文本长度累计，
  // 绝不把 token 个数或 change.count 当作 UTF-16 长度。
  let origPos = 0;
  let candPos = 0;
  let i = 0;
  while (i < changes.length) {
    const change = changes[i];
    if (!change.added && !change.removed) {
      const len = change.value.reduce((n, t) => n + t.length, 0);
      origPos += len;
      candPos += len;
      i += 1;
      continue;
    }
    // 合并连续的非相等差异项为一个原子块；相等项结束当前块。
    const start = origPos;
    let end = origPos;
    let newText = '';
    while (i < changes.length && (changes[i].added || changes[i].removed)) {
      const c = changes[i];
      const text = c.value.join('');
      if (c.removed === true) {
        end += text.length;
        origPos += text.length;
      }
      if (c.added === true) {
        newText += text;
        candPos += text.length;
      }
      i += 1;
    }
    hunks.push({
      id: `h${hunks.length + 1}`,
      start,
      end,
      oldText: canonicalOriginal.slice(start, end),
      newText,
    });
  }
  return hunks;
}
