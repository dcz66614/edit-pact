/**
 * P012 改稿守约 Edit Pact — 保护冲突分类（T005）。
 *
 * 来源：项目书 §8.3（冲突规则）、§9.2（classifyHunks 签名）、
 * CONTRACT.md §1.1（冻结签名）、§2（冲突规则）。
 * 本模块是冲突公式的唯一实现：T004 只调用 classifyHunks，不重复实现
 * 保护规则；UI 只能调用契约层，不重新实现冲突公式。
 *
 * 行为：
 *  - 先验证区间与 oldText，再计算 conflicts；任一验证失败返回
 *    { ok: false, errorCode: 'INVALID_PATCH' }（见下“错误码约定”）。
 *  - 有冲突的 Hunk 标 decision 'blocked'，conflicts 为冲突保护范围的
 *    id 列表；其余标 'pending'，不接受任何旧决定。
 *  - 冲突规则（项目书 §8.3）：非空原稿范围 h=[a,b) 与保护 p=[s,e)，
 *    冲突当且仅当 a < e 且 b > s；纯插入 a=b，若 s <= a <= e 则冲突
 *    （两端也拦截）。
 *
 * 错误码约定（T005 的显式判定，供 T013 复核）：
 *  - 区间越界、oldText 与原稿不符、Hunk 未按原稿位置升序、不交叠、
 *    id 重复、保护范围非法（空区间、越界、id 重复），均属“补丁与原稿
 *    不一致”，归 INVALID_PATCH。INVALID_INPUT 只用于 §8.1 的文本输入
 *    限制（长度、段数、Unicode），不用于 Hunk 校验。
 *  - 不做 Unicode 归一化与不成对 surrogate 检查：输入原稿已由 T003
 *    validateInput 在导入时校验；本模块只核对区间与 oldText 的字面一致。
 *  - 不拒绝空操作插入（start === end 且 newText === ''）：契约未定义
 *    其为非法；按纯插入规则分类即可，是否产生此类 Hunk 由 T004 的
 *    diff 算法保证，本模块不越权判定。
 */

import type { GuardResult, Hunk, ProtectedRange, RawHunk } from '../domain/types';

const INVALID_PATCH: GuardResult = { ok: false, errorCode: 'INVALID_PATCH' };

function isInt(value: number): boolean {
  return Number.isInteger(value);
}

/**
 * 单个 Hunk 与单个保护范围是否冲突（项目书 §8.3）。
 * 纯插入 a=b：s <= a <= e（含两端）；否则：a < e 且 b > s。
 */
function conflictsWith(hunk: RawHunk, protection: ProtectedRange): boolean {
  if (hunk.start === hunk.end) {
    return protection.start <= hunk.start && hunk.start <= protection.end;
  }
  return hunk.start < protection.end && hunk.end > protection.start;
}

/**
 * 按冻结签名交付：将 RawHunk 验证并分类为 blocked 或 pending。
 *
 * 验证顺序：原稿为字符串 → 保护范围合法（非空、在界内、id 唯一）→
 * Hunk 合法（id 非空唯一、整数区间、在界内、oldText === 原稿对应片段、
 * 按 start 升序且不交叠）。任一失败返回 INVALID_PATCH，不返回部分结果。
 */
export function classifyHunks(
  original: string,
  hunks: RawHunk[],
  protections: ProtectedRange[],
): GuardResult {
  if (typeof original !== 'string' || !Array.isArray(hunks) || !Array.isArray(protections)) {
    return INVALID_PATCH;
  }

  const seenProtectionIds = new Set<string>();
  for (const p of protections) {
    if (
      typeof p.id !== 'string' ||
      p.id === '' ||
      typeof p.paragraphId !== 'string' ||
      p.paragraphId === '' ||
      !isInt(p.start) ||
      !isInt(p.end) ||
      p.end <= p.start ||
      p.start < 0 ||
      p.end > original.length
    ) {
      return INVALID_PATCH;
    }
    if (seenProtectionIds.has(p.id)) {
      return INVALID_PATCH;
    }
    seenProtectionIds.add(p.id);
  }

  const seenHunkIds = new Set<string>();
  let prevEnd = 0;
  for (const h of hunks) {
    if (
      typeof h.id !== 'string' ||
      h.id === '' ||
      typeof h.oldText !== 'string' ||
      typeof h.newText !== 'string' ||
      !isInt(h.start) ||
      !isInt(h.end) ||
      h.start < 0 ||
      h.end < h.start ||
      h.end > original.length
    ) {
      return INVALID_PATCH;
    }
    if (original.slice(h.start, h.end) !== h.oldText) {
      return INVALID_PATCH;
    }
    if (seenHunkIds.has(h.id)) {
      return INVALID_PATCH;
    }
    seenHunkIds.add(h.id);
    // 按原稿位置升序且不交叠（项目书 §8.2）；空插入 [a,a) 与相邻
    // Hunk 在同一端点共存时 start === prevEnd，允许。
    if (h.start < prevEnd) {
      return INVALID_PATCH;
    }
    prevEnd = h.end;
  }

  const classified: Hunk[] = hunks.map((h) => {
    const conflicts = protections.filter((p) => conflictsWith(h, p)).map((p) => p.id);
    return {
      ...h,
      conflicts,
      decision: conflicts.length > 0 ? 'blocked' : 'pending',
    } as Hunk;
  });
  return { ok: true, hunks: classified };
}
